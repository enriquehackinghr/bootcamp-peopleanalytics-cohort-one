import { NextResponse } from 'next/server'
import { authErrorResponse, requireAdmin, requireSession } from '@/lib/auth/guard'
import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'

export async function GET(request: Request) {
  try {
    const session = await requireSession(request)
    await requireAdmin(session, new URL(request.url).pathname)

    if (!hasDatabaseConfig()) {
      return NextResponse.json({ rows: [] })
    }

    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500)
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from('access_audit_log')
      .select(
        'event_id, timestamp, session_id, employee_id, work_email, app_role, action, target_type, target_id, route, tool_name, scope_size, outcome, denial_reason, data_load_id',
      )
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ rows: [], warning: error.message })
    }
    return NextResponse.json({ rows: data ?? [] })
  } catch (error) {
    return authErrorResponse(error)
  }
}
