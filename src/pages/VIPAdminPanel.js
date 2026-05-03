import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Crown,
  Building2,
  Users,
  Search,
  Filter,
  ArrowLeft,
  Check,
  X,
  Edit2,
  AlertTriangle,
  TrendingUp,
  Calendar,
  DollarSign,
  Package,
  Sparkles,
  Shield,
  Zap,
  RefreshCw,
  Clock
} from 'lucide-react';
import { supabase } from '../services/api/supabaseClient';
import toast from 'react-hot-toast';
import LottieLoader from '../components/ui/LottieLoader';
import './VIPAdminPanel.css';

const VIPAdminPanel = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState([]);
  const [filteredOrgs, setFilteredOrgs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [procesando, setProcesando] = useState(false);
  
  // Planes disponibles (cargados desde la DB)
  const [availablePlans, setAvailablePlans] = useState([]);
  
  // Form data para modal
  const [formData, setFormData] = useState({
    plan_id: '',
    status: 'active',
    current_period_start: new Date().toISOString().split('T')[0],
    current_period_end: '',
    billing_cycle: 'monthly' // Solo para UI, no se guarda
  });

  useEffect(() => {
    loadPlans();
    loadOrganizations();
  }, []);

  useEffect(() => {
    filterOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterPlan, organizations]);

  // Cargar planes desde subscription_plans
  const loadPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;

      setAvailablePlans(data || []);
      
      // Setear el plan por defecto
      if (data && data.length > 0) {
        const professionalPlan = data.find(p => p.slug === 'professional');
        if (professionalPlan) {
          setFormData(prev => ({ ...prev, plan_id: professionalPlan.id }));
        }
      }
    } catch (error) {
      console.error('Error loading plans:', error);
      toast.error('Error al cargar planes');
    }
  };

  const loadOrganizations = async () => {
    try {
      setLoading(true);

      // Obtener todas las organizaciones
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (orgsError) throw orgsError;

      // Para cada organización, obtener su suscripción y estadísticas
      const orgsWithData = await Promise.all(
        orgs.map(async (org) => {
          // Suscripción con JOIN a subscription_plans
          const { data: subscription } = await supabase
            .from('subscriptions')
            .select(`
              *,
              plan:subscription_plans(*)
            `)
            .eq('organization_id', org.id)
            .eq('status', 'active')
            .maybeSingle();

          // Miembros del equipo
          const { data: members } = await supabase
            .from('team_members')
            .select('id')
            .eq('organization_id', org.id)
            .eq('status', 'active');

          // Productos (con manejo de error si la tabla no existe)
          const { data: products, error: productsError } = await supabase
            .from('productos')
            .select('id')
            .eq('organization_id', org.id);

          // Ventas del último mes (con manejo de error si la tabla no existe)
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
          
          const { data: sales, error: salesError } = await supabase
            .from('ventas')
            .select('id')
            .eq('organization_id', org.id)
            .gte('created_at', oneMonthAgo.toISOString());

          // Última actividad (última venta registrada)
          const { data: lastActivityData, error: lastActivityError } = await supabase
            .from('ventas')
            .select('created_at')
            .eq('organization_id', org.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const lastActivity = !lastActivityError && lastActivityData ? lastActivityData.created_at : null;

          return {
            ...org,
            subscription: subscription ? {
              ...subscription,
              plan: subscription.plan // El plan completo viene del JOIN
            } : null,
            stats: {
              members: (members?.length || 0) + 1, // +1 por el owner
              products: productsError ? 0 : (products?.length || 0),
              sales: salesError ? 0 : (sales?.length || 0),
              lastActivity: lastActivity
            }
          };
        })
      );

      setOrganizations(orgsWithData);
      setFilteredOrgs(orgsWithData);
    } catch (error) {
      console.error('Error loading organizations:', error);
      toast.error('Error al cargar organizaciones');
    } finally {
      setLoading(false);
    }
  };

  const filterOrganizations = () => {
    let filtered = [...organizations];

    // Filtrar por búsqueda
    if (searchTerm) {
      filtered = filtered.filter(org =>
        org.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtrar por plan
    if (filterPlan !== 'all') {
      filtered = filtered.filter(org => {
        if (filterPlan === 'none') {
          return !org.subscription;
        }
        return org.subscription?.plan?.slug === filterPlan;
      });
    }

    setFilteredOrgs(filtered);
  };

  const calculatePeriodEnd = (startDate, billingCycle) => {
    const start = new Date(startDate);
    const end = new Date(start);
    
    if (billingCycle === 'yearly') {
      end.setFullYear(end.getFullYear() + 1);
    } else {
      end.setMonth(end.getMonth() + 1);
    }
    
    return end.toISOString().split('T')[0];
  };

  const handleSaveSubscription = async () => {
    if (!selectedOrg) return;

    try {
      setProcesando(true);

      // Calcular current_period_end basado en el ciclo de facturación
      const periodEnd = calculatePeriodEnd(
        formData.current_period_start,
        formData.billing_cycle
      );

      const subscriptionData = {
        organization_id: selectedOrg.id,
        plan_id: formData.plan_id,
        status: formData.status,
        current_period_start: formData.current_period_start,
        current_period_end: periodEnd
      };

      if (selectedOrg.subscription) {
        // Actualizar suscripción existente
        const { error } = await supabase
          .from('subscriptions')
          .update(subscriptionData)
          .eq('id', selectedOrg.subscription.id);

        if (error) throw error;
        toast.success('Suscripción actualizada correctamente');
      } else {
        // Crear nueva suscripción
        const { error } = await supabase
          .from('subscriptions')
          .insert(subscriptionData);

        if (error) throw error;
        toast.success('Suscripción creada correctamente');
      }

      setShowModal(false);
      loadOrganizations();
    } catch (error) {
      console.error('Error saving subscription:', error);
      toast.error(error.message || 'Error al guardar suscripción');
    } finally {
      setProcesando(false);
    }
  };

  const handleEditSubscription = (org) => {
    setSelectedOrg(org);

    if (org.subscription) {
      setFormData({
        plan_id: org.subscription.plan_id,
        status: org.subscription.status,
        current_period_start: org.subscription.current_period_start?.split('T')[0] || new Date().toISOString().split('T')[0],
        current_period_end: org.subscription.current_period_end?.split('T')[0] || '',
        billing_cycle: 'monthly' // Valor por defecto
      });
    } else {
      // Usar el primer plan profesional como default
      const professionalPlan = availablePlans.find(p => p.slug === 'professional');
      setFormData({
        plan_id: professionalPlan?.id || availablePlans[0]?.id || '',
        status: 'active',
        current_period_start: new Date().toISOString().split('T')[0],
        current_period_end: '',
        billing_cycle: 'monthly'
      });
    }

    setShowModal(true);
  };

  // Obtener información del plan por ID
  const getPlanInfo = (planId) => {
    const plan = availablePlans.find(p => p.id === planId);
    return plan || { name: 'Desconocido', slug: 'unknown', price_monthly: 0 };
  };

  // Obtener color del plan por slug
  const getPlanColor = (slug) => {
    const colors = {
      free: '#8b5cf6',
      professional: '#10b981',
      enterprise: '#3b82f6',
      custom: '#f59e0b'
    };
    return colors[slug] || '#6b7280';
  };

  // Obtener ícono del plan por slug
  const getPlanIcon = (slug) => {
    const icons = {
      free: Package,
      professional: Zap,
      enterprise: Building2,
      custom: Crown
    };
    return icons[slug] || Package;
  };

  // Calcular estadísticas
  const stats = {
    totalOrgs: organizations.length,
    activeSubscriptions: organizations.filter(o => o.subscription?.status === 'active').length,
    premiumOrgs: organizations.filter(o => o.subscription?.plan?.slug !== 'free' && o.subscription).length,
    totalMRR: organizations
      .filter(o => o.subscription?.status === 'active' && o.subscription?.plan)
      .reduce((sum, o) => sum + (Number(o.subscription.plan.price_monthly) || 0), 0)
  };

  if (loading) {
    return (
      <div className="vip-admin-container">
        <LottieLoader />
      </div>
    );
  }

  return (
    <div className="vip-admin-container">
      {/* Header */}
      <motion.div
        className="vip-admin-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <button className="back-button" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={20} />
          Volver
        </button>

        <div className="header-content">
          <div className="header-title">
            <Crown className="title-crown" size={32} />
            <div>
              <h1>Panel VIP de Administración</h1>
              <p>Gestión de suscripciones y organizaciones</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          <motion.div className="stat-card" whileHover={{ scale: 1.02 }}>
            <div className="stat-icon" style={{ background: 'rgba(139, 92, 246, 0.2)' }}>
              <Building2 size={24} color="#8b5cf6" />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.totalOrgs}</span>
              <span className="stat-label">Organizaciones Totales</span>
            </div>
          </motion.div>

          <motion.div className="stat-card" whileHover={{ scale: 1.02 }}>
            <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.2)' }}>
              <Check size={24} color="#10b981" />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.activeSubscriptions}</span>
              <span className="stat-label">Suscripciones Activas</span>
            </div>
          </motion.div>

          <motion.div className="stat-card" whileHover={{ scale: 1.02 }}>
            <div className="stat-icon" style={{ background: 'rgba(59, 130, 246, 0.2)' }}>
              <Sparkles size={24} color="#3b82f6" />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.premiumOrgs}</span>
              <span className="stat-label">Organizaciones Premium</span>
            </div>
          </motion.div>

          <motion.div className="stat-card" whileHover={{ scale: 1.02 }}>
            <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.2)' }}>
              <DollarSign size={24} color="#f59e0b" />
            </div>
            <div className="stat-content">
              <span className="stat-value">${(stats.totalMRR / 1000).toFixed(0)}k</span>
              <span className="stat-label">MRR Total</span>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        className="vip-filters"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <div className="search-box">
          <Search size={20} />
          <input
            type="text"
            placeholder="Buscar organización..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-group">
          <Filter size={20} />
          <select value={filterPlan} onChange={(e) => setFilterPlan(e.target.value)}>
            <option value="all">Todos los planes</option>
            <option value="none">Sin suscripción</option>
            {availablePlans.map(plan => (
              <option key={plan.id} value={plan.slug}>{plan.name}</option>
            ))}
          </select>
        </div>

        <button className="refresh-button" onClick={loadOrganizations}>
          <RefreshCw size={20} />
          Actualizar
        </button>
      </motion.div>

      {/* Organizations Grid */}
      <div className="organizations-grid">
        <AnimatePresence>
          {filteredOrgs.map((org, index) => {
            const planInfo = org.subscription?.plan;
            const PlanIcon = planInfo ? getPlanIcon(planInfo.slug) : Package;
            
              let statusBadge = null;
              if (org.subscription && org.subscription.current_period_end) {
                const endDate = new Date(org.subscription.current_period_end);
                const today = new Date();
                const diffTime = endDate.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays < 0) {
                  statusBadge = <span className="status-cancelled">Vencida hace {Math.abs(diffDays)} días</span>;
                } else if (diffDays <= 7) {
                  statusBadge = <span className="status-warning">Vence en {diffDays} días</span>;
                } else {
                  statusBadge = <span className="status-active">Activa ({diffDays} días restantes)</span>;
                }
              }

              return (
                <motion.div
                  key={org.id}
                  className="org-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="org-card-content">
                    <div className="org-card-header">
                      <div className="org-info">
                        <Building2 size={24} />
                        <div>
                          <h3>{org.name}</h3>
                          <p className="org-date">
                            Creada: {new Date(org.created_at).toLocaleDateString('es-ES')}
                          </p>
                        </div>
                      </div>

                      {org.subscription ? (
                        <div 
                          className="plan-badge"
                          style={{ 
                            background: `${getPlanColor(planInfo.slug)}20`,
                            color: getPlanColor(planInfo.slug),
                            border: `1px solid ${getPlanColor(planInfo.slug)}40`
                          }}
                        >
                          <PlanIcon size={16} />
                          <span>{planInfo.name}</span>
                        </div>
                      ) : (
                        <div className="plan-badge no-sub">
                          <AlertTriangle size={16} />
                          <span>Sin suscripción</span>
                        </div>
                      )}
                    </div>

                    <div className="org-stats">
                      <div className="org-stat" title="Usuarios">
                        <Users size={16} />
                        <span>{org.stats.members} miemb.</span>
                      </div>
                      <div className="org-stat" title="Productos Creados">
                        <Package size={16} />
                        <span>{org.stats.products} prod.</span>
                      </div>
                      <div className="org-stat" title="Ventas del último mes">
                        <TrendingUp size={16} />
                        <span>{org.stats.sales} vent/mes</span>
                      </div>
                      <div className="org-stat" title="Última venta registrada">
                        <Clock size={16} />
                        <span>{org.stats.lastActivity ? new Date(org.stats.lastActivity).toLocaleDateString('es-ES') : 'Sin ventas'}</span>
                      </div>
                    </div>

                    {org.subscription && (
                      <div className="subscription-info">
                        <div className="sub-detail-row">
                          <div className="sub-detail">
                            <DollarSign size={16} />
                            <strong>Pago:</strong> <span>{new Date(org.subscription.current_period_start).toLocaleDateString('es-ES')}</span>
                          </div>
                          <div className="sub-detail">
                            <strong>${Number(planInfo.price_monthly).toLocaleString()}/mes</strong>
                          </div>
                        </div>
                        <div className="sub-detail-row">
                          <div className="sub-detail">
                            <Calendar size={16} />
                            <strong>Vencimiento:</strong> <span>{org.subscription.current_period_end ? new Date(org.subscription.current_period_end).toLocaleDateString('es-ES') : 'N/A'}</span>
                          </div>
                        </div>
                        <div className="sub-detail-row">
                          <div className="sub-detail">
                            <Shield size={16} />
                            {statusBadge || <span className={`status-${org.subscription.status}`}>
                              {org.subscription.status === 'active' ? 'Activa' : org.subscription.status}
                            </span>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                <div className="org-actions">
                  <button
                    className="btn-edit"
                    onClick={() => handleEditSubscription(org)}
                  >
                    <Edit2 size={16} />
                    {org.subscription ? 'Editar Suscripción' : 'Crear Suscripción'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredOrgs.length === 0 && (
        <motion.div
          className="empty-state"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <AlertTriangle size={48} />
          <p>No se encontraron organizaciones</p>
        </motion.div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>
                  {selectedOrg?.subscription ? 'Editar' : 'Crear'} Suscripción
                </h2>
                <button onClick={() => setShowModal(false)}>
                  <X size={24} />
                </button>
              </div>

              <div className="modal-body">
                <div className="org-preview">
                  <Building2 size={20} />
                  <span>{selectedOrg?.name}</span>
                </div>

                {/* Selector de Plan */}
                <div className="form-group">
                  <label>Plan de Suscripción</label>
                  <div className="plans-selector">
                    {availablePlans.map(plan => {
                      const Icon = getPlanIcon(plan.slug);
                      return (
                        <button
                          key={plan.id}
                          className={`plan-option ${formData.plan_id === plan.id ? 'selected' : ''}`}
                          onClick={() => setFormData({ ...formData, plan_id: plan.id })}
                          style={{
                            borderColor: formData.plan_id === plan.id ? getPlanColor(plan.slug) : 'rgba(255,255,255,0.1)',
                            background: formData.plan_id === plan.id ? `${getPlanColor(plan.slug)}15` : 'transparent'
                          }}
                        >
                          <Icon size={24} color={getPlanColor(plan.slug)} />
                          <div>
                            <span className="plan-name">{plan.name}</span>
                            <span className="plan-price">${Number(plan.price_monthly).toLocaleString()}/mes</span>
                          </div>
                          {formData.plan_id === plan.id && (
                            <Check size={20} color={getPlanColor(plan.slug)} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Estado */}
                <div className="form-group">
                  <label>Estado</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="active">Activa</option>
                    <option value="cancelled">Cancelada</option>
                    <option value="past_due">Vencida</option>
                    <option value="trialing">En prueba</option>
                    <option value="incomplete">Incompleta</option>
                  </select>
                </div>

                {/* Fechas */}
                <div className="form-row">
                  <div className="form-group">
                    <label>Fecha de Inicio</label>
                    <input
                      type="date"
                      value={formData.current_period_start}
                      onChange={(e) => setFormData({ ...formData, current_period_start: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Ciclo de Facturación</label>
                    <select
                      value={formData.billing_cycle}
                      onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value })}
                    >
                      <option value="monthly">Mensual</option>
                      <option value="yearly">Anual</option>
                    </select>
                  </div>
                </div>

                {/* Preview del precio */}
                {formData.plan_id && (
                  <div className="price-preview">
                    <DollarSign size={20} />
                    <span>
                      Precio: ${Number(getPlanInfo(formData.plan_id).price_monthly).toLocaleString()} COP / mes
                    </span>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-save"
                  onClick={handleSaveSubscription}
                  disabled={procesando || !formData.plan_id}
                >
                  {procesando ? 'Guardando...' : 'Guardar Suscripción'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VIPAdminPanel;
