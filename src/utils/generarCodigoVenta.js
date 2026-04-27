/**
 * Genera un código de venta amigable y corto
 * Formato: [Método][Fecha][Consecutivo]
 * Ejemplo: EF-20250121-001, TR-20250121-002
 * 
 * @param {string} organizationId - ID de la organización
 * @param {string} metodoPago - Método de pago
 * @param {boolean} forzarUnico - Si es true, genera un código único con timestamp para evitar duplicados
 * @returns {Promise<string>} Código de venta generado
 */
export const generarCodigoVenta = async (organizationId, metodoPago, forzarUnico = false) => {
  const { supabase } = await import('../services/api/supabaseClient');
  
  // Abreviaciones de métodos de pago
  const abreviaciones = {
    'Efectivo': 'EF',
    'Transferencia': 'TR',
    'Tarjeta': 'TA',
    'Nequi': 'NE',
    'Mixto': 'MX',
    'COTIZACION': 'COT'
  };
  
  const abrev = abreviaciones[metodoPago] || 'VT';
  
  // Fecha en formato YYYYMMDD
  const hoy = new Date();
  const fecha = hoy.toISOString().split('T')[0].replace(/-/g, '');
  
  // Si se fuerza único, usar timestamp completo + contador para garantizar unicidad
  if (forzarUnico) {
    // Intentar generar un código único (máximo 5 intentos)
    for (let intento = 0; intento < 5; intento++) {
      // Usar timestamp completo (13 dígitos) + número aleatorio grande para garantizar unicidad
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      // Formato: EF-20250121-1234567890123456789 (timestamp completo + random de 6 dígitos)
      const codigoUnico = `${abrev}-${fecha}-${timestamp}${random}`;
      // #endregion agent log
      
      // Verificar que no exista en la base de datos
      try {
        const { data: existe, error: errorVerificacion } = await supabase
          .from('ventas')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('numero_venta', codigoUnico)
          .limit(1);
        
        // Si hay error en la verificación, asumir que no existe y retornar
        if (errorVerificacion) {
          console.warn('Error verificando código único, usando código generado:', errorVerificacion);
          return codigoUnico;
        }
        
        // Si no existe, retornar el código
        if (!existe || existe.length === 0) {
          return codigoUnico;
        }
        
        // Si existe, esperar un poco y generar uno nuevo
        await new Promise(resolve => setTimeout(resolve, 10 * (intento + 1)));
      } catch (err) {
        // Si hay error, retornar el código generado
        console.warn('Error verificando código único:', err);
        return codigoUnico;
      }
    }
    
    // Si después de 5 intentos no se encontró uno único, usar timestamp + random más largo
    const timestampFinal = Date.now();
    const randomFinal = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
    return `${abrev}-${fecha}-${timestampFinal}${randomFinal}`;
  }
  
  // Buscar el último consecutivo del día para este método de pago
  const inicioDia = new Date(hoy);
  inicioDia.setHours(0, 0, 0, 0);
  const finDia = new Date(hoy);
  finDia.setHours(23, 59, 59, 999);
  
  // Intentar obtener el último código de venta
  let ventasHoy = [];
  
  try {
    const result = await supabase
      .from('ventas')
      .select('numero_venta')
      .eq('organization_id', organizationId)
      .gte('created_at', inicioDia.toISOString())
      .lte('created_at', finDia.toISOString())
      .like('numero_venta', `${abrev}-${fecha}-%`)
      .order('created_at', { ascending: false })
      .limit(10); // Aumentar límite para mejor detección de duplicados
    
    if (result.error) {
      // Si la columna numero_venta no existe (código 42703), usar fallback
      if (result.error.code === '42703' || result.error.message?.includes('numero_venta does not exist')) {
        console.warn('Columna numero_venta no existe, usando código generado sin consultar base de datos');
        // Generar código basado en timestamp para asegurar unicidad
        const timestamp = Date.now().toString().slice(-6);
        return `${abrev}-${fecha}-${timestamp}`;
      }
      // Para otros errores, también usar fallback
      console.warn('Error obteniendo último código:', result.error);
      const timestamp = Date.now().toString().slice(-6);
      return `${abrev}-${fecha}-${timestamp}`;
    }
    
    ventasHoy = result.data || [];
  } catch (err) {
    // Si hay cualquier error, usar fallback
    console.warn('Error obteniendo último código:', err);
    const timestamp = Date.now().toString().slice(-6);
    return `${abrev}-${fecha}-${timestamp}`;
  }
  
  // Extraer el consecutivo del último código del mismo método y fecha
  let consecutivo = 1;
  if (ventasHoy && ventasHoy.length > 0) {
    // Filtrar solo los que coinciden con el patrón
    const ventasFiltradas = ventasHoy.filter(v => 
      v.numero_venta && v.numero_venta.startsWith(`${abrev}-${fecha}-`)
    );
    
    if (ventasFiltradas.length > 0) {
      // Ordenar por consecutivo descendente
      const consecutivos = ventasFiltradas
        .map(v => {
          const partes = v.numero_venta.split('-');
          if (partes.length === 3) {
            const num = parseInt(partes[2]);
            // Solo considerar números consecutivos (no timestamps)
            if (!isNaN(num) && num > 0 && partes[2].length <= 3) {
              return num;
            }
          }
          return 0;
        })
        .filter(n => !isNaN(n) && n > 0)
        .sort((a, b) => b - a);
      
      if (consecutivos.length > 0) {
        consecutivo = consecutivos[0] + 1;
      }
    }
  }
  
  // Verificar que el código generado no exista (máximo 10 intentos para evitar loops infinitos)
  for (let intento = 0; intento < 10; intento++) {
    const codigoGenerado = `${abrev}-${fecha}-${String(consecutivo).padStart(3, '0')}`;
    
    try {
      const { data: existe, error: errorVerificacion } = await supabase
        .from('ventas')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('numero_venta', codigoGenerado)
        .limit(1);
      
      // Si hay error en la verificación, asumir que no existe y retornar
      if (errorVerificacion) {
        console.warn('Error verificando código, usando código generado:', errorVerificacion);
        return codigoGenerado;
      }
      
      // Si no existe, retornar el código
      if (!existe || existe.length === 0) {
        // #endregion agent log
        return codigoGenerado;
      }
      
      // Si existe, incrementar consecutivo y verificar nuevamente
      consecutivo++;
    } catch (err) {
      // Si hay error, retornar el código generado
      console.warn('Error verificando código:', err);
      return codigoGenerado;
    }
  }
  
  // Si después de 10 intentos no se encontró uno único, usar timestamp como fallback
  const timestamp = Date.now().toString().slice(-6);
  // #endregion agent log
  return `${abrev}-${fecha}-${timestamp}`;
};

export const generarCodigoVentaLocal = (metodoPago) => {
  const abreviaciones = {
    'Efectivo': 'EF',
    'Transferencia': 'TR',
    'Tarjeta': 'TA',
    'Nequi': 'NE',
    'Mixto': 'MX',
    'COTIZACION': 'COT'
  };

  const abrev = abreviaciones[metodoPago] || 'VT';
  const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return `${abrev}-${fecha}-${timestamp}${random}`;
};
