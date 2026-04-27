import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/api/supabaseClient';

// Hook para obtener cierres de caja
export const useCierresCaja = (organizationId, limit = 100, employeeId = null) => {
  return useQuery({
    queryKey: ['cierres_caja', organizationId, limit, employeeId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      let query = supabase
        .from('cierres_caja')
        .select('*')
        .eq('organization_id', organizationId);

      if (employeeId) {
        query = query.eq('employee_id', employeeId);
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching cierres_caja:', error);
        throw new Error('Error al cargar cierres de caja');
      }
      const cierres = data || [];
      const employeeIds = Array.from(
        new Set(cierres.map((cierre) => cierre.employee_id).filter(Boolean))
      );

      if (!employeeIds.length) {
        return cierres;
      }

      const { data: employeesData, error: employeesError } = await supabase
        .from('team_members')
        .select('id, employee_name')
        .in('id', employeeIds);

      if (employeesError) {
        console.warn('Error fetching employees for cierres:', employeesError);
        return cierres;
      }

      const employeesById = (employeesData || []).reduce((acc, employee) => {
        acc[employee.id] = employee;
        return acc;
      }, {});

      return cierres.map((cierre) => ({
        ...cierre,
        employee: cierre.employee_id ? employeesById[cierre.employee_id] || null : null,
      }));
    },
    enabled: !!organizationId,
    staleTime: 10 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
};

// Hook para obtener un cierre de caja específico
export const useCierreCaja = (cierreId) => {
  return useQuery({
    queryKey: ['cierres_caja', cierreId],
    queryFn: async () => {
      if (!cierreId) return null;
      
      const { data, error } = await supabase
        .from('cierres_caja')
        .select('*')
        .eq('id', cierreId)
        .single();

      if (error) {
        console.error('Error fetching cierre_caja:', error);
        throw new Error('Error al cargar el cierre de caja');
      }
      return data;
    },
    enabled: !!cierreId,
  });
};

