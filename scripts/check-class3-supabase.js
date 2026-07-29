const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')

function loadEnvLocal() {
  const text = fs.readFileSync('.env.local', 'utf8')
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvLocal()

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  console.log('supabase url set', Boolean(url), url ? url.slice(0, 40) : '')
  console.log('service key set', Boolean(key))
  const db = process.env.DATABASE_URL || ''
  console.log('DATABASE_URL host', db.replace(/:[^:@/]+@/, ':***@').slice(0, 100))

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  for (const t of [
    'employee_snapshots',
    'termination_history',
    'engagement_score_history',
    'org_events',
    'exit_interviews',
    'requisitions',
  ]) {
    const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true })
    console.log(t, error ? `ERR ${error.message}` : count)
  }

  for (const fn of [
    'c3_voluntary_attrition_rate',
    'open_requisitions',
    'active_headcount',
    'c3_attrition_by_cut',
  ]) {
    const args =
      fn === 'c3_attrition_by_cut'
        ? { filters: {}, cut: 'function' }
        : { filters: {} }
    const { data, error } = await sb.rpc(fn, args)
    console.log(
      'rpc',
      fn,
      error ? `ERR ${error.message}` : JSON.stringify(data).slice(0, 200),
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
