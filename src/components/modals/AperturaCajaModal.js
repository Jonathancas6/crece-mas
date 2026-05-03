import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, DollarSign, User, Save, AlertCircle, Users, Zap, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCrearAperturaCaja, useOtrasCajasAbiertas } from '../../hooks/useAperturasCaja';
import { useCurrencyInput } from '../../hooks/useCurrencyInput';
import { getEmployeeSession } from '../../utils/employeeSession';
import './AperturaCajaModal.css';

// Pasos del modal
const PASO_SELECCION = 'seleccion'; // elegir Sincronizar o Independiente
const PASO_FORMULARIO = 'formulario'; // ingresar monto y confirmar

const AperturaCajaModal = ({ isOpen, onClose, onAperturaExitosa }) => {
  const { user, organization, userProfile, hasPermission } = useAuth();
  const crearApertura = useCrearAperturaCaja();
  const montoInicialInput = useCurrencyInput();
  const [error, setError] = useState('');
  const [paso, setPaso] = useState(PASO_FORMULARIO);
  const [modoElegido, setModoElegido] = useState(null); // 'sincronizar' | 'independiente'

  const { data: otrasCajas = [] } = useOtrasCajasAbiertas(organization?.id, user?.id);

  // Cuando el modal se abre, decidir si mostrar paso de selección
  useEffect(() => {
    if (isOpen) {
      setError('');
      montoInicialInput.reset();
      
      // IMPORTANTE: Si hay otras cajas, forzar siempre el paso de selección
      // para que el usuario DECIDA.
      if (otrasCajas && otrasCajas.length > 0) {
        setPaso(PASO_SELECCION);
        setModoElegido(null);
      } else {
        setPaso(PASO_FORMULARIO);
        setModoElegido('independiente');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, otrasCajas.length]);

  const handleSeleccionarModo = (modo) => {
    setModoElegido(modo);
    if (modo === 'sincronizar') {
      // Sincronizar: usar la apertura existente directamente
      const aperturaExistente = otrasCajas[0];
      
      // Guardar en localStorage que estamos sincronizados a esta apertura
      localStorage.setItem(`synced_apertura_${organization.id}`, aperturaExistente.id);
      
      onClose();
      setTimeout(() => {
        if (onAperturaExitosa) onAperturaExitosa(aperturaExistente);
      }, 50);
    } else {
      // Independiente: mostrar formulario de monto
      setPaso(PASO_FORMULARIO);
    }
  };

  const handleAbrirCaja = async () => {
    if (!user || !organization) {
      setError('Error: No hay usuario u organización activa');
      return;
    }

    if (!hasPermission('caja.open') && !hasPermission('cierre.create') && !['owner', 'admin'].includes(userProfile?.role)) {
      setError('No tienes permisos para abrir la caja.');
      return;
    }

    const montoInicial = montoInicialInput.numericValue || 0;
    
    if (montoInicial < 0) {
      setError('El monto inicial no puede ser negativo');
      return;
    }

    setError('');
    
    try {
      const apertura = await crearApertura.mutateAsync({
        organizationId: organization.id,
        userId: user.id,
        montoInicial: montoInicial
      });

      onClose();
      
      if (apertura && onAperturaExitosa) {
        setTimeout(() => {
          onAperturaExitosa(apertura);
        }, 50);
      }
    } catch (err) {
      setError(err.message || 'Error al abrir la caja');
    }
  };

  const handleClose = () => {
    if (!crearApertura.isLoading) {
      setError('');
      montoInicialInput.reset();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="apertura-caja-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div
          className="apertura-caja-modal"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="apertura-caja-modal-header">
            <div className="apertura-caja-modal-title">
              <DollarSign size={24} />
              <h2>Abrir Caja</h2>
            </div>
            <button
              className="apertura-caja-modal-close"
              onClick={handleClose}
              disabled={crearApertura.isLoading}
            >
              <X size={20} />
            </button>
          </div>

          {/* PASO 1: Selección de modo cuando hay otras cajas abiertas */}
          {paso === PASO_SELECCION && (
            <div className="apertura-caja-modal-content">
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '10px',
                padding: '1rem',
                marginBottom: '1.5rem',
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'flex-start',
                color: 'var(--text-primary)'
              }}>
                <AlertCircle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: '#f59e0b' }}>
                    Ya hay {otrasCajas.length} caja{otrasCajas.length > 1 ? 's' : ''} abierta{otrasCajas.length > 1 ? 's' : ''} en este negocio
                  </p>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    ¿Cómo deseas trabajar hoy?
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Opción: Sincronizar */}
                <button
                  onClick={() => handleSeleccionarModo('sincronizar')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem 1.25rem',
                    background: 'rgba(99, 102, 241, 0.1)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    color: 'var(--text-primary)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'}
                >
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '10px',
                    background: 'rgba(99, 102, 241, 0.2)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Users size={20} style={{ color: '#818cf8' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>
                      Unirme a la caja de {otrasCajas[0]?.vendedor?.employee_name || otrasCajas[0]?.user_profile?.full_name || 'otro usuario'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Compartir balance y ventas con esta caja. Solo el titular puede cerrar.
                    </div>
                  </div>
                  <ArrowRight size={18} style={{ color: '#818cf8', flexShrink: 0 }} />
                </button>

                {/* Opción: Independiente */}
                <button
                  onClick={() => handleSeleccionarModo('independiente')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    padding: '1rem 1.25rem',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    color: 'var(--text-primary)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
                >
                  <div style={{
                    width: '42px', height: '42px', borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.2)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <Zap size={20} style={{ color: '#34d399' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Trabajar independiente</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Abrir mi propia caja con mis ventas y mi propio cierre independiente.
                    </div>
                  </div>
                  <ArrowRight size={18} style={{ color: '#34d399', flexShrink: 0 }} />
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: Formulario de monto */}
          {paso === PASO_FORMULARIO && (
            <div className="apertura-caja-modal-content">
              <div className="apertura-caja-info">
                <div className="apertura-caja-info-item">
                  <User size={18} />
                  <span>
                    <strong>Usuario:</strong> {getEmployeeSession()?.employee?.employee_name || userProfile?.full_name || userProfile?.nombre || user?.email || 'Usuario'}
                  </span>
                </div>
                <div className="apertura-caja-info-item">
                  <span>
                    <strong>Organización:</strong> {organization?.name || 'N/A'}
                  </span>
                </div>
                {modoElegido === 'independiente' && otrasCajas.length > 0 && (
                  <div className="apertura-caja-info-item" style={{ color: '#34d399' }}>
                    <Zap size={16} />
                    <span>Modo: Caja independiente</span>
                  </div>
                )}
              </div>

              <div className="apertura-caja-form">
                <label htmlFor="monto-inicial">
                  Monto Inicial <span className="required">*</span>
                </label>
                <div className="apertura-caja-input-wrapper">
                  <span className="apertura-caja-input-icon-outside">$</span>
                  <input
                    id="monto-inicial"
                    type="text"
                    className="apertura-caja-input"
                    placeholder="0"
                    value={montoInicialInput.displayValue}
                    onChange={(e) => montoInicialInput.handleChange(e)}
                    disabled={crearApertura.isLoading}
                    autoFocus
                  />
                </div>
                <p className="apertura-caja-hint">
                  Ingresa el monto inicial con el que abres la caja hoy
                </p>
              </div>

              {error && (
                <motion.div
                  className="apertura-caja-error"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </motion.div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="apertura-caja-modal-footer">
            {paso === PASO_FORMULARIO && (
              <>
                <button
                  className="apertura-caja-btn-cancelar"
                  onClick={otrasCajas.length > 0 ? () => setPaso(PASO_SELECCION) : handleClose}
                  disabled={crearApertura.isLoading}
                >
                  {otrasCajas.length > 0 ? 'Volver' : 'Cancelar'}
                </button>
                <button
                  className="apertura-caja-btn-abrir"
                  onClick={handleAbrirCaja}
                  disabled={crearApertura.isLoading || !montoInicialInput.displayValue}
                >
                  {crearApertura.isLoading ? (
                    <>
                      <motion.div
                        className="spinner"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      Abriendo...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Abrir Caja
                    </>
                  )}
                </button>
              </>
            )}
            {paso === PASO_SELECCION && (
              <button
                className="apertura-caja-btn-cancelar"
                onClick={handleClose}
              >
                Cancelar
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AperturaCajaModal;
