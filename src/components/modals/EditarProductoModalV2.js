import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../../services/api/supabaseClient';
import LottieLoader from '../../components/ui/LottieLoader';
import '../../pages/dashboard/Inventario.css';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { compressProductImage } from '../../services/storage/imageCompression';
import { useActualizarProducto } from '../../hooks/useProductos';
import { useCurrencyInput, formatCurrency } from '../../hooks/useCurrencyInput';
import { Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PRODUCT_TYPES, ADDITIONAL_FIELDS, getProductTypeFields } from '../../utils/productTypes';
import { generateStoragePath, validateFilename } from '../../utils/fileUtils';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import OptimizedProductImage from '../../components/business/OptimizedProductImage';
import VariacionesConfig from '../VariacionesConfig';
import ProductosVinculados from '../ProductosVinculados';
import './AgregarProductoModalV2.css';

// Función para crear esquema de validación dinámico (igual que en AgregarProductoModalV2)
const createProductSchema = (productType, isJewelryBusiness = false) => {
  const baseSchema = {
    codigo: z.string().max(50, 'El código es muy largo').optional(),
    nombre: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre es muy largo'),
    precioVenta: z.string().optional(),
    tipo: z.enum(['fisico', 'servicio', 'comida', 'accesorio']),
    imagen: z.any().optional(),
  };

  const typeFields = getProductTypeFields(productType);
  
  if (typeFields.required.includes('precio_compra')) {
    baseSchema.precioCompra = z.string().min(1, 'El precio de compra es requerido');
  } else {
    baseSchema.precioCompra = z.string().optional();
  }

  if (typeFields.required.includes('stock')) {
    baseSchema.stock = z.string().min(1, 'El stock es requerido');
  } else {
    baseSchema.stock = z.string().optional();
  }

  // Campos opcionales
  baseSchema.fecha_vencimiento = z.union([z.string(), z.undefined()]).optional();
  baseSchema.peso = z.string().optional();
  baseSchema.unidad_peso = z.string().optional();
  baseSchema.dimensiones = z.string().optional();
  baseSchema.marca = z.string().optional();
  baseSchema.modelo = z.string().optional();
  baseSchema.color = z.string().optional();
  baseSchema.talla = z.string().optional();
  baseSchema.material = z.string().optional();
  baseSchema.categoria = z.string().optional();
  baseSchema.duracion = z.string().optional();
  baseSchema.descripcion = z.string().optional();
  baseSchema.ingredientes = z.string().optional();
  baseSchema.alergenos = z.string().optional();
  baseSchema.calorias = z.string().optional();
  baseSchema.porcion = z.string().optional();
  baseSchema.variaciones = z.string().optional();
  baseSchema.pureza = z.string().optional();
  baseSchema.permite_toppings = z.boolean().optional().default(true);
  baseSchema.umbral_stock_bajo = z.string().optional();
  baseSchema.jewelry_price_mode = z.enum(['fixed', 'variable']).optional();
  baseSchema.jewelry_static_mode = z.enum(['fixed', 'percent']).optional();
  baseSchema.jewelry_static_percent = z.string().optional();
  baseSchema.jewelry_material_type = z.enum(['local', 'international', 'na']).optional();
  baseSchema.jewelry_min_margin = z.string().optional();

  return z.object(baseSchema).superRefine((data, ctx) => {
    const precioCompra = data.precioCompra ? parseFloat(data.precioCompra.replace(/[^\d]/g, '')) : 0;
    const precioVenta = data.precioVenta ? parseFloat(data.precioVenta.replace(/[^\d]/g, '')) : NaN;
    const isVariablePrice = data.jewelry_price_mode === 'variable';

    if (typeFields.required.includes('precio_compra') && (!data.precioCompra || data.precioCompra.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El precio de compra es requerido",
        path: ["precioCompra"]
      });
    }

    if (typeFields.required.includes('stock') && (!data.stock || data.stock.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El stock es requerido",
        path: ["stock"]
      });
    }

    if (!isVariablePrice && (!data.precioVenta || data.precioVenta.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El precio de venta es requerido",
        path: ["precioVenta"]
      });
    }

    if (data.precioVenta && data.precioCompra && !isNaN(precioCompra) && !isNaN(precioVenta) && precioVenta < precioCompra) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El precio de venta debe ser mayor o igual al precio de compra",
        path: ["precioVenta"]
      });
    }

    if (isJewelryBusiness && (!data.peso || data.peso.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El peso es requerido",
        path: ["peso"]
      });
    }
  });
};

