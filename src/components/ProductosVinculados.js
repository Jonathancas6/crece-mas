// Componente para vincular productos del stock a otro producto
import React, { useState, useEffect } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { supabase } from '../services/api/supabaseClient';
import { useAuth } from '../context/AuthContext';
import './ProductosVinculados.css';

const ProductosVinculados = ({ productosVinculados = [], onChange, organizationId }) => {
  const { organization } = useAuth();
  const [productosDisponibles, setProductosDisponibles] = useState([]);
  const [mostrandoSelector, setMostrandoSelector] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [esPorcion, setEsPorcion] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(false);

  // Cargar productos con búsqueda debounced
  useEffect(() => {
    const orgId = organizationId || organization.id;
    if (!orgId || !mostrandoSelector) return;

    const cargarProductos = async () => {
      setCargando(true);
      try {
        let query = supabase
          .from('productos')
          .select('id, nombre, codigo, stock, precio_venta')
          .eq('organization_id', orgId)
          .not('stock', 'is', null)
          .gt('stock', 0)
          .order('nombre', { ascending: true })
          .limit(50); // Mostrar solo los primeros 50 que coincidan

        if (busqueda.trim()) {
          // Búsqueda por nombre o código
          query = query.or(`nombre.ilike.%${busqueda}%,codigo.ilike.%${busqueda}%`);
        }

        const { data, error } = await query;

        if (error) throw error;
        setProductosDisponibles(data || []);
      } catch (error) {
        console.error('Error cargando productos:', error);
      } finally {
        setCargando(false);
      }
    };

    // Debounce de 300ms
    const timeout = setTimeout(cargarProductos, 300);
    return () => clearTimeout(timeout);
  }, [organizationId, organization?.id, busqueda, mostrandoSelector]);

  // Filtrar solo los ya vinculados (la búsqueda ya se hizo en el servidor)
  const productosDisponiblesParaVincular = productosDisponibles.filter(
    p => !productosVinculados.some(v => v.producto_id === p.id)
  );

  const handleAgregar = () => {
    if (!productoSeleccionado) return;

    const nuevoVinculo = {
      producto_id: productoSeleccionado.id,
      producto_nombre: productoSeleccionado.nombre,
      cantidad: parseFloat(cantidad) || 1,
      es_porcion: esPorcion
    };

    onChange([...productosVinculados, nuevoVinculo]);
    setProductoSeleccionado(null);
    setCantidad(1);
    setEsPorcion(false);
    setMostrandoSelector(false);
    setBusqueda('');
  };

  const handleEliminar = (index) => {
    const nuevos = productosVinculados.filter((_, i) => i !== index);
    onChange(nuevos);
  };

  return (
    <div className="productos-vinculados-container">
      <div className="productos-vinculados-header">
        <label className="productos-vinculados-label">
          Productos Vinculados
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '0.5rem' }}>
            (Se descontarán del stock al vender este producto)
          </span>
        </label>
        <button
          type="button"
          className="productos-vinculados-add-btn"
          onClick={() => setMostrandoSelector(true)}
        >
          <Plus size={16} />
          Agregar Producto
        </button>
      </div>

      {/* Lista de productos vinculados */}
      {productosVinculados.length > 0 && (
        <div className="productos-vinculados-list">
          {productosVinculados.map((vinculo, index) => {
            const producto = productosDisponibles.find(p => p.id === vinculo.producto_id);
            return (
              <div key={index} className="productos-vinculados-item">
                <div className="productos-vinculados-item-info">
                  <span className="productos-vinculados-item-nombre">
                    {vinculo.producto_nombre || producto?.nombre || 'Producto'}
                  </span>
                  <span className="productos-vinculados-item-details">
                    Cantidad: {vinculo.cantidad} {vinculo.es_porcion ? '(porción)' : '(unidad completa)'}
                  </span>
                </div>
                <button
                  type="button"
                  className="productos-vinculados-remove-btn"
                  onClick={() => handleEliminar(index)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal selector de producto */}
      {mostrandoSelector && (
        <div className="productos-vinculados-modal-overlay" onClick={() => setMostrandoSelector(false)}>
          <div className="productos-vinculados-modal" onClick={(e) => e.stopPropagation()}>
            <div className="productos-vinculados-modal-header">
              <h3>Vincular Producto</h3>
              <button
                type="button"
                className="productos-vinculados-modal-close"
                onClick={() => setMostrandoSelector(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="productos-vinculados-modal-content">
              <div style={{ marginBottom: '1rem' }}>
                <label>Buscar Producto</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="productos-vinculados-input"
                    placeholder="Escribe nombre o código..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    style={{ marginBottom: '0.5rem' }}
                  />
                </div>
              </div>

              <label>Seleccionar Resultado ({cargando ? 'Buscando...' : productosDisponiblesParaVincular.length})</label>
              <select
                className="productos-vinculados-select"
                value={productoSeleccionado?.id || ''}
                onChange={(e) => {
                  const producto = productosDisponibles.find(p => p.id === e.target.value);
                  setProductoSeleccionado(producto || null);
                }}
              >
                <option value="">-- Seleccione un producto --</option>
                {productosDisponiblesParaVincular.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.codigo ? `(${p.codigo})` : ''} - Stock: {p.stock}
                  </option>
                ))}
              </select>

              {productoSeleccionado && (
                <>
                  <label style={{ marginTop: '1rem' }}>Cantidad</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className="productos-vinculados-input"
                    placeholder="Ej: 1 o 0.5"
                  />

                  <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      id="es_porcion"
                      checked={esPorcion}
                      onChange={(e) => setEsPorcion(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <label htmlFor="es_porcion" style={{ cursor: 'pointer', fontSize: '0.9rem' }}>
                      Es una porción (descontar fracción del stock)
                    </label>
                  </div>

                  {esPorcion && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      Ejemplo: Si cantidad es 0.5, se descontará media unidad del stock
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="productos-vinculados-modal-actions">
              <button
                type="button"
                className="productos-vinculados-btn-secondary"
                onClick={() => {
                  setMostrandoSelector(false);
                  setProductoSeleccionado(null);
                  setCantidad(1);
                  setEsPorcion(false);
                  setBusqueda('');
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="productos-vinculados-btn-primary"
                onClick={handleAgregar}
                disabled={!productoSeleccionado || !cantidad || parseFloat(cantidad) <= 0}
              >
                Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductosVinculados;
