import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/api/supabaseClient';
import toast from 'react-hot-toast';
import { enqueueVenta, cacheVentas, getCachedVentas, getPendingVentas } from '../utils/offlineQueue';

// Hook para obtener ventas
export const useVentas = (organizationId, limit = 100, historyDays = null, employeeId = null, includeCotizaciones = false, startDate = null, endDate = null, estadoFilter = null) => {
  return useQuery({
    queryKey: ['ventas', organizationId, limit, historyDays, employeeId, includeCotizaciones, startDate, endDate, estadoFilter],
    queryFn: async () => {
      if (!organizationId) return [];
      const applyFilters = (ventas = []) => {
        let filtradas = ventas;
        if (historyDays !== null && historyDays !== undefined) {
          const fechaLimite = new Date();
          fechaLimite.setDate(fechaLimite.getDate() - historyDays);
          filtradas = filtradas.filter(venta => {
            const fecha = new Date(venta.created_at || venta.fecha);
            return fecha >= fechaLimite;
          });
        }
        if (startDate) {
          let start;
          if (startDate.includes('-')) {
            const [year, month, day] = startDate.split('-').map(Number);
            start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
          } else {
            start = new Date(startDate).getTime();
          }
          filtradas = filtradas.filter(venta => {
            const fecha = new Date(venta.created_at || venta.fecha).getTime();
            return fecha >= start;
          });
        }
        if (endDate) {
          let endTime;
          if (endDate.includes('-')) {
            const [year, month, day] = endDate.split('-').map(Number);
            endTime = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
          } else {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            endTime = end.getTime();
          }
          filtradas = filtradas.filter(venta => {
            const fecha = new Date(venta.created_at || venta.fecha).getTime();
            return fecha <= endTime;
          });
        }
        if (estadoFilter && estadoFilter !== 'todos') {
          filtradas = filtradas.filter(venta => {
            const esCotizacion = venta.estado === 'cotizacion' || (venta.metodo_pago || '').toUpperCase() === 'COTIZACION';
            const esAnulada = (venta.total === 0 && (!venta.items || venta.items.length === 0)) || venta.estado === 'anulada';
            const esRechazada = venta.estado === 'rechazada' || venta.estado === 'cancelada' || venta.estado === 'fallida';
            
            switch (estadoFilter) {
              case 'efectiva':
                return !esCotizacion && !esAnulada && !esRechazada;
              case 'anulada':
                return esAnulada;
              case 'rechazada':
                return esRechazada;
              default:
                return true;
            }
          });
        }
        return filtradas
          .sort((a, b) => new Date(b.created_at || b.fecha).getTime() - new Date(a.created_at || a.fecha).getTime())
          .slice(0, limit);
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await getCachedVentas(organizationId);
        const pending = await getPendingVentas({ organizationId });
        const merged = [...cached, ...pending.map(v => ({ ...v, id: v.id || v.temp_id }))];
        
        let result = merged;
        if (!includeCotizaciones) {
          result = merged.filter(v => 
            (v.metodo_pago || '').toUpperCase() !== 'COTIZACION' && 
            (v.estado || '').toLowerCase() !== 'cotizacion'
          );
        }
        
        return applyFilters(result);
      }

      try {
        let ventasData = [];
        let hasMore = true;
        let from = 0;
        const pageSize = 1000; // Límite máximo de la API de Supabase

        // Pre-procesar IDs de ventas cambiadas para filtro 'cambiada'
        let changedVentaIds = [];
        if (estadoFilter === 'cambiada') {
          const { data: devoluciones } = await supabase
            .from('devoluciones')
            .select('venta_id')
            .eq('organization_id', organizationId);
          changedVentaIds = [...new Set((devoluciones || []).map(d => d.venta_id).filter(Boolean))];
        }

        while (hasMore && ventasData.length < limit) {
          const to = from + pageSize - 1;
          
          // Construir query base para la página actual
          let query = supabase
            .from('ventas')
            .select('*')
            .eq('organization_id', organizationId);

          if (!includeCotizaciones) {
            query = query.neq('metodo_pago', 'COTIZACION');
          }

          if (employeeId) {
            query = query.eq('employee_id', employeeId);
          }

          if (historyDays !== null && historyDays !== undefined) {
            const fechaLimite = new Date();
            fechaLimite.setDate(fechaLimite.getDate() - historyDays);
            query = query.gte('created_at', fechaLimite.toISOString());
          }

          if (startDate) {
            let startISO;
            if (startDate.includes('-')) {
              const [year, month, day] = startDate.split('-').map(Number);
              startISO = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
            } else {
              startISO = new Date(startDate).toISOString();
            }
            query = query.gte('created_at', startISO);
          }

          if (endDate) {
            let endISO;
            if (endDate.includes('-')) {
              const [year, month, day] = endDate.split('-').map(Number);
              endISO = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
            } else {
              const end = new Date(endDate);
              end.setHours(23, 59, 59, 999);
              endISO = end.toISOString();
            }
            query = query.lte('created_at', endISO);
          }

          if (estadoFilter && estadoFilter !== 'todos') {
            if (estadoFilter === 'anulada') {
              query = query.eq('total', 0);
            } else if (estadoFilter === 'rechazada') {
              query = query.in('estado', ['rechazada', 'cancelada', 'fallida']);
            } else if (estadoFilter === 'efectiva') {
              query = query.gt('total', 0);
            } else if (estadoFilter === 'cambiada') {
              if (changedVentaIds.length > 0) {
                query = query.in('id', changedVentaIds);
              } else {
                // Si no hay ventas modificadas, forzar resultado vacío
                query = query.eq('id', '00000000-0000-0000-0000-000000000000');
              }
            }
          }

          // Aplicar orden y rango para paginación
          const { data, error: ventasError } = await query
            .order('created_at', { ascending: false })
            .range(from, to);

          if (ventasError) {
            console.error('Error fetching ventas:', ventasError);
            throw new Error('Error al cargar ventas');
          }

          if (data && data.length > 0) {
            ventasData = [...ventasData, ...data];
            from += pageSize;
            // Si trajimos menos del tamaño de página, ya no hay más registros
            if (data.length < pageSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }

        // Asegurar que no excedemos el límite solicitado
        ventasData = ventasData.slice(0, limit);

        if (!ventasData || ventasData.length === 0) {
          return [];
        }

        // Cargar clientes y vendedores para las ventas
        const clienteIds = [...new Set(ventasData.map(v => v.cliente_id).filter(Boolean))];
        const employeeIds = [...new Set(ventasData.map(v => v.employee_id).filter(Boolean))];
        const userIds = [...new Set(ventasData.map(v => v.user_id).filter(Boolean))];
        
        let clientesMap = new Map();
        let vendedoresMap = new Map();
        let userProfilesMap = new Map();

        if (clienteIds.length > 0) {
          const { data: clientesData } = await supabase
            .from('clientes')
            .select('id, nombre, documento, telefono, email, direccion')
            .in('id', clienteIds);
          clientesMap = new Map((clientesData || []).map(c => [c.id, c]));
        }

        if (employeeIds.length > 0) {
          const { data: vendedoresData } = await supabase
            .from('team_members')
            .select('id, employee_name')
            .in('id', employeeIds);
          vendedoresMap = new Map(
            (vendedoresData || []).map(v => [v.id, v])
          );
        }

        if (userIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('user_profiles')
            .select('user_id, full_name')
            .in('user_id', userIds);
          userProfilesMap = new Map(
            (profilesData || []).map(p => [p.user_id, p])
          );
        }

        const ventasProcesadas = ventasData.map(venta => {
          let vendedorObj = null;
          if (venta.employee_id) {
            vendedorObj = vendedoresMap.get(venta.employee_id) || null;
          }
          if (!vendedorObj?.employee_name && venta.user_id) {
            const profile = userProfilesMap.get(venta.user_id);
            if (profile?.full_name) {
              vendedorObj = { id: venta.user_id, employee_name: profile.full_name };
            }
          }
          
          return {
            ...venta,
            cliente: venta.cliente_id ? (clientesMap.get(venta.cliente_id) || null) : null,
            vendedor: vendedorObj
          };
        });

        await cacheVentas(organizationId, ventasProcesadas);
        const pending = await getPendingVentas({ organizationId });
        return applyFilters([...ventasProcesadas, ...pending]);
      } catch (error) {
        console.error('Error en useVentas:', error);
        return [];
      }
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutos
    cacheTime: 30 * 60 * 1000, // 30 minutos
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    keepPreviousData: true,
  });
};

// Hook para crear venta
export const useCrearVenta = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ventaData) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const tempId = await enqueueVenta({
          ventaData: {
            ...ventaData,
            created_at: ventaData.created_at || ventaData.fecha || new Date().toISOString()
          },
          actorUserId: ventaData.user_id,
          actorEmployeeId: ventaData.employee_id || null
        });
        return { ...ventaData, id: tempId };
      }
      const { data, error } = await supabase
        .from('ventas')
        .insert([ventaData])
        .select();

      if (error) {
        console.error('Error creating venta:', error);
        throw new Error('Error al crear venta');
      }

      return data[0];
    },
    onSuccess: (newVenta) => {
      // Invalidar y refetch ventas usando organization_id
      queryClient.invalidateQueries(['ventas', newVenta.organization_id]);
      // También invalidar productos para actualizar stock
      queryClient.invalidateQueries(['productos', newVenta.organization_id]);
    },
    onError: (error) => {
      console.error('Error creating venta:', error);
      toast.error('Error al procesar la venta');
    },
  });
};

// Hook para actualizar stock de productos
export const useActualizarStock = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, nuevoStock }) => {
      const { data, error } = await supabase
        .from('productos')
        .update({ stock: nuevoStock })
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error updating stock:', error);
        throw new Error('Error al actualizar stock');
      }

      return data[0];
    },
    onSuccess: (updatedProducto) => {
      // Invalidar y refetch productos usando organization_id
      queryClient.invalidateQueries(['productos', updatedProducto.organization_id]);
    },
    onError: (error) => {
      console.error('Error updating stock:', error);
      toast.error('Error al actualizar stock');
    },
  });
};