// Función para eliminar imagen del storage
const deleteImageFromStorage = async (imagePath) => {
  if (!imagePath) return false;
  try {
    const { error } = await supabase.storage
      .from('productos')
      .remove([imagePath]);
    if (error) {
      console.error('Error eliminando imagen:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error eliminando imagen:', error);
    return false;
  }
};

const EditarProductoModalV2 = ({ open, onClose, producto, onProductoEditado, varianteActivaId = null, soloEditarVariantes = false }) => {
  const { organization, userProfile } = useAuth();
  const { hasFeature } = useSubscription();
  const { isOnline } = useNetworkStatus();
  const isJewelryBusiness = organization?.business_type === 'jewelry_metals';
  const parseWeightValue = useCallback((value) => {
    if (value === '' || value === null || value === undefined) return 0;
    const normalized = value.toString().replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);
  const [formStep, setFormStep] = useState(1); // 1: básico + imagen, 2: opcionales del tipo, 3: adicionales
  const [imagen, setImagen] = useState(null);
  const [imagenUrl, setImagenUrl] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [additionalFields, setAdditionalFields] = useState([]);
  const [variacionesConfig, setVariacionesConfig] = useState([]);
  const [productosVinculados, setProductosVinculados] = useState([]);
  const [variantesProducto, setVariantesProducto] = useState([]);
  const [guardandoVariantes, setGuardandoVariantes] = useState(false);
  const [precioVentaModo, setPrecioVentaModo] = useState('manual'); // 'manual' | 'porcentaje'
  const modoSoloVariantes = soloEditarVariantes && varianteActivaId;
  const fileInputRef = useRef();
  const codigoInputRef = useRef(null);

  const puedeSubirImagenes = hasFeature('productImages');

  // Currency inputs
  const precioCompraInput = useCurrencyInput();
  const precioVentaInput = useCurrencyInput();
  const stockInput = useCurrencyInput();

  // React Query mutation
  const actualizarProductoMutation = useActualizarProducto();

  // Obtener tipo del producto o default
  const selectedType = producto?.tipo || 'fisico';
  const productSchema = createProductSchema(selectedType, isJewelryBusiness);

  const getGoldPriceValue = useCallback((materialType) => {
    if (materialType === 'local') {
      return Number(organization?.jewelry_gold_price_local) || 0;
    }
    if (materialType === 'international') {
      return Number(organization?.jewelry_gold_price_global) || 0;
    }
    return Number(organization?.jewelry_gold_price_global) || 0;
  }, [organization?.jewelry_gold_price_local, organization?.jewelry_gold_price_global]);

  const getMinMarginValue = useCallback((materialType) => {
    if (materialType === 'local') {
      return Number(organization?.jewelry_min_margin_local) || 0;
    }
    if (materialType === 'international') {
      return Number(organization?.jewelry_min_margin_international) || 0;
    }
    return 0;
  }, [organization?.jewelry_min_margin_local, organization?.jewelry_min_margin_international]);

  const getPurityFactor = useCallback((pureza) => {
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
  }, []);

  // Cargar metadata del producto si existe
  const metadata = producto?.metadata || {};
  const pesoInicial = parseWeightValue(metadata?.peso);
  const compraPorUnidadInicial = isJewelryBusiness
    ? (metadata?.jewelry_compra_por_unidad ?? (pesoInicial > 0 ? (Number(producto?.precio_compra || 0) / pesoInicial) : (Number(producto?.precio_compra || 0) || 0)))
    : (Number(producto?.precio_compra || 0) || 0);

  // React Hook Form
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      codigo: producto?.codigo || '',
      nombre: producto?.nombre || '',
      precioCompra: compraPorUnidadInicial ? compraPorUnidadInicial.toString() : '',
      precioVenta: producto?.precio_venta?.toString() || '',
      stock: producto?.stock?.toString() || '',
      tipo: selectedType,
      fecha_vencimiento: producto?.fecha_vencimiento || '',
      peso: metadata?.peso ? String(metadata.peso) : '',
      unidad_peso: metadata?.unidad_peso || (isJewelryBusiness ? (organization?.jewelry_weight_unit || 'g') : 'kg'),
      dimensiones: metadata?.dimensiones || '',
      marca: metadata?.marca || '',
      modelo: metadata?.modelo || '',
      color: metadata?.color || '',
      talla: metadata?.talla ? String(metadata.talla) : '',
      material: metadata?.material || '',
      categoria: metadata?.categoria || '',
      duracion: metadata?.duracion ? String(metadata.duracion) : '',
      descripcion: metadata?.descripcion || '',
      ingredientes: metadata?.ingredientes || '',
      alergenos: metadata?.alergenos || '',
      calorias: metadata?.calorias ? String(metadata.calorias) : '',
      porcion: metadata?.porcion ? String(metadata.porcion) : '',
      variaciones: metadata?.variaciones || '',
      pureza: metadata?.pureza || '',
      permite_toppings: metadata?.permite_toppings !== undefined ? metadata.permite_toppings : true,
      umbral_stock_bajo: metadata?.umbral_stock_bajo?.toString() || '',
      jewelry_price_mode: metadata?.jewelry_price_mode || 'fixed',
      jewelry_static_mode: metadata?.jewelry_static_mode || 'fixed',
      jewelry_static_percent: metadata?.jewelry_static_percent !== undefined && metadata?.jewelry_static_percent !== null
        ? String(metadata.jewelry_static_percent)
        : '',
      jewelry_material_type: metadata?.jewelry_material_type || 'na',
      jewelry_min_margin: metadata?.jewelry_min_margin !== undefined && metadata?.jewelry_min_margin !== null
        ? String(metadata.jewelry_min_margin)
        : ''
    }
  });
  const jewelryPriceMode = watch('jewelry_price_mode');
  const jewelryMaterialType = watch('jewelry_material_type');
  const pesoWatch = watch('peso');
  const purezaWatch = watch('pureza');
  // Usar displayValue que sí es reactivo (es un estado), no numericValue que es un ref
  const compraPorUnidad = precioCompraInput.displayValue 
    ? Number(precioCompraInput.displayValue.replace(/\D/g, ''))
    : 0;
  const pesoNumerico = parseWeightValue(pesoWatch);
  const costoCompraReal = isJewelryBusiness ? (compraPorUnidad * pesoNumerico) : 0;
  const goldPriceActual = getGoldPriceValue(jewelryMaterialType);
  const minMarginActual = getMinMarginValue(jewelryMaterialType);
  const diffActual = goldPriceActual - compraPorUnidad;
  const precioBaseGramoActual = diffActual >= minMarginActual ? goldPriceActual : (compraPorUnidad + minMarginActual);
  const aplicaPureza = jewelryMaterialType === 'international';
  const purityFactorActual = aplicaPureza ? getPurityFactor(purezaWatch) : 1;
  const precioVentaVariableActual = pesoNumerico && precioBaseGramoActual
    ? Math.round(pesoNumerico * precioBaseGramoActual * purityFactorActual * 100) / 100
    : 0;
  const reglaAplicada = diffActual >= minMarginActual ? 'Precio actual' : 'Costo + margen';

  // Ref para rastrear el último producto cargado y evitar re-cargas durante la edición
  const ultimoProductoIdRef = useRef(null);

  // Resetear al paso 1 cuando se abre el modal
  useEffect(() => {
    if (open) {
      setFormStep(1);
    } else {
      // Permitir recargar valores aunque sea el mismo producto al reabrir
      ultimoProductoIdRef.current = null;
      setImagen(null);
      setImagenUrl('');
    }
  }, [open]);

  useEffect(() => {
    if (!isJewelryBusiness || jewelryPriceMode !== 'variable') return;
    const formatted = precioVentaVariableActual ? formatCurrency(precioVentaVariableActual) : '';
    setValue('precioVenta', formatted, { shouldValidate: true });
    precioVentaInput.setValue(precioVentaVariableActual || '');
  }, [isJewelryBusiness, jewelryPriceMode, precioVentaVariableActual, setValue, precioVentaInput, precioCompraInput.displayValue]);

  useEffect(() => {
    if (!isJewelryBusiness || jewelryPriceMode !== 'fixed') return;
    const nextMode = precioVentaModo === 'porcentaje' ? 'percent' : 'fixed';
    setValue('jewelry_static_mode', nextMode, { shouldValidate: false, shouldDirty: true });
  }, [isJewelryBusiness, jewelryPriceMode, precioVentaModo, setValue]);

  // Cargar valores cuando cambia el producto (solo cuando cambia el ID del producto)
  useEffect(() => {
    if (producto && producto.id !== ultimoProductoIdRef.current) {
      ultimoProductoIdRef.current = producto.id;
      const metadata = producto.metadata || {};
      
      setValue('codigo', producto.codigo || '');
      setValue('nombre', producto.nombre || '');
      const pesoProducto = parseWeightValue(metadata?.peso);
      const compraPorUnidad = isJewelryBusiness 
        ? (metadata?.jewelry_compra_por_unidad !== undefined && metadata?.jewelry_compra_por_unidad !== null
          ? Math.round(Number(metadata.jewelry_compra_por_unidad))
          : (pesoProducto > 0 ? Math.round(Number(producto.precio_compra ?? 0) / pesoProducto) : Math.round(Number(producto.precio_compra ?? 0))))
        : Math.round(Number(producto.precio_compra ?? 0));
      setValue('precioCompra', compraPorUnidad !== undefined && compraPorUnidad !== null ? compraPorUnidad.toString() : '');
      setValue('stock', producto.stock !== undefined && producto.stock !== null ? producto.stock.toString() : '');
      setValue('tipo', producto.tipo || 'fisico');
      setValue('fecha_vencimiento', producto.fecha_vencimiento || '');
      if (producto.imagen && (producto.imagen.startsWith('http://') || producto.imagen.startsWith('https://') || producto.imagen.startsWith('data:'))) {
        setImagenUrl(producto.imagen);
      } else {
        setImagenUrl('');
      }
      
      // Cargar variaciones_config si existe
      if (metadata.variaciones_config && Array.isArray(metadata.variaciones_config)) {
        setVariacionesConfig(metadata.variaciones_config);
      } else {
        setVariacionesConfig([]);
      }

      // Cargar variantes de color/tono
      if (producto.variantes && Array.isArray(producto.variantes)) {
        setVariantesProducto(producto.variantes);
      } else {
        setVariantesProducto([]);
      }
      
      // Cargar productos_vinculados si existe
      if (metadata.productos_vinculados && Array.isArray(metadata.productos_vinculados)) {
        setProductosVinculados(metadata.productos_vinculados);
      } else {
        setProductosVinculados([]);
      }
      
      // Cargar campos de metadata
      Object.keys(ADDITIONAL_FIELDS).forEach(fieldId => {
        if (metadata[fieldId] !== undefined && metadata[fieldId] !== null) {
          // Asegurar que valores numéricos se conviertan a string para zod, excepto booleanos
          const valueToSet = typeof metadata[fieldId] === 'boolean' 
            ? metadata[fieldId] 
            : String(metadata[fieldId]);
            
          setValue(fieldId, valueToSet);
          
          // Si el campo no está en los opcionales del tipo, agregarlo a additionalFields
          const typeFields = getProductTypeFields(producto.tipo || selectedType || 'fisico');
          if (typeFields.name !== 'Variaciones' && !typeFields.optional.includes(fieldId)) {
            setAdditionalFields(prev => {
              if (!prev.includes(fieldId)) {
                return [...prev, fieldId];
              }
              return prev;
            });
          }
        }
      });
      
      // Cargar permite_toppings
      setValue('permite_toppings', metadata?.permite_toppings !== undefined ? metadata.permite_toppings : true);
      setValue('umbral_stock_bajo', metadata?.umbral_stock_bajo?.toString() || '');
      
      // IMPORTANTE: Cargar jewelry_price_mode ANTES de cargar el precio de venta
      setValue('jewelry_price_mode', metadata?.jewelry_price_mode || 'fixed');
      setValue('jewelry_material_type', metadata?.jewelry_material_type || 'na');
      setValue('jewelry_static_mode', metadata?.jewelry_static_mode || 'fixed');
      setValue(
        'jewelry_static_percent',
        metadata?.jewelry_static_percent !== undefined && metadata?.jewelry_static_percent !== null
          ? String(metadata.jewelry_static_percent)
          : ''
      );
      setValue(
        'jewelry_min_margin',
        metadata?.jewelry_min_margin !== undefined && metadata?.jewelry_min_margin !== null
          ? String(metadata.jewelry_min_margin)
          : ''
      );

      // Actualizar currency inputs
      precioCompraInput.setValue(compraPorUnidad !== undefined && compraPorUnidad !== null ? compraPorUnidad : '');
      stockInput.setValue(producto.stock !== undefined && producto.stock !== null ? producto.stock : '');
      
      // Para productos de joyería con precio variable, el precio de venta se calculará automáticamente
      // en el useEffect que depende de jewelryPriceMode, peso, etc.
      const esJoyeriaVariable = isJewelryBusiness && metadata?.jewelry_price_mode === 'variable';
      if (!esJoyeriaVariable) {
        // Solo para productos NO variables, establecer el precio guardado
        setValue('precioVenta', producto.precio_venta !== undefined && producto.precio_venta !== null ? producto.precio_venta.toString() : '');
        precioVentaInput.setValue(producto.precio_venta !== undefined && producto.precio_venta !== null ? producto.precio_venta : '');
      } else {
        // Para variables, limpiar y dejar que el useEffect lo calcule
        setValue('precioVenta', '');
        precioVentaInput.setValue('');
      }
    }
  }, [producto, setValue, precioCompraInput, precioVentaInput, stockInput, parseWeightValue, isJewelryBusiness, selectedType]);

  // Refs para detección global de código de barras (funciona aunque el cursor no esté en el campo código)
  const globalBarcodeBufferRef = useRef('');
  const globalLastCharTimeRef = useRef(null);
  const globalBarcodeTimeoutRef = useRef(null);
  const globalBarcodeProcessingRef = useRef(false);

  // Listener global para detectar códigos de barras en cualquier parte del modal
  useEffect(() => {
    // Solo activar si el modal está abierto
    if (!open || modoSoloVariantes) {
      return;
    }

    const handleGlobalKeyDown = (e) => {
      // Ignorar si el usuario está escribiendo en un input, textarea o contenteditable
      const target = e.target;
      const isInputElement = target.tagName === 'INPUT' || 
                            target.tagName === 'TEXTAREA' || 
                            target.isContentEditable ||
                            target.closest('input') ||
                            target.closest('textarea');
      
      // Si está en el input del código, dejar que se maneje normalmente
      if (target === codigoInputRef.current) {
        return;
      }
      
      // Si está en otro input, no procesar como código de barras
      if (isInputElement) {
        return;
      }
      
      // Si es Enter o Tab, podría ser el final del código de barras
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        
        const barcode = globalBarcodeBufferRef.current.trim();
        if (barcode.length >= 3 && !globalBarcodeProcessingRef.current) {
          globalBarcodeProcessingRef.current = true;
          // Establecer el código en el campo código
          setValue('codigo', barcode, { shouldValidate: true });
          // Enfocar el input del código
          if (codigoInputRef.current) {
            codigoInputRef.current.focus();
          }
          
          // Limpiar buffer
          globalBarcodeBufferRef.current = '';
          globalLastCharTimeRef.current = null;
          
          // Resetear flag después de un delay
          setTimeout(() => {
            globalBarcodeProcessingRef.current = false;
          }, 500);
        }
        return;
      }
      
      // Si es un carácter imprimible
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now();
        
        // Si pasó mucho tiempo desde el último carácter, resetear buffer
        if (globalLastCharTimeRef.current && (now - globalLastCharTimeRef.current) > 150) {
          globalBarcodeBufferRef.current = '';
        }
        
        // Agregar carácter al buffer
        globalBarcodeBufferRef.current += e.key;
        globalLastCharTimeRef.current = now;
        
        // Limpiar timeout anterior
        if (globalBarcodeTimeoutRef.current) {
          clearTimeout(globalBarcodeTimeoutRef.current);
        }
        
        // Si después de un tiempo no hay más caracteres, procesar como código de barras
        globalBarcodeTimeoutRef.current = setTimeout(() => {
          const barcode = globalBarcodeBufferRef.current.trim();
          if (barcode.length >= 3 && !globalBarcodeProcessingRef.current) {
            globalBarcodeProcessingRef.current = true;
            // Establecer el código en el campo código
            setValue('codigo', barcode, { shouldValidate: true });
            // Enfocar el input del código
            if (codigoInputRef.current) {
              codigoInputRef.current.focus();
            }
            
            // Limpiar buffer
            globalBarcodeBufferRef.current = '';
            globalLastCharTimeRef.current = null;
            
            // Resetear flag después de un delay
            setTimeout(() => {
              globalBarcodeProcessingRef.current = false;
            }, 500);
          }
        }, 150);
      }
    };
    
    // Agregar listener global
    window.addEventListener('keydown', handleGlobalKeyDown);
    
    // Limpiar al desmontar o cuando se cierre el modal
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (globalBarcodeTimeoutRef.current) {
        clearTimeout(globalBarcodeTimeoutRef.current);
      }
      // Limpiar buffer cuando se cierre el modal
      globalBarcodeBufferRef.current = '';
      globalLastCharTimeRef.current = null;
      globalBarcodeProcessingRef.current = false;
    };
  }, [open, setValue, modoSoloVariantes]);

  const handleBack = () => {
    if (formStep > 1) {
      setFormStep(formStep - 1);
    }
  };

  const handleNext = (e) => {
    // Prevenir el submit del formulario
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    const typeFields = getProductTypeFields(selectedType);
    
    if (formStep === 1) {
      const codigo = watch('codigo');
      const nombre = watch('nombre');
      const precioVenta = watch('precioVenta');
      
      if (!codigo || !nombre || !precioVenta) {
        toast.error('Por favor completa todos los campos requeridos');
        return;
      }
      
      // Si tiene campos opcionales del tipo, ir a paso 2, sino saltar a paso 3
      if (typeFields.optional.length > 0) {
        setFormStep(2);
      } else if (Object.keys(ADDITIONAL_FIELDS).length > 0) {
        setFormStep(3);
      } else {
        // Si no hay más pasos, no hacer nada (el botón cambiará a "Actualizar Producto")
        return;
      }
    } else if (formStep === 2) {
      // De opcionales del tipo a adicionales
      if (Object.keys(ADDITIONAL_FIELDS).length > 0) {
        setFormStep(3);
      } else {
        // Si no hay más pasos, no hacer nada (el botón cambiará a "Actualizar Producto")
        return;
      }
    } else if (formStep === 3) {
      // Ya estamos en el último paso, no hacer nada (el botón cambiará a "Actualizar Producto")
      return;
    }
  };

  const handleStepClick = (stepNumber) => {
    // Permitir navegar a cualquier paso
    setFormStep(stepNumber);
  };

  const handleAddAdditionalField = (fieldId) => {
    if (!additionalFields.includes(fieldId)) {
      setAdditionalFields([...additionalFields, fieldId]);
    }
  };

  const handleRemoveAdditionalField = (fieldId) => {
    setAdditionalFields(additionalFields.filter(id => id !== fieldId));
    setValue(fieldId, '');
  };

  const agregarVariante = () => {
    setVariantesProducto(prev => ([
      ...prev,
      { id: null, nombre: '', codigo: '', stock: 0, producto_id: producto.id }
    ]));
  };

  const actualizarVariante = (index, campo, valor) => {
    setVariantesProducto(prev => prev.map((vari, idx) => (
      idx === index ? { ...vari, [campo]: valor } : vari
    )));
  };

  const eliminarVariante = async (index) => {
    const variante = variantesProducto[index];
    if (!variante) return;

    if (variante.id) {
      if (!window.confirm('¿Eliminar esta variante?')) return;
      const { error } = await supabase
        .from('product_variants')
        .delete()
        .eq('id', variante.id);
      if (error) {
        console.error('Error eliminando variante:', error);
        toast.error('No se pudo eliminar la variante');
        return;
      }
    }

    setVariantesProducto(prev => prev.filter((_, idx) => idx !== index));
    toast.success('Variante eliminada');
  };

  const guardarVariantes = async () => {
    if (!producto?.id || !producto?.organization_id) return;
    if (!isOnline) {
      toast.error('Sin internet: las variantes requieren conexión para guardar.');
      return;
    }
    setGuardandoVariantes(true);

    try {
      const variantesLimpias = variantesProducto.map(vari => ({
        ...vari,
        nombre: (vari.nombre || '').trim(),
        codigo: (vari.codigo || '').trim() || null,
        stock: vari.stock === '' || vari.stock === null || vari.stock === undefined ? 0 : Number(vari.stock),
        producto_id: producto.id,
        organization_id: producto.organization_id
      }));

      for (const variante of variantesLimpias) {
        if (!variante.nombre) {
          toast.error('Todas las variantes deben tener nombre');
          setGuardandoVariantes(false);
          return;
        }
      }

      const nuevas = variantesLimpias.filter(v => !v.id).map(({ id, ...rest }) => rest);
      const existentes = variantesLimpias.filter(v => v.id);

      if (nuevas.length > 0) {
        const { error: insertError } = await supabase
          .from('product_variants')
          .insert(nuevas);
        if (insertError) throw insertError;
      }

      for (const variante of existentes) {
        const { error: updateError } = await supabase
          .from('product_variants')
          .update({
            nombre: variante.nombre,
            codigo: variante.codigo,
            stock: variante.stock
          })
          .eq('id', variante.id);
        if (updateError) throw updateError;
      }

      const { data: variantesActualizadas, error: refreshError } = await supabase
        .from('product_variants')
        .select('*')
        .eq('producto_id', producto.id);

      if (!refreshError) {
        setVariantesProducto(variantesActualizadas || []);
      }

      toast.success('Variantes actualizadas');
    } catch (error) {
      console.error('Error guardando variantes:', error);
      toast.error('No se pudieron guardar las variantes');
    } finally {
      setGuardandoVariantes(false);
    }
  };

  const handlePrecioCompraChange = (e) => {
    const formatted = precioCompraInput.handleChange(e);
    setValue('precioCompra', formatted || '', { shouldValidate: true });
  };

  const handlePrecioVentaChange = (e) => {
    const formatted = precioVentaInput.handleChange(e);
    setValue('precioVenta', formatted || '', { shouldValidate: true });
  };

  const handleStockChange = (e) => {
    const formatted = stockInput.handleChange(e);
    setValue('stock', formatted || '', { shouldValidate: true });
  };

  const handleImagenChange = e => {
    if (e.target.files && e.target.files[0]) {
      setImagen(e.target.files[0]);
      setImagenUrl('');
    }
  };

  const handleClickUpload = () => {
    fileInputRef.current.click();
  };

  const onSubmit = async (data) => {
    if (!producto) return;
    
    setSubiendo(true);
    let imagenPath = producto.imagen;

    try {
      if (imagen && puedeSubirImagenes) {
        if (!isOnline) {
          toast.error('Sin internet: la imagen no se puede subir. Se mantendrá la imagen actual.');
        } else {
        // Validar el nombre del archivo antes de comprimir
        const validation = validateFilename(imagen.name);
        if (!validation.isValid) {
          throw new Error(validation.error);
        }

        setComprimiendo(true);
        const imagenComprimida = await compressProductImage(imagen);
        setComprimiendo(false);

        const organizationId = organization?.id || userProfile?.organization_id || producto.organization_id;
        if (!organizationId) {
          throw new Error('No se encontró organization_id');
        }
        const nombreArchivo = generateStoragePath(organizationId, imagenComprimida.name);
        const { error: errorUpload } = await supabase.storage.from('productos').upload(nombreArchivo, imagenComprimida);
        if (errorUpload) throw errorUpload;

        // Eliminar imagen anterior si existe
        if (producto.imagen && !producto.imagen.startsWith('http://') && !producto.imagen.startsWith('https://') && !producto.imagen.startsWith('data:')) {
          await deleteImageFromStorage(producto.imagen);
        }

        imagenPath = nombreArchivo;
        }
      } else if (imagenUrl && imagenUrl.trim() !== '') {
        imagenPath = imagenUrl.trim();
      }

      const typeFields = getProductTypeFields(selectedType);
      const precioVentaManual = data.precioVenta ? Number(data.precioVenta.replace(/\D/g, '')) : 0;
      const isVariablePrice = data.jewelry_price_mode === 'variable';
      const compraPorUnidadValue = Number(data.precioCompra?.replace(/\D/g, '') || '0') || 0;
      const goldPriceValue = getGoldPriceValue(data.jewelry_material_type);
      const minMarginValue = getMinMarginValue(data.jewelry_material_type);
      const pesoGramos = parseWeightValue(data.peso);
      const diff = goldPriceValue - compraPorUnidadValue;
      const precioBaseGramo = diff >= minMarginValue ? goldPriceValue : (compraPorUnidadValue + minMarginValue);
      const isInternational = data.jewelry_material_type === 'international';
      const purityFactor = isInternational ? getPurityFactor(data.pureza) : 1;
      const precioVentaVariable = pesoGramos && precioBaseGramo ? pesoGramos * precioBaseGramo * purityFactor : 0;
      const precioVentaValue = isVariablePrice ? precioVentaVariable : precioVentaManual;
      const precioCompraReal = isJewelryBusiness ? (compraPorUnidadValue * pesoGramos) : compraPorUnidadValue;
      const productoData = {
        codigo: data.codigo,
        nombre: data.nombre,
        precio_venta: precioVentaValue,
        precio_compra: typeFields.required.includes('precio_compra') || data.precioCompra
          ? precioCompraReal
          : 0,
        stock: typeFields.required.includes('stock') || data.stock
          ? (Number(data.stock?.replace(/\D/g, '') || '0') || null)
          : null,
        fecha_vencimiento: data.fecha_vencimiento || null,
        imagen: imagenPath,
        tipo: selectedType
      };

      // Agregar campos adicionales a metadata
      const newMetadata = {};
      Object.keys(ADDITIONAL_FIELDS).forEach(fieldId => {
        if (data[fieldId] && data[fieldId].trim() !== '') {
          newMetadata[fieldId] = data[fieldId];
        }
      });
      
      // Agregar variaciones_config si hay variaciones configuradas
      if (variacionesConfig && variacionesConfig.length > 0) {
        newMetadata.variaciones_config = variacionesConfig;
      }
      
      // Agregar productos_vinculados si hay productos vinculados
      if (productosVinculados && productosVinculados.length > 0) {
        newMetadata.productos_vinculados = productosVinculados;
      }
      
      // Agregar permite_toppings al metadata
      newMetadata.permite_toppings = data.permite_toppings !== undefined ? data.permite_toppings : true;

      if (data.umbral_stock_bajo !== undefined && data.umbral_stock_bajo !== '') {
        const umbralProducto = Number(data.umbral_stock_bajo);
        if (Number.isFinite(umbralProducto) && umbralProducto > 0) {
          newMetadata.umbral_stock_bajo = umbralProducto;
        }
      }

      if (data.pureza) {
        newMetadata.pureza = data.pureza;
      }
      if (isJewelryBusiness && compraPorUnidadValue) {
        newMetadata.jewelry_compra_por_unidad = compraPorUnidadValue;
      }

      if (data.jewelry_price_mode) {
        newMetadata.jewelry_price_mode = data.jewelry_price_mode;
      }

      if (data.jewelry_static_mode) {
        newMetadata.jewelry_static_mode = data.jewelry_static_mode;
      }

      if (data.jewelry_static_mode === 'percent' && data.jewelry_static_percent !== '') {
        const percentValue = Number(data.jewelry_static_percent);
        if (Number.isFinite(percentValue) && percentValue >= 0) {
          newMetadata.jewelry_static_percent = percentValue;
        }
      }

      if (data.jewelry_material_type) {
        newMetadata.jewelry_material_type = data.jewelry_material_type;
        newMetadata.jewelry_gold_price_reference = data.jewelry_material_type === 'na'
          ? 'international'
          : data.jewelry_material_type;
      }

      if (data.jewelry_min_margin !== undefined && data.jewelry_min_margin !== '') {
        const marginValue = Number(data.jewelry_min_margin);
        if (Number.isFinite(marginValue) && marginValue >= 0) {
          newMetadata.jewelry_min_margin = marginValue;
        }
      }

      // Agregar metadata solo si tiene datos
      if (Object.keys(newMetadata).length > 0) {
        productoData.metadata = newMetadata;
      } else {
        productoData.metadata = {};
      }

      actualizarProductoMutation.mutate(
        { id: producto.id, updates: productoData, organizationId: producto.organization_id },
        {
          onSuccess: () => {
            reset();
            setImagen(null);
            setImagenUrl('');
            setAdditionalFields([]);
            setVariacionesConfig([]);
            setProductosVinculados([]);
            precioCompraInput.reset();
            precioVentaInput.reset();
            stockInput.reset();
            onClose();
            if (onProductoEditado) onProductoEditado();
          },
          onError: (error) => {
            console.error('Error actualizando producto:', error);
            toast.error(error?.message || 'Error al actualizar el producto.');
          }
        }
      );
    } catch (err) {
      console.error('Error:', err);
      toast.error(err?.message || 'Error al actualizar el producto.');
    } finally {
      setSubiendo(false);
      setComprimiendo(false);
    }
  };

  if (!open || !producto) return null;

  const typeFields = getProductTypeFields(selectedType);
  const productType = PRODUCT_TYPES[selectedType];
  
  // Calcular labels de pasos (ahora solo 3 pasos: básico+imagen, opcionales, adicionales)
  const stepLabels = ['Básico + Imagen'];
  if (typeFields.optional.length > 0) stepLabels.push('Opcionales');
  if (Object.keys(ADDITIONAL_FIELDS).length > 0) stepLabels.push('Adicionales');

  const codigoRegister = register('codigo', {
    onChange: (e) => {
      codigoInputRef.current = e.target;
    }
  });

  return (
    <div className="modal-bg">
      <div className="modal-card">
        <div className="modal-header-with-back">
          <button type="button" className="back-button" onClick={onClose}>
            ← Cancelar
          </button>
          <h2>Editar {productType?.label.toLowerCase()}</h2>
        </div>
        
        {/* Indicador de pasos */}
        {!modoSoloVariantes && (
          <div className="form-steps-indicator">
            {stepLabels.map((label, index) => {
              const stepNum = index + 1;
              const isActive = formStep === stepNum;
              const isCompleted = formStep > stepNum;
              return (
                <div key={stepNum} className={`step-indicator ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                  <div 
                    className="step-number" 
                    onClick={() => handleStepClick(stepNum)}
                    style={{ cursor: 'pointer' }}
                    title={`Ir a: ${label}`}
                  >
                    {isCompleted ? '✓' : stepNum}
                  </div>
                  <span 
                    className="step-label"
                    onClick={() => handleStepClick(stepNum)}
                    style={{ cursor: 'pointer' }}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        
        {subiendo && !modoSoloVariantes ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            {comprimiendo ? (
              <div>
                <div style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'var(--accent-primary)' }}>
                  🗜️ Comprimiendo imagen...
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  Optimizando para carga rápida
                </div>
              </div>
            ) : (
              <LottieLoader size="medium" message="Actualizando producto..." />
            )}
          </div>
        ) : (
          <>
          {!modoSoloVariantes && (
            <form className="form-producto form-producto-centro" onSubmit={handleSubmit(onSubmit)}>
            {/* Paso 1: Campos básicos + Imagen */}
            {formStep === 1 && (
              <div className="form-step-content">
                <h3 className="step-title">Información Básica e Imagen</h3>
                <label>Código</label>
                <input
                  {...codigoRegister}
                  ref={(e) => {
                    codigoRegister.ref(e);
                    codigoInputRef.current = e;
                  }}
                  className={`input-form ${errors.codigo ? 'error' : ''}`}
                  placeholder="Ej: SKU123"
                />
                {errors.codigo && <span className="error-message">{errors.codigo.message}</span>}

                <label>Nombre <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  {...register('nombre')}
                  className={`input-form ${errors.nombre ? 'error' : ''}`}
                  placeholder="Nombre del producto"
                />
                {errors.nombre && <span className="error-message">{errors.nombre.message}</span>}

                {isJewelryBusiness && (
                  <>
                    <label>Peso <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                      {...register('peso')}
                      inputMode="decimal"
                      className={`input-form ${errors.peso ? 'error' : ''}`}
                      placeholder={`Ej: 5.2 ${organization?.jewelry_weight_unit || 'g'}`}
                    />
                    {errors.peso && <span className="error-message">{errors.peso.message}</span>}
                    <label>Pureza</label>
                    <select {...register('pureza')} className="input-form">
                      <option value="">No aplica</option>
                      <option value="24k">24k</option>
                      <option value="22k">22k</option>
                      <option value="18k">18k</option>
                      <option value="14k">14k</option>
                      <option value="10k">10k</option>
                      <option value="925">925</option>
                      <option value="950">950</option>
                    </select>
                  </>
                )}

                {/* Precios */}
                <label>Precios</label>
                <div className="input-precio-row" style={{ gap: '2.5rem', justifyContent: 'space-between' }}>
                  {(typeFields.required.includes('precio_compra') || typeFields.optional.includes('precio_compra')) && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.98rem', marginBottom: 4, textAlign: 'center' }}>
                      Precio de Compra {isJewelryBusiness ? `(por ${organization?.jewelry_weight_unit || 'g'})` : ''} {typeFields.required.includes('precio_compra') && <span style={{ color: '#ef4444' }}>*</span>}
                    </span>
                      <input
                        {...register('precioCompra')}
                        value={precioCompraInput.displayValue}
                        onChange={handlePrecioCompraChange}
                        inputMode="numeric"
                        placeholder="Ej: 30.000"
                        className={`input-form ${errors.precioCompra ? 'error' : ''}`}
                      />
                      {errors.precioCompra && <span className="error-message">{errors.precioCompra.message}</span>}
                      {isJewelryBusiness && compraPorUnidad > 0 && parseWeightValue(pesoWatch) > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                          Costo real por pieza: {formatCurrency(costoCompraReal)}
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.98rem', marginBottom: 4, textAlign: 'center' }}>
                      Precio de Venta {!isJewelryBusiness || jewelryPriceMode !== 'variable' ? <span style={{ color: '#ef4444' }}>*</span> : null}
                    </span>
                    <input
                      {...register('precioVenta')}
                      value={precioVentaInput.displayValue}
                      onChange={handlePrecioVentaChange}
                      inputMode="numeric"
                      placeholder="Ej: 50.000"
                      className={`input-form ${errors.precioVenta ? 'error' : ''}`}
                      disabled={isJewelryBusiness && jewelryPriceMode === 'variable'}
                    />
                    {errors.precioVenta && <span className="error-message">{errors.precioVenta.message}</span>}
                    {isJewelryBusiness && jewelryPriceMode === 'variable' && precioBaseGramoActual > 0 && pesoNumerico > 0 && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center' }}>
                        Base por {organization?.jewelry_weight_unit || 'g'}: {formatCurrency(precioBaseGramoActual)} • Regla: {reglaAplicada}{aplicaPureza ? ` • Pureza aplicada (${purezaWatch || '24k'})` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {isJewelryBusiness && (
                  <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                    <label style={{ fontWeight: 600 }}>Configuración de precio por peso</label>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <label>Tipo de precio</label>
                      <select {...register('jewelry_price_mode')} className="input-form">
                        <option value="fixed">Precio fijo (estático)</option>
                        <option value="variable">Precio variable</option>
                      </select>
                    </div>
                        {jewelryPriceMode === 'fixed' && (
                          <>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                            <label>Cómo definir el precio estático</label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                type="button"
                                className={`inventario-btn ${precioVentaModo === 'manual' ? 'inventario-btn-primary' : 'inventario-btn-outline'}`}
                                onClick={() => setPrecioVentaModo('manual')}
                              >
                                Valor específico
                              </button>
                              <button
                                type="button"
                                className={`inventario-btn ${precioVentaModo === 'porcentaje' ? 'inventario-btn-primary' : 'inventario-btn-outline'}`}
                                onClick={() => setPrecioVentaModo('porcentaje')}
                              >
                                % sobre compra
                              </button>
                            </div>
                          </div>
                          {precioVentaModo === 'porcentaje' && (
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                              <label>Porcentaje sobre compra (%)</label>
                              <input
                                {...register('jewelry_static_percent')}
                                type="number"
                                inputMode="decimal"
                                placeholder="Ej: 20"
                                className="input-form"
                              />
                            </div>
                          )}
                        </>
                      )}
                    {jewelryPriceMode === 'variable' && (
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        <label>Margen mínimo (%)</label>
                        <input
                          {...register('jewelry_min_margin')}
                          type="number"
                          inputMode="decimal"
                          placeholder="Ej: 10"
                          className="input-form"
                        />
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          Si no lo defines y el precio es variable, se usará el valor de preferencias.
                        </span>
                      </div>
                    )}
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <label>Tipo de material</label>
                      <select {...register('jewelry_material_type')} className="input-form">
                        <option value="na">No aplica</option>
                        <option value="local">Nacional</option>
                        <option value="international">Internacional</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Stock si aplica */}
                {(typeFields.required.includes('stock') || typeFields.optional.includes('stock')) && (
                  <>
                    <label>
                      Stock {typeFields.required.includes('stock') && <span style={{ color: '#ef4444' }}>*</span>}
                    </label>
                    <input
                      {...register('stock')}
                      value={stockInput.displayValue}
                      onChange={handleStockChange}
                      inputMode="numeric"
                      className={`input-form ${errors.stock ? 'error' : ''}`}
                      placeholder="Cantidad en stock"
                      disabled={variantesProducto.length > 0}
                    />
                    {errors.stock && <span className="error-message">{errors.stock.message}</span>}
                    {variantesProducto.length > 0 && (
                      <span className="error-message" style={{ color: '#6b7280' }}>
                        El stock general se calcula con la sumatoria de variantes.
                      </span>
                    )}
                    <label style={{ marginTop: '0.75rem' }}>
                      Umbral de stock bajo <span style={{ color: '#6b7280', fontWeight: 400 }}>(Opcional)</span>
                    </label>
                    <input
                      {...register('umbral_stock_bajo')}
                      inputMode="numeric"
                      className="input-form"
                      placeholder="Ej: 10"
                    />
                    <span className="error-message" style={{ color: '#6b7280' }}>
                      Si no lo defines, se usará el umbral general.
                    </span>
                  </>
                )}

                {/* Checkbox para permitir toppings */}
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    id="permite_toppings_edit"
                    {...register('permite_toppings')}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <label htmlFor="permite_toppings_edit" style={{ cursor: 'pointer', fontWeight: 500, fontSize: '0.95rem' }}>
                    Permitir agregar toppings/adicionales a este producto
                  </label>
                </div>

                {/* Imagen del producto (ahora en el paso 1) */}
                <div style={{ marginTop: '2rem', marginBottom: '2.5rem' }}>
                  <h3 className="step-title" style={{ marginBottom: '0.5rem' }}>Imagen del Producto</h3>
                  <p className="step-description" style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    Cambia la imagen del producto si lo deseas (Opcional)
                  </p>
                  <label>
                    Imagen <span style={{ color: '#6b7280', fontWeight: 400 }}>(Opcional)</span>
                    {!puedeSubirImagenes && <span style={{ color: '#ef4444', fontWeight: 600 }}> 🔒 Solo plan Estándar</span>}
                  </label>
                  <div className="input-upload-wrapper input-upload-centro" style={{ marginBottom: '1rem' }}>
                    <button
                      type="button"
                      className="input-upload-btn"
                      onClick={puedeSubirImagenes ? handleClickUpload : () => toast.error('Actualiza al plan Estándar para subir imágenes')}
                      disabled={!puedeSubirImagenes}
                      style={!puedeSubirImagenes ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                    >
                      <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                        <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="4" y="16" width="16" height="4" rx="2" fill="#2563eb" fillOpacity=".08" />
                      </svg>
                      {imagen ? imagen.name : producto?.imagen ? 'Cambiar imagen' : puedeSubirImagenes ? 'Seleccionar imagen' : '🔒 Bloqueado'}
                    </button>
                    <input type="file" accept="image/*" onChange={handleImagenChange} ref={fileInputRef} style={{ display: 'none' }} disabled={!puedeSubirImagenes} />
                  </div>

                  <label style={{ marginTop: '0.5rem' }}>
                    URL de imagen <span style={{ color: '#6b7280', fontWeight: 400 }}>(Opcional)</span>
                  </label>
                  <input
                    className="input-form"
                    placeholder="https://..."
                    value={imagenUrl}
                    onChange={(e) => setImagenUrl(e.target.value)}
                    disabled={Boolean(imagen)}
                  />
                  <p className="step-description" style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#6b7280' }}>
                    Si pegas una URL, se usará esa imagen sin subir archivo.
                  </p>

                  {imagen && (
                    <div className="image-preview" style={{ marginBottom: '1rem' }}>
                      <img src={URL.createObjectURL(imagen)} alt="Preview" />
                      <button
                        type="button"
                        className="remove-image-btn"
                        onClick={() => setImagen(null)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  {!imagen && imagenUrl && (
                    <div className="image-preview" style={{ marginBottom: '1rem' }}>
                      <img src={imagenUrl} alt="Preview" />
                      <button
                        type="button"
                        className="remove-image-btn"
                        onClick={() => setImagenUrl('')}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  {producto?.imagen && !imagen && !imagenUrl && (
                    <div className="image-preview" style={{ marginBottom: '1rem' }}>
                      <OptimizedProductImage
                        imagePath={producto.imagen}
                        alt="Imagen actual"
                        className=""
                      />
                      <span style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem', display: 'block', textAlign: 'center' }}>Imagen actual</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Paso 2: Campos opcionales del tipo */}
            {formStep === 2 && typeFields.optional.length > 0 && (
              <div className="form-step-content">
                <h3 className="step-title">Información Adicional del {productType?.label}</h3>
                <p className="step-description">Estos campos son opcionales pero pueden ser útiles</p>
                {typeFields.optional.map(fieldId => {
                  const fieldConfig = ADDITIONAL_FIELDS[fieldId];
                  if (!fieldConfig) return null;

                  return (
                    <div key={fieldId}>
                      <label>
                        {fieldConfig.label} <span style={{ color: '#6b7280', fontWeight: 400 }}>(Opcional)</span>
                      </label>
                      {fieldConfig.type === 'textarea' ? (
                        <textarea
                          {...register(fieldId)}
                          className="input-form"
                          placeholder={fieldConfig.placeholder}
                          rows={3}
                        />
                      ) : fieldConfig.type === 'select' ? (
                        <select {...register(fieldId)} className="input-form">
                          {fieldConfig.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                    </select>
                  ) : (
                    <input
                      {...register(fieldId)}
                      type={fieldConfig.type}
                      className="input-form"
                      placeholder={fieldConfig.placeholder}
                    />
                  )}
                </div>
              );
            })}
              
              {/* Configuración de variaciones (solo para productos de comida) */}
              {selectedType === 'comida' && (
                <VariacionesConfig
                  variaciones={variacionesConfig}
                  onChange={setVariacionesConfig}
                />
              )}
              
              {/* Productos vinculados */}
              <ProductosVinculados
                productosVinculados={productosVinculados}
                onChange={setProductosVinculados}
                organizationId={producto?.organization_id}
              />
              </div>
            )}

            {/* Paso 3: Campos adicionales personalizables */}
            {formStep === 3 && (
              <div className="form-step-content">
                <h3 className="step-title">Campos Adicionales</h3>
                <p className="step-description">Agrega información extra si lo necesitas</p>
                
                {/* Campos adicionales agregados por el usuario */}
                {additionalFields.map(fieldId => {
                  const fieldConfig = ADDITIONAL_FIELDS[fieldId];
                  if (!fieldConfig) return null;

                  return (
                    <div key={fieldId} className="additional-field-wrapper">
                      <div className="additional-field-header">
                        <label>{fieldConfig.label}</label>
                        <button
                          type="button"
                          className="remove-field-btn"
                          onClick={() => handleRemoveAdditionalField(fieldId)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {fieldConfig.type === 'textarea' ? (
                        <textarea
                          {...register(fieldId)}
                          className="input-form"
                          placeholder={fieldConfig.placeholder}
                          rows={3}
                        />
                      ) : fieldConfig.type === 'select' ? (
                        <select {...register(fieldId)} className="input-form">
                          {fieldConfig.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...register(fieldId)}
                          type={fieldConfig.type}
                          className="input-form"
                          placeholder={fieldConfig.placeholder}
                        />
                      )}
                    </div>
                  );
                })}

                {/* Botón para agregar campos adicionales */}
                <div className="add-fields-section">
                  <label>Agregar campos adicionales</label>
                  <div className="add-fields-grid">
                    {Object.keys(ADDITIONAL_FIELDS)
                      .filter(fieldId => !typeFields.optional.includes(fieldId) && !additionalFields.includes(fieldId))
                      .map(fieldId => {
                        const fieldConfig = ADDITIONAL_FIELDS[fieldId];
                        return (
                          <button
                            key={fieldId}
                            type="button"
                            className="add-field-btn"
                            onClick={() => handleAddAdditionalField(fieldId)}
                          >
                            <Plus size={16} />
                            {fieldConfig.label}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}


            {/* Botones de navegación */}
            <div className="form-actions form-actions-centro">
              <button type="button" className="inventario-btn inventario-btn-secondary" onClick={onClose} disabled={subiendo}>
                Cancelar
              </button>
              {formStep > 1 && (
                <button type="button" className="inventario-btn inventario-btn-outline" onClick={handleBack} disabled={subiendo}>
                  ← Atrás
                </button>
              )}
              {(() => {
                const typeFields = selectedType ? getProductTypeFields(selectedType) : { required: [], optional: [] };
                const hasStep2 = typeFields.optional.length > 0;
                const hasStep3 = Object.keys(ADDITIONAL_FIELDS).length > 0;
                const isLastStep = (formStep === 1 && !hasStep2 && !hasStep3) ||
                                  (formStep === 2 && !hasStep3) ||
                                  formStep === 3;
                
                if (isLastStep) {
                  return (
                    <button type="submit" className="inventario-btn inventario-btn-primary" disabled={subiendo || isSubmitting}>
                      {subiendo ? (comprimiendo ? '🗜️ Comprimiendo...' : 'Actualizando...') : 'Actualizar Producto'}
                    </button>
                  );
                } else {
                  return (
                    <>
                      <button type="submit" className="inventario-btn inventario-btn-outline" disabled={subiendo || isSubmitting}>
                        {subiendo ? (comprimiendo ? '🗜️ Comprimiendo...' : 'Actualizando...') : 'Guardar cambios'}
                      </button>
                      <button type="button" className="inventario-btn inventario-btn-primary" onClick={handleNext}>
                        Siguiente →
                      </button>
                    </>
                  );
                }
              })()}
            </div>
            </form>
          )}

          <div className="form-step-content" style={{ marginTop: '1.5rem' }}>
            <h3 className="step-title">Variantes (color/tono)</h3>
            {modoSoloVariantes && (
              <p className="step-description" style={{ color: '#f59e0b' }}>
                Edición limitada a variantes porque se ingresó por código de variante.
              </p>
            )}
            {!modoSoloVariantes && (
              <p className="step-description">Define stock y código de barras por variante.</p>
            )}

            {modoSoloVariantes && producto && (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem', background: '#f9fafb', marginBottom: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Producto</div>
                <div style={{ display: 'grid', gap: '0.25rem', fontSize: '0.95rem' }}>
                  <div><strong>Código:</strong> {producto.codigo || '-'}</div>
                  <div><strong>Nombre:</strong> {producto.nombre || '-'}</div>
                  <div><strong>Precio venta:</strong> {producto.precio_venta ?? '-'}</div>
                  <div><strong>Stock total:</strong> {producto.stock ?? '-'}</div>
                </div>
              </div>
            )}

            {variantesProducto.length === 0 && (
              <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                No hay variantes registradas.
              </p>
            )}

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {variantesProducto.map((vari, index) => {
                const bloqueada = varianteActivaId && vari.id && vari.id !== varianteActivaId;
                return (
                  <div key={vari.id || `nueva-${index}`} style={{ display: 'grid', gap: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem', opacity: bloqueada ? 0.5 : 1 }}>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <label>Nombre (color/tono)</label>
                      <input
                        className="input-form"
                        value={vari.nombre || ''}
                        onChange={(e) => actualizarVariante(index, 'nombre', e.target.value)}
                        disabled={bloqueada}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <label>Código de barras (opcional)</label>
                      <input
                        className="input-form"
                        value={vari.codigo || ''}
                        onChange={(e) => actualizarVariante(index, 'codigo', e.target.value)}
                        disabled={bloqueada}
                      />
                    </div>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <label>Stock</label>
                      <input
                        className="input-form"
                        inputMode="numeric"
                        value={vari.stock ?? 0}
                        onChange={(e) => actualizarVariante(index, 'stock', e.target.value)}
                        disabled={bloqueada}
                      />
                    </div>
                    {!bloqueada && (
                      <button
                        type="button"
                        className="inventario-btn inventario-btn-outline eliminar"
                        onClick={() => eliminarVariante(index)}
                      >
                        Eliminar variante
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {!modoSoloVariantes && (
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'center' }}>
                <button type="button" className="inventario-btn inventario-btn-secondary" onClick={agregarVariante}>
                  + Agregar variante
                </button>
                <button type="button" className="inventario-btn inventario-btn-primary" onClick={guardarVariantes} disabled={guardandoVariantes}>
                  {guardandoVariantes ? 'Guardando...' : 'Guardar variantes'}
                </button>
              </div>
            )}

            {modoSoloVariantes && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="inventario-btn inventario-btn-primary" onClick={guardarVariantes} disabled={guardandoVariantes}>
                  {guardandoVariantes ? 'Guardando...' : 'Guardar variantes'}
                </button>
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EditarProductoModalV2;
