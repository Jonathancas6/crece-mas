import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/api/supabaseClient';
import toast from 'react-hot-toast';
import { cacheProductos, getCachedProductos, enqueueProductoCreate, enqueueProductoUpdate, enqueueProductoDelete } from '../utils/offlineQueue';

// Hook para obtener productos (versión simple sin paginación)
export const useProductos = (organizationId) => {
  return useQuery({
    queryKey: ['productos', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return await getCachedProductos(organizationId);
      }

      // Select campos necesarios incluyendo created_at y metadata para filtros y métricas
      let todosLosProductos = [];
      let start = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('productos')
          .select('id, organization_id, nombre, precio_venta, precio_compra, stock, imagen, codigo, tipo, created_at, metadata')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .range(start, start + step - 1);

        if (error) {
          console.error('Error fetching productos:', error);
          throw new Error('Error al cargar productos');
        }

        if (data && data.length > 0) {
          todosLosProductos = [...todosLosProductos, ...data];
          if (data.length < step) {
            hasMore = false;
          } else {
            start += step;
          }
        } else {
          hasMore = false;
        }
      }
      const productos = todosLosProductos;

      let todasLasVariantes = [];
      let startVar = 0;
      let hasMoreVar = true;

      while (hasMoreVar) {
        const { data: variantesData, error: variantesError } = await supabase
          .from('product_variants')
          .select('*')
          .eq('organization_id', organizationId)
          .range(startVar, startVar + step - 1);

        if (variantesError) {
          console.error('Error fetching product variants:', variantesError);
          // Permitir continuar sin variantes en caso de error para no romper toda la app
          break;
        }

        if (variantesData && variantesData.length > 0) {
          todasLasVariantes = [...todasLasVariantes, ...variantesData];
          if (variantesData.length < step) {
            hasMoreVar = false;
          } else {
            startVar += step;
          }
        } else {
          hasMoreVar = false;
        }
      }

      const variantesMap = new Map();
      todasLasVariantes.forEach(vari => {
        if (!variantesMap.has(vari.producto_id)) {
          variantesMap.set(vari.producto_id, []);
        }
        variantesMap.get(vari.producto_id).push(vari);
      });

      const productosConVariantes = productos.map(producto => ({
        ...producto,
        variantes: variantesMap.get(producto.id) || []
      }));
      await cacheProductos(organizationId, productosConVariantes);
      const cached = await getCachedProductos(organizationId);
      const mergedMap = new Map(productosConVariantes.map(producto => [producto.id, producto]));
      cached.filter(p => p.synced === 0).forEach(producto => {
        mergedMap.set(producto.id, { ...mergedMap.get(producto.id), ...producto });
      });
      return Array.from(mergedMap.values());
    },
    enabled: !!organizationId,
    staleTime: 30 * 1000, // 30 segundos (antes 15 min) para mantener stock actualizado
    cacheTime: 5 * 60 * 1000, // 5 minutos
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
};

