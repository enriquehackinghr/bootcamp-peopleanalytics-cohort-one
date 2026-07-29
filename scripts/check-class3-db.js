const { Client } = require('pg')
const fs = require('fs')

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (!m) continue
  process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL })
  await c.connect()
  const tables = [
    'employee_snapshots',
    'termination_history',
    'engagement_score_history',
    'org_events',
    'exit_interviews',
  ]
  for (const t of tables) {
    const r = await c.query(`select count(*)::int as n from public.${t}`)
    console.log(t, r.rows[0].n)
  }
  const fns = await c.query(`
    select n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname like 'c3_%' or p.proname = 'attrition_risk_score'
    order by 1, 2
  `)
  console.log('rpc count', fns.rows.length)
  console.log(fns.rows.map((r) => `${r.nspname}.${r.proname}`).join('\n'))

  try {
    const rate = await c.query(`select public.c3_voluntary_attrition_rate('{}'::jsonb) as r`)
    console.log('voluntary rate', rate.rows[0].r)
  } catch (e) {
    console.log('voluntary rate error', e.message)
  }

  try {
    const cut = await c.query(
      `select public.c3_attrition_by_cut('{}'::jsonb, 'function') as r`,
    )
    console.log('by cut sample', JSON.stringify(cut.rows[0].r).slice(0, 400))
  } catch (e) {
    console.log('by cut error', e.message)
  }

  await c.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
