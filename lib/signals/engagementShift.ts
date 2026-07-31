/**
 * Post-manager-change engagement shift — observation-based (quarterly), never day-based.
 *
 * engagement_score_history carries quarterly observation dates. Signal logic compares
 * the last pre-change observation to the first (and second, when available) post-change
 * observations. Insufficient observations → no signal.
 */

import { getServiceSupabase, hasDatabaseConfig } from '@/lib/db/client'
import { MIN_CELL_SIZE } from '@/lib/types'

/** Absolute score change that fires the signal (0–10 instrument). */
export const ENGAGEMENT_SHIFT_THRESHOLD = 1.0

export const SIGNALS_RESPONSIBLE_USE =
  'These indicators are directional, not predictive of any individual\'s decision. They are derived from patterns in historical data and should inform conversations, never employment decisions on their own.'

export type EngagementShiftSignal = {
  id: string
  measure: string
  employeeId: string
  managerChangeDate: string
  preObservationDate: string
  preValue: number
  firstPostObservationDate: string
  firstPostValue: number
  firstDelta: number
  secondPostObservationDate: string | null
  secondPostValue: number | null
  secondDelta: number | null
  sustained: boolean | null
  threshold: number
  observationCountPre: number
  observationCountPost: number
  summary: string
  illustrative?: boolean
}

export type EngagementShiftResponse = {
  signals: EngagementShiftSignal[]
  threshold: number
  responsibleUseNotice: string
  source: 'database' | 'illustrative'
  note: string
}

type ObsRow = {
  employee_id: string
  observation_date: string
  engagement_score: number | string | null
}

type EventRow = {
  event_id: string
  employee_id: string
  event_date: string
  event_type: string | null
}

