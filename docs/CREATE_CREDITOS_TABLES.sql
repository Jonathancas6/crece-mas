-- Sistema de Créditos y Cuentas por Cobrar
-- Ejecutar en Supabase SQL Editor

-- ============================================
-- 1. TABLA: creditos
-- ============================================
CREATE TABLE IF NOT EXISTS creditos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  monto_total DECIMAL(10, 2) NOT NULL,
  monto_pagado DECIMAL(10, 2) DEFAULT 0,
  monto_pendiente DECIMAL(10, 2) NOT NULL,
  fecha_vencimiento DATE,
  estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'parcial', 'pagado', 'vencido', 'cancelado')),
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Calcular monto_pendiente automáticamente
  CONSTRAINT check_monto_pendiente CHECK (monto_pendiente = monto_total - monto_pagado),
  CONSTRAINT check_monto_pagado CHECK (monto_pagado >= 0 AND monto_pagado <= monto_total)
);

-- Índices para creditos
CREATE INDEX IF NOT EXISTS idx_creditos_organization ON creditos(organization_id);
CREATE INDEX IF NOT EXISTS idx_creditos_cliente ON creditos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_creditos_venta ON creditos(venta_id);
CREATE INDEX IF NOT EXISTS idx_creditos_estado ON creditos(organization_id, estado);
CREATE INDEX IF NOT EXISTS idx_creditos_fecha_vencimiento ON creditos(organization_id, fecha_vencimiento) WHERE estado IN ('pendiente', 'parcial', 'vencido');

-- Función para actualizar monto_pendiente automáticamente
CREATE OR REPLACE FUNCTION update_monto_pendiente()
RETURNS TRIGGER AS $$
BEGIN
  NEW.monto_pendiente = NEW.monto_total - NEW.monto_pagado;
  
  -- Actualizar estado según el monto pagado
  IF NEW.monto_pendiente <= 0 THEN
    NEW.estado = 'pagado';
  ELSIF NEW.monto_pagado > 0 AND NEW.monto_pendiente > 0 THEN
    NEW.estado = 'parcial';
  ELSIF NEW.monto_pagado = 0 THEN
    NEW.estado = 'pendiente';
  END IF;
  
  -- Actualizar estado a vencido si la fecha de vencimiento pasó
  IF NEW.fecha_vencimiento IS NOT NULL AND NEW.fecha_vencimiento < CURRENT_DATE AND NEW.estado NOT IN ('pagado', 'cancelado') THEN
    NEW.estado = 'vencido';
  END IF;
  
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar monto_pendiente y estado
CREATE TRIGGER trigger_update_monto_pendiente
  BEFORE INSERT OR UPDATE ON creditos
  FOR EACH ROW
  EXECUTE FUNCTION update_monto_pendiente();

-- ============================================
-- 2. TABLA: pagos_creditos
-- ============================================
CREATE TABLE IF NOT EXISTS pagos_creditos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  credito_id UUID NOT NULL REFERENCES creditos(id) ON DELETE CASCADE,
  monto DECIMAL(10, 2) NOT NULL CHECK (monto > 0),
  metodo_pago VARCHAR(50) NOT NULL CHECK (metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta', 'Nequi', 'Mixto')),
  notas TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para pagos_creditos
CREATE INDEX IF NOT EXISTS idx_pagos_creditos_organization ON pagos_creditos(organization_id);
CREATE INDEX IF NOT EXISTS idx_pagos_creditos_credito ON pagos_creditos(credito_id);
CREATE INDEX IF NOT EXISTS idx_pagos_creditos_user ON pagos_creditos(user_id);
CREATE INDEX IF NOT EXISTS idx_pagos_creditos_employee ON pagos_creditos(employee_id);
CREATE INDEX IF NOT EXISTS idx_pagos_creditos_created_at ON pagos_creditos(organization_id, created_at DESC);

-- Función para actualizar monto_pagado del crédito cuando se crea un pago
CREATE OR REPLACE FUNCTION update_credito_on_pago()
RETURNS TRIGGER AS $$
BEGIN
  -- Actualizar monto_pagado del crédito
  UPDATE creditos
  SET monto_pagado = monto_pagado + NEW.monto,
      updated_at = NOW()
  WHERE id = NEW.credito_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar crédito cuando se crea un pago
CREATE TRIGGER trigger_update_credito_on_pago
  AFTER INSERT ON pagos_creditos
  FOR EACH ROW
  EXECUTE FUNCTION update_credito_on_pago();

-- Función para actualizar monto_pagado del crédito cuando se elimina un pago
CREATE OR REPLACE FUNCTION update_credito_on_pago_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Restar el monto del pago eliminado
  UPDATE creditos
  SET monto_pagado = GREATEST(0, monto_pagado - OLD.monto),
      updated_at = NOW()
  WHERE id = OLD.credito_id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar crédito cuando se elimina un pago
CREATE TRIGGER trigger_update_credito_on_pago_delete
  AFTER DELETE ON pagos_creditos
  FOR EACH ROW
  EXECUTE FUNCTION update_credito_on_pago_delete();

-- ============================================
-- 3. AGREGAR COLUMNA es_credito A ventas
-- ============================================
ALTER TABLE ventas 
ADD COLUMN IF NOT EXISTS es_credito BOOLEAN DEFAULT false;

ALTER TABLE ventas 
ADD COLUMN IF NOT EXISTS credito_id UUID REFERENCES creditos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ventas_credito ON ventas(credito_id);
CREATE INDEX IF NOT EXISTS idx_ventas_es_credito ON ventas(organization_id, es_credito);

-- ============================================
-- 4. RLS Policies
-- ============================================

-- Políticas para creditos
ALTER TABLE creditos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver créditos de su organización"
  ON creditos FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles 
      WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Usuarios pueden insertar créditos en su organización"
  ON creditos FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_profiles 
      WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Usuarios pueden actualizar créditos de su organización"
  ON creditos FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles 
      WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Usuarios pueden eliminar créditos de su organización"
  ON creditos FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles 
      WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Políticas para pagos_creditos
ALTER TABLE pagos_creditos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver pagos de créditos de su organización"
  ON pagos_creditos FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles 
      WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Usuarios pueden insertar pagos de créditos en su organización"
  ON pagos_creditos FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_profiles 
      WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Usuarios pueden actualizar pagos de créditos de su organización"
  ON pagos_creditos FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles 
      WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Usuarios pueden eliminar pagos de créditos de su organización"
  ON pagos_creditos FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_profiles 
      WHERE user_id = auth.uid()
      UNION
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ============================================
-- 5. COMENTARIOS
-- ============================================
COMMENT ON TABLE creditos IS 'Créditos y cuentas por cobrar de clientes';
COMMENT ON COLUMN creditos.monto_total IS 'Monto total del crédito';
COMMENT ON COLUMN creditos.monto_pagado IS 'Monto total pagado hasta la fecha';
COMMENT ON COLUMN creditos.monto_pendiente IS 'Monto pendiente de pago (calculado automáticamente)';
COMMENT ON COLUMN creditos.estado IS 'Estado del crédito: pendiente, parcial, pagado, vencido, cancelado';
COMMENT ON COLUMN creditos.fecha_vencimiento IS 'Fecha límite para el pago del crédito';

COMMENT ON TABLE pagos_creditos IS 'Pagos realizados sobre créditos';
COMMENT ON COLUMN pagos_creditos.monto IS 'Monto del pago';
COMMENT ON COLUMN pagos_creditos.metodo_pago IS 'Método de pago utilizado';
