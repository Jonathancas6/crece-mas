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
      if (employeeSession?.token) {
        const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
        const { data, error } = await supabase.functions.invoke('employee-apertura-activa', {
          body: { token: employeeSession.token },
          headers: {
            ...(anonKey ? { apikey: anonKey } : {}),
            Authorization: anonKey ? `Bearer ${anonKey}` : undefined
          }
        });
        if (error) {
          throw new Error(error.message || 'Error al verificar apertura de caja');
        }
        if (data?.error) {
          throw new Error(data.error);
        }
        return data?.apertura || null;
      }
      
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

      if (error) {
        throw new Error('Error al verificar apertura de caja');
      }
      return data || null;
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
      if (!organizationId || !userId) return [];

      const employeeSession = getEmployeeSession();
      // Los empleados no necesitan ver las otras cajas (solo los owners)
      if (employeeSession?.token) return [];

      const { data, error } = await supabase
        .from('aperturas_caja')
        .select('*')
        .eq('organization_id', organizationId)
        .neq('user_id', userId)       // Cajas de OTROS usuarios
        .is('cierre_id', null)         // Que están abiertas
        .order('created_at', { ascending: false });

      if (error) return [];
      return data || [];
    },
    enabled: !!organizationId && !!userId,
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
