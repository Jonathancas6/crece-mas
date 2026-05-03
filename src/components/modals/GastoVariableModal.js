import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCrearGastoVariable, useActualizarGastoVariable, useCategoriasGastos } from '../../hooks/useEgresos';
import { useProveedores } from '../../hooks/useEgresos';
import { useCurrencyInput } from '../../hooks/useCurrencyInput';
import './ProveedorModal.css';

// Categorías predefinidas comunes para negocios
const CATEGORIAS_PREDEFINIDAS = [
  'Alquiler',
  'Servicios Públicos',
  'Agua',
  'Luz',
  'Gas',
  'Internet',
  'Teléfono',
  'Nómina',
  'Salarios',
  'Seguros',
  'Impuestos',
  'Marketing',
  'Publicidad',
  'Mantenimiento',
  'Suministros de Oficina',
  'Limpieza',
  'Seguridad',
  'Software',
  'Suscripciones',
  'Transporte',
  'Logística',
  'Contabilidad',
  'Legal',
  'Servicios Profesionales',
  'Capacitación',
  'Eventos',
  'Donaciones',
  'Otros'
];

const gastoVariableSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(255, 'El nombre es muy largo'),
  descripcion: z.string().optional(),
  fecha: z.string().min(1, 'La fecha es requerida'),
  metodo_pago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'cheque', 'credito']).default('efectivo'),
  factura_numero: z.string().optional(),
  factura_fecha: z.string().optional(),
  comprobante_url: z.string().optional(),
  categoria_id: z.string().optional().or(z.literal('')),
  proveedor_id: z.string().uuid().optional().or(z.literal('')),
  orden_compra_id: z.string().uuid().optional().or(z.literal('')),
  notas: z.string().optional()
});

