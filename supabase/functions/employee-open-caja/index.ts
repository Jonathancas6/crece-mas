import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const hashToken = async (value: string) => {
  const data = new TextEncoder().encode(value)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método no permitido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    const body = await req.json()
    const token = String(body?.token || '').trim()
    const montoInicial = Number(body?.montoInicial || 0)
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token requerido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const tokenHash = await hashToken(token)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('employee_sessions')
      .select('employee_id, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (sessionError || !session?.employee_id) {
      return new Response(
        JSON.stringify({ error: 'Sesión inválida' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return new Response(
        JSON.stringify({ error: 'Sesión expirada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .select('id, organization_id, active')
      .eq('id', session.employee_id)
      .maybeSingle()

    if (employeeError || !employee?.id || employee.active === false) {
      return new Response(
        JSON.stringify({ error: 'Empleado inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Verificar si el empleado ya tiene una apertura activa en esta organización
    const { data: aperturaActiva, error: aperturaError } = await supabaseAdmin
      .from('aperturas_caja')
      .select('id')
      .eq('organization_id', employee.organization_id)
      .eq('employee_id', employee.id)
      .is('cierre_id', null)
      .maybeSingle()

    if (aperturaError) {
      return new Response(
        JSON.stringify({ error: 'Error al verificar apertura existente' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (aperturaActiva) {
      return new Response(
        JSON.stringify({ error: 'Ya existe una caja abierta. Debes cerrarla antes de abrir una nueva.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      )
    }

    const { data: apertura, error: insertError } = await supabaseAdmin
      .from('aperturas_caja')
      .insert([{
        organization_id: employee.organization_id,
        user_id: null,
        employee_id: employee.id,
        monto_inicial: Number.isFinite(montoInicial) ? montoInicial : 0,
        estado: 'abierta',
      }])
      .select()
      .single()

    if (insertError) {
      return new Response(
        JSON.stringify({ error: insertError.message || 'Error al crear apertura de caja' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    return new Response(
      JSON.stringify({ apertura }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Error interno' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
