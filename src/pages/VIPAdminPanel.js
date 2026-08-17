import React, { useState, useEffect, useCallback } from 'react';
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
  Clock,
  Trash2,
  Mail,
  Phone,
  User,
  Copy,
  ExternalLink,
  CreditCard,
  Info
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

  // Panel de detalle del cliente
  const [detailOrg, setDetailOrg] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // Planes disponibles (cargados desde la DB)
  const [availablePlans, setAvailablePlans] = useState([]);
  
  const [formData, setFormData] = useState({
    plan_id: '',
    status: 'active',
    current_period_start: new Date().toISOString().split('T')[0],
    current_period_end: '',
    billing_cycle: 'monthly' // Solo para UI, no se guarda
  });

  const [orgToDelete, setOrgToDelete] = useState(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');

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

          let finalStats = { members: 1, products: 0, sales: 0, lastActivity: null };

          // Intentar obtener estadísticas usando la función RPC segura (Bypasses RLS)
          const { data: adminStats, error: adminStatsError } = await supabase.rpc('get_vip_admin_org_stats', {
            p_org_id: org.id
          });

          if (!adminStatsError && adminStats) {
            finalStats = {
              members: (adminStats.members_count || 0) + 1,
              products: adminStats.products_count || 0,
              sales: adminStats.sales_count || 0,
              lastActivity: adminStats.last_activity || null
            };
          } else {
            // Fallback: Consultas directas (Pueden fallar por RLS si el admin no está en la org)
            if (adminStatsError && adminStatsError.code === 'PGRST202') {
              console.warn('Nota: Debes ejecutar el script get_vip_admin_org_stats.sql en tu base de datos para ver todas las estadísticas de ventas (RLS bypass).');
            }
            
            // Miembros del equipo
            const { data: members } = await supabase
              .from('team_members')
              .select('id')
              .eq('organization_id', org.id)
              .eq('status', 'active');

            // Productos
            const { data: products, error: productsError } = await supabase
              .from('productos')
              .select('id')
              .eq('organization_id', org.id);

            // Ventas del último mes
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
            
            const { data: sales, error: salesError } = await supabase
              .from('ventas')
              .select('id')
              .eq('organization_id', org.id)
              .gte('created_at', oneMonthAgo.toISOString());

            // Última actividad
            const { data: lastActivityData, error: lastActivityError } = await supabase
              .from('ventas')
              .select('created_at')
              .eq('organization_id', org.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            finalStats = {
              members: (members?.length || 0) + 1,
              products: productsError ? 0 : (products?.length || 0),
              sales: salesError ? 0 : (sales?.length || 0),
              lastActivity: (!lastActivityError && lastActivityData) ? lastActivityData.created_at : null
            };
          }

          return {
            ...org,
            subscription: subscription ? {
              ...subscription,
              plan: subscription.plan // El plan completo viene del JOIN
            } : null,
            stats: finalStats
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

  // Cargar detalle completo de una organización (owner + miembros + pagos)
  const loadOrgDetail = useCallback(async (org) => {
    setLoadingDetail(true);
    setDetailData(null);
    try {
      // 1. Perfil del owner
      let ownerProfile = null;
      if (org.owner_id) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('full_name, phone, avatar_url, email')
          .eq('user_id', org.owner_id)
          .maybeSingle();
        ownerProfile = profile;
      }

      // 2. Miembros del equipo con su perfil
      const { data: members } = await supabase
        .from('team_members')
        .select('id, user_id, role, status, joined_at, employee_name, employee_phone, employee_email, is_employee')
        .eq('organization_id', org.id)
        .order('joined_at', { ascending: true });

      let membersWithProfiles = [];
      if (members && members.length > 0) {
        const userIds = members.filter(m => m.user_id).map(m => m.user_id);
        let profiles = [];
        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('user_profiles')
            .select('user_id, full_name, phone, avatar_url, email')
            .in('user_id', userIds);
          profiles = profilesData || [];
        }
        membersWithProfiles = members.map(m => ({
          ...m,
          profile: profiles.find(p => p.user_id === m.user_id) || null,
          displayName: m.employee_name || profiles.find(p => p.user_id === m.user_id)?.full_name || 'Sin nombre',
          displayEmail: m.employee_email || profiles.find(p => p.user_id === m.user_id)?.email || null,
          displayPhone: m.employee_phone || profiles.find(p => p.user_id === m.user_id)?.phone || null,
        }));
      }

      // 3. Últimos pagos
      const { data: payments } = await supabase
        .from('payments')
        .select('id, status, amount, currency, created_at, billing_period, wompi_reference')
        .eq('organization_id', org.id)
        .order('created_at', { ascending: false })
        .limit(5);

      setDetailData({
        ownerProfile,
        members: membersWithProfiles,
        payments: payments || [],
      });
    } catch (err) {
      console.error('Error loading org detail:', err);
      toast.error('Error al cargar detalle');
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleOpenDetail = (org) => {
    setDetailOrg(org);
    setShowDetail(true);
    loadOrgDetail(org);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copiado al portapapeles'));
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

      // Actualizar también el status en la organización por si acaso
      const orgStatus = formData.status === 'active' ? 'active' : formData.status;
      await supabase
        .from('organizations')
        .update({ subscription_status: orgStatus })
        .eq('id', selectedOrg.id);

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

  const confirmDeleteOrganization = (org) => {
    setOrgToDelete(org);
    setDeleteConfirmationText('');
  };

  const executeDeleteOrganization = async () => {
    if (!orgToDelete || deleteConfirmationText !== orgToDelete.name) return;

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgToDelete.id);

      if (error) throw error;
      
      toast.success('Organización eliminada exitosamente');
      setOrgToDelete(null);
      loadOrganizations();
    } catch (error) {
      console.error('Error deleting organization:', error);
      toast.error('Error al eliminar la organización. Puede tener registros vinculados.');
    } finally {
      setLoading(false);
    }
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
      enterprise: '#02A5E0',
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
              <Sparkles size={24} color="#02A5E0" />
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
                    className="btn-detail"
                    onClick={() => handleOpenDetail(org)}
                    title="Ver detalle del cliente"
                  >
                    <Info size={16} />
                    Detalle
                  </button>
                  <button
                    className="btn-edit"
                    onClick={() => handleEditSubscription(org)}
                  >
                    <Edit2 size={16} />
                    {org.subscription ? 'Editar' : 'Crear Plan'}
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => confirmDeleteOrganization(org)}
                    title="Eliminar Organización"
                  >
                    <Trash2 size={16} />
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

      {/* ===== DRAWER DE DETALLE DEL CLIENTE ===== */}
      <AnimatePresence>
        {showDetail && detailOrg && (
          <motion.div
            className="detail-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              className="detail-drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header del drawer */}
              <div className="detail-header">
                <div className="detail-header-info">
                  <Building2 size={22} />
                  <div>
                    <h2>{detailOrg.name}</h2>
                    <span className="detail-created">Cliente desde {new Date(detailOrg.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                </div>
                <button className="detail-close" onClick={() => setShowDetail(false)}><X size={20} /></button>
              </div>

              <div className="detail-body">
                {loadingDetail ? (
                  <div className="detail-loading"><LottieLoader size="small" message="Cargando información..." /></div>
                ) : (
                  <>
                    {/* Dueño */}
                    <div className="detail-section">
                      <h3 className="detail-section-title"><User size={16} /> Dueño de la cuenta</h3>
                      {detailData?.ownerProfile ? (
                        <div className="detail-owner-card">
                          <div className="detail-avatar">
                            {detailData.ownerProfile.avatar_url
                              ? <img src={detailData.ownerProfile.avatar_url} alt="avatar" />
                              : <span>{(detailData.ownerProfile.full_name || detailOrg.name || '?')[0].toUpperCase()}</span>
                            }
                          </div>
                          <div className="detail-owner-info">
                            <p className="owner-name">{detailData.ownerProfile.full_name || 'Sin nombre'}</p>
                            {detailData.ownerProfile.email && (
                              <div className="detail-contact-row">
                                <Mail size={14} />
                                <span>{detailData.ownerProfile.email}</span>
                                <button className="copy-btn" onClick={() => copyToClipboard(detailData.ownerProfile.email)} title="Copiar email"><Copy size={12} /></button>
                                <a href={`mailto:${detailData.ownerProfile.email}`} className="contact-link" title="Enviar email" target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>
                              </div>
                            )}
                            {detailData.ownerProfile.phone && (
                              <div className="detail-contact-row">
                                <Phone size={14} />
                                <span>{detailData.ownerProfile.phone}</span>
                                <button className="copy-btn" onClick={() => copyToClipboard(detailData.ownerProfile.phone)} title="Copiar teléfono"><Copy size={12} /></button>
                                <a href={`https://wa.me/${detailData.ownerProfile.phone.replace(/\D/g, '')}`} className="contact-link whatsapp" title="WhatsApp" target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>
                              </div>
                            )}
                            {!detailData.ownerProfile.email && !detailData.ownerProfile.phone && (
                              <p className="detail-empty">Sin información de contacto registrada</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="detail-empty">No se encontró perfil del dueño</p>
                      )}
                    </div>

                    {/* Suscripción actual */}
                    <div className="detail-section">
                      <h3 className="detail-section-title"><Shield size={16} /> Suscripción actual</h3>
                      {detailOrg.subscription ? (
                        <div className="detail-sub-info">
                          <span className="detail-plan-badge" style={{ background: `${getPlanColor(detailOrg.subscription.plan?.slug)}20`, color: getPlanColor(detailOrg.subscription.plan?.slug), border: `1px solid ${getPlanColor(detailOrg.subscription.plan?.slug)}40` }}>
                            {detailOrg.subscription.plan?.name || 'Plan desconocido'}
                          </span>
                          <div className="detail-sub-dates">
                            <span><Calendar size={13} /> Desde: {new Date(detailOrg.subscription.current_period_start).toLocaleDateString('es-CO')}</span>
                            <span><Calendar size={13} /> Hasta: {detailOrg.subscription.current_period_end ? new Date(detailOrg.subscription.current_period_end).toLocaleDateString('es-CO') : 'N/A'}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="detail-empty">Sin suscripción activa</p>
                      )}
                    </div>

                    {/* Catálogo Virtual */}
                    <div className="detail-section">
                      <h3 className="detail-section-title"><Building2 size={16} /> Catálogo Virtual</h3>
                      {detailOrg.slug ? (
                        <div className="detail-catalog-card">
                          <div className="detail-catalog-info">
                            <span className="catalog-status-badge">Activo</span>
                            <div className="detail-contact-row" style={{ marginTop: '0.75rem' }}>
                              <ExternalLink size={14} />
                              <a 
                                href={`${window.location.origin}/tienda/${detailOrg.slug}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="contact-link"
                              >
                                {`${window.location.origin}/tienda/${detailOrg.slug}`}
                              </a>
                              <button 
                                className="copy-btn" 
                                onClick={() => copyToClipboard(`${window.location.origin}/tienda/${detailOrg.slug}`)} 
                                title="Copiar enlace del catálogo"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="detail-empty">Sin catálogo configurado (no tiene enlace slug)</p>
                      )}
                    </div>

                    {/* Miembros */}
                    <div className="detail-section">
                      <h3 className="detail-section-title"><Users size={16} /> Equipo ({detailData?.members?.length || 0} miembros)</h3>
                      <div className="detail-members-list">
                        {detailData?.members?.length > 0 ? detailData.members.map(m => (
                          <div key={m.id} className="detail-member-row">
                            <div className="member-avatar-sm">{(m.displayName || '?')[0].toUpperCase()}</div>
                            <div className="member-info-col">
                              <span className="member-name-sm">{m.displayName}</span>
                              <span className="member-role-badge" style={{ background: m.role === 'owner' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.08)', color: m.role === 'owner' ? '#f59e0b' : '#9ca3af' }}>
                                {m.is_employee ? 'Empleado' : m.role}
                              </span>
                            </div>
                            <div className="member-contact-col">
                              {m.displayEmail && (
                                <div className="detail-contact-row">
                                  <Mail size={12} />
                                  <span>{m.displayEmail}</span>
                                  <button className="copy-btn" onClick={() => copyToClipboard(m.displayEmail)}><Copy size={11} /></button>
                                </div>
                              )}
                              {m.displayPhone && (
                                <div className="detail-contact-row">
                                  <Phone size={12} />
                                  <span>{m.displayPhone}</span>
                                  <button className="copy-btn" onClick={() => copyToClipboard(m.displayPhone)}><Copy size={11} /></button>
                                </div>
                              )}
                              {!m.displayEmail && !m.displayPhone && <span className="detail-empty" style={{fontSize:'0.75rem'}}>Sin contacto</span>}
                            </div>
                          </div>
                        )) : <p className="detail-empty">Sin miembros registrados</p>}
                      </div>
                    </div>

                    {/* Historial de pagos */}
                    <div className="detail-section">
                      <h3 className="detail-section-title"><CreditCard size={16} /> Últimos pagos</h3>
                      {detailData?.payments?.length > 0 ? (
                        <div className="detail-payments-list">
                          {detailData.payments.map(p => (
                            <div key={p.id} className="detail-payment-row">
                              <div className="payment-left">
                                <span className={`payment-status-dot status-${p.status}`}></span>
                                <div>
                                  <span className="payment-amount">${Number(p.amount || 0).toLocaleString('es-CO')} {p.currency || 'COP'}</span>
                                  <span className="payment-ref">{p.wompi_reference || p.id.substring(0, 8)}</span>
                                </div>
                              </div>
                              <div className="payment-right">
                                <span className={`payment-badge payment-${p.status}`}>{p.status}</span>
                                <span className="payment-date">{new Date(p.created_at).toLocaleDateString('es-CO')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="detail-empty">Sin pagos registrados</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Footer del drawer */}
              <div className="detail-footer">
                <button className="btn-edit" style={{flex:1}} onClick={() => { setShowDetail(false); handleEditSubscription(detailOrg); }}>
                  <Edit2 size={16} />
                  {detailOrg.subscription ? 'Editar Suscripción' : 'Crear Suscripción'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Suscripción */}
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {orgToDelete && (
          <motion.div 
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div className="modal-header">
                <h3>Eliminar Organización</h3>
                <button className="btn-close" onClick={() => setOrgToDelete(null)}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '10px', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', color: '#ef4444' }}>
                  <AlertTriangle size={24} style={{ flexShrink: 0 }} />
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>¡Acción Peligrosa!</h4>
                    <p style={{ margin: 0, fontSize: '0.9rem' }}>
                      Estás a punto de eliminar la organización <strong>{orgToDelete.name}</strong>. Esta acción eliminará permanentemente la organización y no se puede deshacer.
                    </p>
                  </div>
                </div>

                <div className="form-group">
                  <label>Para confirmar, escribe el nombre exacto de la organización: <strong>{orgToDelete.name}</strong></label>
                  <input
                    type="text"
                    value={deleteConfirmationText}
                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                    placeholder={orgToDelete.name}
                    className="form-control"
                    autoFocus
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setOrgToDelete(null)} disabled={loading}>
                  Cancelar
                </button>
                <button
                  className="btn-delete"
                  onClick={executeDeleteOrganization}
                  disabled={loading || deleteConfirmationText !== orgToDelete.name}
                  style={{ opacity: deleteConfirmationText !== orgToDelete.name ? 0.5 : 1, padding: '0.75rem 1.5rem' }}
                >
                  {loading ? 'Eliminando...' : 'Eliminar Definitivamente'}
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
