import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown,
  Package,
  Bell,
  CreditCard,
  Truck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProductos } from '../../hooks/useProductos';
import { useCreditos } from '../../hooks/useCreditos';
import { useCreditosProveedores } from '../../hooks/useEgresos';
import './TopNav.css';

const TopNav = ({ menuGroups, userProfile, onMenuClick }) => {
  const location = useLocation();
  const { user, organization, isEmployeeMode } = useAuth();
  const [openDropdown, setOpenDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0 });
  const [notificationsPosition, setNotificationsPosition] = useState({ top: 0, left: 0, right: null });
  const [notificationsPlacement, setNotificationsPlacement] = useState('topbar'); // 'topbar' | 'sidebar'
  const [notificationsOpenDirection, setNotificationsOpenDirection] = useState('down'); // 'down' | 'up'
  const dropdownRefs = useRef({});
  const dropdownButtonRefs = useRef({});
  const dropdownMenuRefs = useRef({});
  const notificationsRef = useRef(null);
  const notificationsDropdownRef = useRef(null);

  const { data: productos = [] } = useProductos(organization?.id);
  const { data: creditosVencidos = [] } = useCreditos(organization?.id, { vencidos: true });
  const { data: creditosProveedores = [] } = useCreditosProveedores(organization?.id);

  useEffect(() => {
    const shouldOpen = Boolean(openDropdown) && isMobile;
    document.body.classList.toggle('menu-dropdown-open', shouldOpen);
    return () => {
      document.body.classList.remove('menu-dropdown-open');
    };
  }, [openDropdown, isMobile]);

  useEffect(() => {
    const modalSelectors = [
      '.modal-bg',
      '.modal-overlay',
      '.importar-csv-modal',
      '.consultar-precio-modal-overlay',
      '.detalle-venta-modal',
      '.caja-modal-overlay',
      '.caja-mobile-overlay-backdrop',
      '.caja-mobile-overlay',
      '.caja-variant-modal',
      '.variaciones-selector-overlay',
      '.top-nav-notification-overlay',
      '[class*="modal-overlay"]',
      '[class*="modal-bg"]',
      '[role="dialog"]'
    ];

    const updateModalState = () => {
      const elements = document.querySelectorAll(modalSelectors.join(','));
      const hasVisibleModal = Array.from(elements).some((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });
      document.body.classList.toggle('modal-open', hasVisibleModal);
    };

    updateModalState();
    const observer = new MutationObserver(updateModalState);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    window.addEventListener('resize', updateModalState);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateModalState);
      document.body.classList.remove('modal-open');
    };
  }, []);

  const notificationsStorageKey = user?.id ? `notifications_seen_${user.id}` : 'notifications_seen';
  useEffect(() => {
    try {
      const saved = localStorage.getItem(notificationsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSeenNotificationIds(parsed);
        }
      } else {
        setSeenNotificationIds([]);
      }
    } catch (error) {
      console.error('Error cargando notificaciones vistas:', error);
    }
  }, [notificationsStorageKey]);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openDropdown) {
        const buttonEl = dropdownButtonRefs.current[openDropdown] || dropdownRefs.current[openDropdown];
        const menuEl = dropdownMenuRefs.current[openDropdown];
        if (buttonEl && buttonEl.contains(event.target)) return;
        if (menuEl && menuEl.contains(event.target)) return;
        setOpenDropdown(null);
      }
      
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };

    // Actualizar posición al hacer scroll
    const handleScroll = (event) => {
      if (notificationsOpen && notificationsDropdownRef.current && event?.target) {
        if (notificationsDropdownRef.current.contains(event.target)) {
          return;
        }
      }
      if (openDropdown) {
        const element = dropdownButtonRefs.current[openDropdown] || dropdownRefs.current[openDropdown];
        if (element) {
          const rect = element.getBoundingClientRect();
          const isMobile = window.innerWidth <= 1024;

          if (isMobile) {
            // En móvil, posicionar justo debajo del botón
            // Asegurar que no se salga de la pantalla
            const dropdownWidth = 200; // min-width del dropdown
            const screenWidth = window.innerWidth;
            let left = rect.left;

            // Si el dropdown se sale por la derecha, ajustarlo
            if (left + dropdownWidth > screenWidth - 12) {
              left = screenWidth - dropdownWidth - 12;
            }

            // Si el dropdown se sale por la izquierda, ajustarlo
            if (left < 12) {
              left = 12;
            }

            setDropdownPosition({
              top: rect.bottom,
              left: left,
              right: 'auto'
            });
          } else {
            const dropdownWidth = 200;
            const screenWidth = window.innerWidth;
            let left = rect.right + 16;
            if (left + dropdownWidth > screenWidth - 12) {
              left = screenWidth - dropdownWidth - 12;
            }
            if (left < 12) {
              left = 12;
            }
            setDropdownPosition({
              top: rect.bottom + 4,
              left: left,
              right: 'auto'
            });
          }
        }
      }

      if (notificationsOpen && notificationsRef.current) {
        const rect = notificationsRef.current.getBoundingClientRect();
        const isSidebarPlacement = rect.left < 100;
        const dropdownWidth = Math.min(320, window.innerWidth - 24);
        const screenWidth = window.innerWidth;
        let left = rect.left;

        if (left + dropdownWidth > screenWidth - 12) {
          left = screenWidth - dropdownWidth - 12;
        }
        if (left < 12) {
          left = 12;
        }

        const dropdownHeight = notificationsDropdownRef.current?.offsetHeight || 0;
        const shouldOpenUp = isSidebarPlacement && (rect.bottom + dropdownHeight > window.innerHeight - 12);
        let top = shouldOpenUp
          ? Math.max(12, rect.top - dropdownHeight - 8)
          : (isSidebarPlacement ? rect.top : rect.bottom + 8);
        if (!isSidebarPlacement && dropdownHeight > 0 && top + dropdownHeight > window.innerHeight - 12) {
          top = Math.max(12, window.innerHeight - dropdownHeight - 12);
        }

        setNotificationsPlacement(isSidebarPlacement ? 'sidebar' : 'topbar');
        setNotificationsOpenDirection(shouldOpenUp ? 'up' : 'down');
        setNotificationsPosition({
          top,
          left: isSidebarPlacement ? 86 : left,
          right: null
        });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [openDropdown, notificationsOpen]);

  const toggleDropdown = (groupLabel) => {
    if (openDropdown === groupLabel) {
      setOpenDropdown(null);
    } else {
      const element = dropdownButtonRefs.current[groupLabel] || dropdownRefs.current[groupLabel];
      if (element) {
        const rect = element.getBoundingClientRect();
        const isMobile = window.innerWidth <= 1024;
        
        if (isMobile) {
          // En móvil, posicionar justo debajo del botón
          // Asegurar que no se salga de la pantalla
          const dropdownWidth = 200; // min-width del dropdown
          const screenWidth = window.innerWidth;
          let left = rect.left;
          
          // Si el dropdown se sale por la derecha, ajustarlo
          if (left + dropdownWidth > screenWidth - 12) {
            left = screenWidth - dropdownWidth - 12;
          }
          
          // Si el dropdown se sale por la izquierda, ajustarlo
          if (left < 12) {
            left = 12;
          }
          
          setDropdownPosition({
            top: rect.bottom,
            left: left,
            right: 'auto'
          });
        } else {
          // En desktop, posicionar al lado derecho de la barra lateral
          const dropdownWidth = 200;
          const screenWidth = window.innerWidth;
          let left = rect.right + 16;
          if (left + dropdownWidth > screenWidth - 12) {
            left = screenWidth - dropdownWidth - 12;
          }
          if (left < 12) {
            left = 12;
          }
          setDropdownPosition({
            top: rect.bottom + 8,
            left: left,
            right: 'auto'
          });
        }
      }
      setOpenDropdown(groupLabel);
    }
  };

  const handleItemClick = () => {
    setOpenDropdown(null);
    setNotificationsOpen(false);
    setHoveredItem(null); // Asegurar que el tooltip se oculte al hacer click
    if (onMenuClick) onMenuClick();
  };

  const toggleNotifications = () => {
    const nextOpen = !notificationsOpen;
    if (!nextOpen) {
      setNotificationsOpen(false);
      return;
    }

    if (notificationsRef.current) {
      const rect = notificationsRef.current.getBoundingClientRect();
      const isSidebarPlacement = rect.left < 100;
      const dropdownWidth = Math.min(320, window.innerWidth - 24);
      const screenWidth = window.innerWidth;
      let left = rect.left;

      if (left + dropdownWidth > screenWidth - 12) {
        left = screenWidth - dropdownWidth - 12;
      }
      if (left < 12) {
        left = 12;
      }

      const dropdownHeight = notificationsDropdownRef.current?.offsetHeight || 0;
      const shouldOpenUp = isSidebarPlacement && (rect.bottom + dropdownHeight > window.innerHeight - 12);
      let top = shouldOpenUp
        ? Math.max(12, rect.top - dropdownHeight - 8)
        : (isSidebarPlacement ? rect.top : rect.bottom + 8);
      if (!isSidebarPlacement && dropdownHeight > 0 && top + dropdownHeight > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - dropdownHeight - 12);
      }

      setNotificationsPlacement(isSidebarPlacement ? 'sidebar' : 'topbar');
      setNotificationsOpenDirection(shouldOpenUp ? 'up' : 'down');
      setNotificationsPosition({
        top,
        left: isSidebarPlacement ? 86 : left,
        right: null
      });
    }

    setNotificationsOpen(true);
    requestAnimationFrame(() => {
      if (!notificationsRef.current) return;
      const rect = notificationsRef.current.getBoundingClientRect();
      const isSidebarPlacement = rect.left < 100;
      const dropdownHeight = notificationsDropdownRef.current?.offsetHeight || 0;
      const shouldOpenUp = isSidebarPlacement && (rect.bottom + dropdownHeight > window.innerHeight - 12);
      if (shouldOpenUp) {
        setNotificationsOpenDirection('up');
        setNotificationsPosition((prev) => ({
          ...prev,
          top: Math.max(12, rect.top - dropdownHeight - 8)
        }));
      } else {
        setNotificationsOpenDirection('down');
        setNotificationsPosition((prev) => ({
          ...prev,
          top: isSidebarPlacement ? rect.top : Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - dropdownHeight - 12))
        }));
      }
    });
  };

  // Detectar si es móvil
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  // Verificar si algún item del grupo está activo
  const isGroupActive = (group) => {
    if (group.type === 'single') {
      return location.pathname === group.to;
    }
    return group.items?.some(item => location.pathname === item.to);
  };

  // Calcular posición del tooltip
  const handleItemHover = (label, element) => {
    if (element) {
      const rect = element.getBoundingClientRect();
      setTooltipPosition({ top: rect.top + rect.height / 2 });
      setHoveredItem(label);
    }
  };

  // Renderizar tooltip
  const renderTooltip = (label) => {
    // No mostrar tooltip si el dropdown está abierto o si es móvil
    if (label === 'Notificaciones' && notificationsOpen) return null;
    if (!isMobile && hoveredItem === label && openDropdown !== label) {
      return (
        <motion.div
          className="top-nav-tooltip"
          style={{ top: `${tooltipPosition.top}px` }}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
        >
          {label}
        </motion.div>
      );
    }
    return null;
  };

  const moneda = user?.user_metadata?.moneda || 'COP';
  const formatMoneda = useCallback((value) => {
    try {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda }).format(value || 0);
    } catch (error) {
      return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(value || 0);
    }
  }, [moneda]);

  const notificationsGroups = useMemo(() => {
    const groups = [];
    const mostrarStockBajo = user?.user_metadata?.mostrarStockBajo !== false;
    const umbralStockBajo = Number(user?.user_metadata?.umbralStockBajo ?? 10);
    const umbralSeguro = Number.isFinite(umbralStockBajo) && umbralStockBajo > 0 ? umbralStockBajo : 10;

    const stockNumerico = productos
      .filter(p => p.tipo !== 'servicio')
      .map(p => ({ ...p, stock: Number(p.stock ?? 0) }));
    const getUmbralProducto = (producto) => {
      const umbralProducto = Number(producto?.metadata?.umbral_stock_bajo);
      if (Number.isFinite(umbralProducto) && umbralProducto > 0) {
        return umbralProducto;
      }
      return umbralSeguro;
    };

    const agotados = mostrarStockBajo ? stockNumerico.filter(p => p.stock <= 0) : [];
    const bajos = mostrarStockBajo ? stockNumerico.filter(p => p.stock > 0 && p.stock <= getUmbralProducto(p)) : [];

    if (agotados.length > 0) {
      groups.push({
        id: 'stock-sin',
        title: `Productos sin stock (${agotados.length})`,
        to: '/dashboard/inventario?stock=sin',
        icon: Package,
        items: agotados.map((producto) => ({
          id: `producto-${producto.id || producto.codigo || producto.nombre}`,
          title: producto.nombre || producto.codigo || 'Producto sin nombre',
          subtitle: `Stock: ${Number.isFinite(producto.stock) ? producto.stock : 0}`,
          to: `/dashboard/inventario?producto_id=${encodeURIComponent(producto.id)}`,
          icon: Package,
          category: 'Producto'
        }))
      });
    }

    if (bajos.length > 0) {
      groups.push({
        id: 'stock-bajo',
        title: `Stock bajo (${bajos.length})`,
        to: '/dashboard/inventario?stock=bajo',
        icon: Package,
        items: bajos.map((producto) => ({
          id: `producto-${producto.id || producto.codigo || producto.nombre}`,
          title: producto.nombre || producto.codigo || 'Producto sin nombre',
          subtitle: `Stock: ${Number.isFinite(producto.stock) ? producto.stock : 0}`,
          to: `/dashboard/inventario?producto_id=${encodeURIComponent(producto.id)}`,
          icon: Package,
          category: 'Producto'
        }))
      });
    }

    if (creditosVencidos.length > 0) {
      groups.push({
        id: 'clientes-vencidos',
        title: `Créditos vencidos (${creditosVencidos.length})`,
        to: '/dashboard/creditos?estado=vencido',
        icon: CreditCard,
        items: creditosVencidos.map((credito) => ({
          id: `cliente-${credito.id}`,
          title: credito.cliente?.nombre || 'Cliente sin nombre',
          subtitle: `Pendiente: ${formatMoneda(credito.monto_pendiente || credito.monto_total || 0)}`,
          to: '/dashboard/creditos?estado=vencido',
          icon: CreditCard,
          category: 'Cliente'
        }))
      });
    }

    const ahora = new Date();
    const inicioHoy = new Date(ahora);
    inicioHoy.setHours(0, 0, 0, 0);
    const limite = new Date(inicioHoy);
    limite.setDate(limite.getDate() + 2);
    limite.setHours(23, 59, 59, 999);

    const proveedoresVencidosOProximos = (creditosProveedores || []).filter(credito => {
      if (Number(credito.monto_pendiente || 0) <= 0) return false;
      const estado = (credito.estado || '').toLowerCase();
      if (!credito.fecha_vencimiento) return estado === 'vencido';
      const fecha = new Date(credito.fecha_vencimiento);
      if (estado === 'vencido' || fecha < inicioHoy) return true;
      return fecha >= inicioHoy && fecha <= limite;
    });

    if (proveedoresVencidosOProximos.length > 0) {
      groups.push({
        id: 'proveedores-alertas',
        title: `Proveedores por vencer (${proveedoresVencidosOProximos.length})`,
        to: '/dashboard/egresos?tab=creditos-proveedores&alerta=proveedores',
        icon: Truck,
        items: proveedoresVencidosOProximos.map((credito) => ({
          id: `proveedor-${credito.id}`,
          title: credito.proveedor?.nombre || 'Proveedor',
          subtitle: `Pendiente: ${formatMoneda(credito.monto_pendiente || credito.monto_total || 0)}`,
          to: '/dashboard/egresos?tab=creditos-proveedores&alerta=proveedores',
          icon: Truck,
          category: 'Proveedor'
        }))
      });
    }

    return groups;
  }, [productos, creditosVencidos, creditosProveedores, user?.user_metadata, formatMoneda]);

  const notificationsItems = useMemo(() => {
    return notificationsGroups.flatMap(group => group.items);
  }, [notificationsGroups]);

  const notificationsCount = notificationsItems.filter(item => !seenNotificationIds.includes(item.id)).length;

  const markNotificationsAsSeen = useCallback((ids) => {
    setSeenNotificationIds((prev) => {
      const merged = new Set(prev);
      ids.forEach(id => merged.add(id));
      const next = Array.from(merged);
      try {
        localStorage.setItem(notificationsStorageKey, JSON.stringify(next));
      } catch (error) {
        console.error('Error guardando notificaciones vistas:', error);
      }
      return next;
    });
  }, [notificationsStorageKey]);

  useEffect(() => {
    if (notificationsOpen && notificationsItems.length > 0) {
      markNotificationsAsSeen(notificationsItems.map(item => item.id));
    }
  }, [notificationsOpen, notificationsItems, markNotificationsAsSeen]);

  const NotificationsDropdown = () => {
    if (!notificationsOpen) return null;
    const dropdownClass = notificationsPlacement === 'sidebar'
      ? 'top-nav-sidebar-dropdown'
      : 'top-nav-notification-dropdown';
    return (
      <motion.div
        className={`${dropdownClass} ${notificationsOpenDirection === 'up' ? 'open-up' : ''}`}
        ref={notificationsDropdownRef}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        style={{
          top: `${notificationsPosition.top}px`,
          left: `${notificationsPosition.left}px`,
          right: notificationsPosition.right ? `${notificationsPosition.right}px` : 'auto'
        }}
      >
        <div className="top-nav-notification-header">
          <span>Notificaciones</span>
        </div>
        {notificationsGroups.length === 0 ? (
          <div className="top-nav-notification-empty">No hay notificaciones.</div>
        ) : (
          <div className="top-nav-notification-list">
            {notificationsGroups.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.id} className="top-nav-notification-section">
                  <NavLink
                    to={group.to}
                    className="top-nav-notification-group"
                    onClick={handleItemClick}
                  >
                    <GroupIcon size={16} />
                    <span className="top-nav-notification-group-title">{group.title}</span>
                  </NavLink>
                  <div className="top-nav-notification-items">
                    {group.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <NavLink
                          key={item.id}
                          to={item.to}
                          className="top-nav-notification-item top-nav-notification-item-detail"
                          onClick={handleItemClick}
                        >
                          <ItemIcon size={16} />
                          <div>
                            <div className="top-nav-notification-title">{item.title}</div>
                            <div className="top-nav-notification-subtitle">{item.category} • {item.subtitle}</div>
                          </div>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    );
  };

  // Si es móvil, renderizar la navegación superior normal
  if (isMobile) {
    return (
      <nav className="top-nav top-nav-mobile">
        <div className="top-nav-container">
        {/* Logos: Crece Mas y Empresa */}
        <div className="top-nav-logo-section">
          {/* Logo Crece Mas - clickeable para ir a inicio */}
          <NavLink 
            to={isEmployeeMode ? "/empleado" : "/dashboard"} 
            className="top-nav-logo"
            onClick={handleItemClick}
          >
            <img 
              src="/logo-crece.svg" 
              alt="Crece+" 
              className="top-nav-logo-img"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = '<span style="color: #007AFF; font-size: 1.5rem; font-weight: 700;">Crece+</span>';
              }}
            />
          </NavLink>
          
          {/* Logo de la empresa del usuario */}
          {organization?.logo_url && (
            <div className="top-nav-org-logo">
              <img 
                src={organization.logo_url} 
                alt={organization.name || 'Logo empresa'} 
                className="top-nav-org-logo-img"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* Menús principales */}
        <div className="top-nav-menu">
          {menuGroups.filter(g => g.visible !== false).map((group, index) => {
            if (group.type === 'single') {
              const Icon = group.icon;
              const isActive = location.pathname === group.to;
              
              return (
                <React.Fragment key={group.to}>
                  <NavLink
                    to={group.to}
                    end={group.end}
                    className={`top-nav-item ${isActive ? 'active' : ''}`}
                    onClick={handleItemClick}
                  >
                    <Icon size={18} />
                    <span>{group.label}</span>
                  </NavLink>
                </React.Fragment>
              );
            } else {
              const Icon = group.icon;
              const isActive = isGroupActive(group);
              const isOpen = openDropdown === group.label;
              
              return (
                <React.Fragment key={`group-${group.label}`}>
                  <div 
                    className={`top-nav-dropdown ${isActive ? 'active' : ''} ${isOpen ? 'open' : ''}`}
                    ref={el => dropdownRefs.current[group.label] = el}
                  >
                    <button
                      className="top-nav-dropdown-button"
                      onClick={() => toggleDropdown(group.label)}
                      ref={el => dropdownButtonRefs.current[group.label] = el}
                    >
                      <Icon size={18} />
                      <span>{group.label}</span>
                      <ChevronDown 
                        size={16} 
                        className={`dropdown-chevron ${isOpen ? 'open' : ''}`}
                      />
                    </button>
                    
                    {isMobile ? (
                      isOpen ? createPortal(
                        <motion.div
                          key={`menu-${group.label}`}
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                          className="top-nav-dropdown-menu"
                          ref={el => dropdownMenuRefs.current[group.label] = el}
                          aria-live="polite"
                          role="menu"
                          style={{
                            zIndex: 999999,
                            pointerEvents: 'auto',
                            top: `${dropdownPosition.top}px`,
                            left: dropdownPosition.left === 'auto' ? 'auto' : `${dropdownPosition.left}px`,
                            right: dropdownPosition.right ? `${dropdownPosition.right}px` : 'auto'
                          }}
                        >
                          {group.items.map((item) => {
                            const ItemIcon = item.icon;
                            return (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) => `top-nav-dropdown-item ${isActive ? 'active' : ''}`}
                                onClick={handleItemClick}
                              >
                                <ItemIcon size={16} />
                                <span>{item.label}</span>
                              </NavLink>
                            );
                          })}
                        </motion.div>,
                        document.body
                      ) : null
                    ) : (
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            key={`menu-${group.label}`}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="top-nav-dropdown-menu"
                            ref={el => dropdownMenuRefs.current[group.label] = el}
                            aria-live="polite"
                            role="menu"
                            style={{
                              zIndex: 999999,
                              pointerEvents: 'auto',
                              top: `${dropdownPosition.top}px`,
                              left: dropdownPosition.left === 'auto' ? 'auto' : `${dropdownPosition.left}px`,
                              right: dropdownPosition.right ? `${dropdownPosition.right}px` : 'auto'
                            }}
                          >
                            {group.items.map((item) => {
                              const ItemIcon = item.icon;
                              return (
                                <NavLink
                                  key={item.to}
                                  to={item.to}
                                  end={item.end}
                                  className={({ isActive }) => `top-nav-dropdown-item ${isActive ? 'active' : ''}`}
                                  onClick={handleItemClick}
                                >
                                  <ItemIcon size={16} />
                                  <span>{item.label}</span>
                                </NavLink>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                  </div>
                </React.Fragment>
              );
            }
          })}
        </div>

        {/* Acciones */}
        <div className="top-nav-right">
          <div className="top-nav-notifications top-nav-notifications-menu" ref={notificationsRef}>
            <button
              className={`top-nav-item top-nav-notification-btn ${notificationsOpen ? 'open' : ''} ${notificationsCount > 0 ? 'has-notifications' : ''}`}
              onClick={toggleNotifications}
              aria-label="Notificaciones"
            >
              <Bell size={18} />
              {notificationsCount > 0 && (
                <span className="top-nav-notification-badge">{notificationsCount}</span>
              )}
            </button>
            <AnimatePresence>
              {notificationsOpen && <NotificationsDropdown />}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </nav>
    );
  }

  // Desktop: Barra lateral izquierda con iconos
  return (
    <nav className="top-nav top-nav-sidebar">
      <div className="top-nav-sidebar-container">
        {/* Logo - clickeable para ir a inicio */}
        <NavLink 
          to={isEmployeeMode ? "/empleado" : "/dashboard"} 
          className="top-nav-sidebar-logo"
          onClick={handleItemClick}
        >
          <img 
            src="/logo-crece.svg" 
            alt="Crece+" 
            className="top-nav-sidebar-logo-img"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentElement.innerHTML = '<span style="color: #007AFF; font-size: 1.5rem; font-weight: 700;">Crece+</span>';
            }}
          />
        </NavLink>

        {/* Menús principales como iconos */}
        <div className="top-nav-sidebar-menu">
          {menuGroups.filter(g => g.visible !== false).map((group, index) => {
            if (group.type === 'single') {
              const Icon = group.icon;
              const isActive = location.pathname === group.to;
              
              return (
                <React.Fragment key={group.to}>
                  <div
                    className="top-nav-sidebar-item-wrapper"
                    onMouseEnter={(e) => handleItemHover(group.label, e.currentTarget)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <NavLink
                      to={group.to}
                      end={group.end}
                      className={`top-nav-sidebar-item ${isActive ? 'active' : ''}`}
                      onClick={handleItemClick}
                    >
                      <Icon size={22} />
                    </NavLink>
                    <AnimatePresence>
                      {renderTooltip(group.label)}
                    </AnimatePresence>
                  </div>
                </React.Fragment>
              );
            } else {
              const Icon = group.icon;
              const isActive = isGroupActive(group);
              const isOpen = openDropdown === group.label;
              
              return (
                <React.Fragment key={`group-${group.label}`}>
                  <div
                    className={`top-nav-sidebar-item-wrapper ${isActive ? 'active' : ''}`}
                    ref={el => dropdownRefs.current[group.label] = el}
                    onMouseEnter={(e) => handleItemHover(group.label, e.currentTarget)}
                    onMouseLeave={() => setHoveredItem(null)}
                  >
                    <button
                      className={`top-nav-sidebar-item ${isOpen ? 'open' : ''}`}
                      onClick={() => toggleDropdown(group.label)}
                    >
                      <Icon size={22} />
                    </button>
                    <AnimatePresence>
                      {renderTooltip(group.label)}
                    </AnimatePresence>
                    
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={{ duration: 0.2 }}
                          className="top-nav-sidebar-dropdown"
                          style={{
                            top: `${dropdownPosition.top}px`,
                            left: `${dropdownPosition.left}px`
                          }}
                        >
                          {group.items.map((item) => {
                            const ItemIcon = item.icon;
                            return (
                              <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) => `top-nav-sidebar-dropdown-item ${isActive ? 'active' : ''}`}
                                onClick={handleItemClick}
                              >
                                <ItemIcon size={18} />
                                <span>{item.label}</span>
                              </NavLink>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </React.Fragment>
              );
            }
          })}
        </div>
        <div className="top-nav-sidebar-actions">
          <div
            className="top-nav-sidebar-item-wrapper"
            onMouseEnter={(e) => handleItemHover('Notificaciones', e.currentTarget)}
            onMouseLeave={() => setHoveredItem(null)}
            ref={notificationsRef}
          >
            <button
              className={`top-nav-sidebar-item ${notificationsOpen ? 'open' : ''}`}
              onClick={toggleNotifications}
              aria-label="Notificaciones"
            >
              <Bell size={22} />
              {notificationsCount > 0 && (
                <span className="top-nav-notification-badge top-nav-notification-badge-sidebar">
                  {notificationsCount}
                </span>
              )}
            </button>
            <AnimatePresence>
              {renderTooltip('Notificaciones')}
            </AnimatePresence>
            <AnimatePresence>
              {notificationsOpen && <NotificationsDropdown />}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default TopNav;
