import { NextResponse } from 'next/server'
import {
  applyApprovedProposal,
  decideProposal,
  listProposals,
  submitForReview,
} from '@/lib/adversarial/proposals'
import { readJsonBody } from '@/lib/db/filters'
import { authErrorResponse, requireAdmin, requireSession } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const session = await requireSession(request)
    await requireAdmin(session, '/api/adversarial/proposals')
    const proposals = await listProposals()
    return NextResponse.json({ proposals })
  } catch (error) {
    return authErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request)
    await requireAdmin(session, '/api/adversarial/proposals')
    const body = await readJsonBody<{
      action: 'submit' | 'decide' | 'apply'
      proposalId: string
      decision?: 'approve' | 'reject' | 'revise'
      note?: string
    }>(request)

    if (!body.proposalId) {
      return NextResponse.json({ error: 'proposalId required' }, { status: 400 })
    }

    if (body.action === 'submit') {
      const result = await submitForReview(body.proposalId, session.workEmail)
      if (result.error) return NextResponse.json(result, { status: 400 })
      return NextResponse.json(result)
    }

    if (body.action === 'decide') {
      if (!body.decision) {
        return NextResponse.json({ error: 'decision required' }, { status: 400 })
      }
      const result = await decideProposal({
        proposalId: body.proposalId,
        decision: body.decision,
        session,
        note: body.note,
      })
      if (result.error) return NextResponse.json(result, { status: 400 })
      return NextResponse.json(result)
    }

    if (body.action === 'apply') {
      const result = await applyApprovedProposal(body.proposalId, session)
      if (result.error) return NextResponse.json(result, { status: 400 })
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return authErrorResponse(error)
  }
}