function toNum(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function buildSummary(input: {
  firstDelta: number
  preDate: string
  firstPostDate: string
  firstPostValue: number
  preValue: number
  secondDelta: number | null
  secondPostDate: string | null
  sustained: boolean | null
  threshold: number
}): string {
  const direction = input.firstDelta < 0 ? 'declined' : 'increased'
  const mag = Math.abs(input.firstDelta).toFixed(1)
  let text =
    `Individual engagement ${direction} ${mag} points between the last pre-change ` +
    `observation on ${fmtDate(input.preDate)} (${input.preValue.toFixed(1)}) and the first ` +
    `post-change observation on ${fmtDate(input.firstPostDate)} (${input.firstPostValue.toFixed(1)}). ` +
    `Threshold: ${input.threshold.toFixed(1)}.`

  if (input.secondPostDate != null && input.secondDelta != null) {
    const remain =
      Math.sign(input.secondDelta) === Math.sign(input.firstDelta) &&
      Math.abs(input.secondDelta) >= input.threshold
    if (remain) {
      text +=
        ` The shift remained ${Math.abs(input.secondDelta).toFixed(1)} points from baseline ` +
        `at the next observation on ${fmtDate(input.secondPostDate)}.`
    } else {
      text +=
        ` At the next observation on ${fmtDate(input.secondPostDate)}, the difference from ` +
        `baseline was ${input.secondDelta.toFixed(1)} points.`
    }
  }

  text +=
    ' This is an invitation to investigate — not a conclusion about the manager or employee.'
  return text
}

/**
 * Evaluate one manager_change event against that employee's engagement observations.
 * Returns null when observations are insufficient or the threshold is not crossed.
 */
export function evaluateManagerChangeShift(
  event: { eventId: string; employeeId: string; eventDate: string },
  observations: { observationDate: string; score: number }[],
  threshold = ENGAGEMENT_SHIFT_THRESHOLD,
): EngagementShiftSignal | null {
  const sorted = [...observations].sort((a, b) =>
    a.observationDate.localeCompare(b.observationDate),
  )
  const pre = sorted.filter((o) => o.observationDate < event.eventDate)
  const post = sorted.filter((o) => o.observationDate > event.eventDate)

  // Sufficiency: at least one valid observation on each side of the change.
  if (pre.length < 1 || post.length < 1) return null

  const lastPre = pre[pre.length - 1]!
  const firstPost = post[0]!
  const secondPost = post[1] ?? null

  const firstDelta = firstPost.score - lastPre.score
  if (Math.abs(firstDelta) < threshold) return null

  const secondDelta =
    secondPost != null ? secondPost.score - lastPre.score : null
  const sustained =
    secondDelta == null
      ? null
      : Math.sign(secondDelta) === Math.sign(firstDelta) &&
        Math.abs(secondDelta) >= threshold

  return {
    id: `eng-shift-${event.eventId}`,
    measure: 'post_manager_change_engagement_shift',
    employeeId: event.employeeId,
    managerChangeDate: event.eventDate,
    preObservationDate: lastPre.observationDate,
    preValue: lastPre.score,
    firstPostObservationDate: firstPost.observationDate,
    firstPostValue: firstPost.score,
    firstDelta,
    secondPostObservationDate: secondPost?.observationDate ?? null,
    secondPostValue: secondPost?.score ?? null,
    secondDelta,
    sustained,
    threshold,
    observationCountPre: pre.length,
    observationCountPost: post.length,
    summary: buildSummary({
      firstDelta,
      preDate: lastPre.observationDate,
      firstPostDate: firstPost.observationDate,
      firstPostValue: firstPost.score,
      preValue: lastPre.score,
      secondDelta,
      secondPostDate: secondPost?.observationDate ?? null,
      sustained,
      threshold,
    }),
  }
}

function illustrativeSignals(): EngagementShiftSignal[] {
  const sample = evaluateManagerChangeShift(
    {
      eventId: 'demo-mgr-change-1',
      employeeId: 'E1042',
      eventDate: '2025-02-15',
    },
    [
      { observationDate: '2024-10-31', score: 7.8 },
      { observationDate: '2025-01-31', score: 7.6 },
      { observationDate: '2025-04-30', score: 6.2 },
      { observationDate: '2025-07-31', score: 6.4 },
    ],
  )
  if (!sample) return []
  return [
    {
      ...sample,
      illustrative: true,
      summary:
        '[Illustrative demo signal — not from live data] ' + sample.summary,
    },
  ]
}

export async function getEngagementShiftSignals(): Promise<EngagementShiftResponse> {
  const baseNote =
    'Signal logic is observation-based (quarterly engagement_score_history), never day-based. ' +
    'Manager-change events come from org_events. Minimum observation sufficiency applies.'

  if (!hasDatabaseConfig()) {
    return {
      signals: illustrativeSignals(),
      threshold: ENGAGEMENT_SHIFT_THRESHOLD,
      responsibleUseNotice: SIGNALS_RESPONSIBLE_USE,
      source: 'illustrative',
      note:
        baseNote +
        ' Database is not configured — showing a clearly labelled illustrative example.',
    }
  }

  const supabase = getServiceSupabase()

  const { data: events, error: evErr } = await supabase
    .from('org_events')
    .select('event_id, employee_id, event_date, event_type')
    .ilike('event_type', '%manager_change%')
    .order('event_date', { ascending: false })
    .limit(400)

  if (evErr) {
    console.error('getEngagementShiftSignals events', evErr.message)
  }

  const eventRows = (events ?? []) as EventRow[]
  if (eventRows.length === 0) {
    // Fallback event_type variants
    const { data: alt } = await supabase
      .from('org_events')
      .select('event_id, employee_id, event_date, event_type')
      .or('event_type.ilike.%manager%,event_type.eq.manager_change')
      .order('event_date', { ascending: false })
      .limit(400)
    if (alt?.length) eventRows.push(...(alt as EventRow[]))
  }

  const employeeIds = [...new Set(eventRows.map((e) => e.employee_id).filter(Boolean))]
  if (employeeIds.length === 0) {
    return {
      signals: illustrativeSignals(),
      threshold: ENGAGEMENT_SHIFT_THRESHOLD,
      responsibleUseNotice: SIGNALS_RESPONSIBLE_USE,
      source: 'illustrative',
      note:
        baseNote +
        ' No manager_change rows found in org_events — showing a labelled illustrative example.',
    }
  }

  const { data: obs, error: obsErr } = await supabase
    .from('engagement_score_history')
    .select('employee_id, observation_date, engagement_score')
    .in('employee_id', employeeIds.slice(0, 500))
    .order('observation_date', { ascending: true })
    .limit(8000)

  if (obsErr) {
    console.error('getEngagementShiftSignals obs', obsErr.message)
    return {
      signals: illustrativeSignals(),
      threshold: ENGAGEMENT_SHIFT_THRESHOLD,
      responsibleUseNotice: SIGNALS_RESPONSIBLE_USE,
      source: 'illustrative',
      note:
        baseNote +
        ' Could not read engagement_score_history — showing a labelled illustrative example.',
    }
  }

  const byEmployee = new Map<string, { observationDate: string; score: number }[]>()
  for (const row of (obs ?? []) as ObsRow[]) {
    const score = toNum(row.engagement_score)
    if (score == null || !row.observation_date) continue
    const list = byEmployee.get(row.employee_id) ?? []
    list.push({
      observationDate: String(row.observation_date).slice(0, 10),
      score,
    })
    byEmployee.set(row.employee_id, list)
  }

  const signals: EngagementShiftSignal[] = []
  const seenEmployees = new Set<string>()

  for (const ev of eventRows) {
    if (!ev.employee_id || !ev.event_date) continue
    // Prefer the most recent change per employee for the demo list.
    if (seenEmployees.has(ev.employee_id)) continue
    const observations = byEmployee.get(ev.employee_id) ?? []
    const signal = evaluateManagerChangeShift(
      {
        eventId: ev.event_id,
        employeeId: ev.employee_id,
        eventDate: String(ev.event_date).slice(0, 10),
      },
      observations,
    )
    if (!signal) continue
    seenEmployees.add(ev.employee_id)
    signals.push(signal)
    if (signals.length >= 40) break
  }

  // Aggregate display still respects cell-size mindset for team views; individual
  // admin/exec signals are listed as-is. Empty live set falls back to illustrative.
  if (signals.length === 0) {
    return {
      signals: illustrativeSignals(),
      threshold: ENGAGEMENT_SHIFT_THRESHOLD,
      responsibleUseNotice: SIGNALS_RESPONSIBLE_USE,
      source: 'illustrative',
      note:
        baseNote +
        ` No shifts crossed the ${ENGAGEMENT_SHIFT_THRESHOLD} threshold with sufficient observations ` +
        `(min cell size for team aggregates remains ${MIN_CELL_SIZE}). Showing a labelled illustrative example.`,
    }
  }

  return {
    signals,
    threshold: ENGAGEMENT_SHIFT_THRESHOLD,
    responsibleUseNotice: SIGNALS_RESPONSIBLE_USE,
    source: 'database',
    note: baseNote,
  }
}
