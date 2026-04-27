import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import './ResumenVentas.css';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import FeatureGuard from '../../components/FeatureGuard';
import { useVentas } from '../../hooks/useVentas';
import { useProductos } from '../../hooks/useProductos';
import { useTeamMembers } from '../../hooks/useTeam';
import { useClientes } from '../../hooks/useClientes';
import { 
  BarChart3, 
  Download, 
  RefreshCw, 
  LayoutGrid,
  TrendingUp,
  Users,
  Package,
  DollarSign,
  ShoppingCart,
  Target,
  Award,
  X,
  CreditCard,
  Percent
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { format, subDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const ResumenVentas = () => {
  const { userProfile } = useAuth();
  const { hasFeature } = useSubscription();
  
  // Hooks para obtener datos reales
  const { data: ventas = [], isLoading: cargandoVentas, refetch: refetchVentas } = useVentas(
    userProfile?.organization_id, 
    5000, // Límite alto para análisis completo
    null // Sin límite de días para resumen completo
  );
  const { data: productos = [], isLoading: cargandoProductos } = useProductos(userProfile?.organization_id);
  const { data: miembrosEquipo = [], isLoading: cargandoEquipo } = useTeamMembers(userProfile?.organization_id);
  const { data: clientes = [], isLoading: cargandoClientes } = useClientes(userProfile?.organization_id);

  const [vistaActual, setVistaActual] = useState('general');
  const [filtroFechaRapida, setFiltroFechaRapida] = useState('todos');
  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    categoria: 'todas',
    vendedor: 'todos',
    metodoPago: 'todos',
    cliente: 'todos'
  });
  const [mostrandoExportar, setMostrandoExportar] = useState(false);
  const [exportFechaInicio, setExportFechaInicio] = useState('');
  const [exportFechaFin, setExportFechaFin] = useState('');

  const cargando = cargandoVentas || cargandoProductos || cargandoEquipo || cargandoClientes;

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

  // Obtener vendedores disponibles
  const vendedoresDisponibles = useMemo(() => {
    return miembrosEquipo.filter(m => m.is_employee || m.user_id).map(m => ({
      id: m.id,
      userId: m.user_id,
      nombre: m.nombre || m.user_profiles?.full_name || m.employee_name || 'Sin nombre',
      tipo: m.is_employee ? 'empleado' : 'usuario'
    }));
  }, [miembrosEquipo]);

  // Lista de vendedores normalizados para el filtro (agrupados)
  // IMPORTANTE: Esta debe estar definida antes de filtrarVentas
  const vendedoresDisponiblesNormalizados = useMemo(() => {
    const vendedoresMap = new Map();
    
    vendedoresDisponibles.forEach(vendedor => {
      const nombreNormalizado = normalizarNombreVendedor(vendedor.nombre);
      
      // Si ya existe un vendedor con este nombre normalizado, usar el primero
      if (!vendedoresMap.has(nombreNormalizado)) {
        vendedoresMap.set(nombreNormalizado, {
          id: nombreNormalizado,
          nombre: nombreNormalizado,
          // Guardar todos los IDs originales (team_member.id y user_id) que corresponden a este nombre
          idsOriginales: [vendedor.id, vendedor.userId].filter(Boolean).map(String)
        });
      } else {
        // Agregar los IDs originales a la lista si no están ya incluidos
        const existente = vendedoresMap.get(nombreNormalizado);
        [vendedor.id, vendedor.userId].forEach(id => {
          if (id && !existente.idsOriginales.includes(String(id))) {
            existente.idsOriginales.push(String(id));
          }
        });
      }
    });
    
    return Array.from(vendedoresMap.values()).sort((a, b) => 
      a.nombre.localeCompare(b.nombre)
    );
  }, [vendedoresDisponibles, normalizarNombreVendedor]);

  const obtenerNombreVendedor = useCallback((venta) => {
    if (!venta) return 'Vendedor desconocido';
    
    // Si la venta ya tiene el nombre procesado por el hook useVentas
    if (venta.vendedor_nombre || venta.usuario_nombre) {
      return normalizarNombreVendedor(venta.vendedor_nombre || venta.usuario_nombre);
    }

    // 1.5. "Quemar" el dato: si la descripción contiene el nombre del vendedor, usarlo
    if (venta.descripcion && venta.descripcion.startsWith('Vendedor: ')) {
      const nombreQuemado = venta.descripcion.replace('Vendedor: ', '');
      if (nombreQuemado) return normalizarNombreVendedor(nombreQuemado);
    }

    // Si no, intentar encontrarlo en los miembros del equipo
    const vendedor = vendedoresDisponibles.find(v => 
      (venta.employee_id && String(v.id) === String(venta.employee_id)) || 
      (!venta.employee_id && venta.user_id && String(v.userId) === String(venta.user_id))
    );
    
    const nombreOriginal = vendedor?.nombre || vendedor?.employee_name || 'Vendedor desconocido';
    return normalizarNombreVendedor(nombreOriginal);
  }, [vendedoresDisponibles, normalizarNombreVendedor]);

  // Extraer datos reales para filtros
  const categoriasDisponibles = useMemo(() => {
    const categorias = new Set();
    productos.forEach(producto => {
      if (producto.metadata?.categoria) {
        categorias.add(producto.metadata.categoria);
      }
    });
    return Array.from(categorias).sort();
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
    
    switch(metodoNormalizado) {
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
        default:
          break;
      }
      setFiltros(prev => ({ ...prev, fechaInicio, fechaFin }));
    }
  }, [filtroFechaRapida]);

  // Ventas filtradas — useMemo para que todos los datos derivados reaccionen
  // automáticamente cuando cambia cualquier filtro
  const ventasFiltradas = useMemo(() => {
    let resultado = ventas;

    // Filtro de fechas — parseamos con hora local para evitar desfase UTC
    if (filtros.fechaInicio) {
      const [y, m, d] = filtros.fechaInicio.split('-').map(Number);
      const fechaInicio = new Date(y, m - 1, d, 0, 0, 0, 0);
      resultado = resultado.filter(venta => new Date(venta.created_at) >= fechaInicio);
    }
    if (filtros.fechaFin) {
      const [y, m, d] = filtros.fechaFin.split('-').map(Number);
      const fechaFin = new Date(y, m - 1, d, 23, 59, 59, 999);
      resultado = resultado.filter(venta => new Date(venta.created_at) <= fechaFin);
    }

    // Filtro de categoría — la venta debe tener al menos un item de esa categoría
    if (filtros.categoria !== 'todas') {
      resultado = resultado.filter(venta => {
        if (!Array.isArray(venta.items)) return false;
        return venta.items.some(item => {
          const prod = productos.find(p => p.id === item.id || p.id === item.producto_id || p.codigo === item.codigo);
          return prod?.metadata?.categoria === filtros.categoria;
        });
      });
    }

    // Filtro de vendedor
    if (filtros.vendedor !== 'todos') {
      const sel = vendedoresDisponiblesNormalizados.find(v => v.id === filtros.vendedor);
      if (sel) {
        resultado = resultado.filter(venta =>
          (venta.employee_id && sel.idsOriginales.includes(String(venta.employee_id))) ||
          (!venta.employee_id && venta.user_id && sel.idsOriginales.includes(String(venta.user_id)))
        );
      }
    }

    // Filtro de método de pago
    if (filtros.metodoPago !== 'todos') {
      resultado = resultado.filter(venta => {
        if (!venta.metodo_pago) return false;
        const metodoNorm = normalizarMetodoPago(venta.metodo_pago).toLowerCase();
        return metodoNorm === filtros.metodoPago.toLowerCase();
      });
    }

    // Filtro de cliente
    if (filtros.cliente !== 'todos') {
      resultado = resultado.filter(venta => venta.cliente_id === filtros.cliente);
    }

    return resultado;
  }, [ventas, filtros, productos, vendedoresDisponiblesNormalizados, normalizarMetodoPago]);

  const filtrarVentasConRango = useCallback((fechaInicio, fechaFin) => {
    let ventasFiltradas = ventas;

    if (fechaInicio) {
      const fechaInicioDate = new Date(fechaInicio);
      fechaInicioDate.setHours(0, 0, 0, 0);
      ventasFiltradas = ventasFiltradas.filter(venta => {
        const fechaVenta = new Date(venta.created_at);
        fechaVenta.setHours(0, 0, 0, 0);
        return fechaVenta >= fechaInicioDate;
      });
    }

    if (fechaFin) {
      const fechaFinDate = new Date(fechaFin);
      fechaFinDate.setHours(23, 59, 59, 999);
      ventasFiltradas = ventasFiltradas.filter(venta =>
        new Date(venta.created_at) <= fechaFinDate
      );
    }

    if (filtros.categoria !== 'todas') {
      ventasFiltradas = ventasFiltradas.filter(venta => {
        if (!venta.items || !Array.isArray(venta.items)) return false;
        return venta.items.some(item => {
          const producto = productos.find(p => p.id === item.id || p.codigo === item.codigo);
          return producto?.metadata?.categoria === filtros.categoria;
        });
      });
    }

    if (filtros.vendedor !== 'todos') {
      const vendedorSeleccionado = vendedoresDisponiblesNormalizados.find(
        v => v.id === filtros.vendedor
      );
      if (vendedorSeleccionado) {
        ventasFiltradas = ventasFiltradas.filter(venta =>
          (venta.employee_id && vendedorSeleccionado.idsOriginales.includes(String(venta.employee_id))) || 
          (!venta.employee_id && venta.user_id && vendedorSeleccionado.idsOriginales.includes(String(venta.user_id)))
        );
      }
    }

    if (filtros.metodoPago !== 'todos') {
      ventasFiltradas = ventasFiltradas.filter(venta => {
        if (!venta.metodo_pago) return false;

        let metodoVenta = venta.metodo_pago;
        if (metodoVenta === 'Mixto' || metodoVenta?.startsWith('Mixto (')) {
          metodoVenta = 'Mixto';
        }

        const metodoVentaNormalizado = metodoVenta.toLowerCase().trim();
        const filtroNormalizado = filtros.metodoPago.toLowerCase().trim();
        return metodoVentaNormalizado === filtroNormalizado;
      });
    }

    if (filtros.cliente !== 'todos') {
      ventasFiltradas = ventasFiltradas.filter(venta =>
        venta.cliente_id === filtros.cliente
      );
    }

    return ventasFiltradas;
  }, [ventas, filtros, productos, vendedoresDisponiblesNormalizados]);

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

  // Obtener productos más vendidos — respeta el filtro de categoría a nivel de item
  const obtenerProductosMasVendidos = useMemo(() => {
    const productosVendidos = {};

    ventasFiltradas.forEach(venta => {
      if (!Array.isArray(venta.items)) return;
      venta.items.forEach(item => {
        const productoId = item.id || item.producto_id;
        const codigo = item.codigo;

        // Si hay filtro de categoría, ignorar items que no sean de esa categoría
        if (filtros.categoria !== 'todas') {
          const prod = productos.find(p => p.id === productoId || p.id === item.producto_id || p.codigo === codigo);
          if (prod?.metadata?.categoria !== filtros.categoria) return;
        }

        const cantidad = item.qty || 1;
        const precioVenta = parseFloat(item.precio_venta || item.precio || 0);
        const precioCompra = parseFloat(item.precio_compra || 0);
        const total = precioVenta * cantidad;
        const costo = precioCompra * cantidad;
        const ganancia = total - costo;

        if (productosVendidos[productoId]) {
          productosVendidos[productoId].cantidad += cantidad;
          productosVendidos[productoId].total += total;
          productosVendidos[productoId].costo += costo;
          productosVendidos[productoId].ganancia += ganancia;
        } else {
          productosVendidos[productoId] = {
            id: productoId,
            codigo,
            nombre: item.nombre || 'Producto desconocido',
            cantidad,
            total,
            costo,
            ganancia
          };
        }
      });
    });

    return Object.values(productosVendidos)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);
  }, [ventasFiltradas, filtros.categoria, productos]);

  const obtenerVariantesMasVendidas = useMemo(() => {
    const variantesMap = {};

    ventasFiltradas.forEach(venta => {
      if (venta.items && Array.isArray(venta.items)) {
        venta.items.forEach(item => {
          const nombreVariante = item.variant_nombre;
          if (!nombreVariante) return;
          const cantidad = item.qty || 1;
          const precioVenta = parseFloat(item.precio_venta || item.precio || 0);
          const total = precioVenta * cantidad;

          if (variantesMap[nombreVariante]) {
            variantesMap[nombreVariante].cantidad += cantidad;
            variantesMap[nombreVariante].total += total;
          } else {
            variantesMap[nombreVariante] = {
              nombre: nombreVariante,
              cantidad,
              total
            };
          }
        });
      }
    });

    return Object.values(variantesMap)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
  }, [ventasFiltradas]);

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
  const calcularMetricas = useMemo(() => {
    const totalVentas = ventasFiltradas.reduce((sum, venta) => sum + parseFloat(venta.total || 0), 0);
    const cantidadVentas = ventasFiltradas.length;
    const promedioVenta = cantidadVentas > 0 ? totalVentas / cantidadVentas : 0;

    let costoTotal = 0;
    let ventaTotal = 0;
    ventasFiltradas.forEach(venta => {
      if (Array.isArray(venta.items)) {
        venta.items.forEach(item => {
          const cantidad = item.qty || 1;
          const precioVenta = parseFloat(item.precio_venta || item.precio || 0);
          const precioCompra = parseFloat(item.precio_compra || 0);
          ventaTotal += precioVenta * cantidad;
          costoTotal += precioCompra * cantidad;
        });
      }
    });
    const utilidadReal = ventaTotal - costoTotal;
    const margenGanancia = ventaTotal > 0 ? (utilidadReal / ventaTotal) * 100 : 0;

    const periodoAnterior = calcularMetricasPeriodoAnterior(ventasFiltradas);
    const variacionVentas = periodoAnterior.totalVentas > 0
      ? ((totalVentas - periodoAnterior.totalVentas) / periodoAnterior.totalVentas) * 100
      : 0;

    return { totalVentas, cantidadVentas, promedioVenta, utilidad: utilidadReal, margenGanancia, costoTotal, variacionVentas, periodoAnterior };
  }, [ventasFiltradas, calcularMetricasPeriodoAnterior]);

  // Obtener ventas por método de pago
  const obtenerVentasPorMetodoPago = useMemo(() => {
    const ventasPorMetodo = {};
    
    ventasFiltradas.forEach(venta => {
      const metodoNormalizado = normalizarMetodoPago(venta.metodo_pago);
      
      if (!ventasPorMetodo[metodoNormalizado]) {
        ventasPorMetodo[metodoNormalizado] = { cantidad: 0, total: 0 };
      }
      ventasPorMetodo[metodoNormalizado].cantidad += 1;
      ventasPorMetodo[metodoNormalizado].total += parseFloat(venta.total || 0);
    });

    // Ordenar: primero por total descendente, luego por nombre
    const metodosEstandar = ['Efectivo', 'Transferencia', 'Tarjeta', 'Nequi', 'Mixto', 'Crédito', 'Cotización'];
    
    return Object.entries(ventasPorMetodo)
      .map(([metodo, data]) => ({ metodo, ...data }))
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
      const vendedorId = venta.employee_id || venta.user_id;
      if (vendedorId) {
        const vendedor = vendedoresDisponibles.find(v => 
          (venta.employee_id && v.id === venta.employee_id) || 
          (!venta.employee_id && v.userId === venta.user_id)
        );
        const nombreOriginal = vendedor?.nombre || venta.vendedor_nombre || venta.usuario_nombre || 'Vendedor desconocido';
        const nombreNormalizado = normalizarNombreVendedor(nombreOriginal);
        
        // Usar el nombre normalizado como clave para agrupar
        if (!vendedoresMap[nombreNormalizado]) {
          vendedoresMap[nombreNormalizado] = {
            id: nombreNormalizado, // Usar nombre normalizado como ID único
            nombre: nombreNormalizado,
            cantidad: 0,
            total: 0
          };
        }
        vendedoresMap[nombreNormalizado].cantidad += 1;
        vendedoresMap[nombreNormalizado].total += parseFloat(venta.total || 0);
      }
    });

    return Object.values(vendedoresMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [ventasFiltradas, vendedoresDisponibles, normalizarNombreVendedor]);

  // Obtener ventas por día (basado en filtros de fecha)
  const obtenerVentasPorDia = useMemo(() => {
    const ventasPorDia = {};
    
    // Determinar rango de fechas
    let fechaInicio, fechaFin;
    if (filtros.fechaInicio && filtros.fechaFin) {
      fechaInicio = new Date(filtros.fechaInicio);
      fechaFin = new Date(filtros.fechaFin);
    } else {
      // Si no hay filtros, mostrar últimos 30 días
      fechaFin = new Date();
      fechaInicio = subDays(fechaFin, 30);
    }

    // Crear array de días en el rango
    const fechaActual = new Date(fechaInicio);
    while (fechaActual <= fechaFin) {
      const fechaStr = format(fechaActual, 'yyyy-MM-dd');
      ventasPorDia[fechaStr] = { total: 0, cantidad: 0 };
      fechaActual.setDate(fechaActual.getDate() + 1);
    }

    // Sumar ventas reales
    ventasFiltradas.forEach(venta => {
      const fechaVenta = format(parseISO(venta.created_at), 'yyyy-MM-dd');
      if (ventasPorDia[fechaVenta]) {
        ventasPorDia[fechaVenta].total += parseFloat(venta.total || 0);
        ventasPorDia[fechaVenta].cantidad += 1;
      }
    });

    return Object.entries(ventasPorDia)
      .map(([fecha, data]) => ({ 
        fecha, 
        total: data.total,
        cantidad: data.cantidad,
        fechaFormateada: format(parseISO(fecha), 'dd/MM', { locale: es })
      }))
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  }, [ventasFiltradas, filtros.fechaInicio, filtros.fechaFin]);

  const metricas = calcularMetricas;
  const productosMasVendidos = obtenerProductosMasVendidos;
  const ventasPorDia = obtenerVentasPorDia;

  // Detalle completo de productos (sin límite de 10, con categoría)
  const productosDetalle = useMemo(() => {
    const map = {};
    ventasFiltradas.forEach(venta => {
      if (!Array.isArray(venta.items)) return;
      venta.items.forEach(item => {
        const productoId = item.id || item.producto_id;
        const codigo = item.codigo;
        if (filtros.categoria !== 'todas') {
          const prod = productos.find(p => p.id === productoId || p.codigo === codigo);
          if (prod?.metadata?.categoria !== filtros.categoria) return;
        }
        const prod = productos.find(p => p.id === productoId || p.codigo === codigo);
        const categoria = prod?.metadata?.categoria || 'Sin categoría';
        const qty = item.qty || 1;
        const pv = parseFloat(item.precio_venta || item.precio || 0);
        const pc = parseFloat(item.precio_compra || 0);
        const key = productoId || item.nombre || 'unknown';
        if (!map[key]) {
          map[key] = { id: productoId, nombre: item.nombre || 'Desconocido', categoria, cantidad: 0, total: 0, costo: 0, ganancia: 0 };
        }
        map[key].cantidad += qty;
        map[key].total += pv * qty;
        map[key].costo += pc * qty;
        map[key].ganancia += (pv - pc) * qty;
      });
    });
    return Object.values(map).sort((a, b) => b.cantidad - a.cantidad);
  }, [ventasFiltradas, filtros.categoria, productos]);

  // Detalle por categoría con sus productos
  const categoriasDetalle = useMemo(() => {
    const map = {};
    ventasFiltradas.forEach(venta => {
      if (!Array.isArray(venta.items)) return;
      venta.items.forEach(item => {
        const productoId = item.id || item.producto_id;
        const prod = productos.find(p => p.id === productoId || p.codigo === item.codigo);
        const cat = prod?.metadata?.categoria || 'Sin categoría';
        const qty = item.qty || 1;
        const pv = parseFloat(item.precio_venta || item.precio || 0);
        const pc = parseFloat(item.precio_compra || 0);
        if (!map[cat]) map[cat] = { nombre: cat, cantidad: 0, total: 0, ganancia: 0, ventasSet: new Set(), productos: {} };
        map[cat].cantidad += qty;
        map[cat].total += pv * qty;
        map[cat].ganancia += (pv - pc) * qty;
        map[cat].ventasSet.add(venta.id);
        const pNombre = item.nombre || 'Desconocido';
        if (!map[cat].productos[pNombre]) map[cat].productos[pNombre] = { nombre: pNombre, cantidad: 0, total: 0 };
        map[cat].productos[pNombre].cantidad += qty;
        map[cat].productos[pNombre].total += pv * qty;
      });
    });
    return Object.values(map).map(c => ({
      ...c, numVentas: c.ventasSet.size,
      productosArr: Object.values(c.productos).sort((a, b) => b.cantidad - a.cantidad)
    })).sort((a, b) => b.total - a.total);
  }, [ventasFiltradas, productos]);

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
    { id: 'cliente', nombre: 'Por Cliente', icono: ShoppingCart },
    { id: 'ventas', nombre: 'Detalle Ventas', icono: BarChart3 },
  ];

  if (cargando) {
    return (
      <div className="resumen-ventas-container">
        <div className="resumen-ventas-loading">
          <div className="loading-spinner"></div>
          <p>Cargando resumen de ventas...</p>
        </div>
      </div>
    );
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut"
      }
    }
  };

  // Estilos reutilizables para las tablas de detalle
  const rvTH = { padding: '10px 14px', textAlign: 'left', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid var(--border-color)', whiteSpace: 'nowrap' };
  const rvTD = { padding: '10px 14px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '0.875rem' };

  return (
    <FeatureGuard
      feature="advancedReports"
      recommendedPlan="professional"
      showInline={false}
    >
    <motion.div 
      className="resumen-ventas-container"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Encabezado */}
      <motion.div className="resumen-ventas-header" variants={itemVariants}>
        <motion.h1 
          className="resumen-ventas-title"
          variants={itemVariants}
        >
          <BarChart3 className="resumen-ventas-title-icon" />
          Resumen de Ventas
        </motion.h1>
        <motion.div className="resumen-ventas-actions" variants={itemVariants}>
          <motion.button 
            className="resumen-ventas-btn resumen-ventas-btn-outline" 
            onClick={() => refetchVentas()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <RefreshCw size={16} />
            Actualizar
          </motion.button>
          {hasFeature('exportData') ? (
            <motion.button 
              className="resumen-ventas-btn resumen-ventas-btn-outline"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMostrandoExportar(true)}
            >
              <Download size={16} />
              Exportar
            </motion.button>
          ) : (
            <motion.button 
              className="resumen-ventas-btn resumen-ventas-btn-outline"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
              onClick={() => toast.error('La exportación de datos está disponible en el plan Estándar')}
              title="🔒 Plan Estándar"
            >
              <Download size={16} />
              Exportar
            </motion.button>
          )}
        </motion.div>
      </motion.div>

      {mostrandoExportar && (
        <div className="resumen-ventas-modal-overlay">
          <div className="resumen-ventas-modal">
            <h3>Exportar ventas</h3>
            <p>Selecciona un rango de fechas para exportar.</p>
            <div className="resumen-ventas-modal-fields">
              <label>
                Fecha inicio
                <input
                  type="date"
                  value={exportFechaInicio}
                  onChange={(e) => setExportFechaInicio(e.target.value)}
                />
              </label>
              <label>
                Fecha fin
                <input
                  type="date"
                  value={exportFechaFin}
                  onChange={(e) => setExportFechaFin(e.target.value)}
                />
              </label>
            </div>
            <div className="resumen-ventas-modal-actions">
              <button
                type="button"
                className="resumen-ventas-btn resumen-ventas-btn-outline"
                onClick={() => setMostrandoExportar(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="resumen-ventas-btn resumen-ventas-btn-primary"
                onClick={exportarVentasConRango}
              >
                Exportar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selector de vistas */}
      <div className="resumen-ventas-vistas">
        {vistas.map((vista) => {
          const Icono = vista.icono;
          return (
            <button
              key={vista.id}
              className={`resumen-ventas-vista-btn ${vistaActual === vista.id ? 'active' : ''}`}
              onClick={() => setVistaActual(vista.id)}
            >
              <Icono size={16} />
              {vista.nombre}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="resumen-ventas-filtros">
        {/* Filtro rápido de fechas */}
        <div className="resumen-ventas-filtro-rapido">
          <span className="resumen-ventas-filtro-icon">📅</span>
          <select
            value={filtroFechaRapida}
            onChange={(e) => {
              setFiltroFechaRapida(e.target.value);
              if (e.target.value === 'personalizado') {
                setFiltros(prev => ({ ...prev, fechaInicio: '', fechaFin: '' }));
              }
            }}
            className="resumen-ventas-select"
          >
            <option value="todos">Todas las fechas</option>
            <option value="hoy">Hoy</option>
            <option value="ayer">Ayer</option>
            <option value="semana">Última semana</option>
            <option value="mes">Último mes</option>
            <option value="trimestre">Último trimestre</option>
            <option value="personalizado">Rango personalizado</option>
          </select>
        </div>

        {/* Filtros de rango personalizado */}
        {filtroFechaRapida === 'personalizado' && (
          <>
            <div className="resumen-ventas-filtro">
              <span className="resumen-ventas-filtro-icon">📅</span>
              <input
                type="date"
                value={filtros.fechaInicio}
                onChange={(e) => setFiltros({...filtros, fechaInicio: e.target.value})}
                className="resumen-ventas-input"
                placeholder="Desde"
              />
            </div>
            <div className="resumen-ventas-filtro">
              <span className="resumen-ventas-filtro-icon">📅</span>
              <input
                type="date"
                value={filtros.fechaFin}
                onChange={(e) => setFiltros({...filtros, fechaFin: e.target.value})}
                className="resumen-ventas-input"
                placeholder="Hasta"
              />
            </div>
          </>
        )}

        {/* Filtro de categoría (datos reales) */}
        {categoriasDisponibles.length > 0 && (
          <select
            value={filtros.categoria}
            onChange={(e) => setFiltros({...filtros, categoria: e.target.value})}
            className="resumen-ventas-select"
          >
            <option value="todas">Todas las categorías</option>
            {categoriasDisponibles.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}

        {/* Filtro de método de pago (datos reales) */}
        {metodosPagoDisponibles.length > 0 && (
          <select
            value={filtros.metodoPago}
            onChange={(e) => setFiltros({...filtros, metodoPago: e.target.value})}
            className="resumen-ventas-select"
          >
            <option value="todos">Todos los métodos</option>
            {metodosPagoDisponibles.map(metodo => (
              <option key={metodo} value={metodo}>{metodo}</option>
            ))}
          </select>
        )}

        {/* Filtro de vendedor (datos reales, normalizados) */}
        {vendedoresDisponiblesNormalizados.length > 0 && (
          <select
            value={filtros.vendedor}
            onChange={(e) => setFiltros({...filtros, vendedor: e.target.value})}
            className="resumen-ventas-select"
          >
            <option value="todos">Todos los vendedores</option>
            {vendedoresDisponiblesNormalizados.map(vendedor => (
              <option key={vendedor.id} value={vendedor.id}>{vendedor.nombre}</option>
            ))}
          </select>
        )}

        {/* Filtro de cliente (datos reales) */}
        {clientes.length > 0 && (
          <select
            value={filtros.cliente}
            onChange={(e) => setFiltros({...filtros, cliente: e.target.value})}
            className="resumen-ventas-select"
          >
            <option value="todos">Todos los clientes</option>
            {clientes.map(cliente => (
              <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>
            ))}
          </select>
        )}

        {/* Botón para limpiar filtros */}
        {(filtros.categoria !== 'todas' || filtros.vendedor !== 'todos' || 
          filtros.metodoPago !== 'todos' || filtros.cliente !== 'todos' || 
          filtroFechaRapida !== 'todos') && (
          <button 
            className="resumen-ventas-btn resumen-ventas-btn-outline"
            onClick={() => {
              setFiltroFechaRapida('todos');
              setFiltros({
                fechaInicio: '',
                fechaFin: '',
                categoria: 'todas',
                vendedor: 'todos',
                metodoPago: 'todos',
                cliente: 'todos'
              });
            }}
          >
            <X size={16} />
            Limpiar
          </button>
        )}
      </div>

      {/* Métricas rápidas */}
      <motion.div className="resumen-ventas-metricas" variants={itemVariants}>
        <motion.div 
          className="resumen-ventas-metrica"
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div className="resumen-ventas-metrica-icon">
            <DollarSign size={24} />
          </div>
          <div className="resumen-ventas-metrica-content">
            <p className="resumen-ventas-metrica-label">Total Ventas</p>
            <p className="resumen-ventas-metrica-value">{formatCOP(metricas.totalVentas)}</p>
            {metricas.variacionVentas !== 0 && (
              <p className={`resumen-ventas-metrica-variacion ${metricas.variacionVentas >= 0 ? 'positiva' : 'negativa'}`}>
                {metricas.variacionVentas >= 0 ? '↑' : '↓'} {Math.abs(metricas.variacionVentas).toFixed(1)}% vs período anterior
              </p>
            )}
          </div>
        </motion.div>
        <motion.div 
          className="resumen-ventas-metrica"
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div className="resumen-ventas-metrica-icon">
            <ShoppingCart size={24} />
          </div>
          <div className="resumen-ventas-metrica-content">
            <p className="resumen-ventas-metrica-label">Ventas</p>
            <p className="resumen-ventas-metrica-value">{metricas.cantidadVentas}</p>
          </div>
        </motion.div>
        <motion.div 
          className="resumen-ventas-metrica"
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div className="resumen-ventas-metrica-icon">
            <TrendingUp size={24} />
          </div>
          <div className="resumen-ventas-metrica-content">
            <p className="resumen-ventas-metrica-label">Promedio Venta</p>
            <p className="resumen-ventas-metrica-value">{formatCOP(metricas.promedioVenta)}</p>
          </div>
        </motion.div>
        <motion.div 
          className="resumen-ventas-metrica"
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div className="resumen-ventas-metrica-icon">
            <Award size={24} />
          </div>
          <div className="resumen-ventas-metrica-content">
            <p className="resumen-ventas-metrica-label">Utilidad Real</p>
            <p className="resumen-ventas-metrica-value resumen-ventas-utilidad">{formatCOP(metricas.utilidad)}</p>
            <p className="resumen-ventas-metrica-subtext">Margen: {metricas.margenGanancia.toFixed(1)}%</p>
          </div>
        </motion.div>
        <motion.div 
          className="resumen-ventas-metrica"
          whileHover={{ scale: 1.02 }}
          transition={{ duration: 0.2 }}
        >
          <div className="resumen-ventas-metrica-icon">
            <Percent size={24} />
          </div>
          <div className="resumen-ventas-metrica-content">
            <p className="resumen-ventas-metrica-label">Margen de Ganancia</p>
            <p className="resumen-ventas-metrica-value">{metricas.margenGanancia.toFixed(1)}%</p>
          </div>
        </motion.div>
      </motion.div>



      {/* ── VISTAS DE DETALLE ── */}
      {vistaActual === 'general' && (<>
        <motion.div className="resumen-ventas-graficos" variants={itemVariants}>
          <motion.div className="resumen-ventas-grafico" whileHover={{ scale: 1.01 }} transition={{ duration: 0.2 }}>
            <div className="resumen-ventas-grafico-header">
              <h3 className="resumen-ventas-grafico-title">Ventas por día</h3>
              <div className="resumen-ventas-grafico-stats"><span className="resumen-ventas-grafico-stat"><TrendingUp size={16} />{ventasPorDia.length} días</span></div>
            </div>
            <div className="resumen-ventas-grafico-content">
              {ventasPorDia.length > 0 ? (
                <Bar data={{ labels: ventasPorDia.map(d => d.fechaFormateada), datasets: [{ label: 'Ventas', data: ventasPorDia.map(d => d.total), backgroundColor: 'rgba(59,130,246,0.8)', borderColor: 'rgba(59,130,246,1)', borderWidth: 2, borderRadius: 8, borderSkipped: false }] }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `Ventas: ${formatCOP(ctx.parsed.y)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: v => formatCOP(v), color: 'var(--text-secondary)' }, grid: { color: 'rgba(229,231,235,0.5)' } }, x: { grid: { display: false }, ticks: { color: 'var(--text-secondary)' } } }, animation: { duration: 1500 } }} />
              ) : <div className="resumen-ventas-sin-datos"><BarChart3 size={48} /><p>No hay datos</p></div>}
            </div>
          </motion.div>
          <motion.div className="resumen-ventas-grafico" whileHover={{ scale: 1.01 }} transition={{ duration: 0.2 }}>
            <div className="resumen-ventas-grafico-header">
              <h3 className="resumen-ventas-grafico-title">Productos más vendidos</h3>
              <div className="resumen-ventas-grafico-stats"><span className="resumen-ventas-grafico-stat"><Package size={16} />{productosMasVendidos.length} productos</span></div>
            </div>
            <div className="resumen-ventas-grafico-content">
              {productosMasVendidos.length > 0 ? (
                <Doughnut data={{ labels: productosMasVendidos.slice(0,5).map(p => p.nombre), datasets: [{ data: productosMasVendidos.slice(0,5).map(p => p.cantidad), backgroundColor: ['rgba(59,130,246,0.8)','rgba(16,185,129,0.8)','rgba(245,158,11,0.8)','rgba(239,68,68,0.8)','rgba(139,92,246,0.8)'], borderWidth: 3, hoverOffset: 10 }] }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, color: 'var(--text-primary)' } }, tooltip: { callbacks: { label: ctx => { const t = ctx.dataset.data.reduce((a,b)=>a+b,0); return `${ctx.label}: ${ctx.parsed} uds (${((ctx.parsed/t)*100).toFixed(1)}%)`; } } } }, cutout: '60%', animation: { duration: 1500 } }} />
              ) : <div className="resumen-ventas-sin-datos"><Package size={48} /><p>No hay productos</p></div>}
            </div>
          </motion.div>
        </motion.div>
        <div className="resumen-ventas-rankings">
          {productosMasVendidos.length > 0 && (<motion.div className="resumen-ventas-ranking" variants={itemVariants}><h3 className="resumen-ventas-ranking-title"><Package size={20} />Productos más vendidos</h3><div className="resumen-ventas-ranking-content"><ul className="resumen-ventas-ranking-list">{productosMasVendidos.map((p,i)=><li key={p.id||i} className="resumen-ventas-ranking-item"><span className="resumen-ventas-ranking-position">{i+1}.</span><span className="resumen-ventas-ranking-nombre">{p.nombre}</span><span className="resumen-ventas-ranking-cantidad">{p.cantidad} uds</span><span className="resumen-ventas-ranking-total">{formatCOP(p.total)}</span></li>)}</ul></div></motion.div>)}
          {obtenerVariantesMasVendidas.length > 0 && (<motion.div className="resumen-ventas-ranking" variants={itemVariants}><h3 className="resumen-ventas-ranking-title"><Package size={20} />Variantes más vendidas</h3><div className="resumen-ventas-ranking-content"><ul className="resumen-ventas-ranking-list">{obtenerVariantesMasVendidas.map((v,i)=><li key={i} className="resumen-ventas-ranking-item"><span className="resumen-ventas-ranking-position">{i+1}.</span><span className="resumen-ventas-ranking-nombre">{v.nombre}</span><span className="resumen-ventas-ranking-cantidad">{v.cantidad} uds</span><span className="resumen-ventas-ranking-total">{formatCOP(v.total)}</span></li>)}</ul></div></motion.div>)}
          {obtenerVentasPorMetodoPago.length > 0 && (<motion.div className="resumen-ventas-ranking" variants={itemVariants}><h3 className="resumen-ventas-ranking-title"><CreditCard size={20} />Por Método de Pago</h3><div className="resumen-ventas-ranking-content"><ul className="resumen-ventas-ranking-list">{obtenerVentasPorMetodoPago.map((m,i)=><li key={m.metodo} className="resumen-ventas-ranking-item"><span className="resumen-ventas-ranking-position">{i+1}.</span><span className="resumen-ventas-ranking-nombre">{m.metodo}</span><span className="resumen-ventas-ranking-cantidad">{m.cantidad} transacciones</span><span className="resumen-ventas-ranking-total">{formatCOP(m.total)}</span></li>)}</ul></div></motion.div>)}
          {obtenerTopVendedores.length > 0 && (<motion.div className="resumen-ventas-ranking" variants={itemVariants}><h3 className="resumen-ventas-ranking-title"><Users size={20} />Top Vendedores</h3><div className="resumen-ventas-ranking-content"><ul className="resumen-ventas-ranking-list">{obtenerTopVendedores.map((v,i)=><li key={v.id} className="resumen-ventas-ranking-item"><span className="resumen-ventas-ranking-position">{i+1}.</span><span className="resumen-ventas-ranking-nombre">{v.nombre}</span><span className="resumen-ventas-ranking-cantidad">{v.cantidad} ventas</span><span className="resumen-ventas-ranking-total">{formatCOP(v.total)}</span></li>)}</ul></div></motion.div>)}
          {obtenerTopClientes.length > 0 && (<motion.div className="resumen-ventas-ranking" variants={itemVariants}><h3 className="resumen-ventas-ranking-title"><Users size={20} />Top Clientes</h3><div className="resumen-ventas-ranking-content"><ul className="resumen-ventas-ranking-list">{obtenerTopClientes.map((c,i)=><li key={c.id} className="resumen-ventas-ranking-item"><span className="resumen-ventas-ranking-position">{i+1}.</span><span className="resumen-ventas-ranking-nombre">{c.nombre}</span><span className="resumen-ventas-ranking-cantidad">{c.cantidad} compras</span><span className="resumen-ventas-ranking-total">{formatCOP(c.total)}</span></li>)}</ul></div></motion.div>)}
        </div>
      </>)}

      {vistaActual === 'productos' && (
        <motion.div variants={itemVariants} style={{ marginTop: '1.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.5rem' }}><Package size={20} /><span style={{ fontWeight:700, fontSize:'1.05rem', color:'var(--text-primary)' }}>Detalle de Productos Vendidos</span><span style={{ marginLeft:'auto', color:'var(--text-secondary)', fontSize:'0.85rem' }}>{productosDetalle.length} registros</span></div>
          <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid var(--border-color)', marginTop:'1rem' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.875rem' }}>
              <thead><tr>
                <th style={rvTH}>#</th><th style={rvTH}>Producto</th><th style={rvTH}>Categoría</th>
                <th style={{...rvTH, textAlign:'right'}}>Unidades</th><th style={{...rvTH, textAlign:'right'}}>Ingresos</th>
                <th style={{...rvTH, textAlign:'right'}}>Costo</th><th style={{...rvTH, textAlign:'right'}}>Ganancia</th><th style={{...rvTH, textAlign:'right'}}>Margen</th>
              </tr></thead>
              <tbody>
                {productosDetalle.length === 0 ? <tr><td colSpan={8} style={{padding:'2rem',textAlign:'center',color:'var(--text-secondary)'}}>No hay productos en el período</td></tr>
                  : productosDetalle.map((p, i) => (
                  <tr key={p.id||i} style={{background: i%2===0 ? 'var(--bg-card)' : 'transparent'}}>
                    <td style={{...rvTD,color:'var(--text-secondary)',fontWeight:600}}>{i+1}</td>
                    <td style={{...rvTD,fontWeight:600}}>{p.nombre}</td>
                    <td style={rvTD}>{p.categoria !== 'Sin categoría' ? <span style={{padding:'2px 8px',borderRadius:10,background:'var(--accent-primary)22',color:'var(--accent-primary)',fontSize:'0.72rem',fontWeight:700}}>{p.categoria}</span> : <span style={{color:'var(--text-secondary)'}}>—</span>}</td>
                    <td style={{...rvTD,textAlign:'right',fontWeight:700,color:'var(--accent-primary)'}}>{p.cantidad.toLocaleString('es-CO')}</td>
                    <td style={{...rvTD,textAlign:'right',fontWeight:600}}>{formatCOP(p.total)}</td>
                    <td style={{...rvTD,textAlign:'right',color:'var(--text-secondary)'}}>{p.costo>0?formatCOP(p.costo):'—'}</td>
                    <td style={{...rvTD,textAlign:'right',fontWeight:600,color:p.ganancia>=0?'var(--accent-success)':'#ef4444'}}>{p.costo>0?formatCOP(p.ganancia):'—'}</td>
                    <td style={{...rvTD,textAlign:'right'}}>{p.costo>0&&p.total>0?`${((p.ganancia/p.total)*100).toFixed(1)}%`:'—'}</td>
                  </tr>
                ))}
              </tbody>
              {productosDetalle.length > 0 && (<tfoot><tr style={{background:'var(--bg-secondary)',fontWeight:700,borderTop:'2px solid var(--border-color)'}}>
                <td colSpan={3} style={{...rvTD,fontWeight:700}}>TOTAL</td>
                <td style={{...rvTD,textAlign:'right',fontWeight:700}}>{productosDetalle.reduce((s,p)=>s+p.cantidad,0).toLocaleString('es-CO')}</td>
                <td style={{...rvTD,textAlign:'right',fontWeight:700}}>{formatCOP(productosDetalle.reduce((s,p)=>s+p.total,0))}</td>
                <td style={{...rvTD,textAlign:'right',fontWeight:700}}>{formatCOP(productosDetalle.reduce((s,p)=>s+p.costo,0))}</td>
                <td style={{...rvTD,textAlign:'right',fontWeight:700}}>{formatCOP(productosDetalle.reduce((s,p)=>s+p.ganancia,0))}</td>
                <td style={{...rvTD,textAlign:'right'}}>—</td>
              </tr></tfoot>)}
            </table>
          </div>
        </motion.div>
      )}

      {vistaActual === 'categoria' && (
        <motion.div variants={itemVariants} style={{ marginTop: '1.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.5rem' }}><Target size={20} /><span style={{ fontWeight:700, fontSize:'1.05rem', color:'var(--text-primary)' }}>Ventas por Categoría</span><span style={{ marginLeft:'auto', color:'var(--text-secondary)', fontSize:'0.85rem' }}>{categoriasDetalle.length} registros</span></div>
          <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid var(--border-color)', marginTop:'1rem' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.875rem' }}>
              <thead><tr>
                <th style={rvTH}>Categoría</th><th style={{...rvTH,textAlign:'right'}}>Items</th>
                <th style={{...rvTH,textAlign:'right'}}>Transacciones</th><th style={{...rvTH,textAlign:'right'}}>Ingresos</th>
                <th style={{...rvTH,textAlign:'right'}}>Ganancia</th><th style={{...rvTH,textAlign:'right'}}>Margen</th><th style={{...rvTH,textAlign:'center'}}>Detalle</th>
              </tr></thead>
              <tbody>
                {categoriasDetalle.length === 0 ? <tr><td colSpan={7} style={{padding:'2rem',textAlign:'center',color:'var(--text-secondary)'}}>No hay categorías en el período</td></tr>
                  : categoriasDetalle.map((cat, i) => (
                  <React.Fragment key={cat.nombre}>
                    <tr style={{background: i%2===0 ? 'var(--bg-card)' : 'transparent'}}>
                      <td style={{...rvTD,fontWeight:600}}><span style={{padding:'2px 8px',borderRadius:10,background:'var(--accent-primary)22',color:'var(--accent-primary)',fontSize:'0.72rem',fontWeight:700}}>{cat.nombre}</span></td>
                      <td style={{...rvTD,textAlign:'right',fontWeight:700,color:'var(--accent-primary)'}}>{cat.cantidad.toLocaleString('es-CO')}</td>
                      <td style={{...rvTD,textAlign:'right'}}>{cat.numVentas}</td>
                      <td style={{...rvTD,textAlign:'right',fontWeight:600}}>{formatCOP(cat.total)}</td>
                      <td style={{...rvTD,textAlign:'right',fontWeight:600,color:cat.ganancia>=0?'var(--accent-success)':'#ef4444'}}>{formatCOP(cat.ganancia)}</td>
                      <td style={{...rvTD,textAlign:'right'}}>{cat.total>0?`${((cat.ganancia/cat.total)*100).toFixed(1)}%`:'—'}</td>
                      <td style={{...rvTD,textAlign:'center'}}><button onClick={()=>setExpandedCategoria(expandedCategoria===cat.nombre?null:cat.nombre)} style={{background:'none',border:'1px solid var(--border-color)',borderRadius:6,padding:'3px 10px',cursor:'pointer',color:'var(--text-secondary)',fontSize:'0.78rem',fontWeight:600}}>{expandedCategoria===cat.nombre?'▲ Ocultar':'▼ Productos'}</button></td>
                    </tr>
                    {expandedCategoria === cat.nombre && cat.productosArr.map((p, j) => (
                      <tr key={j} style={{background:'var(--bg-secondary)',borderLeft:'3px solid var(--accent-primary)'}}>
                        <td style={{...rvTD,paddingLeft:28,color:'var(--text-secondary)'}}>↳ {p.nombre}</td>
                        <td style={{...rvTD,textAlign:'right',color:'var(--text-secondary)'}}>{p.cantidad}</td>
                        <td colSpan={4} style={rvTD}></td>
                        <td style={{...rvTD,textAlign:'right',color:'var(--text-secondary)'}}>{formatCOP(p.total)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {vistaActual === 'vendedor' && (
        <motion.div variants={itemVariants} style={{ marginTop: '1.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.5rem' }}><Users size={20} /><span style={{ fontWeight:700, fontSize:'1.05rem', color:'var(--text-primary)' }}>Rendimiento por Vendedor</span><span style={{ marginLeft:'auto', color:'var(--text-secondary)', fontSize:'0.85rem' }}>{obtenerTopVendedores.length} registros</span></div>
          <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid var(--border-color)', marginTop:'1rem' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.875rem' }}>
              <thead><tr><th style={rvTH}>#</th><th style={rvTH}>Vendedor</th><th style={{...rvTH,textAlign:'right'}}># Ventas</th><th style={{...rvTH,textAlign:'right'}}>Total</th><th style={{...rvTH,textAlign:'right'}}>Promedio</th></tr></thead>
              <tbody>
                {obtenerTopVendedores.length === 0 ? <tr><td colSpan={5} style={{padding:'2rem',textAlign:'center',color:'var(--text-secondary)'}}>No hay datos de vendedores</td></tr>
                  : obtenerTopVendedores.map((v, i) => (
                  <tr key={v.id} style={{background: i%2===0 ? 'var(--bg-card)' : 'transparent'}}>
                    <td style={{...rvTD,color:'var(--text-secondary)',fontWeight:600}}>{i+1}</td>
                    <td style={{...rvTD,fontWeight:600}}>{v.nombre}</td>
                    <td style={{...rvTD,textAlign:'right',color:'var(--accent-primary)',fontWeight:700}}>{v.cantidad}</td>
                    <td style={{...rvTD,textAlign:'right',fontWeight:600}}>{formatCOP(v.total)}</td>
                    <td style={{...rvTD,textAlign:'right'}}>{v.cantidad>0?formatCOP(v.total/v.cantidad):'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {vistaActual === 'cliente' && (
        <motion.div variants={itemVariants} style={{ marginTop: '1.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.5rem' }}><ShoppingCart size={20} /><span style={{ fontWeight:700, fontSize:'1.05rem', color:'var(--text-primary)' }}>Detalle por Cliente</span><span style={{ marginLeft:'auto', color:'var(--text-secondary)', fontSize:'0.85rem' }}>{obtenerTopClientes.length} registros</span></div>
          <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid var(--border-color)', marginTop:'1rem' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.875rem' }}>
              <thead><tr><th style={rvTH}>#</th><th style={rvTH}>Cliente</th><th style={{...rvTH,textAlign:'right'}}># Compras</th><th style={{...rvTH,textAlign:'right'}}>Total</th><th style={{...rvTH,textAlign:'right'}}>Promedio</th></tr></thead>
              <tbody>
                {obtenerTopClientes.length === 0 ? <tr><td colSpan={5} style={{padding:'2rem',textAlign:'center',color:'var(--text-secondary)'}}>No hay clientes identificados</td></tr>
                  : obtenerTopClientes.map((c, i) => (
                  <tr key={c.id} style={{background: i%2===0 ? 'var(--bg-card)' : 'transparent'}}>
                    <td style={{...rvTD,color:'var(--text-secondary)',fontWeight:600}}>{i+1}</td>
                    <td style={{...rvTD,fontWeight:600}}>{c.nombre}</td>
                    <td style={{...rvTD,textAlign:'right',color:'var(--accent-primary)',fontWeight:700}}>{c.cantidad}</td>
                    <td style={{...rvTD,textAlign:'right',fontWeight:600}}>{formatCOP(c.total)}</td>
                    <td style={{...rvTD,textAlign:'right'}}>{c.cantidad>0?formatCOP(c.total/c.cantidad):'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {vistaActual === 'ventas' && (
        <motion.div variants={itemVariants} style={{ marginTop: '1.5rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.5rem' }}><BarChart3 size={20} /><span style={{ fontWeight:700, fontSize:'1.05rem', color:'var(--text-primary)' }}>Detalle de Ventas</span><span style={{ marginLeft:'auto', color:'var(--text-secondary)', fontSize:'0.85rem' }}>{ventasIndividuales.length} registros</span></div>
          <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid var(--border-color)', marginTop:'1rem' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.875rem' }}>
              <thead><tr>
                <th style={rvTH}>Fecha</th><th style={rvTH}>N° Venta</th><th style={rvTH}>Cliente</th>
                <th style={rvTH}>Vendedor</th><th style={rvTH}>Método</th>
                <th style={{...rvTH,textAlign:'right'}}>Items</th><th style={{...rvTH,textAlign:'right'}}>Total</th>
              </tr></thead>
              <tbody>
                {ventasIndividuales.length === 0 ? <tr><td colSpan={7} style={{padding:'2rem',textAlign:'center',color:'var(--text-secondary)'}}>No hay ventas en el período</td></tr>
                  : ventasIndividuales.map((venta, i) => {
                  const fecha = venta.created_at ? new Date(venta.created_at) : null;
                  const fechaStr = fecha ? `${fecha.toLocaleDateString('es-CO')} ${fecha.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}` : '—';
                  const numItems = Array.isArray(venta.items) ? venta.items.reduce((s,it)=>s+(it.qty||1),0) : 0;
                  return (
                    <tr key={venta.id||i} style={{background: i%2===0 ? 'var(--bg-card)' : 'transparent'}}>
                      <td style={{...rvTD,fontSize:'0.8rem',whiteSpace:'nowrap'}}>{fechaStr}</td>
                      <td style={{...rvTD,color:'var(--text-secondary)',fontWeight:600}}>{venta.numero_venta||`#${i+1}`}</td>
                      <td style={rvTD}>{venta.cliente?.nombre||venta.cliente_nombre||<span style={{color:'var(--text-secondary)'}}>Sin cliente</span>}</td>
                      <td style={rvTD}>{obtenerNombreVendedor(venta)}</td>
                      <td style={rvTD}>{venta.metodo_pago?<span style={{padding:'2px 8px',borderRadius:10,background:'#8b5cf622',color:'#8b5cf6',fontSize:'0.72rem',fontWeight:700}}>{normalizarMetodoPago(venta.metodo_pago)}</span>:'—'}</td>
                      <td style={{...rvTD,textAlign:'right',color:'var(--accent-primary)',fontWeight:700}}>{numItems}</td>
                      <td style={{...rvTD,textAlign:'right',fontWeight:700}}>{formatCOP(parseFloat(venta.total||0))}</td>
                    </tr>
                  );
                })}
              </tbody>
              {ventasIndividuales.length > 0 && (<tfoot><tr style={{background:'var(--bg-secondary)',fontWeight:700,borderTop:'2px solid var(--border-color)'}}>
                <td colSpan={6} style={{...rvTD,fontWeight:700}}>TOTAL ({ventasIndividuales.length} ventas)</td>
                <td style={{...rvTD,textAlign:'right',fontWeight:700}}>{formatCOP(ventasIndividuales.reduce((s,v)=>s+parseFloat(v.total||0),0))}</td>
              </tr></tfoot>)}
            </table>
          </div>
        </motion.div>
      )}

    </motion.div>
    </FeatureGuard>
  );
};

export default ResumenVentas;
