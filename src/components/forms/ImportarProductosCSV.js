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
  const [seleccionadosRevision, setSeleccionadosRevision] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const summaryRef = React.useRef(null);

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
      if (typeof imagenData === 'string') {
        const imagenTexto = imagenData.trim();
        if (imagenTexto.startsWith('http') || imagenTexto.startsWith('data:')) {
          return imagenTexto;
        }
      }

      let archivoImagen;
      if (imagenData instanceof File) {
        archivoImagen = imagenData;
      } else {
        console.warn('Tipo de imagen no soportado:', typeof imagenData);
        return null;
      }

      const { validateFilename, generateStoragePath } = await import('../../utils/fileUtils');
      const validation = validateFilename(archivoImagen.name);
      if (!validation.isValid) {
        throw new Error(validation.error);
      }

      const imagenComprimida = await compressProductImage(archivoImagen);
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
      const lines = text.split('\n').slice(0, 6);
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

          let headerRowIndex = -1;
          const requiredHeadersBusqueda = isJewelryBusiness
            ? ['nombre', 'precio_compra', 'peso', 'stock']
            : ['nombre', 'precio_compra', 'precio_venta', 'stock'];

          for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (Array.isArray(row)) {
              const headers = row.map(h => String(h || '').toLowerCase().trim());
              const foundHeaders = requiredHeadersBusqueda.filter(required =>
                headers.some(header =>
                  header.includes(required) ||
                  header.includes(required.replace('_', ' ')) ||
                  header.includes(required.replace('_', '')) ||
                  (header.includes('precio') && required.includes('precio')) ||
                  (header.includes('price') && required.includes('precio'))
                )
              );
              if (foundHeaders.length >= 2) {
                headerRowIndex = i;
                break;
              }
            }
          }

          if (headerRowIndex === -1) headerRowIndex = 0;

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

          for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            const numeroFila = i + 1;

            if (!Array.isArray(row) || row.length === 0) {
              inconsistenciasEncontradas.push({
                fila: numeroFila,
                producto: 'Fila vacía',
                problemas: [{ campo: 'fila', mensaje: 'La fila está vacía o no tiene datos', valor: '' }]
              });
              continue;
            }

            const producto = {};
            headers.forEach((header, index) => {
              producto[header] = row[index] || '';
            });

            const buscarCampoFlexibleLocal = (obj, posiblesNombres) => {
              for (const nombre of posiblesNombres) {
                if (obj[nombre] !== undefined && obj[nombre] !== null && String(obj[nombre]).trim() !== '') {
                  return String(obj[nombre]).trim();
                }
              }
              const clavesObjeto = Object.keys(obj);
              for (const nombreBuscado of posiblesNombres) {
                const nombreNormalizado = nombreBuscado.toLowerCase().replace(/[_\s-*()]/g, '');
                for (const clave of clavesObjeto) {
                  const claveNormalizada = clave.toLowerCase().replace(/[_\s-*()]/g, '');
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
            const stockMinimoRaw = buscarCampoFlexibleLocal(producto, ['Umbral de stock bajo', 'stock_minimo', 'stock minimo', 'umbral de stock bajo', 'umbral_stock_bajo']) || '';
            const permiteToppingsRaw = buscarCampoFlexibleLocal(producto, ['Permitir agregar toppings/adicionales', 'permite_toppings', 'permitir agregar toppings/adicionales', 'permite_topping']) || '';
            const pesoRaw = buscarCampoFlexibleLocal(producto, ['Peso', 'peso', 'peso_gramos', 'weight']) || '';
            const unidadPesoRaw = buscarCampoFlexibleLocal(producto, ['Unidad de Peso', 'unidad_peso', 'unidad de peso', 'unidad peso']) || '';
            const purezaRaw = buscarCampoFlexibleLocal(producto, ['Pureza', 'pureza', 'quilates', 'kilates', 'karat', 'kt']) || '';
            const jewelryPriceModeRaw = buscarCampoFlexibleLocal(producto, ['Tipo de precio', 'jewelry_price_mode', 'modo_precio_joyeria', 'tipo de precio', 'modo_precio']) || '';
            const jewelryMaterialTypeRaw = buscarCampoFlexibleLocal(producto, ['Tipo de material', 'jewelry_material_type', 'tipo_material_joyeria', 'tipo de material', 'tipo_material']) || '';
            const jewelryMinMarginRaw = buscarCampoFlexibleLocal(producto, ['Margen minimo (%)', 'jewelry_min_margin', 'margen_minimo_joyeria', 'margen mínimo (%)', 'margen_minimo']) || '';
            const jewelryStaticModeRaw = buscarCampoFlexibleLocal(producto, ['Como definir el precio estatico', 'jewelry_static_mode', 'modo_estatico_joyeria', 'cómo definir el precio estático', 'modo_precio_fijo']) || '';
            const jewelryStaticPercentRaw = buscarCampoFlexibleLocal(producto, ['Porcentaje sobre compra (%)', 'jewelry_static_percent', 'porcentaje_estatico_joyeria', 'porcentaje sobre compra (%)', 'porcentaje_margen']) || '';

            const tiposValidos = ['fisico', 'servicio', 'comida', 'accesorio'];
            const tipoValido = tiposValidos.includes(tipo) ? tipo : 'fisico';

            const problemas = [];
            const agregarProblema = (campo, mensaje, valor) => {
              problemas.push({ campo, mensaje, valor: valor ?? '' });
            };

            if (tipoRaw && !tiposValidos.includes(tipo)) agregarProblema('tipo', `El tipo "${tipoRaw}" no es válido. Usa: ${tiposValidos.join(', ')}`, tipoRaw);
            if (!nombre || nombre.trim() === '') agregarProblema('nombre', 'El nombre del producto es obligatorio', nombre);

            const jewelryPriceMode = isJewelryBusiness ? normalizeJewelryPriceMode(jewelryPriceModeRaw) : 'fixed';
            const jewelryMaterialType = isJewelryBusiness ? normalizeJewelryMaterialType(jewelryMaterialTypeRaw) : 'na';

            if (isJewelryBusiness && jewelryPriceMode === '') agregarProblema('modo_precio_joyeria', 'El modo de precio debe ser "fixed" o "variable"', jewelryPriceModeRaw);
            if (isJewelryBusiness && jewelryMaterialType === '') agregarProblema('tipo_material_joyeria', 'El tipo de material debe ser "local", "international" o "na"', jewelryMaterialTypeRaw);

            if (!isJewelryBusiness || jewelryPriceMode !== 'variable') {
              if (!precioVenta || precioVenta.toString().trim() === '') agregarProblema('precio_venta', 'El precio de venta es obligatorio', precioVenta);
            }

            if ((tipoValido === 'fisico' || tipoValido === 'comida' || tipoValido === 'accesorio') && (!precioCompra || precioCompra.toString().trim() === '')) {
              agregarProblema('precio_compra', `El precio de compra es obligatorio para productos tipo "${tipoValido}"`, precioCompra);
            }

            if (isJewelryBusiness && (!pesoRaw || String(pesoRaw).trim() === '')) {
              agregarProblema('peso', 'El peso es obligatorio para joyería', pesoRaw);
            }

            const tieneVariante = Boolean((varianteNombre && String(varianteNombre).trim() !== '') || (varianteCodigo && String(varianteCodigo).trim() !== '') || (varianteStock && String(varianteStock).trim() !== ''));
            let tieneAdvertenciaStock = false;

            if ((tipoValido === 'fisico' || tipoValido === 'comida') && !tieneVariante && (stock === '' || stock.toString().trim() === '' || parseInt(String(stock || '').trim() || '0', 10) === 0)) {
              tieneAdvertenciaStock = true;
            }

            if (tieneVariante && (!varianteNombre || String(varianteNombre).trim() === '')) agregarProblema('variante_nombre', 'El nombre de la variante es obligatorio cuando se usan variantes', varianteNombre);
            if (tieneVariante && (varianteStock === '' || String(varianteStock).trim() === '' || parseInt(String(varianteStock || '').trim() || '0', 10) === 0)) tieneAdvertenciaStock = true;

            const precioCompraNum = parseNumberFlexible(precioCompra);
            const precioVentaNum = parseNumberFlexible(precioVenta);
            const stockNum = parseInt(String(stock || '').trim() || '0', 10);
            const varianteStockNum = parseInt(String(varianteStock || '').trim() || '0', 10);
            const pesoNum = parseWeightValue(pesoRaw);
            const jewelryMinMarginNum = parseNumberFlexible(jewelryMinMarginRaw);

            if (precioCompra && isNaN(precioCompraNum)) agregarProblema('precio_compra', `El precio de compra "${precioCompra}" no es un número válido`, precioCompra);
            if (precioVenta && isNaN(precioVentaNum)) agregarProblema('precio_venta', `El precio de venta "${precioVenta}" no es un número válido`, precioVenta);
            if (stock && isNaN(stockNum)) agregarProblema('stock', `El stock "${stock}" no es un número válido`, stock);
            if (isJewelryBusiness && pesoRaw && isNaN(pesoNum)) agregarProblema('peso', `El peso "${pesoRaw}" no es un número válido`, pesoRaw);

            if (precioCompraNum < 0) agregarProblema('precio_compra', 'No puede ser negativo', precioCompra);
            if (precioVentaNum < 0) agregarProblema('precio_venta', 'No puede ser negativo', precioVenta);
            if (stockNum < 0) agregarProblema('stock', 'No puede ser negativo', stock);

            const codigoFinal = String(codigoRaw || '').trim();
            const esDuplicado = codigoFinal && codigosEnArchivo.has(codigoFinal);
            if (esDuplicado && !tieneVariante) agregarProblema('codigo', `Código "${codigoFinal}" duplicado en el archivo`, codigoFinal);

            if (problemas.length > 0) {
              inconsistenciasEncontradas.push({ fila: numeroFila, producto: nombre || 'Sin nombre', problemas });
              continue;
            }

            const pesoFinal = isJewelryBusiness ? pesoNum : 0;
            const compraPorUnidad = isJewelryBusiness ? (precioCompraNum || 0) : (precioCompraNum || 0);
            const precioCompraFinal = Math.round((isJewelryBusiness ? (compraPorUnidad * (pesoFinal || 0)) : (precioCompraNum || 0)) * 100) / 100;
            const precioVentaFinal = Math.round((isJewelryBusiness && jewelryPriceMode === 'variable'
              ? calcularPrecioVentaJoyeria({ compraPorUnidad, peso: pesoFinal, materialType: jewelryMaterialType || 'na', pureza: purezaRaw, minMarginOverride: jewelryMinMarginNum })
              : (precioVentaNum || 0)) * 100) / 100;

            const productoFinal = {
              nombre, tipo: tipoValido, precio_venta: precioVentaFinal,
              organization_id: userProfile?.organization_id,
              user_id: userProfile?.user_id || null,
              codigo: codigoFinal, imagen: imagen || null, fecha_vencimiento: fechaVencimiento || null,
              __rowNumber: numeroFila, __productKey: codigoFinal || `fila_${numeroFila}`, __advertenciaStock: tieneAdvertenciaStock
            };

            if (precioCompraFinal > 0 || ['fisico', 'comida', 'accesorio'].includes(tipoValido)) productoFinal.precio_compra = precioCompraFinal || 0;
            if (tieneVariante) {
              productoFinal.stock = 0;
            } else {
              productoFinal.stock = stockNum || 0;
            }

            const metadata = {};
            if (isJewelryBusiness) {
              if (pesoFinal) metadata.peso = pesoFinal;
              if (purezaRaw) metadata.pureza = purezaRaw;
              if (jewelryPriceMode) metadata.jewelry_price_mode = jewelryPriceMode;
              if (jewelryMaterialType) metadata.jewelry_material_type = jewelryMaterialType;
              if (unidadPesoRaw) metadata.unidad_peso = unidadPesoRaw;
              if (jewelryStaticModeRaw) {
                const normalizedStaticMode = String(jewelryStaticModeRaw).trim().toLowerCase();
                metadata.jewelry_static_mode = ['percent', 'porcentaje'].includes(normalizedStaticMode) ? 'percent' : 'fixed';
              }
              if (jewelryStaticPercentRaw) {
                const percentVal = parseNumberFlexible(jewelryStaticPercentRaw);
                if (percentVal > 0) metadata.jewelry_static_percent = percentVal;
              }
              if (jewelryMinMarginNum > 0) metadata.jewelry_min_margin = jewelryMinMarginNum;
            }

            if (stockMinimoRaw) {
              const umbral = Number(stockMinimoRaw);
              if (Number.isFinite(umbral) && umbral > 0) metadata.umbral_stock_bajo = umbral;
            }

            if (permiteToppingsRaw) {
              const normalized = permiteToppingsRaw.toString().trim().toLowerCase();
              metadata.permite_toppings = ['1', 'true', 'si', 'sí', 'yes', 'y'].includes(normalized);
            } else {
              metadata.permite_toppings = defaultPermiteToppings;
            }

            if (Object.keys(metadata).length > 0) productoFinal.metadata = metadata;

            if (!esDuplicado) {
              productos.push(productoFinal);
              if (codigoFinal) codigosEnArchivo.add(codigoFinal);
            }

            if (tieneVariante) {
              variantesEncontradas.push({
                productKey: codigoFinal || `fila_${numeroFila}`,
                nombre: String(varianteNombre || '').trim(),
                codigo: String(varianteCodigo || '').trim() || null,
                stock: !isNaN(varianteStockNum) ? varianteStockNum : 0,
                fila: numeroFila, producto: nombre || codigoFinal
              });
            }
          }

          const productosConImagenes = await Promise.all(productos.map(async (p) => {
            if (p.imagen) {
              const img = await procesarImagenExcel(p.imagen, p.nombre);
              return { ...p, imagen: img };
            }
            return { ...p, imagen: null };
          }));

          resolve({ productos: productosConImagenes, inconsistencias: inconsistenciasEncontradas, variantes: variantesEncontradas });
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  };

  const buscarCampoFlexible = (obj, posiblesNombres, debug = false) => {
    for (const nombre of posiblesNombres) {
      if (obj[nombre] !== undefined && obj[nombre] !== null && String(obj[nombre]).trim() !== '') return String(obj[nombre]).trim();
    }
    const clavesObjeto = Object.keys(obj);
    for (const nombreBuscado of posiblesNombres) {
      const nombreNormalizado = nombreBuscado.toLowerCase().replace(/[_\s-*()]/g, '');
      for (const clave of clavesObjeto) {
        const claveNormalizada = clave.toLowerCase().replace(/[_\s-*()]/g, '');
        const diffLength = Math.abs(claveNormalizada.length - nombreNormalizado.length);
        if (claveNormalizada === nombreNormalizado || ((claveNormalizada.includes(nombreNormalizado) || nombreNormalizado.includes(claveNormalizada)) && diffLength <= 3)) {
          const valor = obj[clave];
          if (valor !== undefined && valor !== null && String(valor).trim() !== '') return String(valor).trim();
        }
      }
    }
    return '';
  };

  const parseCSV = async (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) throw new Error('El archivo CSV debe tener datos.');

    let headerLineIndex = 0;
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else current += char;
      }
      result.push(current.trim());
      return result;
    };

    const headersRaw = parseCSVLine(lines[headerLineIndex]);
    //const headersNormalizados = headersRaw.map(h => h.trim().replace(/"/g, '').toLowerCase().replace(/[_\s\-()]/g, ''));

    const productos = [];
    const inconsistenciasEncontradas = [];
    const variantesEncontradas = [];
    const codigosEnArchivo = new Set();

    for (let i = headerLineIndex + 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const producto = {};
      headersRaw.forEach((h, idx) => producto[h] = values[idx] || '');

      const nombre = buscarCampoFlexible(producto, ['Nombre', 'nombre', 'producto']);
      if (!nombre) continue;

      const precioVenta = parseNumberFlexible(buscarCampoFlexible(producto, ['Precio', 'precio_venta', 'precio de venta']));
      const stock = parseInt(buscarCampoFlexible(producto, ['Stock', 'stock', 'cantidad']) || '0', 10);
      const codigo = buscarCampoFlexible(producto, ['Codigo', 'codigo', 'sku']);

      const codigoFinal = String(codigo || '').trim();
      if (codigoFinal && codigosEnArchivo.has(codigoFinal)) continue;

      productos.push({
        nombre, precio_venta: precioVenta, stock, codigo: codigoFinal,
        organization_id: userProfile?.organization_id,
        user_id: userProfile?.user_id || null,
        __rowNumber: i + 1, __productKey: codigoFinal || `fila_${i + 1}`
      });

      if (codigoFinal) codigosEnArchivo.add(codigoFinal);
    }

    return { productos, inconsistencias: inconsistenciasEncontradas, variantes: variantesEncontradas };
  };

  const handleImportar = async () => {
    if (!archivo) { setError('Selecciona un archivo.'); return; }
    setProcesando(true);
    setError('');

    try {
      const isCSV = archivo.name.endsWith('.csv');
      const isExcel = archivo.name.endsWith('.xlsx') || archivo.name.endsWith('.xls');

      let resultadoParse;
      if (!modoRevision) {
        if (isExcel) resultadoParse = await parseExcel(archivo);
        else if (isCSV) {
          const text = await archivo.text();
          resultadoParse = await parseCSV(text);
        } else throw new Error('Formato no soportado.');

        if (resultadoParse.inconsistencias.length > 0) setInconsistencias(resultadoParse.inconsistencias);

        setProductosRevision(resultadoParse.productos);
        setSeleccionadosRevision(resultadoParse.productos.filter(p => !p.__advertenciaStock).map(p => p.__rowNumber));
        setModoRevision(true);
        setProcesando(false);
        return;
      }

      const productosFiltrados = productosRevision.filter(p => seleccionadosRevision.includes(p.__rowNumber));
      const payload = productosFiltrados.map(({ __rowNumber, __productKey, __advertenciaStock, ...rest }) => rest);

      const { data: dataInsert, error: errorInsert } = await supabase.from('productos').insert(payload).select();
      if (errorInsert) throw errorInsert;

      setResultado({
        total: productosFiltrados.length,
        insertados: dataInsert.length,
        actualizados: 0,
        errores: 0,
        productos: dataInsert.slice(0, 5)
      });

      setShowSuccessModal(true);
      if (onProductosImportados) onProductosImportados();

    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al importar.');
    } finally {
      setProcesando(false);
    }
  };

  const handleCloseSuccessModal = () => {
    setShowSuccessModal(false);
    setTimeout(() => {
      if (summaryRef.current) {
        summaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const descargarPlantilla = (tipo = 'excel') => {
    const link = document.createElement('a');
    link.href = isJewelryBusiness ? '/templates/plantilla-importacion-productos-joyeria.xlsx' : '/templates/plantilla-importacion-productos.xlsx';
    link.download = 'plantilla-importacion.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const productosRevisionFiltrados = React.useMemo(() => {
    let filtrados = productosRevision;
    if (filtroEstado === 'errores') filtrados = filtrados.filter(p => inconsistencias.some(inc => inc.fila === p.__rowNumber));
    else if (filtroEstado === 'advertencias') filtrados = filtrados.filter(p => p.__advertenciaStock);
    else if (filtroEstado === 'validos') filtrados = filtrados.filter(p => !p.__advertenciaStock && !inconsistencias.some(inc => inc.fila === p.__rowNumber));

    if (sortConfig.key) {
      filtrados = [...filtrados].sort((a, b) => {
        let vA = a[sortConfig.key];
        let vB = b[sortConfig.key];
        if (vA < vB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (vA > vB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtrados;
  }, [productosRevision, filtroEstado, sortConfig, inconsistencias]);

  const requestSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) return <span style={{ opacity: 0.3 }}>↕</span>;
    return <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  useEffect(() => {
    if (!open) {
      setArchivo(null); setResultado(null); setError(''); setModoRevision(false);
      setInconsistencias([]); setShowSuccessModal(false);
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
            <div className="importar-csv-initial-layout">
              <div className="importar-csv-initial-top" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="importar-csv-section">
                  <h3><ClipboardList size={20} /> Plantillas</h3>
                  <button className="importar-csv-btn importar-csv-btn-primary" onClick={() => descargarPlantilla()}>
                    📊 Descargar Plantilla Excel
                  </button>
                </div>
                <div className="importar-csv-section">
                  <h3>📁 Archivo</h3>
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleArchivoChange} id="csv-file" style={{ display: 'none' }} />
                  <label htmlFor="csv-file" className="importar-csv-label">
                    {archivo ? `📄 ${archivo.name}` : '📂 Seleccionar archivo'}
                  </label>
                  {error && <div className="importar-csv-error">❌ {error}</div>}
                </div>
              </div>

              <div className="importar-csv-initial-bottom" style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap: '2rem', marginTop: '2rem' }}>
                <div className="importar-csv-instructions-container">
                  <h4>💡 Instrucciones</h4>
                  <ul style={{ textAlign: 'left', fontSize: '0.9rem' }}>
                    <li>Usa la plantilla oficial sin cambiar los encabezados.</li>
                    <li>Campos mínimos: nombre, precio_compra, precio_venta, stock.</li>
                    <li>Para joyería: peso es obligatorio.</li>
                  </ul>
                </div>

                {preview && (
                  <div className="importar-csv-section">
                    <h3>👁️ Vista Previa</h3>
                    <div className="importar-csv-preview" style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      padding: '1rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontFamily: 'monospace',
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {preview.map((line, index) => (
                        <div key={index} style={{
                          padding: '0.25rem 0',
                          borderBottom: '1px solid var(--border-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {modoRevision && productosRevision.length > 0 && (
            <div className="importar-csv-section-revision">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3>📑 Revisión de datos</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                    <option value="todos">Todos</option>
                    <option value="errores">Errores</option>
                    <option value="advertencias">Sin stock</option>
                    <option value="validos">Válidos</option>
                  </select>
                  <button className="importar-csv-btn-secondary" onClick={() => setModoRevision(false)}>Volver</button>
                </div>
              </div>
              <div className="importar-csv-table-container">
                <table className="importar-csv-table">
                  <thead>
                    <tr>
                      <th onClick={() => requestSort('__rowNumber')}>Fila <SortIcon columnKey="__rowNumber" /></th>
                      <th onClick={() => requestSort('nombre')}>Producto <SortIcon columnKey="nombre" /></th>
                      <th onClick={() => requestSort('precio_venta')}>Precio <SortIcon columnKey="precio_venta" /></th>
                      <th onClick={() => requestSort('stock')}>Stock <SortIcon columnKey="stock" /></th>
                      <th>Estado</th>
                      <th>Subir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosRevisionFiltrados.map((prod) => {
                      const errs = inconsistencias.filter(inc => inc.fila === prod.__rowNumber);
                      return (
                        <tr key={prod.__rowNumber} className={errs.length > 0 ? 'tr-error' : ''}>
                          <td>{prod.__rowNumber}</td>
                          <td>{prod.nombre}</td>
                          <td>${prod.precio_venta}</td>
                          <td>{prod.stock}</td>
                          <td>{errs.length > 0 ? '❌ Error' : (prod.__advertenciaStock ? '⚠️ Sin stock' : '✅ Ok')}</td>
                          <td>
                            <input type="checkbox" disabled={errs.length > 0}
                              checked={seleccionadosRevision.includes(prod.__rowNumber)}
                              onChange={() => setSeleccionadosRevision(prev => prev.includes(prod.__rowNumber) ? prev.filter(id => id !== prod.__rowNumber) : [...prev, prod.__rowNumber])} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {inconsistencias.length > 0 && !modoRevision && (
            <div className="importar-csv-inconsistencias">
              <h3>⚠️ Inconsistencias ({inconsistencias.length})</h3>
              <div className="importar-csv-inconsistencias-list">
                {inconsistencias.map((inc, i) => (
                  <div key={i} className="inc-item">
                    <strong>Fila {inc.fila}:</strong> {inc.producto}
                    <ul>{inc.problemas.map((p, j) => <li key={j}>• {p.mensaje}</li>)}</ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resultado && (
            <div ref={summaryRef} className="importar-csv-resultado">
              <div className="importar-csv-resultado-stats">
                <h3>📊 Resumen</h3>
                <div className="importar-csv-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="stat">Total: {resultado.total}</div>
                  <div className="stat success">Insertados: {resultado.insertados}</div>
                </div>
              </div>
              <div className="importar-csv-resultado-preview">
                <h3>✨ Vista previa</h3>
                <div className="importar-csv-productos-list">
                  {resultado.productos.map((p, i) => (
                    <div key={i} className="prod-item">{p.nombre} - ${p.precio_venta}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="importar-csv-footer">
          {!resultado && (
            <button className="importar-csv-btn-primary" onClick={handleImportar} disabled={procesando || !archivo}>
              {procesando ? 'Procesando...' : (modoRevision ? 'Subir Seleccionados' : 'Analizar Archivo')}
            </button>
          )}
          <button className="importar-csv-btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {showSuccessModal && (
        <div className="importar-csv-success-modal-overlay">
          <div className="importar-csv-success-modal">
            <div className="success-icon">✅</div>
            <h2>¡Importación Exitosa!</h2>
            <p>Se han procesado correctamente <strong>{resultado?.insertados}</strong> productos.</p>
            <button onClick={handleCloseSuccessModal}>Ver Resumen</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportarProductosCSV;
