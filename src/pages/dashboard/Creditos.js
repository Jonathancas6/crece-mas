import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCreditos, useEstadisticasCreditos, useCrearPagoCredito, useEliminarPagoCredito, usePagosCredito } from '../../hooks/useCreditos';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { 
  Filter, 
  DollarSign, 
  Calendar, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  X,
  Plus,
  Trash2,
  Eye,
  FileText,
  Receipt,
  ShoppingCart,
  MessageCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import './Creditos.css';

function formatCOP(value) {
  try {
    return new Intl.NumberFormat("es-CO", { 
      style: "currency", 
      currency: "COP", 
      maximumFractionDigits: 0 
    }).format(value);
  } catch {
    return "$" + value.toLocaleString("es-CO");
  }
}

export default function Creditos() {
  const { organization } = useAuth();
  const location = useLocation();
  const { isOnline } = useNetworkStatus();
  const { isSyncing } = useOfflineSync();
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [creditoSeleccionado, setCreditoSeleccionado] = useState(null);
  const [mostrandoModalPago, setMostrandoModalPago] = useState(false);
  const [mostrandoDetalle, setMostrandoDetalle] = useState(false);
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [notasPago, setNotasPago] = useState('');

  const { data: creditos = [], isLoading } = useCreditos(organization?.id, {
    estado: filtroEstado !== 'todos' ? filtroEstado : undefined
  });

  const { data: estadisticas } = useEstadisticasCreditos(organization?.id);
  const crearPagoMutation = useCrearPagoCredito();
  const eliminarPagoMutation = useEliminarPagoCredito();
  const lastAppliedSearchRef = useRef(null);


  useEffect(() => {
    if (lastAppliedSearchRef.current === location.search) return;
    lastAppliedSearchRef.current = location.search;
    const params = new URLSearchParams(location.search);
    const estadoParam = params.get('estado');
    const estadosValidos = ['todos', 'pendiente', 'parcial', 'pagado', 'vencido'];
    if (estadoParam && estadosValidos.includes(estadoParam)) {
      setFiltroEstado(estadoParam);
    }
  }, [location.search]);

  // Filtrar créditos por búsqueda
  const creditosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return creditos;
    
    const query = busqueda.toLowerCase();
    return creditos.filter(credito => {
      const cliente = credito.cliente;
      return (
        cliente?.nombre?.toLowerCase().includes(query) ||
        cliente?.documento?.toLowerCase().includes(query) ||
        cliente?.telefono?.toLowerCase().includes(query) ||
        cliente?.email?.toLowerCase().includes(query) ||
        credito.venta?.numero_venta?.toLowerCase().includes(query)
      );
    });
  }, [creditos, busqueda]);

  // Agrupar créditos por cliente
  const creditosAgrupados = useMemo(() => {
    const agrupados = new Map();
    
    creditosFiltrados.forEach(credito => {
      const clienteId = credito.cliente_id || 'sin-cliente';
      const cliente = credito.cliente;
      
      if (!agrupados.has(clienteId)) {
        agrupados.set(clienteId, {
          cliente: cliente,
          clienteId: clienteId,
          creditos: [],
          totalPendiente: 0,
          totalPagado: 0,
          totalCredito: 0
        });
      }
      
      const grupo = agrupados.get(clienteId);
      grupo.creditos.push(credito);
      grupo.totalPendiente += parseFloat(credito.monto_pendiente || 0);
      grupo.totalPagado += parseFloat(credito.monto_pagado || 0);
      grupo.totalCredito += parseFloat(credito.monto_total || 0);
    });
    
    return Array.from(agrupados.values());
  }, [creditosFiltrados]);

  // Función para generar mensaje de WhatsApp
  const generarMensajeWhatsApp = (creditosCliente) => {
    const cliente = creditosCliente.cliente;
    const telefono = cliente?.telefono;
    
    if (!telefono) {
      toast.error('El cliente no tiene número de teléfono registrado');
      return;
    }
    
    // Limpiar el teléfono (solo números)
    const telefonoLimpio = telefono.replace(/\D/g, '');
    
    // Construir mensaje
    let mensaje = `Hola ${cliente?.nombre || 'Cliente'}, te recordamos que tienes ${creditosCliente.creditos.length} ${creditosCliente.creditos.length === 1 ? 'crédito pendiente' : 'créditos pendientes'}:\n\n`;
    
    creditosCliente.creditos.forEach((credito, index) => {
      mensaje += `${index + 1}. Crédito ${credito.venta?.numero_venta || 'N/A'}\n`;
      mensaje += `   Total: ${formatCOP(credito.monto_total)}\n`;
      mensaje += `   Pagado: ${formatCOP(credito.monto_pagado)}\n`;
      mensaje += `   Pendiente: ${formatCOP(credito.monto_pendiente)}\n`;
      if (credito.fecha_vencimiento) {
        const fechaVenc = format(new Date(credito.fecha_vencimiento), "dd/MM/yyyy", { locale: es });
        mensaje += `   Vence: ${fechaVenc}\n`;
      }
      mensaje += `\n`;
    });
    
    mensaje += `Total pendiente: ${formatCOP(creditosCliente.totalPendiente)}\n\n`;
    mensaje += `Por favor, coordina el pago a la brevedad posible. Gracias.`;
    
    // Codificar el mensaje para URL
    const mensajeCodificado = encodeURIComponent(mensaje);
    
    // Generar URL de WhatsApp
    const urlWhatsApp = `https://wa.me/${telefonoLimpio}?text=${mensajeCodificado}`;
    
    // Abrir WhatsApp en nueva ventana
    window.open(urlWhatsApp, '_blank');
    
    toast.success('Abriendo WhatsApp para enviar recordatorio de pago');
  };

  const handleRegistrarPago = async () => {
    if (!creditoSeleccionado) return;

    const monto = parseFloat(montoPago.replace(/[^\d]/g, '')) || 0;
    if (monto <= 0) {
      toast.error('El monto debe ser mayor a cero');
      return;
    }

    if (monto > creditoSeleccionado.monto_pendiente) {
      toast.error(`El monto no puede ser mayor al pendiente (${formatCOP(creditoSeleccionado.monto_pendiente)})`);
      return;
    }

    try {
      await crearPagoMutation.mutateAsync({
        organization_id: organization.id,
        credito_id: creditoSeleccionado.id,
        monto: monto,
        metodo_pago: metodoPago,
        notas: notasPago.trim() || null,
        user_id: organization.user_id || null
      });

      setMontoPago('');
      setNotasPago('');
      setMostrandoModalPago(false);
      setCreditoSeleccionado(null);
      toast.success('Pago registrado exitosamente');
    } catch (error) {
      console.error('Error al registrar pago:', error);
    }
  };

  const handleEliminarPago = async (pagoId) => {
    if (!window.confirm('¿Estás seguro de eliminar este pago?')) return;

    try {
      await eliminarPagoMutation.mutateAsync({
        id: pagoId,
        creditoId: creditoSeleccionado?.id,
        organizationId: organization.id
      });
    } catch (error) {
      console.error('Error al eliminar pago:', error);
    }
  };

  const getEstadoBadge = (estado, fechaVencimiento) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vencimiento = fechaVencimiento ? new Date(fechaVencimiento) : null;
    const estaVencido = vencimiento && vencimiento < hoy;

    switch (estado) {
      case 'pagado':
        return <span className="credito-badge credito-badge-pagado"><CheckCircle size={14} /> Pagado</span>;
      case 'parcial':
        return <span className="credito-badge credito-badge-parcial"><Clock size={14} /> Parcial</span>;
      case 'vencido':
      case 'pendiente':
        if (estaVencido && estado === 'pendiente') {
          return <span className="credito-badge credito-badge-vencido"><AlertCircle size={14} /> Vencido</span>;
        }
        return <span className="credito-badge credito-badge-pendiente"><Clock size={14} /> Pendiente</span>;
      default:
        return <span className="credito-badge">{estado}</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="creditos-container">
        <div className="creditos-loading">
          <div className="spinner" />
          <p>Cargando créditos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="creditos-container">
      <div className="creditos-header">
        <div>
          <h1>Gestión de Créditos</h1>
          <p>Administra y realiza seguimiento de las cuentas por cobrar</p>
        </div>
      </div>

      {/* Estadísticas */}
      {estadisticas && (
        <div className="creditos-estadisticas">
          <div className="credito-stat-card">
            <div className="credito-stat-icon" style={{ background: '#dbeafe' }}>
              <FileText size={24} color="#1e40af" />
            </div>
            <div className="credito-stat-content">
              <p className="credito-stat-label">Total Créditos</p>
              <p className="credito-stat-value">{estadisticas.totalCreditos}</p>
            </div>
          </div>
          <div className="credito-stat-card">
            <div className="credito-stat-icon" style={{ background: '#fef3c7' }}>
              <DollarSign size={24} color="#d97706" />
            </div>
            <div className="credito-stat-content">
              <p className="credito-stat-label">Total Pendiente</p>
              <p className="credito-stat-value">{formatCOP(estadisticas.totalPendiente)}</p>
            </div>
          </div>
          <div className="credito-stat-card">
            <div className="credito-stat-icon" style={{ background: '#dcfce7' }}>
              <CheckCircle size={24} color="#16a34a" />
            </div>
            <div className="credito-stat-content">
              <p className="credito-stat-label">Total Pagado</p>
              <p className="credito-stat-value">{formatCOP(estadisticas.totalPagado)}</p>
            </div>
          </div>
          <div className="credito-stat-card credito-stat-card-danger">
            <div className="credito-stat-icon" style={{ background: '#fee2e2' }}>
              <AlertCircle size={24} color="#dc2626" />
            </div>
            <div className="credito-stat-content">
              <p className="credito-stat-label">Vencidos</p>
              <p className="credito-stat-value">{estadisticas.creditosVencidos}</p>
              <p className="credito-stat-subvalue">{formatCOP(estadisticas.totalVencido)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filtros y búsqueda */}
      <div className="creditos-filtros">
        <div className="creditos-busqueda">
          <input
            type="text"
            placeholder="Buscar por cliente, documento, teléfono o número de venta..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="creditos-search-input"
          />
        </div>
        <div className="creditos-filtros-estado">
          <Filter size={18} />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="creditos-select-filtro"
          >
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="parcial">Parciales</option>
            <option value="pagado">Pagados</option>
            <option value="vencido">Vencidos</option>
          </select>
        </div>
      </div>

      {/* Lista de créditos agrupados por cliente */}
      <div className="creditos-lista">
        {creditosAgrupados.length === 0 ? (
          <div className="creditos-empty">
            <FileText size={48} color="#9ca3af" />
            <p>No se encontraron créditos</p>
          </div>
        ) : (
          creditosAgrupados.map((grupoCliente) => {
            const cliente = grupoCliente.cliente;
            const tieneMultiplesCreditos = grupoCliente.creditos.length > 1;
            
            return (
              <div key={grupoCliente.clienteId} className="credito-grupo-cliente">
                {/* Encabezado del grupo (solo si tiene múltiples créditos) */}
                {tieneMultiplesCreditos && (
                  <div className="credito-grupo-header">
                    <div className="credito-grupo-info">
                      <h3 className="credito-grupo-nombre">
                        {cliente?.nombre || 'Cliente sin nombre'}
                        <span className="credito-grupo-badge">
                          {grupoCliente.creditos.length} crédito{grupoCliente.creditos.length > 1 ? 's' : ''}
                        </span>
                      </h3>
                      <div className="credito-grupo-meta">
                        {cliente?.documento && <span>Doc: {cliente.documento}</span>}
                        {cliente?.telefono && <span>Tel: {cliente.telefono}</span>}
                      </div>
                    </div>
                    <div className="credito-grupo-totales">
                      <div className="credito-grupo-total-item">
                        <span className="credito-grupo-total-label">Total Pendiente:</span>
                        <span className="credito-grupo-total-value credito-monto-pendiente">
                          {formatCOP(grupoCliente.totalPendiente)}
                        </span>
                      </div>
                      {cliente?.telefono && grupoCliente.totalPendiente > 0 && (
                        <button
                          className="credito-btn credito-btn-whatsapp"
                          onClick={() => generarMensajeWhatsApp(grupoCliente)}
                          title="Enviar recordatorio por WhatsApp"
                        >
                          <MessageCircle size={16} />
                          Recordar Pago
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Lista de créditos individuales */}
                <div className={`credito-grupo-items ${tieneMultiplesCreditos ? 'con-header' : ''}`}>
                  {grupoCliente.creditos.map(credito => {
            const porcentajePagado = (credito.monto_pagado / credito.monto_total) * 100;
            const cliente = credito.cliente;
            
            return (
              <div key={credito.id} className="credito-card">
                <div className="credito-card-header">
                  <div className="credito-card-info">
                    <h3>{cliente?.nombre || 'Cliente sin nombre'}</h3>
                    <div className="credito-card-meta">
                      {cliente?.documento && <span>Doc: {cliente.documento}</span>}
                      {cliente?.telefono && <span>Tel: {cliente.telefono}</span>}
                      {credito.venta?.numero_venta && (
                        <span>Venta: {credito.venta.numero_venta}</span>
                      )}
                    </div>
                  </div>
                  {getEstadoBadge(credito.estado, credito.fecha_vencimiento)}
                </div>

                <div className="credito-card-body">
                  <div className="credito-montos">
                    <div className="credito-monto-item">
                      <span className="credito-monto-label">Total:</span>
                      <span className="credito-monto-value">{formatCOP(credito.monto_total)}</span>
                    </div>
                    <div className="credito-monto-item">
                      <span className="credito-monto-label">Pagado:</span>
                      <span className="credito-monto-value credito-monto-pagado">
                        {formatCOP(credito.monto_pagado)}
                      </span>
                    </div>
                    <div className="credito-monto-item">
                      <span className="credito-monto-label">Pendiente:</span>
                      <span className="credito-monto-value credito-monto-pendiente">
                        {formatCOP(credito.monto_pendiente)}
                      </span>
                    </div>
                  </div>

                  <div className="credito-progress">
                    <div className="credito-progress-bar">
                      <div 
                        className="credito-progress-fill"
                        style={{ width: `${porcentajePagado}%` }}
                      />
                    </div>
                    <span className="credito-progress-text">{porcentajePagado.toFixed(0)}% pagado</span>
                  </div>

                  {credito.fecha_vencimiento && (
                    <div className="credito-fecha-vencimiento">
                      <Calendar size={14} />
                      <span>
                        Vence: {format(new Date(credito.fecha_vencimiento), "dd 'de' MMMM 'de' yyyy", { locale: es })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="credito-card-actions">
                  <button
                    className="credito-btn credito-btn-secondary"
                    onClick={() => {
                      setCreditoSeleccionado(credito);
                      setMostrandoDetalle(true);
                    }}
                  >
                    <Eye size={16} />
                    Ver Detalle
                  </button>
                  {credito.monto_pendiente > 0 && (
                    <>
                      {cliente?.telefono && (
                        <button
                          className="credito-btn credito-btn-whatsapp"
                          onClick={() => generarMensajeWhatsApp({
                            cliente: cliente,
                            creditos: [credito],
                            totalPendiente: credito.monto_pendiente
                          })}
                          title="Enviar recordatorio por WhatsApp"
                        >
                          <MessageCircle size={16} />
                          Recordar Pago
                        </button>
                      )}
                      <button
                        className="credito-btn credito-btn-primary"
                        onClick={() => {
                          setCreditoSeleccionado(credito);
                          setMontoPago('');
                          setMetodoPago('Efectivo');
                          setNotasPago('');
                          setMostrandoModalPago(true);
                        }}
                      >
                        <Plus size={16} />
                        Registrar Pago
                      </button>
                    </>
                  )}
                </div>
              </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de pago */}
      {mostrandoModalPago && creditoSeleccionado && (
        <div className="creditos-modal-overlay" onClick={() => setMostrandoModalPago(false)}>
          <div className="creditos-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="creditos-modal-header">
              <h3>Registrar Pago</h3>
              <button onClick={() => setMostrandoModalPago(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="creditos-modal-body">
              <div className="credito-pago-info">
                <p><strong>Cliente:</strong> {creditoSeleccionado.cliente?.nombre}</p>
                <p><strong>Pendiente:</strong> {formatCOP(creditoSeleccionado.monto_pendiente)}</p>
              </div>
              <div className="credito-form-group">
                <label>Monto a pagar *</label>
                <input
                  type="text"
                  value={montoPago}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d]/g, '');
                    setMontoPago(value);
                  }}
                  placeholder="0"
                  className="credito-input"
                />
              </div>
              <div className="credito-form-group">
                <label>Método de pago *</label>
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="credito-select"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Nequi">Nequi</option>
                </select>
              </div>
              <div className="credito-form-group">
                <label>Notas (opcional)</label>
                <textarea
                  value={notasPago}
                  onChange={(e) => setNotasPago(e.target.value)}
                  placeholder="Notas adicionales sobre el pago..."
                  className="credito-textarea"
                  rows={3}
                />
              </div>
            </div>
            <div className="creditos-modal-footer">
              <button
                className="credito-btn credito-btn-secondary"
                onClick={() => setMostrandoModalPago(false)}
              >
                Cancelar
              </button>
              <button
                className="credito-btn credito-btn-primary"
                onClick={handleRegistrarPago}
                disabled={crearPagoMutation.isLoading || !montoPago || parseFloat(montoPago.replace(/[^\d]/g, '')) <= 0}
              >
                {crearPagoMutation.isLoading ? 'Registrando...' : 'Registrar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {mostrandoDetalle && creditoSeleccionado && (
        <DetalleCredito
          credito={creditoSeleccionado}
          onClose={() => {
            setMostrandoDetalle(false);
            setCreditoSeleccionado(null);
          }}
          onEliminarPago={handleEliminarPago}
        />
      )}
    </div>
  );
}

// Componente para mostrar el detalle de un crédito
function DetalleCredito({ credito, onClose, onEliminarPago }) {
  const { data: pagos = [] } = usePagosCredito(credito.id);
  const [pestañaActiva, setPestañaActiva] = useState('resumen');
  
  // Debug: verificar que los pagos y la venta se estén cargando
  React.useEffect(() => {
    console.log('DetalleCredito - credito.id:', credito.id);
    console.log('DetalleCredito - credito.venta:', credito.venta);
    console.log('DetalleCredito - credito.venta?.items:', credito.venta?.items);
    console.log('DetalleCredito - pagos recibidos:', pagos.length, pagos);
    if (pagos.length > 0) {
      console.log('DetalleCredito - Detalles de pagos:', pagos.map(p => ({ 
        id: p.id, 
        credito_id: p.credito_id,
        monto: p.monto, 
        metodo_pago: p.metodo_pago,
        created_at: p.created_at,
        fecha_pago: p.fecha_pago,
        notas: p.notas
      })));
    } else {
      console.warn('DetalleCredito - No se encontraron pagos para el crédito:', credito.id);
    }
  }, [pagos, credito.id, credito.venta]);

  // Calcular porcentaje pagado
  const porcentajePagado = credito.monto_total > 0 
    ? (credito.monto_pagado / credito.monto_total) * 100 
    : 0;

  return (
    <div className="creditos-modal-overlay" onClick={onClose}>
      <div className="creditos-modal-content credito-detalle-content" onClick={(e) => e.stopPropagation()}>
        <div className="creditos-modal-header">
          <h3>Detalle del Crédito</h3>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Pestañas */}
        <div className="credito-detalle-tabs">
          <button
            className={`credito-tab ${pestañaActiva === 'resumen' ? 'active' : ''}`}
            onClick={() => setPestañaActiva('resumen')}
          >
            <FileText size={16} />
            Resumen
          </button>
          <button
            className={`credito-tab ${pestañaActiva === 'abonos' ? 'active' : ''}`}
            onClick={() => setPestañaActiva('abonos')}
          >
            <Receipt size={16} />
            Abonos ({pagos.length})
          </button>
          <button
            className={`credito-tab ${pestañaActiva === 'productos' ? 'active' : ''}`}
            onClick={() => setPestañaActiva('productos')}
            disabled={!credito.venta?.items || credito.venta.items.length === 0}
          >
            <ShoppingCart size={16} />
            Productos ({credito.venta?.items?.length || 0})
          </button>
        </div>

        <div className="creditos-modal-body">
          {/* Pestaña: Resumen */}
          {pestañaActiva === 'resumen' && (
            <div className="credito-detalle-info">
              <div className="credito-detalle-section">
                <h4>Información del Cliente</h4>
                <p><strong>Nombre:</strong> {credito.cliente?.nombre || 'N/A'}</p>
                {credito.cliente?.documento && <p><strong>Documento:</strong> {credito.cliente.documento}</p>}
                {credito.cliente?.telefono && <p><strong>Teléfono:</strong> {credito.cliente.telefono}</p>}
                {credito.cliente?.email && <p><strong>Email:</strong> {credito.cliente.email}</p>}
              </div>

              <div className="credito-detalle-section">
                <h4>Información del Crédito</h4>
                {credito.created_at && (
                  <p>
                    <strong>Fecha de Creación:</strong>{' '}
                    {format(new Date(credito.created_at), "dd 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}
                  </p>
                )}
                <div style={{ 
                  background: '#f0f9ff', 
                  padding: '1rem', 
                  borderRadius: '8px', 
                  margin: '1rem 0',
                  border: '1px solid #bae6fd'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Monto Total</p>
                      <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1f2937' }}>
                        {formatCOP(credito.monto_total)}
                      </p>
                    </div>
                    <div>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Monto Pagado</p>
                      <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#16a34a' }}>
                        {formatCOP(credito.monto_pagado)}
                      </p>
                    </div>
                    <div>
                      <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Monto Pendiente</p>
                      <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#dc2626' }}>
                        {formatCOP(credito.monto_pendiente)}
                      </p>
                    </div>
                  </div>
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Progreso de pago</span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1f2937' }}>
                        {porcentajePagado.toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height: '12px', 
                      background: '#e5e7eb', 
                      borderRadius: '6px',
                      overflow: 'hidden'
                    }}>
                      <div style={{ 
                        width: `${porcentajePagado}%`, 
                        height: '100%', 
                        background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>
                </div>
                {credito.fecha_vencimiento && (
                  <p>
                    <strong>Fecha de Vencimiento:</strong>{' '}
                    {format(new Date(credito.fecha_vencimiento), "dd 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                )}
                <p>
                  <strong>Estado:</strong> {credito.estado === 'pagado' ? 'Pagado' : credito.estado === 'parcial' ? 'Pago Parcial' : credito.estado === 'vencido' ? 'Vencido' : 'Pendiente'}
                </p>
                {credito.notas && <p><strong>Notas:</strong> {credito.notas}</p>}
              </div>

              {credito.venta && (
                <div className="credito-detalle-section">
                  <h4>Información de la Venta</h4>
                  <p><strong>Número de Venta:</strong> {credito.venta.numero_venta}</p>
                  <p><strong>Fecha:</strong> {format(new Date(credito.venta.created_at), "dd 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}</p>
                </div>
              )}
            </div>
          )}

          {/* Pestaña: Abonos */}
          {pestañaActiva === 'abonos' && (
            <div className="credito-detalle-info">
              <div className="credito-detalle-section">
                <h4>Historial de Abonos y Pagos</h4>
                {pagos.length === 0 ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '3rem 1rem',
                    color: '#9ca3af'
                  }}>
                    <Receipt size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ fontStyle: 'italic', fontSize: '1rem' }}>No se han registrado abonos aún</p>
                  </div>
                ) : (
                  <div className="credito-pagos-lista">
                    <div className="credito-pagos-header">
                      <span><strong>Total de abonos:</strong> {pagos.length}</span>
                      <span><strong>Monto total abonado:</strong> {formatCOP(pagos.reduce((sum, p) => sum + parseFloat(p.monto || 0), 0))}</span>
                    </div>
                  {pagos
                    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) // Más recientes primero
                    .map((pago, index) => {
                      // Calcular el monto pendiente antes de este pago
                      // Ordenar pagos por fecha (más antiguos primero) para calcular correctamente
                      const pagosOrdenados = [...pagos].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                      const indicePago = pagosOrdenados.findIndex(p => p.id === pago.id);
                      const montoPagadoAntes = pagosOrdenados.slice(0, indicePago).reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);
                      const montoPendienteAntes = parseFloat(credito.monto_total || 0) - montoPagadoAntes;
                      const montoPago = parseFloat(pago.monto || 0);
                      const esPagoTotal = montoPago >= montoPendienteAntes; // El pago cubre todo lo pendiente
                      const montoPendienteDespues = montoPendienteAntes - montoPago;
                      
                      return (
                        <div key={pago.id} className="credito-pago-item">
                          <div className="credito-pago-item-info">
                            <div className="credito-pago-item-header">
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                  <p className="credito-pago-monto" style={{ margin: 0 }}>
                                    <strong>{formatCOP(pago.monto)}</strong>
                                    <span className="credito-pago-metodo"> - {pago.metodo_pago}</span>
                                  </p>
                                  <span className={`credito-pago-tipo ${esPagoTotal ? 'pago-total' : 'abono'}`}>
                                    {esPagoTotal ? 'Pago Total' : 'Abono Parcial'}
                                  </span>
                                </div>
                                <div className="credito-pago-fecha" style={{ 
                                  margin: '0.5rem 0', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '0.5rem',
                                  padding: '0.5rem',
                                  background: '#f0f9ff',
                                  borderRadius: '6px',
                                  border: '1px solid #bae6fd'
                                }}>
                                  <Calendar size={16} color="#0284c7" />
                                  <span style={{ fontSize: '0.875rem', color: '#0c4a6e', fontWeight: 500 }}>
                                    <strong>Fecha del abono:</strong>{' '}
                                    {pago.created_at 
                                      ? format(new Date(pago.created_at), "dd 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })
                                      : pago.fecha_pago
                                      ? format(new Date(pago.fecha_pago), "dd 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })
                                      : 'Fecha no disponible'}
                                  </span>
                                </div>
                                <div style={{ 
                                  fontSize: '0.875rem', 
                                  color: '#6b7280', 
                                  marginTop: '0.5rem',
                                  padding: '0.5rem',
                                  background: '#f9fafb',
                                  borderRadius: '6px'
                                }}>
                                  <p style={{ margin: '0.25rem 0' }}>
                                    <strong>Pendiente antes:</strong> {formatCOP(montoPendienteAntes)}
                                  </p>
                                  <p style={{ margin: '0.25rem 0' }}>
                                    <strong>Pendiente después:</strong> {formatCOP(Math.max(0, montoPendienteDespues))}
                                  </p>
                                  {!esPagoTotal && (
                                    <p style={{ margin: '0.25rem 0', color: '#d97706', fontWeight: 500 }}>
                                      ⚠️ Este es un abono parcial. Quedan {formatCOP(montoPendienteDespues)} pendientes.
                                    </p>
                                  )}
                                  {esPagoTotal && (
                                    <p style={{ margin: '0.25rem 0', color: '#16a34a', fontWeight: 500 }}>
                                      ✅ Este pago completó el crédito.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                            {pago.notas && (
                              <p className="credito-pago-notas" style={{ marginTop: '0.75rem' }}>
                                <strong>Notas:</strong> {pago.notas}
                              </p>
                            )}
                          </div>
                          <button
                            className="credito-btn-eliminar-pago"
                            onClick={() => onEliminarPago(pago.id)}
                            title="Eliminar pago"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })} 
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pestaña: Productos */}
          {pestañaActiva === 'productos' && (
            <div className="credito-detalle-info">
              <div className="credito-detalle-section">
                <h4>Productos de la Venta</h4>
                {!credito.venta ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '3rem 1rem',
                    color: '#9ca3af'
                  }}>
                    <ShoppingCart size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ fontStyle: 'italic', fontSize: '1rem' }}>No hay información de venta asociada a este crédito</p>
                  </div>
                ) : !credito.venta.items || (Array.isArray(credito.venta.items) && credito.venta.items.length === 0) ? (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '3rem 1rem',
                    color: '#9ca3af'
                  }}>
                    <ShoppingCart size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ fontStyle: 'italic', fontSize: '1rem' }}>No hay productos registrados para esta venta</p>
                    {credito.venta.numero_venta && (
                      <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        Venta: {credito.venta.numero_venta}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="credito-productos-lista">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ 
                          background: '#f9fafb', 
                          borderBottom: '2px solid #e5e7eb'
                        }}>
                          <th style={{ 
                            padding: '0.75rem', 
                            textAlign: 'left', 
                            fontSize: '0.875rem', 
                            fontWeight: 600, 
                            color: '#374151' 
                          }}>Producto</th>
                          <th style={{ 
                            padding: '0.75rem', 
                            textAlign: 'right', 
                            fontSize: '0.875rem', 
                            fontWeight: 600, 
                            color: '#374151' 
                          }}>Cantidad</th>
                          <th style={{ 
                            padding: '0.75rem', 
                            textAlign: 'right', 
                            fontSize: '0.875rem', 
                            fontWeight: 600, 
                            color: '#374151' 
                          }}>Precio Unit.</th>
                          <th style={{ 
                            padding: '0.75rem', 
                            textAlign: 'right', 
                            fontSize: '0.875rem', 
                            fontWeight: 600, 
                            color: '#374151' 
                          }}>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(Array.isArray(credito.venta.items) ? credito.venta.items : []).map((item, index) => {
                          const precioUnitario = item.precio_venta || item.precio || item.precio_total || 0;
                          const cantidad = item.qty || item.cantidad || 1;
                          const subtotal = item.precio_total || (precioUnitario * cantidad);
                          
                          return (
                            <tr 
                              key={index}
                              style={{ 
                                borderBottom: '1px solid #e5e7eb',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <td style={{ padding: '0.75rem' }}>
                                <div>
                                  <strong style={{ color: '#1f2937' }}>{item.nombre || 'Producto sin nombre'}</strong>
                                  {item.codigo && (
                                    <p style={{ 
                                      margin: '0.25rem 0 0 0', 
                                      fontSize: '0.75rem', 
                                      color: '#6b7280' 
                                    }}>
                                      Código: {item.codigo}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td style={{ 
                                padding: '0.75rem', 
                                textAlign: 'right',
                                color: '#1f2937',
                                fontWeight: 500
                              }}>
                                {cantidad}
                              </td>
                              <td style={{ 
                                padding: '0.75rem', 
                                textAlign: 'right',
                                color: '#1f2937'
                              }}>
                                {formatCOP(precioUnitario)}
                              </td>
                              <td style={{ 
                                padding: '0.75rem', 
                                textAlign: 'right',
                                color: '#1f2937',
                                fontWeight: 600
                              }}>
                                {formatCOP(subtotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ 
                          background: '#f0f9ff',
                          borderTop: '2px solid #bae6fd'
                        }}>
                          <td colSpan={3} style={{ 
                            padding: '1rem 0.75rem', 
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#1f2937'
                          }}>
                            Total:
                          </td>
                          <td style={{ 
                            padding: '1rem 0.75rem', 
                            textAlign: 'right',
                            fontSize: '1.125rem',
                            fontWeight: 700,
                            color: '#1f2937'
                          }}>
                            {formatCOP(credito.monto_total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="creditos-modal-footer">
          <button className="credito-btn credito-btn-primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
