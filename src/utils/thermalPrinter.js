/**
 * Servicio para impresión térmica Bluetooth
 * Usa Web Bluetooth API para conectar con impresoras térmicas ESC/POS
 */

import EscPosEncoder from 'esc-pos-encoder';

// UUIDs estándar para impresoras ESC/POS Bluetooth
const ESCPOS_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const ESCPOS_CHARACTERISTIC_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

// UUIDs alternativos (algunas impresoras usan estos)
const ALTERNATIVE_SERVICE_UUID = '0000ae30-0000-1000-8000-00805f9b34fb';
const ALTERNATIVE_CHARACTERISTIC_UUID = '0000ae01-0000-1000-8000-00805f9b34fb';

/**
 * Verifica si el navegador soporta Web Bluetooth
 */
export const isBluetoothSupported = () => {
  return 'bluetooth' in navigator;
};

/**
 * Conecta a una impresora Bluetooth
 * @param {Object} impresoraGuardada - Información de la impresora guardada (opcional)
 * @param {string} impresoraGuardada.id - ID del dispositivo Bluetooth
 * @param {string} impresoraGuardada.name - Nombre del dispositivo
 */
export const connectPrinter = async (impresoraGuardada = null) => {
  if (!isBluetoothSupported()) {
    throw new Error('Tu navegador no soporta Bluetooth. Usa Chrome, Edge u Opera.');
  }

  let device = null;

  try {
    // Si hay una impresora guardada, intentar conectarla directamente
    if (impresoraGuardada && impresoraGuardada.id) {
      // Verificar si getDevices está disponible
      if (typeof navigator.bluetooth.getDevices === 'function') {
        try {
          // Obtener dispositivos previamente emparejados
          const devices = await navigator.bluetooth.getDevices();
          const savedDevice = devices.find(d => d.id === impresoraGuardada.id);
          
          if (savedDevice) {
            console.log('Usando impresora guardada:', impresoraGuardada.name);
            device = savedDevice;
          } else {
            // Si no está en los dispositivos emparejados, intentar filtrar por nombre
            console.log('Impresora guardada no encontrada. Solicitando selección...');
            if (impresoraGuardada.name) {
              // Intentar filtrar por el nombre guardado
              try {
                device = await navigator.bluetooth.requestDevice({
                  filters: [
                    { name: impresoraGuardada.name },
                    { services: [ESCPOS_SERVICE_UUID] },
                    { services: [ALTERNATIVE_SERVICE_UUID] }
                  ],
                  optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
                });
              } catch (error) {
                // Si falla el filtro por nombre, usar filtros genéricos
                console.warn('No se pudo filtrar por nombre, usando filtros genéricos:', error);
                device = await navigator.bluetooth.requestDevice({
                  filters: [
                    { services: [ESCPOS_SERVICE_UUID] },
                    { services: [ALTERNATIVE_SERVICE_UUID] },
                    { namePrefix: 'Printer' },
                    { namePrefix: 'POS' },
                    { namePrefix: 'ESC' }
                  ],
                  optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
                });
              }
            } else {
              // Si no hay nombre, usar filtros genéricos
              device = await navigator.bluetooth.requestDevice({
                filters: [
                  { services: [ESCPOS_SERVICE_UUID] },
                  { services: [ALTERNATIVE_SERVICE_UUID] },
                  { namePrefix: 'Printer' },
                  { namePrefix: 'POS' },
                  { namePrefix: 'ESC' }
                ],
                optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
              });
            }
          }
        } catch (error) {
          console.warn('Error al conectar con impresora guardada:', error);
          // Si falla, intentar filtrar por nombre si está disponible
          if (impresoraGuardada.name) {
            try {
              device = await navigator.bluetooth.requestDevice({
                filters: [
                  { name: impresoraGuardada.name },
                  { services: [ESCPOS_SERVICE_UUID] },
                  { services: [ALTERNATIVE_SERVICE_UUID] }
                ],
                optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
              });
            } catch (e) {
              // Si falla, usar filtros genéricos
              device = await navigator.bluetooth.requestDevice({
                filters: [
                  { services: [ESCPOS_SERVICE_UUID] },
                  { services: [ALTERNATIVE_SERVICE_UUID] },
                  { namePrefix: 'Printer' },
                  { namePrefix: 'POS' },
                  { namePrefix: 'ESC' }
                ],
                optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
              });
            }
          } else {
            device = await navigator.bluetooth.requestDevice({
              filters: [
                { services: [ESCPOS_SERVICE_UUID] },
                { services: [ALTERNATIVE_SERVICE_UUID] },
                { namePrefix: 'Printer' },
                { namePrefix: 'POS' },
                { namePrefix: 'ESC' }
              ],
              optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
            });
          }
        }
      } else {
        // Si getDevices no está disponible, intentar filtrar por nombre si está guardado
        console.log('getDevices no disponible. Solicitando selección...');
        if (impresoraGuardada.name) {
          try {
            device = await navigator.bluetooth.requestDevice({
              filters: [
                { name: impresoraGuardada.name },
                { services: [ESCPOS_SERVICE_UUID] },
                { services: [ALTERNATIVE_SERVICE_UUID] }
              ],
              optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
            });
          } catch (error) {
            // Si falla el filtro por nombre, usar filtros genéricos
            device = await navigator.bluetooth.requestDevice({
              filters: [
                { services: [ESCPOS_SERVICE_UUID] },
                { services: [ALTERNATIVE_SERVICE_UUID] },
                { namePrefix: 'Printer' },
                { namePrefix: 'POS' },
                { namePrefix: 'ESC' }
              ],
              optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
            });
          }
        } else {
          device = await navigator.bluetooth.requestDevice({
            filters: [
              { services: [ESCPOS_SERVICE_UUID] },
              { services: [ALTERNATIVE_SERVICE_UUID] },
              { namePrefix: 'Printer' },
              { namePrefix: 'POS' },
              { namePrefix: 'ESC' }
            ],
            optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
          });
        }
      }
    } else {
      // Si no hay impresora guardada, pedir seleccionar una nueva
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [ESCPOS_SERVICE_UUID] },
          { services: [ALTERNATIVE_SERVICE_UUID] },
          { namePrefix: 'Printer' },
          { namePrefix: 'POS' },
          { namePrefix: 'ESC' }
        ],
        optionalServices: [ESCPOS_SERVICE_UUID, ALTERNATIVE_SERVICE_UUID]
      });
    }

    // Conectar al servidor GATT
    const server = await device.gatt.connect();

    // Intentar obtener el servicio principal
    let service;
    let characteristic;

    try {
      service = await server.getPrimaryService(ESCPOS_SERVICE_UUID);
      characteristic = await service.getCharacteristic(ESCPOS_CHARACTERISTIC_UUID);
    } catch (error) {
      // Intentar con UUIDs alternativos
      try {
        service = await server.getPrimaryService(ALTERNATIVE_SERVICE_UUID);
        characteristic = await service.getCharacteristic(ALTERNATIVE_CHARACTERISTIC_UUID);
      } catch (altError) {
        // Si no encuentra los servicios estándar, buscar cualquier servicio que parezca ESC/POS
        const services = await server.getPrimaryServices();
        for (const svc of services) {
          try {
            const characteristics = await svc.getCharacteristics();
            for (const char of characteristics) {
              // Buscar característica que soporte escritura
              if (char.properties.write || char.properties.writeWithoutResponse) {
                service = svc;
                characteristic = char;
                break;
              }
            }
            if (service) break;
          } catch (e) {
            continue;
          }
        }
        if (!service || !characteristic) {
          throw new Error('No se pudo encontrar el servicio de impresión en la impresora.');
        }
      }
    }

    // Verificar que la característica tenga las propiedades necesarias
    if (!characteristic.properties.write && !characteristic.properties.writeWithoutResponse) {
      throw new Error('La impresora no soporta escritura de datos.');
    }

    // Log de las propiedades para debugging
    console.log('Característica encontrada:', {
      uuid: characteristic.uuid,
      properties: characteristic.properties,
      supportsWrite: characteristic.properties.write,
      supportsWriteWithoutResponse: characteristic.properties.writeWithoutResponse
    });

    return { device, server, service, characteristic };
  } catch (error) {
    if (error.name === 'NotFoundError') {
      throw new Error('No se encontró ninguna impresora Bluetooth. Asegúrate de que esté encendida y en modo de emparejamiento.');
    } else if (error.name === 'SecurityError') {
      throw new Error('Se requiere HTTPS para usar Bluetooth. O usa localhost para desarrollo.');
    } else if (error.name === 'NetworkError') {
      throw new Error('Error de conexión con la impresora. Verifica que esté cerca y encendida.');
    }
    throw error;
  }
};

