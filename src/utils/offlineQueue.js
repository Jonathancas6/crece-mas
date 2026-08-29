import Dexie from 'dexie';
import { actualizarStockVenta } from './ventas/actualizarStockVenta';

const db = new Dexie('crece_mas_offline');

db.version(1).stores({
  outbox: '++id,type,status,created_at',
  ventas_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced',
  cierres_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced'
});

db.version(2).stores({
  outbox: '++id,type,status,created_at',
  ventas_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced',
  cierres_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced',
  clientes_local: '++local_id,id,organization_id,synced,updated_at,created_at,activo'
});

db.version(3).stores({
  outbox: '++id,type,status,created_at',
  ventas_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced',
  cierres_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced',
  clientes_local: '++local_id,id,organization_id,synced,updated_at,created_at,activo',
  productos_local: '++local_id,id,organization_id,synced,updated_at,created_at,deleted'
});

db.version(4).stores({
  outbox: '++id,type,status,created_at',
  ventas_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced',
  cierres_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced',
  clientes_local: '++local_id,id,organization_id,synced,updated_at,created_at,activo',
  productos_local: '++local_id,id,organization_id,synced,updated_at,created_at,deleted',
  pedidos_local: '++local_id,id,organization_id,synced,updated_at,created_at,estado',
  ventas_cache: '++local_id,id,organization_id,created_at'
});

