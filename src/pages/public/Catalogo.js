import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../services/api/supabaseClient';
import { Search, Store, PackageX, Image as ImageIcon, ShoppingCart, ShoppingBag, Plus, Minus, MessageCircle, X, Instagram, Facebook, Phone, ArrowLeft, ArrowRight, Sparkles, LayoutGrid, Rows } from 'lucide-react';
import toast from 'react-hot-toast';
// Import eliminado
import './Catalogo.css';
import OptimizedProductImage from '../../components/business/OptimizedProductImage';

const Catalogo = () => {
  const { slug } = useParams();
  const [organizacion, setOrganizacion] = useState(null);
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [logoError, setLogoError] = useState(false);
  const [activePromoIndex, setActivePromoIndex] = useState(0);

  const [categoriaActiva, setCategoriaActiva] = useState('todas');
  const [busqueda, setBusqueda] = useState('');
  const [vistaLayout, setVistaLayout] = useState('grid');

  // Estados del carrito
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [notaPedido, setNotaPedido] = useState('');

  // Estados de datos de envío
  const [shippingNombre, setShippingNombre] = useState('');
  const [shippingTelefono, setShippingTelefono] = useState('');
  const [shippingDireccion, setShippingDireccion] = useState('');
  const [shippingCiudad, setShippingCiudad] = useState('');
  const [shippingIndicaciones, setShippingIndicaciones] = useState('');
  const [checkoutStep, setCheckoutStep] = useState('cart'); // 'cart' o 'checkout'

  useEffect(() => {
    const fetchCatalogo = async () => {
      try {
        const cacheKeyOrg = `crecemas_org_${slug}`;
        const cacheKeyProd = `crecemas_prod_${slug}`;

        // Intentar cargar del caché local instantáneamente
        const cachedOrg = localStorage.getItem(cacheKeyOrg);
        const cachedProd = localStorage.getItem(cacheKeyProd);
        if (cachedOrg && cachedProd) {
          try {
            setOrganizacion(JSON.parse(cachedOrg));
            const parsedProd = JSON.parse(cachedProd);

            // Re-procesar categorías del caché
            const categoriasMap = new Map();
            parsedProd.forEach(p => {
              const catName = (p.metadata_parsed?.categoria || p.tipo || 'General').trim();
              const catId = catName.toLowerCase().replace(/\s+/g, '-');
              if (!categoriasMap.has(catId)) {
                categoriasMap.set(catId, { id: catId, nombre: catName });
              }
            });
            setCategorias(Array.from(categoriasMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setProductos(parsedProd);

            // Decir que ya no está cargando para visualización inmediata
            setCargando(false);
          } catch (e) {
            console.error("Error al cargar caché:", e);
          }
        } else {
          setCargando(true);
        }
        setError(null);

        // Fetch en red real
        const { data: orgData, error: orgError } = await supabase
          .from('public_organizations')
          .select('*')
          .eq('slug', slug)
          .single();

        if (orgError || !orgData) {
          throw new Error('Tienda no encontrada. Verifica el enlace.');
        }

        // Verificar suscripción para tiendas
        try {
          const { data: subData } = await supabase
            .from('subscriptions')
            .select('status, current_period_end, plan_id')
            .eq('organization_id', orgData.id)
            .eq('status', 'active')
            .maybeSingle();

          let blockStore = false;
          if (subData) {
            if (subData.plan_id === 'free') {
              blockStore = true; // El plan gratis no tiene tienda virtual
            } else if (subData.current_period_end) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const endDate = new Date(subData.current_period_end);
              endDate.setHours(0, 0, 0, 0);
              const diffDays = Math.round((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays < -3) blockStore = true;
            }
          } else {
            // Si no hay subcripción activa, se bloquea (salvo que en el futuro haya un caso especial)
            blockStore = true;
          }

          if (blockStore) {
            throw new Error('Tienda temporalmente no disponible');
          }
        } catch (err) {
          if (err.message === 'Tienda temporalmente no disponible') throw err;
          console.error('Error al verificar suscripción:', err);
        }

        setOrganizacion(orgData);
        localStorage.setItem(cacheKeyOrg, JSON.stringify(orgData));

        let allProducts = [];
        let from = 0;
        let to = 999;
        let hasMore = true;
        let loopError = null;

        while (hasMore) {
          const { data: prodData, error: prodError } = await supabase
            .from('public_productos')
            .select('*')
            .eq('organization_id', orgData.id)
            .order('nombre')
            .range(from, to);

          if (prodError) {
            loopError = prodError;
            console.error("Error al cargar lote de productos:", prodError);
            break;
          }

          if (prodData && prodData.length > 0) {
            allProducts = [...allProducts, ...prodData];
            if (prodData.length < 1000) {
              hasMore = false;
            } else {
              from += 1000;
              to += 1000;
            }
          } else {
            hasMore = false;
          }
        }

        if (!loopError && allProducts.length > 0) {
          const categoriasMap = new Map();
          const productosProcesados = allProducts
            .filter(p => {
              let meta = {};
              if (typeof p.metadata === 'string') {
                try { meta = JSON.parse(p.metadata); } catch (e) { }
              } else if (p.metadata) {
                meta = p.metadata;
              }
              return meta.ocultar_en_catalogo !== true && meta.ocultar_en_catalogo !== 'true';
            })
            .map(p => {
              let meta = {};
              if (typeof p.metadata === 'string') {
                try { meta = JSON.parse(p.metadata); } catch (e) { }
              } else if (p.metadata) {
                meta = p.metadata;
              }
              const catName = (meta.categoria || p.tipo || 'General').trim();
              const catId = catName.toLowerCase().replace(/\s+/g, '-');
              if (!categoriasMap.has(catId)) {
                categoriasMap.set(catId, { id: catId, nombre: catName });
              }
              return {
                ...p,
                metadata_parsed: meta,
                categoria_id: catId,
                descripcion: meta.descripcion || ''
              };
            });

          setCategorias(Array.from(categoriasMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)));
          setProductos(productosProcesados);
          localStorage.setItem(cacheKeyProd, JSON.stringify(productosProcesados));
        }
      } catch (err) {
        console.error('Error cargando catálogo:', err);
        const isBlockError = err.message === 'Tienda temporalmente no disponible';
        // Si hay error pero tenemos caché, no mostramos error al usuario, 
        // a menos que sea el error de tienda bloqueada
        if (isBlockError || !localStorage.getItem(`crecemas_org_${slug}`)) {
          setError(err.message || 'Error al cargar el catálogo');
        }
        
        if (isBlockError) {
          localStorage.removeItem(`crecemas_org_${slug}`);
          localStorage.removeItem(`crecemas_prod_${slug}`);
        }
      } finally {
        setCargando(false);
      }
    };

    if (slug) {
      fetchCatalogo();
    }
  }, [slug]);

  // Efecto para inyectar color dinámico y variables auxiliares
  useEffect(() => {
    if (organizacion) {
      const config = organizacion.catalogo_config || {};
      const colorTemaVal = config.color_botones || config.color_tema || '#4f46e5';
      const colorFondoVal = config.color_fondo || '#f9fafb';
      const colorTextBtnVal = config.color_texto_botones || '#ffffff';
      const colorHeaderVal = config.color_header || '#ffffff';
      const colorTextoHeaderVal = config.color_texto_header || '#111827';
      const fuenteVal = config.fuente_principal || 'Inter';

      document.documentElement.style.setProperty('--catalogo-theme-color', colorTemaVal);
      document.documentElement.style.setProperty('--catalogo-bg-color', colorFondoVal);
      document.documentElement.style.setProperty('--catalogo-text-btn-color', colorTextBtnVal);
      document.documentElement.style.setProperty('--catalogo-header-bg', colorHeaderVal);
      document.documentElement.style.setProperty('--catalogo-header-text', colorTextoHeaderVal);
      document.documentElement.style.setProperty('--catalogo-font', `'${fuenteVal}', Inter, sans-serif`);

      // Inyectar Google Fonts dinámicamente
      const fontId = 'catalogo-google-font';
      let linkEl = document.getElementById(fontId);
      if (!linkEl) {
        linkEl = document.createElement('link');
        linkEl.id = fontId;
        linkEl.rel = 'stylesheet';
        document.head.appendChild(linkEl);
      }
      const encoded = encodeURIComponent(fuenteVal);
      linkEl.href = `https://fonts.googleapis.com/css2?family=${encoded.replace(/%20/g, '+')}:wght@400;500;600;700;800&display=swap`;

      // Inyectar versión RGB para opacidades y gradientes
      try {
        const hex = colorTemaVal.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        document.documentElement.style.setProperty('--catalogo-theme-rgb', `${r}, ${g}, ${b}`);
      } catch (e) { }
    }
  }, [organizacion]);

  // Auto-scroll para las promociones
  useEffect(() => {
    const promos = organizacion?.catalogo_config?.promociones || [];
    if (promos.length > 1) {
      const interval = setInterval(() => {
        setActivePromoIndex(prev => (prev + 1) % promos.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [organizacion]);

  // Funciones del carrito
  const addToCart = (producto) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === producto.id);
      if (existing) {
        return prev.map(item => item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...prev, { ...producto, cantidad: 1 }];
    });
    toast.success(`${producto.nombre} agregado al pedido`);
  };

  const updateQuantity = (productId, change) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === productId);
      if (!existing) return prev;
      const newQty = existing.cantidad + change;
      if (newQty <= 0) {
        return prev.filter(item => item.id !== productId);
      }
      return prev.map(item => item.id === productId ? { ...item, cantidad: newQty } : item);
    });
  };

  const clearCart = () => {
    setCart([]);
  };

  const totalCart = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.precio_venta * item.cantidad), 0);
  }, [cart]);

  const totalItems = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.cantidad, 0);
  }, [cart]);

  const sendOrderWhatsApp = () => {
    const config = organizacion?.catalogo_config || {};
    const whatsappNum = config.whatsapp;
    if (!whatsappNum) {
      toast.error("Este negocio no ha configurado su WhatsApp para recibir pedidos.");
      return;
    }

    if (!shippingNombre.trim() || !shippingTelefono.trim() || !shippingDireccion.trim() || !shippingCiudad.trim()) {
      toast.error("Por favor, completa todos los datos de envío requeridos.");
      return;
    }

    let text = `¡Hola! Me gustaría realizar un pedido de la tienda *${organizacion.name}*:\n\n`;

    text += `*📦 DATOS DE ENVÍO:*\n`;
    text += `• *Nombre:* ${shippingNombre.trim()}\n`;
    text += `• *Teléfono:* ${shippingTelefono.trim()}\n`;
    text += `• *Dirección:* ${shippingDireccion.trim()}\n`;
    text += `• *Ciudad:* ${shippingCiudad.trim()}\n`;
    if (shippingIndicaciones.trim() !== '') {
      text += `• *Indicaciones:* ${shippingIndicaciones.trim()}\n`;
    }

    text += `\n*🛒 DETALLE DEL PEDIDO:*\n`;
    cart.forEach(item => {
      text += `• *${item.cantidad}x* ${item.nombre} - ${formatCOP(item.precio_venta * item.cantidad)}\n`;
    });

    if (notaPedido.trim() !== '') {
      text += `\n*Nota adicional:* ${notaPedido}\n`;
    }

    text += `\n*Total a pagar: ${formatCOP(totalCart)}*\n\nMuchas gracias.`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/${whatsappNum}?text=${encoded}`, '_blank');

    // Resetear carrito y formulario
    clearCart();
    setCartOpen(false);
    setCheckoutStep('cart');
    setShippingNombre('');
    setShippingTelefono('');
    setShippingDireccion('');
    setShippingCiudad('');
    setShippingIndicaciones('');
    setNotaPedido('');
  };

  // Filtrar productos por búsqueda y categoría
  const productosFiltrados = useMemo(() => {
    let filtrados = productos;

    if (categoriaActiva !== 'todas') {
      filtrados = filtrados.filter(p => p.categoria_id === categoriaActiva);
    }

    if (busqueda.trim() !== '') {
      const termino = busqueda.toLowerCase().trim();
      filtrados = filtrados.filter(p =>
        p.nombre?.toLowerCase().includes(termino) ||
        p.descripcion?.toLowerCase().includes(termino)
      );
    }

    return filtrados;
  }, [productos, categoriaActiva, busqueda]);

  const formatCOP = (amount) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const getCategoriaNombre = (id) => {
    const cat = categorias.find(c => c.id === id);
    return cat ? cat.nombre : 'Sin Categoría';
  };

  if (cargando) {
    return (
      <div className="catalogo-loading">
        <div className="spinner"></div>
        <p>Cargando catálogo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="catalogo-error">
        <Store size={64} style={{ opacity: 0.5, marginBottom: '1rem' }} />
        <h2>¡Ups!</h2>
        <p>{error}</p>
      </div>
    );
  }

  const layoutCategorias = organizacion?.catalogo_config?.layout_categorias || 'top';

  return (
    <div className="catalogo-container">

      {/* ===== ENCABEZADO STICKY HORIZONTAL ===== */}
      <header className="catalogo-header" style={{ borderBottom: `3px solid var(--catalogo-theme-color, #4f46e5)`, backgroundColor: 'var(--catalogo-header-bg, #ffffff)' }}>
        {/* Fila 1: Logo + Nombre  |  Buscador */}
        <div className="catalogo-header-row1">
          {/* Identidad */}
          <div className="catalogo-header-identity">
            <div className="catalogo-logo-container" style={{ border: `2px solid var(--catalogo-theme-color, #4f46e5)` }}>
              {organizacion?.logo_url && !logoError ? (
                <img
                  src={organizacion.logo_url}
                  alt={`Logo de ${organizacion.name}`}
                  className="catalogo-logo"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <Store size={28} color="var(--catalogo-theme-color, #4f46e5)" />
              )}
            </div>
            <h1 className="catalogo-title" style={{ color: 'var(--catalogo-header-text, #111827)' }}>{organizacion?.name || 'Tienda'}</h1>
          </div>

          {/* Redes Sociales en el Encabezado Sticky */}
          {(organizacion?.catalogo_config?.instagram || organizacion?.catalogo_config?.facebook || organizacion?.catalogo_config?.whatsapp) && (
            <div className="catalogo-header-socials">
              {organizacion.catalogo_config?.whatsapp && (
                <a href={`https://wa.me/${organizacion.catalogo_config.whatsapp}`} target="_blank" rel="noreferrer" className="header-social-icon whatsapp" title="WhatsApp">
                  <Phone size={15} />
                </a>
              )}
              {organizacion.catalogo_config?.instagram && (
                <a href={`https://instagram.com/${organizacion.catalogo_config.instagram}`} target="_blank" rel="noreferrer" className="header-social-icon instagram" title="Instagram">
                  <Instagram size={15} />
                </a>
              )}
              {organizacion.catalogo_config?.facebook && (
                <a href={organizacion.catalogo_config.facebook} target="_blank" rel="noreferrer" className="header-social-icon facebook" title="Facebook">
                  <Facebook size={15} />
                </a>
              )}
            </div>
          )}

          {/* Buscador */}
          <div className="catalogo-header-search">
            <div className="catalogo-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Buscar productos..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Fila 2: Categorías (scroll horizontal) */}
        {categorias.length > 0 && layoutCategorias !== 'side' && (
          <div className="catalogo-header-cats">
            <div className="catalogo-categorias">
              <button
                className={`categoria-pill ${categoriaActiva === 'todas' ? 'active' : ''}`}
                onClick={() => setCategoriaActiva('todas')}
                style={{
                  backgroundColor: categoriaActiva === 'todas' ? 'var(--catalogo-theme-color, #4f46e5)' : 'transparent',
                  borderColor: categoriaActiva === 'todas' ? 'var(--catalogo-theme-color, #4f46e5)' : 'rgba(0,0,0,0.15)',
                  color: categoriaActiva === 'todas' ? 'var(--catalogo-text-btn-color, #ffffff)' : '#475569'
                }}
              >
                Todas
              </button>
              {categorias.map(cat => (
                <button
                  key={cat.id}
                  className={`categoria-pill ${categoriaActiva === cat.id ? 'active' : ''}`}
                  onClick={() => setCategoriaActiva(cat.id)}
                  style={{
                    backgroundColor: categoriaActiva === cat.id ? 'var(--catalogo-theme-color, #4f46e5)' : 'transparent',
                    borderColor: categoriaActiva === cat.id ? 'var(--catalogo-theme-color, #4f46e5)' : 'rgba(0,0,0,0.15)',
                    color: categoriaActiva === cat.id ? 'var(--catalogo-text-btn-color, #ffffff)' : '#475569'
                  }}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>


      {/* Carrete de Promociones */}
      {organizacion?.catalogo_config?.promociones && organizacion.catalogo_config.promociones.length > 0 && (
        <div className="catalogo-promo-carousel-wrapper">
          <div className="catalogo-promo-carousel">
            <div className="promo-slider" style={{ transform: `translateX(-${activePromoIndex * 100}%)` }}>
              {organizacion.catalogo_config.promociones.map((promo, idx) => {
                const hasLink = promo.enlace_filtro && promo.enlace_filtro.trim() !== '';
                return (
                  <div
                    key={promo.id || idx}
                    className="promo-slide"
                    onClick={() => {
                      if (hasLink) {
                        setCategoriaActiva('todas');
                        setBusqueda(promo.enlace_filtro);
                        const target = document.getElementById('catalogo-productos');
                        if (target) {
                          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }
                    }}
                    style={{ cursor: hasLink ? 'pointer' : 'default' }}
                  >
                    <img src={promo.imagen_url} alt={promo.titulo || 'Promoción'} className="promo-image" />
                    {promo.titulo && (
                      <div className="promo-overlay">
                        <div className="promo-text-container">
                          <span className="promo-badge" style={{ backgroundColor: 'var(--catalogo-theme-color, #4f46e5)' }}>Destacado</span>
                          <h2 className="promo-title">{promo.titulo}</h2>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {organizacion.catalogo_config.promociones.length > 1 && (
              <div className="promo-indicators">
                {organizacion.catalogo_config.promociones.map((_, idx) => (
                  <button
                    key={idx}
                    className={`promo-dot ${activePromoIndex === idx ? 'active' : ''}`}
                    onClick={() => setActivePromoIndex(idx)}
                    style={{
                      backgroundColor: activePromoIndex === idx ? 'var(--catalogo-theme-color, #4f46e5)' : '#d1d5db'
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mensaje de Bienvenida (debajo del carrusel) */}
      {organizacion?.catalogo_config?.mensaje_bienvenida && (
        <div className="catalogo-banner-container">
          <div className="catalogo-banner" style={{ borderLeft: `4px solid var(--catalogo-theme-color, #4f46e5)` }}>
            <p>
              <Sparkles className="banner-sparkle" style={{ color: 'var(--catalogo-theme-color, #4f46e5)', flexShrink: 0 }} />
              <span className="banner-text">
                {organizacion.catalogo_config.mensaje_bienvenida}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Grilla de Productos */}
      <div id="catalogo-productos" className={`catalogo-main-layout ${layoutCategorias === 'side' ? 'side-layout' : 'top-layout'}`}>
        {/* Menú lateral de categorías - solo si es diseño lateral */}
        {categorias.length > 0 && layoutCategorias === 'side' && (
          <aside className="catalogo-categorias-container">
            <h3 className="side-categorias-title">Categorías</h3>
            <div className="catalogo-categorias">
              <button
                className={`categoria-pill ${categoriaActiva === 'todas' ? 'active' : ''}`}
                onClick={() => setCategoriaActiva('todas')}
                style={{
                  backgroundColor: categoriaActiva === 'todas' ? 'var(--catalogo-theme-color, #4f46e5)' : 'transparent',
                  borderColor: categoriaActiva === 'todas' ? 'var(--catalogo-theme-color, #4f46e5)' : 'rgba(0,0,0,0.15)',
                  color: categoriaActiva === 'todas' ? 'var(--catalogo-text-btn-color, #ffffff)' : '#475569'
                }}
              >
                Todas
              </button>
              {categorias.map(cat => (
                <button
                  key={cat.id}
                  className={`categoria-pill ${categoriaActiva === cat.id ? 'active' : ''}`}
                  onClick={() => setCategoriaActiva(cat.id)}
                  style={{
                    backgroundColor: categoriaActiva === cat.id ? 'var(--catalogo-theme-color, #4f46e5)' : 'transparent',
                    borderColor: categoriaActiva === cat.id ? 'var(--catalogo-theme-color, #4f46e5)' : 'rgba(0,0,0,0.15)',
                    color: categoriaActiva === cat.id ? 'var(--catalogo-text-btn-color, #ffffff)' : '#475569'
                  }}
                >
                  {cat.nombre}
                </button>
              ))}
            </div>
          </aside>
        )}

        <main className="catalogo-content">
          {productosFiltrados.length === 0 ? (
            <div className="catalogo-empty">
              <PackageX size={64} />
              <h3>No se encontraron productos</h3>
              <p>Intenta con otra búsqueda o categoría.</p>
            </div>
          ) : (
            <>
              <div className="catalogo-products-header">
                <span className="products-count">{productosFiltrados.length} productos</span>
                <div className="vista-toggle-container">
                  <button
                    type="button"
                    className={`vista-toggle-btn ${vistaLayout === 'grid' ? 'active' : ''}`}
                    onClick={() => setVistaLayout('grid')}
                    title="Vista cuadrícula"
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    type="button"
                    className={`vista-toggle-btn ${vistaLayout === 'list' ? 'active' : ''}`}
                    onClick={() => setVistaLayout('list')}
                    title="Vista lista"
                  >
                    <Rows size={16} />
                  </button>
                </div>
              </div>

              <div className={`productos-grid vista-${vistaLayout}`}>
                {productosFiltrados.map((producto) => {
                  const hasStock = producto.es_servicio || (producto.stock_disponible || 0) > 0;
                  return (
                    <div key={producto.id} className="producto-card">
                      <div className="producto-img-container">
                        <OptimizedProductImage
                          imagePath={producto.url_imagen}
                          alt={producto.nombre}
                          className="producto-img"
                        />
                      </div>
                      <div className="producto-info">
                        <div className="producto-categoria">{getCategoriaNombre(producto.categoria_id)}</div>
                        <h3 className="producto-nombre">{producto.nombre}</h3>
                        {producto.descripcion && (
                          <p className="producto-descripcion" style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.5rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '32px' }}>
                            {producto.descripcion}
                          </p>
                        )}
                        <div className="producto-footer">
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="producto-precio" style={{ color: 'var(--catalogo-theme-color, #4f46e5)' }}>{formatCOP(producto.precio_venta)}</span>
                            {!producto.es_servicio && (
                              <span className={`producto-stock ${hasStock ? 'disponible' : ''}`} style={{ alignSelf: 'flex-start', marginTop: '0.2rem' }}>
                                {hasStock ? 'Disponible' : 'Agotado'}
                              </span>
                            )}
                          </div>

                          {hasStock ? (
                            <button
                              className="btn-agregar-pedido"
                              onClick={() => addToCart(producto)}
                              style={{
                                background: 'var(--catalogo-theme-color, #4f46e5)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '0.5rem 0.8rem',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              Agregar
                            </button>
                          ) : (
                            <button
                              className="btn-agregar-pedido agotado"
                              disabled
                              style={{
                                background: '#e2e8f0',
                                color: '#94a3b8',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '0.5rem 0.8rem',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                cursor: 'not-allowed'
                              }}
                            >
                              Agotado
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Botón flotante del carrito */}
      {totalItems > 0 && (
        <div className="catalogo-cart-floating" onClick={() => setCartOpen(true)} style={{ background: 'var(--catalogo-theme-color, #4f46e5)', cursor: 'pointer' }}>
          <div className="cart-floating-content">
            <div className="cart-floating-info">
              <ShoppingCart size={20} />
              <span className="cart-floating-badge">{totalItems}</span>
              <span className="cart-floating-total">{formatCOP(totalCart)}</span>
            </div>
            <span className="cart-floating-btn-text">Ver Pedido</span>
          </div>
        </div>
      )}

      {/* Drawer del carrito */}
      {cartOpen && (
        <div className="cart-drawer-overlay" onClick={() => setCartOpen(false)}>
          <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cart-drawer-header">
              {checkoutStep === 'checkout' && (
                <button
                  className="cart-drawer-back"
                  onClick={() => setCheckoutStep('cart')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#4b5563', marginRight: '0.5rem', display: 'flex', alignItems: 'center' }}
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <h3>{checkoutStep === 'checkout' ? 'Datos de Envío' : 'Tu Pedido'}</h3>
              <button className="cart-drawer-close" onClick={() => { setCartOpen(false); setCheckoutStep('cart'); }}>
                <X size={24} />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="cart-drawer-empty">
                <ShoppingBag size={48} />
                <p>Tu pedido está vacío</p>
                <button
                  className="btn-keep-shopping"
                  onClick={() => { setCartOpen(false); setCheckoutStep('cart'); }}
                  style={{ maxWidth: '220px', fontSize: '0.85rem', padding: '0.65rem', marginTop: '0.75rem' }}
                >
                  <ArrowLeft size={16} /> Volver a la tienda
                </button>
              </div>
            ) : checkoutStep === 'cart' ? (
              <>
                <div className="cart-drawer-items">
                  {cart.map((item) => (
                    <div key={item.id} className="cart-item">
                      <div className="cart-item-info">
                        <h4>{item.nombre}</h4>
                        <span>{formatCOP(item.precio_venta)}</span>
                      </div>
                      <div className="cart-item-actions">
                        <button className="cart-action-btn" onClick={() => updateQuantity(item.id, -1)}><Minus size={14} /></button>
                        <span className="cart-item-qty">{item.cantidad}</span>
                        <button className="cart-action-btn" onClick={() => updateQuantity(item.id, 1)}><Plus size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="cart-drawer-footer">
                  <div className="cart-drawer-total" style={{ borderTop: 'none', paddingTop: 0, marginBottom: '1.25rem' }}>
                    <span>Total:</span>
                    <span>{formatCOP(totalCart)}</span>
                  </div>

                  <button className="btn-send-whatsapp" onClick={() => setCheckoutStep('checkout')} style={{ width: '100%' }}>
                    Siguiente: Datos de Envío
                  </button>

                  <button
                    className="btn-keep-shopping"
                    onClick={() => setCartOpen(false)}
                  >
                    Volver y seguir comprando
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="cart-drawer-items" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Nombre Completo *</label>
                    <input
                      type="text"
                      value={shippingNombre}
                      onChange={(e) => setShippingNombre(e.target.value)}
                      placeholder="Ej. Juan Pérez"
                      style={{ padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Celular / Teléfono *</label>
                    <input
                      type="tel"
                      value={shippingTelefono}
                      onChange={(e) => setShippingTelefono(e.target.value)}
                      placeholder="Ej. 3001234567"
                      style={{ padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Dirección de Envío *</label>
                    <input
                      type="text"
                      value={shippingDireccion}
                      onChange={(e) => setShippingDireccion(e.target.value)}
                      placeholder="Ej. Calle 45 # 12 - 34"
                      style={{ padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Ciudad / Municipio *</label>
                    <input
                      type="text"
                      value={shippingCiudad}
                      onChange={(e) => setShippingCiudad(e.target.value)}
                      placeholder="Ej. Bogotá"
                      style={{ padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Indicaciones de Entrega (Opcional)</label>
                    <input
                      type="text"
                      value={shippingIndicaciones}
                      onChange={(e) => setShippingIndicaciones(e.target.value)}
                      placeholder="Ej. Portería, casa blanca reja negra"
                      style={{ padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Nota o comentarios para el negocio (Opcional)</label>
                    <textarea
                      rows={2}
                      value={notaPedido}
                      onChange={(e) => setNotaPedido(e.target.value)}
                      placeholder="Ej. Sin cebolla, empacar por separado, etc."
                      style={{ padding: '0.6rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem', resize: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>

                <div className="cart-drawer-footer">
                  <div className="cart-drawer-total">
                    <span>Total:</span>
                    <span>{formatCOP(totalCart)}</span>
                  </div>

                  <button className="btn-send-whatsapp" onClick={sendOrderWhatsApp}>
                    <MessageCircle size={20} /> Enviar pedido por WhatsApp
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer de redes */}
      <footer className="catalogo-footer-social">
        {(organizacion?.catalogo_config?.instagram || organizacion?.catalogo_config?.facebook || organizacion?.catalogo_config?.whatsapp) && (
          <>
            <p className="footer-social-title">Contacta con nosotros</p>
            <div className="social-links">
              {organizacion.catalogo_config?.whatsapp && (
                <a href={`https://wa.me/${organizacion.catalogo_config.whatsapp}`} target="_blank" rel="noreferrer" className="social-link whatsapp">
                  <Phone size={18} /> WhatsApp
                </a>
              )}
              {organizacion.catalogo_config?.instagram && (
                <a href={`https://instagram.com/${organizacion.catalogo_config.instagram}`} target="_blank" rel="noreferrer" className="social-link instagram">
                  <Instagram size={18} /> Instagram
                </a>
              )}
              {organizacion.catalogo_config?.facebook && (
                <a href={organizacion.catalogo_config.facebook} target="_blank" rel="noreferrer" className="social-link facebook">
                  <Facebook size={18} /> Facebook
                </a>
              )}
            </div>
          </>
        )}

        <div className="footer-creceplus-promo">
          <div className="promo-divider" />
          <p className="promo-subtitle">¿Quieres controlar tu inventario, registrar ventas y tener un catálogo como este?</p>
          <a href="https://crecemas.co" target="_blank" rel="noreferrer" className="promo-button">
            <Sparkles size={14} className="sparkle-icon" />
            <span>Potencia tu negocio gratis con <strong>crecemas.co</strong></span>
            <ArrowRight size={14} className="arrow-icon" />
          </a>
          <p className="footer-credits">
            Desarrollado y Potenciado por <a href="https://crecemas.co" target="_blank" rel="noreferrer"><strong>CreceMás.co</strong></a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Catalogo;
