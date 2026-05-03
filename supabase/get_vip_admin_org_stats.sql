-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase
-- Esto creará una función segura que permite al panel de VIP Admin leer
-- las estadísticas y última actividad de las organizaciones saltándose el RLS.

CREATE OR REPLACE FUNCTION public.get_vip_admin_org_stats(p_org_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- Esto es CLAVE: ejecuta la función con permisos de postgres (bypasses RLS)
SET search_path = public
AS $$
DECLARE
  v_members_count INT;
  v_products_count INT;
  v_sales_count INT;
  v_last_activity TIMESTAMP WITH TIME ZONE;
  v_result jsonb;
BEGIN
  -- 1. Contar miembros activos
  SELECT count(*) INTO v_members_count
  FROM team_members
  WHERE organization_id = p_org_id AND status = 'active';

  -- 2. Contar productos
  SELECT count(*) INTO v_products_count
  FROM productos
  WHERE organization_id = p_org_id;

  -- 3. Contar ventas del último mes
  SELECT count(*) INTO v_sales_count
  FROM ventas
  WHERE organization_id = p_org_id AND created_at >= (now() - interval '1 month');

  -- 4. Obtener última actividad
  SELECT created_at INTO v_last_activity
  FROM ventas
  WHERE organization_id = p_org_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Retornar como JSON
  v_result := jsonb_build_object(
    'members_count', v_members_count,
    'products_count', v_products_count,
    'sales_count', v_sales_count,
    'last_activity', v_last_activity
  );

  RETURN v_result;
END;
$$;
