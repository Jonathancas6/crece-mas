

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import './Inventario.css';
import AgregarProductoModalV2 from '../../components/modals/AgregarProductoModalV2';
import EditarProductoModalV2 from '../../components/modals/EditarProductoModalV2';
import CreacionMasivaModal from '../../components/modals/CreacionMasivaModal';
import ImportarProductosCSV from '../../components/forms/ImportarProductosCSV';
import FeatureGuard from '../../components/FeatureGuard';
import OptimizedProductImage from '../../components/business/OptimizedProductImage';
import LottieLoader from '../../components/ui/LottieLoader';
import InventarioStats from '../../components/inventario/InventarioStats';
import InventarioFilters from '../../components/inventario/InventarioFilters';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { supabase } from '../../services/api/supabaseClient';
import { List, Grid3X3, PackagePlus, Search, RefreshCw, Download, CheckSquare, X, Edit3, Trash2, ChevronDown, SlidersHorizontal, ArrowUpDown, Tag, Layers, Check, Package, Upload, Camera } from 'lucide-react';
import { useProductos, useEliminarProducto } from '../../hooks/useProductos';
import EntradaInventarioModal from '../../components/modals/EntradaInventarioModal';
import EdicionMasivaModal from '../../components/modals/EdicionMasivaModal';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import MovimientosStockModal from '../../components/modals/MovimientosStockModal';
import { History, Barcode } from 'lucide-react';
import CameraScanner from '../../components/CameraScanner';
import ImpresionCodigosBarrasModal from '../../components/modals/ImpresionCodigosBarrasModal';


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