/**
 * Formatea un número como moneda colombiana
 */
const formatCOP = (value) => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(value);
};

/**
 * Formatea una fecha
 */
const formatDate = (date) => {
  return new Date(date).toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Divide texto en múltiples líneas respetando el ancho máximo
 * Las impresoras térmicas de 58mm tienen aproximadamente 32 caracteres por línea
 */
const wrapText = (text, maxLength = 32) => {
  if (!text) return [''];
  const textStr = String(text);
  if (textStr.length <= maxLength) return [textStr];
  
  const lines = [];
  let currentLine = '';
  
  // Dividir por palabras primero
  const words = textStr.split(' ');
  
  for (const word of words) {
    if (word.length > maxLength) {
      // Si la palabra es muy larga, dividirla
      if (currentLine) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
      // Dividir la palabra larga
      for (let i = 0; i < word.length; i += maxLength) {
        lines.push(word.substring(i, i + maxLength));
      }
    } else if ((currentLine + ' ' + word).length <= maxLength) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) {
        lines.push(currentLine.trim());
      }
      currentLine = word;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine.trim());
  }
  
  return lines;
};

/**
 * Genera los comandos ESC/POS para imprimir un recibo
 * Formato replicado exactamente del recibo en pantalla
 */
export const generateReceiptCommands = (venta, datosEmpresa, opciones = {}) => {
  const encoder = new EscPosEncoder();

  // Inicializar impresora
  encoder.initialize();

  // Abrir cajón monedero si la opción está habilitada (por defecto true al imprimir)
  if (opciones.abrirCajonImpresion !== false) {
    try {
      encoder.pulse();
    } catch (e) {
      console.warn('Error al agregar comando pulse para cajón monedero:', e);
    }
  }

  // Encabezado centrado (igual que en pantalla)
  encoder
    .align('center')
    .size(1, 2)
    .text(datosEmpresa?.razon_social || 'MI NEGOCIO')
    .newline();

  if (datosEmpresa?.direccion) {
    const direccionLines = wrapText(datosEmpresa.direccion, 32);
    direccionLines.forEach(line => {
      encoder
        .size(1, 1)
        .text(line)
        .newline();
    });
  }

  if (datosEmpresa?.ciudad) {
    encoder
      .size(1, 1)
      .text(datosEmpresa.ciudad)
      .newline();
  }

  if (datosEmpresa?.telefono) {
    encoder
      .size(1, 1)
      .text(`Tel: ${datosEmpresa.telefono}`)
      .newline();
  }

  if (datosEmpresa?.email) {
    const emailLines = wrapText(`Email: ${datosEmpresa.email}`, 32);
    emailLines.forEach(line => {
      encoder
        .size(1, 1)
        .text(line)
        .newline();
    });
  }

  if (datosEmpresa?.nit) {
    encoder
      .size(1, 1)
      .text(`NIT: ${datosEmpresa.nit}`)
      .newline();
  }

  encoder
    .size(1, 1)
    .text('--------------------------------')
    .newline()
    .newline();

  // Sección de información del recibo
  encoder
    .align('center')
    .text('Venta registrada')
    .newline()
    .newline()
    .align('left')
    .text(`Recibo #${venta.id}`)
    .newline();

  // Fecha y hora
  const fechaHora = formatDate(venta.created_at || venta.date || new Date());
  encoder
    .text(fechaHora)
    .newline();

  // Cajero
  if (venta.cajero_nombre || venta.cashier) {
    const cajeroLines = wrapText(`Cajero: ${venta.cajero_nombre || venta.cashier || ''}`, 32);
    cajeroLines.forEach(line => {
      encoder
        .text(line)
        .newline();
    });
  }

  // Orden si existe
  if (venta.numero_venta) {
    encoder
      .text(`Orden: ${venta.numero_venta}`)
      .newline();
  }

  // Cliente si existe
  if (venta.cliente_nombre || venta.cliente?.nombre) {
    encoder
      .text('--------------------------------')
      .newline()
      .text('Cliente:')
      .newline();
    
    const clienteNombreLines = wrapText(venta.cliente_nombre || venta.cliente?.nombre || '', 32);
    clienteNombreLines.forEach(line => {
      encoder.text(line).newline();
    });
    
    if (venta.cliente?.documento) {
      encoder
        .text(`Documento: ${venta.cliente.documento}`)
        .newline();
    }
    
    if (venta.cliente?.telefono) {
      encoder
        .text(`Tel: ${venta.cliente.telefono}`)
        .newline();
    }
    
    if (venta.cliente?.direccion) {
      const direccionLines = wrapText(venta.cliente.direccion, 32);
      direccionLines.forEach(line => {
        encoder.text(line).newline();
      });
    }
  }

  encoder
    .text('--------------------------------')
    .newline()
    .text('Detalle de la venta')
    .newline()
    .text('--------------------------------')
    .newline();

  // Calcular subtotal para mostrar descuentos correctamente
  const calcularSubtotalItem = (item) => {
    let precioItem = item.precio_venta || item.precio || 0;
    if (item.precio_total) {
      return item.precio_total * item.qty;
    }
    if (item.toppings && Array.isArray(item.toppings) && item.toppings.length > 0) {
      const precioToppings = item.toppings.reduce((sum, topping) => {
        return sum + (topping.precio || 0) * (topping.cantidad || 1);
      }, 0);
      precioItem = precioItem + precioToppings;
    }
    return precioItem * item.qty;
  };

  const subtotalCalculado = venta.items.reduce((s, i) => s + calcularSubtotalItem(i), 0);
  const subtotal = venta.subtotal || subtotalCalculado;
  const descuentoInfo = venta.descuento || null;
  const montoDescuento = descuentoInfo?.monto || 0;
  const total = venta.total || (subtotal - montoDescuento);

  // Items del recibo (formato tabla: Cant. | Producto | Total)
  venta.items.forEach((item) => {
    const nombreProducto = item.producto?.nombre || item.nombre || 'Producto';
    const cantidad = item.qty || item.cantidad || 1;
    const precioItemBase = item.precio_venta || item.precio || 0;
    
    // Calcular precio de toppings
    const tieneToppings = item.toppings && Array.isArray(item.toppings) && item.toppings.length > 0;
    const precioToppings = tieneToppings 
      ? item.toppings.reduce((sum, t) => sum + (t.precio || 0) * (t.cantidad || 1), 0)
      : 0;
    
    const precioTotalItem = item.precio_total || (precioItemBase + precioToppings);
    const totalItem = precioTotalItem * cantidad;
    
    const tieneVariaciones = item.variaciones && Object.keys(item.variaciones).length > 0;

    // Nombre del producto (puede ocupar múltiples líneas)
    const nombreLines = wrapText(nombreProducto, 24);
    
    // Primera línea: Cantidad + Nombre (primera línea) + Total
    const cantidadStr = `${cantidad}x`;
    const totalStr = formatCOP(totalItem);
    const primeraLineaNombre = nombreLines[0] || '';
    
    // Calcular espacios para alinear el total
    const anchoDisponible = 32;
    const anchoCantidad = cantidadStr.length;
    const anchoNombre = primeraLineaNombre.length;
    const anchoTotal = totalStr.length;
    const espaciosNecesarios = anchoDisponible - anchoCantidad - anchoNombre - anchoTotal;
    
    encoder
      .text(`${cantidadStr} ${primeraLineaNombre}${' '.repeat(Math.max(1, espaciosNecesarios))}${totalStr}`)
      .newline();
    
    // Líneas adicionales del nombre (si hay)
    for (let i = 1; i < nombreLines.length; i++) {
      encoder
        .text(`   ${nombreLines[i]}`)
        .newline();
    }

    // Variaciones si existen
    if (tieneVariaciones) {
      encoder
        .text('  Variaciones:')
        .newline();
      
      Object.entries(item.variaciones).forEach(([key, value]) => {
        const opcionLabel = typeof value === 'boolean' 
          ? (value ? 'Sí' : 'No') 
          : String(value);
        const variacionText = `  • ${key}: ${opcionLabel}`;
        const variacionLines = wrapText(variacionText, 32);
        variacionLines.forEach(line => {
          encoder.text(line).newline();
        });
      });
    }

    // Toppings si existen
    if (tieneToppings) {
      encoder
        .text('  Toppings:')
        .newline();
      
      item.toppings.forEach((topping) => {
        const toppingNombre = topping.nombre || topping;
        const toppingCantidad = topping.cantidad || 1;
        const toppingPrecio = (topping.precio || 0) * toppingCantidad;
        
        // Construir texto del topping
        let toppingText = `  • ${toppingNombre}`;
        if (toppingCantidad > 1) {
          toppingText += ` (x${toppingCantidad})`;
        }
        
        // Calcular espacios para alinear el precio
        const precioStr = formatCOP(toppingPrecio);
        const anchoDisponible = 32;
        const anchoTopping = toppingText.length;
        const anchoPrecio = precioStr.length;
        const espacios = Math.max(1, anchoDisponible - anchoTopping - anchoPrecio);
        
        encoder
          .text(`${toppingText}${' '.repeat(espacios)}${precioStr}`)
          .newline();
      });
    }

    // Línea de precio base + toppings = total c/u (si hay toppings)
    if (tieneToppings) {
      const precioLine = `  Precio base: ${formatCOP(precioItemBase)} + Toppings: ${formatCOP(precioToppings)} = ${formatCOP(precioTotalItem)} c/u`;
      const precioLines = wrapText(precioLine, 32);
      precioLines.forEach(line => {
        encoder.text(line).newline();
      });
    }

    encoder
      .text('--------------------------------')
      .newline();
  });

  // Totales
  encoder
    .text('Subtotal')
    .align('right')
    .text(formatCOP(subtotal))
    .align('left')
    .newline();

  // Descuento si existe
  if (montoDescuento > 0 && descuentoInfo) {
    let descuentoTexto = 'Descuento';
    if (descuentoInfo.tipo === 'porcentaje') {
      descuentoTexto += ` (${descuentoInfo.valor}%)`;
    }
    if (descuentoInfo.alcance === 'productos') {
      descuentoTexto += ' en productos';
    }
    
    const descuentoStr = `-${formatCOP(montoDescuento)}`;
    const anchoDisponible = 32;
    const anchoDescuento = descuentoTexto.length;
    const anchoMonto = descuentoStr.length;
    const espacios = Math.max(1, anchoDisponible - anchoDescuento - anchoMonto);
    
    encoder
      .text(`${descuentoTexto}${' '.repeat(espacios)}${descuentoStr}`)
      .newline();
  }

  // Total final
  encoder
    .text('--------------------------------')
    .newline()
    .size(1, 2)
    .text('TOTAL')
    .align('right')
    .text(formatCOP(total))
    .align('left')
    .size(1, 1)
    .newline()
    .text('--------------------------------')
    .newline();

  // Método de pago
  const esCotizacion = venta.esCotizacion || venta.metodo_pago === 'COTIZACION';
  const esPagoMixto = venta.metodo_pago === 'Mixto' || venta.metodo_pago?.startsWith('Mixto (');
  let detallesPagoMixto = venta.detalles_pago_mixto;
  
  // Parsear detalles de pago mixto si vienen como string
  if (esPagoMixto && !detallesPagoMixto && typeof venta.metodo_pago === 'string') {
    const match = venta.metodo_pago.match(/Mixto \((.+?): (.+?) \+ (.+?): (.+?)\)/);
    if (match) {
      detallesPagoMixto = {
        metodo1: match[1],
        monto1: parseFloat(match[2].replace(/[^\d]/g, '')),
        metodo2: match[3],
        monto2: parseFloat(match[4].replace(/[^\d]/g, ''))
      };
    }
  }

  encoder
    .text('Método de pago')
    .align('right')
    .text(esCotizacion ? 'COTIZACIÓN' : esPagoMixto ? 'Mixto' : (venta.metodo_pago || 'N/A'))
    .align('left')
    .newline();

  // Detalles de pago mixto
  if (esPagoMixto && detallesPagoMixto) {
    try {
      const detalles = typeof detallesPagoMixto === 'string' 
        ? JSON.parse(detallesPagoMixto) 
        : detallesPagoMixto;
      
      if (detalles.metodo1 && detalles.monto1) {
        encoder
          .text(`  ${detalles.metodo1}: ${formatCOP(detalles.monto1)}`)
          .newline();
      }
      if (detalles.metodo2 && detalles.monto2) {
        encoder
          .text(`  ${detalles.metodo2}: ${formatCOP(detalles.monto2)}`)
          .newline();
      }
    } catch (e) {
      // Si falla el parse, no mostrar detalles
    }
  }

  // Cambio si existe
  if (venta.cambio && venta.cambio > 0) {
    encoder
      .text(`Cambio: ${formatCOP(venta.cambio)}`)
      .newline();
  }

  // Mensaje final
  encoder
    .newline();
  
  const mensajeFinal = datosEmpresa?.mensaje_factura || 'Gracias por su compra';
  const mensajeLines = wrapText(mensajeFinal, 32);
  mensajeLines.forEach(line => {
    encoder
      .align('center')
      .text(line)
      .newline();
  });
  
  encoder
    .newline()
    .newline()
    .cut();

  return encoder.encode();
};

