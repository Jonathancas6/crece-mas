import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import EmployeeLayout from './EmployeeLayout';
import { useAuth } from '../../context/AuthContext';
import HistorialCierresCaja from '../dashboard/HistorialCierresCaja';
import ConsultarPrecio from '../dashboard/ConsultarPrecio';
import SinPermisos from '../../components/SinPermisos';

const Caja = lazy(() => import('../dashboard/Caja'));
const HistorialVentas = lazy(() => import('../dashboard/HistorialVentas'));
const CierreCaja = lazy(() => import('../CierreCaja'));
const Inventario = lazy(() => import('../dashboard/Inventario'));
const InventarioRevisiones = lazy(() => import('../dashboard/InventarioRevisiones'));
const InventarioInicial = lazy(() => import('../dashboard/InventarioInicial'));
const Toppings = lazy(() => import('../../components/GestionToppings'));
const Variaciones = lazy(() => import('../../components/GestionVariaciones'));
const Clientes = lazy(() => import('../dashboard/Clientes'));
const Creditos = lazy(() => import('../dashboard/Creditos'));
const Egresos = lazy(() => import('../dashboard/Egresos'));

const DashboardLoader = () => (
  <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
    Cargando...
  </div>
);

const EmployeeDashboard = () => {
  const { hasPermission, user } = useAuth();

  const ClientesPage = hasPermission('clientes.view')
    ? <Clientes />
    : <SinPermisos mensaje="No tienes permiso para ver el módulo de Clientes." />;

  const CreditosPage = hasPermission('creditos.view')
    ? <Creditos />
    : <SinPermisos mensaje="No tienes permiso para ver el módulo de Créditos." />;

  const ConsultarPrecioPage = hasPermission('ventas.view') || hasPermission('ventas.create')
    ? <ConsultarPrecio />
    : <SinPermisos mensaje="No tienes permiso para consultar precios." />;

  const HistorialCierresPage = hasPermission('cierre.create') || hasPermission('cierre.view')
    ? <HistorialCierresCaja employeeId={user?.id || null} />
    : <SinPermisos mensaje="No tienes permiso para ver el historial de cierres de caja." />;

  const HistorialVentasPage = hasPermission('ventas.view')
    ? <HistorialVentas />
    : <SinPermisos mensaje="No tienes permiso para ver el historial de ventas." />;

  const InventarioPage = hasPermission('inventario.view')
    ? <Inventario />
    : <SinPermisos mensaje="No tienes permiso para ver el Inventario." />;

  const InventarioRevisionesPage = hasPermission('inventario.view')
    ? <InventarioRevisiones />
    : <SinPermisos mensaje="No tienes permiso para ver las revisiones de inventario." />;

  const InventarioInicialPage = hasPermission('inventario.view')
    ? <InventarioInicial />
    : <SinPermisos mensaje="No tienes permiso para ver el Inventario Inicial." />;

  const ToppingsPage = hasPermission('inventario.view')
    ? <Toppings />
    : <SinPermisos mensaje="No tienes permiso para gestionar Toppings." />;

  const VariacionesPage = hasPermission('inventario.view')
    ? <Variaciones />
    : <SinPermisos mensaje="No tienes permiso para gestionar Variaciones." />;

  // Usa egresos.view (permiso dedicado, no inventario.view)
  const EgresosPage = hasPermission('egresos.view')
    ? <Egresos />
    : <SinPermisos mensaje="No tienes permiso para ver Egresos y Compras." />;

  return (
    <Routes>
      <Route element={<EmployeeLayout />}>
        <Route index element={
          <Suspense fallback={<DashboardLoader />}>
            <Caja />
          </Suspense>
        } />
        <Route path="caja" element={
          <Suspense fallback={<DashboardLoader />}>
            <Caja />
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
            <CierreCaja />
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
        <Route path="toppings" element={
          <Suspense fallback={<DashboardLoader />}>
            {ToppingsPage}
          </Suspense>
        } />
        <Route path="variaciones" element={
          <Suspense fallback={<DashboardLoader />}>
            {VariacionesPage}
          </Suspense>
        } />
        <Route path="egresos" element={
          <Suspense fallback={<DashboardLoader />}>
            {EgresosPage}
          </Suspense>
        } />
      </Route>
    </Routes>
  );
};

export default EmployeeDashboard;