// Componente para filtros de multiselección (Diseño Resumen de Ventas)
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
      >
        {Icon && <Icon size={16} />}
        <span className="ms-label">
          {selectedValues.length === 0
            ? label
            : selectedValues.length === 1
              ? (options.find(o => (o.value !== undefined ? o.value : o) === selectedValues[0])?.label || selectedValues[0])
              : `${label}: ${selectedValues.length}`}
        </span>
        <ChevronDown size={14} className={`ms-chevron ${isOpen ? 'open' : ''}`} />
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
                    <div className={`cp-checkbox ${isSelected ? 'checked' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isSelected && <Check size={12} strokeWidth={3} color="white" />}
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

// Componente para filtros de selección única
const SingleSelectFilter = ({ label, options, value, onChange, icon: IconComponent, compact = false }) => {
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

  const selectedOption = options.find(o => (o.value !== undefined ? o.value : o) === value);
  const displayLabel = selectedOption?.label || selectedOption || label;

  return (
    <div className={`cp-dropdown-filter ${compact ? 'compact' : ''}`} ref={containerRef}>
      <button
        className={`cp-select-minimal ${compact ? 'compact' : ''} ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={compact ? `Ordenar: ${displayLabel}` : ''}
        type="button"
      >
        {IconComponent ? <IconComponent size={20} strokeWidth={2.5} /> : <ArrowUpDown size={20} strokeWidth={2.5} />}
        {!compact && <span className="ms-label">{displayLabel}</span>}
        {!compact && <ChevronDown size={14} className={`ms-chevron ${isOpen ? 'open' : ''}`} />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="cp-dropdown-menu"
            style={compact ? { left: 'auto', right: 0 } : {}}
          >
            <div className="cp-dropdown-items">
              {options.map(option => {
                const val = option.value !== undefined ? option.value : option;
                const labelText = option.label !== undefined ? option.label : option;
                const isSelected = val === value;

                return (
                  <div
                    key={val}
                    className={`cp-dropdown-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onChange(val);
                      setIsOpen(false);
                    }}
                  >
                    <span>{labelText}</span>
                    {isSelected && <Check size={14} strokeWidth={3} style={{ color: 'var(--accent-primary)', marginLeft: 'auto' }} />}
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

const Inventario = () => {
  const { user, organization, userProfile, hasPermission } = useAuth();
  const { isDegraded, isFreePlan, getLimit } = useSubscription();
  const location = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [editarModalOpen, setEditarModalOpen] = useState(false);
  const [creacionMasivaOpen, setCreacionMasivaOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [entradaInventarioOpen, setEntradaInventarioOpen] = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [varianteSeleccionadaId, setVarianteSeleccionadaId] = useState(null);
  const [modoLista, setModoLista] = useState(false);
  const [manualSpin, setManualSpin] = useState(false);
  const [ordenProductos, setOrdenProductos] = useState('created_desc');
  const [query, setQuery] = useState('');
  const [productoIdFiltro, setProductoIdFiltro] = useState(null);

  const [filters, setFilters] = useState({});
  const [seleccionados, setSeleccionados] = useState([]);
  const [eliminandoSeleccionados, setEliminandoSeleccionados] = useState(false);
  const [edicionMasivaOpen, setEdicionMasivaOpen] = useState(false);
  const [barcodesModalOpen, setBarcodesModalOpen] = useState(false);
  const [productosParaCodigo, setProductosParaCodigo] = useState([]);
  const [movimientosModalOpen, setMovimientosModalOpen] = useState(false);
  const [movimientosProducto, setMovimientosProducto] = useState(null);
  const [movimientosVarianteId, setMovimientosVarianteId] = useState(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const advancedFiltersRef = useRef(null);

  // Cerrar filtros avanzados al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (advancedFiltersRef.current && !advancedFiltersRef.current.contains(event.target)) {
        setShowAdvancedFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [lastModifiedId, setLastModifiedId] = useState(null);

  // Suponiendo que el usuario tiene moneda en user.user_metadata.moneda
  const moneda = user?.user_metadata?.moneda || 'COP';
  const jewelryPrices = useMemo(() => {
    if (!organization?.id) return {};
    const stored = localStorage.getItem(`jewelry_prices:${organization.id}`);
    if (!stored) return {};
    try {
      return JSON.parse(stored) || {};
    } catch (err) {
      console.warn('No se pudo leer precios de joyería:', err);
      return {};
    }
  }, [organization?.id]);
  const parseNumber = useCallback((value) => {
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
  }, []);

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

  const getGoldPriceGlobal = useCallback(() => {
    const fromStorage = parseNumber(jewelryPrices?.global);
    if (fromStorage > 0) return fromStorage;
    return parseNumber(organization?.jewelry_gold_price_global);
  }, [jewelryPrices, organization?.jewelry_gold_price_global, parseNumber]);

  const getGoldPriceLocal = useCallback(() => {
    const fromStorage = parseNumber(jewelryPrices?.local);
    if (fromStorage > 0) return fromStorage;
    const goldGlobal = getGoldPriceGlobal();
    const adjustPct = parseNumber(organization?.jewelry_national_adjust_pct);
    if (goldGlobal > 0 && adjustPct > 0) {
      return goldGlobal * (1 - adjustPct / 100);
    }
    return parseNumber(organization?.jewelry_gold_price_local);
  }, [jewelryPrices, organization?.jewelry_gold_price_local, organization?.jewelry_national_adjust_pct, getGoldPriceGlobal, parseNumber]);

  const getCurrentVentaPrice = useCallback((producto) => {
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
    const materialType = metadata?.jewelry_material_type || 'na';
    const goldPrice = materialType === 'local'
      ? getGoldPriceLocal()
      : getGoldPriceGlobal();
    const minMargin = parseNumber(metadata?.jewelry_min_margin)
      || (materialType === 'local'
        ? parseNumber(organization?.jewelry_min_margin_local)
        : parseNumber(organization?.jewelry_min_margin_international));
    const compraPorUnidad = parseNumber(metadata?.jewelry_compra_por_unidad)
      || (peso > 0 ? (parseNumber(producto.precio_compra) / peso) : 0);
    const diff = goldPrice - compraPorUnidad;
    const precioBaseGramo = diff >= minMargin ? goldPrice : (compraPorUnidad + minMargin);
    const aplicaPureza = materialType === 'international';
    const purityFactor = aplicaPureza ? getPurityFactor(metadata?.pureza) : 1;
    if (!peso || !precioBaseGramo) return 0;
    return Math.round(peso * precioBaseGramo * purityFactor * 100) / 100;
  }, [getGoldPriceLocal, getGoldPriceGlobal, getPurityFactor, organization?.jewelry_min_margin_local, organization?.jewelry_min_margin_international, parseNumber]);

  const umbralStockBajo = Number(user?.user_metadata?.umbralStockBajo ?? 10);
  const umbralStockBajoSeguro = Number.isFinite(umbralStockBajo) && umbralStockBajo > 0 ? umbralStockBajo : 10;

  const getUmbralProducto = useCallback((producto) => {
    const umbralProducto = Number(producto?.metadata?.umbral_stock_bajo);
    if (Number.isFinite(umbralProducto) && umbralProducto > 0) {
      return umbralProducto;
    }
    return umbralStockBajoSeguro;
  }, [umbralStockBajoSeguro]);

  const isJewelryBusiness = organization?.business_type === 'jewelry_metals';

  const { data: productos = [], isLoading: cargandoLocal, error, refetch, isFetching } = useProductos(organization?.id);
  const eliminarProductoMutation = useEliminarProducto();
  const queryClient = useQueryClient(); // Necesario para invalidar queries

  // Suscripción en tiempo real para productos y variantes (sincronización instantánea)
  useEffect(() => {
    if (!organization?.id) return;

    // Suscribirse a cambios en la tabla productos para esta organización
    const channel = supabase
      .channel(`inventario-realtime-${organization.id}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Escuchar INSERT, UPDATE y DELETE
          schema: 'public',
          table: 'productos',
          filter: `organization_id=eq.${organization.id}`
        },
        (payload) => {
          console.log('📦 Cambio en productos detectado en Inventario:', payload.eventType);
          // Invalidar query para refrescar los datos inmediatamente
          queryClient.invalidateQueries(['productos', organization.id]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_variants',
          filter: `organization_id=eq.${organization.id}`
        },
        () => {
          queryClient.invalidateQueries(['productos', organization.id]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organization?.id, queryClient]);

  const cargando = cargandoLocal;





  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const stockParam = params.get('stock');
    const productoParam = params.get('producto_id');
    const vencimientoParam = params.get('vencimiento');
    if (productoParam) {
      setProductoIdFiltro(productoParam);
      setFilters({});
      setQuery('');
      return;
    }

    setProductoIdFiltro(null);
    if (vencimientoParam === 'proximo') {
      setFilters(prev => ({ ...prev, fecha_vencimiento_value: 'proximo' }));
      return;
    }
    if (stockParam === 'bajo') {
      setFilters(prev => ({ ...prev, stock_condition: 'bajo' }));
    } else if (stockParam === 'sin') {
      setFilters(prev => ({ ...prev, stock_condition: 'sin' }));
    }
  }, [location.search]);

  // Precargar imágenes cuando se cargan los productos
  useEffect(() => {
    if (productos.length > 0 && organization?.id && supabase) {
      // Precargar imágenes de productos con imagen válida
      const productosConImagen = productos.filter(
        p => p.imagen &&
          p.imagen.trim() !== '' &&
          p.imagen !== 'null' &&
          p.imagen !== 'undefined'
      );

      if (productosConImagen.length > 0) {
        // Precargar las primeras 30 imágenes (las más visibles)
        const imagenesAPrecargar = productosConImagen.slice(0, 30);

        imagenesAPrecargar.forEach(async (producto) => {
          try {
            let filePath = producto.imagen;

            // Extraer la ruta del archivo
            if (filePath.includes('/storage/v1/object/public/productos/')) {
              filePath = filePath.split('/storage/v1/object/public/productos/')[1];
            } else if (filePath.includes('/storage/v1/object/sign/productos/')) {
              filePath = filePath.split('/storage/v1/object/sign/productos/')[1].split('?')[0];
            } else if (filePath.includes('productos/')) {
              const parts = filePath.split('productos/');
              if (parts.length > 1) {
                filePath = parts[1].split('?')[0];
              }
            }

            filePath = filePath.trim();

            // Decodificar la ruta si viene codificada
            try {
              filePath = decodeURIComponent(filePath);
            } catch (e) {
              // Si falla la decodificación, usar el original
            }

            // Generar signed URL y precargarla
            const { data, error } = await supabase.storage
              .from('productos')
              .createSignedUrl(filePath, 3600);

            if (!error && data?.signedUrl) {
              // Guardar en cache global inmediatamente
              const globalImageCache = (window.__imageCache || new Map());
              globalImageCache.set(producto.imagen, {
                url: data.signedUrl,
                timestamp: Date.now()
              });
              window.__imageCache = globalImageCache;

              // Precargar la imagen en el navegador
              const img = new Image();
              img.src = data.signedUrl;
            }
          } catch (err) {
            // Error silencioso en precarga
          }
        });
      }
    }
  }, [productos, organization?.id]);

  // Mostrar error si hay problemas cargando productos (usando useEffect para evitar setState durante render)
  useEffect(() => {
    if (error) {
      toast.error('Error al cargar productos');
    }
  }, [error]);

  useEffect(() => {
    setSeleccionados(prev => {
      const next = prev.filter(id => productos.some(p => p.id === id));
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) {
        return prev;
      }
      return next;
    });
  }, [productos]);

  // Handler para cuando se escanea un código de barras
  const handleBarcodeScanned = useCallback((barcode) => {
    const barcodeLower = barcode?.toLowerCase?.().trim?.() || '';
    if (barcodeLower) {
      const varianteEncontrada = productos
        .flatMap(producto => producto.variantes || [])
        .find(vari => vari.codigo && vari.codigo.toLowerCase() === barcodeLower);

      if (varianteEncontrada) {
        const productoVariante = productos.find(p => p.id === varianteEncontrada.producto_id);
        if (productoVariante) {
          setProductoSeleccionado(productoVariante);
          setVarianteSeleccionadaId(varianteEncontrada.id);
          setEditarModalOpen(true);
          return;
        }
      }
    }

    setVarianteSeleccionadaId(null);
    setQuery(barcode);
    // Enfocar el input del buscador
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [productos]);

  // Hook para lector de códigos de barras en el buscador
  const {
    inputRef: barcodeInputRef,
    handleKeyDown: handleBarcodeKeyDown,
    handleInputChange: handleBarcodeInputChange
  } = useBarcodeScanner(handleBarcodeScanned, {
    minLength: 3,
    maxTimeBetweenChars: 30,
    autoSubmit: true,
    waitForEndChar: true,
    clearInput: false
  });

  // Ref para el input de búsqueda
  const searchInputRef = useRef(null);

  // Refs para detección global de código de barras (funciona aunque el cursor no esté en el buscador)
  const globalBarcodeBufferRef = useRef('');
  const globalLastCharTimeRef = useRef(null);
  const globalBarcodeTimeoutRef = useRef(null);
  const globalBarcodeProcessingRef = useRef(false);

  // Combinar refs - asignar el nodo directamente al ref del hook y al ref local
  const combinedSearchInputRef = useCallback((node) => {
    searchInputRef.current = node;
    if (barcodeInputRef && node) {
      barcodeInputRef.current = node;
    }
  }, [barcodeInputRef]);

  // Listener global para detectar códigos de barras en cualquier parte de la página
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const target = e.target;

      // Verificar si hay un modal abierto o si el evento viene de dentro de un modal
      const isInModal = target.closest('.modal-overlay, .modal-content, [class*="modal"], [class*="Modal"], [data-modal], [role="dialog"]');
      const hasOpenModal = document.querySelector('.modal-overlay[style*="display: block"], .modal-overlay:not([style*="display: none"]), [class*="modal"][style*="display: block"]');

      // Si hay un modal abierto o el evento viene de dentro de un modal, no procesar
      if (isInModal || hasOpenModal || modalOpen || editarModalOpen || entradaInventarioOpen) {
        // Limpiar buffer para evitar conflictos
        globalBarcodeBufferRef.current = '';
        globalLastCharTimeRef.current = null;
        if (globalBarcodeTimeoutRef.current) {
          clearTimeout(globalBarcodeTimeoutRef.current);
          globalBarcodeTimeoutRef.current = null;
        }
        return;
      }

      // Ignorar si el usuario está escribiendo en un input, textarea o contenteditable
      const isInputElement = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('input') ||
        target.closest('textarea');

      // Si está en el input del buscador, dejar que el hook normal lo maneje
      if (target === searchInputRef.current || target === barcodeInputRef?.current) {
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
          handleBarcodeScanned(barcode);

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
            handleBarcodeScanned(barcode);

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

    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (globalBarcodeTimeoutRef.current) {
        clearTimeout(globalBarcodeTimeoutRef.current);
      }
    };
  }, [handleBarcodeScanned, barcodeInputRef, modalOpen, editarModalOpen, entradaInventarioOpen]);

  // Función para obtener la fecha límite según el filtro
  const getFechaDesde = (opcion) => {
    if (!opcion) return null;
    const ahora = new Date();
    const desde = new Date();

    switch (opcion) {
      case 'hoy':
        desde.setHours(0, 0, 0, 0);
        break;
      case 'semana':
        desde.setDate(ahora.getDate() - 7);
        break;
      case 'mes':
        desde.setMonth(ahora.getMonth() - 1);
        break;
      case 'tres-meses':
        desde.setMonth(ahora.getMonth() - 3);
        break;
      case 'seis-meses':
        desde.setMonth(ahora.getMonth() - 6);
        break;
      case 'año':
        desde.setFullYear(ahora.getFullYear() - 1);
        break;
      default:
        return null;
    }
    return desde;
  };

  const productosSearchIndex = useMemo(() => {
    const index = new Map();
    // Indexar lista de productos local
    const todosMap = new Map();
    productos.forEach(p => todosMap.set(p.id, p));

    Array.from(todosMap.values()).forEach((producto) => {
      const camposDirectos = [
        producto.codigo,
        producto.nombre,
        producto.tipo
      ];

      if (producto.precio_venta) camposDirectos.push(String(producto.precio_venta));
      if (producto.precio_compra) camposDirectos.push(String(producto.precio_compra));
      if (producto.stock !== null && producto.stock !== undefined) {
        camposDirectos.push(String(producto.stock));
      }

      const metadata = typeof producto.metadata === 'string'
        ? (() => {
          try {
            return JSON.parse(producto.metadata);
          } catch {
            return {};
          }
        })()
        : (producto.metadata || {});

      const camposMetadata = [
        metadata.marca,
        metadata.modelo,
        metadata.color,
        metadata.talla,
        metadata.categoria,
        metadata.descripcion,
        metadata.material,
        metadata.dimensiones,
        metadata.duracion,
        metadata.ingredientes,
        metadata.alergenos,
        metadata.porcion
      ];

      const variantes = producto.variantes || [];
      const camposVariantes = variantes.flatMap(vari => [
        vari.nombre,
        vari.codigo
      ]);

      const todosLosCampos = [...camposDirectos, ...camposMetadata, ...camposVariantes]
        .filter(campo => campo !== null && campo !== undefined && campo !== '')
        .map(campo => String(campo).toLowerCase());

      index.set(String(producto.id), todosLosCampos.join(' '));
    });
    return index;
  }, [productos]); // Evaluamos combinados abajo

  // Filtrar productos basado en búsqueda y filtros dinámicos
  const filteredProducts = useMemo(() => {
    const result = productos.filter((producto) => {
      if (productoIdFiltro && String(producto.id) !== String(productoIdFiltro)) {
        return false;
      }

      // Filtro de búsqueda por cualquier campo
      // Si no hay búsqueda o está vacía, no filtrar por búsqueda
      if (!query || (typeof query === 'string' && query.trim() === '')) {
        // No filtrar por búsqueda, continuar con otros filtros
      } else {
        const searchTerm = query.toLowerCase().trim();
        if (searchTerm) {
          const textoCompleto = productosSearchIndex.get(String(producto.id)) || '';
          if (!textoCompleto.includes(searchTerm)) {
            return false;
          }
        }
      }

      // Procesar filtros dinámicos
      for (const filterKey of Object.keys(filters)) {
        const match = filterKey.match(/^(.+?)_(min|max|value|condition|multi)$/);
        if (!match) continue;

        const fieldId = match[1];
        const filterType = match[2];
        const filterValue = filters[filterKey];

        // Obtener valor del producto (puede ser campo directo o metadata)
        let productValue = null;
        if (fieldId === 'margen_utilidad') {
          const precioVenta = producto.precio_venta || 0;
          const precioCompra = producto.precio_compra || 0;
          productValue = precioVenta > 0 ? ((precioVenta - precioCompra) / precioVenta) * 100 : 0;
        } else if (fieldId === 'alta_utilidad') {
          const precioVenta = producto.precio_venta || 0;
          const precioCompra = producto.precio_compra || 0;
          productValue = precioVenta > 0 ? ((precioVenta - precioCompra) / precioVenta) * 100 : 0;
        } else {
          // Intentar obtener del producto directo
          productValue = producto[fieldId];

          // Si no existe, buscar en metadata
          if (productValue === undefined && producto.metadata) {
            productValue = producto.metadata[fieldId];
          }
        }

        // Aplicar filtro según tipo
        if (filterType === 'multi') {
          // Selección múltiple - el producto debe estar en la lista
          if (!Array.isArray(filterValue) || filterValue.length === 0) continue;
          const incluyeSinCat = filterValue.includes('__sin_categoria__');
          const estaVacio = productValue === null || productValue === undefined || productValue === '';
          const valoresCat = filterValue.filter(v => v !== '__sin_categoria__');
          const coincidenCat = valoresCat.includes(productValue);
          if (!incluyeSinCat && !coincidenCat) return false;
          if (incluyeSinCat && !estaVacio && !coincidenCat) return false;
        } else if (filterType === 'value') {
          if (fieldId === 'created_at' || fieldId === 'fecha_vencimiento') {
            // Filtros de fecha con opciones rápidas
            if (fieldId === 'fecha_vencimiento' && filterValue === 'proximo') {
              if (!productValue) return false;
              const fechaProducto = new Date(productValue);
              const hoy = new Date();
              hoy.setHours(0, 0, 0, 0);
              const limite = new Date(hoy);
              limite.setDate(limite.getDate() + 7);
              limite.setHours(23, 59, 59, 999);
              if (fechaProducto < hoy || fechaProducto > limite) return false;
            } else {
              const fechaDesde = getFechaDesde(filterValue);
              if (fechaDesde && productValue) {
                const fechaProducto = new Date(productValue);
                if (fechaProducto < fechaDesde) return false;
              }
            }
          } else if (typeof filterValue === 'string') {
            // Búsqueda de texto (contains)
            const searchValue = filterValue.toLowerCase();
            const productStr = String(productValue || '').toLowerCase();
            if (!productStr.includes(searchValue)) return false;
          } else {
            // Comparación exacta
            if (productValue !== filterValue) return false;
          }
        } else if (filterType === 'min') {
          // Filtro de rango mínimo
          if (fieldId === 'created_at' || fieldId === 'fecha_vencimiento') {
            if (productValue && new Date(productValue) < new Date(filterValue)) return false;
          } else {
            const numValue = Number(productValue || 0);
            const numFilter = Number(filterValue);
            if (numValue < numFilter) return false;
          }
        } else if (filterType === 'max') {
          // Filtro de rango máximo
          if (fieldId === 'created_at' || fieldId === 'fecha_vencimiento') {
            if (productValue && new Date(productValue) > new Date(filterValue)) return false;
          } else {
            const numValue = Number(productValue || 0);
            const numFilter = Number(filterValue);
            if (numValue > numFilter) return false;
          }
        } else if (filterType === 'condition') {
          // Condiciones especiales
          if (fieldId === 'stock') {
            const stock = Number(productValue || 0);
            const umbralProducto = getUmbralProducto(producto);
            if (filterValue === 'bajo' && (stock <= 0 || stock > umbralProducto || stock === null)) return false;
            if (filterValue === 'sin' && stock !== 0) return false;
            if (filterValue === 'con' && (stock === 0 || stock === null)) return false;
          } else if (fieldId === 'alta_utilidad') {
            if (productValue <= 50) return false;
          }
        }
      }

      return true;
    });
    
    // Si el plan tiene límite de productos (free o degradado), mostrar solo hasta el límite
    if (isDegraded || isFreePlan) {
      const maxProducts = getLimit('maxProducts');
      if (maxProducts !== null && maxProducts !== undefined) {
        return result.slice(0, maxProducts);
      }
    }
    
    return result;
  }, [productos, query, filters, productoIdFiltro, productosSearchIndex, isDegraded, isFreePlan, getLimit, getUmbralProducto]);

  const sortedProducts = useMemo(() => {
    const lista = [...filteredProducts];
    const getDateValue = (value) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isFinite(time) ? time : 0;
    };
    switch (ordenProductos) {
      case 'name_asc':
        lista.sort((a, b) => (a?.nombre || '').localeCompare(b?.nombre || '', 'es'));
        break;
      case 'name_desc':
        lista.sort((a, b) => (b?.nombre || '').localeCompare(a?.nombre || '', 'es'));
        break;
      case 'created_asc':
        lista.sort((a, b) => getDateValue(a?.created_at) - getDateValue(b?.created_at));
        break;
      case 'created_desc':
        lista.sort((a, b) => getDateValue(b?.created_at) - getDateValue(a?.created_at));
        break;
      case 'stock_asc':
        lista.sort((a, b) => (Number(a?.stock ?? 0) || 0) - (Number(b?.stock ?? 0) || 0));
        break;
      case 'stock_desc':
        lista.sort((a, b) => (Number(b?.stock ?? 0) || 0) - (Number(a?.stock ?? 0) || 0));
        break;
      default:
        break;
    }
    return lista;
  }, [filteredProducts, ordenProductos]);

  // --- LÓGICA DE PAGINACIÓN VIRTUAL (SCROLL INFINITO) ---
  const [visibleCount, setVisibleCount] = useState(50);
  const loadingObserverRef = useRef(null);

  // Reiniciar la cantidad visible cuando cambian los filtros, la búsqueda o el orden
  useEffect(() => {
    setVisibleCount(50);
  }, [query, filters, productoIdFiltro, ordenProductos]);

  const handleObserver = useCallback((entries) => {
    const target = entries[0];
    if (target.isIntersecting && visibleCount < sortedProducts.length) {
      setVisibleCount((prev) => Math.min(prev + 100, sortedProducts.length)); // Bloques de 100
    }
  }, [visibleCount, sortedProducts.length]);

  useEffect(() => {
    const option = {
      root: null,
      rootMargin: "800px", // Precarga agresiva
      threshold: 0
    };
    const observer = new IntersectionObserver(handleObserver, option);
    if (loadingObserverRef.current) observer.observe(loadingObserverRef.current);

    return () => observer.disconnect();
  }, [handleObserver]);

  // Tomar solo la rebanada (slice) visible de los productos ordenados
  const visibleProducts = useMemo(() => {
    // Si hay un producto recién modificado, asegurarnos de que esté en la lista visible
    // o al menos que la lista sea coherente
    return sortedProducts.slice(0, visibleCount);
  }, [sortedProducts, visibleCount]);

  // Efecto para limpiar el resaltado después de unos segundos
  useEffect(() => {
    if (lastModifiedId) {
      const timer = setTimeout(() => {
        setLastModifiedId(null);
      }, 5000); // 5 segundos de resaltado
      return () => clearTimeout(timer);
    }
  }, [lastModifiedId]);

  // El Wrapper ahora es un div estándar para máximo rendimiento
  const ItemWrapper = 'div';
  const getItemAnimationProps = (index) => {
    return {}; // Quitar animaciones de delay que pesan en tablets
  };

  // Guardar producto en Supabase (ahora manejado por React Query en AgregarProductoModal)
  const handleAgregarProducto = (nuevo) => {
    if (nuevo?.id) {
      setLastModifiedId(nuevo.id);
      // Opcionalmente mover al inicio si no está ya por el orden created_desc
      setOrdenProductos('created_desc');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Editar producto
  const handleEditarProducto = (producto) => {
    // Check permissions before opening edit modal
    if (userProfile?.role !== 'owner' && userProfile?.role !== 'admin' && !hasPermission('inventario.edit')) {
      toast.error('No tienes permisos para editar productos');
      return;
    }
    
    setProductoSeleccionado(producto);
    setEditarModalOpen(true);
  };

  // Actualizar producto editado (ahora manejado por React Query)
  const handleProductoEditado = (productoEditado) => {
    // React Query invalidará automáticamente la cache, pero forzamos un refetch para que sea inmediato
    refetch();
    setEditarModalOpen(false);
    setProductoSeleccionado(null);
    if (productoEditado?.id) {
      setLastModifiedId(productoEditado.id);
    }
  };

  const idsFiltrados = useMemo(() => filteredProducts.map(p => p.id), [filteredProducts]);
  const todosSeleccionados = idsFiltrados.length > 0 && idsFiltrados.every(id => seleccionados.includes(id));

  const toggleSeleccion = (id) => {
    setSeleccionados(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  };

  const toggleSeleccionarTodos = () => {
    setSeleccionados(prev => {
      if (todosSeleccionados) {
        return prev.filter(id => !idsFiltrados.includes(id));
      }
      const merged = new Set([...prev, ...idsFiltrados]);
      return Array.from(merged);
    });
  };

  const handleEliminarSeleccionados = async () => {
    if (seleccionados.length === 0) {
      toast.error('No hay productos seleccionados');
      return;
    }
    const confirmar = window.confirm(`¿Eliminar ${seleccionados.length} producto(s) seleccionados? Esta acción no se puede deshacer.`);
    if (!confirmar) return;

    setEliminandoSeleccionados(true);
    try {
      const productosAEliminar = productos.filter(p => seleccionados.includes(p.id));

      // Eliminar imágenes primero
      for (const producto of productosAEliminar) {
        if (producto.imagen && !producto.imagen.startsWith('http://') && !producto.imagen.startsWith('https://') && !producto.imagen.startsWith('data:')) {
          await deleteImageFromStorage(producto.imagen);
        }
      }

      // Dividir en lotes de 100 para evitar error 400 con grandes cantidades
      const BATCH_SIZE = 100;
      const totalBatches = Math.ceil(seleccionados.length / BATCH_SIZE);

      for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = start + BATCH_SIZE;
        const batch = seleccionados.slice(start, end);

        const { error: deleteError } = await supabase
          .from('productos')
          .delete()
          .in('id', batch);

        if (deleteError) {
          throw deleteError;
        }

        // Mostrar progreso si hay múltiples lotes
        if (totalBatches > 1) {
          toast.success(`Eliminando... ${Math.min(end, seleccionados.length)}/${seleccionados.length}`, {
            id: 'delete-progress',
            duration: 1000
          });
        }
      }

      setSeleccionados([]);
      toast.success(`${seleccionados.length} productos eliminados correctamente`);
      refetch();
    } catch (err) {
      console.error('Error eliminando seleccionados:', err);
      toast.error('No se pudieron eliminar los productos seleccionados');
    } finally {
      setEliminandoSeleccionados(false);
    }
  };

  const abrirEdicionMasiva = () => {
    setEdicionMasivaOpen(true);
  };

  // Eliminar producto
  const handleEliminarProducto = async (producto) => {
    if (!user) return;

    const confirmar = window.confirm(`¿Estás seguro de que quieres eliminar "${producto.nombre}"?`);
    if (!confirmar) return;

    try {
      // Eliminar imagen del storage si existe
      if (producto.imagen) {
        const imageDeleted = await deleteImageFromStorage(producto.imagen);
        if (!imageDeleted) {
        }
      }

      // Usar React Query mutation para eliminar
      eliminarProductoMutation.mutate({
        id: producto.id,
        organizationId: organization?.id
      });
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar el producto');
    }
  };

  const handleProductosImportados = async () => {
    // React Query invalidará automáticamente la cache y recargará los productos
    // Forzar actualización inmediata
    await refetch();
  };

  const exportarInventarioExcel = () => {
    if (!filteredProducts || filteredProducts.length === 0) {
      toast.error('No hay productos para exportar');
      return;
    }

    const formatearVariacionesConfig = (variacionesConfig) => {
      if (!Array.isArray(variacionesConfig) || variacionesConfig.length === 0) {
        return {
          nombres: '',
          tipos: '',
          obligatorios: '',
          seleccionMultiple: '',
          maximos: '',
          opciones: ''
        };
      }

      const nombres = [];
      const tipos = [];
      const obligatorios = [];
      const seleccionMultiple = [];
      const maximos = [];
      const opciones = [];

      variacionesConfig.forEach((variacion) => {
        nombres.push(variacion?.nombre || variacion?.id || 'Variacion');
        tipos.push(variacion?.tipo || '');
        obligatorios.push(variacion?.requerido ? 'Si' : 'No');
        seleccionMultiple.push(variacion?.seleccion_multiple ? 'Si' : 'No');
        maximos.push(variacion?.max_selecciones ? String(variacion.max_selecciones) : '');

        const opcionesLista = Array.isArray(variacion?.opciones)
          ? variacion.opciones
            .map((op) => (typeof op === 'string' ? op : op?.nombre || op?.valor || op?.label || ''))
            .filter(Boolean)
          : [];
        opciones.push(opcionesLista.join(', '));
      });

      return {
        nombres: nombres.join(' || '),
        tipos: tipos.join(' || '),
        obligatorios: obligatorios.join(' || '),
        seleccionMultiple: seleccionMultiple.join(' || '),
        maximos: maximos.join(' || '),
        opciones: opciones.join(' || ')
      };
    };

    const filas = filteredProducts.flatMap((producto) => {
      const metadata = producto.metadata || {};
      const variacionesConfig = metadata.variaciones_config || null;
      const variacionesFormateadas = formatearVariacionesConfig(variacionesConfig);
      const variantesProducto = producto.variantes || [];

      const baseRow = {
        'Producto ID': producto.id || '',
        'Codigo': producto.codigo || '',
        'Nombre': producto.nombre || '',
        'Tipo': producto.tipo || '',
        'Precio Compra': producto.precio_compra ?? '',
        'Precio Venta': producto.precio_venta ?? '',
        'Stock': producto.stock ?? '',
        'Fecha Vencimiento': producto.fecha_vencimiento || '',
        'Categoria': metadata.categoria || '',
        'Descripcion': metadata.descripcion || '',
        'Marca': metadata.marca || '',
        'Modelo': metadata.modelo || '',
        'Color': metadata.color || '',
        'Talla': metadata.talla || '',
        'Material': metadata.material || '',
        'Peso': metadata.peso || '',
        'Unidad Peso': metadata.unidad_peso || '',
        'Dimensiones': metadata.dimensiones || '',
        'Duracion': metadata.duracion || '',
        'Ingredientes': metadata.ingredientes || '',
        'Alergenos': metadata.alergenos || '',
        'Calorias': metadata.calorias || '',
        'Porcion': metadata.porcion || '',
        'Variaciones': metadata.variaciones || '',
        'Variacion Nombre': variacionesFormateadas.nombres,
        'Variacion Tipo': variacionesFormateadas.tipos,
        'Variacion Obligatorio': variacionesFormateadas.obligatorios,
        'Variacion Seleccion Multiple': variacionesFormateadas.seleccionMultiple,
        'Variacion Maximo Selecciones': variacionesFormateadas.maximos,
        'Variacion Opciones': variacionesFormateadas.opciones,
        'Permite Toppings': metadata.permite_toppings ? 'Si' : 'No',
        'Imagen': producto.imagen || '',
        'Creado': producto.created_at ? new Date(producto.created_at).toLocaleString('es-CO') : '',
        'Actualizado': producto.updated_at ? new Date(producto.updated_at).toLocaleString('es-CO') : ''
      };

      if (!variantesProducto.length) {
        return [{
          ...baseRow,
          'Variante Nombre': '',
          'Variante Codigo': '',
          'Variante Stock': ''
        }];
      }

      return variantesProducto.map((vari) => ({
        ...baseRow,
        'Variante Nombre': vari.nombre || '',
        'Variante Codigo': vari.codigo || '',
        'Variante Stock': vari.stock ?? ''
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(filas);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');
    const fechaArchivo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(workbook, `inventario_detallado_${fechaArchivo}.xlsx`);
  };

  return (
    <div className="inventario-main">
      {cargando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <LottieLoader size="medium" message="Cargando inventario..." />
        </div>
      ) : (
        <>
          {/* Banner de límite de plan */}
          {(isDegraded || isFreePlan) && (() => {
            const maxProducts = getLimit('maxProducts');
            if (maxProducts !== null && maxProducts !== undefined && productos.length > maxProducts) {
              return (
                <div style={{
                  background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                  border: '1px solid #f59e0b',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.875rem',
                  color: '#92400e'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <span>
                    Tu plan <strong>Gratis</strong> permite hasta <strong>{maxProducts} productos</strong>. 
                    Tienes <strong>{productos.length} productos</strong> en total, pero solo se muestran los primeros <strong>{maxProducts}</strong>.
                    {' '}<button
                      onClick={() => window.location.href = '/pricing'}
                      style={{ background: 'none', border: 'none', color: '#d97706', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >Actualiza tu plan</button> para verlos todos.
                  </span>
                </div>
              );
            }
            // Si NO supera el límite pero está cerca, mostrar advertencia suave
            if (maxProducts !== null && maxProducts !== undefined && productos.length >= maxProducts) {
              return (
                <div style={{
                  background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
                  border: '1px solid #ef4444',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.875rem',
                  color: '#991b1b'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>🔒</span>
                  <span>
                    Has alcanzado el límite de <strong>{maxProducts} productos</strong> del plan Gratis. 
                    No puedes agregar más productos.{' '}
                    <button
                      onClick={() => window.location.href = '/pricing'}
                      style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                    >Actualiza tu plan</button> para continuar creciendo.
                  </span>
                </div>
              );
            }
            return null;
          })()}

          {/* Métricas del inventario - se actualizan dinámicamente según filtros */}
          {productos.length > 0 && (
            <InventarioStats
              productos={filteredProducts}
              totalProductosOverride={null}
            />
          )}

          {/* Header con búsqueda y acciones - Separados para mejor control responsive */}
          <div className="inventario-header-wrapper">
            <div className="inventario-actions">
              <div className="inventario-actions-left">
                {(hasPermission('inventario.create') || ['owner', 'admin'].includes(userProfile?.role)) && (
                  <>
                    <FeatureGuard
                      action="createProduct"
                      fallback={
                        <button 
                          className="inventario-btn inventario-btn-primary" 
                          onClick={() => toast.error('Has alcanzado el límite de productos de tu plan. Actualiza tu cuenta para seguir creciendo.')}
                          style={{ opacity: 0.7, cursor: 'not-allowed' }}
                          title="🔒 Límite de productos alcanzado"
                        >
                          Nuevo producto
                        </button>
                      }
                    >
                      <button className="inventario-btn inventario-btn-primary" onClick={() => setModalOpen(true)}>Nuevo producto</button>
                    </FeatureGuard>
                    
                    <FeatureGuard
                      action="createProduct"
                      fallback={
                        <button
                          className="inventario-btn inventario-btn-masivo"
                          onClick={() => toast.error('Has alcanzado el límite de productos de tu plan. Actualiza tu cuenta.')}
                          style={{ opacity: 0.7, cursor: 'not-allowed' }}
                          title="🔒 Límite de productos alcanzado"
                        >
                          Creación Masiva
                        </button>
                      }
                    >
                      <button
                        className="inventario-btn inventario-btn-masivo"
                        onClick={() => setCreacionMasivaOpen(true)}
                        title="Crea múltiples productos a la vez tipo Excel"
                      >
                        Creación Masiva
                      </button>
                    </FeatureGuard>
                  </>
                )}
                {(hasPermission('inventario.edit') || ['owner', 'admin'].includes(userProfile?.role)) && (
                  <button
                    className="inventario-btn inventario-btn-action"
                    onClick={() => setEntradaInventarioOpen(true)}
                    title="Registrar entrada de inventario"
                  >
                    <PackagePlus size={18} />
                    Entrada Inventario
                  </button>
                )}
                <button
                  className="inventario-btn inventario-btn-action inventario-btn-square"
                  onClick={async () => {
                    setManualSpin(true);
                    await refetch();
                    toast.success('Inventario actualizado');
                    setTimeout(() => setManualSpin(false), 500);
                  }}
                  disabled={isFetching}
                  title="Actualizar inventario"
                >
                  <RefreshCw size={18} className={manualSpin ? 'spin' : ''} />
                </button>
                <button
                  className="inventario-btn inventario-btn-action inventario-btn-square"
                  onClick={() => setModoLista(m => !m)}
                  title="Cambiar vista"
                >
                  {modoLista ? <Grid3X3 size={18} /> : <List size={18} />}
                </button>

                <div className="inventario-btn-icon-wrapper">
                  {seleccionados.length > 0 && <span className="inventario-counter">{seleccionados.length}</span>}
                  <button
                    type="button"
                    className={`inventario-btn inventario-btn-action inventario-btn-square ${todosSeleccionados ? 'active' : ''}`}
                    onClick={toggleSeleccionarTodos}
                    title={todosSeleccionados ? 'Quitar selección' : 'Seleccionar todo'}
                  >
                    <CheckSquare size={18} />
                  </button>
                </div>

                {seleccionados.length > 0 && (
                  <div className="inventario-btn-icon-wrapper">
                    <span className="inventario-counter">{seleccionados.length}</span>
                    <button
                      className="inventario-btn inventario-btn-action inventario-btn-square"
                      onClick={() => {
                        const seleccionadosProds = productos.filter(p => seleccionados.includes(p.id));
                        setProductosParaCodigo(seleccionadosProds);
                        setBarcodesModalOpen(true);
                      }}
                      title="Generar e imprimir códigos de barras para los productos seleccionados"
                    >
                      <Barcode size={18} />
                    </button>
                  </div>
                )}

                {seleccionados.length > 0 && (hasPermission('inventario.edit') || ['owner', 'admin'].includes(userProfile?.role)) && (
                  <div className="inventario-btn-icon-wrapper">
                    <span className="inventario-counter">{seleccionados.length}</span>
                    <button
                      className="inventario-btn inventario-btn-action inventario-btn-square"
                      onClick={abrirEdicionMasiva}
                      title="Editar en masa los productos seleccionados"
                    >
                      <Edit3 size={18} />
                    </button>
                  </div>
                )}

                {seleccionados.length > 0 && (hasPermission('inventario.delete') || ['owner', 'admin'].includes(userProfile?.role)) && (
                  <div className="inventario-btn-icon-wrapper">
                    <span className="inventario-counter">{seleccionados.length}</span>
                    <button
                      className="inventario-btn inventario-btn-action inventario-btn-danger inventario-btn-square"
                      onClick={handleEliminarSeleccionados}
                      disabled={eliminandoSeleccionados}
                      title="Eliminar productos seleccionados"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>

              <div className="inventario-actions-right">
                {(hasPermission('inventario.import') || ['owner', 'admin'].includes(userProfile?.role)) && (
                  <FeatureGuard
                  feature="importCSV"
                  recommendedPlan="professional"
                  showInline={false}
                  fallback={
                    <button
                      className="inventario-btn inventario-btn-action"
                      onClick={() => toast.error('La importación CSV está disponible en el plan Estándar')}
                      style={{ opacity: 0.5, cursor: 'not-allowed' }}
                      title="🔒 Plan Estándar"
                    >
                      <Upload size={18} />
                      <span>Importar</span>
                    </button>
                  }
                >
                  <button className="inventario-btn inventario-btn-action" onClick={() => setCsvModalOpen(true)}>
                    <Upload size={18} />
                    <span>Importar</span>
                  </button>
                </FeatureGuard>
                )}

                {/* Exportar no tiene un id de permiso en INVENTARIO, usaremos stats.export o si es owner/admin */}
                {(hasPermission('stats.export') || ['owner', 'admin'].includes(userProfile?.role)) && (
                <FeatureGuard
                  feature="exportData"
                  recommendedPlan="professional"
                  showInline={false}
                  fallback={
                    <button
                      className="inventario-btn inventario-btn-action"
                      onClick={() => toast.error('La exportación de datos está disponible en el plan Estándar')}
                      style={{ opacity: 0.5, cursor: 'not-allowed' }}
                      title="🔒 Plan Estándar"
                    >
                      <Download size={18} />
                      Exportar
                    </button>
                  }
                >
                  <button className="inventario-btn inventario-btn-action" onClick={exportarInventarioExcel}>
                    <Download size={18} />
                    Exportar
                  </button>
                </FeatureGuard>
                )}
              </div>
            </div>
            <div className="inventario-search-row">
              <div className="search-input-wrapper compact" style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                <Search size={16} className="inventario-search-icon-outside" />
                <input
                  ref={combinedSearchInputRef}
                  className="inventario-search"
                  placeholder="Buscar..."
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    handleBarcodeInputChange(e);
                  }}
                  onKeyDown={handleBarcodeKeyDown}
                />
                {query ? (
                  <button
                    className="clear-search-btn"
                    onClick={() => {
                      setQuery('');
                      if (combinedSearchInputRef.current) {
                        combinedSearchInputRef.current.focus();
                      }
                    }}
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <button
                    className="camera-scan-btn"
                    onClick={() => setCameraScannerOpen(true)}
                    title="Escanear con cámara"
                    type="button"
                  >
                    <Camera size={16} />
                  </button>
                )}
              </div>



              <div className="inventario-quick-filters">
                <SingleSelectFilter
                  compact={true}
                  label="Ordenar"
                  icon={ArrowUpDown}
                  options={[
                    { value: 'created_desc', label: 'Más recientes' },
                    { value: 'created_asc', label: 'Más antiguos' },
                    { value: 'name_asc', label: 'Nombre A-Z' },
                    { value: 'name_desc', label: 'Nombre Z-A' },
                    { value: 'stock_desc', label: 'Stock mayor' },
                    { value: 'stock_asc', label: 'Stock menor' }
                  ]}
                  value={ordenProductos}
                  onChange={setOrdenProductos}
                />
                <MultiSelectFilter
                  label="Categoría"
                  icon={Layers}
                  options={[
                    { value: '__sin_categoria__', label: 'Sin categoría' },
                    ...[...new Set(productos.map(p => p.metadata?.categoria).filter(Boolean))].sort()
                  ]}
                  selectedValues={filters.categoria_multi || []}
                  onToggle={(val) => {
                    setFilters(prev => {
                      const current = prev.categoria_multi || [];
                      const next = current.includes(val)
                        ? current.filter(v => v !== val)
                        : [...current, val];
                      return { ...prev, categoria_multi: next.length > 0 ? next : undefined };
                    });
                  }}
                />

                <MultiSelectFilter
                  label="Stock"
                  icon={Package}
                  options={[
                    { value: 'bajo', label: 'Stock Bajo' },
                    { value: 'sin', label: 'Sin Stock' },
                    { value: 'con', label: 'Con Stock' }
                  ]}
                  selectedValues={filters.stock_condition ? [filters.stock_condition] : []}
                  onToggle={(val) => {
                    setFilters(prev => {
                      const next = { ...prev };
                      if (next.stock_condition === val) delete next.stock_condition;
                      else next.stock_condition = val;
                      return next;
                    });
                  }}
                />

                <MultiSelectFilter
                  label="Tipo"
                  icon={Tag}
                  options={[
                    { value: 'fisico', label: 'Físico' },
                    { value: 'servicio', label: 'Servicio' },
                    { value: 'comida', label: 'Comida' },
                    { value: 'accesorio', label: 'Accesorio' }
                  ]}
                  selectedValues={filters.tipo_multi || []}
                  onToggle={(val) => {
                    setFilters(prev => {
                      const current = prev.tipo_multi || [];
                      const next = current.includes(val)
                        ? current.filter(v => v !== val)
                        : [...current, val];
                      return { ...prev, tipo_multi: next.length > 0 ? next : undefined };
                    });
                  }}
                />

                <div className="inventario-advanced-filters-wrapper" ref={advancedFiltersRef}>
                  <button
                    className={`inventario-btn-more-filters ${showAdvancedFilters ? 'active' : ''} ${Object.keys(filters).length > 0 ? 'has-active' : ''}`}
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    title="Más filtros"
                    style={{ width: 'auto', padding: '0 12px', gap: '8px', position: 'relative' }}
                  >
                    <SlidersHorizontal size={20} strokeWidth={2.5} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Más Filtros</span>
                    {Object.keys(filters).length > 0 && <span className="filter-active-indicator" />}
                  </button>

                  <AnimatePresence>
                    {showAdvancedFilters && (
                      <InventarioFilters
                        productos={productos}
                        onFilterChange={setFilters}
                        filters={filters}
                        onClose={() => setShowAdvancedFilters(false)}
                      />
                    )}
                  </AnimatePresence>
                </div>

                {(query || Object.keys(filters).length > 0) && (
                  <button
                    className="inventario-clear-btn-final-fix"
                    onClick={() => { setQuery(''); setFilters({}); }}
                    title="Limpiar todos los filtros"
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Contenido de productos */}
          <div className="inventario-content">
            {sortedProducts.length === 0 ? (
              <div className="sin-resultados-busqueda">
                <Search size={48} />
                <h3>No se encontraron productos</h3>
                <p>Intenta con otros términos de búsqueda o elimina los filtros aplicados</p>
                <button onClick={() => { setQuery(''); setFilters({}); }}>
                  Limpiar Filtros y Búsqueda
                </button>
              </div>
            ) : (
              <>
                <div className={modoLista ? "inventario-lista" : "inventario-grid"}>
                  {visibleProducts.map((prod, index) => (
                    <ItemWrapper
                      key={prod.id}
                      {...getItemAnimationProps(index)}
                      className={`${modoLista ? "inventario-lista-item" : "inventario-card"} ${lastModifiedId === prod.id ? 'highlight-new' : ''}`}
                      onClick={() => handleEditarProducto(prod)}
                    >
                      <div className="inventario-select-checkbox" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={seleccionados.includes(prod.id)}
                          onChange={() => toggleSeleccion(prod.id)}
                        />
                      </div>
                      <OptimizedProductImage
                        imagePath={prod.imagen}
                        alt={prod.nombre}
                        className={modoLista ? "inventario-img-lista" : "inventario-img"}
                        onError={(e) => {
                        }}
                      />
                      <div className={modoLista ? "inventario-lista-info" : "inventario-info"}>

                        <div className="inventario-nombre" title={prod.nombre}>{prod.nombre}</div>
                        {(isJewelryBusiness || prod.metadata?.jewelry_price_mode) && (
                          <div style={{ display: 'flex', gap: '0.2rem', marginBottom: '0.2rem', flexWrap: 'wrap', justifyContent: modoLista ? 'flex-start' : 'center' }}>
                            {prod.metadata?.peso && (
                              <span style={{
                                backgroundColor: '#f3f4f6',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                color: '#374151',
                                border: '1px solid #e5e7eb',
                                fontWeight: 500
                              }}>
                                {prod.metadata.peso} {organization?.jewelry_weight_unit || 'g'}
                              </span>
                            )}

                            {prod.metadata?.jewelry_material_type && prod.metadata.jewelry_material_type !== 'na' && (
                              <span style={{
                                backgroundColor: prod.metadata.jewelry_material_type === 'local' ? '#FFFFFF' : '#fff7ed',
                                color: prod.metadata.jewelry_material_type === 'local' ? '#02A5E0' : '#ea580c',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                border: `1px solid ${prod.metadata.jewelry_material_type === 'local' ? '#bfdbfe' : '#ffedd5'}`,
                                fontWeight: 600
                              }}>
                                {prod.metadata.jewelry_material_type === 'local' ? 'Nac' : 'Int'}
                              </span>
                            )}
                          </div>
                        )}
                        <div className={modoLista ? "inventario-lista-precios" : ""} style={!modoLista ? { display: 'flex', gap: '0.8rem', justifyContent: 'center', marginBottom: 2 } : {}}>
                          <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>Compra: {prod.precio_compra?.toLocaleString('es-CO')}</span>
                          <span style={{ color: 'var(--accent-success)', fontWeight: 700 }}>Venta: {getCurrentVentaPrice(prod).toLocaleString('es-CO')}</span>
                        </div>
                        <div className="inventario-stock">Stock: {prod.stock !== null && prod.stock !== undefined ? parseFloat(prod.stock).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 4 }) : '0'}</div>
                      </div>
                      <div className={modoLista ? "inventario-lista-actions" : "inventario-card-actions"} onClick={(e) => e.stopPropagation()}>

                        <button
                          className="inventario-btn inventario-btn-outline historial"
                          onClick={() => {
                            setMovimientosProducto(prod);
                            setMovimientosVarianteId(null);
                            setMovimientosModalOpen(true);
                          }}
                          title="Ver historial de movimientos"
                        >
                          <History size={16} />
                          {modoLista && <span>Historial</span>}
                        </button>
                        {(hasPermission('inventario.edit') || ['owner', 'admin'].includes(userProfile?.role)) && (
                          <button
                            className="inventario-btn inventario-btn-outline editar"
                            onClick={() => handleEditarProducto(prod)}
                            title="Editar producto"
                          >
                            <Edit3 size={16} />
                            {modoLista && <span>Editar</span>}
                          </button>
                        )}
                        {(hasPermission('inventario.delete') || ['owner', 'admin'].includes(userProfile?.role)) && (
                          <button
                            className="inventario-btn inventario-btn-outline eliminar"
                            onClick={() => handleEliminarProducto(prod)}
                            title="Eliminar producto"
                          >
                            <Trash2 size={16} />
                            {modoLista && <span>Eliminar</span>}
                          </button>
                        )}
                      </div>
                    </ItemWrapper>
                  ))}
                  {/* Div centinela para el Infinite Scroll */}
                  {visibleCount < sortedProducts.length && (
                    <div ref={loadingObserverRef} style={{ height: '50px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1rem', width: '100%', gridColumn: '1 / -1' }}>
                      <div className="lottie-loader-container" style={{ width: '40px', height: '40px' }}>
                        <LottieLoader />
                      </div>
                    </div>
                  )}
                </div>

                {/* Div centinela para el Infinite Scroll */}
                {/* {visibleCount < sortedProducts.length && (
                  <div ref={loadingObserverRef} style={{ height: '50px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '1rem', width: '100%' }}>
                    <div className="lottie-loader-container" style={{ width: '40px', height: '40px' }}>
                      <LottieLoader />
                    </div>
                  </div>
                )} */}
              </>
            )}
            {/* Panel lateral eliminado por solicitud */}
          </div>
        </>
      )}
      <AgregarProductoModalV2 open={modalOpen} onClose={() => setModalOpen(false)} onProductoAgregado={handleAgregarProducto} moneda={moneda} />
      <CreacionMasivaModal
        open={creacionMasivaOpen}
        onClose={() => setCreacionMasivaOpen(false)}
        onProductosCreados={() => {
          refetch();
          setCreacionMasivaOpen(false);
        }}
      />
      <EditarProductoModalV2
        open={editarModalOpen}
        onClose={() => {
          setEditarModalOpen(false);
          setProductoSeleccionado(null);
          setVarianteSeleccionadaId(null);
        }}
        producto={productoSeleccionado}
        varianteActivaId={varianteSeleccionadaId}
        soloEditarVariantes={!!varianteSeleccionadaId}
        onProductoEditado={handleProductoEditado}
      />
      <ImportarProductosCSV
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onProductosImportados={handleProductosImportados}
      />
      <EntradaInventarioModal
        open={entradaInventarioOpen}
        onClose={() => {
          setEntradaInventarioOpen(false);
          // Refrescar productos después de actualizar inventario
          if (productos && productos.length > 0) {
            // Los productos se actualizarán automáticamente por React Query
          }
        }}
      />

      {/* MODAL DE EDICIÓN MASIVA */}
      <EdicionMasivaModal
        open={edicionMasivaOpen}
        onClose={() => setEdicionMasivaOpen(false)}
        productosSeleccionados={productos.filter(p => seleccionados.includes(p.id))}
        categoriasDisponibles={[...new Set(productos.map(p => p.metadata?.categoria).filter(Boolean))].sort()}
        onProductosActualizados={() => {
          setSeleccionados([]);
          refetch();
        }}
      />

      <MovimientosStockModal 
        open={movimientosModalOpen}
        onClose={() => setMovimientosModalOpen(false)}
        producto={movimientosProducto}
        varianteId={movimientosVarianteId}
      />

      <ImpresionCodigosBarrasModal
        open={barcodesModalOpen}
        onClose={() => {
          setBarcodesModalOpen(false);
          setProductosParaCodigo([]);
        }}
        productosSeleccionados={productosParaCodigo}
        moneda={moneda}
      />

      {/* Escáner de cámara */}
      {cameraScannerOpen && (
        <CameraScanner
          title="Escanear código de barras"
          onScan={(codigo) => {
            setQuery(codigo);
            setCameraScannerOpen(false);
            // También disparar búsqueda por código directo
            handleBarcodeScanned(codigo);
          }}
          onClose={() => setCameraScannerOpen(false)}
        />
      )}
    </div>
  );
};

export default Inventario;
