/**
 * 🔐 SISTEMA DE PERMISOS - CRECE+
 * Define todos los permisos disponibles en el sistema
 * organizados por módulos
 */

import { ShoppingCart, Package, DollarSign, BarChart3, Users, Settings, CreditCard, TrendingDown } from 'lucide-react';

export const MODULES = {
  VENTAS: {
    id: 'ventas',
    label: 'Ventas',
    icon: 'ShoppingCart',
    IconComponent: ShoppingCart,
    permissions: {
      VIEW: { id: 'ventas.view', label: 'Ver ventas', description: 'Ver historial de ventas' },
      CREATE: { id: 'ventas.create', label: 'Crear ventas', description: 'Realizar ventas en la caja' },
      DELETE: { id: 'ventas.delete', label: 'Eliminar ventas', description: 'Eliminar ventas del sistema' },
      EXPORT: { id: 'ventas.export', label: 'Exportar ventas', description: 'Descargar reportes de ventas' },
    }
  },
  
  INVENTARIO: {
    id: 'inventario',
    label: 'Inventario',
    icon: 'Package',
    IconComponent: Package,
    permissions: {
      VIEW: { id: 'inventario.view', label: 'Ver inventario', description: 'Ver lista de productos' },
      CREATE: { id: 'inventario.create', label: 'Crear productos', description: 'Agregar nuevos productos' },
      EDIT: { id: 'inventario.edit', label: 'Editar productos', description: 'Modificar productos existentes' },
      DELETE: { id: 'inventario.delete', label: 'Eliminar productos', description: 'Eliminar productos del sistema' },
      IMPORT: { id: 'inventario.import', label: 'Importar CSV', description: 'Importar productos desde archivo' },
      REVIEW_DIFFERENCES: { id: 'inventario.review_differences', label: 'Ver diferencias de revisión', description: 'Ver diferencias detectadas en revisión de inventario' },
    }
  },

  CLIENTES: {
    id: 'clientes',
    label: 'Clientes',
    icon: 'Users',
    IconComponent: Users,
    permissions: {
      VIEW: { id: 'clientes.view', label: 'Ver clientes', description: 'Ver listado de clientes' },
      CREATE: { id: 'clientes.create', label: 'Crear clientes', description: 'Registrar nuevos clientes' },
      EDIT: { id: 'clientes.edit', label: 'Editar clientes', description: 'Modificar clientes existentes' },
      DELETE: { id: 'clientes.delete', label: 'Eliminar clientes', description: 'Eliminar clientes del sistema' },
    }
  },

  CREDITOS: {
    id: 'creditos',
    label: 'Créditos',
    icon: 'CreditCard',
    IconComponent: CreditCard,
    permissions: {
      VIEW: { id: 'creditos.view', label: 'Ver créditos', description: 'Ver créditos de clientes' },
      CREATE: { id: 'creditos.create', label: 'Crear créditos', description: 'Crear ventas a crédito' },
      EDIT: { id: 'creditos.edit', label: 'Editar créditos', description: 'Actualizar créditos' },
      DELETE: { id: 'creditos.delete', label: 'Eliminar créditos', description: 'Eliminar créditos' },
    }
  },

  EGRESOS: {
    id: 'egresos',
    label: 'Egresos y Compras',
    icon: 'TrendingDown',
    IconComponent: TrendingDown,
    permissions: {
      VIEW: { id: 'egresos.view', label: 'Ver egresos y compras', description: 'Ver gastos, proveedores y órdenes de compra' },
      CREATE: { id: 'egresos.create', label: 'Registrar egresos', description: 'Crear gastos variables, fijos y órdenes de compra' },
      EDIT: { id: 'egresos.edit', label: 'Editar egresos', description: 'Modificar egresos existentes' },
      DELETE: { id: 'egresos.delete', label: 'Eliminar egresos', description: 'Eliminar egresos del sistema' },
    }
  },
  
  CIERRE_CAJA: {
    id: 'cierre_caja',
    label: 'Cierre de Caja',
    icon: 'DollarSign',
    IconComponent: DollarSign,
    permissions: {
      OPEN: { id: 'caja.open', label: 'Abrir caja', description: 'Realizar apertura de caja' },
      VIEW: { id: 'cierre.view', label: 'Ver cierres', description: 'Ver historial de cierres de caja' },
      CREATE: { id: 'cierre.create', label: 'Crear cierre', description: 'Realizar cierre de caja' },
      EDIT: { id: 'cierre.edit', label: 'Editar cierre', description: 'Modificar cierres existentes' },
      DELETE: { id: 'cierre.delete', label: 'Eliminar cierre', description: 'Eliminar cierres del sistema' },
      VIEW_EXPECTED: { id: 'cierre.view_expected', label: 'Ver montos esperados', description: 'Ver totales del sistema y diferencias en cierre' },
    }
  },
  
  ESTADISTICAS: {
    id: 'estadisticas',
    label: 'Estadísticas y Reportes',
    icon: 'BarChart3',
    IconComponent: BarChart3,
    permissions: {
      VIEW: { id: 'stats.view', label: 'Ver estadísticas', description: 'Ver dashboard y reportes' },
      EXPORT: { id: 'stats.export', label: 'Exportar reportes', description: 'Descargar reportes en PDF/Excel' },
    }
  },
  
  EQUIPO: {
    id: 'equipo',
    label: 'Gestión de Equipo',
    icon: 'Users',
    IconComponent: Users,
    permissions: {
      VIEW: { id: 'equipo.view', label: 'Ver equipo', description: 'Ver lista de miembros del equipo' },
      INVITE: { id: 'equipo.invite', label: 'Invitar miembros', description: 'Enviar invitaciones al equipo' },
      EDIT: { id: 'equipo.edit', label: 'Editar roles', description: 'Cambiar roles de miembros' },
      REMOVE: { id: 'equipo.remove', label: 'Remover miembros', description: 'Eliminar miembros del equipo' },
      MANAGE_ROLES: { id: 'equipo.manage_roles', label: 'Gestionar roles', description: 'Crear y editar roles personalizados' },
    }
  },
  
  CONFIGURACION: {
    id: 'configuracion',
    label: 'Configuración',
    icon: 'Settings',
    IconComponent: Settings,
    permissions: {
      VIEW: { id: 'config.view', label: 'Ver configuración', description: 'Ver configuración de la organización' },
      EDIT_COMPANY: { id: 'config.edit_company', label: 'Editar empresa', description: 'Modificar datos de la empresa' },
      EDIT_BILLING: { id: 'config.edit_billing', label: 'Editar facturación', description: 'Configurar datos de facturación' },
      VIEW_BILLING: { id: 'config.view_billing', label: 'Ver facturación', description: 'Ver configuración de facturación' },
    }
  },
};

