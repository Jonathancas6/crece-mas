import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Plus, Trash2, Search, Check, Send, Download, FileText, CheckCircle, Package, Receipt, XCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCrearOrdenCompra, useActualizarOrdenCompra, useProveedores, useOrdenesCompra } from '../../hooks/useEgresos';
import { useProductos, useActualizarProducto } from '../../hooks/useProductos';
import { supabase } from '../../services/api/supabaseClient';
import './ProveedorModal.css';
import './OrdenCompraModal.css';

const ordenCompraSchema = z.object({
  proveedor_id: z.string().uuid('Debes seleccionar un proveedor'),
  numero_orden: z.string().min(1, 'El número de orden es requerido'),
  fecha_orden: z.string().min(1, 'La fecha es requerida'),
  fecha_esperada: z.string().optional(),
  condiciones_pago: z.string().optional(),
  notas: z.string().optional(),
  descuento: z.string().optional(),
  impuestos: z.string().optional(),
  estado: z.string().optional()
});

const OrdenCompraModal = ({ open, onClose, orden = null }) => {
  const { organization, user } = useAuth();
  const crearOrdenCompra = useCrearOrdenCompra();
  const actualizarOrdenCompra = useActualizarOrdenCompra();
  const actualizarProducto = useActualizarProducto();
  const { data: proveedores = [] } = useProveedores(organization?.id, { activo: true });
  const { data: productos = [] } = useProductos(organization?.id);
  const { data: ordenesExistentes = [], isLoading: isLoadingOrdenes } = useOrdenesCompra(organization?.id);
  
  // Estado para modal de actualización de precios de venta
  const [mostrarModalPreciosVenta, setMostrarModalPreciosVenta] = useState(false);
  const [productosParaActualizar, setProductosParaActualizar] = useState([]);

  // Estado local para manejar la orden después de crearla
  const [ordenLocal, setOrdenLocal] = useState(orden);
  const [items, setItems] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [descuento, setDescuento] = useState(0);
  const [impuestos, setImpuestos] = useState(0);
  const [total, setTotal] = useState(0);
  const [mostrarBusquedaProductos, setMostrarBusquedaProductos] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [productosSeleccionados, setProductosSeleccionados] = useState([]);
  
  const catalogoProductos = useMemo(() => {
    const items = [];
    productos.forEach((producto) => {
      const metadata = producto.metadata || {};
      items.push({
        key: `producto:${producto.id}`,
        tipo_item: 'producto',
        producto_id: producto.id,
        variante_id: null,
        nombre: producto.nombre,
        codigo: producto.codigo || '',
        descripcion: producto.descripcion || '',
        metadata,
        precio_compra: producto.precio_compra || 0,
        precio_venta: producto.precio_venta || 0,
        stock: producto.stock || 0,
        variante_nombre: ''
      });

      (producto.variantes || []).forEach((vari) => {
        items.push({
          key: `variante:${vari.id}`,
          tipo_item: 'variante',
          producto_id: producto.id,
          variante_id: vari.id,
          nombre: `${producto.nombre} - ${vari.nombre || 'Variante'}`,
          codigo: vari.codigo || '',
          descripcion: producto.descripcion || '',
          metadata,
          precio_compra: producto.precio_compra || 0,
          precio_venta: producto.precio_venta || 0,
          stock: vari.stock ?? 0,
          variante_nombre: vari.nombre || ''
        });
      });
    });
    return items;
  }, [productos]);

  // Filtrar productos localmente cuando hay búsqueda
  const productosFiltrados = useMemo(() => {
    if (!busquedaProducto.trim()) return catalogoProductos;
    
    const termino = busquedaProducto.toLowerCase();
    return catalogoProductos.filter(item => {
      const nombre = (item.nombre || '').toLowerCase();
      const codigo = (item.codigo || '').toLowerCase();
      const descripcion = (item.descripcion || '').toLowerCase();
      const metadata = item.metadata || {};
      
      return (
        nombre.includes(termino) ||
        codigo.includes(termino) ||
        descripcion.includes(termino) ||
        (metadata.marca && metadata.marca.toLowerCase().includes(termino)) ||
        (metadata.modelo && metadata.modelo.toLowerCase().includes(termino)) ||
        (metadata.categoria && metadata.categoria.toLowerCase().includes(termino)) ||
        (metadata.color && metadata.color.toLowerCase().includes(termino)) ||
        (metadata.talla && metadata.talla.toLowerCase().includes(termino))
      );
    });
  }, [catalogoProductos, busquedaProducto]);
  
  // Productos a mostrar en el selector
  const productosParaSeleccionar = productosFiltrados;
  const itemsContainerRef = useRef(null);
  const scrollableSectionRef = useRef(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
    getValues
  } = useForm({
    resolver: zodResolver(ordenCompraSchema),
    defaultValues: {
      proveedor_id: '',
      numero_orden: '',
      fecha_orden: new Date().toISOString().split('T')[0],
      fecha_esperada: '',
      condiciones_pago: '',
      notas: '',
      descuento: '0',
      impuestos: '0',
      estado: 'borrador'
    }
  });

  const watchedDescuento = watch('descuento');
  const watchedImpuestos = watch('impuestos');

  // Función para generar el siguiente número de orden
  const generarNumeroOrden = useCallback(() => {
    if (!ordenesExistentes || ordenesExistentes.length === 0) {
      return 'OC-001';
    }

    // Obtener todos los números de orden y extraer el número más alto
    const numeros = ordenesExistentes
      .map(orden => orden.numero_orden)
      .filter(num => num && num.startsWith('OC-'))
      .map(num => {
        const match = num.match(/OC-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      });

    const ultimoNumero = numeros.length > 0 ? Math.max(...numeros) : 0;
    const siguienteNumero = ultimoNumero + 1;
    
    return `OC-${String(siguienteNumero).padStart(3, '0')}`;
  }, [ordenesExistentes]);

  // Sincronizar ordenLocal con el prop orden cuando cambia
  useEffect(() => {
    setOrdenLocal(orden);
  }, [orden]);

  // Calcular totales cuando cambian items, descuento o impuestos
  useEffect(() => {
    const sub = items.reduce((sum, item) => sum + (parseFloat(item.subtotal) || 0), 0);
    const desc = parseFloat(watchedDescuento?.replace(/[^\d.-]/g, '') || 0);
    const imp = parseFloat(watchedImpuestos?.replace(/[^\d.-]/g, '') || 0);
    const tot = sub - desc + imp;

    setSubtotal(sub);
    setDescuento(desc);
    setImpuestos(imp);
    setTotal(tot);
  }, [items, watchedDescuento, watchedImpuestos]);

  useEffect(() => {
    if (open) {
      // Si hay una orden (del prop o de ordenLocal), cargar sus datos
      const ordenParaCargar = orden || ordenLocal;
      
      if (ordenParaCargar) {
        reset({
          proveedor_id: ordenParaCargar.proveedor_id || '',
          numero_orden: ordenParaCargar.numero_orden || '',
          fecha_orden: ordenParaCargar.fecha_orden || new Date().toISOString().split('T')[0],
          fecha_esperada: ordenParaCargar.fecha_esperada || '',
          condiciones_pago: ordenParaCargar.condiciones_pago || '',
          notas: ordenParaCargar.notas || '',
          descuento: ordenParaCargar.descuento?.toString() || '0',
          impuestos: ordenParaCargar.impuestos?.toString() || '0',
          estado: ordenParaCargar.estado || 'borrador'
        });
        // Cargar items con valores recibidos inicializados si no existen
        const itemsConRecepcion = (ordenParaCargar.items || []).map(item => ({
          ...item,
          cantidad_recibida: item.cantidad_recibida || item.cantidad || 0,
          precio_unitario_recibido: item.precio_unitario_recibido || item.precio_unitario || 0,
          selector_key: item.variante_id ? `variante:${item.variante_id}` : (item.producto_id ? `producto:${item.producto_id}` : '')
        }));
        setItems(itemsConRecepcion);
      } else {
        // Generar número de orden automáticamente para nueva orden (o poner temporal si está cargando)
        const nuevoNumero = isLoadingOrdenes ? 'Generando...' : generarNumeroOrden();
        reset({
          proveedor_id: '',
          numero_orden: nuevoNumero,
          fecha_orden: new Date().toISOString().split('T')[0],
          fecha_esperada: '',
          condiciones_pago: '',
          notas: '',
          descuento: '0',
          impuestos: '0',
          estado: 'borrador'
        });
        setItems([]);
      }
    } else {
      // Cuando se cierra el modal, limpiar el estado
      setItems([]);
      setOrdenLocal(null);
    }
  }, [open, orden, ordenLocal, reset, generarNumeroOrden, isLoadingOrdenes]);

  // Sincronizar el número de orden autogenerado una vez que terminen de cargar las órdenes existentes
  useEffect(() => {
    if (open && !orden && !isLoadingOrdenes) {
      const currentNum = getValues('numero_orden');
      // Solo sobreescribir si está vacío o si es el valor temporal "Generando..." o el default "OC-001"
      if (!currentNum || currentNum === 'Generando...' || currentNum === 'OC-001') {
        const nuevoNumero = generarNumeroOrden();
        setValue('numero_orden', nuevoNumero);
      }
    }
  }, [open, orden, isLoadingOrdenes, generarNumeroOrden, setValue, getValues]);

  // Funciones para formatear y parsear moneda
  const formatearMoneda = (valor) => {
    if (!valor || valor === '0' || valor === '') return '';
    const numero = parseFloat(valor.toString().replace(/[^\d.-]/g, '')) || 0;
    if (numero === 0) return '';
    return `$${numero.toLocaleString('es-CO', { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    })}`;
  };

  const parsearMoneda = (valor) => {
    if (!valor) return '0';
    const numero = valor.toString().replace(/[^\d.-]/g, '');
    return numero || '0';
  };

  const agregarItem = () => {
    const nuevoItem = {
      producto_id: null,
      variante_id: null,
      selector_key: '',
      nombre_producto: '',
      descripcion: '',
      cantidad: '1',
      unidad_medida: 'unidad',
      precio_unitario: '0',
      descuento: '0',
      subtotal: '0',
      cantidad_recibida: '0',
      notas: ''
    };
    setItems([...items, nuevoItem]);
    
    // Hacer scroll al nuevo item después de que se renderice
    setTimeout(() => {
      if (scrollableSectionRef.current) {
        scrollableSectionRef.current.scrollTo({
          top: scrollableSectionRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
      // También intentar hacer focus en el primer input del nuevo item
      if (itemsContainerRef.current) {
        const lastRow = itemsContainerRef.current.querySelector('tbody tr:last-child');
        if (lastRow) {
          const firstInput = lastRow.querySelector('input, select');
          if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
          }
        }
      }
    }, 100);
  };

  const eliminarItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const actualizarItem = (index, campo, valor) => {
    const nuevosItems = [...items];
    
    // Si es un campo de moneda, parsear el valor antes de guardarlo
    if (campo === 'precio_unitario' || campo === 'descuento' || campo === 'precio_unitario_recibido') {
      const valorParseado = parsearMoneda(valor);
      nuevosItems[index] = { ...nuevosItems[index], [campo]: valorParseado };
    } else if (campo === 'cantidad_recibida') {
      // Para cantidad recibida, permitir valores vacíos mientras se escribe
      // Si es cadena vacía, mantenerla como cadena vacía
      // Si tiene valor, parsearlo como número
      if (typeof valor === 'string' && valor === '') {
        nuevosItems[index] = { ...nuevosItems[index], [campo]: '' };
      } else {
        const valorNumerico = parseFloat(valor);
        nuevosItems[index] = { ...nuevosItems[index], [campo]: isNaN(valorNumerico) ? '' : valorNumerico };
      }
    } else {
      nuevosItems[index] = { ...nuevosItems[index], [campo]: valor };
    }

    // Si cambió cantidad o precio, recalcular subtotal (solo para campos de orden, no recepción)
    if (campo === 'cantidad' || campo === 'precio_unitario' || campo === 'descuento') {
      const cantidad = parseFloat(nuevosItems[index].cantidad) || 0;
      
      // Manejar precio_unitario: puede ser string o número
      const precioUnitarioStr = typeof nuevosItems[index].precio_unitario === 'string' 
        ? nuevosItems[index].precio_unitario 
        : String(nuevosItems[index].precio_unitario || 0);
      const precioUnitario = parseFloat(precioUnitarioStr.replace(/[^\d.-]/g, '') || 0);
      
      // Manejar descuento: puede ser string o número
      const descuentoStr = typeof nuevosItems[index].descuento === 'string' 
        ? nuevosItems[index].descuento 
        : String(nuevosItems[index].descuento || 0);
      const descuentoItem = parseFloat(descuentoStr.replace(/[^\d.-]/g, '') || 0);
      
      const subtotalItem = (cantidad * precioUnitario) - descuentoItem;
      nuevosItems[index].subtotal = subtotalItem.toFixed(2);
    }

    // Si se seleccionó un producto/variante, actualizar nombre y precio
    if (campo === 'selector_key') {
      if (!valor) {
        nuevosItems[index].producto_id = null;
        nuevosItems[index].variante_id = null;
        nuevosItems[index].nombre_producto = '';
        nuevosItems[index].descripcion = '';
        nuevosItems[index].codigo = '';
        nuevosItems[index].tipo_item = '';
        nuevosItems[index].variante_nombre = '';
      } else {
        const itemCatalogo = catalogoProductos.find(p => p.key === valor);
        if (itemCatalogo) {
          nuevosItems[index].selector_key = valor;
          nuevosItems[index].producto_id = itemCatalogo.producto_id;
          nuevosItems[index].variante_id = itemCatalogo.variante_id || null;
          nuevosItems[index].nombre_producto = itemCatalogo.nombre;
          nuevosItems[index].descripcion = itemCatalogo.descripcion || '';
          nuevosItems[index].codigo = itemCatalogo.codigo || '';
          nuevosItems[index].tipo_item = itemCatalogo.tipo_item;
          nuevosItems[index].variante_nombre = itemCatalogo.variante_nombre || '';
          nuevosItems[index].precio_unitario = (itemCatalogo.precio_compra || itemCatalogo.precio_venta || 0).toString();
        }
      }

      // Recalcular subtotal
      const cantidad = parseFloat(nuevosItems[index].cantidad) || 0;
      const precioUnitarioStr = typeof nuevosItems[index].precio_unitario === 'string' 
        ? nuevosItems[index].precio_unitario 
        : String(nuevosItems[index].precio_unitario || 0);
      const precioUnitario = parseFloat(precioUnitarioStr.replace(/[^\d.-]/g, '') || 0);
      const descuentoStr = typeof nuevosItems[index].descuento === 'string' 
        ? nuevosItems[index].descuento 
        : String(nuevosItems[index].descuento || 0);
      const descuentoItem = parseFloat(descuentoStr.replace(/[^\d.-]/g, '') || 0);
      const subtotalItem = (cantidad * precioUnitario) - descuentoItem;
      nuevosItems[index].subtotal = subtotalItem.toFixed(2);
    }

    setItems(nuevosItems);
  };

  // Función para actualizar inventario cuando la orden se marca como facturada
  const actualizarInventarioDesdeOrden = async (itemsData) => {
    const productosActualizar = [];
    
    for (const item of itemsData) {
      if (!item.producto_id) continue; // Saltar items sin producto_id
      
      const producto = productos.find(p => p.id === item.producto_id);
      if (!producto) continue; // Saltar si no se encuentra el producto
      
      // Obtener precio de compra recibido (o usar el ordenado si no hay recibido)
      const precioCompraRecibido = item.precio_unitario_recibido > 0 
        ? item.precio_unitario_recibido 
        : item.precio_unitario;
      
      // Obtener cantidad recibida
      const cantidadRecibida = item.cantidad_recibida > 0 
        ? item.cantidad_recibida 
        : item.cantidad;
      
      let stockActual = producto.stock || 0;
      let nuevoStock = producto.tipo === 'servicio' ? null : (stockActual + cantidadRecibida);
      
      // Preparar datos para actualizar
      const updates = {
        precio_compra: precioCompraRecibido
      };

      if (item.variante_id) {
        const variante = (producto.variantes || []).find(v => v.id === item.variante_id);
        const stockVariante = variante?.stock ?? 0;
        const nuevoStockVariante = producto.tipo === 'servicio' ? null : (stockVariante + cantidadRecibida);
        stockActual = stockVariante;
        nuevoStock = nuevoStockVariante;
        const { error: varianteError } = await supabase
          .from('product_variants')
          .update({ stock: nuevoStockVariante })
          .eq('id', item.variante_id);
        if (varianteError) {
          throw varianteError;
        }
      } else {
        updates.stock = nuevoStock;
      }
      
      // Actualizar producto
      try {
        await actualizarProducto.mutateAsync({
          id: producto.id,
          updates,
          organizationId: organization?.id
        });
        
        // Calcular porcentaje de ganancia actual si existe precio de venta
        const precioVentaActual = producto.precio_venta || 0;
        const precioCompraAnterior = producto.precio_compra || precioCompraRecibido;
        const porcentajeGananciaActual = precioCompraAnterior > 0 
          ? ((precioVentaActual - precioCompraAnterior) / precioCompraAnterior) * 100 
          : 0;
        
        // Agregar a la lista para mostrar modal de precios de venta
        const nombreDetalle = item.variante_id
          ? `${producto.nombre} - ${(producto.variantes || []).find(v => v.id === item.variante_id)?.nombre || 'Variante'}`
          : producto.nombre;
        productosActualizar.push({
          id: producto.id,
          nombre: nombreDetalle,
          precio_compra_anterior: precioCompraAnterior,
          precio_compra_nuevo: precioCompraRecibido,
          precio_venta_actual: precioVentaActual,
          porcentaje_ganancia: porcentajeGananciaActual,
          stock_anterior: stockActual,
          stock_nuevo: nuevoStock,
          cantidad_recibida: cantidadRecibida
        });
      } catch (error) {
        console.error(`Error al actualizar producto ${producto.nombre}:`, error);
        alert(`Error al actualizar el producto ${producto.nombre}. Por favor, actualízalo manualmente.`);
      }
    }
    
    // Si hay productos para actualizar, mostrar modal para ajustar precios de venta
    if (productosActualizar.length > 0) {
      setProductosParaActualizar(productosActualizar);
      setMostrarModalPreciosVenta(true);
    }
  };

  const guardarOrden = async (data, estadoGuardar = null) => {
    // Si no se especifica estado, usar el estado actual de la orden o 'borrador' por defecto
    const estadoFinal = estadoGuardar || ordenLocal?.estado || 'borrador';
    
    // Si no es borrador, validar que tenga items y proveedor
    if (estadoFinal !== 'borrador') {
      if (items.length === 0) {
        alert('Debes agregar al menos un item a la orden');
        return;
      }
      if (!data.proveedor_id) {
        alert('Debes seleccionar un proveedor');
        return;
      }
    }

    try {
      const ordenData = {
        organization_id: organization.id,
        user_id: user.id,
        proveedor_id: data.proveedor_id || null,
        numero_orden: data.numero_orden,
        fecha_orden: data.fecha_orden || new Date().toISOString().split('T')[0],
        fecha_esperada: data.fecha_esperada || null,
        condiciones_pago: data.condiciones_pago || null,
        notas: data.notas || null,
        descuento: descuento,
        impuestos: impuestos,
        total: total,
        estado: estadoFinal
      };

      const itemsData = items.map(item => {
        // Manejar precio_unitario: puede ser string o número
        const precioUnitarioStr = typeof item.precio_unitario === 'string' 
          ? item.precio_unitario 
          : String(item.precio_unitario || 0);
        const precioUnitario = parseFloat(precioUnitarioStr.replace(/[^\d.-]/g, '') || 0);
        
        // Manejar descuento: puede ser string o número
        const descuentoStr = typeof item.descuento === 'string' 
          ? item.descuento 
          : String(item.descuento || 0);
        const descuentoItem = parseFloat(descuentoStr.replace(/[^\d.-]/g, '') || 0);
        
        // Manejar subtotal: puede ser string o número
        const subtotalItem = typeof item.subtotal === 'number' 
          ? item.subtotal 
          : parseFloat(String(item.subtotal || 0));
        
        return {
          producto_id: item.producto_id || null,
          nombre_producto: item.nombre_producto || 'Producto sin nombre',
          variante_id: item.variante_id || null,
          descripcion: item.descripcion || null,
          cantidad: parseFloat(item.cantidad) || 0,
          unidad_medida: item.unidad_medida || 'unidad',
          precio_unitario: precioUnitario,
          descuento: descuentoItem,
          subtotal: subtotalItem,
          cantidad_recibida: parseFloat(item.cantidad_recibida) || 0,
          precio_unitario_recibido: typeof item.precio_unitario_recibido === 'number' 
            ? item.precio_unitario_recibido 
            : (typeof item.precio_unitario_recibido === 'string'
              ? parseFloat(item.precio_unitario_recibido.replace(/[^\d.-]/g, '') || precioUnitario)
              : precioUnitario),
          notas: item.notas || null
        };
      });

      if (ordenLocal) {
        await actualizarOrdenCompra.mutateAsync({
          id: ordenLocal.id,
          updates: ordenData,
          items: itemsData
        });
        // Actualizar ordenLocal con el nuevo estado
        setOrdenLocal({ ...ordenLocal, ...ordenData });
        
        // Si el estado es "facturada", actualizar inventario
        if (estadoFinal === 'facturada') {
          await actualizarInventarioDesdeOrden(itemsData);
        }
        
        // No cerramos el modal para permitir continuar trabajando con la orden
        if (estadoFinal !== 'borrador') {
          // Mostrar mensaje según el estado
          const mensajes = {
            'enviada': 'Orden marcada como enviada. Puedes descargar el PDF para enviarlo al proveedor.',
            'aprobada': 'Orden marcada como aprobada.',
            'recibida': 'Orden marcada como recibida. Puedes validar las cantidades y precios recibidos.',
            'facturada': 'Orden marcada como facturada. El inventario ha sido actualizado.'
          };
          if (mensajes[estadoFinal]) {
            alert(mensajes[estadoFinal]);
          }
        }
      } else {
        const nuevaOrden = await crearOrdenCompra.mutateAsync({
          ordenData,
          items: itemsData
        });
        
        // Actualizar la orden local para que los botones funcionen
        if (nuevaOrden) {
          setOrdenLocal({ ...nuevaOrden, ...ordenData });
          
          // Si el estado es "facturada", actualizar inventario
          if (estadoFinal === 'facturada') {
            await actualizarInventarioDesdeOrden(itemsData);
          }
          
          // No cerramos el modal, permitimos que el usuario decida qué hacer
          if (estadoFinal === 'borrador') {
            // No mostramos alert ni cerramos, solo guardamos para que pueda usar los botones
          } else if (estadoFinal === 'enviada') {
            alert('Orden creada y marcada como enviada. Puedes descargar el PDF para enviarlo al proveedor.');
            // No cerramos el modal para que pueda descargar el PDF
          } else if (estadoFinal === 'facturada') {
            alert('Orden creada y marcada como facturada. El inventario ha sido actualizado.');
          }
        }
      }
    } catch (error) {
      console.error('Error al guardar orden de compra:', error);
      alert('Error al guardar la orden. Por favor, intenta nuevamente.');
    }
  };

  const onSubmit = async (data) => {
    // Obtener el estado seleccionado del formulario o usar el estado actual
    const estadoSeleccionado = data.estado || ordenLocal?.estado || 'borrador';
    
    // Al crear una orden nueva, usar el estado seleccionado
    if (!ordenLocal) {
      await guardarOrden(data, estadoSeleccionado);
      // No cerramos el modal aquí, permitimos que el usuario decida qué hacer
    } else {
      // Si es una orden existente, actualizar con el estado seleccionado
      await guardarOrden(data, estadoSeleccionado);
    }
  };

  const onGuardarBorrador = async (data) => {
    await guardarOrden(data, 'borrador');
  };

  const avanzarEstado = async (data, nuevoEstado) => {
    if (items.length === 0) {
      alert('Debes agregar al menos un item a la orden');
      return;
    }
    if (!data.proveedor_id) {
      alert('Debes seleccionar un proveedor');
      return;
    }

    const estados = {
      'enviada': 'enviar',
      'aprobada': 'aprobar',
      'recibida': 'marcar como recibida',
      'facturada': 'marcar como facturada'
    };

    const accion = estados[nuevoEstado] || 'cambiar el estado';
    const confirmar = window.confirm(
      `¿Estás seguro de ${accion} esta orden?\n\n` +
      `El estado cambiará a "${nuevoEstado.charAt(0).toUpperCase() + nuevoEstado.slice(1)}".`
    );

    if (!confirmar) return;

    await guardarOrden(data, nuevoEstado);
  };

  const onEnviarProveedor = async (data) => {
    await avanzarEstado(data, 'enviada');
  };

  const generarPDFOrden = () => {
    // Crear una ventana nueva con el contenido de la orden para imprimir/descargar
    const ventanaImpresion = window.open('', '_blank');
    const proveedor = proveedores.find(p => p.id === watch('proveedor_id'));
    
    const contenidoHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Orden de Compra ${watch('numero_orden')}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 20px;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
            color: #1f2937;
          }
          .info-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 30px;
          }
          .info-box h3 {
            margin: 0 0 10px 0;
            font-size: 14px;
            color: #6b7280;
            text-transform: uppercase;
          }
          .info-box p {
            margin: 5px 0;
            font-size: 14px;
            color: #1f2937;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
          }
          th {
            background: #f3f4f6;
            font-weight: 600;
            color: #1f2937;
          }
          .text-right {
            text-align: right;
          }
          .totals {
            margin-top: 20px;
            margin-left: auto;
            width: 300px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
          }
          .total-final {
            font-weight: 700;
            font-size: 18px;
            border-top: 2px solid #333;
            border-bottom: 2px solid #333;
            padding: 10px 0;
            margin-top: 10px;
          }
          .notas {
            margin-top: 30px;
            padding: 15px;
            background: #f9fafb;
            border-radius: 6px;
          }
          @media print {
            body { padding: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>ORDEN DE COMPRA</h1>
          <p><strong>Número:</strong> ${watch('numero_orden')}</p>
          <p><strong>Fecha:</strong> ${watch('fecha_orden') ? new Date(watch('fecha_orden')).toLocaleDateString('es-CO') : ''}</p>
        </div>

        <div class="info-section">
          <div class="info-box">
            <h3>Proveedor</h3>
            <p><strong>${proveedor?.nombre || 'No especificado'}</strong></p>
            ${proveedor?.nit ? `<p>NIT: ${proveedor.nit}</p>` : ''}
            ${proveedor?.direccion ? `<p>${proveedor.direccion}</p>` : ''}
            ${proveedor?.telefono ? `<p>Tel: ${proveedor.telefono}</p>` : ''}
            ${proveedor?.email ? `<p>Email: ${proveedor.email}</p>` : ''}
          </div>
          <div class="info-box">
            <h3>Información de la Orden</h3>
            ${watch('fecha_esperada') ? `<p><strong>Fecha Esperada:</strong> ${new Date(watch('fecha_esperada')).toLocaleDateString('es-CO')}</p>` : ''}
            ${watch('condiciones_pago') ? `<p><strong>Condiciones de Pago:</strong> ${watch('condiciones_pago')}</p>` : ''}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              <th class="text-right">Precio Unit.</th>
              <th class="text-right">Descuento</th>
              <th class="text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => {
              // Manejar precio_unitario: puede ser string o número
              const precioUnitarioStr = typeof item.precio_unitario === 'string' 
                ? item.precio_unitario 
                : String(item.precio_unitario || 0);
              const precioUnitario = parseFloat(precioUnitarioStr.replace(/[^\d.-]/g, '') || 0);
              
              // Manejar descuento: puede ser string o número
              const descuentoStr = typeof item.descuento === 'string' 
                ? item.descuento 
                : String(item.descuento || 0);
              const descuentoItem = parseFloat(descuentoStr.replace(/[^\d.-]/g, '') || 0);
              
              // Manejar subtotal: puede ser string o número
              const subtotalItem = typeof item.subtotal === 'number' 
                ? item.subtotal 
                : parseFloat(String(item.subtotal || 0));
              
              return `
              <tr>
                <td>${item.nombre_producto || '-'}</td>
                <td>${item.cantidad || 0}</td>
                <td>${item.unidad_medida || 'unidad'}</td>
                <td class="text-right">$${precioUnitario.toLocaleString('es-CO')}</td>
                <td class="text-right">$${descuentoItem.toLocaleString('es-CO')}</td>
                <td class="text-right">$${subtotalItem.toLocaleString('es-CO')}</td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>$${subtotal.toLocaleString('es-CO')}</span>
          </div>
          ${descuento > 0 ? `
            <div class="total-row">
              <span>Descuento:</span>
              <span>$${descuento.toLocaleString('es-CO')}</span>
            </div>
          ` : ''}
          ${impuestos > 0 ? `
            <div class="total-row">
              <span>Impuestos:</span>
              <span>$${impuestos.toLocaleString('es-CO')}</span>
            </div>
          ` : ''}
          <div class="total-row total-final">
            <span>TOTAL:</span>
            <span>$${total.toLocaleString('es-CO')}</span>
          </div>
        </div>

        ${watch('notas') ? `
          <div class="notas">
            <h3>Notas:</h3>
            <p>${watch('notas')}</p>
          </div>
        ` : ''}

        <div style="margin-top: 40px; text-align: center; color: #6b7280; font-size: 12px;">
          <p>Esta orden fue generada el ${new Date().toLocaleDateString('es-CO')} a las ${new Date().toLocaleTimeString('es-CO')}</p>
        </div>
      </body>
      </html>
    `;

    ventanaImpresion.document.write(contenidoHTML);
    ventanaImpresion.document.close();
    
    // Esperar a que se cargue el contenido antes de imprimir
    setTimeout(() => {
      ventanaImpresion.print();
    }, 250);
  };

  if (!open) return null;

  // Determinar si la orden está facturada (no se puede editar nada)
  const esFacturada = ordenLocal && ordenLocal.estado === 'facturada';

  return (
    <div className="orden-compra-overlay" onClick={onClose}>
      <div className="orden-compra-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="orden-compra-header">
          <h2 className="orden-compra-title">
            {orden ? 'Editar Orden de Compra' : 'Crear Orden de Compra'}
            {esFacturada && <span style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'normal', marginLeft: '0.5rem' }}>(Solo lectura - Facturada)</span>}
          </h2>
          <button className="orden-compra-close" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {/* Body - Scrollable */}
        <form id="orden-compra-form" onSubmit={handleSubmit(onSubmit)} className="orden-compra-body">
          {/* Proveedor Section */}
          <section className="orden-compra-section">
            <h3 className="orden-compra-section-title">Proveedor</h3>
            <div className="orden-compra-form-row">
              <div className="orden-compra-form-group">
                <label htmlFor="proveedor_id">Proveedor *</label>
                <select 
                  id="proveedor_id" 
                  {...register('proveedor_id')}
                  className={errors.proveedor_id ? 'error' : ''}
                  disabled={esFacturada}
                >
                  <option value="">Seleccionar proveedor</option>
                  {proveedores.map(prov => (
                    <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                  ))}
                </select>
                {errors.proveedor_id && <span className="error-message">{errors.proveedor_id.message}</span>}
              </div>

              <div className="orden-compra-form-group">
                <label htmlFor="numero_orden">Número de Orden *</label>
                <input
                  id="numero_orden"
                  type="text"
                  {...register('numero_orden')}
                  className={errors.numero_orden ? 'error' : ''}
                  placeholder="OC-001"
                  readOnly={!orden || esFacturada}
                  style={(!orden || esFacturada) ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                />
                {errors.numero_orden && <span className="error-message">{errors.numero_orden.message}</span>}
              </div>
            </div>

            <div className="orden-compra-form-row">
              <div className="orden-compra-form-group">
                <label htmlFor="fecha_orden">Fecha de Orden *</label>
                <input
                  id="fecha_orden"
                  type="date"
                  {...register('fecha_orden')}
                  className={errors.fecha_orden ? 'error' : ''}
                  disabled={esFacturada}
                />
                {errors.fecha_orden && <span className="error-message">{errors.fecha_orden.message}</span>}
              </div>

              <div className="orden-compra-form-group">
                <label htmlFor="fecha_esperada">Fecha Esperada</label>
                <input
                  id="fecha_esperada"
                  type="date"
                  {...register('fecha_esperada')}
                  disabled={esFacturada}
                />
              </div>

              <div className="orden-compra-form-group">
                <label htmlFor="estado">Estado de la Orden</label>
                <select
                  id="estado"
                  {...register('estado')}
                  className={errors.estado ? 'error' : ''}
                  disabled={esFacturada}
                >
                  <option value="borrador">Borrador</option>
                  <option value="enviada">Enviada</option>
                  <option value="aprobada">Aprobada</option>
                  <option value="recibida">Recibida</option>
                  <option value="facturada">Facturada</option>
                  <option value="cancelada">Cancelada</option>
                </select>
                {errors.estado && <span className="error-message">{errors.estado.message}</span>}
              </div>
            </div>

            <div className="orden-compra-form-group">
              <label htmlFor="condiciones_pago">Condiciones de Pago</label>
              <input
                id="condiciones_pago"
                type="text"
                {...register('condiciones_pago')}
                placeholder="Ej: Contado, 30 días, etc."
                readOnly={esFacturada}
                className={esFacturada ? 'readonly' : ''}
              />
            </div>
          </section>

          {/* Items Section */}
          <section className="orden-compra-section">
            <div className="orden-compra-section-header">
              <h3 className="orden-compra-section-title">Detalle de productos / servicios</h3>
              {(!ordenLocal || (ordenLocal.estado !== 'recibida' && ordenLocal.estado !== 'facturada')) && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button 
                    type="button" 
                    className="btn-buscar-productos" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMostrarBusquedaProductos(!mostrarBusquedaProductos);
                    }}
                    title="Buscar y seleccionar productos"
                  >
                    <Search size={16} />
                    Buscar productos
                  </button>
                  <button 
                    type="button" 
                    className="btn-add-item" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      agregarItem();
                    }}
                    title="Agregar nuevo ítem a la orden"
                  >
                    <Plus size={16} />
                    Agregar ítem
                  </button>
                </div>
              )}
            </div>

            {/* Modal de búsqueda de productos */}
            {mostrarBusquedaProductos && (
              <div className="productos-busqueda-modal">
                <div className="productos-busqueda-header">
                  <h4>Buscar y seleccionar productos</h4>
                  <button 
                    type="button"
                    className="productos-busqueda-cerrar"
                    onClick={() => {
                      setMostrarBusquedaProductos(false);
                      setBusquedaProducto('');
                      setProductosSeleccionados([]);
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
                
                <div className="productos-busqueda-input-container">
                  <Search size={18} className="productos-busqueda-icon-outside" />
                  <input
                    type="text"
                    className="productos-busqueda-input"
                    placeholder="Buscar por nombre, código, marca, categoría..."
                    value={busquedaProducto}
                    onChange={(e) => setBusquedaProducto(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="productos-busqueda-lista">
                  {productosParaSeleccionar.length === 0 ? (
                    <div className="productos-busqueda-vacio">
                      <p>No se encontraron productos</p>
                    </div>
                  ) : (
                    productosParaSeleccionar.map((producto) => {
                      const estaSeleccionado = productosSeleccionados.some(p => p.key === producto.key);
                      return (
                        <div
                          key={producto.key}
                          className={`producto-busqueda-item ${estaSeleccionado ? 'seleccionado' : ''}`}
                          onClick={() => {
                            if (estaSeleccionado) {
                              setProductosSeleccionados(productosSeleccionados.filter(p => p.key !== producto.key));
                            } else {
                              setProductosSeleccionados([...productosSeleccionados, producto]);
                            }
                          }}
                        >
                          <div className="producto-busqueda-checkbox">
                            {estaSeleccionado && <Check size={16} />}
                          </div>
                          <div className="producto-busqueda-info">
                            <div className="producto-busqueda-nombre">{producto.nombre}</div>
                            {producto.codigo && (
                              <div className="producto-busqueda-codigo">Código: {producto.codigo}</div>
                            )}
                            <div className="producto-busqueda-precio">
                              Precio: ${(producto.precio_compra || producto.precio_venta || 0).toLocaleString('es-CO')}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {productosSeleccionados.length > 0 && (
                  <div className="productos-busqueda-footer">
                    <div className="productos-seleccionados-count">
                      {productosSeleccionados.length} producto(s) seleccionado(s)
                    </div>
                    <button
                      type="button"
                      className="btn-agregar-seleccionados"
                      onClick={() => {
                        productosSeleccionados.forEach(producto => {
                          const nuevoItem = {
                            producto_id: producto.producto_id,
                            variante_id: producto.variante_id || null,
                            selector_key: producto.key,
                            nombre_producto: producto.nombre,
                            descripcion: producto.descripcion || '',
                            codigo: producto.codigo || '',
                            tipo_item: producto.tipo_item,
                            variante_nombre: producto.variante_nombre || '',
                            cantidad: '1',
                            unidad_medida: 'unidad',
                            precio_unitario: (producto.precio_compra || producto.precio_venta || 0).toString(),
                            descuento: '0',
                            subtotal: (producto.precio_compra || producto.precio_venta || 0).toString(),
                            cantidad_recibida: '0',
                            notas: ''
                          };
                          setItems(prev => [...prev, nuevoItem]);
                        });
                        setProductosSeleccionados([]);
                        setMostrarBusquedaProductos(false);
                        setBusquedaProducto('');
                      }}
                    >
                      <Plus size={16} />
                      Agregar {productosSeleccionados.length} producto(s)
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="orden-compra-section-scrollable" ref={scrollableSectionRef}>
              {items.length === 0 ? (
              <div className="orden-compra-empty-state">
                <p>No hay items agregados. Haz clic en "Agregar ítem" para comenzar.</p>
                {(!ordenLocal || (ordenLocal.estado !== 'recibida' && ordenLocal.estado !== 'facturada')) && (
                  <button 
                    type="button" 
                    className="btn-add-item-empty" 
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      agregarItem();
                    }}
                  >
                    <Plus size={16} />
                    Agregar ítem
                  </button>
                )}
              </div>
            ) : (
              <div className="items-container" ref={itemsContainerRef}>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th className="col-producto">Producto</th>
                      <th className="col-nombre">Nombre del Producto *</th>
                      <th className="col-cantidad">Cantidad *</th>
                      <th className="col-unidad">Unidad</th>
                      <th className="col-precio">Precio Unit. *</th>
                      <th className="col-descuento">Descuento</th>
                      <th className="col-subtotal">Subtotal</th>
                      <th className="col-acciones"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      // Determinar si los campos deben ser readonly (estado recibida o facturada)
                      const esSoloLectura = ordenLocal && (ordenLocal.estado === 'recibida' || ordenLocal.estado === 'facturada');
                      
                      return (
                      <tr key={index}>
                        <td className="col-producto">
                          <select
                            value={item.selector_key || (item.variante_id ? `variante:${item.variante_id}` : (item.producto_id ? `producto:${item.producto_id}` : ''))}
                            onChange={(e) => actualizarItem(index, 'selector_key', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                const nextInput = e.target.closest('tr').querySelector('.col-nombre input');
                                if (nextInput) nextInput.focus();
                              }
                            }}
                            style={{ width: '100%' }}
                            disabled={esSoloLectura}
                          >
                            <option value="">-</option>
                            {catalogoProductos.map(prod => (
                              <option key={prod.key} value={prod.key}>
                                {prod.nombre} {prod.codigo ? `(${prod.codigo})` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="col-nombre">
                          <input
                            type="text"
                            value={item.nombre_producto}
                            onChange={(e) => actualizarItem(index, 'nombre_producto', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                const nextInput = e.target.closest('tr').querySelector('.col-unidad select, .col-unidad input');
                                if (nextInput) nextInput.focus();
                              }
                            }}
                            placeholder="Nombre del producto"
                            required
                            readOnly={esSoloLectura}
                            className={esSoloLectura ? 'readonly' : ''}
                          />
                        </td>
                        <td className="col-cantidad">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.cantidad}
                            onChange={(e) => actualizarItem(index, 'cantidad', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                const nextInput = e.target.closest('tr').querySelector('.col-unidad select');
                                if (nextInput) nextInput.focus();
                              }
                            }}
                            required
                            readOnly={esSoloLectura}
                            className={esSoloLectura ? 'readonly' : ''}
                          />
                        </td>
                        <td className="col-unidad">
                          <select
                            value={item.unidad_medida}
                            onChange={(e) => actualizarItem(index, 'unidad_medida', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                const nextInput = e.target.closest('tr').querySelector('.col-precio input');
                                if (nextInput) nextInput.focus();
                              }
                            }}
                            disabled={esSoloLectura}
                          >
                            <option value="unidad">Unidad</option>
                            <option value="kg">Kilogramo</option>
                            <option value="litro">Litro</option>
                            <option value="metro">Metro</option>
                            <option value="caja">Caja</option>
                            <option value="paquete">Paquete</option>
                          </select>
                        </td>
                        <td className="col-precio">
                          <input
                            type="text"
                            value={formatearMoneda(item.precio_unitario)}
                            onChange={(e) => actualizarItem(index, 'precio_unitario', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                const nextInput = e.target.closest('tr').querySelector('.col-descuento input');
                                if (nextInput) nextInput.focus();
                              }
                            }}
                            placeholder="0"
                            required
                            readOnly={esSoloLectura}
                            className={esSoloLectura ? 'readonly' : ''}
                          />
                        </td>
                        <td className="col-descuento">
                          <input
                            type="text"
                            value={formatearMoneda(item.descuento)}
                            onChange={(e) => actualizarItem(index, 'descuento', e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                // Si es la última fila, agregar nueva fila, sino ir a la siguiente fila
                                if (index === items.length - 1) {
                                  agregarItem();
                                  setTimeout(() => {
                                    const nextRow = document.querySelector(`tbody tr:nth-child(${index + 2}) .col-producto select`);
                                    if (nextRow) nextRow.focus();
                                  }, 100);
                                } else {
                                  const nextRow = e.target.closest('tbody').querySelector(`tr:nth-child(${index + 2}) .col-producto select`);
                                  if (nextRow) nextRow.focus();
                                }
                              }
                            }}
                            placeholder="0"
                            readOnly={esSoloLectura}
                            className={esSoloLectura ? 'readonly' : ''}
                          />
                        </td>
                        <td className="col-subtotal">
                          <input
                            type="text"
                            value={formatearMoneda(item.subtotal)}
                            readOnly
                            className="readonly"
                          />
                        </td>
                        <td className="col-acciones" style={{ overflow: 'visible', position: 'relative', zIndex: 100 }}>
                          {!esSoloLectura && (
                            <button
                              type="button"
                              className="btn-remove-item"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                eliminarItem(index);
                              }}
                              title="Eliminar item"
                              style={{ 
                                display: 'flex',
                                visibility: 'visible',
                                opacity: 1,
                                zIndex: 1000
                              }}
                            >
                              <Trash2 size={18} color="#ef4444" strokeWidth={2} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </section>

          {/* Totales Section */}
          <section className="orden-compra-section">
            <h3 className="orden-compra-section-title">Totales</h3>
            
            <div className="totals-row">
              <div className="total-item">
                <label>Subtotal:</label>
                <span>{subtotal.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}</span>
              </div>
              <div className="total-item">
                <label>Descuento:</label>
                  <input
                    type="text"
                    {...register('descuento')}
                    placeholder="0.00"
                    readOnly={esFacturada}
                    className={esFacturada ? 'readonly' : ''}
                  />
              </div>
              <div className="total-item">
                <label>Impuestos:</label>
                  <input
                    type="text"
                    {...register('impuestos')}
                    placeholder="0.00"
                    readOnly={esFacturada}
                    className={esFacturada ? 'readonly' : ''}
                  />
              </div>
              <div className="total-item total-final">
                <label>Total:</label>
                <span>{total.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </section>

          {/* Validación de Recepción - Solo para órdenes recibidas o facturadas */}
          {(ordenLocal && (ordenLocal.estado === 'recibida' || ordenLocal.estado === 'facturada')) && (
            <section className="orden-compra-section orden-compra-validacion">
              <div className="orden-compra-section-header">
                <h3 className="orden-compra-section-title">Validación de Recepción</h3>
                <p className="orden-compra-section-subtitle">
                  Compara las cantidades y precios ordenados con lo que realmente recibiste
                </p>
              </div>
              <div className="items-container">
                <table className="validacion-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad Ordenada</th>
                      <th>Cantidad Recibida</th>
                      <th>Diferencia</th>
                      <th>Precio Unit. Ordenado</th>
                      <th>Precio Unit. Recibido</th>
                      <th>Diferencia</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const cantidadOrdenada = parseFloat(item.cantidad) || 0;
                      // Manejar cantidad recibida: puede ser string vacío, string numérico, o número
                      const cantidadRecibidaRaw = item.cantidad_recibida;
                      let cantidadRecibida = 0;
                      if (cantidadRecibidaRaw === '' || cantidadRecibidaRaw === null || cantidadRecibidaRaw === undefined) {
                        cantidadRecibida = 0;
                      } else {
                        cantidadRecibida = typeof cantidadRecibidaRaw === 'number' 
                          ? cantidadRecibidaRaw 
                          : (parseFloat(cantidadRecibidaRaw) || 0);
                      }
                      const diferenciaCantidad = cantidadRecibida - cantidadOrdenada;
                      // Determinar si está facturada (no se puede editar nada)
                      const esFacturada = ordenLocal && ordenLocal.estado === 'facturada';
                      
                      const precioOrdenado = typeof item.precio_unitario === 'number' 
                        ? item.precio_unitario 
                        : parseFloat(String(item.precio_unitario || 0).replace(/[^\d.-]/g, ''));
                      const precioRecibido = typeof item.precio_unitario_recibido === 'number'
                        ? item.precio_unitario_recibido
                        : parseFloat(String(item.precio_unitario_recibido || 0).replace(/[^\d.-]/g, ''));
                      const diferenciaPrecio = precioRecibido - precioOrdenado;
                      
                      const tieneDiferencias = diferenciaCantidad !== 0 || diferenciaPrecio !== 0;
                      const estaCompleto = cantidadRecibida >= cantidadOrdenada && precioRecibido > 0;
                      
                      return (
                        <tr key={index} className={tieneDiferencias ? 'item-con-diferencias' : ''}>
                          <td>
                            <strong>{item.nombre_producto || 'Producto sin nombre'}</strong>
                            {item.codigo && <div className="valor-ordenado">Código: {item.codigo}</div>}
                          </td>
                          <td className="valor-ordenado">
                            {cantidadOrdenada.toLocaleString('es-CO')} {item.unidad_medida}
                          </td>
                          <td>
                            <input
                              type="number"
                              className={diferenciaCantidad !== 0 ? 'input-diferencia' : ''}
                              value={typeof item.cantidad_recibida === 'string' && item.cantidad_recibida === '' 
                                ? '' 
                                : (item.cantidad_recibida || 0)}
                              onChange={(e) => {
                                if (esFacturada) return;
                                // Permitir escribir libremente, incluyendo valores vacíos
                                const valor = e.target.value;
                                actualizarItem(index, 'cantidad_recibida', valor);
                              }}
                              onBlur={(e) => {
                                if (esFacturada) return;
                                // Asegurar que siempre tenga un valor numérico válido al perder el foco
                                const valor = e.target.value;
                                if (valor === '' || isNaN(parseFloat(valor)) || parseFloat(valor) < 0) {
                                  actualizarItem(index, 'cantidad_recibida', 0);
                                } else {
                                  actualizarItem(index, 'cantidad_recibida', parseFloat(valor));
                                }
                              }}
                              min="0"
                              step="0.01"
                              placeholder="0"
                              readOnly={esFacturada}
                              style={esFacturada ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                            />
                          </td>
                          <td>
                            {diferenciaCantidad !== 0 && (
                              <span className={`diferencia-badge ${diferenciaCantidad > 0 ? 'positiva' : 'negativa'}`}>
                                {diferenciaCantidad > 0 ? '+' : ''}{diferenciaCantidad.toLocaleString('es-CO')}
                              </span>
                            )}
                          </td>
                          <td className="valor-ordenado">
                            {formatearMoneda(precioOrdenado)}
                          </td>
                          <td>
                            <input
                              type="text"
                              className={diferenciaPrecio !== 0 ? 'input-diferencia' : ''}
                              value={formatearMoneda(precioRecibido)}
                              onChange={(e) => {
                                if (esFacturada) return;
                                actualizarItem(index, 'precio_unitario_recibido', e.target.value);
                              }}
                              placeholder="$0"
                              readOnly={esFacturada}
                              style={esFacturada ? { backgroundColor: '#f3f4f6', cursor: 'not-allowed' } : {}}
                            />
                          </td>
                          <td>
                            {diferenciaPrecio !== 0 && (
                              <span className={`diferencia-badge ${diferenciaPrecio > 0 ? 'negativa' : 'positiva'}`}>
                                {diferenciaPrecio > 0 ? '+' : ''}{formatearMoneda(diferenciaPrecio)}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`estado-badge ${estaCompleto ? 'estado-completo' : 'estado-pendiente'}`}>
                              {estaCompleto ? '✓ Completo' : '⚠ Pendiente'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="validacion-resumen">
                <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                  <strong>Nota:</strong> Los items con diferencias se resaltan en amarillo. 
                  Asegúrate de revisar y actualizar las cantidades y precios recibidos antes de marcar como facturada.
                </p>
              </div>
            </section>
          )}

          {/* Observaciones Section */}
          <section className="orden-compra-section">
            <h3 className="orden-compra-section-title">Observaciones</h3>
            <div className="orden-compra-form-group">
              <textarea
                id="notas"
                {...register('notas')}
                rows="3"
                placeholder="Notas adicionales sobre la orden"
                readOnly={esFacturada}
                className={esFacturada ? 'readonly' : ''}
              />
            </div>
          </section>
        </form>

        {/* Footer */}
        <div className="orden-compra-footer">
          <div className="orden-compra-footer-left">
            {ordenLocal && ordenLocal.estado && (
              <div className="orden-estado-info">
                <span className="orden-estado-label">Estado:</span>
                <span className={`orden-estado-badge estado-${ordenLocal.estado}`}>
                  {ordenLocal.estado === 'borrador' && (
                    <>
                      <FileText size={14} style={{ marginRight: '4px' }} />
                      Borrador
                    </>
                  )}
                  {ordenLocal.estado === 'enviada' && (
                    <>
                      <Send size={14} style={{ marginRight: '4px' }} />
                      Enviada
                    </>
                  )}
                  {ordenLocal.estado === 'aprobada' && (
                    <>
                      <CheckCircle size={14} style={{ marginRight: '4px' }} />
                      Aprobada
                    </>
                  )}
                  {ordenLocal.estado === 'recibida' && (
                    <>
                      <Package size={14} style={{ marginRight: '4px' }} />
                      Recibida
                    </>
                  )}
                  {ordenLocal.estado === 'facturada' && (
                    <>
                      <Receipt size={14} style={{ marginRight: '4px' }} />
                      Facturada
                    </>
                  )}
                  {ordenLocal.estado === 'cancelada' && (
                    <>
                      <XCircle size={14} style={{ marginRight: '4px' }} />
                      Cancelada
                    </>
                  )}
                </span>
              </div>
            )}
            {!ordenLocal && (
              <button 
                type="button" 
                className="btn-guardar-borrador" 
                onClick={handleSubmit(onGuardarBorrador)}
                disabled={isSubmitting}
                title="Guardar como borrador para continuar después"
              >
                Guardar como borrador
              </button>
            )}
          </div>
          <div className="orden-compra-footer-right">
            {/* Mostrar botón de descargar PDF si hay items y proveedor, incluso para órdenes nuevas */}
            {(items.length > 0 && watch('proveedor_id')) && (
              <button 
                type="button" 
                className="btn-descargar-pdf" 
                onClick={generarPDFOrden}
                title="Descargar/Imprimir orden como PDF"
              >
                <Download size={16} />
                Descargar PDF
              </button>
            )}
            {/* Botones para avanzar estado según el estado actual - Solo si NO está facturada */}
            {!esFacturada && (
              <>
                {ordenLocal && ordenLocal.estado === 'borrador' && (
                  <button 
                    type="button" 
                    className="btn-enviar-proveedor" 
                    onClick={handleSubmit((data) => avanzarEstado(data, 'enviada'))}
                    disabled={isSubmitting}
                    title="Enviar orden al proveedor (cambiará a estado: Enviada)"
                  >
                    <Send size={16} />
                    Enviar al Proveedor
                  </button>
                )}
                {ordenLocal && ordenLocal.estado === 'enviada' && (
                  <button 
                    type="button" 
                    className="btn-avanzar-estado" 
                    onClick={handleSubmit((data) => avanzarEstado(data, 'aprobada'))}
                    disabled={isSubmitting}
                    title="Marcar orden como aprobada"
                  >
                    <CheckCircle size={16} style={{ marginRight: '6px' }} />
                    Aprobar Orden
                  </button>
                )}
                {ordenLocal && ordenLocal.estado === 'aprobada' && (
                  <button 
                    type="button" 
                    className="btn-avanzar-estado" 
                    onClick={handleSubmit((data) => avanzarEstado(data, 'recibida'))}
                    disabled={isSubmitting}
                    title="Marcar orden como recibida"
                  >
                    <Package size={16} style={{ marginRight: '6px' }} />
                    Marcar como Recibida
                  </button>
                )}
                {ordenLocal && ordenLocal.estado === 'recibida' && (
                  <button 
                    type="button" 
                    className="btn-avanzar-estado" 
                    onClick={handleSubmit((data) => avanzarEstado(data, 'facturada'))}
                    disabled={isSubmitting}
                    title="Marcar orden como facturada"
                  >
                    <Receipt size={16} style={{ marginRight: '6px' }} />
                    Marcar como Facturada
                  </button>
                )}
                {/* Mostrar botón de enviar si es una orden nueva */}
                {!ordenLocal && (
                  <button 
                    type="button" 
                    className="btn-enviar-proveedor" 
                    onClick={handleSubmit(onEnviarProveedor)}
                    disabled={isSubmitting}
                    title="Guardar y enviar orden al proveedor (estado: Enviada)"
                  >
                    <Send size={16} />
                    Crear y Enviar
                  </button>
                )}
                {(!ordenLocal || ordenLocal.estado === 'borrador') && (
                  <button type="submit" form="orden-compra-form" className="btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Guardando...' : ordenLocal ? 'Actualizar' : 'Crear orden'}
                  </button>
                )}
              </>
            )}
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {/* Modal para actualizar precios de venta */}
      {mostrarModalPreciosVenta && (
        <div className="modal-overlay" onClick={() => setMostrarModalPreciosVenta(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>Actualizar Precios de Venta</h2>
              <button className="modal-close" onClick={() => setMostrarModalPreciosVenta(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-form" style={{ padding: '1.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
              <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
                Los productos han sido actualizados con los nuevos precios de compra y stock. 
                Ahora puedes ajustar los precios de venta si lo deseas.
              </p>
              {productosParaActualizar.map((prod, index) => (
                <div key={prod.id} style={{ 
                  marginBottom: '1.5rem', 
                  padding: '1rem', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '8px' 
                }}>
                  <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>
                    {prod.nombre}
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>
                        Precio de Compra Anterior
                      </label>
                      <div style={{ fontWeight: 500 }}>
                        ${prod.precio_compra_anterior.toLocaleString('es-CO')}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>
                        Precio de Compra Nuevo
                      </label>
                      <div style={{ fontWeight: 600, color: '#059669' }}>
                        ${prod.precio_compra_nuevo.toLocaleString('es-CO')}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>
                        Stock Anterior
                      </label>
                      <div style={{ fontWeight: 500 }}>
                        {prod.stock_anterior}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: '0.25rem' }}>
                        Stock Nuevo (+{prod.cantidad_recibida})
                      </label>
                      <div style={{ fontWeight: 600, color: '#059669' }}>
                        {prod.stock_nuevo}
                      </div>
                    </div>
                  </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.5rem' }}>
                          % Ganancia
                        </label>
                        <input
                          type="number"
                          value={prod.porcentaje_ganancia || ''}
                          onChange={(e) => {
                            const porcentaje = parseFloat(e.target.value) || 0;
                            // Calcular precio de venta basado en el porcentaje
                            const nuevoPrecioVenta = prod.precio_compra_nuevo * (1 + porcentaje / 100);
                            // Actualizar en el array
                            const nuevos = [...productosParaActualizar];
                            nuevos[index].porcentaje_ganancia = porcentaje;
                            nuevos[index].precio_venta_actual = nuevoPrecioVenta;
                            setProductosParaActualizar(nuevos);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '0.875rem'
                          }}
                          placeholder="0"
                          step="0.1"
                          min="0"
                        />
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          Basado en precio de compra nuevo
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: '0.5rem' }}>
                          Precio de Venta *
                        </label>
                        <input
                          type="text"
                          value={formatearMoneda(prod.precio_venta_actual)}
                          onChange={(e) => {
                            const valor = parsearMoneda(e.target.value);
                            // Calcular porcentaje de ganancia basado en el precio de venta
                            const nuevoPorcentaje = prod.precio_compra_nuevo > 0 
                              ? ((valor - prod.precio_compra_nuevo) / prod.precio_compra_nuevo) * 100 
                              : 0;
                            // Actualizar en el array
                            const nuevos = [...productosParaActualizar];
                            nuevos[index].precio_venta_actual = valor;
                            nuevos[index].porcentaje_ganancia = nuevoPorcentaje;
                            setProductosParaActualizar(nuevos);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.625rem 0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '0.875rem'
                          }}
                          placeholder="0"
                        />
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {prod.porcentaje_ganancia !== undefined && prod.porcentaje_ganancia !== null && (
                            <span>
                              {prod.porcentaje_ganancia >= 0 ? '+' : ''}
                              {prod.porcentaje_ganancia.toFixed(2)}% ganancia
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                </div>
              ))}
            </div>
            <div className="modal-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setMostrarModalPreciosVenta(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  try {
                    for (const prod of productosParaActualizar) {
                      await actualizarProducto.mutateAsync({
                        id: prod.id,
                        updates: {
                          precio_venta: prod.precio_venta_actual
                        },
                        organizationId: organization?.id
                      });
                    }
                    alert('Precios de venta actualizados exitosamente.');
                    setMostrarModalPreciosVenta(false);
                    setProductosParaActualizar([]);
                  } catch (error) {
                    console.error('Error al actualizar precios de venta:', error);
                    alert('Error al actualizar algunos precios de venta. Por favor, revísalos manualmente.');
                  }
                }}
              >
                Guardar Precios de Venta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdenCompraModal;
