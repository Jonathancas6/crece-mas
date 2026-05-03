import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCrearPagoProveedor, useCreditosProveedores, useCrearGastoVariable, useCategoriasGastos } from '../../hooks/useEgresos';
import { useCurrencyInput } from '../../hooks/useCurrencyInput';
import './ProveedorModal.css';

const pagoProveedorSchema = z.object({
  credito_proveedor_id: z.string().uuid('Debes seleccionar un crédito'),
  monto: z.string().min(1, 'El monto es requerido'),
  metodo_pago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque']).default('transferencia'),
  fecha_pago: z.string().min(1, 'La fecha es requerida'),
  numero_comprobante: z.string().optional(),
  comprobante_url: z.string().optional(),
  notas: z.string().optional()
});

const PagoProveedorModal = ({ open, onClose, creditoId = null, aperturaActiva = null }) => {
  const { organization, user } = useAuth();
  const crearPagoProveedor = useCrearPagoProveedor();
  const crearGastoVariable = useCrearGastoVariable();
  const { data: creditos = [] } = useCreditosProveedores(organization?.id, {
    estado: creditoId ? undefined : 'pendiente' // Si hay creditoId, mostrar todos, sino solo pendientes
  });
  const { data: categorias = [] } = useCategoriasGastos(organization?.id, 'variable');
  const montoInput = useCurrencyInput();
  const [registrarEnEgresos, setRegistrarEnEgresos] = useState(true);
  
  // Extraer funciones estables del hook (ya están en useCallback)
  const setMontoValue = montoInput.setValue;
  const resetMonto = montoInput.reset;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue
  } = useForm({
    resolver: zodResolver(pagoProveedorSchema),
    defaultValues: {
      credito_proveedor_id: creditoId || '',
      monto: '',
      metodo_pago: 'transferencia',
      fecha_pago: new Date().toISOString().split('T')[0],
      numero_comprobante: '',
      comprobante_url: '',
      notas: ''
    }
  });

  const creditoSeleccionado = watch('credito_proveedor_id');
  const credito = creditos.find(c => c.id === creditoSeleccionado);

  useEffect(() => {
    if (open) {
      resetMonto();
      reset({
        credito_proveedor_id: creditoId || '',
        monto: '',
        metodo_pago: 'transferencia',
        fecha_pago: new Date().toISOString().split('T')[0],
        numero_comprobante: '',
        comprobante_url: '',
        notas: ''
      });
    }
  }, [open, creditoId, reset, resetMonto]);

  // Si hay un crédito seleccionado, establecer el monto pendiente como sugerencia
  useEffect(() => {
    if (credito && credito.monto_pendiente > 0) {
      const currentValues = watch();
      const montoPendiente = credito.monto_pendiente.toString();
      setMontoValue(montoPendiente);
      reset({
        ...currentValues,
        monto: montoPendiente
      });
    }
  }, [credito, reset, watch, setMontoValue]);

  const onSubmit = async (data) => {
    try {
      // Obtener el valor numérico del input de moneda
      const monto = montoInput.numericValue || parseFloat(data.monto.toString().replace(/\./g, '')) || 0;
      
      if (monto <= 0) {
        alert('El monto debe ser mayor a cero');
        return;
      }

      if (credito && monto > credito.monto_pendiente) {
        if (!window.confirm(`El monto (${monto.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}) es mayor al pendiente (${credito.monto_pendiente.toLocaleString('es-CO', { style: 'currency', currency: 'COP' })}). ¿Deseas continuar?`)) {
          return;
        }
      }

      const pagoData = {
        organization_id: organization.id,
        credito_proveedor_id: data.credito_proveedor_id,
        monto: monto,
        metodo_pago: data.metodo_pago,
        fecha_pago: data.fecha_pago,
        numero_comprobante: data.numero_comprobante || null,
        comprobante_url: data.comprobante_url || null,
        notas: data.notas || null,
        user_id: aperturaActiva?.user_id || user.id,
        employee_id: aperturaActiva?.employee_id || null
      };

      await crearPagoProveedor.mutateAsync(pagoData);

      // Si se debe registrar en egresos y hay un crédito con proveedor
      if (registrarEnEgresos && credito) {
        // Obtener proveedor_id del crédito (puede venir directamente o en el objeto proveedor)
        const proveedorId = credito.proveedor_id || credito.proveedor?.id;
        
        if (proveedorId) {
          try {
            // Buscar categoría "Pagos a Proveedores" o usar "Otros"
            let categoriaId = null;
            const categoriaPagos = categorias.find(cat => 
              cat.nombre.toLowerCase().includes('proveedor') || 
              cat.nombre.toLowerCase().includes('pago')
            );
            if (categoriaPagos) {
              categoriaId = categoriaPagos.id;
            }

            // Crear gasto variable para el pago
            const gastoData = {
              organization_id: organization.id,
              nombre: `Pago a Proveedor: ${credito.proveedor?.nombre || 'Proveedor'}`,
              descripcion: `Pago de crédito${credito.factura_numero ? ` - Factura: ${credito.factura_numero}` : ''}${data.numero_comprobante ? ` - Comprobante: ${data.numero_comprobante}` : ''}`,
              monto: monto,
              fecha: data.fecha_pago,
              metodo_pago: data.metodo_pago,
              factura_numero: credito.factura_numero || data.numero_comprobante || null,
              factura_fecha: credito.fecha_emision || null,
              comprobante_url: data.comprobante_url || null,
              categoria_id: categoriaId,
              proveedor_id: proveedorId,
              orden_compra_id: credito.orden_compra_id || null,
              notas: data.notas || `Pago de crédito a proveedor${credito.factura_numero ? ` - Factura: ${credito.factura_numero}` : ''}`,
              user_id: aperturaActiva?.user_id || user.id,
              employee_id: aperturaActiva?.employee_id || null
            };

            await crearGastoVariable.mutateAsync(gastoData);
          } catch (gastoError) {
            console.error('Error al registrar gasto variable:', gastoError);
            // No fallar el proceso si el gasto variable falla, solo mostrar advertencia
            alert('El pago se registró correctamente, pero hubo un error al registrarlo en egresos. Puedes registrarlo manualmente si es necesario.');
          }
        }
      }

      onClose();
    } catch (error) {
      console.error('Error al registrar pago:', error);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content proveedor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Registrar Pago a Proveedor</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="modal-form">
          <div className="form-section">
            <h3>Información del Crédito</h3>
            
            <div className="form-group">
              <label htmlFor="credito_proveedor_id">Crédito *</label>
              <select 
                id="credito_proveedor_id" 
                {...register('credito_proveedor_id')}
                className={errors.credito_proveedor_id ? 'error' : ''}
                disabled={!!creditoId}
              >
                <option value="">Seleccionar crédito</option>
                {creditos
                  .filter(c => !creditoId || c.id === creditoId)
                  .map(cred => (
                    <option key={cred.id} value={cred.id}>
                      {cred.proveedor?.nombre || 'Proveedor'} - 
                      Pendiente: {cred.monto_pendiente.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
                      {cred.factura_numero && ` - Factura: ${cred.factura_numero}`}
                    </option>
                  ))}
              </select>
              {errors.credito_proveedor_id && <span className="error-message">{errors.credito_proveedor_id.message}</span>}
            </div>

            {credito && (
              <div style={{ 
                padding: '1rem', 
                background: '#f3f4f6', 
                borderRadius: '8px', 
                marginTop: '1rem' 
              }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>Información del Crédito:</p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                  <strong>Total:</strong> {credito.monto_total.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
                </p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                  <strong>Pagado:</strong> {credito.monto_pagado.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
                </p>
                <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: '#dc2626', fontWeight: 600 }}>
                  <strong>Pendiente:</strong> {credito.monto_pendiente.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
                </p>
              </div>
            )}
          </div>

          <div className="form-section">
            <h3>Información del Pago</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="monto">Monto *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem', color: '#6b7280' }}>$</span>
                  <input
                    id="monto"
                    type="text"
                    value={montoInput.displayValue}
                    onChange={(e) => {
                      montoInput.handleChange(e);
                      setValue('monto', montoInput.displayValue, { shouldValidate: true });
                    }}
                    onBlur={() => {
                      setValue('monto', montoInput.displayValue, { shouldValidate: true });
                    }}
                    className={errors.monto ? 'error' : ''}
                    placeholder="0"
                    style={{ flex: 1 }}
                  />
                </div>
                {errors.monto && <span className="error-message">{errors.monto.message}</span>}
                {credito && credito.monto_pendiente > 0 && (
                  <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                    Pendiente: {credito.monto_pendiente.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}
                  </small>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="metodo_pago">Método de Pago *</label>
                <select id="metodo_pago" {...register('metodo_pago')}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="fecha_pago">Fecha de Pago *</label>
              <input
                id="fecha_pago"
                type="date"
                {...register('fecha_pago')}
                className={errors.fecha_pago ? 'error' : ''}
              />
              {errors.fecha_pago && <span className="error-message">{errors.fecha_pago.message}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="numero_comprobante">Número de Comprobante</label>
              <input
                id="numero_comprobante"
                type="text"
                {...register('numero_comprobante')}
                placeholder="Número de comprobante de pago"
              />
            </div>

            <div className="form-group">
              <label htmlFor="comprobante_url">URL del Comprobante</label>
              <input
                id="comprobante_url"
                type="url"
                {...register('comprobante_url')}
                placeholder="https://..."
              />
              <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                URL del comprobante escaneado o subido
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="notas">Notas</label>
              <textarea
                id="notas"
                {...register('notas')}
                rows="3"
                placeholder="Notas adicionales sobre el pago"
              />
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={registrarEnEgresos}
                  onChange={(e) => setRegistrarEnEgresos(e.target.checked)}
                />
                <span>Registrar este pago en Egresos (Gastos Variables)</span>
              </label>
              <small style={{ color: '#6b7280', fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>
                Si está marcado, el pago se registrará automáticamente como un gasto variable en la sección de Egresos
              </small>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Registrando...' : 'Registrar Pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PagoProveedorModal;
