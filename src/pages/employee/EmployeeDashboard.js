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
      </Route>
    </Routes>
  );
};

export default EmployeeDashboard;
