-- Migration: add employee_id to pagos_creditos
alter table public.pagos_creditos
add column if not exists employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_pagos_creditos_employee
  on public.pagos_creditos(employee_id);
