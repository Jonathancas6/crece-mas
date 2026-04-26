import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import FeatureGuard from '../../components/FeatureGuard';
import { useClientes, useCrearCliente, useActualizarCliente, useEliminarCliente } from '../../hooks/useClientes';
import { Plus, Edit2, Trash2, X, User, Phone, Mail, MapPin, FileText, Search } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import './Clientes.css';

export default function Clientes() {
  const { organization } = useAuth();
  const { data: clientes = [], isLoading } = useClientes(organization?.id);
  const crearClienteMutation = useCrearCliente();
  const actualizarClienteMutation = useActualizarCliente();
  const eliminarClienteMutation = useEliminarCliente();
  const { isOnline } = useNetworkStatus();
  const { isSyncing } = useOfflineSync();

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
          <div className="clientes-grid">
            {clientesFiltrados.map(cliente => (
              <div key={cliente.id} className="cliente-card">
                <div className="cliente-card-header">
                  <div className="cliente-avatar">
                    <User size={24} />
                  </div>
                  <div className="cliente-actions">
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
                </div>
                
                <div className="cliente-card-body">
                  <h3 className="cliente-nombre">{cliente.nombre}</h3>
                  
                  {cliente.documento && (
                    <div className="cliente-info-item">
                      <FileText size={16} />
                      <span>{cliente.documento}</span>
                    </div>
                  )}
                  
                  {cliente.telefono && (
                    <div className="cliente-info-item">
                      <Phone size={16} />
                      <span>{cliente.telefono}</span>
                    </div>
                  )}
                  
                  {cliente.email && (
                    <div className="cliente-info-item">
                      <Mail size={16} />
                      <span>{cliente.email}</span>
                    </div>
                  )}
                  
                  {cliente.direccion && (
                    <div className="cliente-info-item">
                      <MapPin size={16} />
                      <span>{cliente.direccion}</span>
                    </div>
                  )}
                  
                  {cliente.notas && (
                    <div className="cliente-notas">
                      <p>{cliente.notas}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
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
                <input
                  type="text"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Nombre completo"
                  required
                  autoFocus
                />
              </div>

              <div className="clientes-form-group">
                <label>Documento</label>
                <input
                  type="text"
                  value={formData.documento}
                  onChange={(e) => setFormData({ ...formData, documento: e.target.value })}
                  placeholder="Cédula, NIT, etc."
                />
              </div>

              <div className="clientes-form-row">
                <div className="clientes-form-group">
                  <label>Teléfono</label>
                  <input
                    type="tel"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                    placeholder="Teléfono de contacto"
                  />
                </div>

                <div className="clientes-form-group">
                  <label>Email</label>
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
                <textarea
                  value={formData.direccion}
                  onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                  placeholder="Dirección"
                  rows={3}
                />
              </div>

              <div className="clientes-form-group">
                <label>Notas</label>
                <textarea
                  value={formData.notas}
                  onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                  placeholder="Notas adicionales sobre el cliente"
                  rows={3}
                />
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