// Hook para obtener productos con paginación infinita
export const useProductosPaginados = (organizationId, pageSize = 50) => {
  return useInfiniteQuery({
    queryKey: ['productos-paginados', organizationId, pageSize],
    queryFn: async ({ pageParam = 0 }) => {
      if (!organizationId) return { data: [], hasMore: false };
      const start = pageParam * pageSize;
      const end = start + pageSize - 1;

      const { data, error, count } = await supabase
        .from('productos')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(start, end);

      if (error) {
        console.error('Error fetching productos:', error);
        throw new Error('Error al cargar productos');
      }

      const hasMore = count ? (start + (data?.length || 0)) < count : false;

      return {
        data: data || [],
        nextPage: hasMore ? pageParam + 1 : undefined,
        hasMore
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!organizationId,
    staleTime: 60 * 1000, // 1 minuto
    cacheTime: 10 * 60 * 1000, // 10 minutos
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
};

// Hook para agregar producto
export const useAgregarProducto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productoData) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return await enqueueProductoCreate(productoData);
      }
      // Log para debugging (solo en desarrollo)
      if (process.env.NODE_ENV === 'development') {
        console.log('Insertando producto con datos:', {
          user_id: productoData.user_id,
          organization_id: productoData.organization_id,
          codigo: productoData.codigo,
          nombre: productoData.nombre
        });
      }

      const { data, error } = await supabase
        .from('productos')
        .insert([productoData])
        .select();

      if (error) {
        console.error('Error adding producto:', error);
        console.error('Datos enviados:', productoData);
        // Proporcionar mensajes de error más específicos
        if (error.message?.includes('row-level security') || error.message?.includes('violates row-level security')) {
          throw new Error('No tienes permisos para agregar productos. Verifica que estés asociado a una organización y que tengas los permisos necesarios. Si el problema persiste, ejecuta el script SETUP_PRODUCTOS_RLS.sql en Supabase.');
        }
        throw new Error(error.message || 'Error al agregar producto');
      }

      return data[0];
    },
    onSuccess: (newProducto) => {
      // Invalidar ambas versiones del cache
      queryClient.invalidateQueries(['productos', newProducto.organization_id]);
      queryClient.invalidateQueries(['productos-paginados', newProducto.organization_id]);
      if (newProducto?.synced === 0) {
        queryClient.setQueryData(['productos', newProducto.organization_id], (old = []) => {
          return [newProducto, ...old];
        });
        toast.success('Producto guardado localmente. Se sincronizará al reconectar.');
        return;
      }
      toast.success('¡Producto agregado exitosamente!');
    },
    onError: (error) => {
      console.error('Error adding producto:', error);
      toast.error('Error al agregar producto');
    },
  });
};

// Hook para actualizar producto
export const useActualizarProducto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates, organizationId }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const orgId = updates.organization_id || organizationId;
        return await enqueueProductoUpdate({ id, updates, organizationId: orgId });
      }
      const { data, error } = await supabase
        .from('productos')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error updating producto:', error);
        throw new Error('Error al actualizar producto');
      }

      return data[0];
    },
    onSuccess: (updatedProducto) => {
      // Invalidar ambas versiones del cache
      queryClient.invalidateQueries(['productos', updatedProducto.organization_id]);
      queryClient.invalidateQueries(['productos-paginados', updatedProducto.organization_id]);
      if (updatedProducto?.synced === 0) {
        queryClient.setQueryData(['productos', updatedProducto.organization_id], (old = []) => {
          return old.map(producto => (producto.id === updatedProducto.id ? { ...producto, ...updatedProducto } : producto));
        });
        toast.success('Producto actualizado localmente. Se sincronizará al reconectar.');
        return;
      }
      toast.success('¡Producto actualizado exitosamente!');
    },
    onError: (error) => {
      console.error('Error updating producto:', error);
      toast.error('Error al actualizar producto');
    },
  });
};

// Hook para eliminar producto
export const useEliminarProducto = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, organizationId }) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return await enqueueProductoDelete({ id, organizationId });
      }
      const { error } = await supabase
        .from('productos')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting producto:', error);
        throw new Error('Error al eliminar producto');
      }

      return { id, organizationId };
    },
    onSuccess: ({ organizationId, organization_id, id }) => {
      const orgId = organizationId || organization_id;
      // Invalidar ambas versiones del cache
      if (orgId) {
        queryClient.invalidateQueries(['productos', orgId]);
        queryClient.invalidateQueries(['productos-paginados', orgId]);
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (orgId) {
          queryClient.setQueryData(['productos', orgId], (old = []) => {
            return old.filter(producto => producto.id !== id);
          });
        }
        toast.success('Producto eliminado localmente. Se sincronizará al reconectar.');
        return;
      }
      toast.success('¡Producto eliminado exitosamente!');
    },
    onError: (error) => {
      console.error('Error deleting producto:', error);
      toast.error('Error al eliminar producto');
    },
  });
};