db.version(5).stores({
  outbox: '++id,type,status,created_at',
  ventas_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced',
  cierres_local: 'id,organization_id,actor_user_id,actor_employee_id,created_at,synced',
  clientes_local: '++local_id,id,organization_id,synced,updated_at,created_at,activo',
  productos_local: '++local_id,id,organization_id,synced,updated_at,created_at,deleted',
  pedidos_local: '++local_id,id,organization_id,synced,updated_at,created_at,estado',
  ventas_cache: '++local_id,id,organization_id,created_at',
  creditos_local: '++local_id,id,organization_id,synced,updated_at,created_at,estado,cliente_id',
  pagos_creditos_local: '++local_id,id,organization_id,credito_id,created_at'
});
const generateTempId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `tmp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const enqueueVenta = async ({ ventaData, actorUserId, actorEmployeeId, pedidosIds = [] }) => {
  const tempId = generateTempId();
  const createdAt = ventaData?.created_at || ventaData?.fecha || new Date().toISOString();

  await db.outbox.add({
    type: 'venta',
    status: 'pending',
    created_at: createdAt,
    tries: 0,
    payload: {
      temp_id: tempId,
      ventaData: { ...ventaData },
      pedidosIds
    }
  });

  await db.ventas_local.put({
    id: tempId,
    temp_id: tempId,
    organization_id: ventaData.organization_id,
    actor_user_id: actorUserId || null,
    actor_employee_id: actorEmployeeId || null,
    total: ventaData.total,
    metodo_pago: ventaData.metodo_pago,
    created_at: createdAt,
    synced: 0
  });

  return tempId;
};

export const enqueueCierre = async ({ cierreData, actorUserId, actorEmployeeId, organizationId }) => {
  const tempId = generateTempId();
  const createdAt = cierreData?.created_at || new Date().toISOString();

  await db.outbox.add({
    type: 'cierre_caja',
    status: 'pending',
    created_at: createdAt,
    tries: 0,
    payload: {
      temp_id: tempId,
      cierreData: { ...cierreData },
      actorUserId: actorUserId || null,
      actorEmployeeId: actorEmployeeId || null,
      organizationId
    }
  });

  await db.cierres_local.put({
    id: tempId,
    temp_id: tempId,
    organization_id: organizationId,
    actor_user_id: actorUserId || null,
    actor_employee_id: actorEmployeeId || null,
    created_at: createdAt,
    synced: 0
  });

  return tempId;
};

export const getPendingVentas = async ({ organizationId, actorUserId, actorEmployeeId }) => {
  if (!organizationId) return [];
  const rows = await db.ventas_local
    .where('organization_id')
    .equals(organizationId)
    .toArray();

  return rows.filter(row => {
    if (row.synced) return false;
    if (!actorEmployeeId && !actorUserId) {
      return true;
    }
    if (actorEmployeeId) {
      return row.actor_employee_id === actorEmployeeId;
    }
    return row.actor_user_id === actorUserId;
  });
};

export const getPendingOutboxCount = async () => {
  const count = await db.outbox.where('status').equals('pending').count();
  return count || 0;
};

export const cacheClientes = async (organizationId, clientes = []) => {
  if (!organizationId) return;
  for (const cliente of clientes || []) {
    const payload = {
      id: cliente.id,
      organization_id: organizationId,
      nombre: cliente.nombre || '',
      documento: cliente.documento || '',
      telefono: cliente.telefono || '',
      email: cliente.email || '',
      direccion: cliente.direccion || '',
      notas: cliente.notas || '',
      activo: cliente.activo !== false,
      created_at: cliente.created_at || new Date().toISOString(),
      updated_at: cliente.updated_at || new Date().toISOString(),
      synced: 1,
      server_id: cliente.id
    };

    const existing = await db.clientes_local.where('id').equals(cliente.id).first();
    if (existing) {
      await db.clientes_local.update(existing.local_id, payload);
    } else {
      await db.clientes_local.put(payload);
    }
  }
};

export const cacheProductos = async (organizationId, productos = []) => {
  if (!organizationId || !productos.length) return;
  
  try {
    const unsyncedProducts = await db.productos_local
      .where('organization_id').equals(organizationId)
      .and(p => p.synced === 0)
      .toArray();
    
    const unsyncedIds = new Set(unsyncedProducts.map(p => p.id));
    
    const payloads = productos
      .filter(p => !unsyncedIds.has(p.id))
      .map(producto => ({
        id: producto.id,
        organization_id: organizationId,
        user_id: producto.user_id,
        nombre: producto.nombre || '',
        codigo: producto.codigo || '',
        precio_venta: producto.precio_venta ?? null,
        precio_compra: producto.precio_compra ?? null,
        stock: producto.stock ?? null,
        imagen: producto.imagen || null,
        tipo: producto.tipo || null,
        metadata: producto.metadata || null,
        variantes: producto.variantes || [],
        created_at: producto.created_at || new Date().toISOString(),
        updated_at: producto.updated_at || new Date().toISOString(),
        synced: 1,
        deleted: false,
        server_id: producto.id
      }));

    if (payloads.length > 0) {
      const existingMap = new Map();
      const allExisting = await db.productos_local
        .where('organization_id').equals(organizationId)
        .toArray();
      
      allExisting.forEach(p => existingMap.set(p.id, p.local_id));
      
      const finalPayloads = payloads.map(p => {
        if (existingMap.has(p.id)) {
          return { ...p, local_id: existingMap.get(p.id) };
        }
        return p;
      });

      await db.productos_local.bulkPut(finalPayloads);
    }
  } catch (error) {
    console.error('Error caching products:', error);
  }
};

export const cachePedidos = async (organizationId, pedidos = []) => {
  if (!organizationId) return;
  for (const pedido of pedidos || []) {
    const payload = {
      id: pedido.id,
      organization_id: organizationId,
      numero_pedido: pedido.numero_pedido || '',
      estado: pedido.estado || 'pendiente',
      total: pedido.total ?? 0,
      notas: pedido.notas || null,
      mesa_id: pedido.mesa_id || null,
      mesa: pedido.mesa || null,
      items: pedido.items || [],
      tipo_pedido: pedido.tipo_pedido || 'dine_in',
      cliente_nombre: pedido.cliente_nombre || null,
      cliente_telefono: pedido.cliente_telefono || null,
      direccion_entrega: pedido.direccion_entrega || null,
      costo_envio: pedido.costo_envio ?? 0,
      hora_estimada: pedido.hora_estimada || null,
      numero_personas: pedido.numero_personas || 1,
      prioridad: pedido.prioridad || 'normal',
      pago_inmediato: !!pedido.pago_inmediato,
      created_at: pedido.created_at || new Date().toISOString(),
      updated_at: pedido.updated_at || new Date().toISOString(),
      synced: 1,
      deleted: false,
      server_id: pedido.id
    };

    const existing = await db.pedidos_local.where('id').equals(pedido.id).first();
    if (existing && existing.synced === 0) {
      continue;
    }
    if (existing) {
      await db.pedidos_local.update(existing.local_id, payload);
    } else {
      await db.pedidos_local.put(payload);
    }
  }
};

export const getCachedPedidos = async (organizationId) => {
  if (!organizationId) return [];
  const rows = await db.pedidos_local
    .where('organization_id')
    .equals(organizationId)
    .toArray();

  return rows
    .filter(pedido => !pedido.deleted)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const cacheCreditos = async (organizationId, creditos = []) => {
  if (!organizationId) return;
  for (const credito of creditos || []) {
    const payload = {
      id: credito.id,
      organization_id: organizationId,
      cliente_id: credito.cliente_id || null,
      venta_id: credito.venta_id || null,
      monto_total: credito.monto_total ?? 0,
      monto_pagado: credito.monto_pagado ?? 0,
      monto_pendiente: credito.monto_pendiente ?? 0,
      estado: credito.estado || 'pendiente',
      fecha_vencimiento: credito.fecha_vencimiento || null,
      cliente: credito.cliente || null,
      venta: credito.venta || null,
      created_at: credito.created_at || new Date().toISOString(),
      updated_at: credito.updated_at || new Date().toISOString(),
      synced: 1,
      server_id: credito.id
    };

    const existing = await db.creditos_local.where('id').equals(credito.id).first();
    if (existing && existing.synced === 0) {
      continue;
    }
    if (existing) {
      await db.creditos_local.update(existing.local_id, payload);
    } else {
      await db.creditos_local.put(payload);
    }
  }
};

export const getCachedCreditos = async (organizationId) => {
  if (!organizationId) return [];
  const rows = await db.creditos_local
    .where('organization_id')
    .equals(organizationId)
    .toArray();

  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const cachePagosCredito = async (organizationId, pagos = []) => {
  if (!organizationId) return;
  for (const pago of pagos || []) {
    const payload = {
      id: pago.id,
      organization_id: organizationId,
      credito_id: pago.credito_id,
      monto: pago.monto ?? 0,
      metodo_pago: pago.metodo_pago || null,
      notas: pago.notas || null,
      user_id: pago.user_id || null,
      created_at: pago.created_at || new Date().toISOString(),
      synced: 1,
      server_id: pago.id
    };

    const existing = await db.pagos_creditos_local.where('id').equals(pago.id).first();
    if (existing) {
      await db.pagos_creditos_local.update(existing.local_id, payload);
    } else {
      await db.pagos_creditos_local.put(payload);
    }
  }
};

export const getCachedPagosCredito = async (creditoId) => {
  if (!creditoId) return [];
  const rows = await db.pagos_creditos_local
    .where('credito_id')
    .equals(creditoId)
    .toArray();

  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const enqueuePagoCreditoCreate = async (pagoData) => {
  const tempId = generateTempId();
  const createdAt = pagoData?.created_at || new Date().toISOString();

  await db.outbox.add({
    type: 'pago_credito_create',
    status: 'pending',
    created_at: createdAt,
    tries: 0,
    payload: {
      pagoData: { ...pagoData, created_at: createdAt },
      temp_id: tempId
    }
  });

  await db.pagos_creditos_local.put({
    id: tempId,
    organization_id: pagoData.organization_id,
    credito_id: pagoData.credito_id,
    monto: pagoData.monto ?? 0,
    metodo_pago: pagoData.metodo_pago || null,
    notas: pagoData.notas || null,
    user_id: pagoData.user_id || null,
    employee_id: pagoData.employee_id || null,
    created_at: createdAt,
    synced: 0,
    server_id: null
  });

  const creditoRow = await db.creditos_local.where('id').equals(pagoData.credito_id).first();
  if (creditoRow) {
    const montoPago = Number(pagoData.monto || 0);
    const nuevoPagado = Number(creditoRow.monto_pagado || 0) + montoPago;
    const nuevoPendiente = Math.max(0, Number(creditoRow.monto_pendiente || 0) - montoPago);
    const nuevoEstado = nuevoPendiente === 0 ? 'pagado' : (nuevoPagado > 0 ? 'parcial' : creditoRow.estado);
    await db.creditos_local.update(creditoRow.local_id, {
      monto_pagado: nuevoPagado,
      monto_pendiente: nuevoPendiente,
      estado: nuevoEstado,
      updated_at: createdAt,
      synced: 0
    });
  }

  return { ...pagoData, id: tempId, created_at: createdAt, synced: 0 };
};

export const enqueuePagoCreditoDelete = async ({ id, creditoId, organizationId, monto }) => {
  const updatedAt = new Date().toISOString();

  await db.outbox.add({
    type: 'pago_credito_delete',
    status: 'pending',
    created_at: updatedAt,
    tries: 0,
    payload: {
      id,
      credito_id: creditoId,
      organization_id: organizationId,
      monto: monto ?? 0
    }
  });

  const pagoRow = await db.pagos_creditos_local.where('id').equals(id).first();
  if (pagoRow) {
    await db.pagos_creditos_local.update(pagoRow.local_id, {
      synced: 0
    });
  }

  const creditoRow = await db.creditos_local.where('id').equals(creditoId).first();
  if (creditoRow) {
    const montoPago = Number(monto || 0);
    const nuevoPagado = Math.max(0, Number(creditoRow.monto_pagado || 0) - montoPago);
    const nuevoPendiente = Number(creditoRow.monto_total || 0) - nuevoPagado;
    const nuevoEstado = nuevoPagado === 0 ? 'pendiente' : 'parcial';
    await db.creditos_local.update(creditoRow.local_id, {
      monto_pagado: nuevoPagado,
      monto_pendiente: nuevoPendiente,
      estado: nuevoEstado,
      updated_at: updatedAt,
      synced: 0
    });
  }

  return { id, credito_id: creditoId, organization_id: organizationId, synced: 0 };
};

export const cacheVentas = async (organizationId, ventas = []) => {
  if (!organizationId) return;
  for (const venta of ventas || []) {
    const payload = {
      id: venta.id,
      organization_id: organizationId,
      user_id: venta.user_id || null,
      employee_id: venta.employee_id || null,
      total: venta.total ?? 0,
      subtotal: venta.subtotal ?? 0,
      metodo_pago: venta.metodo_pago || null,
      items: venta.items || [],
      fecha: venta.fecha || null,
      created_at: venta.created_at || new Date().toISOString(),
      cliente_id: venta.cliente_id || null,
      cliente: venta.cliente || null
    };

    const existing = await db.ventas_cache.where('id').equals(venta.id).first();
    if (existing) {
      await db.ventas_cache.update(existing.local_id, payload);
    } else {
      await db.ventas_cache.put(payload);
    }
  }
};

export const getCachedVentas = async (organizationId) => {
  if (!organizationId) return [];
  const rows = await db.ventas_cache
    .where('organization_id')
    .equals(organizationId)
    .toArray();
  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const getCachedProductos = async (organizationId) => {
  if (!organizationId) return [];
  const rows = await db.productos_local
    .where('organization_id')
    .equals(organizationId)
    .toArray();

  return rows
    .filter(producto => !producto.deleted)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const getCachedClientes = async (organizationId) => {
  if (!organizationId) return [];
  const rows = await db.clientes_local
    .where('organization_id')
    .equals(organizationId)
    .toArray();

  return rows
    .filter(cliente => cliente.activo !== false)
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
};

export const enqueueClienteCreate = async (clienteData) => {
  const tempId = generateTempId();
  const createdAt = clienteData?.created_at || new Date().toISOString();

  await db.outbox.add({
    type: 'cliente_create',
    status: 'pending',
    created_at: createdAt,
    tries: 0,
    payload: {
      clienteData: { ...clienteData, created_at: createdAt, updated_at: createdAt },
      temp_id: tempId
    }
  });

  await db.clientes_local.put({
    id: tempId,
    organization_id: clienteData.organization_id,
    nombre: clienteData.nombre || '',
    documento: clienteData.documento || '',
    telefono: clienteData.telefono || '',
    email: clienteData.email || '',
    direccion: clienteData.direccion || '',
    notas: clienteData.notas || '',
    activo: true,
    created_at: createdAt,
    updated_at: createdAt,
    synced: 0,
    server_id: null
  });

  return {
    ...clienteData,
    id: tempId,
    created_at: createdAt,
    updated_at: createdAt,
    synced: 0
  };
};

export const enqueueClienteUpdate = async ({ id, updates, organizationId }) => {
  const updatedAt = new Date().toISOString();

  await db.outbox.add({
    type: 'cliente_update',
    status: 'pending',
    created_at: updatedAt,
    tries: 0,
    payload: {
      id,
      updates: { ...updates, updated_at: updatedAt },
      organizationId
    }
  });

  const clienteRow = await db.clientes_local.where('id').equals(id).first();
  if (clienteRow) {
    await db.clientes_local.update(clienteRow.local_id, {
      ...updates,
      updated_at: updatedAt,
      synced: 0
    });
  } else {
    await db.clientes_local.put({
      id,
      organization_id: organizationId,
      nombre: updates.nombre || '',
      documento: updates.documento || '',
      telefono: updates.telefono || '',
      email: updates.email || '',
      direccion: updates.direccion || '',
      notas: updates.notas || '',
      activo: updates.activo !== false,
      created_at: updates.created_at || updatedAt,
      updated_at: updatedAt,
      synced: 0,
      server_id: id
    });
  }

  return { id, ...updates, updated_at: updatedAt, organization_id: organizationId, synced: 0 };
};

export const enqueueClienteDelete = async ({ id, organizationId }) => {
  const updatedAt = new Date().toISOString();

  await db.outbox.add({
    type: 'cliente_delete',
    status: 'pending',
    created_at: updatedAt,
    tries: 0,
    payload: {
      id,
      organizationId,
      updates: { activo: false, updated_at: updatedAt }
    }
  });

  const clienteRow = await db.clientes_local.where('id').equals(id).first();
  if (clienteRow) {
    await db.clientes_local.update(clienteRow.local_id, {
      activo: false,
      updated_at: updatedAt,
      synced: 0
    });
  }

  return { id, activo: false, updated_at: updatedAt };
};

export const enqueuePedidoCreate = async ({ pedidoData, items }) => {
  const tempId = generateTempId();
  const createdAt = pedidoData?.created_at || new Date().toISOString();
  const numeroPedido = pedidoData?.numero_pedido || `OFF-${Date.now()}`;

  await db.outbox.add({
    type: 'pedido_create',
    status: 'pending',
    created_at: createdAt,
    tries: 0,
    payload: {
      pedidoData: { ...pedidoData, created_at: createdAt, updated_at: createdAt, numero_pedido: numeroPedido },
      items,
      temp_id: tempId
    }
  });

  await db.pedidos_local.put({
    id: tempId,
    organization_id: pedidoData.organization_id,
    numero_pedido: numeroPedido,
    estado: pedidoData.estado || 'pendiente',
    total: pedidoData.total ?? 0,
    notas: pedidoData.notas || null,
    mesa_id: pedidoData.mesa_id || null,
    mesa: pedidoData.mesa || null,
    items: items || [],
    tipo_pedido: pedidoData.tipo_pedido || 'dine_in',
    cliente_nombre: pedidoData.cliente_nombre || null,
    cliente_telefono: pedidoData.cliente_telefono || null,
    direccion_entrega: pedidoData.direccion_entrega || null,
    costo_envio: pedidoData.costo_envio ?? 0,
    hora_estimada: pedidoData.hora_estimada || null,
    numero_personas: pedidoData.numero_personas || 1,
    prioridad: pedidoData.prioridad || 'normal',
    pago_inmediato: !!pedidoData.pago_inmediato,
    created_at: createdAt,
    updated_at: createdAt,
    synced: 0,
    deleted: false,
    server_id: null
  });

  return { ...pedidoData, id: tempId, numero_pedido: numeroPedido, created_at: createdAt, updated_at: createdAt, synced: 0 };
};

export const enqueuePedidoUpdate = async ({ id, updates, organizationId }) => {
  const updatedAt = new Date().toISOString();
  const pedidoRowForOrg = await db.pedidos_local.where('id').equals(id).first();
  const orgId = organizationId || pedidoRowForOrg?.organization_id;

  await db.outbox.add({
    type: 'pedido_update',
    status: 'pending',
    created_at: updatedAt,
    tries: 0,
    payload: {
      id,
      updates: { ...updates, updated_at: updatedAt },
      organizationId: orgId
    }
  });

  const pedidoRow = pedidoRowForOrg || await db.pedidos_local.where('id').equals(id).first();
  if (pedidoRow) {
    await db.pedidos_local.update(pedidoRow.local_id, {
      ...updates,
      updated_at: updatedAt,
      synced: 0
    });
  }

  return { id, ...updates, updated_at: updatedAt, organization_id: orgId, synced: 0 };
};

export const enqueuePedidoDelete = async ({ id, organizationId }) => {
  const updatedAt = new Date().toISOString();
  const pedidoRowForOrg = await db.pedidos_local.where('id').equals(id).first();
  const orgId = organizationId || pedidoRowForOrg?.organization_id;

  await db.outbox.add({
    type: 'pedido_delete',
    status: 'pending',
    created_at: updatedAt,
    tries: 0,
    payload: {
      id,
      organizationId: orgId
    }
  });

  const pedidoRow = pedidoRowForOrg || await db.pedidos_local.where('id').equals(id).first();
  if (pedidoRow) {
    await db.pedidos_local.update(pedidoRow.local_id, {
      deleted: true,
      updated_at: updatedAt,
      synced: 0
    });
  }

  return { id, organization_id: orgId, deleted: true, updated_at: updatedAt };
};

export const enqueueProductoCreate = async (productoData) => {
  const tempId = generateTempId();
  const createdAt = productoData?.created_at || new Date().toISOString();

  await db.outbox.add({
    type: 'producto_create',
    status: 'pending',
    created_at: createdAt,
    tries: 0,
    payload: {
      productoData: { ...productoData, created_at: createdAt, updated_at: createdAt },
      temp_id: tempId
    }
  });

  await db.productos_local.put({
    id: tempId,
    organization_id: productoData.organization_id,
    user_id: productoData.user_id,
    nombre: productoData.nombre || '',
    codigo: productoData.codigo || '',
    precio_venta: productoData.precio_venta ?? null,
    precio_compra: productoData.precio_compra ?? null,
    stock: productoData.stock ?? null,
    imagen: productoData.imagen || null,
    tipo: productoData.tipo || null,
    metadata: productoData.metadata || null,
    variantes: productoData.variantes || [],
    created_at: createdAt,
    updated_at: createdAt,
    synced: 0,
    deleted: false,
    server_id: null
  });

  return { ...productoData, id: tempId, created_at: createdAt, updated_at: createdAt, synced: 0 };
};

export const enqueueProductoUpdate = async ({ id, updates, organizationId }) => {
  const updatedAt = new Date().toISOString();
  const productoRowForOrg = await db.productos_local.where('id').equals(id).first();
  const orgId = organizationId || productoRowForOrg?.organization_id;

  await db.outbox.add({
    type: 'producto_update',
    status: 'pending',
    created_at: updatedAt,
    tries: 0,
    payload: {
      id,
      updates: { ...updates, updated_at: updatedAt },
      organizationId: orgId
    }
  });

  const productoRow = productoRowForOrg || await db.productos_local.where('id').equals(id).first();
  if (productoRow) {
    await db.productos_local.update(productoRow.local_id, {
      ...updates,
      updated_at: updatedAt,
      synced: 0
    });
  } else {
    await db.productos_local.put({
      id,
      organization_id: orgId,
      user_id: updates.user_id,
      nombre: updates.nombre || '',
      codigo: updates.codigo || '',
      precio_venta: updates.precio_venta ?? null,
      precio_compra: updates.precio_compra ?? null,
      stock: updates.stock ?? null,
      imagen: updates.imagen || null,
      tipo: updates.tipo || null,
      metadata: updates.metadata || null,
      variantes: updates.variantes || [],
      created_at: updates.created_at || updatedAt,
      updated_at: updatedAt,
      synced: 0,
      deleted: false,
      server_id: id
    });
  }

  return { id, ...updates, updated_at: updatedAt, organization_id: orgId, synced: 0 };
};

export const enqueueProductoDelete = async ({ id, organizationId }) => {
  const updatedAt = new Date().toISOString();
  const productoRowForOrg = await db.productos_local.where('id').equals(id).first();
  const orgId = organizationId || productoRowForOrg?.organization_id;

  await db.outbox.add({
    type: 'producto_delete',
    status: 'pending',
    created_at: updatedAt,
    tries: 0,
    payload: {
      id,
      organizationId: orgId
    }
  });

  const productoRow = productoRowForOrg || await db.productos_local.where('id').equals(id).first();
  if (productoRow) {
    await db.productos_local.update(productoRow.local_id, {
      deleted: true,
      updated_at: updatedAt,
      synced: 0
    });
  }

  return { id, organization_id: orgId, deleted: true, updated_at: updatedAt };
};

export const syncOutbox = async ({ supabase }) => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  const pending = await db.outbox.where('status').equals('pending').sortBy('created_at');
  
  if (!pending || pending.length === 0) {
    return { synced: 0, failed: 0, nothingToSync: true };
  }
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      if (item.type === 'venta') {
        const { ventaData, pedidosIds = [], temp_id: tempId } = item.payload || {};
        const { temp_id, ...ventaPayload } = ventaData || {};
        const { data: ventaResult, error: ventaError } = await supabase
          .from('ventas')
          .insert([ventaPayload])
          .select()
          .single();

        if (ventaError) throw ventaError;

        if (pedidosIds.length > 0) {
          await supabase
            .from('pedidos')
            .update({ venta_id: ventaResult.id })
            .in('id', pedidosIds);
        }

        await actualizarStockVenta({ 
          supabase, 
          items: ventaData?.items || [],
          organizationId: ventaData?.organization_id,
          userId: ventaData?.user_id,
          ventaId: ventaResult.id
        });

        await db.ventas_local.update(tempId, {
          synced: 1,
          synced_at: new Date().toISOString(),
          server_id: ventaResult.id
        });

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'cierre_caja') {
        const { cierreData, actorUserId, actorEmployeeId, organizationId, temp_id: tempId } = item.payload || {};
        const { temp_id, ...cierrePayload } = cierreData || {};
        const { data: cierreResult, error: cierreError } = await supabase
          .from('cierres_caja')
          .insert(cierrePayload)
          .select()
          .single();

        if (cierreError) throw cierreError;

        if (organizationId) {
          const { data: aperturaActiva } = await supabase
            .from('aperturas_caja')
            .select('id')
            .eq('organization_id', organizationId)
            .eq(actorEmployeeId ? 'employee_id' : 'user_id', actorEmployeeId || actorUserId)
            .is('cierre_id', null)
            .eq('estado', 'abierta')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (aperturaActiva?.id) {
            await supabase
              .from('aperturas_caja')
              .update({
                cierre_id: cierreResult.id,
                estado: 'cerrada',
                updated_at: new Date().toISOString()
              })
              .eq('id', aperturaActiva.id);
          }
        }

        await db.cierres_local.update(tempId, {
          synced: 1,
          synced_at: new Date().toISOString(),
          server_id: cierreResult.id
        });

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'cliente_create') {
        const { clienteData, temp_id: tempId } = item.payload || {};
        const { data: clienteResult, error: clienteError } = await supabase
          .from('clientes')
          .insert([clienteData])
          .select()
          .single();

        if (clienteError) throw clienteError;

        const clienteRow = await db.clientes_local.where('id').equals(tempId).first();
        if (clienteRow) {
          await db.clientes_local.update(clienteRow.local_id, {
            id: clienteResult.id,
            server_id: clienteResult.id,
            synced: 1,
            updated_at: clienteResult.updated_at || new Date().toISOString()
          });
        }

        const pendingUpdates = await db.outbox.where('status').equals('pending').toArray();
        for (const pendingItem of pendingUpdates) {
          if (
            (pendingItem.type === 'cliente_update' || pendingItem.type === 'cliente_delete') &&
            pendingItem.payload?.id === tempId
          ) {
            await db.outbox.update(pendingItem.id, {
              payload: { ...pendingItem.payload, id: clienteResult.id }
            });
          }
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'cliente_update') {
        const { id, updates } = item.payload || {};
        const clienteRow = await db.clientes_local.where('id').equals(id).first();
        const targetId = clienteRow?.server_id || id;

        if (!targetId || targetId.startsWith('tmp_')) {
          throw new Error('Cliente pendiente de crear antes de actualizar');
        }

        const { error: clienteError } = await supabase
          .from('clientes')
          .update({ ...updates })
          .eq('id', targetId);

        if (clienteError) throw clienteError;

        if (clienteRow) {
          await db.clientes_local.update(clienteRow.local_id, {
            ...updates,
            synced: 1
          });
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'cliente_delete') {
        const { id, updates } = item.payload || {};
        const clienteRow = await db.clientes_local.where('id').equals(id).first();
        const targetId = clienteRow?.server_id || id;

        if (!targetId || targetId.startsWith('tmp_')) {
          throw new Error('Cliente pendiente de crear antes de eliminar');
        }

        const { error: clienteError } = await supabase
          .from('clientes')
          .update({ ...updates })
          .eq('id', targetId);

        if (clienteError) throw clienteError;

        if (clienteRow) {
          await db.clientes_local.update(clienteRow.local_id, {
            ...updates,
            synced: 1
          });
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'producto_create') {
        const { productoData, temp_id: tempId } = item.payload || {};
        const { data: productoResult, error: productoError } = await supabase
          .from('productos')
          .insert([productoData])
          .select()
          .single();

        if (productoError) throw productoError;

        const productoRow = await db.productos_local.where('id').equals(tempId).first();
        if (productoRow) {
          await db.productos_local.update(productoRow.local_id, {
            id: productoResult.id,
            server_id: productoResult.id,
            synced: 1,
            updated_at: productoResult.updated_at || new Date().toISOString()
          });
        }

        const pendingUpdates = await db.outbox.where('status').equals('pending').toArray();
        for (const pendingItem of pendingUpdates) {
          if (
            (pendingItem.type === 'producto_update' || pendingItem.type === 'producto_delete') &&
            pendingItem.payload?.id === tempId
          ) {
            await db.outbox.update(pendingItem.id, {
              payload: { ...pendingItem.payload, id: productoResult.id }
            });
          }
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'producto_update') {
        const { id, updates } = item.payload || {};
        const productoRow = await db.productos_local.where('id').equals(id).first();
        const targetId = productoRow?.server_id || id;

        if (!targetId || targetId.startsWith('tmp_')) {
          throw new Error('Producto pendiente de crear antes de actualizar');
        }

        const { error: productoError } = await supabase
          .from('productos')
          .update({ ...updates })
          .eq('id', targetId);

        if (productoError) throw productoError;

        if (productoRow) {
          await db.productos_local.update(productoRow.local_id, {
            ...updates,
            synced: 1
          });
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'producto_delete') {
        const { id } = item.payload || {};
        const productoRow = await db.productos_local.where('id').equals(id).first();
        const targetId = productoRow?.server_id || id;

        if (!targetId || targetId.startsWith('tmp_')) {
          throw new Error('Producto pendiente de crear antes de eliminar');
        }

        const { error: productoError } = await supabase
          .from('productos')
          .delete()
          .eq('id', targetId);

        if (productoError) throw productoError;

        if (productoRow) {
          await db.productos_local.update(productoRow.local_id, {
            deleted: true,
            synced: 1
          });
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'pedido_create') {
        const { pedidoData, items = [], temp_id: tempId } = item.payload || {};

        let numeroPedido = pedidoData.numero_pedido;
        if (numeroPedido && numeroPedido.startsWith('OFF-')) {
          const { data: ultimoPedido } = await supabase
            .from('pedidos')
            .select('numero_pedido')
            .eq('organization_id', pedidoData.organization_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          let nuevoNumero = 'PED-001';
          if (ultimoPedido?.numero_pedido) {
            const ultimoNum = parseInt(ultimoPedido.numero_pedido.replace('PED-', ''));
            if (!Number.isNaN(ultimoNum)) {
              nuevoNumero = `PED-${String(ultimoNum + 1).padStart(3, '0')}`;
            }
          }
          numeroPedido = nuevoNumero;
        }

        const pedidoPayload = { ...pedidoData, numero_pedido: numeroPedido };
        const { data: pedidoResult, error: pedidoError } = await supabase
          .from('pedidos')
          .insert([pedidoPayload])
          .select()
          .single();

        if (pedidoError) throw pedidoError;

        const itemsData = (items || [])
          .filter(item => item.producto_id != null)
          .map(item => ({
            pedido_id: pedidoResult.id,
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            precio_total: item.precio_total,
            toppings: item.toppings || [],
            notas_item: item.notas || null,
            variaciones_seleccionadas: item.variaciones_seleccionadas || item.variaciones || null
          }));

        if (itemsData.length === 0) {
          throw new Error('Pedido sin items válidos');
        }

        const { error: itemsError } = await supabase
          .from('pedido_items')
          .insert(itemsData);
        if (itemsError) throw itemsError;

        if (pedidoPayload.mesa_id) {
          await supabase
            .from('mesas')
            .update({ estado: 'ocupada' })
            .eq('id', pedidoPayload.mesa_id);
        }

        const pedidoRow = await db.pedidos_local.where('id').equals(tempId).first();
        if (pedidoRow) {
          await db.pedidos_local.update(pedidoRow.local_id, {
            id: pedidoResult.id,
            server_id: pedidoResult.id,
            numero_pedido: numeroPedido,
            synced: 1,
            updated_at: pedidoResult.updated_at || new Date().toISOString()
          });
        }

        const pendingUpdates = await db.outbox.where('status').equals('pending').toArray();
        for (const pendingItem of pendingUpdates) {
          if (
            (pendingItem.type === 'pedido_update' || pendingItem.type === 'pedido_delete') &&
            pendingItem.payload?.id === tempId
          ) {
            await db.outbox.update(pendingItem.id, {
              payload: { ...pendingItem.payload, id: pedidoResult.id }
            });
          }
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'pedido_update') {
        const { id, updates, mesa_id } = item.payload || {};
        const pedidoRow = await db.pedidos_local.where('id').equals(id).first();
        const targetId = pedidoRow?.server_id || id;

        if (!targetId || targetId.startsWith('tmp_')) {
          throw new Error('Pedido pendiente de crear antes de actualizar');
        }

        const { error: pedidoError } = await supabase
          .from('pedidos')
          .update({ ...updates })
          .eq('id', targetId);
        if (pedidoError) throw pedidoError;

        if (updates?.estado === 'completado' && mesa_id) {
          await supabase
            .from('mesas')
            .update({ estado: 'disponible' })
            .eq('id', mesa_id);
        }

        if (pedidoRow) {
          await db.pedidos_local.update(pedidoRow.local_id, {
            ...updates,
            synced: 1
          });
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'pedido_delete') {
        const { id, mesa_id } = item.payload || {};
        const pedidoRow = await db.pedidos_local.where('id').equals(id).first();
        const targetId = pedidoRow?.server_id || id;

        if (!targetId || targetId.startsWith('tmp_')) {
          throw new Error('Pedido pendiente de crear antes de eliminar');
        }

        const { error: pedidoError } = await supabase
          .from('pedidos')
          .delete()
          .eq('id', targetId);
        if (pedidoError) throw pedidoError;

        if (mesa_id) {
          await supabase
            .from('mesas')
            .update({ estado: 'disponible' })
            .eq('id', mesa_id);
        }

        if (pedidoRow) {
          await db.pedidos_local.update(pedidoRow.local_id, {
            deleted: true,
            synced: 1
          });
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'pago_credito_create') {
        const { pagoData, temp_id: tempId } = item.payload || {};
        const { data: pagoResult, error: pagoError } = await supabase
          .from('pagos_creditos')
          .insert([pagoData])
          .select()
          .single();

        if (pagoError) throw pagoError;

        const pagoRow = await db.pagos_creditos_local.where('id').equals(tempId).first();
        if (pagoRow) {
          await db.pagos_creditos_local.update(pagoRow.local_id, {
            id: pagoResult.id,
            server_id: pagoResult.id,
            synced: 1
          });
        }

        const creditoRow = await db.creditos_local.where('id').equals(pagoData.credito_id).first();
        if (creditoRow) {
          const montoPago = Number(pagoData.monto || 0);
          const nuevoPagado = Number(creditoRow.monto_pagado || 0) + montoPago;
          const nuevoPendiente = Math.max(0, Number(creditoRow.monto_pendiente || 0) - montoPago);
          const nuevoEstado = nuevoPendiente === 0 ? 'pagado' : (nuevoPagado > 0 ? 'parcial' : creditoRow.estado);
          await db.creditos_local.update(creditoRow.local_id, {
            monto_pagado: nuevoPagado,
            monto_pendiente: nuevoPendiente,
            estado: nuevoEstado,
            synced: 1
          });
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }

      if (item.type === 'pago_credito_delete') {
        const { id, credito_id, monto } = item.payload || {};
        const pagoRow = await db.pagos_creditos_local.where('id').equals(id).first();
        const targetId = pagoRow?.server_id || id;

        if (!targetId || targetId.startsWith('tmp_')) {
          throw new Error('Pago pendiente de crear antes de eliminar');
        }

        const { error: pagoError } = await supabase
          .from('pagos_creditos')
          .delete()
          .eq('id', targetId);

        if (pagoError) throw pagoError;

        if (pagoRow) {
          await db.pagos_creditos_local.update(pagoRow.local_id, {
            synced: 1
          });
        }

        const creditoRow = await db.creditos_local.where('id').equals(credito_id).first();
        if (creditoRow) {
          const montoPago = Number(monto || 0);
          const nuevoPagado = Math.max(0, Number(creditoRow.monto_pagado || 0) - montoPago);
          const nuevoPendiente = Number(creditoRow.monto_total || 0) - nuevoPagado;
          const nuevoEstado = nuevoPagado === 0 ? 'pendiente' : 'parcial';
          await db.creditos_local.update(creditoRow.local_id, {
            monto_pagado: nuevoPagado,
            monto_pendiente: nuevoPendiente,
            estado: nuevoEstado,
            synced: 1
          });
        }

        await db.outbox.delete(item.id);
        synced += 1;
        continue;
      }
    } catch (error) {
      failed += 1;
      await db.outbox.update(item.id, {
        tries: (item.tries || 0) + 1,
        last_error: error?.message || String(error)
      });
    }
  }

  return { synced, failed };
};
