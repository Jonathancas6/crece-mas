import React, { useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import FeatureGuard from '../../components/FeatureGuard';
import { useClientes, useCrearCliente, useActualizarCliente, useEliminarCliente } from '../../hooks/useClientes';
import { Plus, Edit2, Trash2, X, User, Phone, Mail, MapPin, FileText, Search } from 'lucide-react';
import './Clientes.css';

export default function Clientes() {
  const { organization } = useAuth();
  const { data: clientes = [], isLoading } = useClientes(organization?.id);
  const crearClienteMutation = useCrearCliente();
  const actualizarClienteMutation = useActualizarCliente();
  const eliminarClienteMutation = useEliminarCliente();

  const [searchQuery, setSearchQuery] = useState('');
  const [mostrandoModal, setMostrandoModal] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '',
    documento: '',
    telefono: '',
    email: '',
    direccion: '',
    notas: ''
  });


  // Filtrar clientes según búsqueda
  const clientesFiltrados = useMemo(() => {
    if (!searchQuery.trim()) return clientes;

    const query = searchQuery.toLowerCase();
    return clientes.filter(cliente =>
      cliente.nombre?.toLowerCase().includes(query) ||
      cliente.documento?.toLowerCase().includes(query) ||
      cliente.telefono?.toLowerCase().includes(query) ||
      cliente.email?.toLowerCase().includes(query)
    );
  }, [clientes, searchQuery]);

  const abrirModalNuevo = () => {
    setClienteEditando(null);
    setFormData({
      nombre: '',
      documento: '',
      telefono: '',
      email: '',
      direccion: '',
      notas: ''
    });
    setMostrandoModal(true);
  };

  const abrirModalEditar = (cliente) => {
    setClienteEditando(cliente);
    setFormData({
      nombre: cliente.nombre || '',
      documento: cliente.documento || '',
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      direccion: cliente.direccion || '',
      notas: cliente.notas || ''
    });
    setMostrandoModal(true);
  };

  const cerrarModal = () => {
    setMostrandoModal(false);
    setClienteEditando(null);
    setFormData({
      nombre: '',
      documento: '',
      telefono: '',
      email: '',
      direccion: '',
      notas: ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      return;
    }

    try {
      const clienteData = {
        organization_id: organization.id,
        ...formData
      };

      if (clienteEditando) {
        await actualizarClienteMutation.mutateAsync({
          id: clienteEditando.id,
          updates: clienteData
        });
      } else {
        await crearClienteMutation.mutateAsync(clienteData);
      }

      cerrarModal();
    } catch (error) {
      console.error('Error al guardar cliente:', error);
    }
  };

  const handleEliminar = async (cliente) => {
    if (!window.confirm(`¿Estás seguro de eliminar al cliente "${cliente.nombre}"?`)) {
      return;
    }

    try {
      await eliminarClienteMutation.mutateAsync({
        id: cliente.id,
        organizationId: organization.id
      });
    } catch (error) {
      console.error('Error al eliminar cliente:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="clientes-container">
        <div className="clientes-loading">
          <p>Cargando clientes...</p>
        </div>
      </div>
    );
  }

  return (
    <FeatureGuard
      feature="clientsModule"
      recommendedPlan="professional"
      showInline={false}
    >
      <div className="clientes-container">
        <div className="clientes-header">
          <div className="clientes-header-top">
            <h1 className="clientes-title">Clientes</h1>
            <div className="clientes-header-actions">
              <button
                className="clientes-btn-nuevo"
                onClick={abrirModalNuevo}
              >
                <Plus size={20} />
                <span>Nuevo Cliente</span>
              </button>
            </div>
          </div>

          <div className="clientes-search">
            <Search size={18} className="clientes-search-icon-outside" />
            <input
              type="text"
              placeholder="Buscar por nombre, documento, teléfono o email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="clientes-search-input"
            />
          </div>
        </div>

        <div className="clientes-content">
          {clientesFiltrados.length === 0 ? (
            <div className="clientes-empty">
              {searchQuery ? (
                <>
                  <p>No se encontraron clientes que coincidan con tu búsqueda.</p>
                  <button
                    className="clientes-btn-nuevo"
                    onClick={abrirModalNuevo}
                  >
                    <Plus size={20} />
                    <span>Crear Nuevo Cliente</span>
                  </button>
                </>
              ) : (
                <>
                  <User size={48} className="clientes-empty-icon" />
                  <p>No tienes clientes registrados aún.</p>
                  <button
                    className="clientes-btn-nuevo"
                    onClick={abrirModalNuevo}
                  >
                    <Plus size={20} />
                    <span>Crear Primer Cliente</span>
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="clientes-tabla-container">
              <table className="clientes-tabla">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Documento</th>
                    <th>Teléfono</th>
                    <th>Email</th>
                    <th>Dirección</th>
                    <th>Notas</th>
                    <th className="acciones-header">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.map(cliente => {
                    const initials = cliente.nombre ? cliente.nombre.substring(0, 2).toUpperCase() : 'CL';
                    return (
                      <tr key={cliente.id}>
                        <td>
                          <div className="cliente-col-nombre">
                            <div className="cliente-tabla-avatar">{initials}</div>
                            <span className="cliente-tabla-nombre-txt">{cliente.nombre}</span>
                          </div>
                        </td>
                        <td>{cliente.documento || '-'}</td>
                        <td>{cliente.telefono || '-'}</td>
                        <td>{cliente.email || '-'}</td>
                        <td>{cliente.direccion || '-'}</td>
                        <td className="cliente-col-notas" title={cliente.notas}>
                          {cliente.notas || '-'}
                        </td>
                        <td>
                          <div className="cliente-tabla-acciones">
                            <button
                              className="cliente-btn-edit"
                              onClick={() => abrirModalEditar(cliente)}
                              title="Editar cliente"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              className="cliente-btn-delete"
                              onClick={() => handleEliminar(cliente)}
                              title="Eliminar cliente"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal de Crear/Editar Cliente */}
        {mostrandoModal && (
          <div className="clientes-modal-overlay" onClick={cerrarModal}>
            <div className="clientes-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="clientes-modal-header">
                <h2>{clienteEditando ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
                <button
                  className="clientes-modal-close"
                  onClick={cerrarModal}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="clientes-form">
                <div className="clientes-form-group">
                  <label>Nombre *</label>
                  <div className="clientes-input-wrapper">
                    <User size={18} className="clientes-input-icon" />
                    <input
                      type="text"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="Nombre completo del cliente"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <div className="clientes-form-group">
                  <label>Documento</label>
                  <div className="clientes-input-wrapper">
                    <FileText size={18} className="clientes-input-icon" />
                    <input
                      type="text"
                      value={formData.documento}
                      onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
                      placeholder="Cédula, NIT o pasaporte"
                    />
                  </div>
                </div>

                <div className="clientes-form-group">
                  <label>Teléfono</label>
                  <div className="clientes-input-wrapper">
                    <Phone size={18} className="clientes-input-icon" />
                    <input
                      type="tel"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                      placeholder="Teléfono móvil o fijo"
                    />
                  </div>
                </div>

                <div className="clientes-form-group">
                  <label>Email</label>
                  <div className="clientes-input-wrapper">
                    <Mail size={18} className="clientes-input-icon" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="correo@ejemplo.com"
                    />
                  </div>
                </div>

                <div className="clientes-form-group">
                  <label>Dirección</label>
                  <div className="clientes-input-wrapper alignment-textarea">
                    <MapPin size={18} className="clientes-input-icon textarea-icon" />
                    <textarea
                      value={formData.direccion}
                      onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                      placeholder="Dirección de residencia o negocio"
                      rows={3}
                    />
                  </div>
                </div>

                <div className="clientes-form-group">
                  <label>Notas</label>
                  <div className="clientes-input-wrapper alignment-textarea">
                    <FileText size={18} className="clientes-input-icon textarea-icon" />
                    <textarea
                      value={formData.notas}
                      onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                      placeholder="Notas o comentarios adicionales..."
                      rows={3}
                    />
                  </div>
                </div>

                <div className="clientes-modal-footer">
                  <button
                    type="button"
                    className="clientes-btn-cancelar"
                    onClick={cerrarModal}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="clientes-btn-guardar"
                    disabled={crearClienteMutation.isLoading || actualizarClienteMutation.isLoading}
                  >
                    {crearClienteMutation.isLoading || actualizarClienteMutation.isLoading
                      ? 'Guardando...'
                      : clienteEditando
                        ? 'Actualizar'
                        : 'Crear Cliente'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </FeatureGuard>
  );
}
