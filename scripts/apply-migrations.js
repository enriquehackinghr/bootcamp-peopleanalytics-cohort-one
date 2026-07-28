/**
 * Applies supabase/migrations/*.sql in order using DATABASE_URL from .env.local.
 * Does not print connection strings or SQL contents to stdout beyond filenames.
 */
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local not found')
  }
  const text = fs.readFileSync(envPath, 'utf8')
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
    if (!(key in process.env)) process.env[key] = value
  }
}

async function main() {
  loadEnvLocal()
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set in .env.local')
  }

  const dir = path.join(process.cwd(), 'supabase', 'migrations')
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  })

  await client.connect()
  console.log(`Connected. Applying ${files.length} migration(s)...`)

  await client.query(`
    create table if not exists public.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `)

  for (const file of files) {
    const { rows } = await client.query(
      'select 1 from public.schema_migrations where filename = $1',
      [file],
    )
    if (rows.length) {
      console.log(`skip  ${file} (already applied)`)
      continue
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    process.stdout.write(`apply ${file} ... `)
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query(
        'insert into public.schema_migrations (filename) values ($1)',
        [file],
      )
      await client.query('commit')
      console.log('ok')
    } catch (error) {
      await client.query('rollback')
      console.log('FAILED')
      console.error(error instanceof Error ? error.message : error)
      process.exitCode = 1
      await client.end()
      return
    }
  }

  await client.end()
  console.log('Migrations complete.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