/**
 * Divide un ArrayBuffer en chunks de máximo tamaño
 */
const chunkArrayBuffer = (buffer, chunkSize = 512) => {
  const chunks = [];
  const totalBytes = buffer.byteLength;
  
  for (let offset = 0; offset < totalBytes; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, totalBytes);
    chunks.push(buffer.slice(offset, end));
  }
  
  return chunks;
};

/**
 * Imprime un recibo en una impresora térmica Bluetooth
 * @param {Object} venta - Datos de la venta
 * @param {Object} datosEmpresa - Datos de la empresa
 * @param {Object} user - Usuario actual (opcional, para obtener impresora guardada)
 */
export const printReceipt = async (venta, datosEmpresa, user = null) => {
  let connection = null;

  try {
    // Obtener impresora guardada del usuario si está disponible
    let impresoraGuardada = null;
    if (user && user.user_metadata && user.user_metadata.impresora_bluetooth) {
      impresoraGuardada = user.user_metadata.impresora_bluetooth;
    }

    // Conectar a la impresora (usará la guardada si existe)
    connection = await connectPrinter(impresoraGuardada);

    // Generar comandos ESC/POS
    const config = user?.user_metadata?.impresora_configuracion || user?.user_metadata?.impresora_bluetooth;
    const abrirCajonImpresion = config?.abrir_cajon_impresion !== false;
    const commands = generateReceiptCommands(venta, datosEmpresa, { abrirCajonImpresion });

    // Dividir comandos en chunks de máximo 512 bytes (límite de Bluetooth GATT)
    const chunks = chunkArrayBuffer(commands, 512);

    // Verificar propiedades de la característica
    const props = connection.characteristic.properties;
    const supportsWrite = props.write;
    const supportsWriteWithoutResponse = props.writeWithoutResponse;

    // Determinar qué método usar
    // Preferir writeWithoutResponse (más rápido) si está disponible
    let useWriteWithoutResponse = false;
    let methodTried = false;
    
    if (supportsWriteWithoutResponse) {
      // Preferir writeWithoutResponse porque es más rápido y no espera confirmación
      useWriteWithoutResponse = true;
    } else if (!supportsWrite) {
      throw new Error('La característica no soporta escritura de datos.');
    }

    console.log(`Enviando ${chunks.length} fragmentos de datos...`);

    // Enviar cada chunk secuencialmente
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        // Verificar que el dispositivo siga conectado
        if (!connection.device.gatt.connected) {
          throw new Error('La impresora se desconectó durante la impresión.');
        }

        if (useWriteWithoutResponse) {
          // writeWithoutResponse no espera confirmación, más rápido
          await connection.characteristic.writeValueWithoutResponse(chunk);
        } else {
          // writeValue espera confirmación, más lento pero más confiable
          await connection.characteristic.writeValue(chunk);
        }
        
        methodTried = true;
        
        // Pausa mínima entre chunks solo si no es el último
        // Reducida al mínimo para acelerar la impresión
        if (i < chunks.length - 1) {
          // Delay muy corto: 5ms para writeWithoutResponse, 10ms para writeValue
          // Esto acelera significativamente la impresión
          const delay = useWriteWithoutResponse ? 5 : 10;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (chunkError) {
        console.error(`Error enviando chunk ${i + 1}/${chunks.length}:`, chunkError);
        
        // Si es un error de GATT y aún no hemos probado el método alternativo
        if ((chunkError.name === 'NotSupportedError' || 
             chunkError.message?.includes('GATT') ||
             chunkError.message?.includes('operation failed')) && 
            !methodTried && 
            supportsWrite && 
            supportsWriteWithoutResponse) {
          
          console.log('Cambiando a método alternativo de escritura...');
          useWriteWithoutResponse = !useWriteWithoutResponse;
          methodTried = true;
          
          try {
            // Reintentar con el método alternativo
            if (useWriteWithoutResponse) {
              await connection.characteristic.writeValueWithoutResponse(chunk);
            } else {
              await connection.characteristic.writeValue(chunk);
            }
            
            // Continuar con el siguiente chunk con delay mínimo
            if (i < chunks.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 20));
            }
            continue;
          } catch (retryError) {
            console.error('Error con método alternativo:', retryError);
            throw new Error('Error al enviar datos a la impresora. Verifica que esté conectada y encendida.');
          }
        }
        
        // Si es un error de desconexión, intentar reconectar
        if (chunkError.message?.includes('disconnect') || chunkError.message?.includes('desconect')) {
          throw new Error('La impresora se desconectó. Por favor, reconéctala e intenta de nuevo.');
        }
        
        // Si es el primer chunk, puede ser un problema de conexión
        if (i === 0) {
          throw new Error('Error al enviar datos a la impresora. Verifica que esté conectada y encendida.');
        }
        
        // Si es un chunk intermedio, puede ser que la impresora se desconectó
        throw new Error(`Error durante la impresión en el fragmento ${i + 1}. La impresora puede haberse desconectado.`);
      }
    }
    
    console.log('Datos enviados exitosamente');

    // Esperar un momento antes de cerrar la conexión para asegurar que la impresora procese los datos
    // Reducido a 300ms para acelerar el proceso
    await new Promise(resolve => setTimeout(resolve, 300));

    // No cerrar la conexión automáticamente - dejar que el sistema la maneje
    // Esto evita problemas de timeout y permite que la impresora termine de procesar
    // La conexión se cerrará automáticamente cuando el dispositivo se desconecte o después de un timeout del sistema
    // if (connection.device.gatt.connected) {
    //   connection.device.gatt.disconnect();
    // }

    return { success: true, message: 'Recibo impreso correctamente' };
  } catch (error) {
    // Cerrar conexión si está abierta
    if (connection && connection.device.gatt.connected) {
      try {
        connection.device.gatt.disconnect();
      } catch (e) {
        // Ignorar errores al desconectar
      }
    }

    throw error;
  }
};

