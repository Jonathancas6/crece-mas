import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/api/supabaseClient';
import toast from 'react-hot-toast';
import { enqueueVenta, cacheVentas, getCachedVentas, getPendingVentas } from '../utils/offlineQueue';

// Hook para obtener ventas
export const useVentas = (organizationId, limit = 100, historyDays = null, employeeId = null) => {
  return useQuery({
    queryKey: ['ventas', organizationId, limit, historyDays, employeeId],
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
        return filtradas
          .sort((a, b) => new Date(b.created_at || b.fecha).getTime() - new Date(a.created_at || a.fecha).getTime())
          .slice(0, limit);
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await getCachedVentas(organizationId);
        const pending = await getPendingVentas({ organizationId });
        const merged = [...cached, ...pending.map(v => ({ ...v, id: v.id || v.temp_id }))];
        return applyFilters(merged);
      }

      try {
        // Construir query base
        let query = supabase
          .from('ventas')
          .select('*')
          .eq('organization_id', organizationId);

        if (employeeId) {
          query = query.eq('employee_id', employeeId);
        }

        // Aplicar límite de días si existe (plan gratuito = 7 días)
        if (historyDays !== null && historyDays !== undefined) {
          const fechaLimite = new Date();
          fechaLimite.setDate(fechaLimite.getDate() - historyDays);
          query = query.gte('created_at', fechaLimite.toISOString());
        }

        // Aplicar orden y límite
        const { data: ventasData, error: ventasError } = await query
          .order('created_at', { ascending: false })
          .limit(limit);

        if (ventasError) {
          console.error('Error fetching ventas:', ventasError);
          throw new Error('Error al cargar ventas');
        }

        if (!ventasData || ventasData.length === 0) {
          return [];
        }

        // Cargar clientes y vendedores para las ventas
        const clienteIds = [...new Set(ventasData.map(v => v.cliente_id).filter(Boolean))];
        const employeeIds = [...new Set(ventasData.map(v => v.employee_id).filter(Boolean))];
        let clientesMap = new Map();
        let vendedoresMap = new Map();

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
          vendedoresMap = new Map((vendedoresData || []).map(v => [v.id, v]));
        }

        const ventasProcesadas = ventasData.map(venta => ({
          ...venta,
          cliente: venta.cliente_id ? (clientesMap.get(venta.cliente_id) || null) : null,
          vendedor: venta.employee_id ? (vendedoresMap.get(venta.employee_id) || null) : null
        }));

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
