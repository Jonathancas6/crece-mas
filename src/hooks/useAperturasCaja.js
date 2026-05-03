import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/api/supabaseClient';
import { getEmployeeSession } from '../utils/employeeSession';
import toast from 'react-hot-toast';

// Hook para obtener la apertura de caja activa del usuario actual
export const useAperturaCajaActiva = (organizationId, userId) => {
  return useQuery({
    queryKey: ['apertura_caja_activa', organizationId, userId],
    queryFn: async () => {
      if (!organizationId || !userId) return null;

      const employeeSession = getEmployeeSession();
      let apertura = null;

      if (employeeSession?.token) {
        const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
        const { data, error } = await supabase.functions.invoke('employee-apertura-activa', {
          body: { token: employeeSession.token },
          headers: {
            ...(anonKey ? { apikey: anonKey } : {}),
            Authorization: anonKey ? `Bearer ${anonKey}` : undefined
          }
        });
        if (!error && !data?.error) {
          apertura = data?.apertura || null;
        }
      } else {
        // Buscar apertura activa solo de este usuario (owner)
        const { data, error } = await supabase
          .from('aperturas_caja')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('user_id', userId)
          .is('cierre_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error) {
          apertura = data || null;
        }
      }

      // Si no hay apertura propia, verificar si estamos "sincronizados" a otra
      if (!apertura) {
        const syncedId = localStorage.getItem(`synced_apertura_${organizationId}`);
        if (syncedId) {
          const { data: syncedApertura, error: syncedError } = await supabase
            .from('aperturas_caja')
            .select('*')
            .eq('id', syncedId)
            .is('cierre_id', null)
            .maybeSingle();
          
          if (!syncedError && syncedApertura) {
            return { ...syncedApertura, is_synced: true };
          } else {
            // Ya no es válida o está cerrada
            localStorage.removeItem(`synced_apertura_${organizationId}`);
          }
        }
      }

      return apertura;
    },
    enabled: !!organizationId && !!userId,
    staleTime: 30 * 1000,
    cacheTime: 2 * 60 * 1000,
    refetchInterval: 30 * 1000,
  });
};

// Hook para detectar si OTROS usuarios tienen cajas abiertas en la misma organización
export const useOtrasCajasAbiertas = (organizationId, userId) => {
  return useQuery({
    queryKey: ['otras_cajas_abiertas', organizationId, userId],
    queryFn: async () => {
      if (!organizationId) return [];

      const employeeSession = getEmployeeSession();
      const currentEmployeeId = employeeSession?.employee?.id;

      let query = supabase
        .from('aperturas_caja')
        .select(`
          *,
          vendedor:team_members(id, employee_name),
          user_profile:user_profiles(id, full_name)
        `)
        .eq('organization_id', organizationId)
        .is('cierre_id', null); // Que están abiertas

      // FILTRAR: Solo traer cajas que NO sean la del usuario actual
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) return [];

      // Filtrado manual más robusto
      return (data || []).filter(apertura => {
        if (currentEmployeeId) {
          // Si soy un empleado, la caja NO es mía si tiene un employee_id distinto
          return apertura.employee_id !== currentEmployeeId;
        } else {
          // Si soy el Owner, la caja NO es mía si tiene un employee_id (es de un empleado)
          // o si el user_id es distinto (aunque el owner suele tener el mismo user_id, 
          // el employee_id es la clave aquí)
          return apertura.employee_id !== null || apertura.user_id !== userId;
        }
      });
    },
    enabled: !!organizationId,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
};

// Hook para crear una apertura de caja (propia, independiente)
export const useCrearAperturaCaja = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, userId, montoInicial }) => {
      const employeeSession = getEmployeeSession();
      if (employeeSession?.token) {
        const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
        const { data, error } = await supabase.functions.invoke('employee-open-caja', {
          body: { token: employeeSession.token, montoInicial },
          headers: {
            ...(anonKey ? { apikey: anonKey } : {}),
            Authorization: anonKey ? `Bearer ${anonKey}` : undefined
          }
        });
        if (error) {
          throw new Error(error.message || 'Error al crear apertura de caja');
        }
        if (data?.error) {
          throw new Error(data.error);
        }
        return data?.apertura;
      }

      if (!organizationId || !userId) {
        throw new Error('Faltan datos de organización o usuario');
      }

      // Verificar solo si ESTE usuario ya tiene una apertura activa
      const { data: miAperturaActiva, error: errorVerificacion } = await supabase
        .from('aperturas_caja')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .is('cierre_id', null)
        .maybeSingle();

      if (errorVerificacion) {
        throw new Error('Error al verificar apertura existente');
      }

      if (miAperturaActiva) {
        throw new Error('Ya tienes una caja abierta. Debes cerrarla antes de abrir una nueva.');
      }

      // Crear la apertura independiente para este usuario
      const { data, error } = await supabase
        .from('aperturas_caja')
        .insert([{
          organization_id: organizationId,
          user_id: userId,
          monto_inicial: parseFloat(montoInicial) || 0,
          estado: 'abierta'
        }])
        .select()
        .single();

      if (error) {
        throw new Error(error.message || 'Error al crear apertura de caja');
      }

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['apertura_caja_activa', data.organization_id, data.user_id]);
      queryClient.invalidateQueries(['otras_cajas_abiertas', data.organization_id]);
      toast.success('Caja abierta exitosamente');
    },
    onError: (error) => {
      toast.error(error.message || 'Error al abrir la caja');
    },
  });
};

// Hook para obtener historial de aperturas
export const useAperturasCaja = (organizationId, limit = 100) => {
  return useQuery({
    queryKey: ['aperturas_caja', organizationId, limit],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase
        .from('aperturas_caja')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error('Error al cargar aperturas de caja');
      }
      return data || [];
    },
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
  });
};
