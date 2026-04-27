import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, History, Home, Calculator, Sparkles, Users, Receipt, FileText, Tag, Package, ClipboardList, Utensils, ListChecks, TrendingDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import BottomNav from '../../components/navigation/BottomNav';
import TopNav from '../../components/navigation/TopNav';
import { clearEmployeeSession } from '../../utils/employeeSession';
import '../dashboard/DashboardLayout.css';
import './EmployeeLayout.css';

const EmployeeLayout = () => {
  const { organization, userProfile, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);

  const getPrimerNombre = () => {
    const nombreCompleto = userProfile?.full_name || userProfile?.nombre || 'Empleado';
    const primerNombre = String(nombreCompleto).trim().split(' ')[0] || 'Empleado';
    return primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1).toLowerCase();
  };

  const handleLogout = () => {
    clearEmployeeSession();
    navigate('/login-empleado');
  };

  const menuGroups = useMemo(() => {
    const groups = [
      {
        type: 'single',
        icon: Home,
        label: 'Inicio',
        to: '/empleado',
        end: true
      },
      {
        type: 'group',
        icon: CreditCard,
        label: 'Ventas y Caja',
        items: [
          {
            to: '/empleado/caja',
            icon: CreditCard,
            label: 'Caja'
          },
          {
            to: '/empleado/historial-ventas',
            icon: History,
            label: 'Historial de Ventas',
            visible: hasPermission('ventas.view')
          },
          {
            to: '/empleado/consultar-precio',
            icon: Tag,
            label: 'Consultar Precio',
            visible: hasPermission('ventas.view') || hasPermission('ventas.create')
          },
          {
            to: '/empleado/cierre-caja',
            icon: Calculator,
            label: 'Cierre de Caja',
            visible: hasPermission('cierre.create') || hasPermission('cierre.view')
          },
          {
            to: '/empleado/historial-cierres',
            icon: FileText,
            label: 'Historial de Cierres',
            visible: hasPermission('cierre.create') || hasPermission('cierre.view')
          }
        ].filter(item => item.visible !== false)
      },
      {
        type: 'group',
        icon: Users,
        label: 'Clientes y Créditos',
        items: [
          {
            to: '/empleado/clientes',
            icon: Users,
            label: 'Clientes',
            visible: hasPermission('clientes.view')
          },
          {
            to: '/empleado/creditos',
            icon: Receipt,
            label: 'Créditos',
            visible: hasPermission('creditos.view')
          }
        ].filter(item => item.visible !== false)
      },
      {
        type: 'group',
        icon: Package,
        label: 'Inventario',
        items: [
          {
            to: '/empleado/inventario',
            icon: Package,
            label: 'Productos',
            visible: hasPermission('inventario.view')
          },
          {
            to: '/empleado/inventario/revisiones',
            icon: ClipboardList,
            label: 'Revisiones',
            visible: hasPermission('inventario.view')
          },
          {
            to: '/empleado/inventario/inicial',
            icon: Package,
            label: 'Inventario Inicial',
            visible: hasPermission('inventario.view')
          },
          {
            to: '/empleado/toppings',
            icon: Utensils,
            label: 'Toppings',
            visible: organization?.business_type === 'food' && hasPermission('inventario.view')
          },
          {
            to: '/empleado/variaciones',
            icon: ListChecks,
            label: 'Variaciones',
            visible: organization?.business_type === 'food' && hasPermission('inventario.view')
          }
        ].filter(item => item.visible !== false),
        visible: hasPermission('inventario.view')
      },
      {
        type: 'group',
        icon: TrendingDown,
        label: 'Compras y Egresos',
        items: [
          {
            to: '/empleado/egresos',
            icon: TrendingDown,
            label: 'Egresos y Compras',
            visible: hasPermission('egresos.view')
          }
        ].filter(item => item.visible !== false),
        visible: hasPermission('egresos.view')
      }
    ];

    return groups;
  }, [hasPermission, organization]);

  const bottomNavItems = useMemo(() => {
    const items = [
      { to: '/empleado', icon: Home, label: 'Inicio' },
      { to: '/empleado/caja', icon: CreditCard, label: 'Caja' }
    ];
    if (hasPermission('ventas.view')) {
      items.push({ to: '/empleado/historial-ventas', icon: History, label: 'Historial' });
    }
    if (hasPermission('ventas.view') || hasPermission('ventas.create')) {
      items.push({ to: '/empleado/consultar-precio', icon: Tag, label: 'Precio' });
    }
    if (hasPermission('clientes.view')) {
      items.push({ to: '/empleado/clientes', icon: Users, label: 'Clientes' });
    }
    if (hasPermission('creditos.view')) {
      items.push({ to: '/empleado/creditos', icon: Receipt, label: 'Créditos' });
    }
    if (hasPermission('cierre.create') || hasPermission('cierre.view')) {
      items.push({ to: '/empleado/cierre-caja', icon: Calculator, label: 'Cierre' });
      items.push({ to: '/empleado/historial-cierres', icon: FileText, label: 'Cierres' });
    }
    if (hasPermission('inventario.view')) {
      items.push({ to: '/empleado/inventario', icon: Package, label: 'Productos' });
    }
    return items;
  }, [hasPermission]);

  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth <= 1024);
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  return (
    <div className="dashboard-layout employee-dashboard">
      <TopNav menuGroups={menuGroups} userProfile={userProfile} onMenuClick={() => { }} />

      <motion.main
        className="dashboard-main"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <motion.section
          className="dashboard-content employee-content"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="employee-hero">
            <div className="employee-welcome-content">
              <div className="employee-welcome-text">
                <span className="employee-welcome-greeting">¡Hola de nuevo!</span>
                <h1 className="employee-welcome-name">{getPrimerNombre()}</h1>
                <p className="employee-welcome-org">
                  {organization?.name || userProfile?.organization_name || 'Tu Negocio'}
                </p>
              </div>
              <div className="employee-welcome-icon">
                <Sparkles size={32} strokeWidth={2.5} />
              </div>
            </div>
            <div className="employee-welcome-actions">
              <div className="employee-welcome-date">
                {new Date().toLocaleDateString('es-ES', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }).split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </div>
              <button className="employee-logout" onClick={handleLogout}>
                Salir
              </button>
            </div>
          </div>
          <Outlet />
        </motion.section>

        {isMobile && (
          <BottomNav
            items={bottomNavItems}
            onItemClick={() => { }}
          />
        )}
      </motion.main>
    </div>
  );
};

export default EmployeeLayout;
