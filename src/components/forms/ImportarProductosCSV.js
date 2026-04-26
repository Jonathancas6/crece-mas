import React, { useState, useEffect } from 'react';
import { supabase } from '../../services/api/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx';
import { compressProductImage } from '../../services/storage/imageCompression';
import { ClipboardList } from 'lucide-react';
import './ImportarProductosCSV.css';

const ImportarProductosCSV = ({ open, onProductosImportados, onClose }) => {
  const { userProfile, organization } = useAuth();
  const isJewelryBusiness = organization?.business_type === 'jewelry_metals';
  const [archivo, setArchivo] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [inconsistencias, setInconsistencias] = useState([]);
  const [modoRevision, setModoRevision] = useState(false);
  const [productosRevision, setProductosRevision] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [sortConfig, setSortConfig] = useState({ key: '__rowNumber', direction: 'asc' });
  const [variantesRevision, setVariantesRevision] = useState([]);
  const [seleccionadosRevision, setSeleccionadosRevision] = useState([]);

  const parseNumberFlexible = (value) => {
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

  const parseWeightValue = (value) => {
    if (value === '' || value === null || value === undefined) return 0;
    const normalized = String(value).trim().replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalizeJewelryPriceMode = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'fixed';
    if (['variable', 'var', 'peso', 'por_peso', 'porpeso', 'peso_variable'].includes(raw)) return 'variable';
    if (['fixed', 'fijo', 'manual'].includes(raw)) return 'fixed';
    return '';
  };

  const normalizeJewelryMaterialType = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'na';
    if (['local', 'nacional'].includes(raw)) return 'local';
    if (['international', 'internacional', 'global'].includes(raw)) return 'international';
    if (['na', 'n/a', 'none', 'ninguno'].includes(raw)) return 'na';
    return '';
  };

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

  const getGoldPriceValue = (materialType) => {
    if (materialType === 'local') {
      return parseNumberFlexible(organization?.jewelry_gold_price_local);
    }
    if (materialType === 'international') {
      return parseNumberFlexible(organization?.jewelry_gold_price_global);
    }
    return parseNumberFlexible(organization?.jewelry_gold_price_global);
  };

  const getMinMarginValue = (materialType) => {
    if (materialType === 'local') {
      return parseNumberFlexible(organization?.jewelry_min_margin_local);
    }
    if (materialType === 'international') {
      return parseNumberFlexible(organization?.jewelry_min_margin_international);
    }
    return parseNumberFlexible(organization?.jewelry_min_margin);
  };

  const calcularPrecioVentaJoyeria = ({
    compraPorUnidad,
    peso,
    materialType,
    pureza,
    minMarginOverride
  }) => {
    const goldPriceValue = getGoldPriceValue(materialType);
    const minMarginValue = minMarginOverride > 0 ? minMarginOverride : getMinMarginValue(materialType);
    const diff = goldPriceValue - compraPorUnidad;
    const precioBaseGramo = diff >= minMarginValue ? goldPriceValue : (compraPorUnidad + minMarginValue);
    const aplicaPureza = materialType === 'international';
    const purityFactor = aplicaPureza ? getPurityFactor(pureza) : 1;
    if (!peso || !precioBaseGramo) return 0;
    return Math.round(peso * precioBaseGramo * purityFactor * 100) / 100;
  };

  // Función para procesar imagen desde Excel
  const procesarImagenExcel = async (imagenData, nombreProducto) => {
    if (!imagenData || imagenData === '') {
      return null;
    }

    try {
      // Si es una URL o data URL, guardar directamente sin subir
      if (typeof imagenData === 'string') {
        const imagenTexto = imagenData.trim();
        if (imagenTexto.startsWith('http') || imagenTexto.startsWith('data:')) {
          return imagenTexto;
        }
      }

      // Si es un archivo, procesarlo y subirlo a storage
      let archivoImagen;
      
      if (imagenData instanceof File) {
        // Ya es un archivo
        archivoImagen = imagenData;
      } else {
        console.warn('Tipo de imagen no soportado:', typeof imagenData);
        return null;
      }

      // Validar el nombre del archivo antes de comprimir
      const { validateFilename, generateStoragePath } = await import('../../utils/fileUtils');
      const validation = validateFilename(archivoImagen.name);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      // Comprimir la imagen
      const imagenComprimida = await compressProductImage(archivoImagen);
      
      // Subir a Supabase Storage usando organization_id (requerido por RLS)
      const organizationId = userProfile?.organization_id;
      if (!organizationId) {
        console.error('No se encontró organization_id para subir imagen');
        return null;
      }
      const nombreArchivo = generateStoragePath(organizationId, imagenComprimida.name);
      const { error: errorUpload } = await supabase.storage
        .from('productos')
        .upload(nombreArchivo, imagenComprimida);
        
      if (errorUpload) {
        console.error('Error subiendo imagen:', errorUpload);
        return null;
      }
      return nombreArchivo;
      
    } catch (error) {
      console.error('Error procesando imagen:', error);
      return null;
    }
  };

  const handleArchivoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      
      if (!isCSV && !isExcel) {
        setError('Por favor selecciona un archivo CSV o Excel (.xlsx) válido.');
        return;
      }
      
      setArchivo(file);
      setError('');
      setResultado(null);
      setModoRevision(false);
      setProductosRevision([]);
      setFiltroEstado('todos');
      setSortConfig({ key: '__rowNumber', direction: 'asc' });
      setVariantesRevision([]);
      setSeleccionadosRevision([]);
      
      if (isCSV) {
        previewCSV(file);
      } else if (isExcel) {
        previewExcel(file);
      }
    }
  };

  const previewCSV = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').slice(0, 6); // Primeras 5 líneas + header
      setPreview(lines);
    };
    reader.readAsText(file);
  };

  const previewExcel = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Mostrar solo las primeras 6 filas
        const previewLines = jsonData.slice(0, 6).map(row => 
          Array.isArray(row) ? row.join(',') : JSON.stringify(row)
        );
        setPreview(previewLines);
      } catch (error) {
        console.error('Error leyendo archivo Excel:', error);
        setError('Error al leer el archivo Excel. Verifica que el formato sea correcto.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseExcel = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (jsonData.length < 2) {
            throw new Error('El archivo Excel debe tener al menos una fila de datos.');
          }

          // Buscar la fila con los headers (validación ultra flexible)
          let headerRowIndex = -1;
          const requiredHeadersBusqueda = isJewelryBusiness
            ? ['nombre', 'precio_compra', 'peso', 'stock']
            : ['nombre', 'precio_compra', 'precio_venta', 'stock'];
          
          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (Array.isArray(row)) {
              const headers = row.map(h => String(h || '').toLowerCase().trim());
              // Verificar si esta fila contiene al menos 2 de los 4 headers requeridos
              const foundHeaders = requiredHeadersBusqueda.filter(required => 
                headers.some(header => 
                  header.includes(required) || 
                  header.includes(required.replace('_', ' ')) ||
                  header.includes(required.replace('_', '')) ||
                  (header.includes('precio') && required.includes('precio')) ||
                  (header.includes('price') && required.includes('precio'))
                )
              );
              // Aceptar si encuentra al menos 2 de los 4 headers requeridos
              if (foundHeaders.length >= 2) {
                headerRowIndex = i;
                break;
              }
            }
          }

          if (headerRowIndex === -1) {
            // Intentar usar la primera fila como headers si no se encuentra nada
            headerRowIndex = 0;
          }

          const headers = jsonData[headerRowIndex];
          const normalizarHeader = (valor) => String(valor || '')
            .toLowerCase()
            .replace(/\*/g, '')
            .replace(/\b(de|del|la|el|los|las)\b/g, '')
            .replace(/[_\s\-()]/g, '');
          const headersNormalizados = headers.map(normalizarHeader);
          const requiredHeaders = isJewelryBusiness
            ? ['nombre', 'preciocompra', 'peso', 'stock']
            : ['nombre', 'preciocompra', 'precioventa', 'stock'];
          const missingHeaders = requiredHeaders.filter(req => !headersNormalizados.some(h => h.includes(req)));
          if (missingHeaders.length > 0) {
            resolve({
              productos: [],
              inconsistencias: [{
                fila: headerRowIndex + 1,
                producto: 'Encabezados',
                problemas: missingHeaders.map((campo) => ({
                  campo,
                  mensaje: 'Columna requerida no encontrada en el archivo',
                  valor: ''
                }))
              }]
            });
            return;
          }
          const productos = [];
          const inconsistenciasEncontradas = [];
          const variantesEncontradas = [];
          const codigosEnArchivo = new Set();
          const defaultPermiteToppings = organization?.business_type === 'food';
          // Procesar solo las filas después de los headers
          for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            const numeroFila = i + 1; // Fila real en Excel (1-indexed)
            
            if (!Array.isArray(row) || row.length === 0) {
              inconsistenciasEncontradas.push({
                fila: numeroFila,
                producto: 'Fila vacía',
                problemas: [{
                  campo: 'fila',
                  mensaje: 'La fila está vacía o no tiene datos',
                  valor: ''
                }]
              });
              continue;
            }
            
            const producto = {};
            headers.forEach((header, index) => {
              producto[header] = row[index] || '';
            });
            const buscarCampoFlexibleLocal = (obj, posiblesNombres) => {
              // Exacto
              for (const nombre of posiblesNombres) {
                if (obj[nombre] !== undefined && obj[nombre] !== null && String(obj[nombre]).trim() !== '') {
                  return String(obj[nombre]).trim();
                }
              }
              // Normalizado
              const clavesObjeto = Object.keys(obj);
              for (const nombreBuscado of posiblesNombres) {
                const nombreNormalizado = nombreBuscado.toLowerCase().replace(/[_\s-*()]/g, '');
                for (const clave of clavesObjeto) {
                  const claveNormalizada = clave.toLowerCase().replace(/[_\s-*()]/g, '');
                  // Evitar matches parciales cuando la diferencia de longitud es muy grande (ej: 'stock' vs 'stockminimo')
                  const diffLength = Math.abs(claveNormalizada.length - nombreNormalizado.length);
                  const isExact = claveNormalizada === nombreNormalizado;
                  const isPartial = (claveNormalizada.includes(nombreNormalizado) || nombreNormalizado.includes(claveNormalizada)) && diffLength <= 3;
                  
                  if (isExact || isPartial) {
                    const valor = obj[clave];
                    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
                      return String(valor).trim();
                    }
                  }
                }
              }
              return '';
            };

            const buscarCampoExactoLocal = (obj, posiblesNombres) => {
              const clavesObjeto = Object.keys(obj);
              for (const nombreBuscado of posiblesNombres) {
                const nombreNormalizado = nombreBuscado.toLowerCase().replace(/[_\s-*()]/g, '');
                for (const clave of clavesObjeto) {
                  const claveNormalizada = clave.toLowerCase().replace(/[_\s-*()]/g, '');
                  if (claveNormalizada === nombreNormalizado) {
                    const valor = obj[clave];
                    if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
                      return String(valor).trim();
                    }
                  }
                }
              }
              return '';
            };

            const codigoRaw = buscarCampoFlexibleLocal(producto, ['Codigo', 'codigo', 'código', 'codigo_producto', 'sku', 'barcode', 'codigo_barras']) || '';
            const nombre = buscarCampoFlexibleLocal(producto, ['Nombre', 'nombre', 'name', 'producto', 'product']) || '';
            const tipoRaw = buscarCampoExactoLocal(producto, ['Tipo', 'tipo', 'type']) || 'fisico';
            const tipo = tipoRaw.toLowerCase();
            const precioCompra = buscarCampoFlexibleLocal(producto, ['Precio de Compra', 'precio_compra', 'precio de compra', 'costo', 'cost']) || '';
            const precioVenta = buscarCampoFlexibleLocal(producto, ['Precio de Venta', 'precio_venta', 'precio de venta', 'precio', 'price']) || '';
            const stock = buscarCampoFlexibleLocal(producto, ['Stock', 'stock', 'cantidad', 'quantity']) || '';
            const imagen = buscarCampoFlexibleLocal(producto, ['Imagen', 'imagen', 'image', 'imagen_url']) || '';
            const fechaVencimiento = buscarCampoFlexibleLocal(producto, ['Fecha de Vencimiento', 'fecha_vencimiento', 'fecha de vencimiento', 'vencimiento']) || '';
            const varianteNombre = buscarCampoExactoLocal(producto, ['Variante Nombre', 'variante_nombre', 'variante nombre', 'variante']) || '';
            const varianteCodigo = buscarCampoExactoLocal(producto, ['Variante Codigo', 'variante_codigo', 'variante código', 'variante codigo']) || '';
            const varianteStock = buscarCampoExactoLocal(producto, ['Variante Stock', 'variante_stock', 'variante stock']) || '';
            const stockMinimoRaw = buscarCampoFlexibleLocal(producto, [
              'Umbral de stock bajo',
              'stock_minimo',
              'stock minimo',
              'umbral de stock bajo',
              'umbral_stock_bajo'
            ]) || '';
            const permiteToppingsRaw = buscarCampoFlexibleLocal(producto, [
              'Permitir agregar toppings/adicionales',
              'permite_toppings',
              'permitir agregar toppings/adicionales',
              'permite_topping'
            ]) || '';
            const pesoRaw = buscarCampoFlexibleLocal(producto, ['Peso', 'peso', 'peso_gramos', 'weight']) || '';
            const unidadPesoRaw = buscarCampoFlexibleLocal(producto, ['Unidad de Peso', 'unidad_peso', 'unidad de peso', 'unidad peso']) || '';
            const purezaRaw = buscarCampoFlexibleLocal(producto, ['Pureza', 'pureza', 'quilates', 'kilates', 'karat', 'kt']) || '';
            const jewelryPriceModeRaw = buscarCampoFlexibleLocal(producto, [
              'Tipo de precio',
              'jewelry_price_mode',
              'modo_precio_joyeria',
              'tipo de precio',
              'modo_precio'
            ]) || '';
            const jewelryMaterialTypeRaw = buscarCampoFlexibleLocal(producto, [
              'Tipo de material',
              'jewelry_material_type',
              'tipo_material_joyeria',
              'tipo de material',
              'tipo_material'
            ]) || '';
            const jewelryMinMarginRaw = buscarCampoFlexibleLocal(producto, [
              'Margen minimo (%)',
              'jewelry_min_margin',
              'margen_minimo_joyeria',
              'margen mínimo (%)',
              'margen_minimo'
            ]) || '';
            const jewelryStaticModeRaw = buscarCampoFlexibleLocal(producto, [
              'Como definir el precio estatico',
              'jewelry_static_mode',
              'modo_estatico_joyeria',
              'cómo definir el precio estático',
              'modo_precio_fijo'
            ]) || '';
            const jewelryStaticPercentRaw = buscarCampoFlexibleLocal(producto, [
              'Porcentaje sobre compra (%)',
              'jewelry_static_percent',
              'porcentaje_estatico_joyeria',
              'porcentaje sobre compra (%)',
              'porcentaje_margen'
            ]) || '';
            
            // Validar tipo de producto
            const tiposValidos = ['fisico', 'servicio', 'comida', 'accesorio'];
            const tipoValido = tiposValidos.includes(tipo) ? tipo : 'fisico';
            
            // Acumular problemas encontrados
            const problemas = [];
            const agregarProblema = (campo, mensaje, valor) => {
              problemas.push({ campo, mensaje, valor: valor ?? '' });
            };
            
            // Validar campos requeridos según tipo
            if (tipoRaw && !tiposValidos.includes(tipo)) {
              agregarProblema('tipo', `El tipo "${tipoRaw}" no es válido. Usa: ${tiposValidos.join(', ')}`, tipoRaw);
            }
            if (!nombre || nombre.trim() === '') {
              agregarProblema('nombre', 'El nombre del producto es obligatorio', nombre);
            }
            
            const jewelryPriceMode = isJewelryBusiness
              ? normalizeJewelryPriceMode(jewelryPriceModeRaw)
              : 'fixed';
            const jewelryMaterialType = isJewelryBusiness
              ? normalizeJewelryMaterialType(jewelryMaterialTypeRaw)
              : 'na';

            if (isJewelryBusiness && jewelryPriceMode === '') {
              agregarProblema('modo_precio_joyeria', 'El modo de precio debe ser "fixed" o "variable"', jewelryPriceModeRaw);
            }

            if (isJewelryBusiness && jewelryMaterialType === '') {
              agregarProblema('tipo_material_joyeria', 'El tipo de material debe ser "local", "international" o "na"', jewelryMaterialTypeRaw);
            }

            if (!isJewelryBusiness || jewelryPriceMode !== 'variable') {
              if (!precioVenta || precioVenta.toString().trim() === '') {
                agregarProblema('precio_venta', 'El precio de venta es obligatorio', precioVenta);
              }
            }
            
            // Validar campos condicionales según tipo
            if ((tipoValido === 'fisico' || tipoValido === 'comida' || tipoValido === 'accesorio') && (!precioCompra || precioCompra.toString().trim() === '')) {
              agregarProblema('precio_compra', `El precio de compra es obligatorio para productos tipo "${tipoValido}"`, precioCompra);
            }

            if (isJewelryBusiness && (!pesoRaw || String(pesoRaw).trim() === '')) {
              agregarProblema('peso', 'El peso es obligatorio para joyería', pesoRaw);
            }
            
            const tieneVariante = Boolean(
              (varianteNombre && String(varianteNombre).trim() !== '') ||
              (varianteCodigo && String(varianteCodigo).trim() !== '') ||
              (varianteStock && String(varianteStock).trim() !== '')
            );
            
            let tieneAdvertenciaStock = false;
            
            if ((tipoValido === 'fisico' || tipoValido === 'comida') && !tieneVariante && (stock === '' || stock.toString().trim() === '' || parseInt(String(stock || '').trim() || '0', 10) === 0)) {
              tieneAdvertenciaStock = true;
            }

            if (tieneVariante && (!varianteNombre || String(varianteNombre).trim() === '')) {
              agregarProblema('variante_nombre', 'El nombre de la variante es obligatorio cuando se usan variantes', varianteNombre);
            }

            if (tieneVariante && (varianteStock === '' || String(varianteStock).trim() === '' || parseInt(String(varianteStock || '').trim() || '0', 10) === 0)) {
              tieneAdvertenciaStock = true;
            }

            // Convertir números
            const precioCompraNum = parseNumberFlexible(precioCompra);
            const precioVentaNum = parseNumberFlexible(precioVenta);
            const stockNum = parseInt(String(stock || '').trim() || '0', 10);
            const varianteStockNum = parseInt(String(varianteStock || '').trim() || '0', 10);
            const pesoNum = parseWeightValue(pesoRaw);
            const jewelryMinMarginNum = parseNumberFlexible(jewelryMinMarginRaw);
            
            // Validaciones numéricas
            if (precioCompra && precioCompra.toString().trim() !== '' && isNaN(precioCompraNum)) {
              agregarProblema('precio_compra', `El precio de compra "${precioCompra}" no es un número válido`, precioCompra);
            }
            
            if (precioVenta && precioVenta.toString().trim() !== '' && isNaN(precioVentaNum)) {
              agregarProblema('precio_venta', `El precio de venta "${precioVenta}" no es un número válido`, precioVenta);
            }
            
            if (stock && stock.toString().trim() !== '' && isNaN(stockNum)) {
              agregarProblema('stock', `El stock "${stock}" no es un número válido`, stock);
            }

            if (varianteStock && String(varianteStock).trim() !== '' && isNaN(varianteStockNum)) {
              agregarProblema('variante_stock', `El stock de variante "${varianteStock}" no es un número válido`, varianteStock);
            }

            if (isJewelryBusiness && pesoRaw && String(pesoRaw).trim() !== '' && isNaN(pesoNum)) {
              agregarProblema('peso', `El peso "${pesoRaw}" no es un número válido`, pesoRaw);
            }

            if (isJewelryBusiness && jewelryStaticModeRaw) {
              const normalizedStaticMode = String(jewelryStaticModeRaw || '').trim().toLowerCase();
              if (!['fixed', 'fijo', 'percent', 'porcentaje'].includes(normalizedStaticMode)) {
                agregarProblema('jewelry_static_mode', 'El modo fijo debe ser "fixed" o "percent"', jewelryStaticModeRaw);
              }
              if (['percent', 'porcentaje'].includes(normalizedStaticMode)) {
                const percentValue = parseNumberFlexible(jewelryStaticPercentRaw);
                if (!jewelryStaticPercentRaw || isNaN(percentValue)) {
                  agregarProblema('jewelry_static_percent', 'El porcentaje fijo es obligatorio y debe ser numérico', jewelryStaticPercentRaw);
                }
              }
            }
            
            // Validar que no sean negativos
            if (!isNaN(precioCompraNum) && precioCompraNum < 0) {
              agregarProblema('precio_compra', 'El precio de compra no puede ser negativo', precioCompra);
            }
            
            if (!isNaN(precioVentaNum) && precioVentaNum < 0) {
              agregarProblema('precio_venta', 'El precio de venta no puede ser negativo', precioVenta);
            }
            
            if (!isNaN(stockNum) && stockNum < 0) {
              agregarProblema('stock', 'El stock no puede ser negativo', stock);
            }

            if (!isNaN(varianteStockNum) && varianteStockNum < 0) {
              agregarProblema('variante_stock', 'El stock de variante no puede ser negativo', varianteStock);
            }

            if (isJewelryBusiness && !isNaN(pesoNum) && pesoNum < 0) {
              agregarProblema('peso', 'El peso no puede ser negativo', pesoRaw);
            }
            
            // Validar fecha vencimiento (si existe)
            if (fechaVencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(String(fechaVencimiento).trim())) {
              agregarProblema('fecha_vencimiento', 'La fecha de vencimiento debe estar en formato YYYY-MM-DD', fechaVencimiento);
            }

            // Validar códigos duplicados dentro del archivo
            const codigoFinal = (codigoRaw && String(codigoRaw).trim() !== '')
              ? String(codigoRaw).trim()
              : '';

            const esDuplicado = codigoFinal && codigosEnArchivo.has(codigoFinal);

            if (esDuplicado && !tieneVariante) {
              agregarProblema('codigo', `El código "${codigoFinal}" está duplicado en el archivo. Si son variantes del mismo producto, debes llenar las columnas "Variante Nombre" y "Variante Stock".`, codigoFinal);
            }

            // Validar que precio de venta >= precio de compra
            if (!isJewelryBusiness || jewelryPriceMode !== 'variable') {
              const precioCompraComparable = isJewelryBusiness ? (precioCompraNum * (pesoNum || 0)) : precioCompraNum;
              if (!isNaN(precioCompraComparable) && !isNaN(precioVentaNum) && precioVentaNum < precioCompraComparable) {
                agregarProblema('precio_venta', `El precio de venta (${precioVentaNum}) no puede ser menor que el precio de compra (${precioCompraComparable})`, precioVenta);
              }
            }
            
            // Si hay problemas, agregar a inconsistencias y continuar
            if (problemas.length > 0) {
              inconsistenciasEncontradas.push({
                fila: numeroFila,
                producto: nombre || 'Sin nombre',
                problemas: problemas
              });
              continue;
            }
            
            // Usar valores numéricos convertidos
            const pesoFinal = isJewelryBusiness ? pesoNum : 0;
            const compraPorUnidad = isJewelryBusiness ? (precioCompraNum || 0) : (precioCompraNum || 0);
            const precioCompraFinal = Math.round((isJewelryBusiness
              ? (compraPorUnidad * (pesoFinal || 0))
              : (precioCompraNum || 0)) * 100) / 100;
            const precioVentaFinal = Math.round((isJewelryBusiness && jewelryPriceMode === 'variable'
              ? calcularPrecioVentaJoyeria({
                  compraPorUnidad,
                  peso: pesoFinal,
                  materialType: jewelryMaterialType || 'na',
                  pureza: purezaRaw,
                  minMarginOverride: jewelryMinMarginNum
                })
              : (precioVentaNum || 0)) * 100) / 100;
            const stockFinal = stockNum || 0;

            // Crear producto final (solo con columnas que existen en la tabla)
            const productoFinal = {
              nombre: nombre,
              tipo: tipoValido,
              precio_venta: precioVentaFinal,
              organization_id: userProfile?.organization_id,
              user_id: userProfile?.user_id || null,
              codigo: codigoFinal,
              imagen: imagen || null, // Guardamos la imagen original para procesar después
              fecha_vencimiento: fechaVencimiento || null,
              __rowNumber: numeroFila,
              __productKey: codigoFinal || `fila_${numeroFila}`,
              __advertenciaStock: tieneAdvertenciaStock
            };
            
            // Agregar precio_compra solo si tiene valor (obligatorio para fisico, comida, accesorio)
            if (precioCompraFinal > 0 || tipoValido === 'fisico' || tipoValido === 'comida' || tipoValido === 'accesorio') {
              productoFinal.precio_compra = precioCompraFinal || 0;
            }
            
            // Agregar stock solo si tiene valor o es obligatorio
            if (tieneVariante) {
              productoFinal.stock = 0;
            } else if (stockFinal > 0 || tipoValido === 'fisico' || tipoValido === 'comida') {
              productoFinal.stock = stockFinal || 0;
            } else if (tipoValido === 'accesorio' && stockFinal >= 0) {
              productoFinal.stock = stockFinal; // Opcional para accesorio
            }
            
            // Agregar campos opcionales desde metadata si existen
            const metadata = {};
            
            // Mapeo de campos metadata con nombres exactos del CSV primero
            const camposMetadataMap = {
              'peso': ['Peso', 'peso', 'peso_gramos', 'weight'],
              'unidad_peso': ['Unidad de Peso', 'unidad_peso', 'unidad de peso'],
              'categoria': ['Categoria', 'categoria', 'category'],
              'descripcion': ['Descripcion', 'descripcion', 'description'],
              'material': ['Material', 'material'],
              'talla': ['Talla', 'talla', 'size'],
              'color': ['Color', 'color'],
              'marca': ['Marca', 'marca', 'brand'],
              'modelo': ['Modelo', 'modelo', 'model'],
              'dimensiones': ['dimensiones', 'dimensions'],
              'duracion': ['duracion', 'duration'],
              'ingredientes': ['ingredientes', 'ingredients'],
              'alergenos': ['alergenos', 'allergens'],
              'calorias': ['calorias', 'calories'],
              'porcion': ['porcion', 'portion'],
              'variaciones': ['variaciones', 'variations'],
              'pureza': ['Pureza', 'pureza', 'quilates', 'karat']
            };
            
            Object.keys(camposMetadataMap).forEach(campo => {
              const valor = buscarCampoFlexibleLocal(producto, camposMetadataMap[campo]);
              if (valor && valor.toString().trim() !== '') {
                metadata[campo] = valor.toString().trim();
              }
            });

            if (permiteToppingsRaw && permiteToppingsRaw.toString().trim() !== '') {
              const normalized = permiteToppingsRaw.toString().trim().toLowerCase();
              metadata.permite_toppings = ['1', 'true', 'si', 'sí', 'yes', 'y'].includes(normalized);
            } else {
              metadata.permite_toppings = defaultPermiteToppings;
            }

            if (isJewelryBusiness) {
              if (pesoFinal) metadata.peso = pesoFinal;
              const unidadPesoFinal = unidadPesoRaw || organization?.jewelry_weight_unit || 'g';
              if (unidadPesoFinal) metadata.unidad_peso = unidadPesoFinal;
              if (purezaRaw) metadata.pureza = purezaRaw;
              if (compraPorUnidad > 0) metadata.jewelry_compra_por_unidad = compraPorUnidad;
              if (jewelryPriceMode) metadata.jewelry_price_mode = jewelryPriceMode;
              if (jewelryMaterialType) {
                metadata.jewelry_material_type = jewelryMaterialType;
                metadata.jewelry_gold_price_reference = jewelryMaterialType === 'na'
                  ? 'international'
                  : jewelryMaterialType;
              }
              if (jewelryStaticModeRaw) {
                const normalizedStaticMode = String(jewelryStaticModeRaw || '').trim().toLowerCase();
                metadata.jewelry_static_mode = ['percent', 'porcentaje'].includes(normalizedStaticMode) ? 'percent' : 'fixed';
              }
              if (jewelryStaticPercentRaw && !isNaN(parseNumberFlexible(jewelryStaticPercentRaw))) {
                metadata.jewelry_static_percent = parseNumberFlexible(jewelryStaticPercentRaw);
              }
              if (jewelryMinMarginNum > 0) {
                metadata.jewelry_min_margin = jewelryMinMarginNum;
              } else if (jewelryPriceMode === 'variable') {
                const fallbackMargin = getMinMarginValue(jewelryMaterialType || 'na');
                if (fallbackMargin > 0) {
                  metadata.jewelry_min_margin = fallbackMargin;
                }
              }
            }

            if (stockMinimoRaw && stockMinimoRaw.toString().trim() !== '') {
              const umbralProducto = Number(stockMinimoRaw);
              if (Number.isFinite(umbralProducto) && umbralProducto > 0) {
                metadata.umbral_stock_bajo = umbralProducto;
              }
            }
            
            // fecha_vencimiento ya se guarda en columna directa (no metadata)
            
            // Agregar metadata solo si tiene campos
            if (Object.keys(metadata).length > 0) {
              productoFinal.metadata = metadata;
            }
            if (!esDuplicado) {
              productos.push(productoFinal);
              if (codigoFinal) {
                codigosEnArchivo.add(codigoFinal);
              }
            }

            if (tieneVariante) {
              variantesEncontradas.push({
                productKey: codigoFinal || `fila_${numeroFila}`,
                nombre: String(varianteNombre || '').trim(),
                codigo: String(varianteCodigo || '').trim() || null,
                stock: !isNaN(varianteStockNum) ? varianteStockNum : 0,
                fila: numeroFila,
                producto: nombre || codigoFinal
              });
            }
          }
          
          if (productos.length === 0) {
            // Si hay inconsistencias, retornar objeto con inconsistencias sin lanzar error
            if (inconsistenciasEncontradas.length > 0) {
              resolve({ productos: [], inconsistencias: inconsistenciasEncontradas });
              return;
            }
            throw new Error('No se encontraron productos válidos en el archivo.');
          }

          // Procesar imágenes de todos los productos
          const productosConImagenes = await Promise.all(
            productos.map(async (producto) => {
              if (producto.imagen && producto.imagen !== '') {
                try {
                  const imagenProcesada = await procesarImagenExcel(producto.imagen, producto.nombre);
                  return {
                    ...producto,
                    imagen: imagenProcesada
                  };
                } catch (error) {
                  console.error('Error procesando imagen para', producto.nombre, ':', error);
                  // Continuar sin imagen si hay error
                  return {
                    ...producto,
                    imagen: null
                  };
                }
              } else {
                return {
                  ...producto,
                  imagen: null
                };
              }
            })
          );

          resolve({ productos: productosConImagenes, inconsistencias: inconsistenciasEncontradas, variantes: variantesEncontradas });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo Excel.'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Función auxiliar para buscar campos de forma flexible
  const buscarCampoFlexible = (obj, posiblesNombres, debug = false) => {
    // Primero buscar exacto en el objeto
    for (const nombre of posiblesNombres) {
      if (obj[nombre] !== undefined && obj[nombre] !== null && String(obj[nombre]).trim() !== '') {
        if (debug) console.log(`  ✓ Encontrado exacto: ${nombre} = "${obj[nombre]}"`);
        return String(obj[nombre]).trim();
      }
    }
    
    // Luego buscar normalizando las claves del objeto
    const clavesObjeto = Object.keys(obj);
    for (const nombreBuscado of posiblesNombres) {
      const nombreNormalizado = nombreBuscado.toLowerCase().replace(/[_\s-*()]/g, '');
      for (const clave of clavesObjeto) {
        const claveNormalizada = clave.toLowerCase().replace(/[_\s-*()]/g, '');
        // Evitar matches parciales cuando la diferencia de longitud es muy grande (ej: 'stock' vs 'stockminimo')
        const diffLength = Math.abs(claveNormalizada.length - nombreNormalizado.length);
        const isExact = claveNormalizada === nombreNormalizado;
        const isPartial = (claveNormalizada.includes(nombreNormalizado) || nombreNormalizado.includes(claveNormalizada)) && diffLength <= 3;
        
        if (isExact || isPartial) {
          const valor = obj[clave];
          if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
            if (debug) console.log(`  ✓ Encontrado flexible: ${clave} (buscado: ${nombreBuscado}) = "${valor}"`);
            return String(valor).trim();
          }
        }
      }
    }
    
    if (debug) console.log(`  ✗ No encontrado. Buscado: [${posiblesNombres.join(', ')}], Disponible: [${clavesObjeto.join(', ')}]`);
    return '';
  };

  const buscarCampoExacto = (obj, posiblesNombres) => {
    const clavesObjeto = Object.keys(obj);
    for (const nombreBuscado of posiblesNombres) {
      const nombreNormalizado = nombreBuscado.toLowerCase().replace(/[_\s-*()]/g, '');
      for (const clave of clavesObjeto) {
        const claveNormalizada = clave.toLowerCase().replace(/[_\s-*()]/g, '');
        if (claveNormalizada === nombreNormalizado) {
          const valor = obj[clave];
          if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
            return String(valor).trim();
          }
        }
      }
    }
    return '';
  };

  const parseCSV = async (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error('El archivo CSV debe tener al menos una fila de datos.');
    }

    // Buscar la línea con los headers (validación ultra flexible)
    let headerLineIndex = -1;
    const requiredHeadersBusqueda = isJewelryBusiness
      ? ['nombre', 'precio_compra', 'peso', 'stock']
      : ['nombre', 'precio_compra', 'precio_venta', 'stock'];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const headers = line.split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
      // Verificar si esta línea contiene al menos 2 de los 4 headers requeridos
      const foundHeaders = requiredHeadersBusqueda.filter(required => 
        headers.some(header => 
          header.includes(required) || 
          header.includes(required.replace('_', ' ')) ||
          header.includes(required.replace('_', '')) ||
          (header.includes('precio') && required.includes('precio')) ||
          (header.includes('price') && required.includes('precio'))
        )
      );
      // Aceptar si encuentra al menos 2 de los 4 headers requeridos
      if (foundHeaders.length >= 2) {
        headerLineIndex = i;
        break;
      }
    }

    if (headerLineIndex === -1) {
      // Intentar usar la primera línea como headers si no se encuentra nada
      headerLineIndex = 0;
    }

    // Función para parsear CSV correctamente (maneja comas dentro de comillas)
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headersRaw = parseCSVLine(lines[headerLineIndex]);
    // Normalizar headers: convertir a minúsculas y limpiar caracteres especiales
    const headers = headersRaw.map(h => {
      let normalized = h.trim().replace(/"/g, '').toLowerCase();
      // Remover asteriscos
      normalized = normalized.replace(/\*/g, '');
      // Remover paréntesis y su contenido (ej: "(OPCIONAL)")
      normalized = normalized.replace(/\([^)]*\)/g, '');
      // Reemplazar espacios por guiones bajos
      normalized = normalized.replace(/\s+/g, '_');
      // Reemplazar guiones por guiones bajos
      normalized = normalized.replace(/-/g, '_');
      // Reemplazar múltiples guiones bajos por uno solo
      normalized = normalized.replace(/__+/g, '_');
      // Remover guiones bajos al inicio y final
      normalized = normalized.replace(/^_+|_+$/g, '');
      return normalized;
    });

    const normalizarHeader = (valor) => String(valor || '')
      .toLowerCase()
      .replace(/\*/g, '')
      .replace(/\b(de|del|la|el|los|las)\b/g, '')
      .replace(/[_\s\-()]/g, '');
    const headersNormalizados = headers.map(normalizarHeader);
    const requiredHeaders = isJewelryBusiness
      ? ['nombre', 'preciocompra', 'peso', 'stock']
      : ['nombre', 'preciocompra', 'precioventa', 'stock'];
    const missingHeaders = requiredHeaders.filter(req => !headersNormalizados.some(h => h.includes(req)));
    if (missingHeaders.length > 0) {
      return {
        productos: [],
        inconsistencias: [{
          fila: headerLineIndex + 1,
          producto: 'Encabezados',
          problemas: missingHeaders.map((campo) => ({
            campo,
            mensaje: 'Columna requerida no encontrada en el archivo',
            valor: ''
          }))
        }]
      };
    }
    
    // Debug: mostrar headers detectados
    console.log('=== HEADERS DETECTADOS ===');
    console.log('Headers originales:', headersRaw);
    console.log('Headers normalizados:', headers);
    console.log('Mapeo:', headersRaw.map((h, i) => `${h} → ${headers[i]}`).join(', '));
    
    // Crear un mapa de headers normalizados a headers originales para debugging
    const headerMap = {};
    headersRaw.forEach((original, index) => {
      headerMap[headers[index]] = original;
    });

    const productos = [];
    const inconsistenciasEncontradas = [];
    const variantesEncontradas = [];
    const codigosEnArchivo = new Set();
    const defaultPermiteToppings = organization?.business_type === 'food';
    // Procesar solo las líneas después de los headers
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      const numeroFila = i + 1; // Fila real en CSV (1-indexed)
      const line = lines[i].trim();
      
      // Saltar líneas de comentarios o vacías
      if (line.startsWith('#') || line === '') {
        continue;
      }
      
      const values = parseCSVLine(line);
      
      // Ajustar valores si hay menos columnas que headers (llenar con strings vacíos)
      while (values.length < headers.length) {
        values.push('');
      }
      
      // Si hay más valores que headers, truncar (puede haber columnas extra)
      if (values.length > headers.length) {
        values.splice(headers.length);
      }
      
      // Solo reportar error si la diferencia es significativa (más de 2 columnas)
      if (Math.abs(values.length - headers.length) > 2) {
        inconsistenciasEncontradas.push({
          fila: numeroFila,
          producto: 'Fila con columnas incorrectas',
          problemas: [{
            campo: 'fila',
            mensaje: `La fila tiene ${values.length} columnas pero se esperan ${headers.length} columnas. Headers esperados: ${headersRaw.join(', ')}`,
            valor: ''
          }]
        });
        continue;
      }

      // Crear objeto producto con headers normalizados
      const producto = {};
      headers.forEach((header, index) => {
        // Asegurarse de que el índice existe en values (manejar columnas vacías al final)
        const valorRaw = (index < values.length && values[index] !== undefined && values[index] !== null) 
          ? values[index] 
          : '';
        const valor = valorRaw ? String(valorRaw).replace(/^"|"$/g, '').trim() : '';
        producto[header] = valor;
      });
      
      // Debug: mostrar qué se está leyendo para las primeras filas
      if (numeroFila <= headerLineIndex + 3) {
        console.log(`\n=== DEBUG Fila ${numeroFila} ===`);
        console.log('Valores leídos:', values);
        console.log('Objeto producto completo:', producto);
        console.log('Claves disponibles en objeto:', Object.keys(producto));
      }
      
      // Debug: activar para las primeras filas o si hay problemas
      const debugMode = numeroFila <= headerLineIndex + 3;
      
      // Buscar campos de forma flexible usando los headers normalizados
      if (debugMode) console.log(`\nBuscando campos para fila ${numeroFila}:`);
      
      const codigoRaw = buscarCampoFlexible(producto, ['Codigo', 'codigo', 'código', 'codigo_producto', 'sku', 'barcode', 'codigo_barras'], debugMode) || '';
      // Buscar nombre (puede ser: nombre, name, producto, product, etc.)
      const nombre = buscarCampoFlexible(producto, ['Nombre', 'nombre', 'name', 'producto', 'product'], debugMode) || '';
      
      // Buscar tipo (búsqueda exacta para evitar confusión con "Tipo de precio" y "Categoria")
      const tipoRaw = buscarCampoExacto(producto, ['Tipo', 'tipo', 'type']) || 'fisico';
      const tipo = tipoRaw.toLowerCase();
      
      // Buscar precio de compra (puede ser: precio_compra, precio compra, costo, cost, etc.)
      const precioCompra = buscarCampoFlexible(producto, ['Precio de Compra', 'precio_compra', 'precio de compra', 'costo', 'cost'], debugMode) || '';
      
      // Buscar precio de venta (puede ser: precio_venta, precio venta, precio, price, etc.)
      const precioVenta = buscarCampoFlexible(producto, ['Precio de Venta', 'precio_venta', 'precio de venta', 'precio', 'price'], debugMode) || '';
      
      // Buscar stock (puede ser: stock, cantidad, quantity, inventario, etc.)
      const stock = buscarCampoFlexible(producto, ['Stock', 'stock', 'cantidad', 'quantity'], debugMode) || '';
      
      // Buscar imagen
      const imagen = buscarCampoFlexible(producto, ['Imagen', 'imagen', 'image', 'imagen_url'], debugMode) || '';
      const fechaVencimiento = buscarCampoFlexible(producto, ['Fecha de Vencimiento', 'fecha_vencimiento', 'fecha de vencimiento', 'vencimiento'], debugMode) || '';
      const varianteNombre = buscarCampoExacto(producto, ['Variante Nombre', 'variante_nombre', 'variante nombre', 'variante']) || '';
      const varianteCodigo = buscarCampoExacto(producto, ['Variante Codigo', 'variante_codigo', 'variante código', 'variante codigo']) || '';
      const varianteStock = buscarCampoExacto(producto, ['Variante Stock', 'variante_stock', 'variante stock']) || '';
      const stockMinimoRaw = buscarCampoFlexible(
        producto,
        ['Umbral de stock bajo', 'stock_minimo', 'stock minimo', 'umbral de stock bajo', 'umbral_stock_bajo'],
        debugMode
      ) || '';
      const permiteToppingsRaw = buscarCampoFlexible(
        producto,
        ['Permitir agregar toppings/adicionales', 'permite_toppings', 'permitir agregar toppings/adicionales', 'permite_topping'],
        debugMode
      ) || '';
      const pesoRaw = buscarCampoFlexible(
        producto,
        ['Peso', 'peso', 'peso_gramos', 'weight'],
        debugMode
      ) || '';
      const unidadPesoRaw = buscarCampoFlexible(
        producto,
        ['Unidad de Peso', 'unidad_peso', 'unidad de peso', 'unidad peso'],
        debugMode
      ) || '';
      const purezaRaw = buscarCampoFlexible(
        producto,
        ['Pureza', 'pureza', 'quilates', 'kilates', 'karat', 'kt'],
        debugMode
      ) || '';
      const jewelryPriceModeRaw = buscarCampoFlexible(
        producto,
        ['Tipo de precio', 'jewelry_price_mode', 'modo_precio_joyeria', 'tipo de precio', 'modo_precio'],
        debugMode
      ) || '';
      const jewelryMaterialTypeRaw = buscarCampoFlexible(
        producto,
        ['Tipo de material', 'jewelry_material_type', 'tipo_material_joyeria', 'tipo de material', 'tipo_material'],
        debugMode
      ) || '';
      const jewelryMinMarginRaw = buscarCampoFlexible(
        producto,
        ['Margen minimo (%)', 'jewelry_min_margin', 'margen_minimo_joyeria', 'margen mínimo (%)', 'margen_minimo'],
        debugMode
      ) || '';
      const jewelryStaticModeRaw = buscarCampoFlexible(
        producto,
        ['Como definir el precio estatico', 'jewelry_static_mode', 'modo_estatico_joyeria', 'cómo definir el precio estático', 'modo_precio_fijo'],
        debugMode
      ) || '';
      const jewelryStaticPercentRaw = buscarCampoFlexible(
        producto,
        ['Porcentaje sobre compra (%)', 'jewelry_static_percent', 'porcentaje_estatico_joyeria', 'porcentaje sobre compra (%)', 'porcentaje_margen'],
        debugMode
      ) || '';
      
      // Debug: mostrar valores encontrados para las primeras filas o si hay problemas
      if (debugMode || (!nombre || !stock)) {
        console.log(`\nFila ${numeroFila} - Resumen:`);
        console.log('  Nombre:', nombre || '❌ NO ENCONTRADO');
        console.log('  Stock:', stock || '❌ NO ENCONTRADO');
        console.log('  Precio Venta:', precioVenta || '❌ NO ENCONTRADO');
        console.log('  Precio Compra:', precioCompra || '❌ NO ENCONTRADO');
        console.log('  Tipo:', tipo);
      }
      
      // Validar tipo de producto
      const tiposValidos = ['fisico', 'servicio', 'comida', 'accesorio'];
      const tipoValido = tiposValidos.includes(tipo) ? tipo : 'fisico';
      
      // Acumular problemas encontrados
      const problemas = [];
      const agregarProblema = (campo, mensaje, valor) => {
        problemas.push({ campo, mensaje, valor: valor ?? '' });
      };
      
      // Validar campos requeridos según tipo
      if (tipoRaw && !tiposValidos.includes(tipo)) {
        agregarProblema('tipo', `El tipo "${tipoRaw}" no es válido. Usa: ${tiposValidos.join(', ')}`, tipoRaw);
      }
      if (!nombre || nombre.trim() === '') {
        agregarProblema('nombre', 'El nombre del producto es obligatorio', nombre);
      }
      
      const jewelryPriceMode = isJewelryBusiness
        ? normalizeJewelryPriceMode(jewelryPriceModeRaw)
        : 'fixed';
      const jewelryMaterialType = isJewelryBusiness
        ? normalizeJewelryMaterialType(jewelryMaterialTypeRaw)
        : 'na';

      if (isJewelryBusiness && jewelryPriceMode === '') {
        agregarProblema('modo_precio_joyeria', 'El modo de precio debe ser "fixed" o "variable"', jewelryPriceModeRaw);
      }

      if (isJewelryBusiness && jewelryMaterialType === '') {
        agregarProblema('tipo_material_joyeria', 'El tipo de material debe ser "local", "international" o "na"', jewelryMaterialTypeRaw);
      }

      if (!isJewelryBusiness || jewelryPriceMode !== 'variable') {
        if (!precioVenta || precioVenta.toString().trim() === '') {
          agregarProblema('precio_venta', 'El precio de venta es obligatorio', precioVenta);
        }
      }
      
      // Validar campos condicionales según tipo
      if ((tipoValido === 'fisico' || tipoValido === 'comida' || tipoValido === 'accesorio') && (!precioCompra || precioCompra.toString().trim() === '')) {
        agregarProblema('precio_compra', `El precio de compra es obligatorio para productos tipo "${tipoValido}"`, precioCompra);
      }

      if (isJewelryBusiness && (!pesoRaw || String(pesoRaw).trim() === '')) {
        agregarProblema('peso', 'El peso es obligatorio para joyería', pesoRaw);
      }
      
      const tieneVariante = Boolean(
        (varianteNombre && String(varianteNombre).trim() !== '') ||
        (varianteCodigo && String(varianteCodigo).trim() !== '') ||
        (varianteStock && String(varianteStock).trim() !== '')
      );
      
      let tieneAdvertenciaStock = false;
      
      if ((tipoValido === 'fisico' || tipoValido === 'comida') && !tieneVariante && (stock === '' || stock.toString().trim() === '' || parseInt(String(stock || '').trim() || '0', 10) === 0)) {
        tieneAdvertenciaStock = true;
      }

      if (tieneVariante && (!varianteNombre || String(varianteNombre).trim() === '')) {
        agregarProblema('variante_nombre', 'El nombre de la variante es obligatorio cuando se usan variantes', varianteNombre);
      }

      if (tieneVariante && (varianteStock === '' || String(varianteStock).trim() === '' || parseInt(String(varianteStock || '').trim() || '0', 10) === 0)) {
        tieneAdvertenciaStock = true;
      }

      // Convertir números
      const precioCompraNum = parseNumberFlexible(precioCompra);
      const precioVentaNum = parseNumberFlexible(precioVenta);
      const stockNum = parseInt(String(stock || '').trim() || '0', 10);
      const varianteStockNum = parseInt(String(varianteStock || '').trim() || '0', 10);
      const pesoNum = parseWeightValue(pesoRaw);
      const jewelryMinMarginNum = parseNumberFlexible(jewelryMinMarginRaw);
      
      // Validar que sean números válidos
      if (precioCompra && precioCompra.toString().trim() !== '' && isNaN(precioCompraNum)) {
        agregarProblema('precio_compra', `El precio de compra "${precioCompra}" no es un número válido`, precioCompra);
      }
      
      if (precioVenta && precioVenta.toString().trim() !== '' && isNaN(precioVentaNum)) {
        agregarProblema('precio_venta', `El precio de venta "${precioVenta}" no es un número válido`, precioVenta);
      }
      
      if (stock && stock.toString().trim() !== '' && isNaN(stockNum)) {
        agregarProblema('stock', `El stock "${stock}" no es un número válido`, stock);
      }

      if (varianteStock && String(varianteStock).trim() !== '' && isNaN(varianteStockNum)) {
        agregarProblema('variante_stock', `El stock de variante "${varianteStock}" no es un número válido`, varianteStock);
      }

      if (isJewelryBusiness && pesoRaw && String(pesoRaw).trim() !== '' && isNaN(pesoNum)) {
        agregarProblema('peso', `El peso "${pesoRaw}" no es un número válido`, pesoRaw);
      }

      if (isJewelryBusiness && jewelryStaticModeRaw) {
        const normalizedStaticMode = String(jewelryStaticModeRaw || '').trim().toLowerCase();
        if (!['fixed', 'fijo', 'percent', 'porcentaje'].includes(normalizedStaticMode)) {
          agregarProblema('jewelry_static_mode', 'El modo fijo debe ser "fixed" o "percent"', jewelryStaticModeRaw);
        }
        if (['percent', 'porcentaje'].includes(normalizedStaticMode)) {
          const percentValue = parseNumberFlexible(jewelryStaticPercentRaw);
          if (!jewelryStaticPercentRaw || isNaN(percentValue)) {
            agregarProblema('jewelry_static_percent', 'El porcentaje fijo es obligatorio y debe ser numérico', jewelryStaticPercentRaw);
          }
        }
      }

      // Validar que no sean negativos
      if (!isNaN(precioCompraNum) && precioCompraNum < 0) {
        agregarProblema('precio_compra', 'El precio de compra no puede ser negativo', precioCompra);
      }
      
      if (!isNaN(precioVentaNum) && precioVentaNum < 0) {
        agregarProblema('precio_venta', 'El precio de venta no puede ser negativo', precioVenta);
      }
      
      if (!isNaN(stockNum) && stockNum < 0) {
        agregarProblema('stock', 'El stock no puede ser negativo', stock);
      }

      if (!isNaN(varianteStockNum) && varianteStockNum < 0) {
        agregarProblema('variante_stock', 'El stock de variante no puede ser negativo', varianteStock);
      }

      if (isJewelryBusiness && !isNaN(pesoNum) && pesoNum < 0) {
        agregarProblema('peso', 'El peso no puede ser negativo', pesoRaw);
      }
      
      // Validar fecha vencimiento (si existe)
      if (fechaVencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(String(fechaVencimiento).trim())) {
        agregarProblema('fecha_vencimiento', 'La fecha de vencimiento debe estar en formato YYYY-MM-DD', fechaVencimiento);
      }

      // Validar códigos duplicados dentro del archivo
      const codigoFinal = (codigoRaw && String(codigoRaw).trim() !== '')
        ? String(codigoRaw).trim()
        : '';

      const esDuplicado = codigoFinal && codigosEnArchivo.has(codigoFinal);

      if (esDuplicado && !tieneVariante) {
        agregarProblema('codigo', `El código "${codigoFinal}" está duplicado en el archivo. Si son variantes del mismo producto, debes llenar las columnas "Variante Nombre" y "Variante Stock".`, codigoFinal);
      }

      // Validar que precio de venta >= precio de compra
      if (!isJewelryBusiness || jewelryPriceMode !== 'variable') {
        const precioCompraComparable = isJewelryBusiness ? (precioCompraNum * (pesoNum || 0)) : precioCompraNum;
        if (!isNaN(precioCompraComparable) && !isNaN(precioVentaNum) && precioVentaNum < precioCompraComparable) {
          agregarProblema('precio_venta', `El precio de venta (${precioVentaNum}) no puede ser menor que el precio de compra (${precioCompraComparable})`, precioVenta);
        }
      }
      
      // Si hay problemas, agregar a inconsistencias y continuar
      if (problemas.length > 0) {
        inconsistenciasEncontradas.push({
          fila: numeroFila,
          producto: nombre || 'Sin nombre',
          problemas: problemas
        });
        continue;
      }
      
      // Usar valores numéricos convertidos
      const pesoFinal = isJewelryBusiness ? pesoNum : 0;
      const compraPorUnidad = isJewelryBusiness ? (precioCompraNum || 0) : (precioCompraNum || 0);
      const precioCompraFinal = Math.round((isJewelryBusiness
        ? (compraPorUnidad * (pesoFinal || 0))
        : (precioCompraNum || 0)) * 100) / 100;
      const precioVentaFinal = Math.round((isJewelryBusiness && jewelryPriceMode === 'variable'
        ? calcularPrecioVentaJoyeria({
            compraPorUnidad,
            peso: pesoFinal,
            materialType: jewelryMaterialType || 'na',
            pureza: purezaRaw,
            minMarginOverride: jewelryMinMarginNum
          })
        : (precioVentaNum || 0)) * 100) / 100;
      const stockFinal = stockNum || 0;

      // Crear producto final (solo con columnas que existen en la tabla)
      const productoFinal = {
        nombre: nombre,
        tipo: tipoValido,
        precio_venta: precioVentaFinal,
        organization_id: userProfile?.organization_id,
        user_id: userProfile?.user_id || null,
        codigo: codigoFinal,
        imagen: imagen || null, // Guardamos la imagen original para procesar después
        fecha_vencimiento: fechaVencimiento || null,
        __rowNumber: numeroFila,
        __productKey: codigoFinal || `fila_${numeroFila}`,
        __advertenciaStock: tieneAdvertenciaStock
      };
      
      // Agregar precio_compra solo si tiene valor (obligatorio para fisico, comida, accesorio)
      if (precioCompraFinal > 0 || tipoValido === 'fisico' || tipoValido === 'comida' || tipoValido === 'accesorio') {
        productoFinal.precio_compra = precioCompraFinal || 0;
      }
      
      // Agregar stock solo si tiene valor o es obligatorio
      if (tieneVariante) {
        productoFinal.stock = 0;
      } else if (stockFinal > 0 || tipoValido === 'fisico' || tipoValido === 'comida') {
        productoFinal.stock = stockFinal || 0;
      } else if (tipoValido === 'accesorio' && stockFinal >= 0) {
        productoFinal.stock = stockFinal; // Opcional para accesorio
      }
      
      // Agregar campos opcionales desde metadata si existen
      const metadata = {};
      
      // Mapeo de campos metadata con nombres exactos del CSV primero
      const camposMetadataMap = {
        'peso': ['Peso', 'peso', 'peso_gramos', 'weight'],
        'unidad_peso': ['Unidad de Peso', 'unidad_peso', 'unidad de peso'],
        'categoria': ['Categoria', 'categoria', 'category'],
        'descripcion': ['Descripcion', 'descripcion', 'description'],
        'material': ['Material', 'material'],
        'talla': ['Talla', 'talla', 'size'],
        'color': ['Color', 'color'],
        'marca': ['Marca', 'marca', 'brand'],
        'modelo': ['Modelo', 'modelo', 'model'],
        'dimensiones': ['dimensiones', 'dimensions'],
        'duracion': ['duracion', 'duration'],
        'ingredientes': ['ingredientes', 'ingredients'],
        'alergenos': ['alergenos', 'allergens'],
        'calorias': ['calorias', 'calories'],
        'porcion': ['porcion', 'portion'],
        'variaciones': ['variaciones', 'variations'],
        'pureza': ['Pureza', 'pureza', 'quilates', 'karat']
      };
      
      Object.keys(camposMetadataMap).forEach(campo => {
        const valor = buscarCampoFlexible(producto, camposMetadataMap[campo]);
        if (valor && valor.toString().trim() !== '') {
          metadata[campo] = valor.toString().trim();
        }
      });

      if (permiteToppingsRaw && permiteToppingsRaw.toString().trim() !== '') {
        const normalized = permiteToppingsRaw.toString().trim().toLowerCase();
        metadata.permite_toppings = ['1', 'true', 'si', 'sí', 'yes', 'y'].includes(normalized);
      } else {
        metadata.permite_toppings = defaultPermiteToppings;
      }

      if (isJewelryBusiness) {
        if (pesoFinal) metadata.peso = pesoFinal;
        const unidadPesoFinal = unidadPesoRaw || organization?.jewelry_weight_unit || 'g';
        if (unidadPesoFinal) metadata.unidad_peso = unidadPesoFinal;
        if (purezaRaw) metadata.pureza = purezaRaw;
        if (compraPorUnidad > 0) metadata.jewelry_compra_por_unidad = compraPorUnidad;
        if (jewelryPriceMode) metadata.jewelry_price_mode = jewelryPriceMode;
        if (jewelryMaterialType) {
          metadata.jewelry_material_type = jewelryMaterialType;
          metadata.jewelry_gold_price_reference = jewelryMaterialType === 'na'
            ? 'international'
            : jewelryMaterialType;
        }
        if (jewelryStaticModeRaw) {
          const normalizedStaticMode = String(jewelryStaticModeRaw || '').trim().toLowerCase();
          metadata.jewelry_static_mode = ['percent', 'porcentaje'].includes(normalizedStaticMode) ? 'percent' : 'fixed';
        }
        if (jewelryStaticPercentRaw && !isNaN(parseNumberFlexible(jewelryStaticPercentRaw))) {
          metadata.jewelry_static_percent = parseNumberFlexible(jewelryStaticPercentRaw);
        }
        if (jewelryMinMarginNum > 0) {
          metadata.jewelry_min_margin = jewelryMinMarginNum;
        } else if (jewelryPriceMode === 'variable') {
          const fallbackMargin = getMinMarginValue(jewelryMaterialType || 'na');
          if (fallbackMargin > 0) {
            metadata.jewelry_min_margin = fallbackMargin;
          }
        }
      }

      if (stockMinimoRaw && stockMinimoRaw.toString().trim() !== '') {
        const umbralProducto = Number(stockMinimoRaw);
        if (Number.isFinite(umbralProducto) && umbralProducto > 0) {
          metadata.umbral_stock_bajo = umbralProducto;
        }
      }
      
      // fecha_vencimiento ya se guarda en columna directa (no metadata)
      
      // Agregar metadata solo si tiene campos
      if (Object.keys(metadata).length > 0) {
        productoFinal.metadata = metadata;
      }
      if (!esDuplicado) {
        productos.push(productoFinal);
        if (codigoFinal) {
          codigosEnArchivo.add(codigoFinal);
        }
      }

      if (tieneVariante) {
        variantesEncontradas.push({
          productKey: codigoFinal || `fila_${numeroFila}`,
          nombre: String(varianteNombre || '').trim(),
          codigo: String(varianteCodigo || '').trim() || null,
          stock: !isNaN(varianteStockNum) ? varianteStockNum : 0,
          fila: numeroFila,
          producto: nombre || codigoFinal
        });
      }
    }
    
    // Procesar imágenes de todos los productos
    const productosConImagenes = await Promise.all(
      productos.map(async (producto) => {
        if (producto.imagen && producto.imagen !== '') {
          try {
            const imagenProcesada = await procesarImagenExcel(producto.imagen, producto.nombre);
            return {
              ...producto,
              imagen: imagenProcesada
            };
          } catch (error) {
            console.error('Error procesando imagen para', producto.nombre, ':', error);
            // Continuar sin imagen si hay error
            return {
              ...producto,
              imagen: null
            };
          }
        } else {
          return {
            ...producto,
            imagen: null
          };
        }
      })
    );
    
    // Retornar productos e inconsistencias
    return { productos: productosConImagenes, inconsistencias: inconsistenciasEncontradas, variantes: variantesEncontradas };
  };

  const handleImportar = async () => {
    if (!archivo) {
      setError('Por favor selecciona un archivo CSV o Excel.');
      return;
    }

    // Validar que tengamos organization_id
    if (!userProfile || !userProfile.organization_id) {
      setError('Error: No se pudo obtener la organización. Por favor recarga la página e intenta de nuevo.');
      return;
    }
    setProcesando(true);
    setError('');
    setInconsistencias([]); // Limpiar inconsistencias previas

    try {
      const isCSV = archivo.type === 'text/csv' || archivo.name.endsWith('.csv');
      const isExcel = archivo.name.endsWith('.xlsx') || archivo.name.endsWith('.xls');
      
      let productos;
      let variantes = [];
      
      let resultado;
      
      if (!modoRevision) {
        if (isExcel) {
          resultado = await parseExcel(archivo);
        } else if (isCSV) {
          const text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(archivo);
          });
          resultado = await parseCSV(text);
        } else {
          throw new Error('Formato de archivo no soportado.');
        }
      } else {
        resultado = { productos: productosRevision, variantes: variantesRevision, inconsistencias };
      }
      
      // Extraer productos e inconsistencias del resultado
      productos = resultado.productos || [];
      variantes = resultado.variantes || [];
      const inconsistenciasParseadas = resultado.inconsistencias || [];
      
      // Guardar inconsistencias en el estado
      if (inconsistenciasParseadas.length > 0 && !modoRevision) {
        setInconsistencias(inconsistenciasParseadas);
      }
      
      if (productos.length === 0) {
        // Si hay inconsistencias, no lanzar error, las inconsistencias ya se mostraron
        if (inconsistenciasParseadas.length > 0) {
          setProcesando(false);
          return;
        }
        throw new Error('No se encontraron productos válidos en el archivo.');
      }

      if (!modoRevision) {
        const filasConErrores = new Set((inconsistenciasParseadas || []).map((inc) => inc.fila));
        setProductosRevision(productos);
        setVariantesRevision(variantes);
        setSeleccionadosRevision(productos.filter(p => !filasConErrores.has(p.__rowNumber) && !p.__advertenciaStock).map(p => p.__rowNumber));
        setModoRevision(true);
        setProcesando(false);
        return;
      }

      const productosFiltrados = productos.filter(p => seleccionadosRevision.includes(p.__rowNumber));
      const productKeysSeleccionados = new Set(productosFiltrados.map(p => p.__productKey));
      const variantesFiltradas = (variantes || []).filter(v => productKeysSeleccionados.has(String(v.productKey).trim()));
      productos = productosFiltrados;
      variantes = variantesFiltradas;

      const erroresSubida = [];
      const productosInsertados = [];
      const productosActualizados = [];
      const productosPayload = productos.map(({ __rowNumber, __productKey, __advertenciaStock, ...rest }) => rest);

      // Buscar productos existentes por código en la organización
      const codigosProductos = productosPayload
        .map((p) => String(p.codigo || '').trim())
        .filter(Boolean);
      const productosExistentesMap = new Map();
      const chunkSize = 200;
      for (let i = 0; i < codigosProductos.length; i += chunkSize) {
        const chunk = codigosProductos.slice(i, i + chunkSize);
        const { data: existentes, error: errorExistentes } = await supabase
          .from('productos')
          .select('id,codigo')
          .eq('organization_id', userProfile.organization_id)
          .in('codigo', chunk);
        if (errorExistentes) {
          throw errorExistentes;
        }
        (existentes || []).forEach((prod) => {
          if (prod.codigo) {
            productosExistentesMap.set(String(prod.codigo).trim(), prod.id);
          }
        });
      }

      const nuevos = [];
      const nuevosMeta = [];
      const actualizar = [];
      const actualizarMeta = [];

      productosPayload.forEach((payload, index) => {
        const meta = productos[index];
        const codigo = String(payload.codigo || '').trim();
        const existenteId = productosExistentesMap.get(codigo);
        if (existenteId) {
          actualizar.push({ id: existenteId, payload });
          actualizarMeta.push(meta);
        } else {
          nuevos.push(payload);
          nuevosMeta.push(meta);
        }
      });

      // Insertar productos nuevos en lotes
      const batchSize = 10;
      let insertados = 0;
      let actualizados = 0;
      let errores = 0;

      for (let i = 0; i < nuevos.length; i += batchSize) {
        const batch = nuevos.slice(i, i + batchSize);
        const batchMeta = nuevosMeta.slice(i, i + batchSize);
        
        const { data, error } = await supabase
          .from('productos')
          .insert(batch)
          .select();

        if (error) {
          console.error('Error insertando lote:', error);
          // Reintentar individualmente para identificar fila/campo exacto
          for (let j = 0; j < batch.length; j++) {
            const productoPayload = batch[j];
            const productoMeta = batchMeta[j];
            const { data: dataOne, error: errorOne } = await supabase
              .from('productos')
              .insert(productoPayload)
              .select();

            if (errorOne) {
              const fieldMatch = errorOne.message?.match(/column "([^"]+)"/i);
              const campo = fieldMatch ? fieldMatch[1] : 'desconocido';
              erroresSubida.push({
                fila: productoMeta.__rowNumber || '-',
                producto: productoMeta.nombre || productoMeta.codigo || 'Producto sin nombre',
                problemas: [{
                  campo,
                  mensaje: errorOne.message || 'Error desconocido',
                  valor: ''
                }]
              });
              errores += 1;
            } else if (dataOne && dataOne.length > 0) {
              insertados += dataOne.length;
              productosInsertados.push(...dataOne);
            }
          }
        } else {
          insertados += data.length;
          productosInsertados.push(...data);
        }
      }

      // Actualizar productos existentes
      for (let i = 0; i < actualizar.length; i++) {
        const { id, payload } = actualizar[i];
        const meta = actualizarMeta[i];
        const updatePayload = { ...payload };
        delete updatePayload.organization_id;
        delete updatePayload.user_id;
        const { data: dataUpdate, error: errorUpdate } = await supabase
          .from('productos')
          .update(updatePayload)
          .eq('id', id)
          .select();
        if (errorUpdate) {
          const fieldMatch = errorUpdate.message?.match(/column "([^"]+)"/i);
          const campo = fieldMatch ? fieldMatch[1] : 'desconocido';
          erroresSubida.push({
            fila: meta.__rowNumber || '-',
            producto: meta.nombre || meta.codigo || 'Producto sin nombre',
            problemas: [{
              campo,
              mensaje: errorUpdate.message || 'Error desconocido',
              valor: ''
            }]
          });
          errores += 1;
        } else if (dataUpdate && dataUpdate.length > 0) {
          actualizados += dataUpdate.length;
          productosActualizados.push(...dataUpdate);
        }
      }

      // Insertar variantes si existen
      let variantesInsertadas = 0;
      if (variantes.length > 0) {
        const productoIdMap = new Map(productosExistentesMap);
        productosInsertados.forEach((prod) => {
          if (prod.codigo) {
            productoIdMap.set(String(prod.codigo).trim(), prod.id);
          }
        });

        const variantesPayload = variantes
          .map((vari) => {
            const productoId = productoIdMap.get(String(vari.productKey).trim());
            if (!productoId) {
              erroresSubida.push({
                fila: vari.fila || '-',
                producto: vari.producto || vari.productKey || 'Variante',
                problemas: ['No se encontró el producto para asociar esta variante']
              });
              return null;
            }
            return {
              payload: {
                organization_id: userProfile?.organization_id,
                producto_id: productoId,
                nombre: vari.nombre,
                codigo: vari.codigo || null,
                stock: vari.stock ?? 0
              },
              meta: {
                fila: vari.fila,
                producto: vari.producto || vari.productKey,
                nombre: vari.nombre
              }
            };
          })
          .filter(Boolean);

        // Preparar mapa de variantes existentes
        const productoIds = Array.from(new Set(variantesPayload.map((v) => v.payload.producto_id)));
        const variantesExistentesMap = new Map();
        for (let i = 0; i < productoIds.length; i += chunkSize) {
          const chunk = productoIds.slice(i, i + chunkSize);
          const { data: variantesExistentes, error: errorVarExist } = await supabase
            .from('product_variants')
            .select('id,producto_id,nombre,codigo,organization_id')
            .eq('organization_id', userProfile.organization_id)
            .in('producto_id', chunk);
          if (errorVarExist) {
            throw errorVarExist;
          }
          (variantesExistentes || []).forEach((vari) => {
            if (vari.codigo) {
              variantesExistentesMap.set(`codigo:${String(vari.codigo).trim()}`, vari.id);
            }
            if (vari.producto_id && vari.nombre) {
              variantesExistentesMap.set(`nombre:${vari.producto_id}:${String(vari.nombre).trim().toLowerCase()}`, vari.id);
            }
          });
        }

        const variantesParaInsertar = [];
        const variantesParaActualizar = [];
        variantesPayload.forEach((item) => {
          const codigo = item.payload.codigo ? String(item.payload.codigo).trim() : '';
          const nombreKey = `nombre:${item.payload.producto_id}:${String(item.payload.nombre || '').trim().toLowerCase()}`;
          const codigoKey = codigo ? `codigo:${codigo}` : '';
          const varianteId = codigoKey && variantesExistentesMap.has(codigoKey)
            ? variantesExistentesMap.get(codigoKey)
            : (variantesExistentesMap.has(nombreKey) ? variantesExistentesMap.get(nombreKey) : null);
          if (varianteId) {
            variantesParaActualizar.push({ id: varianteId, payload: item.payload, meta: item.meta });
          } else {
            variantesParaInsertar.push(item);
          }
        });

        for (let i = 0; i < variantesParaInsertar.length; i += batchSize) {
          const batch = variantesParaInsertar.slice(i, i + batchSize);
          const batchPayload = batch.map((item) => item.payload);
          const { data: dataVar, error: errorVar } = await supabase
            .from('product_variants')
            .insert(batchPayload)
            .select();

          if (errorVar) {
            console.error('Error insertando variantes:', errorVar);
            for (let j = 0; j < batch.length; j++) {
              const variPayload = batch[j].payload;
              const variMeta = batch[j].meta;
              const { data: dataOne, error: errorOne } = await supabase
                .from('product_variants')
                .insert(variPayload)
                .select();
              if (errorOne) {
                const fieldMatch = errorOne.message?.match(/column "([^"]+)"/i);
                const campo = fieldMatch ? fieldMatch[1] : 'desconocido';
              erroresSubida.push({
                fila: variMeta.fila || '-',
                producto: variMeta.producto || variMeta.nombre || 'Variante',
                problemas: [{
                  campo,
                  mensaje: errorOne.message || 'Error desconocido',
                  valor: ''
                }]
              });
                errores += 1;
              } else if (dataOne && dataOne.length > 0) {
                variantesInsertadas += dataOne.length;
              }
            }
          } else if (dataVar) {
            variantesInsertadas += dataVar.length;
          }
        }

        for (let i = 0; i < variantesParaActualizar.length; i++) {
          const { id, payload, meta } = variantesParaActualizar[i];
          const updatePayload = { ...payload };
          delete updatePayload.organization_id;
          const { data: dataUpdate, error: errorUpdate } = await supabase
            .from('product_variants')
            .update(updatePayload)
            .eq('id', id)
            .select();
          if (errorUpdate) {
            const fieldMatch = errorUpdate.message?.match(/column "([^"]+)"/i);
            const campo = fieldMatch ? fieldMatch[1] : 'desconocido';
            erroresSubida.push({
              fila: meta.fila || '-',
              producto: meta.producto || meta.nombre || 'Variante',
              problemas: [{
                campo,
                mensaje: errorUpdate.message || 'Error desconocido',
                valor: ''
              }]
            });
            errores += 1;
          } else if (dataUpdate && dataUpdate.length > 0) {
            // No mostrar contador separado por ahora
          }
        }
      }

      if (erroresSubida.length > 0) {
        setInconsistencias(prev => [...prev, ...erroresSubida]);
      }

      setResultado({
        total: productos.length,
        insertados,
        actualizados,
        errores,
        productos: productos.slice(0, 5), // Primeros 5 para preview
        variantes: variantesInsertadas
      });

      if (insertados > 0 && onProductosImportados) {
        onProductosImportados();
      }

    } catch (err) {
      console.error('Error procesando CSV:', err);
      // Solo mostrar error si NO hay inconsistencias (las inconsistencias tienen prioridad)
      if (inconsistencias.length === 0) {
        setError(err.message || 'Error al procesar el archivo CSV.');
      }
    } finally {
      setProcesando(false);
    }
  };

  const descargarPlantilla = (tipo = 'csv') => {
    const archivos = isJewelryBusiness
      ? {
          csv: '/templates/plantilla_productos_joyeria.csv',
          excel: '/templates/plantilla-importacion-productos-joyeria.xlsx'
        }
      : {
          csv: '/templates/plantilla_productos.csv',
          excel: '/templates/plantilla-importacion-productos.xlsx'
        };
    
    const link = document.createElement('a');
    link.href = archivos[tipo];
    link.download = tipo === 'csv' ? 'plantilla_productos.csv' : 'plantilla-importacion-productos.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const productosRevisionFiltrados = React.useMemo(() => {
    let filtrados = productosRevision;
    
    if (filtroEstado !== 'todos') {
      filtrados = filtrados.filter(prod => {
        const erroresProducto = inconsistencias.filter(inc => inc.fila === prod.__rowNumber);
        const tieneError = erroresProducto.length > 0;
        const tieneAdvertencia = !tieneError && prod.__advertenciaStock;
        
        if (filtroEstado === 'errores') return tieneError;
        if (filtroEstado === 'advertencias') return tieneAdvertencia;
        if (filtroEstado === 'validos') return !tieneError && !tieneAdvertencia;
        return true;
      });
    }

    if (sortConfig.key) {
      filtrados = [...filtrados].sort((a, b) => {
        if (sortConfig.key === 'errores') {
          const aErrores = inconsistencias.some(inc => inc.fila === a.__rowNumber) ? 2 : (a.__advertenciaStock ? 1 : 0);
          const bErrores = inconsistencias.some(inc => inc.fila === b.__rowNumber) ? 2 : (b.__advertenciaStock ? 1 : 0);
          return sortConfig.direction === 'asc' ? aErrores - bErrores : bErrores - aErrores;
        }

        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        
        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtrados;
  }, [productosRevision, filtroEstado, sortConfig, inconsistencias]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px' }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  useEffect(() => {
    if (!open) {
      setArchivo(null);
      setProcesando(false);
      setResultado(null);
      setError('');
      setPreview(null);
      setInconsistencias([]);
      setModoRevision(false);
      setProductosRevision([]);
      setFiltroEstado('todos');
      setSortConfig({ key: '__rowNumber', direction: 'asc' });
      setVariantesRevision([]);
      setSeleccionadosRevision([]);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="importar-csv-modal">
      <div className="importar-csv-content">
        <div className="importar-csv-header">
          <h2>📊 Importar Productos</h2>
          <button className="importar-csv-close" onClick={onClose}>×</button>
        </div>

        <div className="importar-csv-body">
          {!modoRevision && !resultado && (
            <div className="importar-csv-initial-grid">
              <div className="importar-csv-initial-left">
                <div className="importar-csv-section">
                  <h3><ClipboardList size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }} /> Plantillas de Importación</h3>
                  <p>Descarga la plantilla oficial para importar tus productos:</p>
                  <div className="importar-csv-plantilla-container">
                    <button 
                      className="importar-csv-btn importar-csv-btn-primary"
                      onClick={() => descargarPlantilla('excel')}
                    >
                      📊 Descargar Plantilla Excel
                    </button>
                  </div>
                </div>
                
                <div className="importar-csv-section">
                  <div className="importar-csv-instructions">
                    <h4>💡 Instrucciones:</h4>
                    <ul>
                      <li><strong>NO modifiques</strong> los títulos (celdas bloqueadas)</li>
                      {isJewelryBusiness ? (
                        <li><strong>Campos requeridos (joyería):</strong> codigo, nombre, tipo, precio_compra, peso, stock</li>
                      ) : (
                        <li><strong>Campos requeridos:</strong> codigo, nombre, tipo, precio_compra, precio_venta, stock</li>
                      )}
                      {isJewelryBusiness && (
                        <li><strong>Joyería:</strong> precio_venta es opcional si modo_precio_joyeria = variable</li>
                      )}
                      {isJewelryBusiness && (
                        <li><strong>Joyería:</strong> modo_precio_joyeria (fixed/variable), tipo_material_joyeria (local/international/na), pureza (24k, 18k, 925...)</li>
                      )}
                      <li><strong>Campo opcional:</strong> permite_toppings (si/no, true/false, 1/0)</li>
                      <li><strong>Campo opcional:</strong> stock_minimo (número, umbral por producto)</li>
                      <li><strong>Si usas variantes:</strong> llena variante_nombre y variante_stock (stock global puede quedar vacío)</li>
                      <li><strong>Completa</strong> los datos en las filas vacías</li>
                      <li><strong>Usa números</strong> para precios y stock</li>
                      <li><strong>Excel:</strong> Guarda como .xlsx antes de importar</li>
                      <li><strong>CSV:</strong> Usa comillas solo para textos con espacios</li>
                      <li><strong>Formato:</strong> Acepta archivos .xlsx, .xls y .csv</li>
                      <li><strong>Imágenes:</strong> Puedes insertar imágenes directamente en las celdas del Excel</li>
                      <li><strong>URLs:</strong> También puedes usar URLs de imágenes en la columna de imagen</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="importar-csv-initial-right">
                <div className="importar-csv-section">
                  <h3>📁 Seleccionar Archivo</h3>
                  <div className="importar-csv-file-input">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleArchivoChange}
                      className="importar-csv-input"
                      id="csv-file"
                    />
                    <label htmlFor="csv-file" className="importar-csv-label">
                      {archivo ? `📄 ${archivo.name}` : '📂 Seleccionar archivo (CSV o Excel)'}
                    </label>
                  </div>
                </div>

                {preview && (
                  <div className="importar-csv-section" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h3>👁️ Vista Previa</h3>
                    <div className="importar-csv-preview" style={{ flex: 1 }}>
                      {preview.map((line, index) => (
                        <div key={index} className={`importar-csv-preview-line ${index === 0 ? 'header' : ''}`}>
                          {line}
                        </div>
                      ))}
                      {preview.length > 5 && <div className="importar-csv-preview-more">...</div>}
                    </div>
                  </div>
                )}
                
                {error && inconsistencias.length === 0 && (
                  <div className="importar-csv-error" style={{ marginTop: '1rem' }}>
                    ❌ {error}
                  </div>
                )}
              </div>
            </div>
          )}

          {modoRevision && productosRevision.length > 0 && (
            <div className="importar-csv-section" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem', flexShrink: 0 }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>📑 Revisión antes de subir</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Selecciona cuáles productos deseas subir. Las filas con errores no se pueden seleccionar.</p>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className="importar-csv-btn importar-csv-btn-secondary"
                    onClick={() => {
                      const filasConErrores = new Set((inconsistencias || []).map((inc) => inc.fila));
                      setSeleccionadosRevision(productosRevision.filter(p => !filasConErrores.has(p.__rowNumber)).map(p => p.__rowNumber));
                    }}
                  >
                    Seleccionar válidos
                  </button>
                  <button
                    type="button"
                    className="importar-csv-btn importar-csv-btn-secondary"
                    onClick={() => setSeleccionadosRevision([])}
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    className="importar-csv-btn importar-csv-btn-secondary"
                    onClick={() => {
                      setModoRevision(false);
      setProductosRevision([]);
      setFiltroEstado('todos');
      setSortConfig({ key: '__rowNumber', direction: 'asc' });
                      setVariantesRevision([]);
                      setSeleccionadosRevision([]);
                    }}
                  >
                    Volver atrás
                  </button>
                </div>
              </div>

              
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', backgroundColor: 'var(--bg-tertiary)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
                <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>Filtros:</span>
                <select 
                  className="importar-csv-select"
                  value={filtroEstado} 
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-primary)', fontSize: '0.9rem', backgroundColor: 'var(--bg-card)' }}
                >
                  <option value="todos">Todos los productos</option>
                  <option value="errores">🔴 Solo con errores</option>
                  <option value="advertencias">🟡 Solo sin stock</option>
                  <option value="validos">🟢 Solo listos para subir</option>
                </select>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  Mostrando {productosRevisionFiltrados.length} de {productosRevision.length}
                </span>
              </div>
              
              <div className="importar-csv-table-container">
                <table className="importar-csv-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px', textAlign: 'center', cursor: 'pointer' }} onClick={() => requestSort('__rowNumber')}>Fila <SortIcon columnKey="__rowNumber" /></th>
                      <th style={{ cursor: 'pointer' }} onClick={() => requestSort('nombre')}>Producto <SortIcon columnKey="nombre" /></th>
                      <th style={{ cursor: 'pointer' }} onClick={() => requestSort('codigo')}>Código <SortIcon columnKey="codigo" /></th>
                      <th style={{ cursor: 'pointer' }} onClick={() => requestSort('precio_venta')}>Precio <SortIcon columnKey="precio_venta" /></th>
                      <th style={{ cursor: 'pointer' }} onClick={() => requestSort('stock')}>Stock <SortIcon columnKey="stock" /></th>
                      <th style={{ cursor: 'pointer' }} onClick={() => requestSort('errores')}>Estado <SortIcon columnKey="errores" /></th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Subir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosRevisionFiltrados.map((prod, idx) => {
                      const erroresProducto = inconsistencias.filter(inc => inc.fila === prod.__rowNumber);
                      const tieneError = erroresProducto.length > 0;
                      
                      return (
                        <tr key={`${prod.__rowNumber}-${idx}`} className={tieneError ? 'importar-csv-tr-error' : ''}>
                          <td style={{ textAlign: 'center', fontWeight: '500' }}>{prod.__rowNumber}</td>
                          <td style={{ fontWeight: '500' }}>{prod.nombre || <span style={{ color: 'var(--text-placeholder)' }}>Sin nombre</span>}</td>
                          <td>{prod.codigo || '-'}</td>
                          <td>${(prod.precio_venta || 0).toLocaleString()}</td>
                          <td>{prod.stock || 0}</td>
                          <td>
                            {tieneError ? (
                              <div className="importar-csv-td-errores">
                                <span style={{ color: '#ef4444', fontWeight: '600', display: 'block', marginBottom: '0.25rem' }}>❌ Con errores:</span>
                                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#dc2626', fontSize: '0.85rem' }}>
                                  {erroresProducto.map((inc, i) => 
                                    inc.problemas.map((prob, j) => (
                                      <li key={`${i}-${j}`}>{typeof prob === 'string' ? prob : `${prob.campo ? `${prob.campo}: ` : ''}${prob.mensaje}`}</li>
                                    ))
                                  )}
                                </ul>
                              </div>
                            ) : prod.__advertenciaStock ? (
                              <span style={{ color: '#854d0e', backgroundColor: '#fef08a', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '500', display: 'inline-block' }}>⚠️ Sin stock (0)</span>
                            ) : (
                              <span style={{ color: '#15803d', backgroundColor: '#dcfce7', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '500', display: 'inline-block' }}>✅ Listo</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              style={{ width: '18px', height: '18px', cursor: tieneError ? 'not-allowed' : 'pointer' }}
                              checked={seleccionadosRevision.includes(prod.__rowNumber)}
                              onChange={() => {
                                if (tieneError) return;
                                setSeleccionadosRevision(prev => (
                                  prev.includes(prod.__rowNumber)
                                    ? prev.filter(id => id !== prod.__rowNumber)
                                    : [...prev, prod.__rowNumber]
                                ));
                              }}
                              disabled={tieneError}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && inconsistencias.length === 0 && (
            <div className="importar-csv-error">
              ❌ {error}
            </div>
          )}

          {inconsistencias.length > 0 && (
            <div className="importar-csv-inconsistencias">
              <h3>⚠️ Inconsistencias Encontradas ({inconsistencias.length})</h3>
              <p>Se encontraron problemas en las siguientes filas. Estas filas no se importaron:</p>
              <div className="importar-csv-inconsistencias-list">
                {inconsistencias.map((inc, index) => (
                  <div key={index} className="importar-csv-inconsistencia-item">
                    <div className="importar-csv-inconsistencia-header">
                      <strong>Fila {inc.fila}:</strong> {inc.producto}
                    </div>
                    <ul className="importar-csv-inconsistencia-problemas">
                      {inc.problemas.map((problema, pIndex) => {
                        if (typeof problema === 'string') {
                          return <li key={pIndex}>• {problema}</li>;
                        }
                        const campo = problema.campo ? `Campo "${problema.campo}"` : 'Campo';
                        const valor = problema.valor !== undefined && problema.valor !== '' ? ` (valor: ${problema.valor})` : '';
                        return (
                          <li key={pIndex}>
                            • {campo}: {problema.mensaje}{valor}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resultado && (
            <div className="importar-csv-resultado" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div className="importar-csv-resultado-stats">
                <h3>📊 Resumen de la Importación</h3>
                <div className="importar-csv-stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="importar-csv-stat">
                    <span className="importar-csv-stat-label">Total procesados:</span>
                    <span className="importar-csv-stat-value">{resultado.total}</span>
                  </div>
                  <div className="importar-csv-stat">
                    <span className="importar-csv-stat-label">Insertados:</span>
                    <span className="importar-csv-stat-value success">{resultado.insertados}</span>
                  </div>
                  {resultado.actualizados > 0 && (
                    <div className="importar-csv-stat">
                      <span className="importar-csv-stat-label">Actualizados:</span>
                      <span className="importar-csv-stat-value">{resultado.actualizados}</span>
                    </div>
                  )}
                  {resultado.errores > 0 && (
                    <div className="importar-csv-stat">
                      <span className="importar-csv-stat-label">Errores:</span>
                      <span className="importar-csv-stat-value error">{resultado.errores}</span>
                    </div>
                  )}
                  {resultado.variantes !== undefined && (
                    <div className="importar-csv-stat">
                      <span className="importar-csv-stat-label">Variantes insertadas:</span>
                      <span className="importar-csv-stat-value">{resultado.variantes}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="importar-csv-resultado-preview">
                {resultado.productos && resultado.productos.length > 0 ? (
                  <>
                    <h3>✨ Primeros productos:</h3>
                    <div className="importar-csv-productos-list" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border-primary)', borderRadius: '8px', padding: '1rem' }}>
                      {resultado.productos.map((producto, index) => (
                        <div key={index} className="importar-csv-producto">
                          <span className="importar-csv-producto-nombre">{producto.nombre}</span>
                          <span className="importar-csv-producto-precio">
                            ${(producto.precio_venta || 0).toLocaleString()}
                          </span>
                          <span className="importar-csv-producto-stock">Stock: {producto.stock}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--bg-tertiary)', borderRadius: '8px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>No se insertaron productos principales (posiblemente fueron variantes o hubo errores).</p>
                  </div>
                )}
              </div>
            </div>
          )}

          </div>
          <div className="importar-csv-actions">
            <button 
              className="importar-csv-btn importar-csv-btn-primary"
              onClick={handleImportar}
              disabled={!archivo || procesando}
            >
              {procesando ? '⏳ Procesando...' : (modoRevision ? '📤 Subir seleccionados' : '🔎 Revisar archivo')}
            </button>
            <button 
              className="importar-csv-btn importar-csv-btn-secondary"
              onClick={onClose}
            >
              Cerrar
            </button>
        </div>
      </div>
    </div>
  );
};

export default ImportarProductosCSV;
