const rolePermissions = {
  cashier: {
    sales: true,
    inventory: false,
    reports: false,
    'ventas.view': true,
    'ventas.create': true,
    'inventario.view': true,
    'clientes.view': true,
    'clientes.create': true,
    'creditos.view': true,
    'creditos.create': true,
    'caja.open': true,
    'cierre.view': true,
    'cierre.create': true,
    'cierre.view_expected': false,
    'config.edit_billing': false
  },
  supervisor: {
    sales: true,
    inventory: true,
    reports: true,
    'ventas.view': true,
    'ventas.create': true,
    'inventario.view': true,
    'inventario.edit': true,
    'clientes.view': true,
    'clientes.create': true,
    'creditos.view': true,
    'creditos.create': true,
    'caja.open': true,
    'cierre.view': true,
    'cierre.create': true,
    'cierre.view_expected': true,
    'egresos.view': true,
    'egresos.create': true,
    'config.edit_billing': false
  },
  admin: {
    sales: true,
    inventory: true,
    reports: true,
    'ventas.view': true,
    'ventas.create': true,
    'inventario.view': true,
    'inventario.create': true,
    'inventario.edit': true,
    'clientes.view': true,
    'clientes.create': true,
    'clientes.edit': true,
    'creditos.view': true,
    'creditos.create': true,
    'creditos.edit': true,
    'caja.open': true,
    'cierre.view': true,
    'cierre.create': true,
    'cierre.view_expected': true,
    'egresos.view': true,
    'egresos.create': true,
    'egresos.edit': true,
    'egresos.delete': true,
    'config.edit_billing': true
  }
};

const buildPermissionsMap = (permissionsArray = []) => {
  return permissionsArray.reduce((acc, permission) => {
    acc[permission] = true;
    return acc;
  }, {});
};

export const getEmployeePermissions = (role, permissionsArray = []) => {
  if (permissionsArray && permissionsArray.length > 0) {
    return buildPermissionsMap(permissionsArray);
  }
  return rolePermissions[role] || rolePermissions.cashier;
};
