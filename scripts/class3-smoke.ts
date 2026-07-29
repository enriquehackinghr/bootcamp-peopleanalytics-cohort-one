/**
 * Class 3 smoke checks (run with: npx tsx scripts/class3-smoke.ts)
 * Validates contracts without requiring a live DB.
 */
import { validateReportSpec } from '../lib/reports/store'
import { EMPTY_FILTER_CONTEXT, MIN_CELL_SIZE, MIN_CELL_SIZE_HAZARD } from '../lib/types'
import { answerWizard } from '../lib/wizard'

async function main() {
  const checks: { name: string; ok: boolean; detail?: string }[] = []

  checks.push({
    name: 'cell sizes differ (D-1)',
    ok: MIN_CELL_SIZE === 5 && MIN_CELL_SIZE_HAZARD === 10,
  })

  const bad = validateReportSpec({ measures: ['not_a_real_measure'] })
  checks.push({
    name: 'T-14 reject unapproved measure',
    ok: !bad.ok,
    detail: !bad.ok ? bad.reason : undefined,
  })

  const good = validateReportSpec({ measures: ['c3_voluntary_attrition_rate'] })
  checks.push({ name: 'approved measure accepted', ok: good.ok })

  const refusal = await answerWizard({
    question: 'Rank named individuals by attrition risk',
    filters: EMPTY_FILTER_CONTEXT,
  })
  checks.push({
    name: 'T-19 refuse named individual risk',
    ok: refusal.refused === true,
    detail: refusal.refusalReason ?? undefined,
  })

  const managerRefusal = await answerWizard({
    question: 'Rank named managers by effectiveness',
    filters: EMPTY_FILTER_CONTEXT,
  })
  checks.push({
    name: 'T-20 refuse manager ranking without components',
    ok: managerRefusal.refused === true,
  })

  const anonRefusal = await answerWizard({
    question: 'Who said what on the engagement survey?',
    filters: EMPTY_FILTER_CONTEXT,
  })
  checks.push({
    name: 'T-21 refuse anonymous respondent ID',
    ok: anonRefusal.refused === true,
  })

  let failed = 0
  for (const c of checks) {
    const mark = c.ok ? 'PASS' : 'FAIL'
    if (!c.ok) failed += 1
    console.log(`${mark} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
  }
  if (failed) {
    console.error(`${failed} check(s) failed`)
    process.exit(1)
  }
  console.log('All Class 3 smoke checks passed')
}

void main()
