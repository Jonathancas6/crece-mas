import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { useVentas } from '../../hooks/useVentas';
import { useCotizaciones } from '../../hooks/useCotizaciones';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useProductos } from '../../hooks/useProductos';
import { supabase } from '../../services/api/supabaseClient';
import ReciboVenta from '../../components/business/ReciboVenta';
import {
  Search,
  RefreshCw,
  Printer,
  RotateCcw,
  Repeat,
  Eye,
  Calendar,
  X,
  FileText,
  Banknote,
  CreditCard,
  Smartphone,
  Receipt,
  ArrowRight,
  Trash2,
  ShoppingCart
} from 'lucide-react';
import toast from 'react-hot-toast';
import './HistorialVentas.css';

const HistorialVentas = () => {
  const { userProfile, organization, isEmployeeMode } = useAuth();
  const { getLimit } = useSubscription();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const historyDays = getLimit('historyDays');
  const { data: ventas = [], isLoading, refetch } = useVentas(userProfile?.organization_id, 500, historyDays);
  const { data: cotizaciones = [] } = useCotizaciones(userProfile?.organization_id);


  // Combinar ventas y cotizaciones, ordenar por fecha
  const todasLasVentas = useMemo(() => {
    const combinadas = [...ventas, ...cotizaciones];
    return combinadas.sort((a, b) => {
      const fechaA = new Date(a.created_at || a.fecha);
      const fechaB = new Date(b.created_at || b.fecha);
      return fechaB - fechaA;
    });
  }, [ventas, cotizaciones]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroFecha, setFiltroFecha] = useState('todos');
  const [fechaEspecifica, setFechaEspecifica] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // Hook para detectar código de barras
  const handleBarcodeScanned = useCallback((barcode) => {
    // Buscar en ventas por código de barras
    setBusqueda(barcode);
    toast('Buscando por código de barras...', { icon: '🔍' }); // TODO: Reemplazar con icono
  }, []);

  const { inputRef: barcodeInputRef, handleKeyDown: handleBarcodeKeyDown, handleInputChange: handleBarcodeInputChange } = useBarcodeScanner(handleBarcodeScanned, {
    minLength: 3,
    maxTimeBetweenChars: 100,
    clearInput: false
  });
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [mostrandoRecibo, setMostrandoRecibo] = useState(false);
  const [mostrandoDevolucion, setMostrandoDevolucion] = useState(false);
  const [mostrandoCambio, setMostrandoCambio] = useState(false);
  const [mostrandoAnulacion, setMostrandoAnulacion] = useState(false);
  const [ventaParaAccion, setVentaParaAccion] = useState(null);
  const [mostrandoDetalles, setMostrandoDetalles] = useState(false);
  const [historialCambios, setHistorialCambios] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [procesandoAnulacion, setProcesandoAnulacion] = useState(false);

  const obtenerCreditoRelacionado = useCallback(async (ventaActual) => {
    if (!organization?.id || !ventaActual?.id) return null;

    let query = supabase
      .from('creditos')
      .select('*')
      .eq('organization_id', organization.id);

    if (ventaActual.credito_id) {
      query = query.eq('id', ventaActual.credito_id);
    } else {
      query = query.eq('venta_id', ventaActual.id);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      console.error('Error obteniendo crédito relacionado:', error);
      return null;
    }

    return data || null;
  }, [organization?.id]);

  const actualizarCreditoPorVenta = useCallback(async (ventaActual, nuevoTotal) => {
    const credito = await obtenerCreditoRelacionado(ventaActual);
    if (!credito) return { actualizado: false, credito: null };

    const totalActualizado = parseFloat(nuevoTotal || 0);
    const montoPagadoActual = parseFloat(credito.monto_pagado || 0);
    const montoPagadoAjustado = Math.min(montoPagadoActual, totalActualizado);

    const { error } = await supabase
      .from('creditos')
      .update({
        monto_total: totalActualizado,
        monto_pagado: montoPagadoAjustado
      })
      .eq('id', credito.id);

    if (error) {
      console.error('Error actualizando crédito:', error);
      return { actualizado: false, credito };
    }

    return { actualizado: true, credito };
  }, [obtenerCreditoRelacionado]);

  // Cargar cambios para todas las ventas
  const [ventasConCambios, setVentasConCambios] = useState(new Map());

  useEffect(() => {
    const cargarCambios = async () => {
      if (!organization?.id || ventas.length === 0) return;

      try {
        const { data: cambios, error } = await supabase
          .from('devoluciones')
          .select('venta_id, tipo, fecha')
          .eq('organization_id', organization.id)
          .order('fecha', { ascending: false });

        // Si la tabla no existe (PGRST205, 42P01, 404) o hay otro error relacionado, simplemente no cargar cambios
        if (error) {
          // Códigos de error cuando la tabla no existe: PGRST205, 42P01, 404
          if (error.code === 'PGRST205' || error.code === '42P01' || error.status === 404 || error.message?.includes('Could not find the table') || error.message?.includes('Not Found')) {
            // Tabla no existe, simplemente no cargar cambios (no es crítico)
            setVentasConCambios(new Map());
            return;
          } else {
            // Otro tipo de error - solo loguear si no es un error de tabla no encontrada
            if (!error.message?.includes('404') && !error.message?.includes('Not Found')) {
              console.warn('Error cargando cambios:', error);
            }
            setVentasConCambios(new Map());
            return;
          }
        }

        // Agrupar cambios por venta_id
        const cambiosMap = new Map();
        if (cambios) {
          cambios.forEach(cambio => {
            const ventaId = cambio.venta_id;
            if (!cambiosMap.has(ventaId)) {
              cambiosMap.set(ventaId, []);
            }
            cambiosMap.get(ventaId).push(cambio);
          });
        }
        setVentasConCambios(cambiosMap);
      } catch (error) {
        // Si hay cualquier error, simplemente no cargar cambios
        setVentasConCambios(new Map());
      }
    };

    cargarCambios();
  }, [organization?.id, ventas.length]);

  // Función para retomar cotización
  const handleRetomarCotizacion = (cotizacion) => {
    // Guardar la cotización en localStorage para que Caja la cargue
    localStorage.setItem('cotizacionRetomar', JSON.stringify({
      id: cotizacion.id, // ID de la cotización existente
      items: cotizacion.items || [],
      total: cotizacion.total || 0,
      subtotal: cotizacion.subtotal || cotizacion.total || 0,
      impuestos: cotizacion.impuestos || 0,
      incluir_iva: cotizacion.incluir_iva || false,
      porcentaje_iva: cotizacion.porcentaje_iva || 19,
      cliente_id: cotizacion.cliente_id || null
    }));

    // Navegar a Caja
    navigate(isEmployeeMode ? '/empleado/caja' : '/dashboard/caja');
    toast.success('Cotización cargada. Puedes continuar con la venta.');
  };

  // Función para imprimir cotización
  const imprimirCotizacion = (cotizacion) => {
    // Preparar datos de cotización para el recibo
    const cotizacionRecibo = {
      id: cotizacion.id,
      date: new Date(cotizacion.created_at || cotizacion.fecha).toLocaleDateString("es-CO"),
      time: new Date(cotizacion.created_at || cotizacion.fecha).toLocaleTimeString("es-CO"),
      cashier: cotizacion.usuario_nombre || 'Usuario',
      register: "Caja Principal",
      items: cotizacion.items || [],
      metodo_pago: 'COTIZACIÓN',
      pagoCliente: 0,
      total: cotizacion.total,
      cantidadProductos: cotizacion.items?.length || 0,
      esCotizacion: true,
      cliente: cotizacion.cliente || null,
      numero_venta: cotizacion.numero_venta || null
    };

    setVentaSeleccionada(cotizacionRecibo);
    setMostrandoRecibo(true);
  };

  // Filtrar ventas
  const ventasFiltradas = useMemo(() => {
    let filtradas = todasLasVentas;

    // Filtro de búsqueda
    if (busqueda.trim()) {
      const termino = busqueda.toLowerCase().trim();
      const terminoNumerico = termino.replace(/[^\d]/g, '');
      filtradas = filtradas.filter(venta => {
        const idMatch = venta.id?.toString().toLowerCase().includes(termino);
        const numeroVentaMatch = venta.numero_venta?.toLowerCase().includes(termino);
        const itemsMatch = venta.items?.some(item => {
          // Buscar por nombre de producto
          if (item.nombre?.toLowerCase().includes(termino)) return true;
          // Buscar por código de barras del producto
          if (item.codigo?.toLowerCase().includes(termino)) return true;
          return false;
        });
        const metodoMatch = venta.metodo_pago?.toLowerCase().includes(termino);
        const estadoMatch = venta.estado?.toLowerCase().includes(termino);
        const totalMatch = terminoNumerico
          ? String(venta.total ?? '').replace(/[^\d]/g, '').includes(terminoNumerico)
          : false;
        const cliente = venta.cliente || {};
        const clienteMatch = [
          cliente.nombre,
          cliente.documento,
          cliente.telefono,
          cliente.email,
          cliente.direccion,
          venta.cliente_nombre,
          venta.cliente_telefono
        ]
          .filter(Boolean)
          .some(value => value.toString().toLowerCase().includes(termino));
        return idMatch || numeroVentaMatch || itemsMatch || metodoMatch || estadoMatch || totalMatch || clienteMatch;
      });
    }

    // Filtro de fecha
    if (filtroFecha !== 'todos') {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);

      filtradas = filtradas.filter(venta => {
        const fechaVenta = new Date(venta.created_at || venta.fecha);
        fechaVenta.setHours(0, 0, 0, 0);

        switch (filtroFecha) {
          case 'hoy':
            return fechaVenta.getTime() === hoy.getTime();
          case 'ayer':
            const ayer = new Date(hoy);
            ayer.setDate(ayer.getDate() - 1);
            return fechaVenta.getTime() === ayer.getTime();
          case 'semana':
            const semanaAtras = new Date(hoy);
            semanaAtras.setDate(semanaAtras.getDate() - 7);
            return fechaVenta >= semanaAtras;
          case 'mes':
            const mesAtras = new Date(hoy);
            mesAtras.setMonth(mesAtras.getMonth() - 1);
            return fechaVenta >= mesAtras;
          case 'especifica':
            if (fechaEspecifica) {
              const fechaSeleccionada = new Date(fechaEspecifica);
              fechaSeleccionada.setHours(0, 0, 0, 0);
              return fechaVenta.getTime() === fechaSeleccionada.getTime();
            }
            return true;
          case 'rango':
            if (fechaInicio && fechaFin) {
              const inicio = new Date(fechaInicio);
              inicio.setHours(0, 0, 0, 0);
              const fin = new Date(fechaFin);
              fin.setHours(23, 59, 59, 999);
              return fechaVenta >= inicio && fechaVenta <= fin;
            } else if (fechaInicio) {
              const inicio = new Date(fechaInicio);
              inicio.setHours(0, 0, 0, 0);
              return fechaVenta >= inicio;
            } else if (fechaFin) {
              const fin = new Date(fechaFin);
              fin.setHours(23, 59, 59, 999);
              return fechaVenta <= fin;
            }
            return true;
          default:
            return true;
        }
      });
    }

    return filtradas;
  }, [todasLasVentas, busqueda, filtroFecha, fechaEspecifica, fechaInicio, fechaFin]);

  const formatCOP = (value) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatFecha = (fecha) => {
    if (!fecha) return 'N/A';
    const date = new Date(fecha);
    return date.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const verDetalles = async (venta) => {
    setVentaSeleccionada(venta);
    setMostrandoDetalles(true);
    setCargandoHistorial(true);

    // Cargar historial de cambios desde la tabla devoluciones (si existe)
    try {
      const { data: cambios, error } = await supabase
        .from('devoluciones')
        .select('*')
        .eq('venta_id', venta.id)
        .order('fecha', { ascending: false });

      // Si la tabla no existe (PGRST205) o hay otro error, simplemente no cargar historial
      if (error) {
        // Códigos de error cuando la tabla no existe: PGRST205, 42P01
        if (error.code === 'PGRST205' || error.code === '42P01' || error.message?.includes('Could not find the table')) {
          // Tabla no existe, simplemente no mostrar historial
          setHistorialCambios([]);
        } else {
          // Otro tipo de error
          console.warn('Error cargando historial de cambios:', error);
          setHistorialCambios([]);
        }
      } else {
        setHistorialCambios(cambios || []);
      }
    } catch (error) {
      // Si hay cualquier error, simplemente no mostrar historial
      setHistorialCambios([]);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const reimprimirRecibo = (venta) => {
    // Preparar datos de venta para el recibo
    const esCotizacion = (venta.estado === 'cotizacion' || venta.metodo_pago === 'COTIZACION');
    const ventaRecibo = {
      id: venta.id,
      date: new Date(venta.created_at || venta.fecha).toLocaleDateString("es-CO"),
      time: new Date(venta.created_at || venta.fecha).toLocaleTimeString("es-CO"),
      cashier: venta.usuario_nombre || 'Usuario',
      register: "Caja Principal",
      items: venta.items || [],
      metodo_pago: venta.metodo_pago,
      pagoCliente: venta.pago_cliente || venta.total,
      total: venta.total,
      cantidadProductos: venta.items?.length || 0,
      esCotizacion: esCotizacion,
      cliente: venta.cliente || null,
      numero_venta: venta.numero_venta || null
    };

    setVentaSeleccionada(ventaRecibo);
    setMostrandoRecibo(true);
  };

  const iniciarDevolucion = (venta) => {
    setVentaParaAccion(venta);
    setMostrandoDevolucion(true);
  };

  const iniciarCambio = (venta) => {
    setVentaParaAccion(venta);
    setMostrandoCambio(true);
  };

  const obtenerItemId = (item) => item?.id || item?.producto_id || '';
  const obtenerKeyItem = (item) => {
    const id = obtenerItemId(item);
    const variante = item?.variant_id || '';
    return `${id}::${variante}`;
  };

  const procesarEliminarCotizacion = async (venta) => {
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente la cotización #${venta.numero_venta}? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      setProcesandoAnulacion(true);
      const { error } = await supabase
        .from('ventas')
        .delete()
        .eq('id', venta.id);

      if (error) throw error;

      toast.success('Cotización eliminada correctamente');
      if (typeof refetch === 'function') refetch();
    } catch (error) {
      console.error('Error eliminando cotización:', error);
      toast.error('Error al eliminar la cotización');
    } finally {
      setProcesandoAnulacion(false);
    }
  };

  const iniciarAnulacion = (venta) => {
    setVentaParaAccion(venta);
    setMostrandoAnulacion(true);
  };

  const procesarAnulacion = async () => {
    if (!ventaParaAccion) return;

    try {
      setProcesandoAnulacion(true);

      // 1. Obtener la venta actual con sus items para restaurar el stock
      const { data: ventaDB, error: errorVenta } = await supabase
        .from('ventas')
        .select('*')
        .eq('id', ventaParaAccion.id)
        .single();

      if (errorVenta || !ventaDB) {
        throw new Error('No se pudo cargar la venta para anular');
      }

      const items = ventaDB.items || [];

      // 2. Restaurar Stock
      for (const item of items) {
        if (item.es_topping || (typeof item.id === 'string' && item.id.startsWith('topping_'))) {
          const toppingId = item.topping_id || (typeof item.id === 'string' ? item.id.replace('topping_', '') : item.id);
          const { data: topping } = await supabase.from('toppings').select('stock').eq('id', toppingId).single();
          if (topping && topping.stock !== null) {
            await supabase.from('toppings').update({ stock: topping.stock + (item.qty || 1) }).eq('id', toppingId);
          }
        } else if (item.variant_id) {
          const { data: variante } = await supabase.from('product_variants').select('stock').eq('id', item.variant_id).single();
          if (variante && variante.stock !== null) {
            await supabase.from('product_variants').update({ stock: variante.stock + (item.qty || 1) }).eq('id', item.variant_id);
          }
        } else {
          // Producto normal o con metadata vinculada
          const { data: producto } = await supabase.from('productos').select('stock, metadata').eq('id', item.id).single();
          if (producto) {
            if (producto.stock !== null) {
              await supabase.from('productos').update({ stock: producto.stock + (item.qty || 1) }).eq('id', item.id);
            }

            // Restaurar productos vinculados
            let metadata = producto.metadata;
            if (typeof metadata === 'string') {
              try { metadata = JSON.parse(metadata); } catch (e) { metadata = null; }
            }
            if (metadata?.productos_vinculados && Array.isArray(metadata.productos_vinculados)) {
              for (const pv of metadata.productos_vinculados) {
                if (!pv.producto_id) continue;
                const qtyRestaurar = parseFloat(pv.cantidad || 0) * parseFloat(item.qty || 1);
                const { data: pVinculado } = await supabase.from('productos').select('stock').eq('id', pv.producto_id).single();
                if (pVinculado && pVinculado.stock !== null) {
                  const nuevoStockObj = Math.round((parseFloat(pVinculado.stock) + qtyRestaurar) * 100) / 100;
                  await supabase.from('productos').update({ stock: nuevoStockObj }).eq('id', pv.producto_id);
                }
              }
            }
          }
        }
      }

      // 3. Si era crédito, anular también el crédito o borrar sus pagos (marcarlo como anulado)
      if (ventaDB.es_credito || ventaDB.credito_id) {
        let credId = ventaDB.credito_id;
        if (!credId) {
          const { data: credDB } = await supabase.from('creditos').select('id').eq('venta_id', ventaDB.id).maybeSingle();
          if (credDB) credId = credDB.id;
        }

        if (credId) {
          await supabase.from('creditos').update({ estado: 'anulado' }).eq('id', credId);
        }
      }

      // 4. Marcar la venta como anulada (total=0, items vacíos)
      const { error: updateError } = await supabase
        .from('ventas')
        .update({ total: 0, items: [] })
        .eq('id', ventaDB.id);

      if (updateError) throw updateError;

      toast.success('Venta cancelada correctamente. Stock restaurado.');
      setMostrandoAnulacion(false);
      setVentaParaAccion(null);
      if (typeof refetch === 'function') refetch();

    } catch (error) {
      console.error('Error anulando venta:', error);
      toast.error('Ocurrió un error al anular la venta.');
    } finally {
      setProcesandoAnulacion(false);
    }
  };

  const procesarCambio = async (venta, itemsACambiar, itemsNuevos, metodoPago = null, montoEntregado = null) => {
    try {

      // Calcular total de productos devueltos
      const totalDevolucion = itemsACambiar.reduce((sum, item) => {
        const precioItem = item.precio_venta || item.precio || 0;
        return sum + (precioItem * item.qty);
      }, 0);

      // Calcular total de productos nuevos
      const totalNuevo = itemsNuevos.reduce((sum, item) => {
        const precioItem = item.precio_venta || 0;
        return sum + (precioItem * item.qty);
      }, 0);

      const diferencia = totalNuevo - totalDevolucion;

      // Obtener la venta actualizada desde la BD
      const { data: ventaActual, error: errorVenta } = await supabase
        .from('ventas')
        .select('*')
        .eq('id', venta.id)
        .single();

      if (errorVenta || !ventaActual) {
        throw new Error('No se pudo obtener la venta para procesar el cambio');
      }

      // Calcular nuevos items después del cambio
      const itemsOriginales = ventaActual.items || [];
      const itemsActualizados = [];
      const itemsACambiarMap = new Map();

      // Crear mapa de items a cambiar por ID + variante
      itemsACambiar.forEach(item => {
        const key = obtenerKeyItem(item);
        if (itemsACambiarMap.has(key)) {
          itemsACambiarMap.set(key, itemsACambiarMap.get(key) + item.qty);
        } else {
          itemsACambiarMap.set(key, item.qty);
        }
      });

      // Procesar items originales (excluir los que se cambian)
      itemsOriginales.forEach(item => {
        const cantidadACambiar = itemsACambiarMap.get(obtenerKeyItem(item)) || 0;
        const cantidadOriginal = item.qty || 0;
        const cantidadRestante = cantidadOriginal - cantidadACambiar;

        if (cantidadRestante > 0) {
          itemsActualizados.push({
            ...item,
            qty: cantidadRestante
          });
        }
      });

      // Agregar los nuevos productos
      itemsNuevos.forEach(nuevoItem => {
        // Buscar si ya existe este producto/variante en la venta
        const keyNuevo = obtenerKeyItem(nuevoItem);
        const itemExistente = itemsActualizados.find(i => obtenerKeyItem(i) === keyNuevo);
        if (itemExistente) {
          // Si existe, aumentar la cantidad
          itemExistente.qty = (itemExistente.qty || 0) + nuevoItem.qty;
        } else {
          // Si no existe, agregarlo
          itemsActualizados.push({
            id: nuevoItem.id,
            nombre: nuevoItem.nombre,
            precio_venta: nuevoItem.precio_venta,
            precio: nuevoItem.precio_venta,
            qty: nuevoItem.qty,
            variant_id: nuevoItem.variant_id || null,
            variant_nombre: nuevoItem.variant_nombre || null,
            variant_codigo: nuevoItem.variant_codigo || null
          });
        }
      });

      // Calcular nuevo total
      const nuevoTotal = itemsActualizados.reduce((sum, item) => {
        const precioItem = item.precio_venta || item.precio || 0;
        return sum + (precioItem * (item.qty || 0));
      }, 0);

      // Preparar datos de actualización (solo campos que existen en la tabla)
      const updatesVenta = {
        items: itemsActualizados,
        total: nuevoTotal
      };

      // Si hay diferencia y se especificó método de pago
      if (diferencia !== 0 && metodoPago) {
        // Si la diferencia es positiva (cliente paga), actualizar método de pago
        if (diferencia > 0) {
          updatesVenta.metodo_pago = metodoPago;
          // Solo actualizar pago_cliente si existe el campo
          if (metodoPago === 'Efectivo' && montoEntregado) {
            updatesVenta.pago_cliente = montoEntregado;
          }
          if (metodoPago === 'Credito') {
            updatesVenta.es_credito = true;
          }
        }
      }

      // Crear registro de auditoría del cambio (intentar guardar en tabla de auditoría si existe)
      const registroCambio = {
        organization_id: organization.id,
        venta_id: venta.id,
        user_id: userProfile?.user_id,
        tipo: 'cambio',
        items_devueltos: itemsACambiar,
        items_nuevos: itemsNuevos,
        total_devolucion: totalDevolucion,
        total_nuevo: totalNuevo,
        diferencia: diferencia,
        metodo_pago: metodoPago || null,
        monto_entregado: montoEntregado,
        total_anterior: ventaActual.total,
        total_nuevo_calculado: nuevoTotal,
        fecha: new Date().toISOString()
      };

      // Intentar guardar en tabla de auditoría (si existe, si no, solo loguear)
      try {
        const { error: insertError } = await supabase.from('devoluciones').insert([registroCambio]);
        if (insertError) {
          // Si la tabla no existe (PGRST205, 42P01, 404) o hay otro error, solo loguear
          if (insertError.code === 'PGRST205' || insertError.code === '42P01' || insertError.status === 404 || insertError.message?.includes('Could not find the table') || insertError.message?.includes('Not Found')) {
            // Tabla no existe, solo loguear (no es crítico)
            console.log('Registro de auditoría (tabla no existe):', registroCambio);
          } else {
            console.warn('Error registrando cambio:', insertError);
          }
        }
      } catch (auditError) {
        // Si la tabla no existe, solo loguear (no es crítico)
        console.log('Registro de auditoría:', registroCambio);
      }

      // Actualizar la venta
      const { error: errorUpdateVenta } = await supabase
        .from('ventas')
        .update(updatesVenta)
        .eq('id', venta.id);

      if (errorUpdateVenta) {
        console.error('Error actualizando venta:', errorUpdateVenta);
        throw new Error('Error al actualizar la venta');
      }

      let creditoActualizado = true;
      let pagoCambioRegistrado = true;
      const esVentaCredito = ventaActual.es_credito === true || ventaActual.metodo_pago === 'Credito' || !!ventaActual.credito_id;

      if (esVentaCredito) {
        try {
          const { actualizado, credito } = await actualizarCreditoPorVenta(ventaActual, nuevoTotal);
          creditoActualizado = actualizado || !credito;

          if (credito && diferencia > 0 && metodoPago) {
            const { error: errorPagoCambio } = await supabase
              .from('pagos_creditos')
              .insert([{
                organization_id: organization.id,
                credito_id: credito.id,
                monto: diferencia,
                metodo_pago: metodoPago,
                notas: `Pago por cambio de productos en venta ${ventaActual.numero_venta || ventaActual.id}`,
                user_id: userProfile?.user_id || null
              }]);

            if (errorPagoCambio) {
              console.error('Error registrando pago por cambio:', errorPagoCambio);
              pagoCambioRegistrado = false;
            } else {
              queryClient.invalidateQueries(['pagos_creditos', credito.id]);
            }
          }
        } catch (errorCredito) {
          console.error('Error actualizando crédito por cambio:', errorCredito);
          creditoActualizado = false;
        }
      } else if (diferencia > 0 && metodoPago === 'Credito') {
        // Convertir la diferencia en crédito cuando la venta no era a crédito
        if (!ventaActual.cliente_id) {
          throw new Error('Para registrar un cambio a crédito debes seleccionar un cliente.');
        }
        const fechaVenc = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const montoPagado = Math.min(ventaActual.total || 0, nuevoTotal);
        const creditoData = {
          organization_id: organization.id,
          venta_id: ventaActual.id,
          cliente_id: ventaActual.cliente_id,
          monto_total: nuevoTotal,
          monto_pagado: montoPagado,
          monto_pendiente: Math.max(nuevoTotal - montoPagado, 0),
          fecha_vencimiento: fechaVenc.toISOString().split('T')[0],
          estado: 'parcial',
          notas: `Crédito generado por cambio en venta ${ventaActual.numero_venta || ventaActual.id}`
        };
        const { data: creditoCreado, error: creditoError } = await supabase
          .from('creditos')
          .insert([creditoData])
          .select('id')
          .single();
        if (creditoError) {
          throw creditoError;
        }
        await supabase
          .from('ventas')
          .update({ credito_id: creditoCreado.id, es_credito: true })
          .eq('id', ventaActual.id);
        queryClient.invalidateQueries(['creditos', organization?.id]);
      }

      // Restaurar stock de productos devueltos
      let stockRestaurado = 0;
      for (const item of itemsACambiar) {
        try {
          if (item.variant_id) {
            const { data: variante, error: varianteError } = await supabase
              .from('product_variants')
              .select('stock')
              .eq('id', item.variant_id)
              .single();

            if (!varianteError && variante) {
              const nuevoStock = (variante.stock || 0) + item.qty;
              const { error: errorUpdateStock } = await supabase
                .from('product_variants')
                .update({ stock: nuevoStock })
                .eq('id', item.variant_id);

              if (!errorUpdateStock) {
                stockRestaurado++;
              }
            }
            continue;
          }

          const productoId = obtenerItemId(item);
          if (!productoId) {
            continue;
          }
          const { data: producto, error: errorProducto } = await supabase
            .from('productos')
            .select('stock')
            .eq('id', productoId)
            .single();

          if (!errorProducto && producto) {
            const nuevoStock = (producto.stock || 0) + item.qty;
            const { error: errorUpdateStock } = await supabase
              .from('productos')
              .update({ stock: nuevoStock })
              .eq('id', productoId);

            if (!errorUpdateStock) {
              stockRestaurado++;
            }
          }
        } catch (error) {
          console.error(`Error restaurando stock de ${item.id}:`, error);
        }
      }

      // Reducir stock de productos nuevos
      let stockReducido = 0;
      for (const item of itemsNuevos) {
        try {
          if (item.variant_id) {
            const { data: variante, error: varianteError } = await supabase
              .from('product_variants')
              .select('stock')
              .eq('id', item.variant_id)
              .single();

            if (!varianteError && variante) {
              const nuevoStock = Math.max(0, (variante.stock || 0) - item.qty);
              const { error: errorUpdateStock } = await supabase
                .from('product_variants')
                .update({ stock: nuevoStock })
                .eq('id', item.variant_id);

              if (!errorUpdateStock) {
                stockReducido++;
              }
            }
            continue;
          }

          const productoId = obtenerItemId(item);
          if (!productoId) {
            continue;
          }
          const { data: producto, error: errorProducto } = await supabase
            .from('productos')
            .select('stock')
            .eq('id', productoId)
            .single();

          if (!errorProducto && producto) {
            const nuevoStock = Math.max(0, (producto.stock || 0) - item.qty);
            const { error: errorUpdateStock } = await supabase
              .from('productos')
              .update({ stock: nuevoStock })
              .eq('id', productoId);

            if (!errorUpdateStock) {
              stockReducido++;
            }
          }
        } catch (error) {
          console.error(`Error reduciendo stock de ${item.id}:`, error);
        }
      }

      // Validar que los stocks se actualizaron correctamente
      const stocksActualizados = stockRestaurado === itemsACambiar.length && stockReducido === itemsNuevos.length;

      let mensaje = diferencia > 0
        ? `Cambio procesado. Cliente pagó ${formatCOP(diferencia)} adicionales (${metodoPago || 'No especificado'}).`
        : diferencia < 0
          ? `Cambio procesado. Cliente recibió ${formatCOP(Math.abs(diferencia))} de diferencia.`
          : `Cambio procesado. Total equivalente.`;

      // Agregar información de stocks al mensaje si no se actualizaron todos
      if (!stocksActualizados) {
        mensaje += ` (Stocks: ${stockRestaurado}/${itemsACambiar.length} restaurados, ${stockReducido}/${itemsNuevos.length} reducidos)`;
      }

      if (esVentaCredito && (!creditoActualizado || !pagoCambioRegistrado)) {
        mensaje += ' (Revisa créditos: no se pudo actualizar todo correctamente)';
      }

      toast.success(mensaje);
      setMostrandoCambio(false);
      setVentaParaAccion(null);
      refetch();
    } catch (error) {
      console.error('Error procesando cambio:', error);
      toast.error(`Error al procesar el cambio: ${error.message || 'Error desconocido'}`);
    }
  };

  const procesarDevolucion = async (venta, itemsDevolver) => {
    try {
      const totalDevolucion = itemsDevolver.reduce((sum, item) => {
        const precioItem = item.precio_venta || item.precio || 0;
        return sum + (precioItem * item.qty);
      }, 0);

      // 1. Obtener la venta actualizada desde la BD
      const { data: ventaActual, error: errorVenta } = await supabase
        .from('ventas')
        .select('*')
        .eq('id', venta.id)
        .single();

      if (errorVenta || !ventaActual) {
        throw new Error('No se pudo obtener la venta para procesar la devolución');
      }

      // 2. Calcular nuevos items después de la devolución
      const itemsOriginales = ventaActual.items || [];
      const itemsActualizados = [];
      const itemsDevolverMap = new Map();

      // Crear mapa de items a devolver por ID + variante
      itemsDevolver.forEach(item => {
        const key = obtenerKeyItem(item);
        if (itemsDevolverMap.has(key)) {
          itemsDevolverMap.set(key, itemsDevolverMap.get(key) + item.qty);
        } else {
          itemsDevolverMap.set(key, item.qty);
        }
      });

      // Procesar cada item de la venta original
      itemsOriginales.forEach(item => {
        const cantidadADevolver = itemsDevolverMap.get(obtenerKeyItem(item)) || 0;
        const cantidadOriginal = item.qty || 0;
        const cantidadRestante = cantidadOriginal - cantidadADevolver;

        if (cantidadRestante > 0) {
          // Si queda cantidad, mantener el item con cantidad reducida
          itemsActualizados.push({
            ...item,
            qty: cantidadRestante
          });
        }
        // Si cantidadRestante <= 0, no agregamos el item (se devuelve completamente)
      });

      // 3. Calcular nuevo total
      const nuevoTotal = itemsActualizados.reduce((sum, item) => {
        const precioItem = item.precio_venta || item.precio || 0;
        return sum + (precioItem * (item.qty || 0));
      }, 0);

      const esDevolucionCompleta = itemsActualizados.length === 0 || nuevoTotal === 0;

      // 4. Actualizar la venta en la base de datos (solo campos que existen)
      const updatesVenta = {
        items: itemsActualizados,
        total: esDevolucionCompleta ? 0 : nuevoTotal // Total en 0 para devolución completa
      };

      // Crear registro de auditoría de la devolución (intentar guardar en tabla de auditoría si existe)
      const registroDevolucion = {
        organization_id: organization.id,
        venta_id: venta.id,
        user_id: userProfile?.user_id,
        tipo: 'devolucion',
        items: itemsDevolver,
        total_devolucion: totalDevolucion,
        total_venta_original: ventaActual.total,
        total_venta_actualizado: nuevoTotal,
        es_completa: esDevolucionCompleta,
        motivo: 'Devolución de cliente',
        fecha: new Date().toISOString()
      };

      // Intentar guardar en tabla de auditoría (si existe, si no, solo loguear)
      try {
        const { error: insertError } = await supabase.from('devoluciones').insert([registroDevolucion]);
        if (insertError) {
          // Si la tabla no existe (PGRST205, 42P01, 404) o hay otro error, solo loguear
          if (insertError.code === 'PGRST205' || insertError.code === '42P01' || insertError.status === 404 || insertError.message?.includes('Could not find the table') || insertError.message?.includes('Not Found')) {
            // Tabla no existe, solo loguear (no es crítico)
            console.log('Registro de auditoría de devolución (tabla no existe):', registroDevolucion);
          } else {
            console.warn('Error registrando devolución:', insertError);
          }
        }
      } catch (auditError) {
        // Si la tabla no existe, solo loguear (no es crítico)
        console.log('Registro de auditoría de devolución:', registroDevolucion);
      }

      // Nota: No actualizamos el campo 'estado' porque no existe en la tabla 'ventas'
      // El estado de devolución se puede inferir del total (0 = completa, > 0 = parcial)

      const { error: errorUpdateVenta } = await supabase
        .from('ventas')
        .update(updatesVenta)
        .eq('id', venta.id);

      if (errorUpdateVenta) {
        console.error('Error actualizando venta:', errorUpdateVenta);
        throw new Error('Error al actualizar la venta');
      }

      let creditoActualizado = true;
      const esVentaCredito = ventaActual.es_credito === true || ventaActual.metodo_pago === 'Credito' || !!ventaActual.credito_id;

      if (esVentaCredito) {
        try {
          const { actualizado, credito } = await actualizarCreditoPorVenta(ventaActual, esDevolucionCompleta ? 0 : nuevoTotal);
          creditoActualizado = actualizado || !credito;
          if (credito) {
            queryClient.invalidateQueries(['creditos', organization?.id]);
            queryClient.invalidateQueries(['credito', credito.id]);
          }
        } catch (errorCredito) {
          console.error('Error actualizando crédito por devolución:', errorCredito);
          creditoActualizado = false;
        }
      }

      // 5. Restaurar stock de productos devueltos
      const restockTargets = itemsDevolver.filter(item => obtenerItemId(item) || item?.variant_id).length;
      let stockRestaurado = 0;
      for (const item of itemsDevolver) {
        try {
          if (item.variant_id) {
            const { data: variante, error: varianteError } = await supabase
              .from('product_variants')
              .select('stock')
              .eq('id', item.variant_id)
              .single();

            if (!varianteError && variante) {
              const nuevoStock = (variante.stock || 0) + item.qty;
              const { error: errorUpdateStock } = await supabase
                .from('product_variants')
                .update({ stock: nuevoStock })
                .eq('id', item.variant_id);

              if (!errorUpdateStock) {
                stockRestaurado++;
                console.log(`Stock restaurado (variante): ${item.nombre} - ${variante.stock} -> ${nuevoStock}`);
              }
            }
            continue;
          }

          const productoId = obtenerItemId(item);
          if (!productoId) {
            continue;
          }
          const { data: producto, error: errorProducto } = await supabase
            .from('productos')
            .select('stock')
            .eq('id', productoId)
            .single();

          if (errorProducto) {
            console.error(`Error obteniendo producto ${item.id}:`, errorProducto);
            continue;
          }

          if (producto) {
            const nuevoStock = (producto.stock || 0) + item.qty;
            const { error: errorUpdateStock } = await supabase
              .from('productos')
              .update({ stock: nuevoStock })
              .eq('id', productoId);

            if (errorUpdateStock) {
              console.error(`Error actualizando stock de ${item.id}:`, errorUpdateStock);
            } else {
              stockRestaurado++;
              console.log(`Stock restaurado: ${item.nombre} - ${producto.stock} -> ${nuevoStock}`);
            }
          }
        } catch (itemError) {
          console.error(`Error procesando item ${item.id}:`, itemError);
        }
      }

      // 7. Mostrar mensaje de éxito
      if (restockTargets === 0) {
        // No hay items con stock para restaurar (servicios u otros)
      } else if (stockRestaurado === restockTargets) {
        const mensaje = esDevolucionCompleta
          ? `Devolución completa procesada. Venta cancelada. Total revertido: ${formatCOP(totalDevolucion)}`
          : `Devolución parcial procesada. ${itemsDevolver.length} producto(s) devuelto(s). Total ajustado: ${formatCOP(ventaActual.total)} → ${formatCOP(nuevoTotal)}`;

        toast.success(creditoActualizado ? mensaje : `${mensaje} (Revisa créditos: no se pudo actualizar)`);
      } else if (stockRestaurado > 0) {
        const mensaje = `Devolución parcial: ${stockRestaurado} de ${restockTargets} producto(s) procesado(s). La venta fue actualizada pero algunos stocks no se pudieron restaurar.`;
        toast.success(creditoActualizado ? mensaje : `${mensaje} (Revisa créditos: no se pudo actualizar)`);
      } else if (restockTargets > 0) {
        toast.error('Error: No se pudo restaurar el stock de los productos. La venta fue actualizada pero revisa el stock manualmente.');
        return;
      }

      setMostrandoDevolucion(false);
      setVentaParaAccion(null);
      refetch();
    } catch (error) {
      console.error('Error procesando devolución:', error);
      toast.error(`Error al procesar la devolución: ${error.message || 'Error desconocido'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="historial-ventas-container">
        <div className="loading-state">
          <RefreshCw className="spinning" size={32} />
          <p>Cargando historial de ventas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="historial-ventas-container">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="historial-ventas-header"
      >
        <div>
          <h1>Historial de Ventas</h1>
          <p>Gestiona devoluciones, cambios y reimprime recibos</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            onClick={() => navigate(isEmployeeMode ? '/empleado/caja' : '/dashboard/caja')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#3b82f6', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '500', fontSize: '0.9rem' }}
            title="Ir a Caja"
          >
            <ShoppingCart size={18} />
            Ir a Caja
          </button>
          <button
            className="btn-refresh"
            onClick={() => refetch()}
            title="Actualizar"
          >
            <RefreshCw size={20} />
          </button>
        </div>
      </motion.div>

      {/* Filtros y búsqueda */}
      <div className="historial-filtros">
        <div className="search-box">
          <Search size={20} />
          <input
            ref={barcodeInputRef}
            type="text"
            placeholder="Buscar por ID, producto, código de barras o método de pago..."
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              // El hook manejará la detección de código de barras
              handleBarcodeInputChange(e);
            }}
            onKeyDown={handleBarcodeKeyDown}
            onFocus={(e) => {
              // Prevenir scroll cuando se enfoca
              e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }}
          />
          {busqueda && (
            <button
              className="clear-search"
              onClick={() => setBusqueda('')}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="filtro-fecha">
          <Calendar size={18} className="filtro-fecha-icon-outside" />
          <select
            value={filtroFecha}
            onChange={(e) => {
              setFiltroFecha(e.target.value);
              if (e.target.value !== 'especifica' && e.target.value !== 'rango') {
                setFechaEspecifica('');
                setFechaInicio('');
                setFechaFin('');
              }
            }}
            className="filtro-fecha-select"
          >
            <option value="todos">Todas las fechas</option>
            <option value="hoy">Hoy</option>
            <option value="ayer">Ayer</option>
            <option value="semana">Última semana</option>
            <option value="mes">Último mes</option>
            <option value="especifica">Fecha específica</option>
            <option value="rango">Rango de fechas</option>
          </select>
          {filtroFecha === 'especifica' && (
            <input
              type="date"
              value={fechaEspecifica}
              onChange={(e) => setFechaEspecifica(e.target.value)}
              className="filtro-fecha-input"
              title={fechaEspecifica ? new Date(fechaEspecifica).toLocaleDateString('es-CO', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
              }) : 'Seleccionar fecha'}
            />
          )}
          {filtroFecha === 'rango' && (
            <>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="filtro-fecha-input"
                title={fechaInicio ? new Date(fechaInicio).toLocaleDateString('es-CO', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                }) : 'Seleccionar fecha inicio'}
              />
              <span className="filtro-fecha-separador">-</span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="filtro-fecha-input"
                title={fechaFin ? new Date(fechaFin).toLocaleDateString('es-CO', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric'
                }) : 'Seleccionar fecha fin'}
              />
            </>
          )}
        </div>
      </div>

      {/* Lista de ventas */}
      <div className="ventas-lista">
        {ventasFiltradas.length === 0 ? (
          <div className="empty-state">
            <FileText size={48} />
            <p>No se encontraron ventas</p>
          </div>
        ) : (
          ventasFiltradas.map((venta, index) => (
            <motion.div
              key={venta.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="venta-card"
            >
              <div className="venta-header">
                <div className="venta-info">
                  <div className="venta-id">
                    <span className="label">{(venta.estado === 'cotizacion' || venta.metodo_pago === 'COTIZACION') ? 'Cotización #' : 'Venta #'}</span>
                    <span className="value">{venta.numero_venta || venta.id?.slice(0, 8) || 'N/A'}</span>
                    {(venta.estado === 'cotizacion' || venta.metodo_pago === 'COTIZACION') && (
                      <span className="venta-badge cotizacion" title="Cotización pendiente">Cotización</span>
                    )}
                    {(venta.es_credito === true || venta.metodo_pago === 'Credito') && (
                      <span className="venta-badge credito" title="Venta a crédito - Pendiente de pago">
                        <Receipt size={12} style={{ marginRight: '0.25rem' }} />
                        Crédito
                      </span>
                    )}
                    {venta.total === 0 && (!venta.items || venta.items.length === 0) && (
                      <span className="venta-badge devuelta">Devuelta</span>
                    )}
                    {ventasConCambios.has(venta.id) && (
                      <span className="venta-badge modificada" title={`${ventasConCambios.get(venta.id).length} modificación(es)`}>
                        {ventasConCambios.get(venta.id).length} {ventasConCambios.get(venta.id).length === 1 ? 'cambio' : 'cambios'}
                      </span>
                    )}
                  </div>
                  <div className="venta-fecha">
                    <Calendar size={14} />
                    {formatFecha(venta.created_at || venta.fecha)}
                  </div>
                  <div className="venta-metodo">
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {(venta.es_credito === true || venta.metodo_pago === 'Credito') ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Receipt size={14} />
                          Crédito
                        </span>
                      ) : (
                        <span>{venta.metodo_pago || 'N/A'}</span>
                      )}
                      {venta.vendedor?.employee_name && (
                        <span style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.1rem' }}>
                          Por: {venta.vendedor.employee_name}
                        </span>
                      )}
                    </div>
                  </div>
                  {venta.cliente && (
                    <div className="venta-cliente">
                      <span className="venta-cliente-label">Cliente:</span>
                      <span className="venta-cliente-nombre">{venta.cliente.nombre}</span>
                      {venta.cliente.documento && (
                        <span className="venta-cliente-doc">({venta.cliente.documento})</span>
                      )}
                    </div>
                  )}
                </div>
                <div className={`venta-total ${venta.total === 0 ? 'devuelta' : ''}`}>
                  {(venta.total === 0 && (!venta.items || venta.items.length === 0)) ? (
                    <span style={{ color: '#ef4444', fontWeight: '600', fontSize: '0.85rem' }}>ANULADA</span>
                  ) : (
                    <>
                      {formatCOP(venta.total || 0)}
                      {venta.total === 0 && (
                        <span className="total-note">(Ajustado)</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="venta-items">
                <span className="items-count">
                  {venta.items?.length || 0} producto(s)
                </span>
                <div className="items-preview">
                  {venta.items?.slice(0, 3).map((item, idx) => (
                    <span key={idx} className="item-tag">
                      {item.nombre} x{item.qty}
                      {item.variant_nombre ? ` · ${item.variant_nombre}` : ''}
                      {item.variaciones && Object.keys(item.variaciones).length > 0
                        ? ` · Var: ${Object.entries(item.variaciones)
                          .map(([key, value]) => `${key}: ${typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value)}`)
                          .join(', ')}`
                        : ''}
                      {item.toppings && Array.isArray(item.toppings) && item.toppings.length > 0
                        ? ` · Top: ${item.toppings
                          .map((topping) => `${topping.nombre}${topping.cantidad > 1 ? ` (x${topping.cantidad})` : ''}`)
                          .join(', ')}`
                        : ''}
                    </span>
                  ))}
                  {venta.items?.length > 3 && (
                    <span className="item-tag-more">
                      +{venta.items.length - 3} más
                    </span>
                  )}
                </div>
              </div>

              <div className="venta-actions">
                {(venta.estado === 'cotizacion' || venta.metodo_pago === 'COTIZACION') ? (
                  <>
                    <button
                      className="btn-action btn-view"
                      onClick={() => verDetalles(venta)}
                      title="Ver detalles"
                    >
                      <Eye size={16} />
                      Ver
                    </button>
                    <button
                      className="btn-action btn-retomar"
                      onClick={() => handleRetomarCotizacion(venta)}
                      title="Retomar cotización"
                    >
                      <ArrowRight size={16} />
                      Retomar
                    </button>
                    <button
                      className="btn-action btn-print"
                      onClick={() => imprimirCotizacion(venta)}
                      title="Imprimir cotización"
                    >
                      <Printer size={16} />
                      Imprimir
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn-action btn-view"
                      onClick={() => verDetalles(venta)}
                      title="Ver detalles"
                    >
                      <Eye size={16} />
                      Ver
                    </button>
                    <button
                      className="btn-action btn-print"
                      onClick={() => reimprimirRecibo(venta)}
                      title="Reimprimir recibo"
                    >
                      <Printer size={16} />
                      Imprimir
                    </button>
                  </>
                )}
                {venta.total > 0 && venta.estado !== 'cotizacion' && !(venta.total === 0 && (!venta.items || venta.items.length === 0)) && venta.metodo_pago !== 'COTIZACION' && (
                  <>
                    <button
                      className="btn-action btn-return"
                      onClick={() => iniciarDevolucion(venta)}
                      title="Devolución"
                    >
                      <RotateCcw size={16} />
                      Devolver
                    </button>
                    <button
                      className="btn-action btn-exchange"
                      onClick={() => iniciarCambio(venta)}
                      title="Cambio de producto"
                    >
                      <Repeat size={16} />
                      Cambiar
                    </button>
                    <button
                      className="btn-action"
                      style={{ color: '#ef4444', backgroundColor: '#fef2f2', border: '1px solid #fca5a5' }}
                      onClick={() => iniciarAnulacion(venta)}
                      title="Anular Venta Completa"
                    >
                      <Trash2 size={16} />
                      Anular
                    </button>
                  </>
                )}
                {(venta.estado === 'cotizacion' || venta.metodo_pago === 'COTIZACION') && (
                  <button
                    className="btn-action"
                    style={{ color: '#ef4444', backgroundColor: '#fef2f2', border: '1px solid #fca5a5' }}
                    onClick={() => procesarEliminarCotizacion(venta)}
                    title="Eliminar Cotización Permanentemente"
                    disabled={procesandoAnulacion}
                  >
                    <Trash2 size={16} />
                    Eliminar
                  </button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Modal de detalles */}
      {mostrandoDetalles && ventaSeleccionada && (
        <div className="modal-overlay" onClick={() => {
          setMostrandoDetalles(false);
          setVentaSeleccionada(null);
          setHistorialCambios([]);
        }}>
          <div className="modal-content modal-detalles-venta" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
            <button
              className="modal-close"
              onClick={() => {
                setMostrandoDetalles(false);
                setVentaSeleccionada(null);
                setHistorialCambios([]);
              }}
            >
              <X size={24} />
            </button>

            <h2 style={{ marginBottom: '1.5rem' }}>Detalles de Venta #{ventaSeleccionada.id?.slice(0, 8)}</h2>

            {/* Información básica */}
            <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                <div>
                  <strong>Fecha:</strong> {formatFecha(ventaSeleccionada.created_at || ventaSeleccionada.fecha)}
                </div>
                <div>
                  <strong>Método de Pago:</strong> {ventaSeleccionada.metodo_pago || 'N/A'}
                </div>
                <div>
                  <strong>Total:</strong> {formatCOP(ventaSeleccionada.total || 0)}
                </div>
                <div>
                  <strong>Vendedor:</strong> {ventaSeleccionada.vendedor?.employee_name || ventaSeleccionada.usuario_nombre || 'N/A'}
                </div>
              </div>
            </div>

            {/* Items de la venta */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>Productos</h3>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                {ventaSeleccionada.items?.map((item, idx) => {
                  const tieneVariaciones = item.variaciones && Object.keys(item.variaciones).length > 0;
                  const tieneToppings = item.toppings && Array.isArray(item.toppings) && item.toppings.length > 0;
                  const tieneJewelryInfo = item.metadata && (item.metadata.peso || item.metadata.material || (item.metadata.jewelry_material_type && item.metadata.jewelry_material_type !== 'na'));
                  return (
                    <div key={idx} style={{ padding: '0.75rem', borderBottom: idx < ventaSeleccionada.items.length - 1 ? '1px solid #e5e7eb' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '500' }}>{item.nombre}</div>
                        {item.variant_nombre && (
                          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.15rem' }}>
                            Variante: {item.variant_nombre}
                          </div>
                        )}
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.15rem' }}>
                          Cantidad: {item.qty} | Precio unitario: {formatCOP(item.precio_venta || item.precio || 0)}
                        </div>
                        {/* Información de joyería */}
                        {tieneJewelryInfo && organization?.business_type === 'jewelry_metals' && (
                          <div style={{
                            marginTop: '0.35rem',
                            fontSize: '0.8rem',
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.5rem'
                          }}>
                            {item.metadata.peso && (
                              <span style={{
                                backgroundColor: '#fef3c7',
                                color: '#92400e',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '500',
                                border: '1px solid #fbbf24'
                              }}>
                                Peso: {item.metadata.peso}g
                              </span>
                            )}
                            {item.metadata.material && (
                              <span style={{
                                backgroundColor: '#e0f2fe',
                                color: '#0277bd',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '500',
                                border: '1px solid #29b6f6'
                              }}>
                                Material: {item.metadata.material}
                              </span>
                            )}
                            {item.metadata.jewelry_material_type && item.metadata.jewelry_material_type !== 'na' && (
                              <span style={{
                                backgroundColor: item.metadata.jewelry_material_type === 'local' ? '#f0f9ff' : '#f8fafc',
                                color: item.metadata.jewelry_material_type === 'local' ? '#0c4a6e' : '#475569',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                border: item.metadata.jewelry_material_type === 'local' ? '1px solid #0ea5e9' : '1px solid #64748b'
                              }}>
                                {item.metadata.jewelry_material_type === 'local' ? 'Nacional' : 'Internacional'}
                              </span>
                            )}
                          </div>
                        )}
                        {tieneVariaciones && (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#6b7280' }}>
                            <div style={{ fontWeight: '500', color: '#4b5563', marginBottom: '0.2rem' }}>
                              Variaciones:
                            </div>
                            {Object.entries(item.variaciones).map(([key, value], vIdx) => {
                              const opcionLabel = typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value);
                              return (
                                <div key={vIdx}>• {key}: {opcionLabel}</div>
                              );
                            })}
                          </div>
                        )}
                        {tieneToppings && (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#6b7280' }}>
                            <div style={{ fontWeight: '500', color: '#4b5563', marginBottom: '0.2rem' }}>
                              Toppings:
                            </div>
                            {item.toppings.map((topping, tIdx) => (
                              <div key={tIdx}>
                                • {topping.nombre}{topping.cantidad > 1 ? ` (x${topping.cantidad})` : ''}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ fontWeight: '600', whiteSpace: 'nowrap' }}>
                        {formatCOP((item.precio_venta || item.precio || 0) * item.qty)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Historial de cambios */}
            {cargandoHistorial ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <RefreshCw className="spinning" size={24} />
                <p>Cargando historial...</p>
              </div>
            ) : historialCambios.length > 0 ? (
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Historial de Modificaciones</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {historialCambios.map((cambio, idx) => (
                    <div key={idx} style={{ padding: '1rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                        <div>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '4px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            background: cambio.tipo === 'cambio' ? '#dbeafe' : '#fee2e2',
                            color: cambio.tipo === 'cambio' ? '#1e40af' : '#991b1b'
                          }}>
                            {cambio.tipo === 'cambio' ? 'Cambio de Productos' : 'Devolución'}
                          </span>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            {formatFecha(cambio.fecha)}
                          </div>
                        </div>
                      </div>

                      {cambio.tipo === 'cambio' ? (
                        <>
                          {cambio.items_devueltos && cambio.items_devueltos.length > 0 && (
                            <div style={{ marginBottom: '0.75rem' }}>
                              <strong style={{ fontSize: '0.875rem', color: '#6b7280' }}>Productos devueltos:</strong>
                              <ul style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.875rem' }}>
                                {cambio.items_devueltos.map((item, i) => (
                                  <li key={i}>{item.nombre} x{item.cantidad} ({formatCOP(item.precio_venta * item.cantidad)})</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {cambio.items_nuevos && cambio.items_nuevos.length > 0 && (
                            <div style={{ marginBottom: '0.75rem' }}>
                              <strong style={{ fontSize: '0.875rem', color: '#6b7280' }}>Productos nuevos:</strong>
                              <ul style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.875rem' }}>
                                {cambio.items_nuevos.map((item, i) => (
                                  <li key={i}>{item.nombre} x{item.cantidad} ({formatCOP(item.precio_venta * item.cantidad)})</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {cambio.diferencia !== undefined && cambio.diferencia !== 0 && (
                            <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: cambio.diferencia > 0 ? '#fef3c7' : '#d1fae5', borderRadius: '4px' }}>
                              <strong>Diferencia:</strong> {cambio.diferencia > 0
                                ? `Cliente pagó ${formatCOP(cambio.diferencia)} adicionales`
                                : `Cliente recibió ${formatCOP(Math.abs(cambio.diferencia))} de diferencia`
                              }
                              {cambio.metodo_pago && <span> ({cambio.metodo_pago})</span>}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {cambio.items && cambio.items.length > 0 && (
                            <div style={{ marginBottom: '0.75rem' }}>
                              <strong style={{ fontSize: '0.875rem', color: '#6b7280' }}>Productos devueltos:</strong>
                              <ul style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.875rem' }}>
                                {cambio.items.map((item, i) => (
                                  <li key={i}>{item.nombre || item.id} x{item.qty || item.cantidad} ({formatCOP((item.precio_venta || item.precio || 0) * (item.qty || item.cantidad))})</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
                            <strong>Total devolución:</strong> {formatCOP(cambio.total_devolucion || 0)}
                            {cambio.es_completa && <span style={{ marginLeft: '0.5rem', color: '#dc2626', fontWeight: '600' }}>(Devolución completa)</span>}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem' }}>
              <button
                className="btn-cancel"
                onClick={() => {
                  setMostrandoDetalles(false);
                  setVentaSeleccionada(null);
                  setHistorialCambios([]);
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de recibo */}
      {mostrandoRecibo && ventaSeleccionada && (
        <div className="modal-overlay" onClick={() => setMostrandoRecibo(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setMostrandoRecibo(false)}
            >
              <X size={24} />
            </button>
            <ReciboVenta
              venta={ventaSeleccionada}
              mostrarCerrar={true}
              onCerrar={() => {
                setMostrandoRecibo(false);
                setVentaSeleccionada(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Modal de confirmación anulación */}
      {mostrandoAnulacion && ventaParaAccion && (
        <div className="modal-overlay" onClick={() => !procesandoAnulacion && setMostrandoAnulacion(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ color: '#dc2626', marginBottom: '1rem', fontSize: '1.25rem' }}>Anular Venta</h3>
            <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
              ¿Estás seguro de que deseas anular esta venta (<strong>#{ventaParaAccion.numero_venta}</strong>)?
              <br /><br />
              <strong>Atención:</strong> Esta acción devolverá los productos al inventario y eliminará este ingreso de los reportes y cierres de caja.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                className="btn-cancel"
                onClick={() => setMostrandoAnulacion(false)}
                disabled={procesandoAnulacion}
              >
                Cancelar
              </button>
              <button
                className="btn-confirm"
                style={{ backgroundColor: '#ef4444' }}
                onClick={procesarAnulacion}
                disabled={procesandoAnulacion}
              >
                {procesandoAnulacion ? 'Anulando...' : 'Sí, Anular Venta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de devolución */}
      {mostrandoDevolucion && ventaParaAccion && (
        <ModalDevolucion
          venta={ventaParaAccion}
          onConfirmar={procesarDevolucion}
          onCancelar={() => {
            setMostrandoDevolucion(false);
            setVentaParaAccion(null);
          }}
        />
      )}

      {/* Modal de cambio */}
      {mostrandoCambio && ventaParaAccion && (
        <ModalCambio
          venta={ventaParaAccion}
          onConfirmar={procesarCambio}
          onCancelar={() => {
            setMostrandoCambio(false);
            setVentaParaAccion(null);
          }}
        />
      )}
    </div>
  );
};

// Componente Modal de Devolución
const ModalDevolucion = ({ venta, onConfirmar, onCancelar }) => {
  const [itemsSeleccionados, setItemsSeleccionados] = useState([]);

  // Agrupar productos por ID para manejar duplicados
  const itemsAgrupados = React.useMemo(() => {
    if (!venta.items) return [];

    const agrupados = {};
    venta.items.forEach(item => {
      const itemId = item.id || item.producto_id;
      if (!itemId) return;
      if (agrupados[itemId]) {
        agrupados[itemId].qty_vendida += item.qty || 1;
        agrupados[itemId].precio_venta = item.precio_venta || item.precio || 0;
      } else {
        agrupados[itemId] = {
          ...item,
          id: itemId,
          qty_vendida: item.qty || 1,
          precio_venta: item.precio_venta || item.precio || 0
        };
      }
    });

    return Object.values(agrupados);
  }, [venta.items]);

  const toggleItem = (item) => {
    setItemsSeleccionados(prev => {
      const existe = prev.find(i => i.id === item.id);
      if (existe) {
        return prev.filter(i => i.id !== item.id);
      }
      // Inicializar con la cantidad total vendida
      return [...prev, { ...item, qty: item.qty_vendida }];
    });
  };

  const actualizarCantidad = (itemId, nuevaCantidad) => {
    setItemsSeleccionados(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          const itemOriginal = itemsAgrupados.find(i => i.id === itemId);
          const maxCantidad = itemOriginal?.qty_vendida || item.qty_vendida || item.qty;
          // Limitar entre 1 y la cantidad máxima vendida
          const cantidadAjustada = Math.max(1, Math.min(nuevaCantidad, maxCantidad));
          return { ...item, qty: cantidadAjustada };
        }
        return item;
      })
    );
  };

  const totalDevolucion = itemsSeleccionados.reduce(
    (sum, item) => sum + (item.precio_venta * item.qty), 0
  );

  const formatCOP = (value) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-devolucion">
        <h2>Procesar Devolución</h2>
        <p className="modal-subtitle">Selecciona los productos a devolver</p>

        <div className="items-list">
          {itemsAgrupados.map((item) => {
            const seleccionado = itemsSeleccionados.find(i => i.id === item.id);
            const cantidadDisponible = item.qty_vendida || item.qty || 1;
            return (
              <div
                key={item.id}
                className={`item-row ${seleccionado ? 'selected' : ''}`}
                onClick={() => toggleItem(item)}
              >
                <input
                  type="checkbox"
                  checked={!!seleccionado}
                  onChange={() => toggleItem(item)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="item-info">
                  <span className="item-name">{item.nombre}</span>
                  <div className="item-meta">
                    <span className="item-price">{formatCOP(item.precio_venta)}</span>
                    <span className="item-qty-info">Cantidad vendida: {cantidadDisponible}</span>
                  </div>
                </div>
                {seleccionado && (
                  <div className="item-qty-control-wrapper">
                    <div className="item-qty-control">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          actualizarCantidad(item.id, seleccionado.qty - 1);
                        }}
                        disabled={seleccionado.qty <= 1}
                        title="Disminuir cantidad"
                      >
                        -
                      </button>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={String(seleccionado.qty || 1)}
                        onChange={(e) => {
                          const valor = e.target.value.replace(/\D/g, '');
                          const nuevaCantidad = valor ? Math.max(1, Math.min(parseInt(valor, 10), cantidadDisponible)) : 1;
                          actualizarCantidad(item.id, nuevaCantidad);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.target.select()}
                        className="qty-input"
                        style={{
                          width: '36px',
                          height: '24px',
                          minWidth: '36px',
                          maxWidth: '36px',
                          minHeight: '24px',
                          maxHeight: '24px',
                          display: 'block',
                          visibility: 'visible',
                          opacity: 1,
                          position: 'relative',
                          zIndex: 10000,
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '4px',
                          textAlign: 'center',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          color: '#1a1a1a',
                          WebkitTextFillColor: '#1a1a1a',
                          padding: 0,
                          margin: 0,
                          lineHeight: '24px',
                          boxSizing: 'border-box'
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          actualizarCantidad(item.id, seleccionado.qty + 1);
                        }}
                        disabled={seleccionado.qty >= cantidadDisponible}
                        title="Aumentar cantidad"
                      >
                        +
                      </button>
                    </div>
                    <span className="qty-max-hint">de {cantidadDisponible}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {itemsSeleccionados.length > 0 && (
          <div className="devolucion-total">
            <span>Total a devolver:</span>
            <span className="total-amount">{formatCOP(totalDevolucion)}</span>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            className="btn-confirm"
            onClick={() => onConfirmar(venta, itemsSeleccionados)}
            disabled={itemsSeleccionados.length === 0}
          >
            <RotateCcw size={18} />
            Procesar Devolución
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente Modal de Cambio
const ModalCambio = ({ venta, onConfirmar, onCancelar }) => {
  const { organization } = useAuth();
  const { data: productos = [] } = useProductos(organization?.id);
  const [itemsACambiar, setItemsACambiar] = useState([]);
  const [itemsNuevos, setItemsNuevos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [paso, setPaso] = useState(1); // 1: Seleccionar productos a cambiar, 2: Seleccionar productos nuevos, 3: Pago
  const [metodoPago, setMetodoPago] = useState(null);
  const [montoEntregado, setMontoEntregado] = useState('');

  // Agrupar productos por ID para manejar duplicados
  const itemsAgrupados = React.useMemo(() => {
    if (!venta.items) return [];

    const agrupados = {};
    venta.items.forEach(item => {
      const itemId = item.id || item.producto_id;
      if (!itemId) return;
      if (agrupados[itemId]) {
        agrupados[itemId].qty_vendida += item.qty || 1;
        agrupados[itemId].precio_venta = item.precio_venta || item.precio || 0;
      } else {
        agrupados[itemId] = {
          ...item,
          id: itemId,
          qty_vendida: item.qty || 1,
          precio_venta: item.precio_venta || item.precio || 0
        };
      }
    });

    return Object.values(agrupados);
  }, [venta.items]);

  // Filtrar productos disponibles
  const productosDisponibles = React.useMemo(() => {
    let filtrados = productos.filter(p => {
      // Excluir servicios si es necesario
      if (p.tipo === 'servicio') return false;
      // Filtrar por búsqueda
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        return p.nombre.toLowerCase().includes(q) ||
          p.codigo?.toLowerCase().includes(q);
      }
      return true;
    });
    return filtrados;
  }, [productos, busqueda]);

  const toggleItemCambio = (item) => {
    setItemsACambiar(prev => {
      const existe = prev.find(i => i.id === item.id);
      if (existe) {
        return prev.filter(i => i.id !== item.id);
      }
      return [...prev, { ...item, qty: item.qty_vendida }];
    });
  };

  const actualizarCantidadCambio = (itemId, nuevaCantidad) => {
    setItemsACambiar(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          const itemOriginal = itemsAgrupados.find(i => i.id === itemId);
          const maxCantidad = itemOriginal?.qty_vendida || item.qty_vendida || item.qty;
          const cantidadAjustada = Math.max(1, Math.min(nuevaCantidad, maxCantidad));
          return { ...item, qty: cantidadAjustada };
        }
        return item;
      })
    );
  };

  const agregarProductoNuevo = (producto) => {
    setItemsNuevos(prev => {
      const existe = prev.find(p => p.id === producto.id);
      if (existe) {
        return prev.map(p =>
          p.id === producto.id
            ? { ...p, qty: (p.qty || 1) + 1 }
            : p
        );
      }
      return [...prev, {
        id: producto.id,
        nombre: producto.nombre,
        precio_venta: producto.precio_venta,
        stock_disponible: producto.stock,
        qty: 1
      }];
    });
  };

  const actualizarCantidadNuevo = (itemId, nuevaCantidad) => {
    setItemsNuevos(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          const stockMax = item.stock_disponible || 999;
          const cantidadAjustada = Math.max(1, Math.min(nuevaCantidad, stockMax));
          return { ...item, qty: cantidadAjustada };
        }
        return item;
      })
    );
  };

  const eliminarProductoNuevo = (itemId) => {
    setItemsNuevos(prev => prev.filter(p => p.id !== itemId));
  };

  const totalDevolucion = itemsACambiar.reduce(
    (sum, item) => sum + (item.precio_venta * item.qty), 0
  );

  const totalNuevo = itemsNuevos.reduce(
    (sum, item) => sum + (item.precio_venta * item.qty), 0
  );

  const diferencia = totalNuevo - totalDevolucion;

  const formatCOP = (value) => {
    if (!value && value !== 0) return '$0';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value);
  };

  const handleConfirmar = () => {
    if (paso === 1) {
      if (itemsACambiar.length === 0) {
        toast.error('Selecciona al menos un producto para cambiar');
        return;
      }
      setPaso(2);
    } else if (paso === 2) {
      if (itemsNuevos.length === 0) {
        toast.error('Selecciona al menos un producto nuevo');
        return;
      }
      // Si el cliente debe pagar, ir al paso 3 (pago), si no, procesar directamente
      if (diferencia > 0) {
        setPaso(3);
      } else {
        onConfirmar(venta, itemsACambiar, itemsNuevos, null, null);
      }
    } else if (paso === 3) {
      // Validar método de pago
      if (diferencia > 0 && !metodoPago) {
        toast.error('Selecciona un método de pago');
        return;
      }

      // Si es efectivo, validar monto
      if (metodoPago === 'Efectivo') {
        const monto = parseFloat(montoEntregado.replace(/[^\d]/g, '')) || 0;
        if (monto < diferencia) {
          toast.error(`El monto debe ser mayor o igual a ${formatCOP(diferencia)}`);
          return;
        }
        onConfirmar(venta, itemsACambiar, itemsNuevos, metodoPago, monto);
      } else {
        onConfirmar(venta, itemsACambiar, itemsNuevos, metodoPago, null);
      }
    }
  };

  const handleValorPredefinido = (valor) => {
    const montoActual = parseFloat(montoEntregado.replace(/[^\d]/g, '')) || 0;
    const nuevoMonto = montoActual + valor;
    setMontoEntregado(nuevoMonto.toLocaleString('es-CO'));
  };

  const puedeCredito = Boolean(venta?.cliente_id || venta?.cliente?.id);

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-cambio">
        <h2>Cambio de Productos</h2>
        <p className="modal-subtitle">
          {paso === 1
            ? 'Paso 1: Selecciona los productos a cambiar'
            : paso === 2
              ? 'Paso 2: Selecciona los productos nuevos'
              : 'Paso 3: Método de pago'
          }
        </p>

        {paso === 1 ? (
          <>
            <div className="items-list">
              {itemsAgrupados.map((item) => {
                const seleccionado = itemsACambiar.find(i => i.id === item.id);
                const cantidadDisponible = item.qty_vendida || item.qty || 1;
                return (
                  <div
                    key={item.id}
                    className={`item-row ${seleccionado ? 'selected' : ''}`}
                    onClick={() => toggleItemCambio(item)}
                  >
                    <input
                      type="checkbox"
                      checked={!!seleccionado}
                      onChange={() => toggleItemCambio(item)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="item-info">
                      <span className="item-name">{item.nombre}</span>
                      <div className="item-meta">
                        <span className="item-price">{formatCOP(item.precio_venta)}</span>
                        <span className="item-qty-info">Cantidad vendida: {cantidadDisponible}</span>
                      </div>
                    </div>
                    {seleccionado && (
                      <div className="item-qty-control-wrapper">
                        <div className="item-qty-control">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              actualizarCantidadCambio(item.id, seleccionado.qty - 1);
                            }}
                            disabled={seleccionado.qty <= 1}
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={String(seleccionado.qty || 1)}
                            onChange={(e) => {
                              const valor = e.target.value.replace(/\D/g, '');
                              const nuevaCantidad = valor ? Math.max(1, Math.min(parseInt(valor, 10), cantidadDisponible)) : 1;
                              actualizarCantidadCambio(item.id, nuevaCantidad);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => e.target.select()}
                            className="qty-input"
                            style={{
                              width: '36px',
                              height: '24px',
                              minWidth: '36px',
                              maxWidth: '36px',
                              display: 'block',
                              visibility: 'visible',
                              opacity: 1,
                              position: 'relative',
                              zIndex: 10000,
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '4px',
                              textAlign: 'center',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: '#1a202c',
                              WebkitTextFillColor: '#1a202c',
                              padding: '2px 0',
                              margin: 0,
                              lineHeight: '20px',
                              boxSizing: 'border-box'
                            }}
                          />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              actualizarCantidadCambio(item.id, seleccionado.qty + 1);
                            }}
                            disabled={seleccionado.qty >= cantidadDisponible}
                          >
                            +
                          </button>
                        </div>
                        <span className="qty-max-hint">de {cantidadDisponible}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {itemsACambiar.length > 0 && (
              <div className="devolucion-total">
                <span>Total productos a cambiar:</span>
                <span className="total-amount">{formatCOP(totalDevolucion)}</span>
              </div>
            )}
          </>
        ) : paso === 2 ? (
          <>
            <div className="search-box" style={{ marginBottom: '1rem' }}>
              <Search size={20} />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
              Total a cambiar: {formatCOP(totalDevolucion)}
            </div>

            {/* Productos nuevos seleccionados */}
            {itemsNuevos.length > 0 && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Productos nuevos seleccionados:</h3>
                <div className="items-list">
                  {itemsNuevos.map((item) => (
                    <div key={item.id} className="item-row selected">
                      <div className="item-info">
                        <span className="item-name">{item.nombre}</span>
                        <div className="item-meta">
                          <span className="item-price">{formatCOP(item.precio_venta)}</span>
                          <span className="item-qty-info">Stock: {item.stock_disponible || 0}</span>
                        </div>
                      </div>
                      <div className="item-qty-control-wrapper">
                        <div className="item-qty-control">
                          <button
                            onClick={() => actualizarCantidadNuevo(item.id, item.qty - 1)}
                            disabled={item.qty <= 1}
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={String(item.qty || 1)}
                            onChange={(e) => {
                              const valor = e.target.value.replace(/\D/g, '');
                              const nuevaCantidad = valor ? Math.max(1, Math.min(parseInt(valor, 10), item.stock_disponible || 999)) : 1;
                              actualizarCantidadNuevo(item.id, nuevaCantidad);
                            }}
                            onFocus={(e) => e.target.select()}
                            className="qty-input"
                            style={{
                              width: '36px',
                              height: '24px',
                              minWidth: '36px',
                              maxWidth: '36px',
                              display: 'block',
                              visibility: 'visible',
                              opacity: 1,
                              position: 'relative',
                              zIndex: 10000,
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '4px',
                              textAlign: 'center',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: '#1a202c',
                              WebkitTextFillColor: '#1a202c',
                              padding: '2px 0',
                              margin: 0,
                              lineHeight: '20px',
                              boxSizing: 'border-box'
                            }}
                          />
                          <button
                            onClick={() => actualizarCantidadNuevo(item.id, item.qty + 1)}
                            disabled={item.qty >= (item.stock_disponible || 999)}
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            eliminarProductoNuevo(item.id);
                          }}
                          className="btn-eliminar-producto"
                          title="Eliminar producto"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de productos disponibles */}
            <div className="items-list" style={{ maxHeight: '300px' }}>
              {productosDisponibles.map((producto) => {
                const yaSeleccionado = itemsNuevos.find(p => p.id === producto.id);
                const stockDisponible = producto.stock || 0;
                return (
                  <div
                    key={producto.id}
                    className={`item-row ${yaSeleccionado ? 'selected' : ''}`}
                    onClick={() => !yaSeleccionado && agregarProductoNuevo(producto)}
                    style={{ cursor: yaSeleccionado ? 'default' : 'pointer' }}
                  >
                    <div className="item-info">
                      <span className="item-name">{producto.nombre}</span>
                      <div className="item-meta">
                        <span className="item-price">{formatCOP(producto.precio_venta)}</span>
                        <span className="item-qty-info">Stock: {stockDisponible}</span>
                      </div>
                    </div>
                    {yaSeleccionado && (
                      <span style={{ color: '#10b981', fontSize: '0.875rem' }}>Ya seleccionado</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="devolucion-total" style={{ marginTop: '1rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total productos nuevos:</span>
                  <span className="total-amount" style={{ fontSize: '0.95rem' }}>{formatCOP(totalNuevo)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem', fontWeight: '600', color: diferencia > 0 ? '#ef4444' : diferencia < 0 ? '#10b981' : '#6b7280' }}>
                  <span>Diferencia:</span>
                  <span>
                    {diferencia > 0
                      ? `Cliente paga: ${formatCOP(diferencia)}`
                      : diferencia < 0
                        ? `Cliente recibe: ${formatCOP(Math.abs(diferencia))}`
                        : 'Total equivalente'
                    }
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          // Paso 3: Método de pago
          <>
            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Total productos a cambiar:</span>
                <span className="total-amount">{formatCOP(totalDevolucion)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span>Total productos nuevos:</span>
                <span className="total-amount">{formatCOP(totalNuevo)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.25rem', fontWeight: '600', color: diferencia > 0 ? '#ef4444' : diferencia < 0 ? '#10b981' : '#6b7280', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                <span>{diferencia > 0 ? 'Cliente debe pagar:' : diferencia < 0 ? 'Cliente recibe:' : 'Total equivalente'}</span>
                <span>{diferencia !== 0 ? formatCOP(Math.abs(diferencia)) : 'Sin diferencia'}</span>
              </div>
            </div>

            {diferencia > 0 && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Método de Pago:</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setMetodoPago('Efectivo');
                        setMontoEntregado('');
                      }}
                      className={`metodo-pago-btn ${metodoPago === 'Efectivo' ? 'active' : ''}`}
                      style={{
                        padding: '1rem',
                        border: '2px solid',
                        borderColor: metodoPago === 'Efectivo' ? '#007AFF' : '#e5e7eb',
                        borderRadius: '8px',
                        background: metodoPago === 'Efectivo' ? '#f0f7ff' : 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <Banknote size={24} />
                      <span>Efectivo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPago('Tarjeta')}
                      className={`metodo-pago-btn ${metodoPago === 'Tarjeta' ? 'active' : ''}`}
                      style={{
                        padding: '1rem',
                        border: '2px solid',
                        borderColor: metodoPago === 'Tarjeta' ? '#007AFF' : '#e5e7eb',
                        borderRadius: '8px',
                        background: metodoPago === 'Tarjeta' ? '#f0f7ff' : 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <CreditCard size={24} />
                      <span>Tarjeta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPago('Transferencia')}
                      className={`metodo-pago-btn ${metodoPago === 'Transferencia' ? 'active' : ''}`}
                      style={{
                        padding: '1rem',
                        border: '2px solid',
                        borderColor: metodoPago === 'Transferencia' ? '#007AFF' : '#e5e7eb',
                        borderRadius: '8px',
                        background: metodoPago === 'Transferencia' ? '#f0f7ff' : 'white',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      <Smartphone size={24} />
                      <span>Transferencia</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!puedeCredito) {
                          toast.error('Para usar crédito debes asignar un cliente a la venta.');
                          return;
                        }
                        setMetodoPago('Credito');
                      }}
                      className={`metodo-pago-btn ${metodoPago === 'Credito' ? 'active' : ''}`}
                      style={{
                        padding: '1rem',
                        border: '2px solid',
                        borderColor: metodoPago === 'Credito' ? '#007AFF' : '#e5e7eb',
                        borderRadius: '8px',
                        background: metodoPago === 'Credito' ? '#f0f7ff' : 'white',
                        cursor: puedeCredito ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.5rem',
                        opacity: puedeCredito ? 1 : 0.5
                      }}
                    >
                      <CreditCard size={24} />
                      <span>Crédito</span>
                    </button>
                  </div>
                </div>

                {metodoPago === 'Efectivo' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Monto entregado por el cliente:
                    </label>
                    <input
                      type="text"
                      value={montoEntregado}
                      onChange={(e) => {
                        const value = e.target.value;
                        const cleanValue = value.replace(/[^\d,.]/g, '');
                        setMontoEntregado(cleanValue);
                      }}
                      placeholder="Ingresa el monto"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '1rem'
                      }}
                      autoFocus
                    />
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {[1000, 5000, 10000, 20000, 50000, 100000].map((valor) => (
                        <button
                          key={valor}
                          type="button"
                          onClick={() => handleValorPredefinido(valor)}
                          style={{
                            padding: '0.5rem 1rem',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            background: 'white',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          {formatCOP(valor)}
                        </button>
                      ))}
                    </div>
                    {montoEntregado && (() => {
                      const monto = parseFloat(montoEntregado.replace(/[^\d]/g, '')) || 0;
                      const cambio = monto - diferencia;
                      return (
                        <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Monto entregado:</span>
                            <span>{formatCOP(monto)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Total a pagar:</span>
                            <span>{formatCOP(diferencia)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.125rem', fontWeight: '600', color: cambio < 0 ? '#ef4444' : '#10b981' }}>
                            <span>Cambio:</span>
                            <span>{cambio < 0 ? `Faltan ${formatCOP(Math.abs(cambio))}` : formatCOP(cambio)}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}

            {diferencia < 0 && (
              <div style={{ padding: '1rem', background: '#f0fdf4', border: '1px solid #10b981', borderRadius: '8px', marginBottom: '1rem' }}>
                <p style={{ margin: 0, color: '#059669', fontWeight: '500' }}>
                  El cliente recibirá {formatCOP(Math.abs(diferencia))} de diferencia. No se requiere método de pago adicional.
                </p>
              </div>
            )}
          </>
        )}

        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancelar}>
            Cancelar
          </button>
          {(paso === 2 || paso === 3) && (
            <button
              className="btn-cancel"
              onClick={() => setPaso(paso - 1)}
              style={{ marginRight: '0.5rem' }}
            >
              Atrás
            </button>
          )}
          <button
            className="btn-confirm"
            onClick={handleConfirmar}
            disabled={
              paso === 1 ? itemsACambiar.length === 0
                : paso === 2 ? itemsNuevos.length === 0
                  : diferencia > 0 && (
                    !metodoPago ||
                    (metodoPago === 'Credito' && !puedeCredito) ||
                    (metodoPago === 'Efectivo' && (!montoEntregado || parseFloat(montoEntregado.replace(/[^\d]/g, '')) < diferencia))
                  )
            }
          >
            <Repeat size={18} />
            {paso === 1 ? 'Continuar' : paso === 2 ? 'Continuar' : 'Confirmar Cambio'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistorialVentas;
