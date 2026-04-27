import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/api/supabaseClient';
import toast from 'react-hot-toast';
import { enqueueVenta, cacheVentas, getCachedVentas, getPendingVentas } from '../utils/offlineQueue';

// Hook para obtener ventas
export const useVentas = (organizationId, limit = 100, historyDays = null) => {
  return useQuery({
    queryKey: ['ventas', organizationId, limit, historyDays],
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

        // Cargar clientes, vendedores y perfiles de usuario para las ventas
        const clienteIds = [...new Set(ventasData.map(v => v.cliente_id).filter(Boolean))];
        const userIds = [...new Set(ventasData.map(v => v.user_id).filter(Boolean))];
        
        let clientesMap = new Map();
        let vendedoresMap = new Map();
        let usersMap = new Map();

        if (clienteIds.length > 0) {
          const { data: clientesData } = await supabase
            .from('clientes')
            .select('id, nombre, documento, telefono, email, direccion')
            .in('id', clienteIds);
          clientesMap = new Map((clientesData || []).map(c => [c.id, c]));
        }

        // Traer todos los miembros del equipo de la organización para asegurar que encontramos a todos
        const { data: vendedoresData } = await supabase
          .from('team_members')
          .select('*')
          .eq('organization_id', organizationId);
        
        vendedoresMap = new Map((vendedoresData || []).map(v => [String(v.id), v]));
        
        // También indexar por user_id para casos donde el ID guardado sea el user_id
        (vendedoresData || []).forEach(v => {
          if (v.user_id) vendedoresMap.set(String(v.user_id), v);
          if (v.user_id) userIds.push(v.user_id);
        });

        const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

        if (uniqueUserIds.length > 0) {
          const { data: usersData } = await supabase
            .from('user_profiles')
            .select('user_id, full_name')
            .in('user_id', uniqueUserIds);
          usersMap = new Map((usersData || []).map(u => [u.user_id, u]));
        }

        const ventasProcesadas = ventasData.map(venta => {
          const empIdStr = venta.employee_id ? String(venta.employee_id) : null;
          const userIdStr = venta.user_id ? String(venta.user_id) : null;
          
          let vendedorNombre = 'Usuario';
          let vendedorObjActual = null;
          
          // 1. Intentar por employee_id en el mapa de vendedores
          if (empIdStr && vendedoresMap.has(empIdStr)) {
            vendedorObjActual = vendedoresMap.get(empIdStr);
            const p = vendedorObjActual.user_id ? usersMap.get(String(vendedorObjActual.user_id)) : null;
            
            // Prioridad: Perfil vinculado > Nombre empleado > Nombre manual > Username > Email
            vendedorNombre = p?.full_name || 
                            vendedorObjActual.employee_name || 
                            vendedorObjActual.nombre || 
                            vendedorObjActual.full_name || 
                            vendedorObjActual.username || 
                            vendedorObjActual.employee_email || 
                            'Empleado';
          } 
          // 2. Intentar por user_id en el mapa de vendedores
          else if (userIdStr && vendedoresMap.has(userIdStr)) {
            vendedorObjActual = vendedoresMap.get(userIdStr);
            const p = vendedorObjActual.user_id ? usersMap.get(String(vendedorObjActual.user_id)) : null;
            
            vendedorNombre = p?.full_name || 
                            vendedorObjActual.employee_name || 
                            vendedorObjActual.nombre || 
                            vendedorObjActual.full_name || 
                            vendedorObjActual.username || 
                            'Empleado';
          }
          // 3. Intentar por user_id en el mapa de perfiles (caso del dueño)
          else if (userIdStr && usersMap.has(userIdStr)) {
            vendedorNombre = usersMap.get(userIdStr)?.full_name || 'Usuario';
          }
          // 4. Fallback final si hay employee_id pero no se encontró en el mapa
          else if (venta.employee_id) {
            vendedorNombre = 'Empleado';
          }

          // 5. "Quemar" el dato: si la descripción contiene el nombre del vendedor, usarlo
          if (venta.descripcion && venta.descripcion.startsWith('Vendedor: ')) {
            const nombreQuemado = venta.descripcion.replace('Vendedor: ', '');
            if (nombreQuemado) vendedorNombre = nombreQuemado;
          }

          return {
            ...venta,
            cliente: venta.cliente_id ? (clientesMap.get(venta.cliente_id) || null) : null,
            vendedor: vendedorObjActual,
            usuario_nombre: vendedorNombre, // Para compatibilidad con HistorialVentas
            vendedor_nombre: vendedorNombre // Alias descriptivo
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