const GastoVariableModal = ({ open, onClose, gasto = null, aperturaActiva = null }) => {
  const { organization, user } = useAuth();
  const crearGastoVariable = useCrearGastoVariable();
  const actualizarGastoVariable = useActualizarGastoVariable();
  const { data: categorias = [] } = useCategoriasGastos(organization?.id, 'variable');
  const { data: proveedores = [] } = useProveedores(organization?.id, { activo: true });
  const montoInput = useCurrencyInput();
  
  // Extraer funciones estables del hook (ya están en useCallback)
  const setMontoValue = montoInput.setValue;
  const resetMonto = montoInput.reset;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset
  } = useForm({
    resolver: zodResolver(gastoVariableSchema),
    defaultValues: {
      nombre: '',
      descripcion: '',
      fecha: new Date().toISOString().split('T')[0],
      metodo_pago: 'efectivo',
      factura_numero: '',
      factura_fecha: '',
      comprobante_url: '',
      categoria_id: '',
      proveedor_id: '',
      orden_compra_id: '',
      notas: ''
    }
  });

  useEffect(() => {
    if (open) {
      if (gasto) {
        const montoInicial = gasto.monto?.toString() || '';
        setMontoValue(montoInicial);
        reset({
          nombre: gasto.nombre || '',
          descripcion: gasto.descripcion || '',
          fecha: gasto.fecha || new Date().toISOString().split('T')[0],
          metodo_pago: gasto.metodo_pago || 'efectivo',
          factura_numero: gasto.factura_numero || '',
          factura_fecha: gasto.factura_fecha || '',
          comprobante_url: gasto.comprobante_url || '',
          categoria_id: gasto.categoria_id || '',
          proveedor_id: gasto.proveedor_id || '',
          orden_compra_id: gasto.orden_compra_id || '',
          notas: gasto.notas || ''
        });
      } else {
        resetMonto();
        reset({
          nombre: '',
          descripcion: '',
          fecha: new Date().toISOString().split('T')[0],
          metodo_pago: 'efectivo',
          factura_numero: '',
          factura_fecha: '',
          comprobante_url: '',
          categoria_id: '',
          proveedor_id: '',
          orden_compra_id: '',
          notas: ''
        });
      }
    }
  }, [open, gasto, reset, setMontoValue, resetMonto]);

  // Función optimizada para manejar input de monto
  const handleMontoChange = (e) => {
    montoInput.handleChange(e);
    // No llamamos setValue porque monto no está registrado en el formulario
  };

  const onSubmit = async (data) => {
    try {
      // Validar monto manualmente ya que no está registrado en el formulario
      if (!montoInput.displayValue || montoInput.numericValue <= 0) {
        throw new Error('El monto es requerido');
      }
      // Si la categoría es un texto (categoría predefinida), buscar si existe o guardarla en notas
      let categoriaId = data.categoria_id || null;
      let notasFinal = data.notas || null;
      
      // Si es un texto (no UUID), buscar si existe la categoría con ese nombre
      if (categoriaId && !categoriaId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        // Es una categoría predefinida (texto)
        const nombreCategoria = categoriaId;
        // Buscar si ya existe una categoría con ese nombre
        const categoriaExistente = categorias.find(cat => cat.nombre.toLowerCase() === nombreCategoria.toLowerCase());
        if (categoriaExistente) {
          categoriaId = categoriaExistente.id;
        } else {
          // Si no existe, guardar el nombre como texto en notas
          categoriaId = null;
          // Agregar la categoría a las notas si no está vacía
          notasFinal = notasFinal 
            ? `${notasFinal}\nCategoría: ${nombreCategoria}`
            : `Categoría: ${nombreCategoria}`;
        }
      }
      
      // Obtener el valor numérico del input de moneda
      const monto = montoInput.numericValue || parseFloat(data.monto.toString().replace(/\./g, '')) || 0;
      
      const gastoData = {
        ...data,
        organization_id: organization.id,
        user_id: aperturaActiva?.user_id || user.id,
        employee_id: aperturaActiva?.employee_id || null,
        monto: monto,
        fecha: data.fecha,
        factura_fecha: data.factura_fecha || null,
        categoria_id: categoriaId,
        proveedor_id: data.proveedor_id || null,
        orden_compra_id: data.orden_compra_id || null,
        descripcion: data.descripcion || null,
        factura_numero: data.factura_numero || null,
        comprobante_url: data.comprobante_url || null,
        notas: notasFinal
      };

      if (gasto) {
        await actualizarGastoVariable.mutateAsync({
          id: gasto.id,
          updates: gastoData
        });
      } else {
        await crearGastoVariable.mutateAsync(gastoData);
      }

      onClose();
    } catch (error) {
      console.error('Error al guardar gasto variable:', error);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content proveedor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{gasto ? 'Editar Gasto Variable' : 'Nuevo Gasto Variable'}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="modal-form">
          <div className="form-section">
            <h3>Información Básica</h3>
            
            <div className="form-group">
              <label htmlFor="nombre">Nombre *</label>
              <input
                id="nombre"
                type="text"
                {...register('nombre')}
                className={errors.nombre ? 'error' : ''}
                placeholder="Descripción del gasto"
              />
              {errors.nombre && <span className="error-message">{errors.nombre.message}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="descripcion">Descripción</label>
              <textarea
                id="descripcion"
                {...register('descripcion')}
                rows="2"
                placeholder="Descripción detallada del gasto"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="monto">Monto *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem', color: '#6b7280' }}>$</span>
                  <input
                    id="monto"
                    type="text"
                    value={montoInput.displayValue}
                    onChange={handleMontoChange}
                    className={errors.monto ? 'error' : ''}
                    placeholder="0"
                    style={{ flex: 1 }}
                    autoComplete="off"
                  />
                </div>
                {errors.monto && <span className="error-message">{errors.monto.message}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="fecha">Fecha *</label>
                <input
                  id="fecha"
                  type="date"
                  {...register('fecha')}
                  className={errors.fecha ? 'error' : ''}
                />
                {errors.fecha && <span className="error-message">{errors.fecha.message}</span>}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="metodo_pago">Método de Pago</label>
              <select id="metodo_pago" {...register('metodo_pago')}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="cheque">Cheque</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
          </div>

          <div className="form-section">
            <h3>Facturación</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="factura_numero">Número de Factura</label>
                <input
                  id="factura_numero"
                  type="text"
                  {...register('factura_numero')}
                  placeholder="Número de factura"
                />
              </div>

              <div className="form-group">
                <label htmlFor="factura_fecha">Fecha de Factura</label>
                <input
                  id="factura_fecha"
                  type="date"
                  {...register('factura_fecha')}
                />
              </div>
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
          </div>

          <div className="form-section">
            <h3>Clasificación</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="categoria_id">Categoría</label>
                <select id="categoria_id" {...register('categoria_id')}>
                  <option value="">Sin categoría</option>
                  <optgroup label="Categorías Comunes">
                    {CATEGORIAS_PREDEFINIDAS.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </optgroup>
                  {categorias.length > 0 && (
                    <optgroup label="Categorías Personalizadas">
                      {categorias.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="proveedor_id">Proveedor</label>
                <select id="proveedor_id" {...register('proveedor_id')}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map(prov => (
                    <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="notas">Notas</label>
              <textarea
                id="notas"
                {...register('notas')}
                rows="3"
                placeholder="Notas adicionales"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : gasto ? 'Actualizar' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GastoVariableModal;
