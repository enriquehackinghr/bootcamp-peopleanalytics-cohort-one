'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MetricChart } from '@/components/charts/MetricChart'
import { useFiltersOptional } from '@/components/shell/FilterProvider'
import {
  EMPTY_FILTER_CONTEXT,
  type DashboardContext,
  type WizardAction,
  type WizardConversationTurn,
  type WizardResponse,
} from '@/lib/types'

function pageLabel(pathname: string): string {
  if (pathname.startsWith('/advanced-analytics')) return 'advanced_analytics'
  if (pathname.startsWith('/managers')) return 'manager'
  if (pathname.startsWith('/employees')) return 'employee'
  if (pathname.startsWith('/customized-reports')) return 'customized_reports'
  const seg = pathname.split('/').filter(Boolean)[0] ?? 'overview'
  return seg
}

export function FloatingWizard() {
  const pathname = usePathname() ?? '/overview'
  const router = useRouter()
  const searchParams = useSearchParams()
  const filtersApi = useFiltersOptional()
  const filters = filtersApi?.filters ?? EMPTY_FILTER_CONTEXT

  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversation, setConversation] = useState<WizardConversationTurn[]>([])
  const [last, setLast] = useState<WizardResponse | null>(null)
  const [pendingAction, setPendingAction] = useState<WizardAction | null>(null)

  useEffect(() => {
    if (searchParams.get('wizard') === '1') setOpen(true)
  }, [searchParams])

  const context: DashboardContext = useMemo(
    () => ({
      current_route: pathname,
      current_page: pageLabel(pathname),
      active_filters: filters,
      period: filters.period,
      comparison_mode: filters.comparison,
      drill_path: filters.drill?.path ?? null,
      selected_entity: null,
      selected_visual_id: null,
      selected_mark: null,
      visible_measures: [],
      scoped_manager_id: pathname.startsWith('/managers/')
        ? pathname.split('/')[2] ?? null
        : null,
      scoped_function: filters.functions[0] ?? null,
      scoped_location: filters.locations[0] ?? null,
      scoped_employee_id: pathname.startsWith('/employees/')
        ? pathname.split('/')[2] ?? null
        : null,
      scoped_requisition_id: null,
      methodology_version: 'risk-v0.2',
      data_load_id: null,
    }),
    [pathname, filters],
  )

  const ask = useCallback(async () => {
    const q = question.trim()
    if (!q || loading) return
    setLoading(true)
    setConversation((prev) => [...prev, { role: 'user', content: q }])
    setQuestion('')
    try {
      const res = await fetch('/api/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          filters,
          context,
          conversation,
        }),
      })
      const data = (await res.json()) as WizardResponse
      setLast(data)
      setConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          chart: data.chart,
          measures: data.citations.map((c) => c.measureId),
        },
      ])
      if (data.proposedActions?.length) {
        setPendingAction(data.proposedActions[0] ?? null)
      }
    } catch (err) {
      setConversation((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Wizard request failed',
        },
      ])
    } finally {
      setLoading(false)
    }
  }, [question, loading, filters, context, conversation])

  async function confirmAction(action: WizardAction) {
    if (action.type.startsWith('open_')) {
      const href = String(action.payload.href ?? '/')
      router.push(href)
      setPendingAction(null)
      return
    }
    if (action.type === 'clear_filters') {
      filtersApi?.clearFilters()
      setPendingAction(null)
      return
    }
    if (action.type === 'apply_filters' && action.payload.filters) {
      // FilterProvider applies via URL; navigate with query if provided
      setPendingAction(null)
      return
    }
    if (
      action.type === 'create_customized_report' ||
      action.type === 'update_customized_report'
    ) {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action.type,
          spec: action.payload.spec ?? last?.reportSpec,
          confirm: true,
        }),
      })
      const body = (await res.json()) as { id?: string; error?: string }
      if (body.id) {
        setConversation((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Customized report saved. Open /customized-reports/${body.id}`,
          },
        ])
        router.push(`/customized-reports/${body.id}`)
      } else {
        setConversation((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: body.error || 'Could not save report',
          },
        ])
      }
      setPendingAction(null)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="wizard-fab"
        aria-label="Open analytics wizard"
        onClick={() => setOpen(true)}
      >
        Wizard
      </button>
    )
  }

  return (
    <div
      className={`wizard-panel ${expanded ? 'wizard-panel--expanded' : ''}`}
      role="dialog"
      aria-label="Analytics wizard"
    >
      <header className="wizard-panel-header">
        <strong>Analyst Wizard</strong>
        <div className="wizard-panel-actions">
          <button type="button" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close wizard">
            Close
          </button>
        </div>
      </header>
      <p className="wizard-context">
        Context: {context.current_page}
        {filters.functions.length ? ` · ${filters.functions.join(', ')}` : ''}
      </p>
      <div className="wizard-messages">
        {conversation.map((turn, i) => (
          <div key={i} className={`wizard-msg wizard-msg--${turn.role}`}>
            <p>{turn.content}</p>
            {turn.chart?.points?.length ? (
              <MetricChart
                chart={{
                  id: `wiz-${i}`,
                  title: turn.chart.title,
                  form: turn.chart.form,
                  dimension: turn.chart.dimension,
                  measure: turn.chart.measure,
                  points: turn.chart.points,
                  seriesKeys: turn.chart.seriesKeys,
                  referenceLines: turn.chart.referenceLines,
                  summary: turn.chart.summary ?? '',
                  methodologyId: turn.chart.methodologyId,
                }}
              />
            ) : null}
          </div>
        ))}
        {loading ? <p className="wizard-msg">Thinking…</p> : null}
      </div>
      {last?.filterOverridden ? (
        <p className="aa-caveat">Note: dashboard filters were overridden for this answer.</p>
      ) : null}
      {last?.citations?.length ? (
        <p className="wizard-citations">
          Citations: {last.citations.map((c) => c.measureId).join(', ')} · methodology
          risk-v0.2
        </p>
      ) : null}
      {pendingAction ? (
        <div className="wizard-confirm">
          <p>Proposed: {pendingAction.label}</p>
          {pendingAction.requiresConfirmation ? (
            <div className="wizard-confirm-actions">
              <button type="button" onClick={() => void confirmAction(pendingAction)}>
                Confirm
              </button>
              <button type="button" onClick={() => setPendingAction(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => void confirmAction(pendingAction)}>
              Go
            </button>
          )}
        </div>
      ) : null}
      <form
        className="wizard-input-row"
        onSubmit={(e) => {
          e.preventDefault()
          void ask()
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about cohorts, attrition, managers…"
          aria-label="Wizard question"
        />
        <button type="submit" disabled={loading}>
          Ask
        </button>
      </form>
    </div>
  )
}
