import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import FeatureGuard from '../../components/FeatureGuard';
import { useCierresCaja } from '../../hooks/useCierresCaja';
import { 
  Search, 
  RefreshCw, 
  Calendar,
  Download,
  Eye,
  FileText,
  TrendingUp,
  TrendingDown,
  CheckCircle
} from 'lucide-react';
import { getEmployeeSession } from '../../utils/employeeSession';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './HistorialCierresCaja.css';

const HistorialCierresCaja = ({ employeeId: propEmployeeId = null }) => {
  const { userProfile } = useAuth();
  const employeeSession = getEmployeeSession();
  
  // Si es empleado y no es admin/owner, solo ver sus propios cierres
  const isOwnerAdmin = ['owner', 'admin'].includes(userProfile?.role);
  const effectiveEmployeeId = propEmployeeId || (isOwnerAdmin ? null : employeeSession?.employee?.id);

  const { data: cierres = [], isLoading, refetch } = useCierresCaja(
    userProfile?.organization_id,
    200,
    effectiveEmployeeId
  );
  const [busqueda, setBusqueda] = useState('');
  const [cierreSeleccionado, setCierreSeleccionado] = useState(null);

  const getResponsableLabel = useCallback((cierre) => {
    if (cierre?.employee_id) {
      const employeeName = cierre?.employee?.team_member?.employee_name;
      return employeeName ? `Empleado: ${employeeName}` : `Empleado (${cierre.employee_id.slice(0, 8)})`;
    }
    if (cierre?.user_id) {
      const ownerName = userProfile?.full_name || userProfile?.nombre;
      return ownerName ? `Propietario: ${ownerName}` : 'Propietario';
    }
    return 'No disponible';
  }, [userProfile?.full_name, userProfile?.nombre]);

  // Filtrar cierres
  const cierresFiltrados = useMemo(() => {
    if (!busqueda.trim()) return cierres;

    const termino = busqueda.toLowerCase();
    return cierres.filter(cierre => {
      const fecha = format(new Date(cierre.created_at), 'dd/MM/yyyy', { locale: es });
      const responsable = getResponsableLabel(cierre).toLowerCase();
      return fecha.includes(termino) || 
             cierre.id?.toString().toLowerCase().includes(termino) ||
             cierre.employee_id?.toString().toLowerCase().includes(termino) ||
             responsable.includes(termino);
    });
  }, [cierres, busqueda, getResponsableLabel]);

  const formatCOP = (value) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatFecha = (fecha) => {
    if (!fecha) return 'N/A';
    return format(new Date(fecha), "EEEE, d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es });
  };

  const verDetalles = (cierre) => {
    setCierreSeleccionado(cierre);
  };

  const descargarCierre = (cierre) => {
    const texto = generarTextoCierre(cierre);
    const blob = new Blob([texto], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cierre-caja-${cierre.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generarTextoCierre = (cierre) => {
    const fecha = formatFecha(cierre.created_at);
    const diferencia = cierre.diferencia || 0;
    const responsable = getResponsableLabel(cierre);
    const resumenPagos = [
      { label: 'Efectivo', sistema: cierre.sistema_efectivo, real: cierre.real_efectivo },
      { label: 'Transferencias', sistema: cierre.sistema_transferencias, real: cierre.real_transferencias },
      { label: 'Tarjeta', sistema: cierre.sistema_tarjeta, real: cierre.real_tarjeta },
    ]
      .filter((item) => (item.sistema || 0) !== 0 || (item.real || 0) !== 0)
      .map((item) => `• ${item.label}: ${formatCOP(item.sistema || 0)} / ${formatCOP(item.real || 0)}`)
      .join('\n');
    
    return `
🧾 CIERRE DE CAJA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fecha: ${fecha}
ID: ${cierre.id}
Responsable: ${responsable}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 RESUMEN DEL SISTEMA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💵 Efectivo: ${formatCOP(cierre.sistema_efectivo || 0)}
📲 Transferencias: ${formatCOP(cierre.sistema_transferencias || 0)}
💳 Tarjeta: ${formatCOP(cierre.sistema_tarjeta || 0)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL SISTEMA: ${formatCOP(cierre.total_sistema || 0)}

💰 CONTEO REAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💵 Efectivo: ${formatCOP(cierre.real_efectivo || 0)}
📲 Transferencias: ${formatCOP(cierre.real_transferencias || 0)}
💳 Tarjeta: ${formatCOP(cierre.real_tarjeta || 0)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL REAL: ${formatCOP(cierre.total_real || 0)}

🧾 COMPARATIVO POR MÉTODO (SISTEMA / REAL):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${resumenPagos || 'Sin movimientos por método'}

📈 RESULTADO:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${diferencia === 0 ? '✅ Cuadra exacto' : 
  diferencia > 0 ? `⬆️ Sobrante: ${formatCOP(Math.abs(diferencia))}` : 
  `⬇️ Faltante: ${formatCOP(Math.abs(diferencia))}`}

📦 Total de ventas: ${cierre.cantidad_ventas || 0}

Generado por Crece+ 🚀
    `.trim();
  };

  if (isLoading) {
    return (
      <div className="historial-cierres-container">
        <div className="loading-state">
          <RefreshCw className="spinning" size={32} />
          <p>Cargando historial de cierres...</p>
        </div>
      </div>
    );
  }

  return (
    <FeatureGuard
      feature="closingHistory"
      recommendedPlan="professional"
      showInline={false}
    >
    <div className="historial-cierres-container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="historial-cierres-header"
      >
        <div>
          <h1>Historial de Cierres de Caja</h1>
          <p>Revisa todos los cierres de caja realizados</p>
        </div>
        <button 
          className="btn-refresh"
          onClick={() => refetch()}
          title="Actualizar"
        >
          <RefreshCw size={20} />
        </button>
      </motion.div>

      {/* Búsqueda */}
      <div className="search-box">
        <Search size={20} />
        <input
          type="text"
          placeholder="Buscar por fecha o ID..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* Lista de cierres */}
      <div className="cierres-lista">
        {cierresFiltrados.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <p>No se encontraron cierres de caja</p>
          </div>
        ) : (
          cierresFiltrados.map((cierre, index) => {
            const diferencia = cierre.diferencia || 0;
            const cuadra = diferencia === 0;
            
            return (
              <motion.div
                key={cierre.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="cierre-card"
              >
                <div className="cierre-header">
                  <div className="cierre-info">
                    <div className="cierre-fecha">
                      <Calendar size={16} />
                      {format(new Date(cierre.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                    </div>
                    <div className="cierre-responsable">
                      {getResponsableLabel(cierre)}
                    </div>
                    <div className="cierre-id">
                      ID: {cierre.id?.slice(0, 8)}
                    </div>
                  </div>
                  <div className={`cierre-estado ${cuadra ? 'cuadra' : diferencia > 0 ? 'sobrante' : 'faltante'}`}>
                    {cuadra ? (
                      <>
                        <CheckCircle size={18} />
                        <span>Cuadra</span>
                      </>
                    ) : diferencia > 0 ? (
                      <>
                        <TrendingUp size={18} />
                        <span>Sobrante</span>
                      </>
                    ) : (
                      <>
                        <TrendingDown size={18} />
                        <span>Faltante</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="cierre-resumen">
                  <div className="resumen-item">
                    <span className="label">Total Sistema</span>
                    <span className="value">{formatCOP(cierre.total_sistema || 0)}</span>
                  </div>
                  <div className="resumen-item">
                    <span className="label">Total Real</span>
                    <span className="value">{formatCOP(cierre.total_real || 0)}</span>
                  </div>
                  <div className="resumen-item diferencia">
                    <span className="label">Diferencia</span>
                    <span className={`value ${diferencia === 0 ? 'neutral' : diferencia > 0 ? 'positive' : 'negative'}`}>
                      {diferencia === 0 ? '0' : diferencia > 0 ? `+${formatCOP(diferencia)}` : formatCOP(diferencia)}
                    </span>
                  </div>
                </div>

                <div className="cierre-comparativo">
                  <div className="comparativo-header">
                    <span>Método</span>
                    <span>Sistema</span>
                    <span>Real</span>
                  </div>
                  {[
                    { label: 'Efectivo', sistema: cierre.sistema_efectivo, real: cierre.real_efectivo },
                    { label: 'Transferencias', sistema: cierre.sistema_transferencias, real: cierre.real_transferencias },
                    { label: 'Tarjeta', sistema: cierre.sistema_tarjeta, real: cierre.real_tarjeta },
                  ].map((item) => (
                    <div className="comparativo-row" key={item.label}>
                      <span className="comparativo-label">{item.label}</span>
                      <span className="comparativo-value">{formatCOP(item.sistema || 0)}</span>
                      <span className="comparativo-value">{formatCOP(item.real || 0)}</span>
                    </div>
                  ))}
                  <div className="comparativo-footer">
                    <span className="comparativo-label">Ventas</span>
                    <span className="comparativo-value">{cierre.cantidad_ventas || 0}</span>
                    <span className="comparativo-value"> </span>
                  </div>
                </div>

                <div className="cierre-actions">
                  <button
                    className="btn-action btn-view"
                    onClick={() => verDetalles(cierre)}
                  >
                    <Eye size={16} />
                    Ver Detalles
                  </button>
                  <button
                    className="btn-action btn-download"
                    onClick={() => descargarCierre(cierre)}
                  >
                    <Download size={16} />
                    Descargar
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Modal de detalles */}
      {cierreSeleccionado && (
        <div className="modal-overlay" onClick={() => setCierreSeleccionado(null)}>
          <div className="modal-content modal-detalles" onClick={(e) => e.stopPropagation()}>
            <h2>Detalles del Cierre de Caja</h2>
            <div className="detalles-content">
              <pre>{generarTextoCierre(cierreSeleccionado)}</pre>
            </div>
            <div className="modal-actions">
              <button 
                className="btn-cancel"
                onClick={() => setCierreSeleccionado(null)}
              >
                Cerrar
              </button>
              <button
                className="btn-download"
                onClick={() => {
                  descargarCierre(cierreSeleccionado);
                  setCierreSeleccionado(null);
                }}
              >
                <Download size={18} />
                Descargar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </FeatureGuard>
  );
};

export default HistorialCierresCaja;
