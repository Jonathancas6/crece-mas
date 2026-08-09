// Edge Function para crear empleados sin validación de email (solo owner)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'
const PBKDF2_ITERATIONS = 120_000

const generateSalt = () => {
  const saltBytes = new Uint8Array(16)
  crypto.getRandomValues(saltBytes)
  return btoa(String.fromCharCode(...saltBytes))
}

const hashPassword = async (password: string) => {
  const salt = generateSalt()
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  )
  const hashBytes = new Uint8Array(bits)
  const hash = btoa(String.fromCharCode(...hashBytes))
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67cbae63-1d62-454e-a79c-6473cc85ec06',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H6',location:'create-employee-user/index.ts:18',message:'auth:header',data:{hasAuthHeader:!!authHeader,authPrefix:authHeader?.slice(0,6) || null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado - falta Authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67cbae63-1d62-454e-a79c-6473cc85ec06',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H6',location:'create-employee-user/index.ts:36',message:'auth:getUser',data:{hasUser:!!userData?.user,hasError:!!userError,errorMessage:userError?.message || null},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'No autorizado - usuario inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const body = await req.json()
    const {
      organizationId,
      nombre,
      telefono,
      role,
      customRoleId,
      accessCode,
      username,
      pin,
    } = body || {}

    if (!organizationId || !nombre || !username || !pin) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const usernameTrim = String(username || '').toLowerCase().trim()
    const usernameSafe = usernameTrim.replace(/[^a-z0-9]/g, '')
    const accessCodeTrim = String(accessCode || '').trim()
    const accessCodeSafe = accessCodeTrim.replace(/[^0-9]/g, '')
    const pinTrim = String(pin || '').trim() || accessCodeSafe

    if (usernameSafe.length < 4 || usernameSafe.length > 12) {
      return new Response(
        JSON.stringify({ error: 'El usuario debe tener entre 4 y 12 caracteres.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (accessCodeSafe.length < 4 || accessCodeSafe.length > 12) {
      return new Response(
        JSON.stringify({ error: 'El código debe tener entre 4 y 12 dígitos.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (accessCodeSafe === usernameSafe) {
      return new Response(
        JSON.stringify({ error: 'El código debe ser diferente al usuario.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!/^[0-9]{4,12}$/.test(pinTrim)) {
      return new Response(
        JSON.stringify({ error: 'El código debe ser numérico (4 a 12 dígitos).' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Verificar que el usuario autenticado sea owner de la organización
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id, owner_id')
      .eq('id', organizationId)
      .single()

    if (orgError || !org) {
      return new Response(
        JSON.stringify({ error: 'Organización no encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    if (org.owner_id !== userData.user.id) {
      return new Response(
        JSON.stringify({ error: 'Solo el owner puede crear usuarios sin validación' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    const { data: existingCode, error: existingCodeError } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('code', accessCodeSafe)
      .eq('active', true)
      .maybeSingle()

    if (existingCodeError) {
      return new Response(
        JSON.stringify({ error: existingCodeError.message || 'Error validando código de acceso' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (existingCode) {
      return new Response(
        JSON.stringify({ error: 'El código de acceso (PIN) ya está en uso en esta organización.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      )
    }

    const { data: existingMember, error: existingMemberError } = await supabaseAdmin
      .from('team_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('employee_username', usernameSafe)
      .eq('is_employee', true)
      .eq('status', 'active')
      .maybeSingle()

    if (existingMemberError) {
      return new Response(
        JSON.stringify({ error: existingMemberError.message || 'Error validando usuario' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (existingMember) {
      return new Response(
        JSON.stringify({ error: 'Ese usuario ya existe en la organización.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
      )
    }

    const passwordHash = await hashPassword(pinTrim)

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/67cbae63-1d62-454e-a79c-6473cc85ec06',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H7',location:'create-employee-user/index.ts:155',message:'team_members:insert_attempt',data:{hasAccessCode:!!accessCode,isEmployee:true,hasUsername:!!usernameSafe},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('team_members')
      .insert([{
        organization_id: organizationId,
        role: role || 'cashier',
        custom_role_id: customRoleId || null,
        status: 'active',
        invited_by: userData.user.id,
        employee_code: accessCodeSafe,
        employee_name: nombre,
        employee_email: null,
        employee_phone: telefono || null,
        employee_username: usernameSafe,
        is_employee: true,
        joined_at: new Date().toISOString(),
      }])
      .select()
      .single()

    if (employeeError) {
      return new Response(
        JSON.stringify({ error: employeeError.message || 'Error al crear empleado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const { error: employeeAuthError } = await supabaseAdmin
      .from('employees')
      .insert([{
        organization_id: organizationId,
        team_member_id: employee.id,
        code: accessCodeSafe,
        password_hash: passwordHash,
        role: role || 'cashier',
        active: true
      }])

    if (employeeAuthError) {
      return new Response(
        JSON.stringify({ error: employeeAuthError.message || 'Error al crear credenciales del empleado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    return new Response(
      JSON.stringify({ success: true, employee }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Error interno' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
