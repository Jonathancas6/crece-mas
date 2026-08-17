import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ResumenVentas.css';
import { useAuth } from '../../context/AuthContext';
//import { useSubscription } from '../../hooks/useSubscription';
import FeatureGuard from '../../components/FeatureGuard';
import { useVentas } from '../../hooks/useVentas';
import { useProductos } from '../../hooks/useProductos';
import { useTeamMembers } from '../../hooks/useTeam';
import { useTheme } from '../../context/ThemeContext';
//import { useClientes } from '../../hooks/useClientes';
import { supabase } from '../../services/api/supabaseClient';
import { syncOutbox } from '../../utils/offlineQueue';
import {
  BarChart3,
  Download,
  RefreshCw,
  LayoutGrid,
  TrendingUp,
  Users,
  Package,
  ShoppingCart,
  Target,
  Award,
  Scale,
  X,
  CreditCard,
  Percent,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  ChevronRight,
  ChevronDown,
  Check
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { format, subDays, parseISO, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

// Componente para filtros de multiselección
const MultiSelectFilter = ({ label, options, selectedValues, onToggle, icon: Icon }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="cp-dropdown-filter" ref={containerRef}>
      <button
        className={`cp-select-minimal ${selectedValues.length > 0 ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '160px' }}
      >
        {Icon && <Icon size={14} />}
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedValues.length === 0
            ? label
            : selectedValues.length === 1
              ? selectedValues[0]
              : `${label}: ${selectedValues.length}`}
        </span>
        <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="cp-dropdown-menu"
          >
            <div className="cp-dropdown-items">
              {options.map(option => {
                const val = option.value !== undefined ? option.value : option;
                const labelText = option.label !== undefined ? option.label : option;
                const isSelected = selectedValues.includes(val);

                return (
                  <div
                    key={val}
                    className={`cp-dropdown-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => onToggle(val)}
                  >
                    <div className={`cp-checkbox ${isSelected ? 'checked' : ''}`}>
                      {isSelected && <Check size={12} />}
                    </div>
                    <span>{labelText}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ResumenVentas = () => {
  const { isDarkMode } = useTheme();
  const { userProfile, organization } = useAuth();
  const isJewelryBusiness = organization?.business_type === 'jewelry_metals';
  const weightUnit = organization?.jewelry_weight_unit || 'g';

  // Inicializar rango de fechas por defecto: "Hoy"
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const defaultFechaInicio = format(hoy, 'yyyy-MM-dd');
  const defaultFechaFin = format(hoy, 'yyyy-MM-dd');

  const [filtroFechaRapida, setFiltroFechaRapida] = useState('hoy');
  const [filtros, setFiltros] = useState({
    fechaInicio: defaultFechaInicio,
    fechaFin: defaultFechaFin,
    categoria: [],
    vendedor: [],
    metodoPago: [],
    cliente: []
  });

  // Hooks para obtener datos reales
  const { data: ventas = [], isLoading: cargandoVentas, refetch: refetchVentas } = useVentas(
    userProfile?.organization_id,
    5000, // Límite alto para análisis completo
    null, // historyDays
    null, // employeeId
    false, // includeCotizaciones
    filtros.fechaInicio,
    filtros.fechaFin
  );
  const { data: productos = [], isLoading: cargandoProductos, refetch: refetchProductos } = useProductos(userProfile?.organization_id);
  const { data: miembrosEquipo = [], isLoading: cargandoEquipo, refetch: refetchTeam } = useTeamMembers(userProfile?.organization_id);

  // --- OPTIMIZACIÓN: MAPAS DE BÚSQUEDA ---
  const miembrosMap = useMemo(() => {
    const map = {};
    miembrosEquipo.forEach(m => {
      map[String(m.id)] = m;
    });
    return map;
  }, [miembrosEquipo]);

  const [vistaActual, setVistaActual] = useState('general');
  const [mostrandoExportar, setMostrandoExportar] = useState(false);
  const [exportFechaInicio, setExportFechaInicio] = useState('');
  const [exportFechaFin, setExportFechaFin] = useState('');
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [tipoGrafico, setTipoGrafico] = useState('line'); // 'line' o 'bar'
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const dateDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutsideDate = (event) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target)) {
        setShowDateDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutsideDate);
    return () => document.removeEventListener('mousedown', handleClickOutsideDate);
  }, []);

  const toggleFiltro = (campo, valor) => {
    setFiltros(prev => {
      const current = prev[campo] || [];
      const isSelected = current.includes(valor);
      const next = isSelected
        ? current.filter(v => v !== valor)
        : [...current, valor];
      return { ...prev, [campo]: next };
    });
  };

  const limpiarFiltros = () => {
    setFiltros({ fechaInicio: '', fechaFin: '', categoria: [], vendedor: [], metodoPago: [], cliente: [] });
    setFiltroFechaRapida('todos');
    setTerminoBusqueda('');
  };

  const cargando = cargandoVentas || cargandoProductos || cargandoEquipo;

  // Formatear moneda
  const formatCOP = (amount) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatearValorVariacion = (value) => {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'boolean') {
      return value ? 'Si' : 'No';
    }
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const obtenerVariacionesItem = (item) => {
    const variaciones = item?.variaciones || item?.variaciones_seleccionadas;
    if (!variaciones || typeof variaciones !== 'object') return '';
    return Object.entries(variaciones)
      .map(([key, value]) => {
        const valorFormateado = formatearValorVariacion(value);
        if (!valorFormateado) return null;
        return `${key}: ${valorFormateado}`;
      })
      .filter(Boolean)
      .join(' | ');
  };

  const obtenerToppingsItem = (item) => {
    const toppings = item?.toppings || item?.toppings_seleccionados || [];
    if (!Array.isArray(toppings) || toppings.length === 0) return '';
    return toppings.map((topping) => {
      if (typeof topping === 'string') return topping;
      if (topping?.nombre) return topping.nombre;
      if (topping?.id) return topping.id;
      return String(topping);
    }).join(', ');
  };

  // Función para normalizar nombre de vendedor (definida antes de su uso)
  const normalizarNombreVendedor = useCallback((nombre) => {
    if (!nombre) return 'Vendedor desconocido';

    // Normalizar: quitar espacios extra, convertir a minúsculas para comparación
    const nombreNormalizado = nombre.trim().toLowerCase();

    // Si el nombre tiene variantes conocidas, normalizarlas
    // Por ejemplo: "jonathan-9411" y "Jonathan" deberían agruparse
    // Eliminar guiones, números al final, etc.
    const nombreLimpio = nombreNormalizado
      .replace(/-\d+$/, '') // Eliminar guión seguido de números al final
      .replace(/[_-]/g, ' ') // Reemplazar guiones y guiones bajos con espacios
      .trim();

    // Capitalizar primera letra de cada palabra
    return nombreLimpio
      .split(' ')
      .map(palabra => palabra.charAt(0).toUpperCase() + palabra.slice(1))
      .join(' ');
  }, []);

  // --- RESOLUCIÓN DE NOMBRES DE VENDEDOR ---
  // Estrategia: fetch directo a la BD por los IDs exactos encontrados en ventas.
  // Esto es más fiable que depender de miembrosEquipo.
  const [nombresEmpleados, setNombresEmpleados] = useState({}); // employee_id -> nombre
  const [nombresUsuarios, setNombresUsuarios] = useState({});   // user_id -> nombre

  useEffect(() => {
    if (!ventas.length) return;

    // Recolectar IDs únicos de empleados
    const empIds = [...new Set(ventas.map(v => v.employee_id).filter(Boolean).map(String))];
    if (empIds.length > 0) {
      supabase
        .from('team_members')
        .select('id, employee_name, user_id')
        .in('id', empIds)
        .then(({ data }) => {
          if (data) {
            // Para cada miembro, buscar su nombre: primero employee_name,
            // si no tiene (es un usuario con login), buscar en miembrosEquipo
            const map = {};
            data.forEach(m => {
              const nombreDeBD = m.employee_name;
              if (nombreDeBD) {
                map[String(m.id)] = nombreDeBD;
              } else {
                // Buscar en miembrosEquipo (ya tienen el full_name del perfil)
                const miembro = miembrosEquipo.find(eq => String(eq.id) === String(m.id));
                map[String(m.id)] = miembro?.nombre || miembro?.user_profiles?.full_name || 'Empleado';
              }
            });
            setNombresEmpleados(map);
          }
        });
    }

    // Recolectar IDs únicos de usuarios
    const userIds = [...new Set(ventas.map(v => v.user_id).filter(Boolean).map(String))];
    if (userIds.length > 0) {
      supabase
        .from('user_profiles')
        .select('user_id, full_name')
        .in('user_id', userIds)
        .then(({ data }) => {
          if (data) {
            const map = {};
            data.forEach(p => { map[String(p.user_id)] = p.full_name || 'Usuario'; });
            setNombresUsuarios(map);
          }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas.length]);

  const obtenerNombreVendedor = useCallback((venta) => {
    if (!venta) return 'Vendedor desconocido';

    // 1. Tiene employee_id → fetch directo de team_members o mapa optimizado
    if (venta.employee_id) {
      const empIdStr = String(venta.employee_id);
      const nombreCached = nombresEmpleados[empIdStr];
      if (nombreCached) return normalizarNombreVendedor(nombreCached);
      
      const miembro = miembrosMap[empIdStr];
      if (miembro) return normalizarNombreVendedor(miembro.employee_name || miembro.nombre || 'Empleado');
    }

    // 2. Tiene user_id → fetch directo de user_profiles
    if (venta.user_id) {
      const userIdStr = String(venta.user_id);
      const nombre = nombresUsuarios[userIdStr];
      if (nombre) return normalizarNombreVendedor(nombre);
      
      if (userProfile && userIdStr === String(userProfile.user_id)) {
        return normalizarNombreVendedor(userProfile.full_name || 'Administrador');
      }
    }

    return 'Vendedor desconocido';
  }, [nombresEmpleados, nombresUsuarios, normalizarNombreVendedor, miembrosMap, userProfile]);

  const productosMap = useMemo(() => {
    const map = { id: {}, codigo: {}, nombre: {} };
    productos.forEach(p => {
      if (p.id) map.id[String(p.id)] = p;
      if (p.codigo) map.codigo[String(p.codigo)] = p;
      if (p.nombre) map.nombre[p.nombre] = p;
      
      // Indexar también las variantes para que la búsqueda por ID y código funcione con variantes
      if (Array.isArray(p.variantes)) {
        p.variantes.forEach(v => {
          if (v.id) map.id[String(v.id)] = p;
          if (v.codigo) map.codigo[String(v.codigo)] = p;
        });
      }
    });
    return map;
  }, [productos]);

  // Lista de vendedores únicos para los filtros (construida desde ventas reales)
  const vendedoresDisponibles = useMemo(() => {
    const nombresVistos = new Set();
    const lista = [];
    ventas.forEach(v => {
      let nombre = null;
      if (v.employee_id && nombresEmpleados[String(v.employee_id)]) {
        nombre = normalizarNombreVendedor(nombresEmpleados[String(v.employee_id)]);
      } else if (v.user_id && nombresUsuarios[String(v.user_id)]) {
        nombre = normalizarNombreVendedor(nombresUsuarios[String(v.user_id)]);
      }
      if (nombre && !nombresVistos.has(nombre)) {
        nombresVistos.add(nombre);
        lista.push({ id: v.employee_id || v.user_id, nombre });
      }
    });
    return lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [ventas, nombresEmpleados, nombresUsuarios, normalizarNombreVendedor]);

  // Extraer datos reales para filtros
  const categoriasDisponibles = useMemo(() => {
    const categorias = new Set();
    
    // De los productos actuales (solo categorías activas)
    productos.forEach(producto => {
      if (producto.metadata?.categoria) {
        categorias.add(producto.metadata.categoria);
      }
    });

    const lista = Array.from(categorias).filter(c => c && c !== 'Sin categoría').sort();
    return [...lista, 'Sin categoría'];
  }, [productos]);

  // Función para normalizar método de pago (definida antes de su uso)
  const normalizarMetodoPago = useCallback((metodo) => {
    if (!metodo) return 'Sin método';

    // Normalizar "Mixto" - siempre mostrar solo "Mixto" sin detalle
    if (metodo === 'Mixto' || metodo?.startsWith('Mixto (')) {
      return 'Mixto';
    }

    // Normalizar capitalización para agrupar variantes
    const metodoNormalizado = metodo.toLowerCase().trim();

    switch (metodoNormalizado) {
      case 'efectivo':
        return 'Efectivo';
      case 'transferencia':
        return 'Transferencia';
      case 'tarjeta':
        return 'Tarjeta';
      case 'credito':
      case 'crédito':
        return 'Crédito';
      case 'nequi':
        return 'Nequi';
      case 'cotizacion':
      case 'cotización':
        return 'Cotización';
      case 'mixto':
        return 'Mixto';
      default:
        // Para métodos no estándar, usar la primera letra mayúscula
        return metodo.charAt(0).toUpperCase() + metodo.slice(1).toLowerCase();
    }
  }, []);

  const metodosPagoDisponibles = useMemo(() => {
    const metodosMap = new Map();

    ventas.forEach(venta => {
      if (venta.metodo_pago) {
        const metodoEstandar = normalizarMetodoPago(venta.metodo_pago);

        // Solo agregar si no existe ya
        if (!metodosMap.has(metodoEstandar)) {
          metodosMap.set(metodoEstandar, metodoEstandar);
        }
      }
    });

    // Ordenar métodos: primero los estándar, luego los demás
    const metodosEstandar = ['Efectivo', 'Transferencia', 'Tarjeta', 'Nequi', 'Mixto', 'Crédito', 'Cotización'];
    const otrosMetodos = Array.from(metodosMap.values())
      .filter(m => !metodosEstandar.includes(m))
      .sort();

    return [...metodosEstandar.filter(m => metodosMap.has(m)), ...otrosMetodos];
  }, [ventas, normalizarMetodoPago]);


  // Aplicar filtro de fecha rápida
  useEffect(() => {
    if (filtroFechaRapida === 'todos') {
      setFiltros(prev => ({ ...prev, fechaInicio: '', fechaFin: '' }));
    } else if (filtroFechaRapida !== 'personalizado') {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      let fechaInicio = '';
      let fechaFin = '';

      switch (filtroFechaRapida) {
        case 'hoy':
          fechaInicio = format(hoy, 'yyyy-MM-dd');
          fechaFin = format(hoy, 'yyyy-MM-dd');
          break;
        case 'ayer':
          const ayer = subDays(hoy, 1);
          fechaInicio = format(ayer, 'yyyy-MM-dd');
          fechaFin = format(ayer, 'yyyy-MM-dd');
          break;
        case 'semana':
          fechaInicio = format(subDays(hoy, 7), 'yyyy-MM-dd');
          fechaFin = format(hoy, 'yyyy-MM-dd');
          break;
        case 'mes':
          fechaInicio = format(subDays(hoy, 30), 'yyyy-MM-dd');
          fechaFin = format(hoy, 'yyyy-MM-dd');
          break;
        case 'trimestre':
          fechaInicio = format(subDays(hoy, 90), 'yyyy-MM-dd');
          fechaFin = format(hoy, 'yyyy-MM-dd');
          break;
        case 'quincena':
          fechaInicio = format(subDays(hoy, 15), 'yyyy-MM-dd');
          fechaFin = format(hoy, 'yyyy-MM-dd');
          break;
        default:
          break;
      }
      setFiltros(prev => ({ ...prev, fechaInicio, fechaFin }));
    }
  }, [filtroFechaRapida]);

  // Ventas filtradas — useMemo optimizado
  const ventasFiltradas = useMemo(() => {
    if (!ventas.length) return [];
    let resultado = ventas;

    // 1. Filtro de fechas (Pre-filtrado para reducir set de datos)
    if (filtros.fechaInicio || filtros.fechaFin) {
      let fInicio = null;
      let fFin = null;
      if (filtros.fechaInicio) {
        const [y, m, d] = filtros.fechaInicio.split('-').map(Number);
        fInicio = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
      }
      if (filtros.fechaFin) {
        const [y, m, d] = filtros.fechaFin.split('-').map(Number);
        fFin = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
      }

      resultado = resultado.filter(venta => {
        const t = new Date(venta.created_at).getTime();
        if (fInicio && t < fInicio) return false;
        if (fFin && t > fFin) return false;
        return true;
      });
    }

    // 2. Filtros de Categoría, Vendedor, Método, Cliente
    const hasCatFilter = filtros.categoria.length > 0;
    const hasVendedorFilter = filtros.vendedor.length > 0;
    const hasMetodoFilter = filtros.metodoPago.length > 0;
    const hasClienteFilter = filtros.cliente.length > 0;
    const hasSearch = terminoBusqueda.length > 0;

    if (hasCatFilter || hasVendedorFilter || hasMetodoFilter || hasClienteFilter || hasSearch) {
      const term = terminoBusqueda.toLowerCase();
      
      resultado = resultado.map(venta => {
        // Filtro Vendedor
        if (hasVendedorFilter) {
          if (!filtros.vendedor.includes(obtenerNombreVendedor(venta))) return null;
        }

        // Filtro Método Pago
        if (hasMetodoFilter) {
          const metodoNorm = normalizarMetodoPago(venta.metodo_pago);
          if (!filtros.metodoPago.includes(metodoNorm)) return null;
        }

        // Filtro Cliente
        if (hasClienteFilter) {
          if (!filtros.cliente.includes(venta.cliente_id)) return null;
        }

        // Filtro Búsqueda (Ticket/Cliente)
        const ticket = (venta.numero_venta || '').toLowerCase();
        const clienteNombre = (venta.cliente?.nombre || venta.cliente_nombre || '').toLowerCase();
        const matchBaseSearch = hasSearch && (ticket.includes(term) || clienteNombre.includes(term));

        // Procesar Items (para Categoría y Búsqueda por producto)
        if (!Array.isArray(venta.items)) return matchBaseSearch ? venta : null;

        // Clonar los items para no modificar el cache original en Supabase/Offline
        let matchingItems = (venta.items || []).map(it => ({ ...it }));
        if (hasCatFilter || hasSearch) {
          matchingItems = matchingItems.filter(item => {
            const prodId = String(item.id || item.producto_id);
            const prod = productosMap.id[prodId] || productosMap.codigo[String(item.codigo)] || productosMap.nombre[item.nombre];
            const vinculados = prod?.metadata?.productos_vinculados || item.metadata?.productos_vinculados;

            // Búsqueda por nombre de producto
            if (hasSearch && !matchBaseSearch) {
              let matchComponent = false;
              if (vinculados && Array.isArray(vinculados)) {
                matchComponent = vinculados.some(v => {
                  const vProd = productosMap.id[String(v.producto_id)];
                  const vNombre = String(v.producto_nombre || vProd?.nombre || '').toLowerCase();
                  return vNombre.includes(term);
                });
              }
              const itemNombre = String(item.nombre || '').toLowerCase();
              if (!itemNombre.includes(term) && !matchComponent) {
                return false;
              }
            }

            // Lógica de Categoría (con expansión de combos)
            if (hasCatFilter) {
              if (vinculados && Array.isArray(vinculados) && vinculados.length > 0) {
                // Es un combo, clasificar componentes físicos y no físicos
                let totalPhysicalValor = 0;
                let totalNonPhysicalValor = 0;
                let filteredPhysicalValor = 0;
                let filteredNonPhysicalValor = 0;

                vinculados.forEach(v => {
                  const vProd = productosMap.id[String(v.producto_id)];
                  const vPrecio = parseFloat(vProd?.precio_venta || 0);
                  const vCat = vProd?.metadata?.categoria || 'Sin categoría';
                  const vQty = parseFloat(v.cantidad || 1);
                  const vTotal = vPrecio * vQty;

                  const nameLower = String(v.producto_nombre || vProd?.nombre || '').toLowerCase();
                  const catLower = String(vCat).toLowerCase();
                  const isNonPhysical = nameLower.includes('mano de obra') || 
                                        nameLower.includes('margen') || 
                                        nameLower.includes('decorac') || 
                                        nameLower.includes('empaque') || 
                                        nameLower.includes('servicio') || 
                                        nameLower.includes('envio') || 
                                        nameLower.includes('envío') || 
                                        nameLower.includes('tarjeta') || 
                                        catLower.includes('mano de obra') || 
                                        catLower.includes('decoracion') || 
                                        catLower.includes('decoración') || 
                                        catLower.includes('servicios') || 
                                        catLower.includes('empaques');

                  if (isNonPhysical) {
                    totalNonPhysicalValor += vTotal;
                    if (filtros.categoria.includes(vCat)) {
                      filteredNonPhysicalValor += vTotal;
                    }
                  } else {
                    totalPhysicalValor += vTotal;
                    if (filtros.categoria.includes(vCat)) {
                      filteredPhysicalValor += vTotal;
                    }
                  }
                });

                let proporcion = 0;
                if (totalPhysicalValor > 0) {
                  // Si hay componentes físicos, el total filtrado es la porción física filtrada más su porción proporcional de no físicos
                  const propFisicaFiltrada = filteredPhysicalValor / totalPhysicalValor;
                  const valorFiltradoTeorico = filteredPhysicalValor + totalNonPhysicalValor * propFisicaFiltrada;
                  const totalValorTeorico = totalPhysicalValor + totalNonPhysicalValor;
                  proporcion = valorFiltradoTeorico / (totalValorTeorico || 1);
                } else if (totalNonPhysicalValor > 0) {
                  // Si solo hay componentes no físicos, usamos la proporción de no físicos filtrados
                  proporcion = filteredNonPhysicalValor / totalNonPhysicalValor;
                }

                if (proporcion > 0) {
                  const precioOriginal = parseFloat(item.precio_venta || item.precio || 0);
                  const qty = item.qty || item.cantidad || 1;
                  
                  // Clonar el item y ajustar sus valores de forma proporcional
                  item._proporcionFiltrada = proporcion;
                  item.precio_venta = precioOriginal * proporcion;
                  item.precio = precioOriginal * proporcion;
                  item.subtotal = (Number(item.subtotal) || (precioOriginal * qty)) * proporcion;
                  
                  return true;
                }
                return false;
              } else {
                // Producto normal
                const cat = prod 
                  ? (prod.metadata?.categoria || 'Sin categoría') 
                  : (item.categoria || item.metadata?.categoria || 'Sin categoría');
                return filtros.categoria.includes(cat);
              }
            }
            return true;
          });
        }

        if (matchingItems.length === 0 && !matchBaseSearch) return null;

        // Si hay filtros que afectan a los items (Categoría o Búsqueda), 
        // devolvemos una versión filtrada de la venta para que los totales y desgloses sean correctos
        if (hasCatFilter || hasSearch) {
          const nuevoTotal = matchingItems.reduce((acc, it) => acc + (Number(it.subtotal) || (Number(it.precio || it.precio_venta) * Number(it.qty || it.cantidad))), 0);
          return { ...venta, items: matchingItems, total: nuevoTotal };
        }

        return venta;
      }).filter(Boolean);
    }

    return resultado;
  }, [ventas, filtros, productosMap, normalizarMetodoPago, obtenerNombreVendedor, terminoBusqueda]);

  const filtrarVentasConRango = useCallback((fechaInicio, fechaFin) => {
    let ventasFiltradas = ventas;

    if (fechaInicio) {
      const [year, month, day] = fechaInicio.split('-');
      const fechaInicioDate = new Date(year, month - 1, day, 0, 0, 0, 0);

      ventasFiltradas = ventasFiltradas.filter(venta => {
        const fechaVenta = new Date(venta.created_at);
        // Comparar directamente los milisegundos en vez de modificar el objeto Date
        return fechaVenta.getTime() >= fechaInicioDate.getTime();
      });
    }

    if (fechaFin) {
      const [year, month, day] = fechaFin.split('-');
      const fechaFinDate = new Date(year, month - 1, day, 23, 59, 59, 999);

      ventasFiltradas = ventasFiltradas.filter(venta =>
        new Date(venta.created_at).getTime() <= fechaFinDate.getTime()
      );
    }

    // Filtro de categoría multiselección (No es necesario filtrar aquí si ya se hizo arriba, 
    // pero mantenemos consistencia por si esta función se usa fuera de ventasFiltradas)
    if (filtros.categoria.length > 0) {
      ventasFiltradas = ventasFiltradas.filter(venta => {
        if (!venta.items || !Array.isArray(venta.items)) return false;
        return venta.items.some(item => {
          const prodId = item.id || item.producto_id;
          const producto = productos.find(p => 
            String(p.id) === String(prodId) || 
            (item.codigo && String(p.codigo) === String(item.codigo))
          );
          const cat = producto 
            ? (producto.metadata?.categoria || 'Sin categoría') 
            : (item.categoria || item.metadata?.categoria || 'Sin categoría');
          return filtros.categoria.includes(cat);
        });
      });
    }

    if (filtros.vendedor.length > 0) {
      ventasFiltradas = ventasFiltradas.filter(venta => {
        const vendedorNombre = obtenerNombreVendedor(venta);
        return filtros.vendedor.includes(vendedorNombre);
      });
    }

    if (filtros.metodoPago.length > 0) {
      ventasFiltradas = ventasFiltradas.filter(venta => {
        if (!venta.metodo_pago) return false;
        const metodoNorm = normalizarMetodoPago(venta.metodo_pago);
        return filtros.metodoPago.includes(metodoNorm);
      });
    }

    if (filtros.cliente.length > 0) {
      ventasFiltradas = ventasFiltradas.filter(venta => filtros.cliente.includes(venta.cliente_id));
    }

    return ventasFiltradas;
  }, [ventas, filtros, productos, obtenerNombreVendedor, normalizarMetodoPago]);

  const exportarExcel = () => {
    construirArchivoVentas(ventasFiltradas, filtroFechaRapida);
  };

  const handleActualizar = async () => {
    try {
      toast.loading('Sincronizando datos...', { id: 'sync-ventas' });
      // 1. Sincronizar datos offline
      const { synced, failed } = await syncOutbox({ supabase });
      
      // 2. Refetch de datos principales
      await Promise.all([
        refetchVentas(),
        refetchProductos(),
        refetchTeam()
      ]);

      if (synced > 0) {
        toast.success(`Sincronizadas ${synced} ventas pendientes`, { id: 'sync-ventas' });
      } else if (failed > 0) {
        toast.error(`Error al sincronizar ${failed} registros`, { id: 'sync-ventas' });
      } else {
        toast.success('Datos actualizados', { id: 'sync-ventas' });
      }

    } catch (error) {
      console.error('Error al actualizar:', error);
      toast.error('Error al actualizar datos', { id: 'sync-ventas' });
      refetchVentas();
    }
  };

  const construirArchivoVentas = (ventasOrigen, etiqueta) => {
    if (!ventasOrigen || ventasOrigen.length === 0) {
      toast.error('No hay ventas para exportar');
      return;
    }

    const filas = ventasOrigen.flatMap((venta) => {
      const fechaVenta = venta.created_at || venta.fecha;
      const fechaObj = fechaVenta ? new Date(fechaVenta) : null;
      const fecha = fechaObj ? fechaObj.toLocaleDateString('es-CO') : '';
      const hora = fechaObj ? fechaObj.toLocaleTimeString('es-CO') : '';
      const clienteNombre = venta.cliente?.nombre || venta.cliente_nombre || '';
      const clienteDocumento = venta.cliente?.documento || '';
      const vendedorNombre = obtenerNombreVendedor(venta);
      const descuento = venta.descuento || {};
      const items = Array.isArray(venta.items) ? venta.items : [];

      const base = {
        'Venta ID': venta.id || '',
        'Numero Venta': venta.numero_venta || '',
        'Fecha': fecha,
        'Hora': hora,
        'Vendedor': vendedorNombre,
        'Cliente': clienteNombre,
        'Documento Cliente': clienteDocumento,
        'Metodo Pago': venta.metodo_pago || '',
        'Total Venta': parseFloat(venta.total || 0),
        'Subtotal Venta': parseFloat(venta.subtotal || 0),
        'Descuento Tipo': descuento.tipo || '',
        'Descuento Valor': descuento.valor || '',
        'Descuento Monto': parseFloat(descuento.monto || 0),
        'Pago Cliente': parseFloat(venta.pago_cliente || 0),
        'Detalle Pago Mixto': venta.detalles_pago_mixto ? JSON.stringify(venta.detalles_pago_mixto) : '',
        'Es Credito': venta.es_credito ? 'Si' : 'No',
        'Credito ID': venta.credito_id || '',
        'Notas Venta': venta.notas || ''
      };

      if (items.length === 0) {
        return [{
          ...base,
          'Item ID': '',
          'Item Codigo': '',
          'Item Nombre': '',
          'Cantidad': '',
          'Precio Unitario': '',
          'Precio Total Item': '',
          'Categoria': '',
          'Variaciones': '',
          'Toppings': '',
          'Notas Item': ''
        }];
      }

      return items.map((item) => {
        const productoId = item.id || item.producto_id;
        const codigo = item.codigo || '';
        const cantidad = item.qty || item.cantidad || 1;
        const precioUnitario = parseFloat(item.precio_venta || item.precio_unitario || item.precio || 0);
        const precioTotal = parseFloat(item.precio_total || (precioUnitario * cantidad));
        const producto = productos.find(p => p.id === productoId || (codigo && p.codigo === codigo));
        const categoria = producto?.metadata?.categoria || item.categoria || item.metadata?.categoria || 'Sin categoría';

        return {
          ...base,
          'Item ID': productoId || '',
          'Item Codigo': codigo,
          'Item Nombre': item.nombre || item.producto_nombre || 'Producto desconocido',
          'Cantidad': cantidad,
          'Precio Unitario': precioUnitario,
          'Precio Total Item': precioTotal,
          'Categoria': categoria,
          'Variante Nombre': item.variant_nombre || '',
          'Variante Codigo': item.variant_codigo || '',
          'Peso Unitario': isJewelryBusiness ? parseFloat(item.metadata?.peso || item.peso || 0) : '',
          'Peso Total': isJewelryBusiness ? (parseFloat(item.metadata?.peso || item.peso || 0) * cantidad) : '',
          'Variaciones': obtenerVariacionesItem(item),
          'Toppings': obtenerToppingsItem(item),
          'Notas Item': item.notas || item.notas_item || ''
        };
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(filas);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas');
    const fechaArchivo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(workbook, `ventas_detalladas_${etiqueta}_${fechaArchivo}.xlsx`);
  };

  const exportarVentasConRango = () => {
    if (exportFechaInicio && exportFechaFin) {
      const inicio = new Date(exportFechaInicio);
      const fin = new Date(exportFechaFin);
      if (inicio > fin) {
        toast.error('La fecha de inicio no puede ser mayor que la fecha final');
        return;
      }
    }

    const ventasFiltradas = filtrarVentasConRango(exportFechaInicio, exportFechaFin);
    const etiqueta = exportFechaInicio || exportFechaFin
      ? `${exportFechaInicio || 'inicio'}_a_${exportFechaFin || 'hoy'}`
      : 'completo';
    construirArchivoVentas(ventasFiltradas, etiqueta);
    setMostrandoExportar(false);
  };

  // Obtener productos más vendidos — optimizado con productosMap
  const productosMasVendidos = useMemo(() => {
    const productosVendidos = {};
    const hasCatFilter = filtros.categoria.length > 0;
    const term = terminoBusqueda.toLowerCase();
    const hasSearch = term.length > 0;

    ventasFiltradas.forEach(venta => {
      const itemsArr = Array.isArray(venta.items) ? venta.items : [];
      
      const totalItemsTeorico = itemsArr.reduce((sum, item) => {
        const qty = item.qty || item.cantidad || 1;
        const pv = parseFloat(item.precio_venta || item.precio || 0);
        return sum + (pv * qty);
      }, 0);

      const factorAjuste = totalItemsTeorico > 0 ? parseFloat(venta.total || 0) / totalItemsTeorico : 1;

      itemsArr.forEach(item => {
        const prodId = String(item.id || item.producto_id);
        const codigo = item.codigo;
        const qty = item.qty || item.cantidad || 1;
        const pv = parseFloat(item.precio_venta || item.precio || 0);
        const pc = parseFloat(item.precio_compra || 0);
        
        const totalItemAjustado = pv * qty * factorAjuste;

        const prod = productosMap.id[prodId] || productosMap.codigo[String(codigo)] || productosMap.nombre[item.nombre];
        const vinculados = prod?.metadata?.productos_vinculados || item.metadata?.productos_vinculados;

        if (vinculados && Array.isArray(vinculados) && vinculados.length > 0) {
          // 1. Identificar componentes físicos y no físicos
          const componentesConInfo = vinculados.map(v => {
            const vProd = productosMap.id[String(v.producto_id)];
            const vPrecio = parseFloat(v.precio_venta || vProd?.precio_venta || 0);
            const vCosto = parseFloat(v.precio_compra || vProd?.precio_compra || 0);
            const vCat = vProd?.metadata?.categoria || 'Sin categoría';
            const vQty = parseFloat(v.cantidad || 1);
            const vTotal = vPrecio * vQty;

            const nameLower = String(v.producto_nombre || vProd?.nombre || '').toLowerCase();
            const catLower = String(vCat).toLowerCase();
            const isNonPhysical = nameLower.includes('mano de obra') || 
                                  nameLower.includes('margen') || 
                                  nameLower.includes('decorac') || 
                                  nameLower.includes('empaque') || 
                                  nameLower.includes('servicio') || 
                                  nameLower.includes('envio') || 
                                  nameLower.includes('envío') || 
                                  nameLower.includes('tarjeta') || 
                                  catLower.includes('mano de obra') || 
                                  catLower.includes('decoracion') || 
                                  catLower.includes('decoración') || 
                                  catLower.includes('servicios') || 
                                  catLower.includes('empaques');

            return {
              producto_id: v.producto_id,
              categoria: vCat,
              nombre: v.producto_nombre || vProd?.nombre || 'Desconocido',
              valorTeorico: vTotal,
              costoUnitario: vCosto,
              cantidad: vQty,
              isNonPhysical
            };
          });

          // 2. Calcular totales teóricos
          let totalPhysicalValorTeorico = 0;
          let totalNonPhysicalValorTeorico = 0;
          componentesConInfo.forEach(comp => {
            if (comp.isNonPhysical) {
              totalNonPhysicalValorTeorico += comp.valorTeorico;
            } else {
              totalPhysicalValorTeorico += comp.valorTeorico;
            }
          });

          // Si no hay componentes físicos, considerar todos como físicos
          const realPhysicalTotal = totalPhysicalValorTeorico > 0 ? totalPhysicalValorTeorico : (totalPhysicalValorTeorico + totalNonPhysicalValorTeorico);

          // 3. Procesar solo los componentes físicos (los no físicos se distribuyen)
          componentesConInfo.forEach(comp => {
            if (comp.isNonPhysical && totalPhysicalValorTeorico > 0) {
              return;
            }

            const cat = comp.categoria;
            // Si hay un filtro de categoría, solo incluimos este componente si pertenece a las categorías filtradas
            if (hasCatFilter && !filtros.categoria.includes(cat)) {
              return;
            }
            if (hasSearch && !String(comp.nombre || '').toLowerCase().includes(term)) {
              return;
            }

            // Proporción del componente físico respecto al total físico
            const proporcionFisica = realPhysicalTotal > 0 ? comp.valorTeorico / realPhysicalTotal : 1;
            
            // Cantidad del producto (solo la del producto físico)
            const qtyAtribuido = comp.cantidad * qty;

            // Valores atribuidos que absorben el margen/mano de obra
            const propFiltrada = item._proporcionFiltrada !== undefined ? item._proporcionFiltrada : 1;
            const totalUnscaled = propFiltrada > 0 ? totalItemAjustado / propFiltrada : totalItemAjustado;

            const totalAtribuido = totalUnscaled * proporcionFisica;
            // El costo es estrictamente el costo unitario del componente físico
            const costoAtribuido = comp.costoUnitario * qtyAtribuido;
            const gananciaAtribuido = totalAtribuido - costoAtribuido;

            const pNombre = `${comp.nombre} (${item.nombre || 'Combo'})`;
            const key = `${comp.producto_id || comp.nombre}_${item.producto_id || item.codigo || item.nombre}`;

            if (productosVendidos[key]) {
              productosVendidos[key].cantidad += qtyAtribuido;
              productosVendidos[key].total += totalAtribuido;
              productosVendidos[key].costo += costoAtribuido;
              productosVendidos[key].ganancia += gananciaAtribuido;
            } else {
              productosVendidos[key] = {
                id: comp.producto_id,
                codigo: '',
                nombre: pNombre,
                cantidad: qtyAtribuido,
                total: totalAtribuido,
                costo: costoAtribuido,
                ganancia: gananciaAtribuido
              };
            }
          });
          return;
        }

        const pNombreNormal = prod ? prod.nombre : (item.nombre || '');
        const pCatNormal = prod 
          ? (prod.metadata?.categoria || 'Sin categoría') 
          : (item.categoria || item.metadata?.categoria || 'Sin categoría');
        
        const nameLowerNormal = String(pNombreNormal).toLowerCase();
        const catLowerNormal = String(pCatNormal).toLowerCase();
        const isNonPhysicalNormal = nameLowerNormal.includes('mano de obra') || 
                                    nameLowerNormal.includes('margen') || 
                                    nameLowerNormal.includes('decorac') || 
                                    nameLowerNormal.includes('empaque') || 
                                    nameLowerNormal.includes('servicio') || 
                                    nameLowerNormal.includes('envio') || 
                                    nameLowerNormal.includes('envío') || 
                                    nameLowerNormal.includes('tarjeta') || 
                                    catLowerNormal.includes('mano de obra') || 
                                    catLowerNormal.includes('decoracion') || 
                                    catLowerNormal.includes('decoración') || 
                                    catLowerNormal.includes('servicios') || 
                                    catLowerNormal.includes('empaques');

        // Producto normal
        const precioVenta = pv;
        let precioCompra = isNonPhysicalNormal ? 0 : pc;
        if (item._proporcionFiltrada !== undefined) {
          precioCompra = precioCompra * item._proporcionFiltrada;
        }
        const total = precioVenta * qty * factorAjuste;
        const costo = precioCompra * qty;
        const ganancia = total - costo;

        const infoProducto = prod;
        const codigoFinal = codigo || infoProducto?.codigo || '';
        const key = prodId !== 'undefined' ? prodId : (item.nombre || 'unknown');

        if (productosVendidos[key]) {
          productosVendidos[key].cantidad += qty;
          productosVendidos[key].total += total;
          productosVendidos[key].costo += costo;
          productosVendidos[key].ganancia += ganancia;
        } else {
          productosVendidos[key] = {
            id: prodId,
            codigo: codigoFinal,
            nombre: infoProducto?.nombre || item.nombre || 'Producto desconocido',
            cantidad: qty,
            total,
            costo,
            ganancia
          };
        }
      });
    });

    return Object.values(productosVendidos)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 50);
  }, [ventasFiltradas, productosMap, filtros.categoria, terminoBusqueda]);



  // Calcular métricas del período anterior para comparación
  const calcularMetricasPeriodoAnterior = useCallback((ventasActuales) => {
    if (!filtros.fechaInicio || !filtros.fechaFin) return { totalVentas: 0, cantidadVentas: 0 };

    const fechaInicio = new Date(filtros.fechaInicio);
    const fechaFin = new Date(filtros.fechaFin);
    const duracion = fechaFin - fechaInicio;

    const fechaInicioAnterior = new Date(fechaInicio);
    fechaInicioAnterior.setTime(fechaInicioAnterior.getTime() - duracion - 1);
    const fechaFinAnterior = new Date(fechaInicio);
    fechaFinAnterior.setTime(fechaFinAnterior.getTime() - 1);

    const ventasAnteriores = ventas.filter(venta => {
      const fechaVenta = new Date(venta.created_at);
      return fechaVenta >= fechaInicioAnterior && fechaVenta <= fechaFinAnterior;
    });

    const totalVentas = ventasAnteriores.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0);
    return {
      totalVentas,
      cantidadVentas: ventasAnteriores.length
    };
  }, [ventas, filtros.fechaInicio, filtros.fechaFin]);

  // Calcular métricas mejoradas
  const metricas = useMemo(() => {
    let costoTotal = 0;
    let ventaTotal = 0;
    const ventasPorDiaMap = {};

    let totalPeso = 0;

    ventasFiltradas.forEach(venta => {
      const dia = format(new Date(venta.created_at), 'yyyy-MM-dd');
      let totalVentaCalculado = parseFloat(venta.total || 0);
      
      // Intentar calcular el costo total y peso basado en items
      if (Array.isArray(venta.items)) {
        venta.items.forEach(item => {
          const cantidad = item.qty || item.cantidad || 1;
          let precioCompra = parseFloat(item.precio_compra || 0);
          if (item._proporcionFiltrada !== undefined) {
            precioCompra = precioCompra * item._proporcionFiltrada;
          }
          costoTotal += precioCompra * cantidad;
          
          if (isJewelryBusiness) {
            // El peso puede estar en item.metadata.peso o item.peso
            let pesoItem = parseFloat(item.metadata?.peso || item.peso || 0);
            if (item._proporcionFiltrada !== undefined) {
              pesoItem = pesoItem * item._proporcionFiltrada;
            }
            totalPeso += pesoItem * cantidad;
          }
        });
      }

      ventaTotal += totalVentaCalculado;
      ventasPorDiaMap[dia] = (ventasPorDiaMap[dia] || 0) + totalVentaCalculado;
    });

    const totalVentas = ventaTotal;
    const cantidadVentas = ventasFiltradas.length;
    const promedioVenta = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;

    let mejorDia = { fecha: '', total: 0 };
    Object.entries(ventasPorDiaMap).forEach(([fecha, total]) => {
      if (total > mejorDia.total) {
        mejorDia = { fecha, total };
      }
    });

    const utilidadReal = ventaTotal - costoTotal;
    const margenGanancia = ventaTotal > 0 ? (utilidadReal / ventaTotal) * 100 : 0;

    const periodoAnterior = calcularMetricasPeriodoAnterior(ventasFiltradas);
    const variacionVentas = periodoAnterior.totalVentas > 0
      ? ((totalVentas - periodoAnterior.totalVentas) / periodoAnterior.totalVentas) * 100
      : 0;

    // Horas Pico - Análisis de Intensidad (Ponderado por día de la semana)
    const flujoHorarioMap = {}; // { hora: { diasConActividad: Set, totalVentas: 0 } }

    ventasFiltradas.forEach(v => {
      const timestamp = v.created_at || v.fecha;
      if (!timestamp) return;
      try {
        const d = (typeof timestamp === 'string') ? parseISO(timestamp) : new Date(timestamp);
        if (!isNaN(d.getTime())) {
          const h = d.getHours();
          const diaUnico = format(d, 'yyyy-MM-dd');

          if (!flujoHorarioMap[h]) {
            flujoHorarioMap[h] = { dias: new Set(), transacciones: 0 };
          }
          flujoHorarioMap[h].dias.add(diaUnico);
          flujoHorarioMap[h].transacciones += 1;
        }
      } catch (err) { }
    });

    let horaPico = { hora: -1, intensidad: 0 };
    Object.keys(flujoHorarioMap).forEach(h => {
      const { dias, transacciones } = flujoHorarioMap[h];
      // Intensidad = Promedio de transacciones por cada día que hubo actividad en esa hora
      const intensidad = transacciones / (dias.size || 1);

      if (intensidad > horaPico.intensidad) {
        horaPico = { hora: parseInt(h), intensidad };
      }
    });

    const numDias = Object.keys(ventasPorDiaMap).length || 1;
    const promedioVentaDiaria = totalVentas / numDias;

    return {
      totalVentas,
      cantidadVentas,
      promedioVenta,
      utilidad: utilidadReal,
      margenGanancia,
      costoTotal,
      variacionVentas,
      periodoAnterior,
      mejorDia,
      promedioVentaDiaria,
      horaPico,
      totalPeso,
      utilidadPorGramo: totalPeso > 0 ? utilidadReal / totalPeso : 0,
      ventaPorGramo: totalPeso > 0 ? totalVentas / totalPeso : 0
    };
  }, [ventasFiltradas, calcularMetricasPeriodoAnterior, isJewelryBusiness]);

  // Obtener ventas por método de pago
  const obtenerVentasPorMetodoPago = useMemo(() => {
    const ventasPorMetodo = {};

    ventasFiltradas.forEach(venta => {
      const metodoOriginal = venta.metodo_pago || 'Efectivo';
      
      if (metodoOriginal.includes('{')) {
        // Caso Pago Mixto
        try {
          const mixto = JSON.parse(metodoOriginal);
          if (mixto && typeof mixto === 'object') {
            Object.entries(mixto).forEach(([metodo, valorStr]) => {
              if (valorStr) {
                const metodoNorm = normalizarMetodoPago(metodo);
                const valor = parseFloat(String(valorStr).replace(/[^\d.]/g, '')) || 0;
                if (valor > 0) {
                  if (!ventasPorMetodo[metodoNorm]) ventasPorMetodo[metodoNorm] = { cantidad: 0, total: 0 };
                  ventasPorMetodo[metodoNorm].total += valor;
                }
              }
            });
          }
        } catch (e) {}
      } else {
        // Pago simple
        const metodoNormalizado = normalizarMetodoPago(metodoOriginal);
        if (!ventasPorMetodo[metodoNormalizado]) {
          ventasPorMetodo[metodoNormalizado] = { cantidad: 0, total: 0 };
        }
        ventasPorMetodo[metodoNormalizado].cantidad += 1;
        ventasPorMetodo[metodoNormalizado].total += parseFloat(venta.total || 0);
      }
    });

    // Filtrar el item "Mixto" para que no aparezca en el resumen
    const rdo = Object.entries(ventasPorMetodo)
      .map(([metodo, data]) => ({ metodo, ...data }))
      .filter(m => m.metodo !== 'Mixto' && m.total > 0);

    // Ordenar: primero por total descendente, luego por nombre
    const metodosEstandar = ['Efectivo', 'Transferencia', 'Tarjeta', 'Nequi', 'Mixto', 'Crédito', 'Cotización'];

    return rdo
      .sort((a, b) => {
        // Primero ordenar por total descendente
        if (b.total !== a.total) {
          return b.total - a.total;
        }
        // Si tienen el mismo total, ordenar por orden estándar
        const indexA = metodosEstandar.indexOf(a.metodo);
        const indexB = metodosEstandar.indexOf(b.metodo);
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        // Si no están en la lista estándar, ordenar alfabéticamente
        return a.metodo.localeCompare(b.metodo);
      });
  }, [ventasFiltradas, normalizarMetodoPago]);

  // Obtener top clientes
  const obtenerTopClientes = useMemo(() => {
    const clientesMap = {};

    ventasFiltradas.forEach(venta => {
      if (venta.cliente_id && venta.cliente) {
        const clienteId = venta.cliente_id;
        if (!clientesMap[clienteId]) {
          clientesMap[clienteId] = {
            id: clienteId,
            nombre: venta.cliente.nombre || 'Cliente desconocido',
            cantidad: 0,
            total: 0
          };
        }
        clientesMap[clienteId].cantidad += 1;
        clientesMap[clienteId].total += parseFloat(venta.total || 0);
      }
    });

    return Object.values(clientesMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [ventasFiltradas]);


  const obtenerTopVendedores = useMemo(() => {
    const vendedoresMap = {};

    ventasFiltradas.forEach(venta => {
      const nombreNormalizado = normalizarNombreVendedor(obtenerNombreVendedor(venta));

      if (!vendedoresMap[nombreNormalizado]) {
        vendedoresMap[nombreNormalizado] = {
          id: nombreNormalizado,
          nombre: nombreNormalizado,
          cantidad: 0,
          total: 0
        };
      }
      vendedoresMap[nombreNormalizado].cantidad += 1;
      vendedoresMap[nombreNormalizado].total += parseFloat(venta.total || 0);
    });

    return Object.values(vendedoresMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [ventasFiltradas, normalizarNombreVendedor, obtenerNombreVendedor]);

  // Obtener flujo horario detallado
  const obtenerVentasPorHora = useMemo(() => {
    const horasMap = {};
    for (let i = 0; i < 24; i++) {
      horasMap[i] = { cantidad: 0, total: 0 };
    }

    ventasFiltradas.forEach(v => {
      const timestamp = v.created_at || v.fecha;
      if (!timestamp) return;
      try {
        const d = (typeof timestamp === 'string') ? parseISO(timestamp) : new Date(timestamp);
        if (!isNaN(d.getTime())) {
          const h = d.getHours();
          if (horasMap[h]) {
            horasMap[h].cantidad += 1;
            horasMap[h].total += parseFloat(v.total || 0);
          }
        }
      } catch (err) { }
    });

    return Object.entries(horasMap)
      .map(([hora, data]) => ({
        hora: parseInt(hora),
        label: `${hora}:00`,
        cantidad: data.cantidad,
        total: data.total,
        ticketPromedio: data.cantidad > 0 ? data.total / data.cantidad : 0
      }))
      .filter(h => h.cantidad > 0 || h.total > 0);
  }, [ventasFiltradas]);

  // Obtener ventas por día (basado en filtros de fecha)
  const ventasPorDia = useMemo(() => {
    // Determinar rango de fechas
    let fechaInicio, fechaFin;
    if (filtros.fechaInicio && filtros.fechaFin) {
      fechaInicio = parseISO(filtros.fechaInicio);
      fechaFin = parseISO(filtros.fechaFin);
    } else {
      fechaFin = new Date();
      fechaInicio = subDays(fechaFin, 30);
    }

    const esMismoDia = isSameDay(fechaInicio, fechaFin);

    if (esMismoDia) {
      // Si es el mismo día, agrupar por HORAS
      const ventasPorHora = {};
      for (let i = 0; i < 24; i++) {
        ventasPorHora[i] = { total: 0, cantidad: 0 };
      }

      ventasFiltradas.forEach(venta => {
        const d = parseISO(venta.created_at);
        const hora = d.getHours();
        if (ventasPorHora[hora]) {
          ventasPorHora[hora].total += parseFloat(venta.total || 0);
          ventasPorHora[hora].cantidad += 1;
        }
      });

      return Object.entries(ventasPorHora).map(([hora, data]) => ({
        fecha: `${filtros.fechaInicio}T${hora.padStart(2, '0')}:00:00`,
        total: data.total,
        cantidad: data.cantidad,
        fechaFormateada: `${hora}:00`,
        esPorHora: true
      }));
    } else {
      // Agrupar por DÍAS
      const ventasPorDiaMap = {};
      const fechaActual = new Date(fechaInicio);
      while (fechaActual <= fechaFin) {
        const fechaStr = format(fechaActual, 'yyyy-MM-dd');
        ventasPorDiaMap[fechaStr] = { total: 0, cantidad: 0 };
        fechaActual.setDate(fechaActual.getDate() + 1);
      }

      ventasFiltradas.forEach(venta => {
        const fechaVenta = format(parseISO(venta.created_at), 'yyyy-MM-dd');
        if (ventasPorDiaMap[fechaVenta]) {
          ventasPorDiaMap[fechaVenta].total += parseFloat(venta.total || 0);
          ventasPorDiaMap[fechaVenta].cantidad += 1;
        }
      });

      return Object.entries(ventasPorDiaMap)
        .map(([fecha, data]) => ({
          fecha,
          total: data.total,
          cantidad: data.cantidad,
          fechaFormateada: format(parseISO(fecha), 'dd/MM', { locale: es })
        }))
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    }
  }, [ventasFiltradas, filtros.fechaInicio, filtros.fechaFin]);


  const productosDetalle = useMemo(() => {
    const map = {};
    const hasCatFilter = filtros.categoria.length > 0;
    const term = terminoBusqueda.toLowerCase();
    const hasSearch = term.length > 0;

    ventasFiltradas.forEach(venta => {
      if (!Array.isArray(venta.items)) return;

      const totalItemsTeorico = venta.items.reduce((sum, item) => {
        const qty = item.qty || item.cantidad || 1;
        const pv = parseFloat(item.precio_venta || item.precio || 0);
        return sum + (pv * qty);
      }, 0);

      const factorAjuste = totalItemsTeorico > 0 ? parseFloat(venta.total || 0) / totalItemsTeorico : 1;

      venta.items.forEach(item => {
        const prodId = String(item.id || item.producto_id);
        const codigo = item.codigo;
        const qty = item.qty || item.cantidad || 1;
        const pv = parseFloat(item.precio_venta || item.precio || 0);
        const pc = parseFloat(item.precio_compra || 0);
        const pesoItem = parseFloat(item.metadata?.peso || item.peso || 0);
        
        const totalItemAjustado = pv * qty * factorAjuste;

        const prod = productosMap.id[prodId] || productosMap.codigo[String(codigo)] || productosMap.nombre[item.nombre];
        const vinculados = prod?.metadata?.productos_vinculados || item.metadata?.productos_vinculados;

        if (vinculados && Array.isArray(vinculados) && vinculados.length > 0) {
          // 1. Identificar componentes físicos y no físicos
          const componentesConInfo = vinculados.map(v => {
            const vProd = productosMap.id[String(v.producto_id)];
            const vPrecio = parseFloat(v.precio_venta || vProd?.precio_venta || 0);
            const vCosto = parseFloat(v.precio_compra || vProd?.precio_compra || 0);
            const vCat = vProd?.metadata?.categoria || 'Sin categoría';
            const vQty = parseFloat(v.cantidad || 1);
            const vTotal = vPrecio * vQty;
            const vPeso = parseFloat(vProd?.metadata?.peso || vProd?.peso || 0);

            const nameLower = String(v.producto_nombre || vProd?.nombre || '').toLowerCase();
            const catLower = String(vCat).toLowerCase();
            const isNonPhysical = nameLower.includes('mano de obra') || 
                                  nameLower.includes('margen') || 
                                  nameLower.includes('decorac') || 
                                  nameLower.includes('empaque') || 
                                  nameLower.includes('servicio') || 
                                  nameLower.includes('envio') || 
                                  nameLower.includes('envío') || 
                                  nameLower.includes('tarjeta') || 
                                  catLower.includes('mano de obra') || 
                                  catLower.includes('decoracion') || 
                                  catLower.includes('decoración') || 
                                  catLower.includes('servicios') || 
                                  catLower.includes('empaques');

            return {
              producto_id: v.producto_id,
              categoria: vCat,
              nombre: v.producto_nombre || vProd?.nombre || 'Desconocido',
              valorTeorico: vTotal,
              costoUnitario: vCosto,
              cantidad: vQty,
              peso: vPeso,
              isNonPhysical
            };
          });

          // 2. Calcular totales teóricos
          let totalPhysicalValorTeorico = 0;
          let totalNonPhysicalValorTeorico = 0;
          componentesConInfo.forEach(comp => {
            if (comp.isNonPhysical) {
              totalNonPhysicalValorTeorico += comp.valorTeorico;
            } else {
              totalPhysicalValorTeorico += comp.valorTeorico;
            }
          });

          // Si no hay componentes físicos, considerar todos como físicos
          const realPhysicalTotal = totalPhysicalValorTeorico > 0 ? totalPhysicalValorTeorico : (totalPhysicalValorTeorico + totalNonPhysicalValorTeorico);

          // 3. Procesar solo los componentes físicos
          componentesConInfo.forEach(comp => {
            if (comp.isNonPhysical && totalPhysicalValorTeorico > 0) {
              return;
            }

            const cat = comp.categoria;
            if (hasCatFilter && !filtros.categoria.includes(cat)) {
              return;
            }
            if (hasSearch && !String(comp.nombre || '').toLowerCase().includes(term)) {
              return;
            }

            const proporcionFisica = realPhysicalTotal > 0 ? comp.valorTeorico / realPhysicalTotal : 1;
            const qtyAtribuido = comp.cantidad * qty;

            const propFiltrada = item._proporcionFiltrada !== undefined ? item._proporcionFiltrada : 1;
            const totalUnscaled = propFiltrada > 0 ? totalItemAjustado / propFiltrada : totalItemAjustado;

            const totalAtribuido = totalUnscaled * proporcionFisica;
            const costoAtribuido = comp.costoUnitario * qtyAtribuido;
            const gananciaAtribuido = totalAtribuido - costoAtribuido;

            const pNombre = `${comp.nombre} (${item.nombre || 'Combo'})`;
            const key = `${comp.producto_id || comp.nombre}_${item.producto_id || item.codigo || item.nombre}`;

            if (map[key]) {
              map[key].cantidad += qtyAtribuido;
              map[key].total += totalAtribuido;
              map[key].costo += costoAtribuido;
              map[key].ganancia += gananciaAtribuido;
              map[key].pesoTotal += comp.peso * qtyAtribuido;
            } else {
              map[key] = {
                id: comp.producto_id,
                nombre: pNombre,
                categoria: cat,
                cantidad: qtyAtribuido,
                total: totalAtribuido,
                costo: costoAtribuido,
                ganancia: gananciaAtribuido,
                pesoTotal: comp.peso * qtyAtribuido
              };
            }
          });
          return;
        }

        // Producto normal
        const categoria = prod 
          ? (prod.metadata?.categoria || 'Sin categoría') 
          : (item.categoria || item.metadata?.categoria || 'Sin categoría');
        const nombreActual = prod ? prod.nombre : (item.nombre || 'Desconocido');

        const nameLowerNormal = String(nombreActual).toLowerCase();
        const catLowerNormal = String(categoria).toLowerCase();
        const isNonPhysicalNormal = nameLowerNormal.includes('mano de obra') || 
                                    nameLowerNormal.includes('margen') || 
                                    nameLowerNormal.includes('decorac') || 
                                    nameLowerNormal.includes('empaque') || 
                                    nameLowerNormal.includes('servicio') || 
                                    nameLowerNormal.includes('envio') || 
                                    nameLowerNormal.includes('envío') || 
                                    nameLowerNormal.includes('tarjeta') || 
                                    catLowerNormal.includes('mano de obra') || 
                                    catLowerNormal.includes('decoracion') || 
                                    catLowerNormal.includes('decoración') || 
                                    catLowerNormal.includes('servicios') || 
                                    catLowerNormal.includes('empaques');
        
        let precioCompra = isNonPhysicalNormal ? 0 : pc;
        if (item._proporcionFiltrada !== undefined) {
          precioCompra = precioCompra * item._proporcionFiltrada;
        }

        const total = pv * qty * factorAjuste;
        const costo = precioCompra * qty;
        const ganancia = total - costo;
        const key = prodId !== 'undefined' ? prodId : (item.nombre || 'unknown');

        if (map[key]) {
          map[key].cantidad += qty;
          map[key].total += total;
          map[key].costo += costo;
          map[key].ganancia += ganancia;
          map[key].pesoTotal += pesoItem * qty;
        } else {
          map[key] = {
            id: prodId,
            nombre: nombreActual,
            categoria,
            cantidad: qty,
            total,
            costo,
            ganancia,
            pesoTotal: pesoItem * qty
          };
        }
      });
    });

    return Object.values(map).sort((a, b) => b.cantidad - a.cantidad);
  }, [ventasFiltradas, productosMap, filtros.categoria, terminoBusqueda]);

  // Detalle por categoría con sus productos — optimizado con productosMap y lógica de combos
  const categoriasDetalle = useMemo(() => {
    const map = {};
    const hasCatFilter = filtros.categoria.length > 0;
    const term = terminoBusqueda.toLowerCase();
    const hasSearch = term.length > 0;
    ventasFiltradas.forEach(venta => {
      const totalVenta = parseFloat(venta.total || 0);
      
      if (!Array.isArray(venta.items) || venta.items.length === 0) {
        // Ignorar ventas sin items que tengan valor $0 (posibles registros basura o pruebas)
        if (totalVenta <= 0) return;
        
        // Venta sin items pero con valor (ej. venta rápida antigua o abono), asignar a "Sin categoría"
        const cat = 'Sin categoría';
        if (!map[cat]) map[cat] = { nombre: cat, cantidad: 0, total: 0, costo: 0, ganancia: 0, ventasSet: new Set(), productos: {} };
        map[cat].total += totalVenta;
        map[cat].cantidad += 1;
        map[cat].ganancia += totalVenta; // Sin costo conocido
        map[cat].ventasSet.add(venta.id);
        return;
      }
      
      // Calcular el total de los items para prorratear descuentos si el total de la venta es diferente
      const totalItemsTeorico = venta.items.reduce((sum, item) => {
        const qty = item.qty || item.cantidad || 1;
        const pv = parseFloat(item.precio_venta || item.precio || 0);
        return sum + (pv * qty);
      }, 0);

      const factorAjuste = totalItemsTeorico > 0 ? totalVenta / totalItemsTeorico : 1;

      venta.items.forEach(item => {
        const prodId = String(item.id || item.producto_id);
        const prod = productosMap.id[prodId] || productosMap.codigo[String(item.codigo)] || productosMap.nombre[item.nombre];
        const vinculados = prod?.metadata?.productos_vinculados || item.metadata?.productos_vinculados;
        const qty = item.qty || item.cantidad || 1;
        const pv = parseFloat(item.precio_venta || item.precio || 0);
        const pc = parseFloat(item.precio_compra || 0);
        const totalItemOriginal = pv * qty;
        const totalItemAjustado = totalItemOriginal * factorAjuste;
        const costoItem = pc * qty;

        if (vinculados && Array.isArray(vinculados) && vinculados.length > 0) {
          // 1. Identificar componentes físicos y no físicos
          const componentesConInfo = vinculados.map(v => {
            const vProd = productosMap.id[String(v.producto_id)];
            const vPrecio = parseFloat(v.precio_venta || vProd?.precio_venta || 0);
            const vCosto = parseFloat(v.precio_compra || vProd?.precio_compra || 0);
            const vCat = vProd?.metadata?.categoria || 'Sin categoría';
            const vQty = parseFloat(v.cantidad || 1);
            const vTotal = vPrecio * vQty;

            const nameLower = String(v.producto_nombre || vProd?.nombre || '').toLowerCase();
            const catLower = String(vCat).toLowerCase();
            const isNonPhysical = nameLower.includes('mano de obra') || 
                                  nameLower.includes('margen') || 
                                  nameLower.includes('decorac') || 
                                  nameLower.includes('empaque') || 
                                  nameLower.includes('servicio') || 
                                  nameLower.includes('envio') || 
                                  nameLower.includes('envío') || 
                                  nameLower.includes('tarjeta') || 
                                  catLower.includes('mano de obra') || 
                                  catLower.includes('decoracion') || 
                                  catLower.includes('decoración') || 
                                  catLower.includes('servicios') || 
                                  catLower.includes('empaques');

            return {
              producto_id: v.producto_id,
              categoria: vCat,
              nombre: v.producto_nombre || vProd?.nombre || 'Desconocido',
              valorTeorico: vTotal,
              costoUnitario: vCosto,
              cantidad: vQty,
              isNonPhysical
            };
          });

          // 2. Calcular totales teóricos
          let totalPhysicalValorTeorico = 0;
          let totalNonPhysicalValorTeorico = 0;
          componentesConInfo.forEach(comp => {
            if (comp.isNonPhysical) {
              totalNonPhysicalValorTeorico += comp.valorTeorico;
            } else {
              totalPhysicalValorTeorico += comp.valorTeorico;
            }
          });

          const realPhysicalTotal = totalPhysicalValorTeorico > 0 ? totalPhysicalValorTeorico : (totalPhysicalValorTeorico + totalNonPhysicalValorTeorico);

          // 3. Procesar solo los componentes físicos
          componentesConInfo.forEach(comp => {
            if (comp.isNonPhysical && totalPhysicalValorTeorico > 0) {
              return;
            }

            const cat = comp.categoria;
            if (hasCatFilter && !filtros.categoria.includes(cat)) {
              return;
            }
            if (hasSearch && !String(comp.nombre || '').toLowerCase().includes(term)) {
              return;
            }

            const proporcionFisica = realPhysicalTotal > 0 ? comp.valorTeorico / realPhysicalTotal : 1;
            const qtyAtribuido = comp.cantidad * qty;

            const propFiltrada = item._proporcionFiltrada !== undefined ? item._proporcionFiltrada : 1;
            const totalUnscaled = propFiltrada > 0 ? totalItemAjustado / propFiltrada : totalItemAjustado;

            const totalAtribuido = totalUnscaled * proporcionFisica;
            const costoAtribuido = comp.costoUnitario * qtyAtribuido;

            if (!map[cat]) map[cat] = { nombre: cat, cantidad: 0, total: 0, costo: 0, ganancia: 0, ventasSet: new Set(), productos: {} };

            map[cat].cantidad += qtyAtribuido;
            map[cat].total += totalAtribuido;
            map[cat].costo += costoAtribuido;
            map[cat].ganancia += (totalAtribuido - costoAtribuido);
            map[cat].ventasSet.add(venta.id);

            const pNombre = `${comp.nombre} (${item.nombre || 'Combo'})`;
            if (!map[cat].productos[pNombre]) map[cat].productos[pNombre] = { nombre: pNombre, cantidad: 0, total: 0, costo: 0 };
            map[cat].productos[pNombre].cantidad += qtyAtribuido;
            map[cat].productos[pNombre].total += totalAtribuido;
            map[cat].productos[pNombre].costo += costoAtribuido;
          });
          return;
        }

        // Flujo normal
        const pNombre = prod ? prod.nombre : (item.nombre || 'Desconocido');
        const cat = prod 
          ? (prod.metadata?.categoria || 'Sin categoría') 
          : (item.categoria || item.metadata?.categoria || 'Sin categoría');

        const nameLowerNormal = String(pNombre).toLowerCase();
        const catLowerNormal = String(cat).toLowerCase();
        const isNonPhysicalNormal = nameLowerNormal.includes('mano de obra') || 
                                    nameLowerNormal.includes('margen') || 
                                    nameLowerNormal.includes('decorac') || 
                                    nameLowerNormal.includes('empaque') || 
                                    nameLowerNormal.includes('servicio') || 
                                    nameLowerNormal.includes('envio') || 
                                    nameLowerNormal.includes('envío') || 
                                    nameLowerNormal.includes('tarjeta') || 
                                    catLowerNormal.includes('mano de obra') || 
                                    catLowerNormal.includes('decoracion') || 
                                    catLowerNormal.includes('decoración') || 
                                    catLowerNormal.includes('servicios') || 
                                    catLowerNormal.includes('empaques');

        const costoItemAjustado = isNonPhysicalNormal ? 0 : costoItem;

        if (!map[cat]) map[cat] = { nombre: cat, cantidad: 0, total: 0, costo: 0, ganancia: 0, ventasSet: new Set(), productos: {} };
        map[cat].cantidad += qty;
        map[cat].total += totalItemAjustado;
        map[cat].costo += costoItemAjustado;
        map[cat].ganancia += (totalItemAjustado - costoItemAjustado);
        map[cat].ventasSet.add(venta.id);
        
        if (!map[cat].productos[pNombre]) map[cat].productos[pNombre] = { nombre: pNombre, cantidad: 0, total: 0, costo: 0 };
        map[cat].productos[pNombre].cantidad += qty;
        map[cat].productos[pNombre].total += totalItemAjustado;
        map[cat].productos[pNombre].costo += costoItemAjustado;
      });
    });
    
    return Object.values(map).map(c => ({
      ...c, numVentas: c.ventasSet.size,
      productosArr: Object.values(c.productos).sort((a, b) => b.cantidad - a.cantidad)
    })).sort((a, b) => b.total - a.total);
  }, [ventasFiltradas, productosMap, filtros.categoria, terminoBusqueda]);

  // Ventas individuales ordenadas por fecha descendente
  const ventasIndividuales = useMemo(() =>
    [...ventasFiltradas].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [ventasFiltradas]
  );

  const [expandedCategoria, setExpandedCategoria] = useState(null);

  const vistas = [
    { id: 'general', nombre: 'Vista General', icono: LayoutGrid },
    { id: 'productos', nombre: 'Por Producto', icono: Package },
    { id: 'categoria', nombre: 'Por Categoría', icono: Target },
    { id: 'vendedor', nombre: 'Por Vendedor', icono: Users },
    { id: 'horario', nombre: 'Análisis Horario', icono: Clock },
    { id: 'cliente', nombre: 'Por Cliente', icono: ShoppingCart },
    { id: 'ventas', nombre: 'Detalle Ventas', icono: BarChart3 },
  ];


  // --- OPTIMIZACIÓN: SCROLL INFINITO (PAGINACIÓN VIRTUAL) ---
  const [visibleCountProductos, setVisibleCountProductos] = useState(50);
  const loadingObserverRefProductos = useRef(null);

  const [visibleCountVentas, setVisibleCountVentas] = useState(50);
  const loadingObserverRefVentas = useRef(null);

  // Reiniciar cantidad visible cuando cambian los filtros o la vista
  useEffect(() => {
    setVisibleCountProductos(50);
    setVisibleCountVentas(50);
  }, [vistaActual, filtros, filtroFechaRapida]);

  const handleObserverProductos = useCallback((entries) => {
    const target = entries[0];
    if (target.isIntersecting && visibleCountProductos < productosDetalle.length) {
      setVisibleCountProductos((prev) => Math.min(prev + 100, productosDetalle.length));
    }
  }, [visibleCountProductos, productosDetalle.length]);

  useEffect(() => {
    if (vistaActual !== 'productos') return;
    const option = { root: null, rootMargin: "800px", threshold: 0 };
    const observer = new IntersectionObserver(handleObserverProductos, option);
    if (loadingObserverRefProductos.current) observer.observe(loadingObserverRefProductos.current);
    return () => observer.disconnect();
  }, [handleObserverProductos, vistaActual]);

  const handleObserverVentas = useCallback((entries) => {
    const target = entries[0];
    if (target.isIntersecting && visibleCountVentas < ventasIndividuales.length) {
      setVisibleCountVentas((prev) => Math.min(prev + 100, ventasIndividuales.length));
    }
  }, [visibleCountVentas, ventasIndividuales.length]);

  useEffect(() => {
    if (vistaActual !== 'ventas') return;
    const option = { root: null, rootMargin: "800px", threshold: 0 };
    const observer = new IntersectionObserver(handleObserverVentas, option);
    if (loadingObserverRefVentas.current) observer.observe(loadingObserverRefVentas.current);
    return () => observer.disconnect();
  }, [handleObserverVentas, vistaActual]);

  const visibleProductos = useMemo(() => productosDetalle.slice(0, visibleCountProductos), [productosDetalle, visibleCountProductos]);
  const visibleVentas = useMemo(() => ventasIndividuales.slice(0, visibleCountVentas), [ventasIndividuales, visibleCountVentas]);






  // Insights Automáticos
  const automaticInsights = useMemo(() => {
    const insights = [];

    // Mejor día o Mejor hora (Solo si hay ventas reales)
    if (ventasPorDia.length > 0) {
      const mejorPeriodo = [...ventasPorDia].sort((a, b) => b.total - a.total)[0];
      const esPorHora = mejorPeriodo.esPorHora;
      
      if (mejorPeriodo.total > 0) {
        insights.push({
          title: esPorHora ? 'Mejor horario' : 'Rendimiento diario',
          text: esPorHora 
            ? `Las ${mejorPeriodo.fechaFormateada} fue tu hora de mayores ventas con ${formatCOP(mejorPeriodo.total)}.`
            : `El ${format(parseISO(mejorPeriodo.fecha), "EEEE d 'de' MMMM", { locale: es })} fue tu mejor día con ${formatCOP(mejorPeriodo.total)}.`,
          icon: <TrendingUp size={18} />,
          color: 'var(--cp-primary)'
        });
      }
    }

    // Método de pago estrella
    if (obtenerVentasPorMetodoPago.length > 0) {
      const principal = obtenerVentasPorMetodoPago[0];
      insights.push({
        title: 'Método preferido',
        text: `${principal.metodo} es el método más usado con ${principal.cantidad} transacciones.`,
        icon: <CreditCard size={18} />,
        color: 'var(--cp-success)'
      });
    }


    // Hora pico
    if (metricas.horaPico.hora !== -1) {
      insights.push({
        title: 'Hora pico',
        text: `A las ${metricas.horaPico.hora}:00 se registra el mayor volumen según actividad.`,
        icon: <Clock size={18} />,
        color: 'var(--cp-primary)'
      });
    }

    if (isJewelryBusiness && metricas.totalPeso > 0) {
      insights.push({
        title: 'Eficiencia de Material',
        text: `Estás generando ${formatCOP(metricas.ventaPorGramo)} por cada ${weightUnit} vendido.`,
        icon: <Scale size={18} />,
        color: 'var(--cp-warning)'
      });
    }

    return insights;
  }, [ventasPorDia, obtenerVentasPorMetodoPago, metricas.horaPico.hora, isJewelryBusiness, metricas.totalPeso, metricas.ventaPorGramo, weightUnit]);

  if (cargando) {
    return (
      <div className="cp-loading-overlay">
        <div className="cp-spinner"></div>
        <p>Procesando datos...</p>
      </div>
    );
  }

  return (
    <FeatureGuard
      feature="advancedReports"
      recommendedPlan="professional"
      showInline={false}
    >
      <div className="crece-plus-dashboard">
        {/* Sticky Top Container */}
        <div className="cp-sticky-top">
          {/* Header Section */}
          <header className="cp-header animate-fade-in" style={{ marginBottom: '1rem', paddingBottom: '0.75rem' }}>
            <div className="cp-header-left">
              <h1>Resumen de Ventas</h1>
              <p>Monitorea y analiza el rendimiento de tu negocio en tiempo real.</p>
            </div>

            <div className="cp-header-actions">
              <div className="cp-view-selector-header">
                {vistas.map(v => (
                  <button
                    key={v.id}
                    className={`cp-view-tab ${vistaActual === v.id ? 'active' : ''}`}
                    onClick={() => setVistaActual(v.id)}
                    title={v.nombre}
                  >
                    <v.icono size={18} />
                    <span>{v.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          </header>

          {/* Row 1: Search + Date Selector + Clear */}
          <div className="cp-filter-row-1 animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div className="cp-search-bar" style={{ flex: 1, minWidth: '300px' }}>
              <Search size={18} />
              <input
                type="text"
                placeholder="Buscar productos, clientes o transacciones..."
                value={terminoBusqueda}
                onChange={(e) => setTerminoBusqueda(e.target.value)}
              />
            </div>

            <div className="cp-dropdown-date-container" ref={dateDropdownRef}>
              <button 
                className={`cp-date-trigger-btn ${showDateDropdown ? 'active' : ''}`}
                onClick={() => setShowDateDropdown(!showDateDropdown)}
              >
                <Clock size={16} />
                <span>Fecha: <strong>{filtroFechaRapida.charAt(0).toUpperCase() + filtroFechaRapida.slice(1)}</strong></span>
                <ChevronDown size={14} style={{ transform: showDateDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {showDateDropdown && (
                <div className="cp-date-dropdown-content" style={{ display: 'flex' }}>
                  {[
                    { id: 'todos', label: 'Todo' },
                    { id: 'hoy', label: 'Hoy' },
                    { id: 'ayer', label: 'Ayer' },
                    { id: 'semana', label: '7 días' },
                    { id: 'quincena', label: '15 días' },
                    { id: 'mes', label: 'Este mes' },
                    { id: 'personalizado', label: 'Personalizado' }
                  ].map(opcion => (
                    <button
                      key={opcion.id}
                      className={`cp-date-dropdown-item ${filtroFechaRapida === opcion.id ? 'active' : ''}`}
                      onClick={() => {
                        setFiltroFechaRapida(opcion.id);
                        setShowDateDropdown(false);
                      }}
                    >
                      {opcion.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="cp-filter-divider-v" />

            <div className="cp-dropdown-filters-group">
              <MultiSelectFilter
                label="Categorías"
                options={categoriasDisponibles}
                selectedValues={filtros.categoria}
                onToggle={(val) => toggleFiltro('categoria', val)}
                icon={Package}
              />
              <MultiSelectFilter
                label="Métodos de Pago"
                options={metodosPagoDisponibles}
                selectedValues={filtros.metodoPago}
                onToggle={(val) => toggleFiltro('metodoPago', val)}
                icon={CreditCard}
              />
              <MultiSelectFilter
                label="Vendedor"
                options={vendedoresDisponibles.map(v => ({
                  value: normalizarNombreVendedor(v.nombre),
                  label: normalizarNombreVendedor(v.nombre)
                }))}
                selectedValues={filtros.vendedor}
                onToggle={(val) => toggleFiltro('vendedor', val)}
                icon={Users}
              />
            </div>

            <div className="cp-filter-divider-v" />

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button 
                className={`cp-btn-actualizar-icon ${cargandoVentas ? 'loading' : ''}`} 
                onClick={handleActualizar} 
                title="Actualizar Datos"
                disabled={cargandoVentas}
              >
                <RefreshCw size={16} />
              </button>

              <button className="cp-btn-limpiar-main" onClick={limpiarFiltros} title="Limpiar Filtros">
                <X size={16} />
              </button>

              <button className="cp-btn-export" onClick={exportarExcel} title="Exportar Excel">
                <Download size={16} />
              </button>
            </div>
          </div>

          {filtroFechaRapida === 'personalizado' && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="cp-custom-range-row"
            >
              <div className="cp-custom-range-inner">
                <span className="cp-range-label">Rango personalizado:</span>
                <div className="cp-range-inputs">
                  <input 
                    type="date" 
                    value={filtros.fechaInicio} 
                    onChange={(e) => setFiltros({ ...filtros, fechaInicio: e.target.value })} 
                    className="cp-input-date-small" 
                  />
                  <div className="cp-range-dash" />
                  <input 
                    type="date" 
                    value={filtros.fechaFin} 
                    onChange={(e) => setFiltros({ ...filtros, fechaFin: e.target.value })} 
                    className="cp-input-date-small" 
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Row 2: KPI Targets (Moved up and enlarged) */}
          <div className="cp-kpi-grid-large animate-fade-in" style={{ animationDelay: '0.2s' }}>
            {[
              { label: 'Ventas Totales', value: formatCOP(metricas.totalVentas), icon: <ShoppingCart />, color: 'var(--cp-primary)', trend: `${metricas.variacionVentas >= 0 ? '+' : ''}${metricas.variacionVentas.toFixed(1)}%`, isUp: metricas.variacionVentas >= 0 },
              { label: 'Utilidad Real', value: formatCOP(metricas.utilidad), icon: <Award />, color: 'var(--cp-success)', trend: '+12.5%', isUp: true },
              isJewelryBusiness 
                ? { label: `Peso Vendido (${weightUnit})`, value: `${metricas.totalPeso.toFixed(2)} ${weightUnit}`, icon: <Scale />, color: 'var(--cp-warning)', trend: 'Ponderado', isUp: true }
                : { label: 'Ticket Promedio', value: formatCOP(metricas.promedioVenta), icon: <TrendingUp />, color: 'var(--cp-primary)', trend: '+4.2%', isUp: true },
              isJewelryBusiness
                ? { label: `Venta por ${weightUnit}`, value: formatCOP(metricas.ventaPorGramo), icon: <TrendingUp />, color: 'var(--cp-primary)', trend: 'Eficiencia', isUp: true }
                : { label: 'Cantidad Ventas', value: metricas.cantidadVentas, icon: <Package />, color: 'var(--cp-warning)', trend: '-1.8%', isUp: false },
              { label: 'Margen Bruto', value: `${metricas.margenGanancia.toFixed(1)}%`, icon: <Percent />, color: 'var(--cp-primary)', trend: '+0.5%', isUp: true }
            ].map((kpi, idx) => (
              <div key={idx} className="cp-card cp-kpi-card-enhanced">
                <div className="cp-kpi-card-content">
                  <div className="cp-kpi-icon-box" style={{ background: `${kpi.color}12`, color: kpi.color }}>
                    {React.cloneElement(kpi.icon, { size: 18 })}
                  </div>
                  <div className="cp-kpi-info">
                    <div className="cp-kpi-top-row">
                      <span className="cp-kpi-label">{kpi.label}</span>
                      <div className={`cp-kpi-trend-compact ${kpi.isUp ? 'up' : 'down'}`}>
                        {kpi.isUp ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                        {kpi.trend}
                      </div>
                    </div>
                    <span className="cp-kpi-value">{kpi.value}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>


        {/* Content Section */}
        {/* Content Section: Split View Chart + Insights */}
        <div className="cp-analytics-split-view animate-fade-in" style={{ animationDelay: '0.2s' }}>
          {/* Left Side: Hero Analytics Section (3/4 width) */}
          <div className="cp-hero-container-split">
            <div className="cp-card cp-hero-card" style={{ height: '100%', marginBottom: 0 }}>
              <div className="cp-hero-header" style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>Rendimiento de Ventas</h3>
                  <div className="cp-hero-submetrics" style={{ border: 'none', padding: 0, margin: 0 }}>
                    <div className="sub-item" style={{ border: 'none' }}>
                      <Clock size={12} />
                      <span style={{ fontSize: '0.7rem' }}>Pico: <strong>{metricas.horaPico.hora !== -1 ? `${metricas.horaPico.hora}:00` : '--'}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="cp-hero-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                  <div className="cp-view-toggle">
                    <button
                      className={`toggle-btn ${tipoGrafico === 'line' ? 'active' : ''}`}
                      onClick={() => setTipoGrafico('line')}
                      title="Ver Línea"
                    >
                      <TrendingUp size={16} />
                    </button>
                    <button
                      className={`toggle-btn ${tipoGrafico === 'bar' ? 'active' : ''}`}
                      onClick={() => setTipoGrafico('bar')}
                      title="Ver Barras"
                    >
                      <BarChart3 size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--cp-text-muted)' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--cp-primary)', opacity: 0.6 }}></div>
                  <span>Ventas Diarias</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--cp-text-muted)' }}>
                  <div style={{ width: '12px', height: '2px', background: 'var(--cp-warning)', borderRadius: '10px' }}></div>
                  <span style={{ color: 'var(--cp-warning)' }}>{formatCOP(metricas.promedioVentaDiaria).split(',')[0]}</span>
                </div>
              </div>

              <div className="cp-hero-chart-container" style={{ height: '320px' }}>
                {tipoGrafico === 'line' ? (
                  <Line
                    plugins={[
                      {
                        id: 'customLabels',
                        afterDatasetsDraw: (chart) => {
                          const { ctx, data } = chart;
                          ctx.save();
                          ctx.font = 'bold 10px Inter, sans-serif';
                          ctx.fillStyle = isDarkMode ? '#94a3b8' : '#64748b';
                          ctx.textAlign = 'center';
                          ctx.textBaseline = 'bottom';
                          chart.getDatasetMeta(0).data.forEach((datapoint, index) => {
                            const value = data.datasets[0].data[index];
                            if (value > 0) {
                              const formattedValue = formatCOP(value).split(',')[0].replace('$', '');
                              ctx.fillText(`$${formattedValue}`, datapoint.x, datapoint.y - 8);
                            }
                          });

                          // Draw Average Line
                          const yScale = chart.scales.y;
                          const avgY = yScale.getPixelForValue(metricas.promedioVentaDiaria);
                          ctx.beginPath();
                          ctx.setLineDash([5, 5]);
                          ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
                          ctx.lineWidth = 1.5;
                          ctx.moveTo(chart.chartArea.left, avgY);
                          ctx.lineTo(chart.chartArea.right, avgY);
                          ctx.stroke();
                          ctx.setLineDash([]);
                          ctx.restore();
                        }
                      }
                    ]}
                    data={{
                      labels: ventasPorDia.map(d => d.fechaFormateada),
                      datasets: [{
                        label: 'Ventas',
                        data: ventasPorDia.map(d => d.total),
                        fill: true,
                        borderColor: 'var(--cp-primary)',
                        backgroundColor: (context) => {
                          const ctx = context.chart.ctx;
                          const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                          gradient.addColorStop(0, 'rgba(0, 102, 255, 0.12)');
                          gradient.addColorStop(1, 'rgba(0, 102, 255, 0)');
                          return gradient;
                        },
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: 'var(--cp-primary)',
                        pointBorderWidth: 2,
                        borderWidth: 3,
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      layout: { padding: { top: 30 } },
                      interaction: { intersect: false, mode: 'index' },
                      plugins: { 
                        legend: { display: false }, 
                        tooltip: { 
                          cornerRadius: 12, 
                          padding: 12, 
                          backgroundColor: isDarkMode ? '#1e293b' : '#fff', 
                          titleColor: isDarkMode ? '#f8fafc' : '#000', 
                          bodyColor: isDarkMode ? '#cbd5e1' : '#444', 
                          borderColor: isDarkMode ? '#334155' : '#eee', 
                          borderWidth: 1 
                        } 
                      },
                      scales: {
                        x: { grid: { display: false }, ticks: { color: isDarkMode ? '#94a3b8' : '#64748b', font: { size: 10 } } },
                        y: { display: true, grid: { color: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }, ticks: { color: isDarkMode ? '#94a3b8' : '#64748b', font: { size: 10 }, callback: (v) => formatCOP(v).split(',')[0] } }
                      }
                    }}
                  />
                ) : (
                  <Bar
                    plugins={[
                      {
                        id: 'customLabelsBar',
                        afterDatasetsDraw: (chart) => {
                          const { ctx, data } = chart;
                          ctx.save();
                          ctx.font = 'bold 10px Inter, sans-serif';
                          ctx.fillStyle = isDarkMode ? '#94a3b8' : '#64748b';
                          ctx.textAlign = 'center';
                          ctx.textBaseline = 'bottom';
                          chart.getDatasetMeta(0).data.forEach((datapoint, index) => {
                            const value = data.datasets[0].data[index];
                            if (value > 0) {
                              const formattedValue = formatCOP(value).split(',')[0].replace('$', '');
                              ctx.fillText(`$${formattedValue}`, datapoint.x, datapoint.y - 8);
                            }
                          });

                          const yScale = chart.scales.y;
                          const avgY = yScale.getPixelForValue(metricas.promedioVentaDiaria);
                          ctx.beginPath();
                          ctx.setLineDash([5, 5]);
                          ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
                          ctx.lineWidth = 1.5;
                          ctx.moveTo(chart.chartArea.left, avgY);
                          ctx.lineTo(chart.chartArea.right, avgY);
                          ctx.stroke();
                          ctx.restore();
                        }
                      }
                    ]}
                    data={{
                      labels: ventasPorDia.map(d => d.fechaFormateada),
                      datasets: [{
                        label: 'Ventas',
                        data: ventasPorDia.map(d => d.total),
                        backgroundColor: 'rgba(0, 102, 255, 0.6)',
                        borderRadius: 6,
                        hoverBackgroundColor: 'var(--cp-primary)',
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      layout: { padding: { top: 30 } },
                      plugins: { 
                        legend: { display: false },
                        tooltip: { 
                          cornerRadius: 12, 
                          padding: 12, 
                          backgroundColor: isDarkMode ? '#1e293b' : '#fff', 
                          titleColor: isDarkMode ? '#f8fafc' : '#000', 
                          bodyColor: isDarkMode ? '#cbd5e1' : '#444', 
                          borderColor: isDarkMode ? '#334155' : '#eee', 
                          borderWidth: 1 
                        }
                      },
                      scales: {
                        x: { grid: { display: false }, ticks: { color: isDarkMode ? '#94a3b8' : '#64748b', font: { size: 10 } } },
                        y: { display: true, grid: { color: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }, ticks: { color: isDarkMode ? '#94a3b8' : '#64748b', font: { size: 10 }, callback: (v) => formatCOP(v).split(',')[0] } }
                      }
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right Side: AI Insights (1/4 width) */}
          <div className="cp-insights-side-column">
            {automaticInsights.slice(0, 3).map((insight, idx) => (
              <div key={idx} className="cp-insight-card-v" style={{ borderLeft: `4px solid ${insight.color}` }}>
                <div className="cp-insight-icon-v" style={{ color: insight.color }}>{insight.icon}</div>
                <div className="cp-insight-body-v">
                  <h6>{insight.title}</h6>
                  <p>{insight.text}</p>
                </div>
              </div>
            ))}
            {metricas.margenGanancia > 0 && (
              <div className="cp-insight-card-v" style={{ borderLeft: '4px solid var(--cp-primary)', background: 'var(--cp-primary-soft)' }}>
                <div className="cp-insight-icon-v" style={{ color: 'var(--cp-primary)' }}><Award size={18} /></div>
                <div className="cp-insight-body-v">
                  <h6>Margen real</h6>
                  <p>{metricas.margenGanancia.toFixed(1)}% de utilidad bruta sobre ventas.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content Area */}


        {/* Main Content Area */}
        <div className="animate-fade-in" style={{ animationDelay: '0.4s' }}>
          {vistaActual === 'general' ? (
            <div className="cp-widgets-layout">
              {/* Columna Principal - Top Productos (Más amplio) */}
              <div className="cp-widgets-main-col">
                <div className="cp-card cp-ranking-card">
                  <h3 className="cp-widget-title" style={{ marginBottom: '1rem' }}><Package size={20} color="var(--cp-primary)" /> Top 10 Productos Más Vendidos</h3>
                  <div className="cp-ranking-list compact">
                    {productosMasVendidos.slice(0, 10).map((p, i) => (
                      <div key={i} className="cp-ranking-row two-lines">
                        <div className="cp-ranking-number">{i + 1}</div>
                        <div className="cp-ranking-content">
                          <div className="cp-ranking-main-info">
                            <span className="cp-ranking-name" title={p.nombre}>{p.nombre}</span>
                            <span className="cp-ranking-price">{formatCOP(p.total).split(',')[0]}</span>
                          </div>
                          <div className="cp-ranking-sub-info">
                            <span className="cp-ranking-code">{p.codigo || 'Sin código'}</span>
                            <span className="cp-ranking-units">{Math.round(p.cantidad)} unidades</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Columna Lateral - El resto de métricas apiladas */}
              <div className="cp-widgets-side-col">
                <div className="cp-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 className="cp-widget-title" style={{ margin: 0, fontSize: '0.9375rem' }}><Target size={18} color="var(--cp-success)" /> Ventas por Categoría</h3>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--cp-text-muted)' }}>{categoriasDetalle.length} Categorías</span>
                  </div>
                  
                  <div className="cp-table-mini-container">
                    <table className="cp-table-mini">
                      <thead>
                        <tr>
                          <th>Categoría</th>
                          <th style={{ textAlign: 'center' }}>Uds</th>
                          <th style={{ textAlign: 'right' }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoriasDetalle.slice(0, 6).map((cat, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{cat.nombre}</td>
                            <td style={{ textAlign: 'center' }}>{Math.round(cat.cantidad)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--cp-primary)' }}>{formatCOP(cat.total).split(',')[0]}</td>
                          </tr>
                        ))}
                      </tbody>
                      {categoriasDetalle.length > 0 && (
                        <tfoot>
                          <tr>
                            <td style={{ fontWeight: 800 }}>TOTAL</td>
                            <td style={{ textAlign: 'center', fontWeight: 800 }}>{Math.round(categoriasDetalle.reduce((acc, c) => acc + c.cantidad, 0))}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCOP(categoriasDetalle.reduce((acc, c) => acc + c.total, 0)).split(',')[0]}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  
                  {categoriasDetalle.length > 6 && (
                    <button 
                      onClick={() => setVistaActual('categoria')}
                      style={{ 
                        width: '100%', 
                        marginTop: '0.75rem', 
                        padding: '0.5rem', 
                        fontSize: '0.75rem', 
                        background: 'var(--cp-bg)', 
                        border: '1px solid var(--cp-border)',
                        borderRadius: '6px',
                        color: 'var(--cp-primary)',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Ver todas las categorías
                    </button>
                  )}
                </div>

                <div className="cp-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h3 className="cp-widget-title" style={{ margin: 0, fontSize: '0.9375rem' }}><CreditCard size={18} color="var(--cp-warning)" /> Métodos de Pago</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ height: '180px', flex: '1', position: 'relative' }}>
                      <Doughnut
                        data={{
                          labels: obtenerVentasPorMetodoPago.map(m => m.metodo),
                          datasets: [{
                            data: obtenerVentasPorMetodoPago.map(m => m.total),
                            backgroundColor: ['#02A5E0', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
                            borderWidth: 0,
                            cutout: '70%'
                          }]
                        }}
                        plugins={[{
                          id: 'pieLabels',
                          afterDraw(chart) {
                            const { ctx, data } = chart;
                            ctx.save();
                            chart.data.datasets.forEach((dataset, i) => {
                              chart.getDatasetMeta(i).data.forEach((datapoint, index) => {
                                const { x, y } = datapoint.tooltipPosition();
                                const value = data.datasets[0].data[index];
                                const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                                const percentage = ((value / total) * 100).toFixed(0) + '%';

                                if (parseFloat(percentage) > 8) {
                                  ctx.fillStyle = '#fff';
                                  ctx.font = 'bold 9px Inter';
                                  ctx.textAlign = 'center';
                                  ctx.textBaseline = 'middle';
                                  ctx.fillText(percentage, x, y);
                                }
                              });
                            });
                            ctx.restore();
                          }
                        }]}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { display: false },
                            tooltip: {
                              callbacks: {
                                label: (context) => {
                                  const val = context.raw;
                                  const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                  const pct = ((val / total) * 100).toFixed(1);
                                  return `${context.label}: ${formatCOP(val)} (${pct}%)`;
                                }
                              }
                            }
                          }
                        }}
                      />
                    </div>
                    <div style={{ flex: '1.2', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {obtenerVentasPorMetodoPago.map((m, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '4px 0', borderBottom: '1px solid var(--cp-border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: ['#02A5E0', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'][i % 6] }}></div>
                            <span style={{ fontWeight: 500, color: 'var(--cp-text-secondary)' }}>{m.metodo}</span>
                          </div>
                          <span style={{ fontWeight: 700, color: 'var(--cp-text-primary)' }}>{formatCOP(m.total).split(',')[0]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="cp-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                    <h3 className="cp-widget-title" style={{ margin: 0, fontSize: '0.9375rem' }}><Clock size={18} color="var(--cp-primary)" /> Flujo Horario</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--cp-warning)' }}>
                      <div style={{ width: '10px', height: '2px', background: 'var(--cp-warning)', borderRadius: '10px' }}></div>
                      <span>{(obtenerVentasPorHora.reduce((a, b) => a + b.cantidad, 0) / (obtenerVentasPorHora.length || 1)).toFixed(1)}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.65rem', color: 'var(--cp-text-muted)', marginBottom: '0.75rem' }}>
                    Basado en el volumen según actividad (transacciones) por hora.
                  </p>

                  <div style={{ height: '140px' }}>
                    <Bar
                      data={{
                        labels: obtenerVentasPorHora.map(h => h.label),
                        datasets: [{
                          data: obtenerVentasPorHora.map(h => h.cantidad),
                          backgroundColor: obtenerVentasPorHora.map(h =>
                            h.hora === metricas.horaPico.hora ? 'var(--cp-primary)' : (isDarkMode ? 'rgba(0, 102, 255, 0.3)' : 'rgba(0, 102, 255, 0.15)')
                          ),
                          borderRadius: 2
                        }]
                      }}
                      plugins={[{
                        id: 'averageLine',
                        afterDraw(chart) {
                          const { ctx, chartArea: { left, right }, scales: { y } } = chart;
                          const data = chart.data.datasets[0].data;
                          const avg = data.reduce((a, b) => a + b, 0) / (data.length || 1);
                          const yPos = y.getPixelForValue(avg);

                          ctx.save();
                          ctx.beginPath();
                          ctx.setLineDash([5, 5]);
                          ctx.moveTo(left, yPos);
                          ctx.lineTo(right, yPos);
                          ctx.lineWidth = 1.5;
                          ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
                          ctx.stroke();
                          ctx.restore();
                        }
                      }]}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          x: { grid: { display: false }, ticks: { color: isDarkMode ? '#94a3b8' : '#64748b', font: { size: 8 }, autoSkip: true, maxTicksLimit: 12 } },
                          y: { beginAtZero: true, grid: { color: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)' }, ticks: { color: isDarkMode ? '#94a3b8' : '#64748b', font: { size: 9 } } }
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : vistaActual === 'horario' ? (
            <div className="cp-horario-view-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="cp-card">
                <h3 className="cp-widget-title" style={{ marginBottom: '1.5rem' }}>
                  <BarChart3 size={20} color="var(--cp-primary)" /> Distribución Horaria de Ingresos
                </h3>
                <div style={{ height: '320px' }}>
                  <Bar
                    data={{
                      labels: obtenerVentasPorHora.map(h => h.label),
                      datasets: [{
                        label: 'Ventas Totales ($)',
                        data: obtenerVentasPorHora.map(h => h.total),
                        backgroundColor: 'rgba(59, 130, 246, 0.2)',
                        borderColor: 'rgb(59, 130, 246)',
                        borderWidth: 2,
                        borderRadius: 4,
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          callbacks: {
                            label: (context) => `Ventas: ${formatCOP(context.raw)}`
                          }
                        }
                      },
                      scales: {
                        x: { grid: { display: false } },
                        y: { 
                          beginAtZero: true,
                          ticks: { callback: (val) => formatCOP(val).split(',')[0] }
                        }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="cp-card">
                <div className="cp-table-container">
                  <table className="cp-table">
                    <thead>
                      <tr>
                        <th>Rango Horario</th>
                        <th style={{ textAlign: 'right' }}>Total Ventas</th>
                        <th style={{ textAlign: 'center' }}>Volumen (Trans.)</th>
                        <th style={{ textAlign: 'right' }}>Ticket Promedio</th>
                        <th style={{ textAlign: 'center' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {obtenerVentasPorHora.sort((a, b) => a.hora - b.hora).map((h, i) => {
                        const esPicoDinero = h.total === Math.max(...obtenerVentasPorHora.map(x => x.total));
                        const esPicoVolumen = h.cantidad === Math.max(...obtenerVentasPorHora.map(x => x.cantidad));

                        return (
                          <tr key={i} style={esPicoDinero ? { background: 'var(--cp-primary-soft)' } : {}}>
                            <td style={{ fontWeight: 700 }}>{h.label}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--cp-primary)' }}>{formatCOP(h.total)}</td>
                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{h.cantidad} vtas</td>
                            <td style={{ textAlign: 'right' }}>{formatCOP(h.ticketPromedio)}</td>
                            <td style={{ textAlign: 'center' }}>
                              {esPicoDinero && <span className="cp-badge cp-badge-primary" style={{ fontSize: '0.65rem' }}>MÁX. INGRESOS</span>}
                              {esPicoVolumen && !esPicoDinero && <span className="cp-badge cp-badge-success" style={{ fontSize: '0.65rem' }}>MÁX. VOLUMEN</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="cp-card">
              <div className="cp-table-container">
                <table className="cp-table">
                  {vistaActual === 'productos' && (
                      <>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Producto</th>
                            <th>Categoría</th>
                            <th>Unidades</th>
                            {isJewelryBusiness && <th>Peso Total</th>}
                            <th>Ingresos</th>
                            <th>Costo</th>
                            <th>Ganancia</th>
                          </tr>
                        </thead>
                      <tbody>
                        {visibleProductos.map((p, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td style={{ fontWeight: 700 }}>{p.nombre}</td>
                            <td style={{ textAlign: 'center' }}><span className="cp-badge cp-badge-primary">{p.categoria}</span></td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{Math.round(p.cantidad)}</td>
                            {isJewelryBusiness && <td style={{ textAlign: 'center' }}>{p.pesoTotal.toFixed(2)} {weightUnit}</td>}
                            <td style={{ textAlign: 'center' }}>{formatCOP(p.total)}</td>
                            <td style={{ textAlign: 'center' }}>{formatCOP(p.costo)}</td>
                            <td style={{ textAlign: 'center', color: 'var(--cp-success)', fontWeight: 700 }}>{formatCOP(p.ganancia)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}

                  {vistaActual === 'ventas' && (
                    <>
                      <thead>
                        <tr>
                          <th>Ticket</th>
                          <th>Fecha</th>
                          <th>Cliente</th>
                          <th>Vendedor</th>
                          {isJewelryBusiness && <th>Peso</th>}
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleVentas.map((v, i) => {
                          const pesoVenta = isJewelryBusiness && Array.isArray(v.items)
                            ? v.items.reduce((acc, it) => acc + (parseFloat(it.metadata?.peso || it.peso || 0) * (it.qty || it.cantidad || 1)), 0)
                            : 0;
                          
                          return (
                            <tr key={i}>
                              <td style={{ fontWeight: 700, color: 'var(--cp-primary)' }}>{v.numero_venta || `#${i + 1}`}</td>
                              <td>{v.created_at ? format(parseISO(v.created_at), 'dd MMM, HH:mm', { locale: es }) : '—'}</td>
                              <td>{v.cliente?.nombre || v.cliente_nombre || 'General'}</td>
                              <td>{obtenerNombreVendedor(v)}</td>
                              {isJewelryBusiness && <td style={{ textAlign: 'center', fontWeight: 600 }}>{pesoVenta.toFixed(2)} {weightUnit}</td>}
                              <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCOP(v.total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--cp-primary-soft)', borderTop: '2px solid var(--cp-primary)' }}>
                          <td colSpan={4} style={{ textAlign: 'right', fontWeight: 800, padding: '1rem' }}>TOTAL VENTAS</td>
                          <td style={{ textAlign: 'right', fontWeight: 900, color: 'var(--cp-primary)', fontSize: '1.1rem', padding: '1rem' }}>{formatCOP(metricas.totalVentas)}</td>
                        </tr>
                      </tfoot>
                    </>
                  )}

                  {vistaActual === 'categoria' && (
                    <>
                      <thead><tr><th>Categoría</th><th>Unidades</th><th>Ingresos</th><th>Costo</th><th>Ganancia</th><th style={{ textAlign: 'left' }}>Acciones</th></tr></thead>
                      <tbody>
                        {categoriasDetalle.map((cat, i) => (
                          <React.Fragment key={i}>
                            <tr>
                              <td style={{ fontWeight: 800 }}>{cat.nombre}</td>
                              <td style={{ textAlign: 'center' }}>{Math.round(cat.cantidad)}</td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>{formatCOP(cat.total)}</td>
                              <td style={{ textAlign: 'center' }}>{formatCOP(cat.costo)}</td>
                              <td style={{ textAlign: 'center', color: 'var(--cp-success)', fontWeight: 700 }}>{formatCOP(cat.ganancia)}</td>
                              <td style={{ textAlign: 'left' }}>
                                <button className="cp-chip" onClick={() => setExpandedCategoria(expandedCategoria === cat.nombre ? null : cat.nombre)}>
                                  {expandedCategoria === cat.nombre ? 'Ocultar' : 'Ver productos'} <ChevronRight size={14} style={{ transform: expandedCategoria === cat.nombre ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                                </button>
                              </td>
                            </tr>
                            <AnimatePresence>
                              {expandedCategoria === cat.nombre && (
                                <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                  <td colSpan={6} style={{ padding: 0, background: 'var(--cp-bg)' }}>
                                    <div style={{ padding: '1rem 2rem' }}>
                                      <table style={{ width: '100%', fontSize: '0.8125rem' }}>
                                        {cat.productosArr.map((p, idx) => (
                                          <tr key={idx} style={{ border: 'none' }}>
                                            <td style={{ padding: '0.5rem 0', color: 'var(--cp-text-secondary)' }}>↳ {p.nombre}</td>
                                            <td style={{ textAlign: 'center', fontWeight: 600 }}>{Math.round(p.cantidad)} uds</td>
                                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{formatCOP(p.total)}</td>
                                            <td style={{ textAlign: 'center' }}>{formatCOP(p.costo)}</td>
                                          </tr>
                                        ))}
                                      </table>
                                    </div>
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </React.Fragment>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--cp-bg)', borderTop: '3px solid var(--cp-border)' }}>
                          <td style={{ fontWeight: 900, padding: '1rem' }}>TOTAL GENERAL</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, padding: '1rem' }}>{Math.round(categoriasDetalle.reduce((acc, c) => acc + c.cantidad, 0))}</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, color: 'var(--cp-primary)', fontSize: '1rem', padding: '1rem' }}>{formatCOP(categoriasDetalle.reduce((acc, c) => acc + c.total, 0))}</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, padding: '1rem' }}>{formatCOP(categoriasDetalle.reduce((acc, c) => acc + c.costo, 0))}</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, color: 'var(--cp-success)', fontSize: '1rem', padding: '1rem' }}>{formatCOP(categoriasDetalle.reduce((acc, c) => acc + c.ganancia, 0))}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </>
                  )}

                  {vistaActual === 'vendedor' && (
                    <>
                      <thead><tr><th>Vendedor</th><th># Ventas</th><th>Ingresos Totales</th><th>Ticket Promedio</th></tr></thead>
                      <tbody>
                        {obtenerTopVendedores.map((v, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{v.nombre}</td>
                            <td style={{ textAlign: 'right' }}>{v.cantidad}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCOP(v.total)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCOP(v.total / v.cantidad)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}

                  {vistaActual === 'cliente' && (
                    <>
                      <thead><tr><th>Cliente</th><th># Compras</th><th>Total Gastado</th><th>Promedio/Ticket</th></tr></thead>
                      <tbody>
                        {obtenerTopClientes.map((c, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 700 }}>{c.nombre}</td>
                            <td style={{ textAlign: 'right' }}>{c.cantidad}</td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatCOP(c.total)}</td>
                            <td style={{ textAlign: 'right' }}>{formatCOP(c.total / c.cantidad)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  )}
                </table>

                {(vistaActual === 'productos' && visibleCountProductos < productosDetalle.length) && (
                  <div ref={loadingObserverRefProductos} style={{ padding: '2rem', textAlign: 'center', color: 'var(--cp-text-muted)', fontSize: '0.875rem' }}>
                    Cargando más registros...
                  </div>
                )}
                {(vistaActual === 'ventas' && visibleCountVentas < ventasIndividuales.length) && (
                  <div ref={loadingObserverRefVentas} style={{ padding: '2rem', textAlign: 'center', color: 'var(--cp-text-muted)', fontSize: '0.875rem' }}>
                    Cargando más ventas...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>


        <AnimatePresence>
          {mostrandoExportar && (
            <div className="cp-modal-overlay">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="cp-modal"
              >
                <div className="cp-modal-title">Exportar Análisis de Ventas</div>
                <p style={{ color: 'var(--cp-text-secondary)', marginBottom: '1.5rem', fontSize: '0.9375rem' }}>
                  Selecciona el rango de fechas para generar el reporte detallado en Excel.
                </p>

                <div style={{ display: 'grid', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cp-text-muted)', textTransform: 'uppercase' }}>Fecha de inicio</label>
                    <input
                      type="date"
                      className="cp-select-minimal"
                      style={{ width: '100%', padding: '0.75rem' }}
                      value={exportFechaInicio}
                      onChange={(e) => setExportFechaInicio(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--cp-text-muted)', textTransform: 'uppercase' }}>Fecha de fin</label>
                    <input
                      type="date"
                      className="cp-select-minimal"
                      style={{ width: '100%', padding: '0.75rem' }}
                      value={exportFechaFin}
                      onChange={(e) => setExportFechaFin(e.target.value)}
                    />
                  </div>
                </div>

                <div className="cp-modal-actions">
                  <button className="cp-btn cp-btn-secondary" onClick={() => setMostrandoExportar(false)}>Cancelar</button>
                  <button className="cp-btn cp-btn-primary" onClick={exportarVentasConRango}>Generar Excel</button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </FeatureGuard>
  );
};

export default ResumenVentas;