/**
 * Abre la caja registradora (cajón monedero) conectada a la impresora Bluetooth
 * @param {Object} user - Usuario actual para obtener la impresora configurada
 */
export const openCashDrawer = async (user = null) => {
  let connection = null;

  try {
    // Obtener impresora guardada del usuario
    let impresoraGuardada = null;
    if (user && user.user_metadata && user.user_metadata.impresora_bluetooth) {
      impresoraGuardada = user.user_metadata.impresora_bluetooth;
    }

    if (!impresoraGuardada) {
      throw new Error('No hay impresora configurada para abrir el cajón monedero.');
    }

    // Conectar a la impresora (usará la guardada si existe)
    connection = await connectPrinter(impresoraGuardada);

    const encoder = new EscPosEncoder();
    encoder.initialize();
    
    // Comando para enviar pulso al cajón monedero (Pin 2, 100ms ON, 500ms OFF)
    encoder.pulse(0, 100, 500);
    
    const commands = encoder.encode();

    // Dividir comandos en chunks
    const chunks = chunkArrayBuffer(commands, 512);

    const props = connection.characteristic.properties;
    const supportsWrite = props.write;
    const supportsWriteWithoutResponse = props.writeWithoutResponse;

    let useWriteWithoutResponse = false;
    if (supportsWriteWithoutResponse) {
      useWriteWithoutResponse = true;
    } else if (!supportsWrite) {
      throw new Error('La impresora no soporta escritura de datos.');
    }

    console.log('Enviando pulso para abrir cajón monedero...');

    // Enviar cada chunk secuencialmente
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      if (!connection.device.gatt.connected) {
        throw new Error('La impresora se desconectó.');
      }

      if (useWriteWithoutResponse) {
        await connection.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await connection.characteristic.writeValue(chunk);
      }

      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, useWriteWithoutResponse ? 5 : 10));
      }
    }

    // Esperar un momento antes de terminar
    await new Promise(resolve => setTimeout(resolve, 300));

    return { success: true, message: 'Cajón monedero abierto correctamente' };
  } catch (error) {
    console.error('Error al abrir la caja registradora:', error);
    // Cerrar conexión si está abierta
    if (connection && connection.device.gatt.connected) {
      try {
        connection.device.gatt.disconnect();
      } catch (e) {
        // Ignorar
      }
    }
    throw error;
  }
};

