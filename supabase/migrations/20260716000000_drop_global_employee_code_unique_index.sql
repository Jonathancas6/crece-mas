-- Eliminar el índice único global sobre 'code' en la tabla 'employees'
-- ya que ahora se permite la reutilización de códigos entre diferentes organizaciones
-- (controlado por el índice único employees_organization_id_code_key)
DROP INDEX IF EXISTS public.employees_code_unique;

-- Eliminar el constraint único global sobre 'employee_code' en la tabla 'team_members'
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_employee_code_key;
DROP INDEX IF EXISTS public.team_members_employee_code_key;

-- Crear un índice único para 'employee_code' limitado a la organización y miembros activos
CREATE UNIQUE INDEX IF NOT EXISTS team_members_org_employee_code_key
ON public.team_members (organization_id, employee_code)
WHERE employee_code IS NOT NULL AND status = 'active';
