import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../../services/api/supabaseClient';
import LottieLoader from '../../components/ui/LottieLoader';
import '../../pages/dashboard/Inventario.css';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { compressProductImage } from '../../services/storage/imageCompression';
import { useActualizarProducto, useProductos } from '../../hooks/useProductos';
import { useCurrencyInput, formatCurrency } from '../../hooks/useCurrencyInput';
import { Plus, X, Barcode, Printer, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { PRODUCT_TYPES, ADDITIONAL_FIELDS, getProductTypeFields } from '../../utils/productTypes';
import { generateStoragePath, validateFilename } from '../../utils/fileUtils';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import OptimizedProductImage from '../../components/business/OptimizedProductImage';
import VariacionesConfig from '../VariacionesConfig';
import ProductosVinculados from '../ProductosVinculados';
import ImpresionCodigosBarrasModal from './ImpresionCodigosBarrasModal';
import './AgregarProductoModalV2.css';

// Función para crear esquema de validación dinámico (igual que en AgregarProductoModalV2)
const createProductSchema = (productType, isJewelryBusiness = false) => {
  const baseSchema = {
    codigo: z.string().max(50, 'El código es muy largo').optional(),
    nombre: z.string().min(1, 'El nombre es requerido').max(100, 'El nombre es muy largo'),
    precioVenta: z.string().optional(),
    tipo: z.enum(['fisico', 'servicio', 'comida', 'accesorio', 'combo']),
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
  baseSchema.ocultar_en_catalogo = z.boolean().optional().default(false);
  baseSchema.umbral_stock_bajo = z.string().optional();
  baseSchema.jewelry_price_mode = z.enum(['fixed', 'variable']).optional();
  baseSchema.jewelry_static_mode = z.enum(['fixed', 'percent']).optional();
  baseSchema.jewelry_static_percent = z.string().optional();
  baseSchema.jewelry_material_type = z.enum(['local', 'international', 'na']).optional();
  baseSchema.jewelry_min_margin = z.string().optional();

  return z.object(baseSchema).superRefine((data, ctx) => {
    const rawPrecioCompra = data.precioCompra ? parseFloat(data.precioCompra.replace(/[^\d]/g, '')) : 0;
    const rawPrecioVenta = data.precioVenta ? parseFloat(data.precioVenta.replace(/[^\d]/g, '')) : NaN;
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

    if (isJewelryBusiness && (!data.peso || data.peso.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El peso es requerido",
        path: ["peso"]
      });
    }

    // Validar precio de venta >= costo de compra (solo para precios fijos/manuales y si hay precio compra)
    if (!isVariablePrice && data.precioVenta && data.precioCompra && !isNaN(rawPrecioCompra) && !isNaN(rawPrecioVenta)) {
      let costoCompraComparar = rawPrecioCompra;
      if (isJewelryBusiness) {
        const normalizedPeso = data.peso ? data.peso.toString().replace(',', '.').replace(/[^0-9.]/g, '') : '0';
        const pesoNum = parseFloat(normalizedPeso);
        if (Number.isFinite(pesoNum) && pesoNum > 0) {
          costoCompraComparar = rawPrecioCompra * pesoNum;
        }
      }

      if (rawPrecioVenta < costoCompraComparar) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: isJewelryBusiness
            ? "El precio de venta debe ser mayor o igual al costo total de la pieza"
            : "El precio de venta debe ser mayor o igual al precio de compra",
          path: ["precioVenta"]
        });
      }
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
  const { user, organization, userProfile } = useAuth();
  const moneda = user?.user_metadata?.moneda || 'COP';
  const { hasFeature } = useSubscription();
  const { isOnline } = useNetworkStatus();
  const isJewelryBusiness = organization?.business_type === 'jewelry_metals';
  const parseWeightValue = useCallback((value) => {
    if (value === '' || value === null || value === undefined) return 0;
    const normalized = value.toString().replace(',', '.').replace(/[^0-9.]/g, '');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);
  const [formStep, setFormStep] = useState(1); // 1: básico + imagen, 2: opcionales del tipo, 3: adicionales
  const [selectedType, setSelectedType] = useState('fisico');
  const [imagen, setImagen] = useState(null);
  const [imagenUrl, setImagenUrl] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [additionalFields, setAdditionalFields] = useState([]);
  const [variacionesConfig, setVariacionesConfig] = useState([]);
  const [productosVinculados, setProductosVinculados] = useState([]);
  const [variantesProducto, setVariantesProducto] = useState([]);
  const [precioVentaModo, setPrecioVentaModo] = useState('manual'); // 'manual' | 'porcentaje' | 'combo'
  const [margenCombo, setMargenCombo] = useState('30'); // '30' | '35' | 'otro'
  const [margenComboPersonalizado, setMargenComboPersonalizado] = useState('');
  const [categoriaManoObra, setCategoriaManoObra] = useState('');
  const [creandoCategoriaManoObra, setCreandoCategoriaManoObra] = useState(false);
  const [nuevaCategoriaManoObraText, setNuevaCategoriaManoObraText] = useState('');
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [nuevaCategoriaText, setNuevaCategoriaText] = useState('');
  const esEmpleado = (userProfile?.role !== 'owner' && userProfile?.role !== 'admin');
  const modoSoloVariantes = soloEditarVariantes && varianteActivaId;
  const fileInputRef = useRef();
  const codigoInputRef = useRef(null);
  const [showBarcodeMenu, setShowBarcodeMenu] = useState(false);
  const [barcodePrintOpen, setBarcodePrintOpen] = useState(false);

  const puedeSubirImagenes = hasFeature('productImages');

  // Currency inputs
  const precioCompraInput = useCurrencyInput();
  const precioVentaInput = useCurrencyInput();
  const stockInput = useCurrencyInput();

  const [margenPorcentaje, setMargenPorcentaje] = useState('');

  // React Query mutation
  const actualizarProductoMutation = useActualizarProducto();
  const { data: productosData = [] } = useProductos(organization?.id);
  const categoriasExistentes = useMemo(() => {
    const cats = new Set(productosData.map(p => p.metadata?.categoria || p.categoria).filter(Boolean));
    return [...cats].sort();
  }, [productosData]);

  const productSchema = selectedType ? createProductSchema(selectedType, isJewelryBusiness) : z.object({});

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
    formState: { errors, isSubmitting, isDirty },
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

  // Función para detectar cambios sin guardar
  const hasUnsavedChanges = useCallback(() => {
    if (isDirty) return true;
    if (imagen !== null) return true;

    // Comparar configuraciones complejas (usando stringify para simplicidad en este caso)
    const metadata = producto?.metadata || {};
    const initialVariaciones = metadata.variaciones_config || [];
    if (JSON.stringify(variacionesConfig) !== JSON.stringify(initialVariaciones)) return true;

    const initialVariantes = producto?.variantes || [];
    if (JSON.stringify(variantesProducto) !== JSON.stringify(initialVariantes)) return true;

    const initialVinculados = metadata.productos_vinculados || [];
    if (JSON.stringify(productosVinculados) !== JSON.stringify(initialVinculados)) return true;

    return false;
  }, [isDirty, imagen, variacionesConfig, variantesProducto, productosVinculados, producto]);

  // Ref para rastrear el último producto cargado y evitar re-cargas durante la edición
  const ultimoProductoIdRef = useRef(null);

  // Resetear al paso 1 cuando se abre el modal y manejar tecla Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (hasUnsavedChanges()) {
          if (window.confirm('Tienes cambios sin guardar. ¿Estás seguro de que quieres salir?')) {
            onClose();
          }
        } else {
          onClose();
        }
      }
    };

    if (open) {
      setFormStep(1);
      window.addEventListener('keydown', handleEscape);
    } else {
      // Permitir recargar valores aunque sea el mismo producto al reabrir
      ultimoProductoIdRef.current = null;
      setImagen(null);
      setImagenUrl('');
      setMargenCombo('30');
      setMargenComboPersonalizado('');
      setCategoriaManoObra('');
      setCreandoCategoriaManoObra(false);
      setNuevaCategoriaManoObraText('');
    }

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose, hasUnsavedChanges]);

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

  useEffect(() => {
    if (precioVentaModo !== 'porcentaje') return;

    const compraNumerica = precioCompraInput.displayValue 
      ? Number(precioCompraInput.displayValue.replace(/\D/g, ''))
      : 0;
    const margenNumerico = parseFloat((margenPorcentaje || '').toString().replace(',', '.').replace(/[^0-9.]/g, ''));

    if (!compraNumerica || Number.isNaN(margenNumerico)) {
      setValue('precioVenta', '', { shouldValidate: true });
      precioVentaInput.reset();
      return;
    }

    const baseCompra = isJewelryBusiness && pesoNumerico > 0
      ? (compraNumerica * pesoNumerico)
      : compraNumerica;
    const ventaCalculada = Math.round(baseCompra * (1 + (margenNumerico / 100)));
    const ventaFormateada = formatCurrency(ventaCalculada);
    setValue('precioVenta', ventaFormateada || '', { shouldValidate: true });
    precioVentaInput.setValue(ventaCalculada);
  }, [precioCompraInput.displayValue, margenPorcentaje, precioVentaModo, setValue, precioVentaInput, isJewelryBusiness, pesoNumerico]);

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
      setSelectedType(producto.tipo || 'fisico');
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
      setValue('ocultar_en_catalogo', metadata?.ocultar_en_catalogo === true || metadata?.ocultar_en_catalogo === 'true');
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

      // Determinar tipo: mantener el tipo original (especialmente para retail)
      const currentType = producto.tipo || 'fisico';
      setSelectedType(currentType);
      setValue('tipo', currentType);

      // Variable para control interno de UI si es combo
      const esCombo = producto.tipo === 'combo' || (metadata.productos_vinculados && metadata.productos_vinculados.length > 0);

      // Cargar margen de combo si aplica
      if (esCombo && metadata.margen_combo) {
        if (['30', '35'].includes(String(metadata.margen_combo))) {
          setMargenCombo(String(metadata.margen_combo));
        } else {
          setMargenCombo('otro');
          setMargenComboPersonalizado(String(metadata.margen_combo));
        }
      }

      // Actualizar currency inputs
      precioCompraInput.setValue(compraPorUnidad !== undefined && compraPorUnidad !== null ? compraPorUnidad : '');
      stockInput.setValue(producto.stock !== undefined && producto.stock !== null ? producto.stock : '');

      if (metadata?.jewelry_static_mode === 'percent') {
        setPrecioVentaModo('porcentaje');
        if (metadata?.jewelry_static_percent !== undefined && metadata?.jewelry_static_percent !== null) {
          setMargenPorcentaje(String(metadata.jewelry_static_percent));
        }
      }

      // Para productos de joyería con precio variable, el precio de venta se calculará automáticamente
      // en el useEffect que depende de jewelryPriceMode, peso, etc.
      const esJoyeriaVariable = isJewelryBusiness && metadata?.jewelry_price_mode === 'variable';
      if (!esJoyeriaVariable && !esCombo) {
        // Solo para productos NO variables y NO combos, establecer el precio guardado
        setValue('precioVenta', producto.precio_venta !== undefined && producto.precio_venta !== null ? producto.precio_venta.toString() : '');
        precioVentaInput.setValue(producto.precio_venta !== undefined && producto.precio_venta !== null ? producto.precio_venta : '');
      } else if (esCombo) {
        // Para combos, dejar que el useEffect de cálculo lo maneje
        setPrecioVentaModo('combo');
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

  const generarCodigoAutomatico = () => {
    const randomDigits = Math.floor(100000000 + Math.random() * 900000000).toString();
    const barcode = `770${randomDigits}`;
    setValue('codigo', barcode, { shouldValidate: true });
    if (codigoInputRef.current) {
      codigoInputRef.current.value = barcode;
    }
    toast.success('Código de barras auto-generado: ' + barcode);
  };

  // Cálculo automático para Combos / Anchetas (IGUAL QUE EN AGREGAR)
  useEffect(() => {
    if (selectedType !== 'combo') return;

    // Calcular costo total sumando los costos de los productos vinculados
    const costoTotal = productosVinculados.reduce((sum, p) => sum + ((p.precio_compra || 0) * (p.cantidad || 1)), 0);

    // Calcular precio de venta base sumando los precios de venta de los productos vinculados
    const ventaBaseTotal = productosVinculados.reduce((sum, p) => sum + ((p.precio_venta || 0) * (p.cantidad || 1)), 0);

    // Aplicar el margen de la ancheta (30% o 35% o personalizado)
    const margenActual = margenCombo === 'otro'
      ? parseFloat(margenComboPersonalizado) || 0
      : parseFloat(margenCombo) || 30;

    const ventaFinal = Math.round(ventaBaseTotal * (1 + (margenActual / 100)));

    // Actualizar campos
    const formattedCosto = formatCurrency(Math.round(costoTotal));
    const formattedVenta = formatCurrency(ventaFinal);

    // El costo siempre se calcula automáticamente
    setValue('precioCompra', formattedCosto, { shouldValidate: true });
    precioCompraInput.setValue(Math.round(costoTotal));

    // El precio de venta solo se calcula automáticamente si estamos en modo combo
    if (precioVentaModo === 'combo') {
      setValue('precioVenta', formattedVenta, { shouldValidate: true });
      precioVentaInput.setValue(ventaFinal);
    }
  }, [selectedType, productosVinculados, margenCombo, margenComboPersonalizado, precioVentaModo, setValue, precioCompraInput, precioVentaInput]);

  const handleBack = () => {
    if (formStep === 1) {
      onClose();
    } else {
      setFormStep(formStep - 1);
    }
  };

  const handleNext = (e) => {
    // Prevenir el submit del formulario
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Validar paso actual antes de avanzar
    if (formStep === 1) {
      // Validar campos básicos
      const nombre = watch('nombre');
      const precioVenta = watch('precioVenta');
      const precioCompra = watch('precioCompra');
      const stock = watch('stock');
      const typeFieldsStep = getProductTypeFields(selectedType);

      const needsPrecioVenta = !isJewelryBusiness || jewelryPriceMode !== 'variable';
      const needsPrecioCompra = typeFieldsStep.required.includes('precio_compra');
      const needsStock = typeFieldsStep.required.includes('stock');

      if (!nombre || (needsPrecioVenta && !precioVenta) || (needsPrecioCompra && !precioCompra) || (needsStock && !stock)) {
        toast.error('Por favor completa todos los campos requeridos');
        return;
      }

      if (isJewelryBusiness) {
        const peso = watch('peso');
        if (!peso) {
          toast.error('El peso es requerido');
          return;
        }
      }

      // Si tiene campos opcionales del tipo, ir a paso 2, sino saltar a paso 3
      if (typeFieldsStep.optional.length > 0) {
        setFormStep(2);
      } else if (Object.keys(ADDITIONAL_FIELDS).length > 0) {
        setFormStep(3);
      } else {
        return;
      }
    } else if (formStep === 2) {
      // De opcionales del tipo a adicionales
      if (Object.keys(ADDITIONAL_FIELDS).length > 0) {
        setFormStep(3);
      } else {
        return;
      }
    } else if (formStep === 3) {
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
        const varianteOriginal = (producto.variantes || []).find(v => v.id === variante.id);
        const stockAnterior = varianteOriginal ? (varianteOriginal.stock || 0) : 0;

        const { error: updateError } = await supabase
          .from('product_variants')
          .update({
            nombre: variante.nombre,
            codigo: variante.codigo,
            stock: variante.stock
          })
          .eq('id', variante.id);

        if (updateError) throw updateError;

        // Registrar movimiento si el stock cambió
        if (variante.stock !== stockAnterior) {
          await supabase.from('movimientos_stock').insert([{
            organization_id: organization.id,
            producto_id: producto.id,
            variante_id: variante.id,
            tipo: 'ajuste',
            cantidad: variante.stock - stockAnterior,
            stock_anterior: stockAnterior,
            stock_nuevo: variante.stock,
            usuario_id: userProfile?.user_id,
            notas: `Ajuste manual de stock de variante: ${variante.nombre}`
          }]);
        }
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

  const handleMargenPorcentajeChange = (e) => {
    const rawValue = e.target.value;
    const sanitized = rawValue.replace(/[^0-9.,]/g, '');
    setMargenPorcentaje(sanitized);
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
        stock: data.stock != null && String(data.stock).trim() !== '' ? Number(String(data.stock).replace(/\D/g, '')) : 0,
        fecha_vencimiento: data.fecha_vencimiento || null,
        imagen: imagenPath,
        tipo: selectedType
      };

      // Agregar campos adicionales a metadata
      const newMetadata = {};

      // Mapeo manual de campos para coincidir con AgregarProductoModalV2
      if (data.peso) newMetadata.peso = data.peso;
      if (data.unidad_peso) newMetadata.unidad_peso = data.unidad_peso;
      if (data.dimensiones) newMetadata.dimensiones = data.dimensiones;
      if (data.marca) newMetadata.marca = data.marca;
      if (data.modelo) newMetadata.modelo = data.modelo;
      if (data.color) newMetadata.color = data.color;
      if (data.talla) newMetadata.talla = data.talla;
      if (data.material) newMetadata.material = data.material;
      if (data.duracion) newMetadata.duracion = data.duracion;
      if (data.descripcion) newMetadata.descripcion = data.descripcion;
      if (data.ingredientes) newMetadata.ingredientes = data.ingredientes;
      if (data.alergenos) newMetadata.alergenos = data.alergenos;
      if (data.calorias) newMetadata.calorias = data.calorias;
      if (data.porcion) newMetadata.porcion = data.porcion;
      if (data.variaciones) newMetadata.variaciones = data.variaciones;

      // Categoría puede ser de select o nueva
      const categoriaFinal = creandoCategoria ? nuevaCategoriaText : data.categoria;
      if (categoriaFinal && categoriaFinal.trim() !== '') {
        newMetadata.categoria = categoriaFinal.trim();
      }

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

      // Agregar ocultar_en_catalogo al metadata
      newMetadata.ocultar_en_catalogo = data.ocultar_en_catalogo !== undefined ? data.ocultar_en_catalogo : false;

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

      if (data.jewelry_static_mode === 'percent' && margenPorcentaje !== '') {
        const percentValue = Number(margenPorcentaje);
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

      // Añadir info específica de combos
      if (selectedType === 'combo') {
        newMetadata.es_combo = true;
        // Guardar configuración del margen
        if (precioVentaModo === 'combo') {
          newMetadata.margen_combo_tipo = margenCombo;
          if (margenCombo === 'otro') {
            newMetadata.margen_combo_valor = margenComboPersonalizado;
          }
        }

        const catManoObraFinal = creandoCategoriaManoObra ? nuevaCategoriaManoObraText : categoriaManoObra;
        if (catManoObraFinal && catManoObraFinal.trim() !== '') {
          newMetadata.categoria_mano_obra = catManoObraFinal.trim();
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
          onSuccess: async (updatedProducto) => {
            // Registrar movimiento de stock si el stock cambió
            if (productoData.stock !== undefined && productoData.stock !== null && productoData.stock !== producto.stock) {
              await supabase.from('movimientos_stock').insert([{
                organization_id: organization.id,
                producto_id: producto.id,
                producto_nombre: producto.nombre,
                tipo: 'ajuste',
                cantidad: productoData.stock - (producto.stock || 0),
                stock_anterior: producto.stock || 0,
                stock_nuevo: productoData.stock,
                usuario_id: userProfile?.user_id,
                usuario_nombre: userProfile?.full_name || 'Sistema',
                notas: 'Ajuste manual de stock desde el editor'
              }]);
            }

            // Guardar variantes si hay (requiere conexión)
            if (variantesProducto.length > 0 || metadata.variantes?.length > 0) {
              await guardarVariantes();
            }

            reset();
            setImagen(null);
            setImagenUrl('');
            setAdditionalFields([]);
            setVariacionesConfig([]);
            setProductosVinculados([]);
            setVariantesProducto([]);
            precioCompraInput.reset();
            precioVentaInput.reset();
            stockInput.reset();
            onClose();
            if (onProductoEditado) onProductoEditado(updatedProducto);
          },
          onError: (error) => {
            console.error('Error actualizando producto:', error);
            toast.error(error?.message || 'Error al actualizar el producto.');
          }
        }
      );

    } catch (err) {
      console.error('Error:', err);
      const errorMsg = err?.message || '';
      
      if (errorMsg.includes('duplicate key') || errorMsg.includes('unique constraint') || err?.code === '23505') {
        toast.error('Ya existe un producto con este código de barras. Usa un código diferente.');
      } else {
        toast.error(errorMsg || 'Error al actualizar el producto.');
      }
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
  stepLabels.push('Opciones y variantes');
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
          <button type="button" className="back-button" onClick={handleBack}>
            ← {formStep === 1 ? 'Cancelar' : 'Atrás'}
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
                    <h3 className="step-title" style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '1.5rem' }}>Información Básica e Imagen</h3>
                    <label>Código</label>
                    <div className="codigo-input-wrapper">
                      <input
                        {...codigoRegister}
                        ref={(e) => {
                          codigoRegister.ref(e);
                          codigoInputRef.current = e;
                        }}
                        className={`input-form ${errors.codigo ? 'error' : ''}`}
                        placeholder="Ej: SKU123"
                      />
                      <div className="barcode-actions-dropdown-container">
                        <button
                          type="button"
                          className="btn-barcode-trigger"
                          onClick={() => setShowBarcodeMenu(!showBarcodeMenu)}
                          title="Opciones de código"
                        >
                          <Barcode size={18} />
                        </button>
                        {showBarcodeMenu && (
                          <>
                            <div className="barcode-menu-overlay-tap" onClick={() => setShowBarcodeMenu(false)} />
                            <div className="barcode-actions-menu">
                              <button
                                type="button"
                                className="barcode-menu-item"
                                onClick={() => {
                                  generarCodigoAutomatico();
                                  setShowBarcodeMenu(false);
                                }}
                              >
                                <RefreshCw size={14} />
                                <span>Generar automático</span>
                              </button>
                              <button
                                type="button"
                                className="barcode-menu-item"
                                onClick={() => {
                                  setBarcodePrintOpen(true);
                                  setShowBarcodeMenu(false);
                                }}
                              >
                                <Printer size={14} />
                                <span>Imprimir etiqueta</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {errors.codigo && <span className="error-message">{errors.codigo.message}</span>}

                    <label>Nombre</label>
                    <input
                      {...register('nombre')}
                      className={`input-form ${errors.nombre ? 'error' : ''}`}
                      placeholder="Nombre del producto"
                    />
                    {errors.nombre && <span className="error-message">{errors.nombre.message}</span>}

                    <div style={{ marginTop: '1rem' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.95rem', color: '#334155', display: 'block', marginBottom: '0.5rem' }}>Categoría</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                        <select
                          className="input-form"
                          value={creandoCategoria ? 'crear_otra' : (categoriasExistentes.includes(watch('categoria')) ? watch('categoria') : (watch('categoria') || ''))}
                          onChange={(e) => {
                            if (e.target.value === 'crear_otra') {
                              setCreandoCategoria(true);
                              setValue('categoria', nuevaCategoriaText);
                            } else {
                              setCreandoCategoria(false);
                              setValue('categoria', e.target.value);
                            }
                          }}
                        >
                          <option value="">Sin categoría</option>
                          {categoriasExistentes.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          <option value="crear_otra">+ Crear nueva categoría</option>
                        </select>
                        {creandoCategoria && (
                          <input
                            type="text"
                            className="input-form"
                            placeholder="Escribe la nueva categoría"
                            value={nuevaCategoriaText}
                            onChange={(e) => {
                              setNuevaCategoriaText(e.target.value);
                              setValue('categoria', e.target.value);
                            }}
                            autoFocus
                          />
                        )}
                      </div>
                    </div>

                    {/* Productos vinculados (APARECEN SI TIENE O ES COMBO) */}
                    {(selectedType === 'combo' || (productosVinculados && productosVinculados.length > 0)) && (
                      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <ProductosVinculados
                          productosVinculados={productosVinculados}
                          onChange={setProductosVinculados}
                          organizationId={organization?.id || producto?.organization_id}
                        />
                      </div>
                    )}

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
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginTop: '1.5rem', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Precios</h4>
                    {/* Los precios se movieron al final para Combos */}
                    {selectedType !== 'combo' && (
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
                        {!isJewelryBusiness && (
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.98rem', marginBottom: 4, textAlign: 'center' }}>
                              Precio de Venta <span style={{ color: '#ef4444' }}>*</span>
                            </span>
                            {(typeFields.required.includes('precio_compra') || typeFields.optional.includes('precio_compra')) && (
                              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', width: '100%' }}>
                                <button
                                  type="button"
                                  className={`inventario-btn ${precioVentaModo === 'manual' ? 'inventario-btn-primary' : 'inventario-btn-outline'}`}
                                  onClick={() => setPrecioVentaModo('manual')}
                                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                                >
                                  Manual
                                </button>
                                <button
                                  type="button"
                                  className={`inventario-btn ${precioVentaModo === 'porcentaje' ? 'inventario-btn-primary' : 'inventario-btn-outline'}`}
                                  onClick={() => setPrecioVentaModo('porcentaje')}
                                  style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                                >
                                  % Margen
                                </button>
                              </div>
                            )}
                            {precioVentaModo === 'porcentaje' && (typeFields.required.includes('precio_compra') || typeFields.optional.includes('precio_compra')) && !esEmpleado && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
                                <input
                                  value={margenPorcentaje}
                                  onChange={handleMargenPorcentajeChange}
                                  inputMode="decimal"
                                  placeholder="Ej: 30"
                                  className="input-form"
                                />
                              </div>
                            )}
                            <input
                              {...register('precioVenta')}
                              value={precioVentaInput.displayValue}
                              onChange={handlePrecioVentaChange}
                              inputMode="numeric"
                              placeholder="Ej: 50.000"
                              className={`input-form ${errors.precioVenta ? 'error' : ''}`}
                              disabled={precioVentaModo === 'porcentaje'}
                            />
                            {errors.precioVenta && <span className="error-message">{errors.precioVenta.message}</span>}
                          </div>
                        )}
                      </div>
                    )}

                    {isJewelryBusiness && (
                      <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginBottom: '1.25rem', textAlign: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                          Definición de Precio de Joyería
                        </h4>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                          <div style={{ display: 'grid', gap: '0.4rem' }}>
                            <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Modo de Precio</label>
                            <select {...register('jewelry_price_mode')} className="input-form">
                              <option value="fixed">Precio Fijo</option>
                              <option value="variable">Precio Variable</option>
                            </select>
                          </div>

                          <div style={{ display: 'grid', gap: '0.4rem' }}>
                            <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Tipo de Material</label>
                            <select {...register('jewelry_material_type')} className="input-form">
                              <option value="na">No aplica</option>
                              <option value="local">Nacional</option>
                              <option value="international">Internacional</option>
                            </select>
                          </div>
                        </div>

                        {/* Paso 2: Cómo definir el precio según el modo */}
                        <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: '1rem', marginTop: '0.5rem' }}>
                          {jewelryPriceMode === 'fixed' && !esEmpleado && (
                            <>
                              <label style={{ fontWeight: 600, fontSize: '0.9rem', display: 'block', marginBottom: '0.5rem', textAlign: 'center' }}>
                                ¿Cómo definir el precio estático?
                              </label>
                              <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'center', marginBottom: '1rem' }}>
                                <button
                                  type="button"
                                  className={`inventario-btn ${precioVentaModo === 'manual' ? 'inventario-btn-primary' : 'inventario-btn-outline'}`}
                                  onClick={() => setPrecioVentaModo('manual')}
                                  style={{ flex: 1, maxWidth: '150px', padding: '0.5rem' }}
                                >
                                  Valor específico
                                </button>
                                <button
                                  type="button"
                                  className={`inventario-btn ${precioVentaModo === 'porcentaje' ? 'inventario-btn-primary' : 'inventario-btn-outline'}`}
                                  onClick={() => setPrecioVentaModo('porcentaje')}
                                  style={{ flex: 1, maxWidth: '150px', padding: '0.5rem' }}
                                >
                                  % sobre compra
                                </button>
                              </div>

                              {precioVentaModo === 'porcentaje' && (
                                <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '1rem' }}>
                                  <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>% Margen sobre compra</label>
                                  <input
                                    value={margenPorcentaje}
                                    onChange={handleMargenPorcentajeChange}
                                    inputMode="decimal"
                                    placeholder="Ej: 30"
                                    className="input-form"
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {jewelryPriceMode === 'variable' && (
                            <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '1rem' }}>
                              <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Margen mínimo (%)</label>
                              <input
                                {...register('jewelry_min_margin')}
                                type="text"
                                inputMode="decimal"
                                step="any"
                                placeholder="Ej: 10"
                                className="input-form"
                              />
                              <span style={{ fontSize: '0.7rem', color: '#64748b', textAlign: 'center' }}>
                                Si se deja vacío, usa los valores globales de la organización.
                              </span>
                            </div>
                          )}

                          {/* RESULTADO FINAL: PRECIO DE VENTA */}
                          <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                            <label style={{ fontWeight: 700, fontSize: '0.95rem', color: '#166534', display: 'block', marginBottom: '0.5rem', textAlign: 'center' }}>
                              Precio de Venta Final
                            </label>
                            <input
                              {...register('precioVenta')}
                              value={precioVentaInput.displayValue}
                              onChange={handlePrecioVentaChange}
                              inputMode="numeric"
                              placeholder="Ej: 50.000"
                              className={`input-form ${errors.precioVenta ? 'error' : ''}`}
                              disabled={jewelryPriceMode === 'variable' || (jewelryPriceMode === 'fixed' && precioVentaModo === 'porcentaje')}
                              style={{
                                textAlign: 'center',
                                fontSize: '1.2rem',
                                fontWeight: 'bold',
                                color: jewelryPriceMode === 'variable' || (jewelryPriceMode === 'fixed' && precioVentaModo === 'porcentaje') ? '#166534' : 'inherit',
                                backgroundColor: '#fff'
                              }}
                            />
                            {errors.precioVenta && <span className="error-message" style={{ textAlign: 'center' }}>{errors.precioVenta.message}</span>}

                            {jewelryPriceMode === 'variable' && precioBaseGramoActual > 0 && parseWeightValue(pesoWatch) > 0 && (
                              <div style={{ padding: '0.75rem', background: '#f1f5f9', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '0.5rem' }}>
                                <span style={{ fontSize: '0.8rem', color: '#475569', display: 'block', textAlign: 'center' }}>
                                  Base por {organization?.jewelry_weight_unit || 'g'}: <strong>{formatCurrency(precioBaseGramoActual)}</strong>
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', textAlign: 'center', marginTop: '0.25rem' }}>
                                  Regla: {reglaAplicada}{aplicaPureza ? ` • Pureza: ${purezaWatch || '24k'}` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )/* Fin isJewelryBusiness config */}


                    {/* SECCIÓN DE PRECIOS AL FINAL PARA COMBOS */}
                    {selectedType === 'combo' && (
                      <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px dashed #e2e8f0' }}>
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '1.5rem' }}>Resumen Financiero del Combo</h4>
                        <div className="input-precio-row" style={{ gap: '2.5rem', justifyContent: 'space-between' }}>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.98rem', marginBottom: 4, textAlign: 'center' }}>
                              Costo Total de Compra
                            </span>
                            <input
                              {...register('precioCompra')}
                              value={precioCompraInput.displayValue}
                              onChange={handlePrecioCompraChange}
                              inputMode="numeric"
                              className="input-form"
                              readOnly={precioVentaModo === 'combo'}
                              style={precioVentaModo === 'combo' ? { backgroundColor: '#f1f5f9', fontWeight: 'bold', cursor: 'default', color: '#000' } : {}}
                            />
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.98rem', marginBottom: 4, textAlign: 'center' }}>
                              Precio Final de Venta
                            </span>
                            <input
                              {...register('precioVenta')}
                              value={precioVentaInput.displayValue}
                              onChange={handlePrecioVentaChange}
                              inputMode="numeric"
                              className="input-form"
                              readOnly={precioVentaModo === 'combo'}
                              style={precioVentaModo === 'combo' ? { backgroundColor: '#f0fdf4', color: '#166534', fontWeight: 'bold', border: '1px solid #bbf7d0', cursor: 'default' } : {}}
                            />
                          </div>
                        </div>

                        <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '1rem', borderBottom: '1px solid #bbf7d0', paddingBottom: '0.5rem' }}>Ajustar Margen de la Ancheta</h4>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {['30', '35', 'otro', 'manual'].map((m) => (
                              <button
                                key={m}
                                type="button"
                                className={`inventario-btn ${margenCombo === m || (m === 'manual' && precioVentaModo === 'manual') ? 'inventario-btn-primary' : 'inventario-btn-outline'}`}
                                onClick={() => {
                                  if (m === 'manual') {
                                    setPrecioVentaModo('manual');
                                    setMargenCombo('manual');
                                  } else {
                                    setMargenCombo(m);
                                    setPrecioVentaModo('combo');
                                  }
                                }}
                                style={{ padding: '0.35rem', fontSize: '0.85rem', flex: 1 }}
                              >
                                {m === 'otro' ? 'Personalizado' : m === 'manual' ? 'Manual' : `${m}%`}
                              </button>
                            ))}
                          </div>
                          {margenCombo === 'otro' && (
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              placeholder="% personalizado"
                              className="input-form"
                              style={{ marginTop: '0.5rem' }}
                              value={margenComboPersonalizado}
                              onChange={(e) => setMargenComboPersonalizado(e.target.value)}
                            />
                          )}
                          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: '#166534' }}>
                              Calculado sobre la suma de {productosVinculados.length} productos.
                            </span>
                            <span
                              style={{ fontSize: '0.75rem', color: '#64748b', cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => setPrecioVentaModo('manual')}
                            >
                              Editar precios manualmente
                            </span>
                          </div>

                          <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #bbf7d0' }}>
                            <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '1rem', borderBottom: '1px solid #bbf7d0', paddingBottom: '0.5rem' }}>
                              ¿A qué categoría va el dinero del margen (mano de obra)?
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              <select
                                className="input-form"
                                style={{ backgroundColor: '#fff' }}
                                value={creandoCategoriaManoObra ? 'crear_otra' : (categoriasExistentes.includes(categoriaManoObra) ? categoriaManoObra : '')}
                                onChange={(e) => {
                                  if (e.target.value === 'crear_otra') {
                                    setCreandoCategoriaManoObra(true);
                                    setCategoriaManoObra(nuevaCategoriaManoObraText);
                                  } else {
                                    setCreandoCategoriaManoObra(false);
                                    setCategoriaManoObra(e.target.value);
                                  }
                                }}
                              >
                                <option value="">A la categoría del producto (General)</option>
                                {categoriasExistentes.map(c => (
                                  <option key={`mano-${c}`} value={c}>{c}</option>
                                ))}
                                <option value="crear_otra">+ Crear nueva categoría</option>
                              </select>
                              {creandoCategoriaManoObra && (
                                <input
                                  type="text"
                                  className="input-form"
                                  style={{ backgroundColor: '#fff' }}
                                  placeholder="Ej: Mano de Obra, Empaques"
                                  value={nuevaCategoriaManoObraText}
                                  onChange={(e) => {
                                    setNuevaCategoriaManoObraText(e.target.value);
                                    setCategoriaManoObra(e.target.value);
                                  }}
                                />
                              )}
                            </div>
                          </div>
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
                          type="number"
                          step="any"
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

                    {/* Checkbox para ocultar en catálogo */}
                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="ocultar_en_catalogo_edit"
                        {...register('ocultar_en_catalogo')}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <label htmlFor="ocultar_en_catalogo_edit" style={{ cursor: 'pointer', fontWeight: 500, fontSize: '0.95rem', color: '#dc2626' }}>
                        Ocultar este producto de mi catálogo público (Tienda Virtual)
                      </label>
                    </div>

                    {/* Imagen del producto (ahora en el paso 1) */}
                    <div style={{ marginTop: '2rem', marginBottom: '1.5rem' }}>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
                        Imagen del Producto <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.9rem' }}>(Opcional)</span>
                        {!puedeSubirImagenes && <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.85rem', marginLeft: '0.5rem' }}>🔒 Solo plan Estándar</span>}
                      </h4>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          className="input-form"
                          style={{ flex: 1 }}
                          placeholder="Pega la URL aquí o sube un archivo 👉"
                          value={imagen ? imagen.name : imagenUrl}
                          onChange={(e) => {
                            if (!imagen) setImagenUrl(e.target.value);
                          }}
                          disabled={Boolean(imagen)}
                        />
                        <button
                          type="button"
                          onClick={puedeSubirImagenes ? handleClickUpload : () => toast.error('Actualiza al plan Estándar para subir imágenes')}
                          disabled={!puedeSubirImagenes || Boolean(imagenUrl && imagenUrl.trim() !== '')}
                          style={{
                            padding: '0.5rem 0.75rem',
                            height: '100%',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#cbd5e1',
                            border: '1px solid #94a3b8',
                            borderRadius: '8px',
                            color: '#334155',
                            cursor: 'pointer',
                            minHeight: '42px'
                          }}
                          title="Cargar imagen desde el dispositivo"
                        >
                          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
                            <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <rect x="4" y="16" width="16" height="4" rx="2" fill="currentColor" fillOpacity=".2" />
                          </svg>
                        </button>
                        <input type="file" accept="image/*" onChange={handleImagenChange} ref={fileInputRef} style={{ display: 'none' }} disabled={!puedeSubirImagenes} />
                      </div>

                      {imagen && (
                        <div className="image-preview" style={{ marginTop: '1rem' }}>
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
                        <div className="image-preview" style={{ marginTop: '1rem' }}>
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
                        <div className="image-preview" style={{ marginTop: '1rem' }}>
                          <OptimizedProductImage
                            imagePath={producto.imagen}
                            alt="Imagen actual"
                            className=""
                          />
                          <div style={{ position: 'absolute', top: 5, right: 5, background: 'var(--cp-primary)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600 }}>
                            Imagen Actual
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Paso 2: Opciones, variaciones y variantes */}
                {formStep === 2 && (
                  <div className="form-step-content">
                    <h3 className="step-title" style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '1.5rem' }}>Opciones y Variantes</h3>
                    <p className="step-description">Configura variaciones del cliente y variantes con stock.</p>

                    {/* Configuración de variaciones */}
                    <VariacionesConfig
                      variaciones={variacionesConfig}
                      onChange={setVariacionesConfig}
                    />

                    {/* Variantes con stock y código */}
                    <div style={{ marginTop: '1rem' }}>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1e293b', marginTop: '1.5rem', marginBottom: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Variantes con stock (color, talla, presentación...)</h4>
                      <p className="step-description">Cada variante puede tener su propio stock y código de barras.</p>

                      {variantesProducto.length === 0 && (
                        <p style={{ color: '#6b7280', fontSize: '0.9rem', textAlign: 'center', margin: '0.5rem 0 1rem 0' }}>
                          No hay variantes registradas.
                        </p>
                      )}

                      <div style={{ display: 'grid', gap: '0.75rem' }}>
                        {variantesProducto.map((vari, index) => {
                          const bloqueada = varianteActivaId && vari.id && vari.id !== varianteActivaId;
                          return (
                            <div key={`variante-${index}`} style={{ display: 'grid', gap: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.75rem', opacity: bloqueada ? 0.7 : 1 }}>
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
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d+$/.test(val)) {
                                      actualizarVariante(index, 'stock', val);
                                    }
                                  }}
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

                      <button
                        type="button"
                        className="inventario-btn inventario-btn-secondary"
                        style={{ marginTop: '0.75rem', width: '100%', display: 'flex', justifyContent: 'center' }}
                        onClick={agregarVariante}
                        disabled={modoSoloVariantes}
                      >
                        + Agregar variante
                      </button>
                    </div>

                    {/* Productos vinculados (PARA OTROS CASOS) */}
                    {selectedType !== 'combo' && productosVinculados.length === 0 && (
                      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <ProductosVinculados
                          productosVinculados={productosVinculados}
                          onChange={setProductosVinculados}
                          organizationId={organization?.id || producto?.organization_id}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Paso 3: Campos adicionales personalizables */}
                {formStep === 3 && (
                  <div className="form-step-content">
                    <h3 className="step-title" style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '1.5rem' }}>Campos Adicionales</h3>
                    <p className="step-description">Agrega información extra si lo necesitas. (v2.1 decimales habilitados)</p>

                    {/* Campos opcionales según el tipo de producto */}
                    {typeFields.optional.map(fieldId => {
                      const fieldConfig = ADDITIONAL_FIELDS[fieldId];
                      if (!fieldConfig || fieldId === 'categoria') return null;

                      // Evitar duplicar peso si ya se mostró en el paso 1 para joyerías
                      if (isJewelryBusiness && fieldId === 'peso') return null;

                      return (
                        <div key={fieldId} className="additional-field-wrapper">
                          <div className="additional-field-header">
                            <label>{fieldConfig.label} <span style={{ color: '#6b7280', fontWeight: 400, fontSize: '0.85rem' }}>(Opcional)</span></label>
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
                              type={fieldId === 'peso' ? 'text' : fieldConfig.type}
                              inputMode={fieldId === 'peso' ? 'decimal' : (fieldConfig.inputMode || (fieldConfig.type === 'number' ? 'decimal' : undefined))}
                              step={fieldId === 'peso' ? 'any' : (fieldConfig.type === 'number' ? 'any' : undefined)}
                              className="input-form"
                              placeholder={fieldConfig.placeholder}
                            />
                          )}
                        </div>
                      );
                    })}

                    {/* Campos adicionales agregados por el usuario */}
                    {additionalFields.map(fieldId => {
                      const fieldConfig = ADDITIONAL_FIELDS[fieldId];
                      if (!fieldConfig || fieldId === 'categoria') return null;

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
                              type={fieldId === 'peso' ? 'text' : fieldConfig.type}
                              inputMode={fieldId === 'peso' ? 'decimal' : (fieldConfig.inputMode || (fieldConfig.type === 'number' ? 'decimal' : undefined))}
                              step={fieldId === 'peso' ? 'any' : (fieldConfig.type === 'number' ? 'any' : undefined)}
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
                          .filter(fieldId => fieldId !== 'categoria' && !typeFields.optional.includes(fieldId) && !additionalFields.includes(fieldId))
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
                <div className="form-actions form-actions-centro" style={{ display: 'flex', width: '100%', gap: '1rem' }}>
                  <button
                    type="button"
                    className="inventario-btn inventario-btn-secondary"
                    onClick={() => {
                      if (hasUnsavedChanges()) {
                        if (window.confirm('Tienes cambios sin guardar. ¿Estás seguro de que quieres salir?')) {
                          onClose();
                        }
                      } else {
                        onClose();
                      }
                    }}
                    disabled={subiendo}
                    style={{ flex: 1, padding: '0.75rem' }}
                  >
                    Cancelar
                  </button>
                  {(() => {
                    const hasStep2 = true;
                    const hasStep3 = Object.keys(ADDITIONAL_FIELDS).length > 0;
                    const isLastStep = (formStep === 1 && !hasStep2 && !hasStep3) ||
                      (formStep === 2 && !hasStep3) ||
                      formStep === 3;

                    if (isLastStep) {
                      return (
                        <button type="submit" className="inventario-btn inventario-btn-primary" disabled={subiendo || isSubmitting} style={{ flex: 1, padding: '0.75rem' }}>
                          {subiendo ? (comprimiendo ? '🗜️ Comprimiendo...' : 'Actualizando...') : 'Actualizar Producto'}
                        </button>
                      );
                    } else {
                      return (
                        <>
                          <button type="button" className="inventario-btn inventario-btn-outline" onClick={handleNext} style={{ flex: 1, padding: '0.75rem' }}>
                            Siguiente
                          </button>
                          <button type="submit" className="inventario-btn inventario-btn-primary" disabled={subiendo || isSubmitting} style={{ flex: 1, padding: '0.75rem', backgroundColor: '#10b981', color: 'white', borderColor: '#10b981' }}>
                            {subiendo ? (comprimiendo ? '🗜️ Comprimiendo...' : 'Actualizando...') : 'Guardar y Salir'}
                          </button>
                        </>
                      );
                    }
                  })()}
                </div>
              </form>
            )}
          </>
        )}
      </div>
      {barcodePrintOpen && (
        <ImpresionCodigosBarrasModal
          open={barcodePrintOpen}
          onClose={() => setBarcodePrintOpen(false)}
          productosSeleccionados={[
            {
              id: producto?.id || 'temp-preview',
              nombre: watch('nombre') || producto?.nombre || 'Nuevo Producto',
              codigo: watch('codigo') || '',
              precio_venta: parseFloat(String(watch('precioVenta') || producto?.precio_venta || '0').replace(/[^\d]/g, '')) || 0,
              stock: parseFloat(String(watch('stock') || producto?.stock || '0')) || 0,
              imagen: producto?.imagen || ''
            }
          ]}
          moneda={moneda}
        />
      )}
    </div>
  );
};

export default EditarProductoModalV2;
