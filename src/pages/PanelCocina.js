// 🍽️ Panel de Cocina para Chefs
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle, ChefHat, Circle, Users, X, Eye, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../hooks/useSubscription';
import { usePedidos, useActualizarPedido } from '../hooks/usePedidos';
import { canUsePedidos, getPedidoEstadoColor } from '../utils/mesasUtils';
import { supabase } from '../services/api/supabaseClient';
import OptimizedProductImage from '../components/business/OptimizedProductImage';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineSync } from '../hooks/useOfflineSync';
import './PanelCocina.css';

const formatCOP = (value) => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(value);
};

const formatTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000 / 60); // minutos
  
  if (diff < 1) return 'Ahora';
  if (diff < 60) return `Hace ${diff} min`;
  const horas = Math.floor(diff / 60);
  return `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
};

// Función para reproducir sonido de notificación
const playNotificationSound = () => {
  try {
    // Crear contexto de audio
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Crear oscilador para generar un tono
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Conectar nodos
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Configurar el sonido (tono de notificación)
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // Frecuencia inicial
    oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);
    
    // Configurar volumen (fade in/out)
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);
    
    // Reproducir dos veces (bip-bip)
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
    
    // Segundo bip después de una pausa corta
    setTimeout(() => {
      const oscillator2 = audioContext.createOscillator();
      const gainNode2 = audioContext.createGain();
      
      oscillator2.connect(gainNode2);
      gainNode2.connect(audioContext.destination);
      
      oscillator2.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator2.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1);
      
      gainNode2.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode2.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      gainNode2.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);
      
      oscillator2.start(audioContext.currentTime);
      oscillator2.stop(audioContext.currentTime + 0.2);
    }, 250);
  } catch (error) {
    // Error silencioso si no se puede reproducir el sonido
  }
};

const PanelCocina = () => {
  const { user, organization } = useAuth();
  const { hasFeature } = useSubscription();
  const { isOnline } = useNetworkStatus();
  const { isSyncing } = useOfflineSync();
  // Obtener todos los pedidos y filtrar por estados activos
  const { data: todosPedidos = [], isLoading, refetch: refetchPedidos } = usePedidos(organization?.id);
  const actualizarPedido = useActualizarPedido();
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const pedidosPendientesAnteriores = useRef(new Set());


  // Verificar acceso
  const acceso = canUsePedidos(organization, hasFeature);

  // Filtrar pedidos pendientes y en preparación
  const pedidosActivos = useMemo(() => {
    return todosPedidos.filter(p => p.estado === 'pendiente' || p.estado === 'en_preparacion');
  }, [todosPedidos]);

  // Detectar nuevos pedidos pendientes y reproducir sonido
  useEffect(() => {
    if (isLoading || todosPedidos.length === 0) return;
    
    // Obtener IDs de pedidos pendientes actuales
    const pedidosPendientesActuales = todosPedidos
      .filter(p => p.estado === 'pendiente')
      .map(p => p.id);
    
    const pedidosPendientesSet = new Set(pedidosPendientesActuales);
    
    // Si hay pedidos pendientes anteriores, comparar
    if (pedidosPendientesAnteriores.current.size > 0) {
      // Encontrar nuevos pedidos (están en actuales pero no en anteriores)
      const nuevosPedidos = pedidosPendientesActuales.filter(
        id => !pedidosPendientesAnteriores.current.has(id)
      );
      
      // Si hay nuevos pedidos, reproducir sonido
      if (nuevosPedidos.length > 0) {
        playNotificationSound();
      }
    }
    
    // Actualizar la referencia con los pedidos actuales
    pedidosPendientesAnteriores.current = pedidosPendientesSet;
  }, [todosPedidos, isLoading]);

  // Identificar pedidos que podrían estar "pegados" (más de 2 horas sin cambios)
  const pedidosPegados = useMemo(() => {
    const ahora = new Date();
    return pedidosActivos.filter(p => {
      if (!p.updated_at) return false;
      const fechaActualizacion = new Date(p.updated_at);
      const horasSinCambiar = (ahora - fechaActualizacion) / (1000 * 60 * 60);
      
      // Considerar "pegado" si:
      // - Pendiente más de 2 horas
      // - En preparación más de 4 horas
      if (p.estado === 'pendiente' && horasSinCambiar > 2) return true;
      if (p.estado === 'en_preparacion' && horasSinCambiar > 4) return true;
      return false;
    });
  }, [pedidosActivos]);

  // Agrupar por estado y ordenar para facilitar el trabajo en cocina
  // Orden: Pendientes primero (más urgentes), luego En Preparación
  // Dentro de cada grupo: más antiguos primero (FIFO) para que no se queden pedidos sin atender
  // Priorizar pedidos "pegados" al inicio de cada grupo
  const pedidosPendientes = useMemo(() => {
    const pendientes = pedidosActivos.filter(p => p.estado === 'pendiente');
    // Separar pegados y no pegados
    const pegados = pendientes.filter(p => pedidosPegados.some(pp => pp.id === p.id));
    const noPegados = pendientes.filter(p => !pedidosPegados.some(pp => pp.id === p.id));
    
    // Ordenar cada grupo por fecha de creación (más antiguos primero)
    const ordenarPorFecha = (a, b) => {
      const fechaA = new Date(a.created_at || a.updated_at);
      const fechaB = new Date(b.created_at || b.updated_at);
      return fechaA - fechaB; // Ascendente (más antiguos primero)
    };
    
    pegados.sort(ordenarPorFecha);
    noPegados.sort(ordenarPorFecha);
    
    // Pegados primero, luego no pegados
    return [...pegados, ...noPegados];
  }, [pedidosActivos, pedidosPegados]);

  const pedidosEnPreparacion = useMemo(() => {
    const enPreparacion = pedidosActivos.filter(p => p.estado === 'en_preparacion');
    // Separar pegados y no pegados
    const pegados = enPreparacion.filter(p => pedidosPegados.some(pp => pp.id === p.id));
    const noPegados = enPreparacion.filter(p => !pedidosPegados.some(pp => pp.id === p.id));
    
    // Ordenar cada grupo por fecha de actualización (más antiguos primero)
    const ordenarPorFecha = (a, b) => {
      const fechaA = new Date(a.updated_at || a.created_at);
      const fechaB = new Date(b.updated_at || b.created_at);
      return fechaA - fechaB; // Ascendente (más antiguos primero)
    };
    
    pegados.sort(ordenarPorFecha);
    noPegados.sort(ordenarPorFecha);
    
    // Pegados primero, luego no pegados
    return [...pegados, ...noPegados];
  }, [pedidosActivos, pedidosPegados]);

  const handleCambiarEstado = async (pedidoId, nuevoEstado) => {
    if (!organization?.id || !user?.id) {
      console.error('Faltan datos de organización o usuario');
      return;
    }
    
    try {
      // Si se está marcando como "listo", verificar si ya fue pagado
      if (nuevoEstado === 'listo') {
        try {
          // Obtener el pedido completo para verificar si ya fue pagado
          const { data: pedido, error: pedidoError } = await supabase
            .from('pedidos')
            .select('pago_inmediato, venta_id, estado, numero_pedido')
            .eq('id', pedidoId)
            .single();
          
          if (pedidoError) {
            // Si hay error (ej: columna venta_id no existe), continuar normalmente
            console.warn('No se pudo verificar estado de pago (posible migración pendiente):', pedidoError.message);
          } else if (pedido) {
            // Si fue pagado (tiene pago_inmediato O venta_id), marcar directamente como completado
            if (pedido.pago_inmediato || pedido.venta_id) {
              console.log(`✅ Pedido ${pedido.numero_pedido} ya fue pagado, completando automáticamente`);
              await actualizarPedido.mutateAsync({
                id: pedidoId,
                organizationId: organization.id,
                estado: 'completado',
                chefId: null
              });
              return;
            }
          }
        } catch (error) {
          console.warn('Error verificando estado de pago, continuando normalmente:', error.message);
        }
      }
      
      // Actualización normal del estado
      await actualizarPedido.mutateAsync({
        id: pedidoId,
        organizationId: organization.id,
        estado: nuevoEstado,
        chefId: nuevoEstado === 'en_preparacion' ? user.id : null
      });
    } catch (error) {
      console.error('Error cambiando estado:', error);
    }
  };

  if (!acceso.canUse) {
    return (
      <div className="panel-cocina">
        <div className="cocina-disabled">
          <ChefHat size={48} />
          <h3>Panel de Cocina no disponible</h3>
          <p>{acceso.reason}</p>
        </div>
      </div>
    );
  }

  return (
      <div className="panel-cocina">
      <div className="cocina-header">
        <div className="cocina-header-content">
          <ChefHat size={32} />
          <div>
            <h1>Panel de Cocina</h1>
            <p className="cocina-subtitle">Gestiona los pedidos en tiempo real</p>
          </div>
        </div>
        <div className="cocina-header-actions">
          <button
            className="cocina-refresh-btn"
            onClick={() => refetchPedidos()}
            title="Actualizar pedidos"
            disabled={isLoading}
          >
            <RefreshCw size={16} className={isLoading ? 'rotating' : ''} />
            Actualizar
          </button>
          {pedidosPegados.length > 0 && (
            <div className="cocina-alert-pegados" title={`${pedidosPegados.length} pedido(s) llevan mucho tiempo sin actualizar`}>
              <span className="cocina-alert-icon">⚠️</span>
              <span className="cocina-alert-text">{pedidosPegados.length} atascado(s)</span>
            </div>
          )}
          <div className="cocina-stats">
            <div className="cocina-stat">
              <span className="cocina-stat-label">Pendientes</span>
              <span className="cocina-stat-value">{pedidosPendientes.length}</span>
            </div>
            <div className="cocina-stat">
              <span className="cocina-stat-label">En Preparación</span>
              <span className="cocina-stat-value">{pedidosEnPreparacion.length}</span>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="cocina-loading">
          <p>Cargando pedidos...</p>
        </div>
      ) : pedidosActivos.length === 0 ? (
        <div className="cocina-empty">
          <CheckCircle size={48} />
          <h3>No hay pedidos activos</h3>
          <p>Todos los pedidos están completados</p>
        </div>
      ) : (
        <>
          {pedidosPegados.length > 0 && (
            <motion.div
              className="cocina-alert-banner"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="cocina-alert-content">
                <span className="cocina-alert-icon-large">⚠️</span>
                <div>
                  <h3>Pedidos que requieren atención</h3>
                  <p>
                    {pedidosPegados.length} pedido(s) llevan mucho tiempo sin actualizar. 
                    Revisa si necesitan ser procesados o si hay algún problema.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
          <div className="cocina-container">
          {/* Pedidos Pendientes */}
          {pedidosPendientes.length > 0 && (
            <motion.div
              className="cocina-section"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="cocina-section-header">
                <div className="cocina-section-title">
                  <Circle size={16} fill={getPedidoEstadoColor('pendiente')} />
                  <h2>Pendientes ({pedidosPendientes.length})</h2>
                </div>
              </div>
              <div className="pedidos-grid">
                {pedidosPendientes.map((pedido) => (
                  <PedidoCard
                    key={pedido.id}
                    pedido={pedido}
                    onCambiarEstado={handleCambiarEstado}
                    onVerDetalles={setPedidoSeleccionado}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* Pedidos En Preparación */}
          {pedidosEnPreparacion.length > 0 && (
            <motion.div
              className="cocina-section"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="cocina-section-header">
                <div className="cocina-section-title">
                  <Circle size={16} fill={getPedidoEstadoColor('en_preparacion')} />
                  <h2>En Preparación ({pedidosEnPreparacion.length})</h2>
                </div>
              </div>
              <div className="pedidos-grid">
                {pedidosEnPreparacion.map((pedido) => (
                  <PedidoCard
                    key={pedido.id}
                    pedido={pedido}
                    onCambiarEstado={handleCambiarEstado}
                    onVerDetalles={setPedidoSeleccionado}
                  />
                ))}
              </div>
            </motion.div>
          )}
          </div>
        </>
      )}

      {/* Modal de detalles */}
      <AnimatePresence>
        {pedidoSeleccionado && (
          <PedidoDetalleModal
            pedido={pedidoSeleccionado}
            onClose={() => setPedidoSeleccionado(null)}
            onCambiarEstado={handleCambiarEstado}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// Componente de tarjeta de pedido
const PedidoCard = ({ pedido, onCambiarEstado, onVerDetalles }) => {
  const estadoColor = getPedidoEstadoColor(pedido.estado);
  const itemsCount = pedido.items?.length || 0;

  return (
    <motion.div
      className="pedido-card-cocina"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02, y: -4 }}
      style={{ borderLeftColor: estadoColor }}
    >
      <div className="pedido-card-header-cocina">
        <div className="pedido-card-info">
          <div className="pedido-card-title">
            <h3>{pedido.numero_pedido}</h3>
            <div
              className="pedido-estado-badge-cocina"
              style={{ backgroundColor: estadoColor }}
            >
              {pedido.estado === 'pendiente' ? 'Pendiente' : 'En Preparación'}
            </div>
          </div>
          {pedido.mesa && (
            <p className="pedido-mesa">
              <Users size={14} /> {pedido.mesa.numero} • {pedido.mesa.capacidad} personas
            </p>
          )}
          {(pedido.estado === 'pendiente' || pedido.estado === 'en_preparacion') && pedido.cliente_nombre && (
            <p className="pedido-cliente-nombre" style={{ 
              fontWeight: 600, 
              color: 'var(--accent-primary)',
              fontSize: '0.9rem',
              marginTop: '0.25rem'
            }}>
              👤 {pedido.cliente_nombre}
            </p>
          )}
          <p className="pedido-time">
            <Clock size={12} /> {formatTime(pedido.created_at)}
          </p>
        </div>
        <div className="pedido-card-total">
          {formatCOP(pedido.total)}
        </div>
      </div>

      <div className="pedido-card-items-preview">
        <p className="pedido-items-count">{itemsCount} {itemsCount === 1 ? 'item' : 'items'}</p>
        {pedido.notas && (
          <div className="pedido-card-notas">
            📝 {pedido.notas}
          </div>
        )}
        {pedido.items && pedido.items.map((item, idx) => (
          <div key={idx} className="pedido-item-detail">
            <div className="pedido-item-detail-line">
              {item.cantidad}x {item.producto?.nombre || 'Producto'}
            </div>
            {item.toppings && item.toppings.length > 0 && (
              <div className="pedido-item-detail-sub">
                + {item.toppings.map(t => t.nombre || t).join(', ')}
              </div>
            )}
            {item.variaciones_seleccionadas && Object.keys(item.variaciones_seleccionadas).length > 0 && (
              <div className="pedido-item-detail-sub">
                {Object.entries(item.variaciones_seleccionadas).map(([key, value], i) => {
                  // Buscar el label de la variación y opción
                  const variacionConfig = item.producto?.metadata?.variaciones_config?.find(v => 
                    (v.id || v.nombre?.toLowerCase()) === key.toLowerCase()
                  );
                  const opcion = variacionConfig?.opciones?.find(o => {
                    const opcionValor = typeof o === 'string' ? o : o.valor;
                    return opcionValor === value;
                  });
                  const variacionNombre = variacionConfig?.nombre || key;
                  const opcionLabel = typeof opcion === 'string' ? opcion : (opcion?.label || value);
                  
                  return (
                    <span key={i}>
                      {variacionNombre}: {opcionLabel}
                      {i < Object.keys(item.variaciones_seleccionadas).length - 1 && ', '}
                    </span>
                  );
                })}
              </div>
            )}
            {item.notas_item && (
              <div className="pedido-item-detail-sub">
                📝 {item.notas_item}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="pedido-card-actions-cocina">
        <button
          className="btn-ver-detalles"
          onClick={() => onVerDetalles(pedido)}
        >
          <Eye size={16} />
          Ver Detalles
        </button>
        {pedido.estado === 'pendiente' && (
          <button
            className="btn-tomar-pedido"
            onClick={() => onCambiarEstado(pedido.id, 'en_preparacion')}
          >
            Tomar Pedido
          </button>
        )}
        {pedido.estado === 'en_preparacion' && (
          <button
            className="btn-marcar-listo"
            onClick={() => onCambiarEstado(pedido.id, 'listo')}
          >
            <CheckCircle size={16} />
            Marcar Listo
          </button>
        )}
      </div>
    </motion.div>
  );
};

// Modal de detalles del pedido
const PedidoDetalleModal = ({ pedido, onClose, onCambiarEstado }) => {
  const estadoColor = getPedidoEstadoColor(pedido.estado);

  return (
    <motion.div
      className="pedido-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="pedido-modal"
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pedido-modal-header">
          <div>
            <h2>{pedido.numero_pedido}</h2>
            {pedido.mesa && (
              <p className="pedido-modal-mesa">
                <Users size={16} /> {pedido.mesa.numero} • {pedido.mesa.capacidad} personas
              </p>
            )}
            {(pedido.estado === 'pendiente' || pedido.estado === 'en_preparacion') && pedido.cliente_nombre && (
              <p className="pedido-modal-cliente" style={{ 
                fontWeight: 600, 
                color: 'var(--accent-primary)',
                fontSize: '0.95rem',
                marginTop: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                👤 {pedido.cliente_nombre}
              </p>
            )}
          </div>
          <button className="pedido-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="pedido-modal-content">
          <div className="pedido-modal-estado">
            <div
              className="pedido-estado-badge-large"
              style={{ backgroundColor: estadoColor }}
            >
              {pedido.estado === 'pendiente' ? 'Pendiente' : 'En Preparación'}
            </div>
            <p className="pedido-modal-time">
              <Clock size={14} /> {formatTime(pedido.created_at)}
            </p>
          </div>

          {pedido.notas && (
            <div className="pedido-modal-notas">
              <h4>Notas del Pedido</h4>
              <p>{pedido.notas}</p>
            </div>
          )}

          <div className="pedido-modal-items">
            <h4>Items del Pedido</h4>
            <div className="pedido-items-list">
              {pedido.items?.map((item, idx) => (
                <div key={idx} className="pedido-item-detalle">
                  <div className="pedido-item-imagen">
                    {item.producto?.imagen ? (
                      <OptimizedProductImage
                        imagePath={item.producto.imagen}
                        alt={item.producto.nombre}
                      />
                    ) : (
                      <div className="pedido-item-placeholder">
                        <Circle size={24} />
                      </div>
                    )}
                  </div>
                  <div className="pedido-item-info-detalle">
                    <h5>{item.producto?.nombre || 'Producto'}</h5>
                    {item.variaciones_seleccionadas && Object.keys(item.variaciones_seleccionadas).length > 0 && (
                      <div className="pedido-item-variaciones-detalle">
                        {Object.entries(item.variaciones_seleccionadas).map(([key, value], i) => {
                          // Buscar el label de la variación y opción
                          const variacionConfig = item.producto?.metadata?.variaciones_config?.find(v => {
                            const variacionId = v.id || v.nombre?.toLowerCase();
                            const keyLower = key.toLowerCase();
                            return variacionId === keyLower || variacionId?.includes(keyLower) || keyLower.includes(variacionId);
                          });
                          
                          // Si no se encuentra por ID/nombre, buscar en las opciones
                          let opcionLabel = value;
                          let variacionNombre = key;
                          
                          if (variacionConfig) {
                            variacionNombre = variacionConfig.nombre || key;
                            const opcion = variacionConfig.opciones?.find(o => {
                              const opcionValor = typeof o === 'string' ? o : o.valor;
                              return opcionValor === value || opcionValor?.toString() === value?.toString();
                            });
                            if (opcion) {
                              opcionLabel = typeof opcion === 'string' ? opcion : (opcion.label || opcion.valor || value);
                            }
                          }
                          
                          return (
                            <span key={i} className="pedido-item-variacion-badge">
                              <strong>{variacionNombre}:</strong> {opcionLabel}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {item.toppings && item.toppings.length > 0 && (
                      <p className="pedido-item-toppings-detalle">
                        + {item.toppings.map(t => t.nombre || t).join(', ')}
                      </p>
                    )}
                    {item.notas_item && (
                      <p className="pedido-item-notas-detalle">
                        📝 {item.notas_item}
                      </p>
                    )}
                    <p className="pedido-item-cantidad-detalle">
                      {item.cantidad}x {formatCOP(item.precio_unitario)} = {formatCOP(item.precio_total)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pedido-modal-total">
            <span>Total</span>
            <span className="pedido-modal-total-amount">{formatCOP(pedido.total)}</span>
          </div>
        </div>

        <div className="pedido-modal-actions">
          {pedido.estado === 'pendiente' && (
            <button
              className="btn-tomar-pedido-modal"
              onClick={() => {
                onCambiarEstado(pedido.id, 'en_preparacion');
                onClose();
              }}
            >
              Tomar Pedido
            </button>
          )}
          {pedido.estado === 'en_preparacion' && (
            <button
              className="btn-marcar-listo-modal"
              onClick={() => {
                onCambiarEstado(pedido.id, 'listo');
                onClose();
              }}
            >
              <CheckCircle size={18} />
              Marcar Listo
            </button>
          )}
          <button className="btn-cerrar-modal" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PanelCocina;