/**
 * Obtener todos los permisos como array plano
 */
export const getAllPermissions = () => {
  const allPermissions = [];
  Object.values(MODULES).forEach(module => {
    Object.values(module.permissions).forEach(permission => {
      allPermissions.push({
        ...permission,
        module: module.id,
        moduleLabel: module.label,
      });
    });
  });
  return allPermissions;
};

/**
 * Roles predefinidos con sus permisos
 */
export const PREDEFINED_ROLES = {
  owner: {
    id: 'owner',
    name: 'Propietario',
    description: 'Acceso total al sistema',
    color: '#FFD700',
    icon: '👑',
    permissions: 'all', // Tiene todos los permisos
    isCustom: false,
    canEdit: false,
  },
  
  admin: {
    id: 'admin',
    name: 'Administrador',
    description: 'Gestión completa excepto facturación',
    color: '#3B82F6',
    icon: '🛡️',
    permissions: [
      // Ventas
      'ventas.view', 'ventas.create', 'ventas.delete', 'ventas.export',
      // Inventario
      'inventario.view', 'inventario.create', 'inventario.edit', 'inventario.delete', 'inventario.import', 'inventario.review_differences',
      // Clientes y créditos
      'clientes.view', 'clientes.create', 'clientes.edit', 'clientes.delete',
      'creditos.view', 'creditos.create', 'creditos.edit', 'creditos.delete',
      // Cierre
      'caja.open', 'cierre.view', 'cierre.create', 'cierre.edit', 'cierre.delete', 'cierre.view_expected',
      // Egresos
      'egresos.view', 'egresos.create', 'egresos.edit', 'egresos.delete',
      // Estadísticas
      'stats.view', 'stats.export',
      // Equipo
      'equipo.view', 'equipo.invite', 'equipo.edit', 'equipo.remove',
      // Configuración (sin facturación)
      'config.view', 'config.edit_company',
    ],
    isCustom: false,
    canEdit: false,
  },
  
  inventory_manager: {
    id: 'inventory_manager',
    name: 'Encargado de Inventario',
    description: 'Gestión de inventario y ventas',
    color: '#10B981',
    icon: '📦',
    permissions: [
      // Ventas
      'ventas.view', 'ventas.create', 'ventas.export',
      // Inventario
      'inventario.view', 'inventario.create', 'inventario.edit', 'inventario.delete', 'inventario.import',
      // Clientes y créditos (solo lectura)
      'clientes.view',
      'creditos.view',
      // Cierre
      'caja.open', 'cierre.view', 'cierre.create',
      // Egresos
      'egresos.view', 'egresos.create',
      // Estadísticas
      'stats.view',
    ],
    isCustom: false,
    canEdit: false,
  },
  
  cashier: {
    id: 'cashier',
    name: 'Cajero',
    description: 'Solo módulo de caja',
    color: '#8B5CF6',
    icon: '🛒',
    permissions: [
      // Ventas
      'ventas.view', 'ventas.create',
      // Inventario (solo ver)
      'inventario.view',
      // Clientes y créditos
      'clientes.view', 'clientes.create',
      'creditos.view', 'creditos.create',
      // Cierre
      'caja.open', 'cierre.view', 'cierre.create',
    ],
    isCustom: false,
    canEdit: false,
  },
  
  viewer: {
    id: 'viewer',
    name: 'Visualizador',
    description: 'Solo lectura de reportes',
    color: '#6B7280',
    icon: '👁️',
    permissions: [
      // Ver todo pero no editar
      'ventas.view',
      'inventario.view',
      'cierre.view',
      'stats.view',
      'clientes.view',
      'creditos.view',
    ],
    isCustom: false,
    canEdit: false,
  },
};

/**
 * Verificar si un usuario tiene un permiso específico
 */
export const hasPermission = (userPermissions, requiredPermission) => {
  // Owner tiene todos los permisos
  if (userPermissions === 'all') return true;
  
  // Verificar si el array de permisos incluye el permiso requerido
  if (Array.isArray(userPermissions)) {
    return userPermissions.includes(requiredPermission);
  }
  
  return false;
};

/**
 * Verificar si un usuario tiene al menos uno de varios permisos
 */
export const hasAnyPermission = (userPermissions, requiredPermissions) => {
  if (userPermissions === 'all') return true;
  
  if (Array.isArray(userPermissions)) {
    return requiredPermissions.some(perm => userPermissions.includes(perm));
  }
  
  return false;
};

/**
 * Verificar si un usuario tiene todos los permisos requeridos
 */
export const hasAllPermissions = (userPermissions, requiredPermissions) => {
  if (userPermissions === 'all') return true;
  
  if (Array.isArray(userPermissions)) {
    return requiredPermissions.every(perm => userPermissions.includes(perm));
  }
  
  return false;
};
