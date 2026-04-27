import React from 'react';
import { motion } from 'framer-motion';
import { Package, DollarSign, TrendingUp, AlertTriangle, Box, Percent, Scale } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './InventarioStats.css';

const InventarioStats = ({ productos, totalProductosOverride }) => {
  const { user, organization, userProfile, isEmployeeMode } = useAuth();
  const navigate = useNavigate();
  const umbralStockBajo = Number(user?.user_metadata?.umbralStockBajo ?? 10);
  const umbralStockBajoSeguro = Number.isFinite(umbralStockBajo) && umbralStockBajo > 0 ? umbralStockBajo : 10;
  const parseNumber = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value).trim();
    if (!raw) return 0;
    if (raw.includes('.') && raw.includes(',')) {
      const normalized = raw.replace(/\./g, '').replace(',', '.');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (raw.includes(',') && !raw.includes('.')) {
      const normalized = raw.replace(',', '.');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (raw.includes('.') && /^\d{1,3}(\.\d{3})+$/.test(raw)) {
      const normalized = raw.replace(/\./g, '');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // Calcular métricas
  const totalProductos = Number.isFinite(totalProductosOverride)
    ? totalProductosOverride
    : productos.length;

  const productosInventario = productos.filter(p => p.tipo !== 'servicio');
  const totalStock = productosInventario.reduce((sum, p) => sum + parseNumber(p.stock), 0);

  const getUmbralProducto = (producto) => {
    const metadata = typeof producto?.metadata === 'string'
      ? (() => {
        try {
          return JSON.parse(producto.metadata);
        } catch {
          return {};
        }
      })()
      : (producto?.metadata || {});
    const umbralProducto = Number(metadata?.umbral_stock_bajo);
    if (Number.isFinite(umbralProducto) && umbralProducto > 0) {
      return umbralProducto;
    }
    return umbralStockBajoSeguro;
  };

  // Stock bajo (según umbral por producto o general)
  const stockBajo = productosInventario.filter(p => {
    const stock = parseNumber(p.stock);
    return stock > 0 && stock <= getUmbralProducto(p);
  });
  const cantidadStockBajo = stockBajo.length;

  // Sin stock
  const sinStock = productosInventario.filter(p => parseNumber(p.stock) === 0);
  const cantidadSinStock = sinStock.length;

  // Costo total en stock (precio_compra * stock)
  const costoEnStock = productosInventario.reduce((sum, p) => {
    const stock = parseNumber(p.stock);
    const precioCompra = parseNumber(p.precio_compra);
    return sum + (stock * precioCompra);
  }, 0);

  const getPurityFactor = (pureza) => {
    switch ((pureza || '').toLowerCase()) {
      case '24k':
        return 1;
      case '22k':
        return 22 / 24;
      case '18k':
        return 18 / 24;
      case '14k':
        return 14 / 24;
      case '10k':
        return 10 / 24;
      case '925':
        return 0.925;
      case '950':
        return 0.95;
      default:
        return 1;
    }
  };

  const getStoredJewelryPrices = () => {
    if (!organization?.id) return {};
    const stored = localStorage.getItem(`jewelry_prices:${organization.id}`);
    if (!stored) return {};
    try {
      return JSON.parse(stored) || {};
    } catch {
      return {};
    }
  };

  const getGoldPriceGlobal = () => {
    const stored = getStoredJewelryPrices();
    const fromStorage = parseNumber(stored?.global);
    if (fromStorage > 0) return fromStorage;
    return parseNumber(organization?.jewelry_gold_price_global);
  };

  const getGoldPriceLocal = () => {
    const stored = getStoredJewelryPrices();
    const fromStorage = parseNumber(stored?.local);
    if (fromStorage > 0) return fromStorage;
    const goldGlobal = getGoldPriceGlobal();
    const adjustPct = parseNumber(organization?.jewelry_national_adjust_pct);
    if (goldGlobal > 0 && adjustPct > 0) {
      return goldGlobal * (1 - adjustPct / 100);
    }
    return parseNumber(organization?.jewelry_gold_price_local);
  };

  const getCurrentVentaPrice = (producto) => {
    const metadata = typeof producto?.metadata === 'string'
      ? (() => {
        try {
          return JSON.parse(producto.metadata);
        } catch {
          return {};
        }
      })()
      : (producto?.metadata || {});
    const isVariablePrice = metadata?.jewelry_price_mode === 'variable';
    if (!isVariablePrice) return parseNumber(producto.precio_venta);
    const peso = parseNumber(metadata?.peso);
    const pureza = metadata?.pureza;
    const materialType = metadata?.jewelry_material_type || 'na';
    const goldPrice = materialType === 'local'
      ? getGoldPriceLocal()
      : getGoldPriceGlobal() || getGoldPriceLocal();
    const aplicaPureza = materialType === 'international';
    const minMargin = materialType === 'local'
      ? parseNumber(organization?.jewelry_min_margin_local)
      : parseNumber(organization?.jewelry_min_margin_international);
    const compraPorUnidad = parseNumber(metadata?.jewelry_compra_por_unidad)
      || (peso > 0 ? (parseNumber(producto.precio_compra) / peso) : 0);
    const diff = goldPrice - compraPorUnidad;
    const precioBaseGramo = diff >= minMargin ? goldPrice : (compraPorUnidad + minMargin);
    if (!peso || !goldPrice) return 0;
    return Math.round(peso * precioBaseGramo * (aplicaPureza ? getPurityFactor(pureza) : 1) * 100) / 100;
  };

  // Valor de venta en stock (precio_venta * stock) con precios actuales
  const valorVentaEnStock = productosInventario.reduce((sum, p) => {
    const stock = parseNumber(p.stock);
    const precioVenta = getCurrentVentaPrice(p);
    return sum + (stock * precioVenta);
  }, 0);

  // Utilidad potencial en stock (valor venta - costo)
  const utilidadEnStockRaw = valorVentaEnStock - costoEnStock;
  const utilidadEnStock = organization?.business_type === 'jewelry_metals'
    ? Math.max(0, utilidadEnStockRaw)
    : utilidadEnStockRaw;

  // Margen de utilidad porcentual
  const margenUtilidad = valorVentaEnStock > 0
    ? ((utilidadEnStock / valorVentaEnStock) * 100).toFixed(1)
    : 0;

  // =====================================================
  // JOYERÍA: Cálculo de gramos en inventario por tipo
  // =====================================================
  const isJewelryBusiness = organization?.business_type === 'jewelry_metals';

  const getMetadata = (producto) => {
    if (!producto?.metadata) return {};
    if (typeof producto.metadata === 'string') {
      try { return JSON.parse(producto.metadata); } catch { return {}; }
    }
    return producto.metadata;
  };

  // Helper: obtiene el stock efectivo de un producto, sumando variantes si las tiene
  const getStockEfectivo = (producto) => {
    if (Array.isArray(producto.variantes) && producto.variantes.length > 0) {
      // Con variantes: el stock real está en cada variante
      return producto.variantes.reduce((sum, v) => sum + parseNumber(v.stock), 0);
    }
    return parseNumber(producto.stock);
  };

  // Gramos Nacionales: jewelry_material_type === 'local'
  const gramosNacional = isJewelryBusiness
    ? productosInventario.reduce((sum, p) => {
      const meta = getMetadata(p);
      if (meta?.jewelry_material_type !== 'local') return sum;
      const pesoPorUnidad = parseNumber(meta?.peso);
      const stock = getStockEfectivo(p);
      return sum + pesoPorUnidad * stock;
    }, 0)
    : 0;

  // Gramos Internacionales: jewelry_material_type === 'international'
  const gramosInternacional = isJewelryBusiness
    ? productosInventario.reduce((sum, p) => {
      const meta = getMetadata(p);
      if (meta?.jewelry_material_type !== 'international') return sum;
      const pesoPorUnidad = parseNumber(meta?.peso);
      const stock = getStockEfectivo(p);
      return sum + pesoPorUnidad * stock;
    }, 0)
    : 0;

  const stats = [
    {
      id: 'total',
      label: 'Total Productos',
      value: totalProductos,
      icon: Package,
      color: 'primary',
      format: (val) => val.toLocaleString('es-CO')
    },
    {
      id: 'stock',
      label: 'Stock Total',
      value: totalStock,
      icon: Box,
      color: 'primary',
      format: (val) => parseFloat(val).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    },
    {
      id: 'costo',
      label: 'Costo en Stock',
      value: costoEnStock,
      icon: DollarSign,
      color: 'info',
      format: (val) => `$${Number(val).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    },
    {
      id: 'utilidad',
      label: 'Utilidad Potencial',
      value: utilidadEnStock,
      icon: TrendingUp,
      color: 'success',
      format: (val) => `$${Number(val).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    },
    {
      id: 'margen',
      label: 'Margen de Utilidad',
      value: parseFloat(margenUtilidad),
      icon: Percent,
      color: 'success',
      format: (val) => `${val}%`
    },
    {
      id: 'stock-bajo',
      label: 'Stock Bajo',
      value: cantidadStockBajo,
      icon: AlertTriangle,
      color: 'warning',
      format: (val) => val.toLocaleString('es-CO'),
      onClick: () => navigate('/dashboard/inventario?stock=bajo')
    },
    {
      id: 'sin-stock',
      label: 'Sin Stock',
      value: cantidadSinStock,
      icon: AlertTriangle,
      color: 'danger',
      format: (val) => val.toLocaleString('es-CO'),
      onClick: () => navigate('/dashboard/inventario?stock=sin')
    },
    // Bullets de joyería (solo si es negocio de metales preciosos)
    ...(isJewelryBusiness ? [
      {
        id: 'gramos-nacional',
        label: 'Gramos Nacional',
        value: gramosNacional,
        icon: Scale,
        color: 'info',
        format: (val) => `${parseFloat(val).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} g`
      },
      {
        id: 'gramos-internacional',
        label: 'Gramos Internacional',
        value: gramosInternacional,
        icon: Scale,
        color: 'success',
        format: (val) => `${parseFloat(val).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} g`
      }
    ] : [])
  ];

  // Filtrar estadísticas sensibles para empleados
  const statsFiltradas = stats.filter(stat => {
    // Si no es owner ni admin, ocultar costos y utilidades
    const esEmpleado = isEmployeeMode || (userProfile?.role !== 'owner' && userProfile?.role !== 'admin');
    if (esEmpleado && ['costo', 'utilidad', 'margen'].includes(stat.id)) {
      return false;
    }
    return true;
  });

  return (
    <div className="inventario-stats-container">
      <div className="inventario-stats-grid">
        {statsFiltradas.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.id}
              className={`inventario-stat-card inventario-stat-${stat.color}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
              onClick={stat.onClick}
              style={stat.onClick ? { cursor: 'pointer' } : undefined}
            >
              <div className="inventario-stat-icon-wrapper">
                <Icon size={24} className="inventario-stat-icon" />
              </div>
              <div className="inventario-stat-content">
                <div className="inventario-stat-label">{stat.label}</div>
                <div className="inventario-stat-value">{stat.format(stat.value)}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default InventarioStats;
