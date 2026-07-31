import { NextResponse } from 'next/server'
import { runAudit, startAudit } from '@/lib/adversarial/runner'
import { readJsonBody } from '@/lib/db/filters'
import { authErrorResponse, requireAdmin, requireSession } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

interface RunRequestBody {
  triggeredBy?: string
  triggeredByUser?: string | null
  probeKeys?: string[]
  suite?: 'live' | 'full' | 'development' | 'regression' | 'holdout' | 'legacy'
  baselineLabel?: string | null
}

function isAuthorizedForCron(req: Request): boolean {
  const expected = process.env.ADVERSARIAL_CRON_SECRET
  if (!expected) return false
  const header = req.headers.get('authorization') || ''
  const bearer = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : ''
  const xSecret = req.headers.get('x-cron-secret')?.trim() ?? ''
  return bearer === expected || xSecret === expected
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<RunRequestBody>(request).catch(
      () => ({}) as RunRequestBody,
    )
    const providedTrigger = body.triggeredBy?.trim()

    let triggeredBy = 'manual'
    if (providedTrigger === 'cron') {
      if (!isAuthorizedForCron(request)) {
        return NextResponse.json(
          { error: 'Unauthorized cron trigger — missing or invalid ADVERSARIAL_CRON_SECRET.' },
          { status: 401 },
        )
      }
      triggeredBy = 'cron'
    } else {
      const session = await requireSession(request)
      await requireAdmin(session, '/api/adversarial/run')
      triggeredBy = providedTrigger ? providedTrigger.slice(0, 40) : 'manual'
      body.triggeredByUser = body.triggeredByUser ?? session.workEmail
    }

    if (triggeredBy === 'cron') {
      const result = await runAudit({
        triggeredBy,
        triggeredByUser: body.triggeredByUser ?? null,
        probeKeys: body.probeKeys,
        suite: body.suite ?? 'live',
        baselineLabel: body.baselineLabel ?? null,
      })
      const httpStatus = result.status === 'failed' ? 500 : 200
      return NextResponse.json(result, { status: httpStatus })
    }

    const start = await startAudit({
      triggeredBy,
      triggeredByUser: body.triggeredByUser ?? null,
      probeKeys: body.probeKeys,
      suite: body.suite ?? 'live',
      baselineLabel: body.baselineLabel ?? null,
    })
    return NextResponse.json(start, { status: 202 })
  } catch (error) {
    return authErrorResponse(error)
  }
}
