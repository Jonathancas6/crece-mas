import React from 'react';
import { Calculator, TrendingUp, Banknote, CreditCard, Smartphone } from 'lucide-react';
import './CierreVisualReport.css';

const CierreVisualReport = React.forwardRef(({ 
  datos, 
  organizacion, 
  usuario, 
  puedeVerEsperado,
  montoInicialApertura,
  totalSistema,
  desgloseSistema,
  totalReal,
  diferencia,
  desgloseReal,
  ventasHoyCount
}, ref) => {
  
  const formatCOP = (value) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value || 0);
  };

  const fecha = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const hora = new Date().toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="cierre-report-container" ref={ref}>
      <div className="cierre-report-header">
        {organizacion?.logo_url && (
          <img src={organizacion.logo_url} alt="Logo" className="cierre-report-logo" />
        )}
        <div className="cierre-report-company">
          <h1>{organizacion?.razon_social || organizacion?.name || 'Mi Negocio'}</h1>
          <p>{organizacion?.direccion || ''} {organizacion?.ciudad || ''}</p>
          <p>NIT: {organizacion?.nit || ''}</p>
        </div>
      </div>

      <div className="cierre-report-title">
        <h2>INFORME DE CIERRE DE CAJA</h2>
        <div className="cierre-report-meta">
          <span><strong>Fecha:</strong> {fecha}</span>
          <span><strong>Hora:</strong> {hora}</span>
        </div>
      </div>

      <div className="cierre-report-summary-grid">
        <div className="summary-stat">
          <span className="stat-label">Total Real en Caja</span>
          <span className="stat-value highlight">{formatCOP(totalReal)}</span>
        </div>
        {puedeVerEsperado && (
          <div className="summary-stat">
            <span className="stat-label">Diferencia</span>
            <span className={`stat-value ${diferencia >= 0 ? 'positive' : 'negative'}`}>
              {diferencia > 0 ? '+' : ''}{formatCOP(diferencia)}
            </span>
          </div>
        )}
      </div>

      <div className="cierre-report-section">
        <h3><Calculator size={18} /> Detalle del Conteo Real</h3>
        <table className="cierre-report-table">
          <tbody>
            <tr>
              <td><Banknote size={14} /> Efectivo Físico</td>
              <td className="text-right">{formatCOP(desgloseReal?.efectivo)}</td>
            </tr>
            <tr>
              <td><Smartphone size={14} /> Transferencias</td>
              <td className="text-right">{formatCOP(desgloseReal?.transferencias)}</td>
            </tr>
            <tr>
              <td><CreditCard size={14} /> Tarjetas</td>
              <td className="text-right">{formatCOP(desgloseReal?.tarjeta)}</td>
            </tr>
            <tr className="row-total">
              <td><strong>TOTAL REAL</strong></td>
              <td className="text-right"><strong>{formatCOP(totalReal)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {puedeVerEsperado && (
        <div className="cierre-report-section">
          <h3><TrendingUp size={18} /> Resumen del Sistema</h3>
          <table className="cierre-report-table">
            <tbody>
              <tr>
                <td>Monto Inicial</td>
                <td className="text-right">{formatCOP(montoInicialApertura)}</td>
              </tr>
              <tr>
                <td>Ventas en Sistema</td>
                <td className="text-right">{formatCOP(totalSistema)}</td>
              </tr>
              <tr className="row-total">
                <td><strong>TOTAL ESPERADO</strong></td>
                <td className="text-right"><strong>{formatCOP(totalSistema + montoInicialApertura)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="cierre-report-footer">
        <div className="footer-info">
          <p><strong>Generado por:</strong> {usuario?.full_name || usuario?.email || 'Admin'}</p>
          <p><strong>Ventas procesadas:</strong> {ventasHoyCount} transacciones</p>
        </div>
        <div className="footer-brand">
          <span>Crece+ 🚀</span>
          <small>Sistema de Gestión Inteligente</small>
        </div>
      </div>
    </div>
  );
});

export default CierreVisualReport;
