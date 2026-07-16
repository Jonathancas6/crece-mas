import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import EmployeeLayout from './EmployeeLayout';
import { useAuth } from '../../context/AuthContext';
import HistorialCierresCaja from '../dashboard/HistorialCierresCaja';
import ConsultarPrecio from '../dashboard/ConsultarPrecio';

const Caja = lazy(() => import('../dashboard/Caja'));
const HistorialVentas = lazy(() => import('../dashboard/HistorialVentas'));
const CierreCaja = lazy(() => import('../CierreCaja'));
const Clientes = lazy(() => import('../dashboard/Clientes'));
const Creditos = lazy(() => import('../dashboard/Creditos'));
const Inventario = lazy(() => import('../dashboard/Inventario'));
const InventarioRevisiones = lazy(() => import('../dashboard/InventarioRevisiones'));
const InventarioInicial = lazy(() => import('../dashboard/InventarioInicial'));
const MovimientosStock = lazy(() => import('../dashboard/MovimientosStock'));

const DashboardLoader = () => (
  <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
    Cargando...
  </div>
);

const EmployeeDashboard = () => {
  const { hasPermission, user } = useAuth();

  const ClientesPage = hasPermission('clientes.view') ? (
    <Clientes />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para ver clientes.
    </div>
  );

  const CreditosPage = hasPermission('creditos.view') ? (
    <Creditos />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para ver créditos.
    </div>
  );

  const ConsultarPrecioPage = hasPermission('ventas.view') || hasPermission('ventas.create') ? (
    <ConsultarPrecio />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para consultar precios.
    </div>
  );

  const HistorialCierresPage = hasPermission('cierre.create') || hasPermission('cierre.view') ? (
    <HistorialCierresCaja employeeId={user?.id || null} />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para ver cierres de caja.
    </div>
  );

  const HistorialVentasPage = hasPermission('ventas.view') ? (
    <HistorialVentas />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para ver el historial de ventas.
    </div>
  );

  const CajaPage = hasPermission('ventas.create') ? (
    <Caja />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para acceder a la caja.
    </div>
  );

  const CierreCajaPage = hasPermission('cierre.create') ? (
    <CierreCaja />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para realizar cierres de caja.
    </div>
  );

  const canViewInventory = hasPermission('inventario.view') || hasPermission('inventario.create') || hasPermission('inventario.edit') || hasPermission('inventario.delete') || hasPermission('inventario.review_differences');

  const InventarioPage = canViewInventory ? (
    <Inventario />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para ver el inventario.
    </div>
  );

  const InventarioRevisionesPage = hasPermission('inventario.review_differences') || canViewInventory ? (
    <InventarioRevisiones />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para ver revisiones de inventario.
    </div>
  );

  const InventarioInicialPage = hasPermission('inventario.create') || canViewInventory ? (
    <InventarioInicial />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para registro de inventario.
    </div>
  );

  const MovimientosStockPage = canViewInventory ? (
    <MovimientosStock />
  ) : (
    <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
      No tienes permisos para ver movimientos de stock.
    </div>
  );

  // Determinar qué mostrar en el index si no tiene acceso a caja
  let IndexPage = hasPermission('ventas.create') ? (
    <Caja />
  ) : null;

  // Si el usuario no tiene acceso a la caja, llevarlo a otra sección permitida
  if (IndexPage === null) {
    if (hasPermission('ventas.view')) {
      IndexPage = <HistorialVentas />;
    } else if (hasPermission('clientes.view')) {
      IndexPage = <Clientes />;
    } else if (canViewInventory) {
      IndexPage = <Inventario />;
    } else {
      IndexPage = <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Seleccione una opción del menú.</div>;
    }
  }

  return (
    <Routes>
      <Route element={<EmployeeLayout />}>
        <Route index element={
          <Suspense fallback={<DashboardLoader />}>
            {IndexPage}
          </Suspense>
        } />
        <Route path="caja" element={
          <Suspense fallback={<DashboardLoader />}>
            {CajaPage}
          </Suspense>
        } />
        <Route path="historial-ventas" element={
          <Suspense fallback={<DashboardLoader />}>
            {HistorialVentasPage}
          </Suspense>
        } />
        <Route path="clientes" element={
          <Suspense fallback={<DashboardLoader />}>
            {ClientesPage}
          </Suspense>
        } />
        <Route path="creditos" element={
          <Suspense fallback={<DashboardLoader />}>
            {CreditosPage}
          </Suspense>
        } />
        <Route path="consultar-precio" element={
          <Suspense fallback={<DashboardLoader />}>
            {ConsultarPrecioPage}
          </Suspense>
        } />
        <Route path="cierre-caja" element={
          <Suspense fallback={<DashboardLoader />}>
            {CierreCajaPage}
          </Suspense>
        } />
        <Route path="historial-cierres" element={
          <Suspense fallback={<DashboardLoader />}>
            {HistorialCierresPage}
          </Suspense>
        } />
        <Route path="inventario" element={
          <Suspense fallback={<DashboardLoader />}>
            {InventarioPage}
          </Suspense>
        } />
        <Route path="inventario/revisiones" element={
          <Suspense fallback={<DashboardLoader />}>
            {InventarioRevisionesPage}
          </Suspense>
        } />
        <Route path="inventario/inicial" element={
          <Suspense fallback={<DashboardLoader />}>
            {InventarioInicialPage}
          </Suspense>
        } />
        <Route path="inventario/movimientos" element={
          <Suspense fallback={<DashboardLoader />}>
            {MovimientosStockPage}
          </Suspense>
        } />
      </Route>
    </Routes>
  );
};

export default EmployeeDashboard;
