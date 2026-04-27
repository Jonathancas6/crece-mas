import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../services/api/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useCurrencyInput } from '../hooks/useCurrencyInput';
import { Calculator, TrendingUp, DollarSign, ShoppingCart, AlertCircle, CheckCircle, XCircle, Save, Banknote, CreditCard, Smartphone, Share2, Download, Receipt } from 'lucide-react';
import { getEmployeeSession } from '../utils/employeeSession';
import { enqueueCierre, getPendingVentas } from '../utils/offlineQueue';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineSync } from '../hooks/useOfflineSync';
import './CierreCaja.css';

const CierreCaja = () => {
  const navigate = useNavigate();
  const { userProfile, user, hasPermission, organization } = useAuth();
  const { isOnline } = useNetworkStatus();
  const { isSyncing } = useOfflineSync();
  const [cargando, setCargando] = useState(true);
  const [ventasHoy, setVentasHoy] = useState([]);
  const [cotizacionesHoy, setCotizacionesHoy] = useState([]); // Cotizaciones informativas (no cuentan en totales)
  const [ventasCreditoHoy, setVentasCreditoHoy] = useState([]); // Ventas a crédito informativas (no cuentan en totales)
  const [pagosCreditoHoy, setPagosCreditoHoy] = useState([]); // Pagos de créditos recibidos hoy
  const [, setDesglosePagosCredito] = useState({ efectivo: 0, transferencias: 0, tarjeta: 0 });
  const [totalPagosCredito, setTotalPagosCredito] = useState(0);
  const [totalPagosTotales, setTotalPagosTotales] = useState(0);
  const [totalAbonos, setTotalAbonos] = useState(0);
  const [totalSistema, setTotalSistema] = useState(0);

  // Currency inputs optimizados
  const efectivoRealInput = useCurrencyInput();
  const transferenciasRealInput = useCurrencyInput();
  const tarjetaRealInput = useCurrencyInput();

  const [totalReal, setTotalReal] = useState(0);
  const [diferencia, setDiferencia] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [cierreGuardado, setCierreGuardado] = useState(false);
  const [yaCerrado, setYaCerrado] = useState(false);
  const [montoInicialApertura, setMontoInicialApertura] = useState(0);
  const [realAuthUid, setRealAuthUid] = useState(null);

  const puedeCerrarCaja = hasPermission('cierre.create') || ['owner', 'admin'].includes(userProfile?.role);
  const puedeVerEsperado = hasPermission('cierre.view_expected') || ['owner', 'admin'].includes(userProfile?.role);

  // Desglose por método de pago
  const [desgloseSistema, setDesgloseSistema] = useState({
    efectivo: 0,
    transferencias: 0,
    tarjeta: 0,
    mixto: 0
  });

  const getActorIds = useCallback(() => {
    const employeeSession = getEmployeeSession();
    // Prioridad 1: ID real de la sesión de Supabase (dueño que dejó sesión abierta)
    // Prioridad 2: owner_id de la organización
    // Prioridad 3: ID de usuario del contexto (que en modo empleado es el del empleado)
    const currentUserId = realAuthUid || user?.id || null;

    if (employeeSession?.employee?.id) {
      const ownerId = organization?.owner_id || userProfile?.organization_owner_id;
      return {
        actorUserId: ownerId || currentUserId,
        actorEmployeeId: employeeSession.employee.id
      };
    }
    return { actorUserId: currentUserId, actorEmployeeId: null };
  }, [user?.id, organization?.owner_id, userProfile?.organization_owner_id, realAuthUid]);

  const cargarVentasHoy = useCallback(async () => {
    if (!userProfile?.organization_id || !user?.id) return;

    setCargando(true);
    try {
      const { actorUserId, actorEmployeeId } = getActorIds();
      const pendientesLocales = await getPendingVentas({
        organizationId: userProfile.organization_id,
        actorUserId,
        actorEmployeeId
      });
      const ventasPendientes = (pendientesLocales || []).map(venta => ({
        id: venta.id,
        total: venta.total || 0,
        metodo_pago: venta.metodo_pago || 'Efectivo',
        created_at: venta.created_at
      }));
      const ventasPendientesReales = ventasPendientes.filter(venta => {
        const metodo = (venta.metodo_pago || '').toUpperCase();
        return metodo !== 'COTIZACION' && metodo !== 'CREDITO';
      });

      if (!isOnline) {
        setVentasHoy(ventasPendientesReales);
        setVentasCreditoHoy([]);
        setPagosCreditoHoy([]);
        setTotalPagosCredito(0);
        setTotalPagosTotales(0);
        setTotalAbonos(0);
        const totalPendiente = ventasPendientesReales.reduce((sum, venta) => sum + (venta.total || 0), 0);
        setTotalSistema(totalPendiente);
        setDesgloseSistema(
          ventasPendientesReales.reduce(
            (acc, venta) => {
              const metodo = (venta.metodo_pago || '').toLowerCase();
              const montoTotal = venta.total || 0;
              if (metodo === 'efectivo') acc.efectivo += montoTotal;
              else if (metodo === 'transferencia' || metodo === 'nequi') acc.transferencias += montoTotal;
              else if (metodo === 'tarjeta') acc.tarjeta += montoTotal;
              else if (metodo === 'mixto') acc.mixto += montoTotal;
              return acc;
            },
            { efectivo: 0, transferencias: 0, tarjeta: 0, mixto: 0 }
          )
        );
        setCargando(false);
        return;
      }

      // Obtener la apertura activa para obtener el monto inicial
      const { data: aperturaActiva, error: errorApertura } = await supabase
        .from('aperturas_caja')
        .select('id, monto_inicial, created_at')
        .eq('organization_id', userProfile.organization_id)
        .is('cierre_id', null)
        .eq('estado', 'abierta')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorApertura) {
        console.error('Error obteniendo apertura activa:', errorApertura);
        setMontoInicialApertura(0);
      } else {
        setMontoInicialApertura(aperturaActiva?.monto_inicial || 0);
      }

      // 1. Obtener el último cierre de caja (sin limitar por día)
      const { data: ultimoCierre, error: errorCierres } = await supabase
        .from('cierres_caja')
        .select('created_at')
        .eq('organization_id', userProfile.organization_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorCierres) throw errorCierres;

      // Actualizar estado de si ya hay un cierre previo
      const hayUltioCierre = !!ultimoCierre?.created_at;
      setYaCerrado(hayUltioCierre);

      let ventasQuery = supabase
        .from('ventas')
        .select('*')
        .eq('organization_id', userProfile.organization_id)
        // Excluir cotizaciones y anuladas
        .neq('metodo_pago', 'COTIZACION')
        .neq('estado', 'cancelada');

      // 2. Si ya hay un cierre, solo mostrar ventas posteriores al último cierre
      if (hayUltioCierre) {
        ventasQuery = ventasQuery.gt('created_at', ultimoCierre.created_at);
      } else if (aperturaActiva?.created_at) {
        ventasQuery = ventasQuery.gte('created_at', aperturaActiva.created_at);
      }

      const { data: rawVentasData, error } = await ventasQuery.order('created_at', { ascending: false });

      if (error) throw error;

      // Cargar vendedores manualmente
      const employeeIds = [...new Set((rawVentasData || []).map(v => v.employee_id).filter(Boolean))];
      let vendedoresMap = new Map();
      if (employeeIds.length > 0) {
        const { data: vendedoresData } = await supabase
          .from('team_members')
          .select('id, employee_name')
          .in('id', employeeIds);
        vendedoresMap = new Map((vendedoresData || []).map(v => [v.id, v]));
      }

      const data = (rawVentasData || []).map(venta => ({
        ...venta,
        vendedor: venta.employee_id ? (vendedoresMap.get(venta.employee_id) || null) : null
      }));

      // Separar ventas reales de cotizaciones y créditos (por si alguna se filtró)
      const ventasReales = (data || []).filter(venta => {
        const metodo = (venta.metodo_pago || '').toUpperCase();
        const estado = (venta.estado || '').toLowerCase();
        const esCredito = venta.es_credito === true || metodo === 'CREDITO';
        // Excluir cotizaciones y créditos: método COTIZACION/CREDITO o estado cotizacion
        // También excluir devoluciones y cambios para que no sumen al total esperado
        return metodo !== 'COTIZACION' && metodo !== 'CREDITO' && estado !== 'cotizacion' && estado !== 'devolucion' && estado !== 'cambio' && !esCredito && !venta.metadata?.anulada;
      });

      // Separar ventas a crédito para mostrarlas aparte
      const ventasCredito = (data || []).filter(venta => {
        const metodo = (venta.metodo_pago || '').toUpperCase();
        const esCredito = venta.es_credito === true || metodo === 'CREDITO';
        return esCredito;
      });

      const ventasCombinadas = [...ventasPendientesReales, ...ventasReales].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setVentasHoy(ventasCombinadas);
      setVentasCreditoHoy(ventasCredito);
      const total = ventasCombinadas.reduce((sum, venta) => sum + (venta.total || 0), 0);
      setTotalSistema(total);

      // Cargar pagos de créditos recibidos desde el último cierre (o apertura)
      let pagosCreditoQuery = supabase
        .from('pagos_creditos')
        .select(`
          *,
          credito:creditos(id, monto_total, monto_pagado, monto_pendiente, estado, cliente:clientes(nombre, documento))
        `)
        .eq('organization_id', userProfile.organization_id);

      // Si ya hay un cierre, solo mostrar pagos posteriores al último cierre
      if (hayUltioCierre) {
        pagosCreditoQuery = pagosCreditoQuery.gt('created_at', ultimoCierre.created_at);
      } else if (aperturaActiva?.created_at) {
        pagosCreditoQuery = pagosCreditoQuery.gte('created_at', aperturaActiva.created_at);
      }

      const { data: rawPagosData = [], error: errorPagosCredito } = await pagosCreditoQuery
        .order('created_at', { ascending: false });

      if (errorPagosCredito) {
        console.error('Error cargando pagos de créditos:', errorPagosCredito);
      }

      // Cargar vendedores para pagos manualmente
      const pagosEmployeeIds = [...new Set(rawPagosData.map(p => p.employee_id).filter(Boolean))];
      let pagosVendedoresMap = new Map();
      if (pagosEmployeeIds.length > 0) {
        const { data: vData } = await supabase
          .from('team_members')
          .select('id, employee_name')
          .in('id', pagosEmployeeIds);
        pagosVendedoresMap = new Map((vData || []).map(v => [v.id, v]));
      }

      const pagosCreditoHoy = rawPagosData.map(pago => ({
        ...pago,
        vendedor: pago.employee_id ? (pagosVendedoresMap.get(pago.employee_id) || null) : null
      }));

      // Calcular desglose de pagos de créditos por método
      const desglosePagosCredito = pagosCreditoHoy.reduce((acc, pago) => {
        const metodo = (pago.metodo_pago || '').toLowerCase();
        const monto = parseFloat(pago.monto || 0);

        if (metodo === 'efectivo') {
          acc.efectivo += monto;
        } else if (metodo === 'transferencia') {
          acc.transferencias += monto;
        } else if (metodo === 'tarjeta') {
          acc.tarjeta += monto;
        } else if (metodo === 'nequi') {
          acc.transferencias += monto; // Nequi se cuenta como transferencia
        }

        return acc;
      }, { efectivo: 0, transferencias: 0, tarjeta: 0 });

      // Calcular total de pagos de créditos
      const totalPagosCredito = pagosCreditoHoy.reduce((sum, pago) => sum + parseFloat(pago.monto || 0), 0);

      // Identificar pagos totales vs abonos
      const pagosTotales = pagosCreditoHoy.filter(pago => {
        const credito = pago.credito;
        if (!credito) return false;
        // Si después del pago, el crédito quedó pagado, es un pago total
        const montoPago = parseFloat(pago.monto || 0);
        const montoPagadoAntes = parseFloat(credito.monto_pagado || 0) - montoPago;
        const montoPendienteAntes = parseFloat(credito.monto_total || 0) - montoPagadoAntes;
        return montoPago >= montoPendienteAntes; // El pago cubre todo lo pendiente
      });

      const abonos = pagosCreditoHoy.filter(pago => !pagosTotales.includes(pago));

      const totalPagosTotales = pagosTotales.reduce((sum, pago) => sum + parseFloat(pago.monto || 0), 0);
      const totalAbonos = abonos.reduce((sum, pago) => sum + parseFloat(pago.monto || 0), 0);

      // Guardar estados de pagos de créditos
      setPagosCreditoHoy(pagosCreditoHoy);
      setDesglosePagosCredito(desglosePagosCredito);
      setTotalPagosCredito(totalPagosCredito);
      setTotalPagosTotales(totalPagosTotales);
      setTotalAbonos(totalAbonos);

      // Calcular desglose por método de pago - procesando pagos mixtos (solo ventas reales, excluyendo créditos)
      const desglose = ventasCombinadas.reduce((acc, venta) => {
        const metodo = (venta.metodo_pago || '').toLowerCase();
        const montoTotal = venta.total || 0;
        let procesado = false;

        // OPCIÓN 1: Si existe la columna detalles_pago_mixto con JSONB (prioridad)
        if (venta.detalles_pago_mixto && typeof venta.detalles_pago_mixto === 'object') {
          const detalles = venta.detalles_pago_mixto;
          const metodo1 = (detalles.metodo1 || '').toLowerCase();
          const metodo2 = (detalles.metodo2 || '').toLowerCase();
          const monto1 = parseFloat(detalles.monto1) || 0;
          const monto2 = parseFloat(detalles.monto2) || 0;

          // Distribuir según método
          if (metodo1 === 'efectivo') acc.efectivo += monto1;
          else if (metodo1 === 'transferencia') acc.transferencias += monto1;
          else if (metodo1 === 'tarjeta') acc.tarjeta += monto1;
          else if (metodo1 === 'nequi') acc.transferencias += monto1; // Nequi se cuenta como transferencia

          if (metodo2 === 'efectivo') acc.efectivo += monto2;
          else if (metodo2 === 'transferencia') acc.transferencias += monto2;
          else if (metodo2 === 'tarjeta') acc.tarjeta += monto2;
          else if (metodo2 === 'nequi') acc.transferencias += monto2; // Nequi se cuenta como transferencia

          procesado = true;
        }
        // OPCIÓN 2: Si es pago mixto pero en formato string (compatibilidad con ventas antiguas)
        else if (metodo === 'mixto' || metodo.startsWith('mixto (') || metodo.startsWith('mixto(')) {
          // Intentar múltiples formatos de regex para mayor compatibilidad
          // Formato esperado: "Mixto (Efectivo: $ 20.000 + Transferencia: $ 20.000)"
          // El formatCOP genera: "$ 20.000" (con espacio después del $)
          let match = venta.metodo_pago.match(/Mixto\s*\((.+?):\s*\$?\s*([\d,.]+)\s*\+\s*(.+?):\s*\$?\s*([\d,.]+)\)/i);

          if (!match) {
            // Intentar formato alternativo sin paréntesis
            match = venta.metodo_pago.match(/Mixto\s+(.+?):\s*\$?\s*([\d,.]+)\s*\+\s*(.+?):\s*\$?\s*([\d,.]+)/i);
          }

          if (match) {
            const metodo1 = match[1].toLowerCase().trim();
            // Remover puntos (separadores de miles) y convertir coma a punto si existe
            const monto1String = match[2].replace(/\./g, '').replace(',', '.');
            const monto1 = parseFloat(monto1String) || 0;
            const metodo2 = match[3].toLowerCase().trim();
            const monto2String = match[4].replace(/\./g, '').replace(',', '.');
            const monto2 = parseFloat(monto2String) || 0;

            // Distribuir los montos según el método
            if (metodo1 === 'efectivo') acc.efectivo += monto1;
            else if (metodo1 === 'transferencia') acc.transferencias += monto1;
            else if (metodo1 === 'tarjeta') acc.tarjeta += monto1;
            else if (metodo1 === 'nequi') acc.transferencias += monto1; // Nequi se cuenta como transferencia

            if (metodo2 === 'efectivo') acc.efectivo += monto2;
            else if (metodo2 === 'transferencia') acc.transferencias += monto2;
            else if (metodo2 === 'tarjeta') acc.tarjeta += monto2;
            else if (metodo2 === 'nequi') acc.transferencias += monto2; // Nequi se cuenta como transferencia

            procesado = true;
          } else {
            // Si no se puede parsear, intentar usar el total y distribuir proporcionalmente
            // o registrar en consola para debugging
            console.warn('No se pudo parsear pago mixto, intentando fallback:', venta.metodo_pago, venta.id);
            // Como último recurso, si tiene detalles_pago_mixto pero no se procesó antes, intentar de nuevo
            if (venta.detalles_pago_mixto && typeof venta.detalles_pago_mixto === 'string') {
              try {
                const detalles = JSON.parse(venta.detalles_pago_mixto);
                const metodo1 = (detalles.metodo1 || '').toLowerCase();
                const metodo2 = (detalles.metodo2 || '').toLowerCase();
                const monto1 = parseFloat(detalles.monto1) || 0;
                const monto2 = parseFloat(detalles.monto2) || 0;

                if (metodo1 === 'efectivo') acc.efectivo += monto1;
                else if (metodo1 === 'transferencia') acc.transferencias += monto1;
                else if (metodo1 === 'tarjeta') acc.tarjeta += monto1;
                else if (metodo1 === 'nequi') acc.transferencias += monto1;

                if (metodo2 === 'efectivo') acc.efectivo += monto2;
                else if (metodo2 === 'transferencia') acc.transferencias += monto2;
                else if (metodo2 === 'tarjeta') acc.tarjeta += monto2;
                else if (metodo2 === 'nequi') acc.transferencias += monto2;

                procesado = true;
              } catch (e) {
                console.error('Error parseando detalles_pago_mixto como string:', e);
              }
            }
          }
        }

        // Si no se procesó como pago mixto, procesar como método único
        if (!procesado) {
          // Excluir créditos del desglose (ya se filtraron antes, pero por seguridad)
          if (venta.es_credito === true || metodo === 'credito') {
            // No agregar a ningún método de pago
            return acc;
          }

          if (metodo === 'efectivo') {
            acc.efectivo += montoTotal;
          } else if (metodo === 'transferencia') {
            acc.transferencias += montoTotal;
          } else if (metodo === 'tarjeta') {
            acc.tarjeta += montoTotal;
          } else if (metodo === 'nequi') {
            acc.transferencias += montoTotal; // Nequi se cuenta como transferencia
          } else {
            // Métodos desconocidos o sin clasificar
            acc.mixto += montoTotal;
          }
        }

        return acc;
      }, { efectivo: 0, transferencias: 0, tarjeta: 0, mixto: 0 });

      // Sumar los pagos de créditos al desglose (estos SÍ cuentan en el cierre porque son dinero recibido)
      // Nota: desglosePagosCredito, totalPagosCredito ya fueron calculados arriba
      const desgloseFinal = {
        efectivo: desglose.efectivo + desglosePagosCredito.efectivo,
        transferencias: desglose.transferencias + desglosePagosCredito.transferencias,
        tarjeta: desglose.tarjeta + desglosePagosCredito.tarjeta,
        mixto: desglose.mixto
      };

      // Actualizar el total del sistema para incluir los pagos de créditos
      const totalConPagosCredito = total + totalPagosCredito;
      setTotalSistema(totalConPagosCredito);
      setDesgloseSistema(desgloseFinal);

      // Cargar cotizaciones por separado (solo informativas, no cuentan en totales)
      try {
        let cotizacionesQuery = supabase
          .from('ventas')
          .select('*')
          .eq('organization_id', userProfile.organization_id)
          .eq('metodo_pago', 'COTIZACION');

        // Si ya hay un cierre, solo mostrar cotizaciones posteriores al último cierre
        if (hayUltioCierre) {
          cotizacionesQuery = cotizacionesQuery.gt('created_at', ultimoCierre.created_at);
        } else if (aperturaActiva?.created_at) {
          cotizacionesQuery = cotizacionesQuery.gte('created_at', aperturaActiva.created_at);
        }

        const { data: rawCotizaciones, error: cotizacionesError } = await cotizacionesQuery
          .order('created_at', { ascending: false });

        if (!cotizacionesError && rawCotizaciones) {
          // Cargar vendedores para cotizaciones
          const cotizEmployeeIds = [...new Set(rawCotizaciones.map(v => v.employee_id).filter(Boolean))];
          let cotizVendedoresMap = new Map();
          if (cotizEmployeeIds.length > 0) {
            const { data: cvData } = await supabase
              .from('team_members')
              .select('id, employee_name')
              .in('id', cotizEmployeeIds);
            cotizVendedoresMap = new Map((cvData || []).map(v => [v.id, v]));
          }

          const cotizacionesFinal = rawCotizaciones.map(v => ({
            ...v,
            vendedor: v.employee_id ? (cotizVendedoresMap.get(v.employee_id) || null) : null
          }));
          setCotizacionesHoy(cotizacionesFinal);
        }
      } catch (cotizError) {
        console.warn('Error cargando cotizaciones (no crítico):', cotizError);
        setCotizacionesHoy([]);
      }
    } catch (error) {
      console.error('Error cargando ventas:', error);
      setMensaje({ tipo: 'error', texto: 'Error al cargar las ventas' });
    } finally {
      setCargando(false);
    }
  }, [userProfile?.organization_id, user?.id, getActorIds, isOnline]);

  useEffect(() => {
    cargarVentasHoy();

    // Obtener el ID real de la sesión de Supabase para RLS
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) {
        setRealAuthUid(data.user.id);
      }
    });
  }, [cargarVentasHoy]);

  useEffect(() => {
    // Calcular valores numéricos desde displayValue para asegurar que se actualicen correctamente
    const efectivo = efectivoRealInput.displayValue ? parseFloat(efectivoRealInput.displayValue.replace(/\./g, '')) || 0 : 0;
    const transferencias = transferenciasRealInput.displayValue ? parseFloat(transferenciasRealInput.displayValue.replace(/\./g, '')) || 0 : 0;
    const tarjeta = tarjetaRealInput.displayValue ? parseFloat(tarjetaRealInput.displayValue.replace(/\./g, '')) || 0 : 0;
    // El monto inicial NO se suma al total real porque ya está incluido en el efectivo físico que cuenta el usuario
    // El usuario cuenta TODO el efectivo en caja (monto inicial + ventas en efectivo del día)
    const total = efectivo + transferencias + tarjeta;
    setTotalReal(total);

    if (efectivoRealInput.displayValue !== '' || transferenciasRealInput.displayValue !== '' || tarjetaRealInput.displayValue !== '') {
      // La diferencia se calcula: Total Real - (Total Sistema + Monto Inicial)
      // Porque el Total Real incluye el monto inicial, pero el Total Sistema solo incluye las ventas del día
      const totalEsperado = totalSistema + montoInicialApertura;
      setDiferencia(total - totalEsperado);
    } else {
      setDiferencia(null);
    }
  }, [efectivoRealInput.displayValue, transferenciasRealInput.displayValue, tarjetaRealInput.displayValue, totalSistema, montoInicialApertura]);

  const generarTextoCierre = () => {
    const fecha = new Date().toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const resumenSistema = puedeVerEsperado ? `
📊 RESUMEN REGISTRADO EN SISTEMA:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💵 Efectivo registrado en sistema: ${formatCOP(desgloseSistema.efectivo)}
📲 Transferencias registradas en sistema: ${formatCOP(desgloseSistema.transferencias)}
💳 Tarjeta registrada en sistema: ${formatCOP(desgloseSistema.tarjeta)}${desgloseSistema.mixto > 0 ? `
💰 Mixto registrado en sistema: ${formatCOP(desgloseSistema.mixto)}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL REGISTRADO EN SISTEMA: ${formatCOP(totalSistema)}
` : '';

    const montoInicialTexto = puedeVerEsperado ? `
🏦 Monto Inicial (referencia): ${formatCOP(montoInicialApertura)}` : '';

    const resultadoTexto = puedeVerEsperado && diferencia !== null ? `
📈 RESULTADO:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${diferencia === 0 ? '✅ Cuadra exacto' :
        diferencia > 0 ? `⬆️ Sobrante: ${formatCOP(Math.abs(diferencia))}` :
          `⬇️ Faltante: ${formatCOP(Math.abs(diferencia))}`}
` : '';

    return `
🧾 CIERRE DE CAJA - ${fecha}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${resumenSistema}
💰 CONTEO REAL:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${montoInicialTexto}
💵 Efectivo real en caja: ${formatCOP(efectivoRealInput.numericValue)}
📲 Transferencias reales recibidas: ${formatCOP(transferenciasRealInput.numericValue)}
💳 Pago con tarjetas real recibido: ${formatCOP(tarjetaRealInput.numericValue)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL REAL: ${formatCOP(totalReal)}
${resultadoTexto}
📦 Total de ventas: ${ventasHoy.length}

Generado por Crece+ 🚀
    `.trim();
  };

  const compartirCierre = async () => {
    const texto = generarTextoCierre();

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Cierre de Caja',
          text: texto
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error compartiendo:', error);
          copiarAlPortapapeles(texto);
        }
      }
    } else {
      copiarAlPortapapeles(texto);
    }
  };

  const copiarAlPortapapeles = (texto) => {
    navigator.clipboard.writeText(texto).then(() => {
      setMensaje({ tipo: 'success', texto: 'Cierre copiado al portapapeles' });
      setTimeout(() => setMensaje({ tipo: '', texto: '' }), 3000);
    }).catch(err => {
      console.error('Error copiando al portapapeles:', err);
      setMensaje({ tipo: 'error', texto: 'No se pudo copiar' });
    });
  };

  const descargarCierre = () => {
    const texto = generarTextoCierre();
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cierre_caja_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setMensaje({ tipo: 'success', texto: 'Cierre descargado correctamente' });
    setTimeout(() => setMensaje({ tipo: '', texto: '' }), 3000);
  };

  const guardarCierre = async () => {
    if (!user?.id) {
      setMensaje({ tipo: 'error', texto: 'No hay usuario activo para cerrar caja' });
      return;
    }
    if (efectivoRealInput.displayValue === '' && transferenciasRealInput.displayValue === '' && tarjetaRealInput.displayValue === '') {
      setMensaje({ tipo: 'error', texto: 'Por favor ingresa al menos un monto' });
      return;
    }

    setGuardando(true);
    try {
      if (!isOnline) {
        const { actorUserId, actorEmployeeId } = getActorIds();
        const cierreData = {
          organization_id: userProfile.organization_id,
          user_id: actorUserId,
          employee_id: actorEmployeeId,
          fecha: new Date().toISOString().split('T')[0],
          sistema_efectivo: desgloseSistema.efectivo,
          sistema_transferencias: desgloseSistema.transferencias,
          sistema_tarjeta: desgloseSistema.tarjeta,
          sistema_otros: 0,
          total_sistema: totalSistema,
          real_efectivo: efectivoRealInput.numericValue,
          real_transferencias: transferenciasRealInput.numericValue,
          real_tarjeta: tarjetaRealInput.numericValue,
          real_otros: 0,
          total_real: totalReal,
          diferencia: diferencia,
          cantidad_ventas: ventasHoy.length,
          created_at: new Date().toISOString()
        };

        await enqueueCierre({
          cierreData,
          actorUserId,
          actorEmployeeId,
          organizationId: userProfile.organization_id
        });

        setMensaje({ tipo: 'success', texto: 'Cierre guardado localmente. Se sincronizará al reconectar.' });
        setCierreGuardado(true);

        setTimeout(() => {
          efectivoRealInput.reset();
          transferenciasRealInput.reset();
          tarjetaRealInput.reset();
          setTotalReal(0);
          setDiferencia(null);
          setMensaje({ tipo: '', texto: '' });
          setVentasHoy([]);
          setTotalSistema(0);
          setDesgloseSistema({ efectivo: 0, transferencias: 0, tarjeta: 0, mixto: 0 });
          setCierreGuardado(false);
          cargarVentasHoy();
        }, 3000);
        return;
      }

      // Primero, obtener la apertura activa para cerrarla
      const { actorUserId, actorEmployeeId } = getActorIds();

      const { data: aperturaActiva, error: errorApertura } = await supabase
        .from('aperturas_caja')
        .select('id, monto_inicial')
        .eq('organization_id', userProfile.organization_id)
        .is('cierre_id', null)
        .eq('estado', 'abierta')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (errorApertura) {
        console.error('Error obteniendo apertura activa:', errorApertura);
      }

      // Log de depuración para RLS
      console.log('🚀 Intentando guardar cierre con datos:', {
        organization_id: userProfile?.organization_id,
        user_id: actorUserId,
        employee_id: actorEmployeeId,
        auth_uid: (await supabase.auth.getUser()).data.user?.id
      });

      // Crear el cierre de caja
      const { data: cierreData, error } = await supabase
        .from('cierres_caja')
        .insert({
          organization_id: userProfile.organization_id,
          user_id: actorUserId,
          employee_id: actorEmployeeId,
          fecha: new Date().toISOString().split('T')[0],
          // Desglose del sistema
          sistema_efectivo: desgloseSistema.efectivo,
          sistema_transferencias: desgloseSistema.transferencias,
          sistema_tarjeta: desgloseSistema.tarjeta,
          sistema_otros: 0,
          total_sistema: totalSistema,
          // Desglose real contado
          real_efectivo: efectivoRealInput.numericValue,
          real_transferencias: transferenciasRealInput.numericValue,
          real_tarjeta: tarjetaRealInput.numericValue,
          real_otros: 0,
          total_real: totalReal,
          // Diferencia y metadata
          diferencia: diferencia,
          cantidad_ventas: ventasHoy.length,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error detallado:', error);
        throw error;
      }

      // Si hay una apertura activa, cerrarla vinculándola con el cierre
      if (aperturaActiva && cierreData) {
        const { error: errorCerrarApertura } = await supabase
          .from('aperturas_caja')
          .update({
            cierre_id: cierreData.id,
            estado: 'cerrada',
            updated_at: new Date().toISOString()
          })
          .eq('id', aperturaActiva.id);

        if (errorCerrarApertura) {
          console.error('Error cerrando apertura:', errorCerrarApertura);
          // No lanzar error, solo loguear, ya que el cierre ya se guardó
        }
      }

      setMensaje({ tipo: 'success', texto: 'Cierre de caja guardado. Redirigiendo...' });
      setCierreGuardado(true); // Activar botones de compartir/descargar

      // Redirigir a caja después de 1 segundo para forzar la nueva apertura
      setTimeout(() => {
        navigate('/dashboard/caja');
      }, 1000);
    } catch (error) {
      console.error('Error guardando cierre:', error);
      setMensaje({ tipo: 'error', texto: 'Error al guardar el cierre de caja' });
    } finally {
      setGuardando(false);
    }
  };

  const formatCOP = (value) => {
    // Formato colombiano: $ 1.000.000 (puntos para miles)
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0
    }).format(value);
  };

  const formatHora = (fecha) => {
    return new Date(fecha).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMetodoIcon = (metodo) => {
    switch (metodo) {
      case 'efectivo': return <Banknote size={16} />;
      case 'tarjeta': return <CreditCard size={16} />;
      case 'transferencia': return <Smartphone size={16} />;
      default: return <DollarSign size={16} />;
    }
  };

  if (cargando) {
    return (
      <div className="cierre-caja-loading">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Calculator size={48} />
        </motion.div>
        <p>Cargando ventas...</p>
      </div>
    );
  }

  if (!puedeCerrarCaja) {
    return (
      <div className="cierre-container">
        <div className="cierre-mensaje">
          <AlertCircle size={20} />
          <span>No tienes permisos para realizar el cierre de caja.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cierre-caja">
      <motion.div
        className="cierre-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Calculator size={32} />
        <h1>Cierre de Caja</h1>
        <p>{new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </motion.div>
      {!isOnline && (
        <div
          style={{
            background: '#fff7ed',
            border: '1px solid #fdba74',
            color: '#9a3412',
            padding: '0.6rem 0.9rem',
            borderRadius: '10px',
            fontSize: '0.9rem',
            marginBottom: '0.75rem'
          }}
        >
          Sin internet: el cierre se guardará localmente y se sincronizará al reconectar.
        </div>
      )}
      {isOnline && isSyncing && (
        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #93c5fd',
            color: '#1d4ed8',
            padding: '0.6rem 0.9rem',
            borderRadius: '10px',
            fontSize: '0.9rem',
            marginBottom: '0.75rem'
          }}
        >
          Sincronizando cierres y ventas pendientes...
        </div>
      )}

      {yaCerrado && ventasHoy.length === 0 && (
        <motion.div
          className="cierre-info-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <CheckCircle size={20} />
          <span>
            <strong>Cierre realizado:</strong> Ya se realizó un cierre de caja.
            {' '}Las ventas nuevas se mostrarán aquí para el próximo cierre.
          </span>
        </motion.div>
      )}

      {mensaje.texto && (
        <motion.div
          className={`cierre-mensaje ${mensaje.tipo}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          {mensaje.tipo === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span>{mensaje.texto}</span>
        </motion.div>
      )}

      <div className="cierre-grid">
        {/* Panel de resumen */}
        {puedeVerEsperado ? (
          <motion.div
            className="cierre-panel resumen"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2><ShoppingCart size={20} /> Resumen Registrado en Sistema</h2>

            <div className="resumen-cards">
              <div className="resumen-card">
                <ShoppingCart size={24} />
                <div>
                  <p className="resumen-label">Ventas Registradas</p>
                  <h3>{ventasHoy.length}</h3>
                </div>
              </div>

              <div className="resumen-card total">
                <TrendingUp size={24} />
                <div>
                  <p className="resumen-label">Total Registrado en Sistema</p>
                  <h3>{formatCOP(totalSistema)}</h3>
                </div>
              </div>
            </div>

            {/* Desglose por método de pago */}
            <div className="desglose-metodos">
              <h3>Desglose por Método</h3>
              <div className="metodo-item">
                <Banknote size={18} />
                <span>Efectivo registrado en sistema:</span>
                <strong>{formatCOP(desgloseSistema.efectivo)}</strong>
              </div>
              <div className="metodo-item">
                <Smartphone size={18} />
                <span>Transferencias registradas en sistema:</span>
                <strong>{formatCOP(desgloseSistema.transferencias)}</strong>
              </div>
              <div className="metodo-item">
                <CreditCard size={18} />
                <span>Tarjeta registrada en sistema:</span>
                <strong>{formatCOP(desgloseSistema.tarjeta)}</strong>
              </div>
              {desgloseSistema.mixto > 0 && (
                <div className="metodo-item">
                  <DollarSign size={18} />
                  <span>Mixto registrado en sistema:</span>
                  <strong>{formatCOP(desgloseSistema.mixto)}</strong>
                </div>
              )}
            </div>

            <div className="ventas-lista">
              <h3>Ventas de Hoy</h3>
              {ventasHoy.length === 0 ? (
                <div className="no-ventas">
                  <CheckCircle size={32} />
                  <p>No hay ventas pendientes de cerrar</p>
                  <small>Todas las ventas de hoy ya fueron cerradas</small>
                </div>
              ) : (
                <div className="ventas-scroll">{ventasHoy.map((venta, index) => (
                  <motion.div
                    key={venta.id}
                    className="venta-item"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="venta-hora">{formatHora(venta.created_at)}</div>
                    <div className="venta-metodo">
                      {getMetodoIcon(venta.metodo_pago)}
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{venta.metodo_pago}</span>
                        {venta.vendedor?.employee_name && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            Por: {venta.vendedor.employee_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="venta-total">{formatCOP(venta.total)}</div>
                  </motion.div>
                ))}
                </div>
              )}
            </div>

            {/* Sección informativa de ventas a crédito (no cuentan en totales) */}
            {ventasCreditoHoy.length > 0 && (
              <div className="cotizaciones-lista" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  <Receipt size={16} />
                  Ventas a Crédito (Informativo)
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                  Estas ventas a crédito no se cuentan en el cierre de caja porque el dinero aún no se ha recibido. Se gestionan en el módulo de Créditos.
                </p>
                <div className="ventas-scroll" style={{ maxHeight: '200px' }}>
                  {ventasCreditoHoy.map((venta, index) => (
                    <motion.div
                      key={venta.id}
                      className="venta-item"
                      style={{ opacity: 0.7, backgroundColor: '#fef3c7' }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 0.7, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div className="venta-hora">{formatHora(venta.created_at)}</div>
                      <div className="venta-metodo">
                        <Receipt size={16} />
                        <span>Crédito</span>
                      </div>
                      <div className="venta-total" style={{ color: '#d97706' }}>{formatCOP(venta.total)}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Sección de pagos de créditos recibidos (SÍ cuentan en el cierre) */}
            {pagosCreditoHoy.length > 0 && (
              <div className="pagos-credito-lista" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontSize: '1rem', marginBottom: '0.75rem' }}>
                  <Receipt size={18} />
                  Pagos de Créditos Recibidos
                </h3>
                <div style={{
                  background: '#f0fdf4',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  marginBottom: '0.75rem',
                  fontSize: '0.875rem',
                  color: '#166534'
                }}>
                  <p style={{ marginBottom: '0.5rem', fontWeight: 600 }}>
                    Total recibido: <strong>{formatCOP(totalPagosCredito)}</strong>
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <span>
                      Pagos totales: <strong>{formatCOP(totalPagosTotales)}</strong> ({pagosCreditoHoy.filter(p => {
                        const credito = p.credito;
                        if (!credito) return false;
                        const montoPago = parseFloat(p.monto || 0);
                        const montoPagadoAntes = parseFloat(credito.monto_pagado || 0) - montoPago;
                        const montoPendienteAntes = parseFloat(credito.monto_total || 0) - montoPagadoAntes;
                        return montoPago >= montoPendienteAntes;
                      }).length} créditos)
                    </span>
                    <span>
                      Abonos: <strong>{formatCOP(totalAbonos)}</strong> ({pagosCreditoHoy.filter(p => {
                        const credito = p.credito;
                        if (!credito) return true;
                        const montoPago = parseFloat(p.monto || 0);
                        const montoPagadoAntes = parseFloat(credito.monto_pagado || 0) - montoPago;
                        const montoPendienteAntes = parseFloat(credito.monto_total || 0) - montoPagadoAntes;
                        return montoPago < montoPendienteAntes;
                      }).length} pagos)
                    </span>
                  </div>
                </div>
                <div className="ventas-scroll" style={{ maxHeight: '250px' }}>
                  {pagosCreditoHoy.map((pago, index) => {
                    const credito = pago.credito;
                    const esPagoTotal = credito && (() => {
                      const montoPago = parseFloat(pago.monto || 0);
                      const montoPagadoAntes = parseFloat(credito.monto_pagado || 0) - montoPago;
                      const montoPendienteAntes = parseFloat(credito.monto_total || 0) - montoPagadoAntes;
                      return montoPago >= montoPendienteAntes;
                    })();

                    return (
                      <motion.div
                        key={pago.id}
                        className="venta-item"
                        style={{
                          backgroundColor: esPagoTotal ? '#dcfce7' : '#fef3c7',
                          borderLeft: `3px solid ${esPagoTotal ? '#10b981' : '#d97706'}`
                        }}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <div className="venta-hora">{formatHora(pago.created_at)}</div>
                        <div className="venta-metodo" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {getMetodoIcon(pago.metodo_pago)}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span>{pago.metodo_pago}</span>
                              {pago.vendedor?.employee_name && (
                                <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                                  Por: {pago.vendedor.employee_name}
                                </span>
                              )}
                            </div>
                          </div>
                          {credito?.cliente && (
                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                              {credito.cliente.nombre || 'Cliente'}
                              {credito.cliente.documento && ` (${credito.cliente.documento})`}
                            </span>
                          )}
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '4px',
                            background: esPagoTotal ? '#dcfce7' : '#fef3c7',
                            color: esPagoTotal ? '#166534' : '#d97706',
                            fontWeight: 600
                          }}>
                            {esPagoTotal ? 'Pago Total' : 'Abono'}
                          </span>
                        </div>
                        <div className="venta-total" style={{ color: esPagoTotal ? '#10b981' : '#d97706' }}>
                          {formatCOP(parseFloat(pago.monto || 0))}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sección informativa de cotizaciones (no cuentan en totales) */}
            {cotizacionesHoy.length > 0 && (
              <div className="cotizaciones-lista" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  <AlertCircle size={16} />
                  Cotizaciones Pendientes (Informativo)
                </h3>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                  Estas cotizaciones no se cuentan en el cierre de caja hasta que se conviertan en ventas efectivas.
                </p>
                <div className="ventas-scroll" style={{ maxHeight: '200px' }}>
                  {cotizacionesHoy.map((cotizacion, index) => (
                    <motion.div
                      key={cotizacion.id}
                      className="venta-item"
                      style={{ opacity: 0.7, backgroundColor: '#f9fafb' }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 0.7, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div className="venta-hora">{formatHora(cotizacion.created_at)}</div>
                      <div className="venta-metodo">
                        <AlertCircle size={16} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>Cotización</span>
                          {cotizacion.vendedor?.employee_name && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              Por: {cotizacion.vendedor.employee_name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="venta-total" style={{ color: '#6b7280' }}>{formatCOP(cotizacion.total)}</div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            className="cierre-panel resumen"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h2><ShoppingCart size={20} /> Resumen Registrado en Sistema</h2>
            <div className="no-ventas" style={{ marginTop: '1rem' }}>
              <AlertCircle size={28} />
              <p>Resumen del sistema oculto para tu rol</p>
              <small>El administrador validará si el cierre cuadra</small>
            </div>
          </motion.div>
        )}

        {/* Panel de cierre */}
        <motion.div
          className="cierre-panel calculo"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2><Calculator size={20} /> Cierre Real</h2>

          <div className="calculo-container">
            {puedeVerEsperado && montoInicialApertura > 0 && (
              <div className="monto-inicial-info" style={{
                background: 'var(--bg-secondary)',
                padding: '1rem',
                borderRadius: '12px',
                marginBottom: '1rem',
                border: '1px solid var(--border-primary)',
                textAlign: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <DollarSign size={18} />
                  <strong>Monto Inicial de Apertura</strong>
                </div>
                <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--accent-primary)' }}>
                  {formatCOP(montoInicialApertura)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Este monto ya está incluido cuando cuentas el efectivo físico en caja
                </div>
              </div>
            )}

            <div className="input-group">
              <label>
                <Banknote size={20} />
                Efectivo Real en Caja
              </label>
              <input
                type="text"
                value={efectivoRealInput.displayValue}
                onChange={efectivoRealInput.handleChange}
                placeholder="0"
                inputMode="numeric"
                className="input-total-contado"
              />
              <span className="input-hint">Cuenta el efectivo físico en caja</span>
              {puedeVerEsperado && (
                <span className="sistema-vs-contado">Efectivo registrado en sistema: {formatCOP(desgloseSistema.efectivo)}</span>
              )}
            </div>

            <div className="input-group">
              <label>
                <Smartphone size={20} />
                Transferencias Reales Recibidas
              </label>
              <input
                type="text"
                value={transferenciasRealInput.displayValue}
                onChange={transferenciasRealInput.handleChange}
                placeholder="0"
                inputMode="numeric"
                className="input-total-contado"
              />
              <span className="input-hint">Verifica las transferencias recibidas</span>
              {puedeVerEsperado && (
                <span className="sistema-vs-contado">Transferencias registradas en sistema: {formatCOP(desgloseSistema.transferencias)}</span>
              )}
            </div>

            <div className="input-group">
              <label>
                <CreditCard size={20} />
                Pago con Tarjetas Real Recibido
              </label>
              <input
                type="text"
                value={tarjetaRealInput.displayValue}
                onChange={tarjetaRealInput.handleChange}
                placeholder="0"
                inputMode="numeric"
                className="input-total-contado"
              />
              <span className="input-hint">Verifica los pagos con tarjeta</span>
              {puedeVerEsperado && (
                <span className="sistema-vs-contado">Tarjeta registrada en sistema: {formatCOP(desgloseSistema.tarjeta)}</span>
              )}
            </div>

            {(efectivoRealInput.displayValue !== '' || transferenciasRealInput.displayValue !== '' || tarjetaRealInput.displayValue !== '') && (
              <div className="total-contado-calculado">
                <DollarSign size={20} />
                <span>Total Real:</span>
                <strong>{formatCOP(totalReal)}</strong>
              </div>
            )}

            {puedeVerEsperado && diferencia !== null && (
              <motion.div
                className={`diferencia-box ${diferencia === 0 ? 'exacto' : diferencia > 0 ? 'sobrante' : 'faltante'}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {diferencia === 0 ? (
                  <>
                    <CheckCircle size={32} />
                    <div>
                      <h3>¡Perfecto! Cuadra exacto</h3>
                      <p>No hay diferencias entre lo esperado (sistema + monto inicial) y el efectivo real</p>
                    </div>
                  </>
                ) : diferencia > 0 ? (
                  <>
                    <TrendingUp size={32} />
                    <div>
                      <h3>Sobrante: {formatCOP(Math.abs(diferencia))}</h3>
                      <p>Hay más efectivo del que indica el sistema</p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle size={32} />
                    <div>
                      <h3>Faltante: {formatCOP(Math.abs(diferencia))}</h3>
                      <p>Hay menos efectivo del que indica el sistema</p>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            <div className="comparacion-table">
              <div className="comparacion-row header">
                <span>Concepto</span>
                <span>Monto</span>
              </div>
              {puedeVerEsperado && montoInicialApertura > 0 && (
                <div className="comparacion-row">
                  <span><DollarSign size={16} /> Monto Inicial</span>
                  <span className="sistema">{formatCOP(montoInicialApertura)}</span>
                </div>
              )}
              {puedeVerEsperado && (
                <div className="comparacion-row">
                  <span><TrendingUp size={16} /> Total Registrado en Sistema</span>
                  <span className="sistema">{formatCOP(totalSistema)}</span>
                </div>
              )}
              {puedeVerEsperado && montoInicialApertura > 0 && (
                <div className="comparacion-row">
                  <span><Calculator size={16} /> Total Esperado (Sistema + Inicial)</span>
                  <span className="sistema">{formatCOP(totalSistema + montoInicialApertura)}</span>
                </div>
              )}
              <div className="comparacion-row">
                <span><DollarSign size={16} /> Total Real</span>
                <span className="contado">{formatCOP(totalReal)}</span>
              </div>
              {puedeVerEsperado && diferencia !== null && (
                <div className="comparacion-row total">
                  <span>{diferencia >= 0 ? <TrendingUp size={16} /> : <XCircle size={16} />} Diferencia</span>
                  <span className={diferencia >= 0 ? 'positivo' : 'negativo'}>
                    {diferencia >= 0 ? '+' : ''}{formatCOP(diferencia)}
                  </span>
                </div>
              )}
            </div>

            <button
              className="btn-guardar-cierre"
              onClick={guardarCierre}
              disabled={guardando || (efectivoRealInput.displayValue === '' && transferenciasRealInput.displayValue === '' && tarjetaRealInput.displayValue === '')}
            >
              <Save size={20} />
              {guardando ? 'Guardando...' : 'Guardar Cierre de Caja'}
            </button>

            {cierreGuardado && (
              <motion.div
                className="botones-acciones"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <button
                  className="btn-accion compartir"
                  onClick={compartirCierre}
                  title="Compartir cierre"
                >
                  <Share2 size={18} />
                  Compartir
                </button>

                <button
                  className="btn-accion descargar"
                  onClick={descargarCierre}
                  title="Descargar cierre"
                >
                  <Download size={18} />
                  Descargar
                </button>
              </motion.div>
            )}

            <div className="cierre-nota">
              <AlertCircle size={16} />
              <p>
                <strong>Nota:</strong> El cierre de caja debe realizarse al final del día.
                Asegúrate de contar todo el efectivo y verificar transferencias antes de guardar.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default CierreCaja;
