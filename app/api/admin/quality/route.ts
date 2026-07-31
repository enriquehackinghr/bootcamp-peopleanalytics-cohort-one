import { NextResponse } from 'next/server'
import { listRuns } from '@/lib/adversarial/store'
import { listProposals } from '@/lib/adversarial/proposals'
import { listWizardVersions } from '@/lib/adversarial/versioning'
import { CLASS4_HISTORICAL_BASELINE, EVALUATOR_VERSION, SUITE_VERSION } from '@/lib/adversarial/taxonomy'
import { liveSuiteStats } from '@/lib/adversarial/suites'
import { authErrorResponse, requireAdmin, requireSession } from '@/lib/auth/guard'
import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const session = await requireSession(request)
    // Executives may view approved quality summaries read-only; full cost/detail is admin.
    if (session.appRole !== 'admin' && session.appRole !== 'executive') {
      await requireAdmin(session, '/api/admin/quality')
    }

    const runs = await listRuns(50)
    const class5Runs = runs.filter(
      (r) => r.suite && r.suite !== 'legacy' && r.status === 'completed',
    )
    const baseline = class5Runs
      .filter((r) => r.baseline_label === 'class5_baseline' || r.triggered_by === 'class5_baseline')
      .sort((a, b) => a.started_at.localeCompare(b.started_at))[0]
    const latestClass5 = class5Runs[0] ?? null
    const postImprovement =
      class5Runs.find(
        (r) =>
          r.baseline_label === 'class5_post_improvement' ||
          (baseline && r.started_at > baseline.started_at && r.run_id !== baseline.run_id),
      ) ?? (latestClass5 && baseline && latestClass5.run_id !== baseline.run_id ? latestClass5 : null)

    const proposals = session.appRole === 'admin' ? await listProposals() : []
    const versions = await listWizardVersions()
    const active = versions.find((v) => v.status === 'active')
    const previous = versions.find((v) => v.wizard_version === active?.parent_version)

    let residualRisks: unknown[] = []
    if (hasDatabaseConfig()) {
      const supabase = getServiceSupabase()
      const { data } = await supabase.from('accepted_residual_risks').select('*')
      residualRisks = data ?? []
    } else {
      residualRisks = [
        {
          risk_id: 'A3-differencing',
          title: 'Aggregate differencing residual risk',
          owner: 'platform-admin',
        },
      ]
    }

    const suite = liveSuiteStats()
    const isAdmin = session.appRole === 'admin'

    return NextResponse.json({
      suiteVersion: SUITE_VERSION,
      evaluatorVersion: EVALUATOR_VERSION,
      liveSuite: suite,
      class4Historical: CLASS4_HISTORICAL_BASELINE,
      class5Baseline: baseline
        ? {
            runId: baseline.run_id,
            composite: baseline.composite_score,
            grade: baseline.letter_grade,
            answerQuality: baseline.answer_quality_score,
            actionCompletion: baseline.action_completion_score,
            wizardVersion: baseline.wizard_version,
            suiteVersion: baseline.suite_version,
            evaluatorVersion: baseline.evaluator_version,
            startedAt: baseline.started_at,
          }
        : null,
      class5Current: latestClass5
        ? {
            runId: latestClass5.run_id,
            composite: latestClass5.composite_score,
            grade: latestClass5.letter_grade,
            answerQuality: latestClass5.answer_quality_score,
            actionCompletion: latestClass5.action_completion_score,
            wizardVersion: latestClass5.wizard_version,
            suiteVersion: latestClass5.suite_version,
            evaluatorVersion: latestClass5.evaluator_version,
            averageLatencyMs: latestClass5.average_latency_ms,
            estimatedCostUsd: isAdmin ? latestClass5.estimated_cost_usd : undefined,
            tokenUsage: isAdmin ? latestClass5.token_usage : undefined,
            startedAt: latestClass5.started_at,
          }
        : null,
      class5PostImprovement: postImprovement
        ? {
            runId: postImprovement.run_id,
            composite: postImprovement.composite_score,
            grade: postImprovement.letter_grade,
            answerQuality: postImprovement.answer_quality_score,
            actionCompletion: postImprovement.action_completion_score,
          }
        : null,
      recentRuns: runs.slice(0, 10).map((r) => ({
        runId: r.run_id,
        suite: r.suite,
        baselineLabel: r.baseline_label,
        status: r.status,
        composite: r.composite_score,
        grade: r.letter_grade,
        answerQuality: r.answer_quality_score,
        actionCompletion: r.action_completion_score,
        wizardVersion: r.wizard_version,
        suiteVersion: r.suite_version,
        evaluatorVersion: r.evaluator_version,
        startedAt: r.started_at,
      })),
      proposals: isAdmin
        ? {
            total: proposals.length,
            pending: proposals.filter((p) => p.lifecycle_state === 'pending_review').length,
            approved: proposals.filter((p) => p.human_decision === 'approve').length,
            rejected: proposals.filter((p) => p.human_decision === 'reject').length,
            rolledBack: proposals.filter((p) => p.lifecycle_state === 'rolled_back').length,
            retained: proposals.filter((p) => p.lifecycle_state === 'retained').length,
          }
        : { summaryOnly: true },
      wizardVersions: {
        current: active?.wizard_version ?? null,
        previous: previous?.wizard_version ?? null,
      },
      residualRisks,
      openLimitations: [
        'A3 differencing remains accepted residual risk with named owner and future mitigation.',
        'Class 4 historical baseline must never be compared directly to Class 5 suite scores.',
      ],
    })
  } catch (error) {
    return authErrorResponse(error)
  }
}
