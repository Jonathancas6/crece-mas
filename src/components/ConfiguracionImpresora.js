import React, { useState, useEffect, useCallback } from 'react';
import { Printer, Bluetooth, Check, X, AlertCircle, Wifi, Usb, Monitor, Lock } from 'lucide-react';
import { supabase } from '../services/api/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { openCashDrawer } from '../utils/thermalPrinter';
import toast from 'react-hot-toast';
import './ConfiguracionImpresora.css';

const ConfiguracionImpresora = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [impresoraConfigurada, setImpresoraConfigurada] = useState(null);
  const [dispositivosDisponibles, setDispositivosDisponibles] = useState([]);
  const [tipoImpresora, setTipoImpresora] = useState('bluetooth'); // 'bluetooth', 'wifi', 'usb', 'estandar'
  const [abrirCajonVenta, setAbrirCajonVenta] = useState(false);
  const [abrirCajonImpresion, setAbrirCajonImpresion] = useState(true);
  const [abriendoCajon, setAbriendoCajon] = useState(false);

  const cargarConfiguracion = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const userMetadata = user.user_metadata || {};
      
      if (userMetadata.impresora_configuracion) {
        const config = userMetadata.impresora_configuracion;
        setTipoImpresora(config.tipo || 'bluetooth');
        setImpresoraConfigurada(config);
        setAbrirCajonVenta(config.abrir_cajon_automatico || false);
        setAbrirCajonImpresion(config.abrir_cajon_impresion !== false);
      } else if (userMetadata.impresora_bluetooth) {
        // Compatibilidad con configuración antigua
        setTipoImpresora('bluetooth');
        setImpresoraConfigurada(userMetadata.impresora_bluetooth);
        setAbrirCajonVenta(userMetadata.impresora_bluetooth.abrir_cajon_automatico || false);
        setAbrirCajonImpresion(userMetadata.impresora_bluetooth.abrir_cajon_impresion !== false);
      }
    } catch (error) {
      console.error('Error cargando configuración de impresora:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    cargarConfiguracion();
    cargarDispositivosDisponibles();
  }, [cargarConfiguracion]);

  const cargarDispositivosDisponibles = async () => {
    if (!('bluetooth' in navigator)) {
      return;
    }

    // Verificar si getDevices está disponible (puede no estar en todos los navegadores)
    if (typeof navigator.bluetooth.getDevices !== 'function') {
      return;
    }

    try {
      // Intentar obtener dispositivos previamente emparejados
      // Nota: Esto solo funciona si el usuario ya ha seleccionado dispositivos antes
      const devices = await navigator.bluetooth.getDevices();
      
      const dispositivos = devices.map(device => ({
        id: device.id,
        name: device.name || 'Dispositivo sin nombre'
      }));
      
      setDispositivosDisponibles(dispositivos);
    } catch (error) {
      console.error('Error cargando dispositivos:', error);
      // No es crítico, simplemente no mostramos dispositivos previamente emparejados
    }
  };

  const handleSeleccionarImpresora = async () => {
    if (!('bluetooth' in navigator)) {
      toast.error('Tu navegador no soporta Bluetooth. Usa Chrome, Edge u Opera.');
      return;
    }

    setConectando(true);
    try {
      // Solicitar dispositivo Bluetooth
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
          { services: ['0000ae30-0000-1000-8000-00805f9b34fb'] },
          { namePrefix: 'Printer' },
          { namePrefix: 'POS' },
          { namePrefix: 'ESC' }
        ],
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '0000ae30-0000-1000-8000-00805f9b34fb'
        ]
      });

      // Guardar información de la impresora
      const impresoraInfo = {
        tipo: 'bluetooth',
        id: device.id,
        name: device.name || 'Impresora Bluetooth',
        abrir_cajon_automatico: abrirCajonVenta,
        abrir_cajon_impresion: abrirCajonImpresion,
        fechaConfiguracion: new Date().toISOString()
      };

      // Guardar en user_metadata
      const { error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          impresora_configuracion: impresoraInfo,
          impresora_bluetooth: impresoraInfo // Mantener compatibilidad
        }
      });

      if (error) throw error;

      setImpresoraConfigurada(impresoraInfo);
      toast.success('✅ Impresora configurada exitosamente');
      
      // Recargar dispositivos disponibles
      await cargarDispositivosDisponibles();
    } catch (error) {
      console.error('Error seleccionando impresora:', error);
      if (error.name === 'NotFoundError') {
        toast.error('No se encontró ninguna impresora. Asegúrate de que esté encendida y en modo de emparejamiento.');
      } else if (error.name === 'SecurityError') {
        toast.error('Se requiere HTTPS para usar Bluetooth. O usa localhost para desarrollo.');
      } else {
        toast.error('Error al configurar la impresora. Intenta de nuevo.');
      }
    } finally {
      setConectando(false);
    }
  };

  const handleGuardarConfiguracion = async () => {
    if (tipoImpresora === 'wifi') {
      if (!impresoraConfigurada?.ip) {
        toast.error('Por favor ingresa la dirección IP de la impresora');
        return;
      }
    }

    setGuardando(true);
    try {
      const configuracion = {
        tipo: tipoImpresora,
        abrir_cajon_automatico: abrirCajonVenta,
        abrir_cajon_impresion: abrirCajonImpresion,
        ...(tipoImpresora === 'bluetooth' && impresoraConfigurada ? {
          id: impresoraConfigurada.id,
          name: impresoraConfigurada.name
        } : {}),
        ...(tipoImpresora === 'wifi' ? {
          ip: impresoraConfigurada?.ip || '',
          puerto: impresoraConfigurada?.puerto || '9100'
        } : {}),
        fechaConfiguracion: new Date().toISOString()
      };

      const { error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          impresora_configuracion: configuracion,
          ...(tipoImpresora === 'bluetooth' ? { impresora_bluetooth: configuracion } : {})
        }
      });

      if (error) throw error;

      setImpresoraConfigurada(configuracion);
      toast.success('✅ Configuración guardada exitosamente');
    } catch (error) {
      console.error('Error guardando configuración:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarImpresora = async () => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar la configuración de impresora?')) {
      return;
    }

    setGuardando(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          impresora_configuracion: null,
          impresora_bluetooth: null
        }
      });

      if (error) throw error;

      setImpresoraConfigurada(null);
      setTipoImpresora('bluetooth');
      toast.success('✅ Configuración eliminada');
    } catch (error) {
      console.error('Error eliminando configuración:', error);
      toast.error('Error al eliminar la configuración');
    } finally {
      setGuardando(false);
    }
  };

  const handleProbarImpresora = async () => {
    if (!impresoraConfigurada) {
      toast.error('No hay impresora configurada');
      return;
    }

    if (!('bluetooth' in navigator)) {
      toast.error('Tu navegador no soporta Bluetooth');
      return;
    }

    setConectando(true);
    try {
      let device = null;

      // Intentar usar getDevices si está disponible
      if (typeof navigator.bluetooth.getDevices === 'function') {
        try {
          const devices = await navigator.bluetooth.getDevices();
          device = devices.find(d => d.id === impresoraConfigurada.id);
        } catch (error) {
          console.warn('Error obteniendo dispositivos:', error);
        }
      }

      // Si no se encontró el dispositivo o getDevices no está disponible, solicitar selección
      if (!device) {
        toast('Selecciona la impresora para probar la conexión...', { icon: 'ℹ️' });
        device = await navigator.bluetooth.requestDevice({
          filters: [
            { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
            { services: ['0000ae30-0000-1000-8000-00805f9b34fb'] },
            { namePrefix: 'Printer' },
            { namePrefix: 'POS' },
            { namePrefix: 'ESC' }
          ],
          optionalServices: [
            '000018f0-0000-1000-8000-00805f9b34fb',
            '0000ae30-0000-1000-8000-00805f9b34fb'
          ]
        });
      }

      const server = await device.gatt.connect();
      
      // Buscar el servicio de impresión
      let service;
      try {
        service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch {
        service = await server.getPrimaryService('0000ae30-0000-1000-8000-00805f9b34fb');
      }

      // Verificar que la característica existe (solo para validar la conexión)
      await service.getCharacteristic(
        service.uuid === '000018f0-0000-1000-8000-00805f9b34fb'
          ? '00002af1-0000-1000-8000-00805f9b34fb'
          : '0000ae01-0000-1000-8000-00805f9b34fb'
      );

      // Desconectar después de probar
      if (server.connected) {
        server.disconnect();
      }

      toast.success('✅ Impresora conectada correctamente');
    } catch (error) {
      console.error('Error probando impresora:', error);
      if (error.name === 'NotFoundError') {
        toast.error('No se encontró la impresora. Asegúrate de que esté encendida y en modo de emparejamiento.');
      } else if (error.message) {
        toast.error(error.message);
      } else {
        toast.error('Error al conectar con la impresora. Intenta de nuevo.');
      }
    } finally {
      setConectando(false);
    }
  };

  const handleToggleAbrirCajonVenta = async (e) => {
    const valor = e.target.checked;
    setAbrirCajonVenta(valor);
    
    if (!impresoraConfigurada) return;
    
    try {
      const configActualizada = {
        ...impresoraConfigurada,
        abrir_cajon_automatico: valor
      };
      
      const { error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          impresora_configuracion: configActualizada,
          ...(configActualizada.tipo === 'bluetooth' ? { impresora_bluetooth: configActualizada } : {})
        }
      });
      
      if (error) throw error;
      setImpresoraConfigurada(configActualizada);
      toast.success(valor ? 'Apertura automática activada' : 'Apertura automática desactivada');
    } catch (err) {
      console.error('Error guardando ajuste de cajón:', err);
      toast.error('Error al guardar el ajuste');
    }
  };

  const handleToggleAbrirCajonImpresion = async (e) => {
    const valor = e.target.checked;
    setAbrirCajonImpresion(valor);
    
    if (!impresoraConfigurada) return;
    
    try {
      const configActualizada = {
        ...impresoraConfigurada,
        abrir_cajon_impresion: valor
      };
      
      const { error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          impresora_configuracion: configActualizada,
          ...(configActualizada.tipo === 'bluetooth' ? { impresora_bluetooth: configActualizada } : {})
        }
      });
      
      if (error) throw error;
      setImpresoraConfigurada(configActualizada);
      toast.success(valor ? 'Apertura al imprimir activada' : 'Apertura al imprimir desactivada');
    } catch (err) {
      console.error('Error guardando ajuste de cajón:', err);
      toast.error('Error al guardar el ajuste');
    }
  };

  const handleProbarCajon = async () => {
    if (!impresoraConfigurada) {
      toast.error('No hay impresora configurada');
      return;
    }
    
    setAbriendoCajon(true);
    toast.loading('Enviando señal de apertura...', { id: 'cajon-test' });
    
    try {
      await openCashDrawer(user);
      toast.success('¡Señal de apertura enviada con éxito!', { id: 'cajon-test' });
    } catch (err) {
      console.error('Error probando cajón monedero:', err);
      toast.error(`Error al abrir cajón: ${err.message || 'Verifica la impresora.'}`, { id: 'cajon-test' });
    } finally {
      setAbriendoCajon(false);
    }
  };

  if (loading) {
    return <div className="config-impresora-loading">Cargando configuración...</div>;
  }

  const isBluetoothSupported = 'bluetooth' in navigator;

  return (
    <div className="config-impresora">
      <div className="config-impresora-header">
        <Printer size={24} />
        <div>
          <h3>Impresora</h3>
          <p>Configura tu impresora predeterminada</p>
        </div>
      </div>

      {/* Selector de tipo de impresora */}
      <div className="config-impresora-tipo-selector">
        <label className="config-impresora-tipo-label">Tipo de impresora:</label>
        <div className="config-impresora-tipo-options">
          <button
            className={`config-impresora-tipo-btn ${tipoImpresora === 'bluetooth' ? 'active' : ''}`}
            onClick={() => setTipoImpresora('bluetooth')}
            disabled={loading}
          >
            <Bluetooth size={18} />
            <span>Bluetooth</span>
          </button>
          <button
            className={`config-impresora-tipo-btn ${tipoImpresora === 'wifi' ? 'active' : ''}`}
            onClick={() => setTipoImpresora('wifi')}
            disabled={loading}
          >
            <Wifi size={18} />
            <span>WiFi/Red</span>
          </button>
          <button
            className={`config-impresora-tipo-btn ${tipoImpresora === 'usb' ? 'active' : ''}`}
            onClick={() => setTipoImpresora('usb')}
            disabled={loading}
          >
            <Usb size={18} />
            <span>USB</span>
          </button>
          <button
            className={`config-impresora-tipo-btn ${tipoImpresora === 'estandar' ? 'active' : ''}`}
            onClick={() => setTipoImpresora('estandar')}
            disabled={loading}
          >
            <Monitor size={18} />
            <span>Estándar</span>
          </button>
        </div>
      </div>

      {/* Configuración según tipo de impresora */}
      {tipoImpresora === 'bluetooth' && !isBluetoothSupported && (
        <div className="config-impresora-alert">
          <AlertCircle size={20} />
          <div>
            <strong>Bluetooth no disponible</strong>
            <p>Tu navegador no soporta Bluetooth. Usa Chrome, Edge u Opera para esta funcionalidad.</p>
          </div>
        </div>
      )}

      {tipoImpresora === 'wifi' && (
        <div className="config-impresora-wifi-config">
          <div className="config-impresora-wifi-input-group">
            <label>Dirección IP de la impresora:</label>
            <input
              type="text"
              placeholder="Ej: 192.168.1.100"
              value={impresoraConfigurada?.ip || ''}
              onChange={(e) => setImpresoraConfigurada(prev => ({ ...prev, ip: e.target.value, tipo: 'wifi' }))}
            />
          </div>
          <div className="config-impresora-wifi-input-group">
            <label>Puerto (opcional):</label>
            <input
              type="number"
              placeholder="9100"
              value={impresoraConfigurada?.puerto || '9100'}
              onChange={(e) => setImpresoraConfigurada(prev => ({ ...prev, puerto: e.target.value, tipo: 'wifi' }))}
            />
          </div>
          <p className="config-impresora-wifi-note">
            Nota: La impresora debe tener servidor de impresión habilitado y estar en la misma red.
          </p>
          <button
            className="config-impresora-btn config-impresora-btn-primary config-impresora-btn-large"
            onClick={handleGuardarConfiguracion}
            disabled={guardando}
          >
            <Printer size={20} />
            {guardando ? 'Guardando...' : 'Guardar configuración'}
          </button>
        </div>
      )}

      {tipoImpresora === 'usb' && (
        <div className="config-impresora-usb-info">
          <AlertCircle size={20} />
          <div>
            <strong>Impresora USB</strong>
            <p>Para impresoras USB, usa el botón "Imprimir" estándar y selecciona tu impresora en el diálogo del sistema.</p>
            <p>Configura tu impresora térmica como predeterminada en la configuración de impresoras de tu sistema operativo.</p>
          </div>
        </div>
      )}

      {tipoImpresora === 'estandar' && (
        <div className="config-impresora-estandar-info">
          <Monitor size={20} />
          <div>
            <strong>Impresión Estándar</strong>
            <p>Usa el botón "Imprimir" estándar del navegador. El formato está optimizado para impresoras térmicas de 58mm y 80mm.</p>
            <p>Selecciona tu impresora térmica en el diálogo de impresión del sistema.</p>
          </div>
        </div>
      )}

      {/* Configuración Bluetooth */}
      {tipoImpresora === 'bluetooth' && (
        <>
          {impresoraConfigurada && impresoraConfigurada.tipo === 'bluetooth' ? (
            <div className="config-impresora-configurada">
          <div className="config-impresora-info">
            <div className="config-impresora-status">
              <Check size={20} className="config-impresora-check" />
              <div>
                <strong>{impresoraConfigurada.name}</strong>
                <p>Configurada el {new Date(impresoraConfigurada.fechaConfiguracion).toLocaleDateString('es-CO')}</p>
              </div>
            </div>
          </div>
          <div className="config-impresora-actions">
            <button
              className="config-impresora-btn config-impresora-btn-secondary"
              onClick={handleProbarImpresora}
              disabled={conectando || !isBluetoothSupported}
            >
              <Bluetooth size={16} />
              {conectando ? 'Conectando...' : 'Probar conexión'}
            </button>
            <button
              className="config-impresora-btn config-impresora-btn-primary"
              onClick={handleSeleccionarImpresora}
              disabled={conectando || !isBluetoothSupported}
            >
              <Printer size={16} />
              Cambiar impresora
            </button>
            <button
              className="config-impresora-btn config-impresora-btn-danger"
              onClick={handleEliminarImpresora}
              disabled={guardando}
            >
              <X size={16} />
              Eliminar
            </button>
          </div>
            </div>
          ) : (
            <div className="config-impresora-sin-configurar">
          <div className="config-impresora-mensaje">
            <Bluetooth size={32} />
            <p>No hay impresora configurada</p>
            <p className="config-impresora-subtexto">
              Selecciona una impresora Bluetooth para usarla como predeterminada al imprimir recibos.
            </p>
          </div>
          <button
            className="config-impresora-btn config-impresora-btn-primary config-impresora-btn-large"
            onClick={handleSeleccionarImpresora}
            disabled={conectando || !isBluetoothSupported}
          >
            <Printer size={20} />
            {conectando ? 'Buscando impresoras...' : 'Seleccionar impresora'}
          </button>
            </div>
          )}
        </>
      )}

      {tipoImpresora === 'bluetooth' && dispositivosDisponibles.length > 0 && (
        <div className="config-impresora-dispositivos">
          <h4>Dispositivos previamente emparejados</h4>
          <ul>
            {dispositivosDisponibles.map(device => (
              <li key={device.id}>
                <Bluetooth size={16} />
                <span>{device.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Sección de Cajón Monedero / Caja Registradora */}
      {impresoraConfigurada && (
        <div className="config-cajon-monedero">
          <div className="config-cajon-monedero-header">
            <Lock size={20} />
            <div>
              <h4>Cajón Monedero / Caja Registradora</h4>
              <p>Configura la apertura automática de tu cajón de dinero</p>
            </div>
          </div>

          <div className="config-cajon-monedero-options">
            {tipoImpresora === 'bluetooth' ? (
              <>
                <div className="config-cajon-option-toggle">
                  <label className="cajon-switch">
                    <input
                      type="checkbox"
                      checked={abrirCajonVenta}
                      onChange={handleToggleAbrirCajonVenta}
                    />
                    <span className="cajon-slider round"></span>
                  </label>
                  <div className="cajon-option-text">
                    <strong>Abrir automáticamente al registrar venta</strong>
                    <p>El cajón se abrirá inmediatamente al completar una venta, sin requerir impresión de recibo.</p>
                  </div>
                </div>

                <div className="config-cajon-option-toggle">
                  <label className="cajon-switch">
                    <input
                      type="checkbox"
                      checked={abrirCajonImpresion}
                      onChange={handleToggleAbrirCajonImpresion}
                    />
                    <span className="cajon-slider round"></span>
                  </label>
                  <div className="cajon-option-text">
                    <strong>Abrir al imprimir recibo</strong>
                    <p>El cajón se abrirá cada vez que imprimas un recibo térmico de venta.</p>
                  </div>
                </div>

                <div className="config-cajon-actions">
                  <button
                    className="config-impresora-btn config-impresora-btn-secondary"
                    onClick={handleProbarCajon}
                    disabled={abriendoCajon}
                  >
                    <span>🔑 Probar cajón monedero</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="config-cajon-monedero-info-other">
                <AlertCircle size={16} />
                <p>
                  Para impresoras de tipo <strong>{tipoImpresora === 'usb' ? 'USB' : tipoImpresora === 'wifi' ? 'WiFi' : 'Estándar'}</strong>, 
                  la apertura del cajón se realiza mediante la configuración propia del controlador (driver) de tu impresora en el panel de control de tu sistema operativo. 
                  Generalmente se encuentra en: <em>Propiedades de Impresora → Configuración de Dispositivo → Tipo de Unidad Periférica / Cajón Monedero</em>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfiguracionImpresora;
