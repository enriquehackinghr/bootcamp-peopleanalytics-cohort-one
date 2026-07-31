/**
 * Build a sanitized, secrets-free student code pack on the Desktop.
 * Does not copy .env.local, node_modules, .next, .git, or agent folders.
 *
 * Usage: npx tsx scripts/pack-student-release.ts
 */
import fs from 'fs'
import path from 'path'

const ROOT = process.cwd()
const OUT = path.join(
  process.env.USERPROFILE || process.env.HOME || ROOT,
  'OneDrive',
  'Desktop',
  'Meridian-Student-Showcase-Code',
)

const INCLUDE_DIRS = [
  'app',
  'components',
  'lib',
  'public',
  'supabase',
  'scripts',
]

const INCLUDE_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'next.config.ts',
  'next-env.d.ts',
  'middleware.ts',
  '.env.example',
  '.gitignore',
  'README.md',
]

const EXCLUDE_DIR_NAMES = new Set([
  'node_modules',
  '.next',
  '.git',
  '.cursor',
  'agent-transcripts',
  'terminals',
  'dist',
  'out',
  'student-release',
])

const EXCLUDE_FILE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.production.local',
  'sample-env.local',
])

function shouldSkip(name: string): boolean {
  if (EXCLUDE_DIR_NAMES.has(name)) return true
  if (EXCLUDE_FILE_NAMES.has(name)) return true
  if (name.endsWith('.local')) return true
  return false
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) continue
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

function writeStudentReadme(dest: string) {
  const body = `# Meridian Student Showcase — Code Pack

This folder is a **secrets-free** snapshot of the Meridian People Analytics dashboard for cohort learning.

## What this is

- Source code you can read to understand the architecture (Next.js, metrics layer, permissions, UI).
- Student showcase mode is **on by default**: no email login, Wizard / adversarial / data upload disabled.
- **No API keys, database passwords, or \`.env.local\` are included.**

## What this is not

- A private fork of production credentials.
- A full local data environment (synthetic Meridian data lives in the instructor Supabase project).

## Use the live showcase

Open the deployed student URL provided by your instructor (no sign-in).

## Exploring the code

| Area | Start here |
|---|---|
| Pages / routes | \`app/(dashboard)/\` |
| Metrics API | \`app/api/metrics/\`, \`lib/db/\` |
| Permissions | \`lib/auth/permissions.ts\` |
| Student feature gates | \`lib/features.ts\` |
| Schema | \`supabase/migrations/\` |

## Optional local install (no secrets)

\`\`\`bash
npm install
cp .env.example .env.local
# Leave keys empty unless your instructor gives you a *separate* sandbox project.
npm run typecheck
\`\`\`

Without Supabase credentials the UI will not load live metrics. That is expected.

## Restore full Class 5 tooling (instructors only)

Requires real keys in \`.env.local\` (never commit them):

\`\`\`bash
NEXT_PUBLIC_STUDENT_SHOWCASE=false
STUDENT_SHOWCASE=false
SESSION_SECRET=...
OPENAI_API_KEY=...
ADVERSARIAL_AI_LLM_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
\`\`\`

## Security note

If you ever find a real API key or connection string in this pack, do **not** use it — tell your instructor immediately.
`

  fs.writeFileSync(path.join(dest, 'README-STUDENT.md'), body, 'utf8')
}

function writeStudentEnvExample(dest: string) {
  const body = `# Student pack — placeholders only. Do NOT put real production secrets here.

# Student showcase (default). Set both to false only in a private instructor sandbox.
NEXT_PUBLIC_STUDENT_SHOWCASE=true
STUDENT_SHOWCASE=true

# Optional local session signing (≥16 chars). Required if you run production mode.
SESSION_SECRET=

# Supabase (leave blank unless you have a *sandbox* project)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# Disabled in student showcase — leave blank
OPENAI_API_KEY=
ADVERSARIAL_AI_LLM_API_KEY=
ADVERSARIAL_CRON_SECRET=
RESEND_API_KEY=
`

  fs.writeFileSync(path.join(dest, '.env.example'), body, 'utf8')
}

function assertNoSecrets(dest: string) {
  const banned =
    /(sk-[a-zA-Z0-9]{20,}|sk-ant-|sk-proj-|ghp_[A-Za-z0-9]{20,}|eyJhbGci[A-Za-z0-9_-]{30,}\.|postgresql:\/\/[^:\s]+:[^@\s]+@)/g
  const hits: string[] = []

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (shouldSkip(entry.name)) continue
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(p)
        continue
      }
      if (!/\.(ts|tsx|js|jsx|md|json|sql|example|yml|yaml|txt|css)$/i.test(entry.name)) continue
      const text = fs.readFileSync(p, 'utf8')
      if (banned.test(text)) hits.push(path.relative(dest, p))
      banned.lastIndex = 0
    }
  }

  walk(dest)
  if (hits.length) {
    throw new Error(`Secret-like patterns found in student pack:\n${hits.join('\n')}`)
  }
}

function main() {
  if (fs.existsSync(OUT)) {
    fs.rmSync(OUT, { recursive: true, force: true })
  }
  fs.mkdirSync(OUT, { recursive: true })

  for (const dir of INCLUDE_DIRS) {
    const src = path.join(ROOT, dir)
    if (!fs.existsSync(src)) continue
    copyDir(src, path.join(OUT, dir))
  }

  for (const file of INCLUDE_FILES) {
    const src = path.join(ROOT, file)
    if (!fs.existsSync(src)) continue
    fs.copyFileSync(src, path.join(OUT, file))
  }

  // Prefer student-facing docs/env example
  writeStudentReadme(OUT)
  writeStudentEnvExample(OUT)

  // Remove scripts that assume instructor DB credentials / migrations against prod
  const dropScripts = [
    'apply-migrations.js',
    'reload-performance-reviews.ts',
    'check-class3-db.js',
    'check-class3-supabase.js',
    'pack-student-release.ts',
  ]
  for (const name of dropScripts) {
    const p = path.join(OUT, 'scripts', name)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }

  assertNoSecrets(OUT)

  console.log(`Student pack written to:\n  ${OUT}`)
  console.log('Verified: no secret-like patterns detected.')
}

main()
