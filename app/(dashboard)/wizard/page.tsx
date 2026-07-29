'use client'

import { useState } from 'react'
import { MetricChart } from '@/components/charts/MetricChart'
import { useFiltersOptional } from '@/components/shell/FilterProvider'
import { EMPTY_FILTER_CONTEXT, type WizardResponse } from '@/lib/types'

export default function WizardPage() {
  const filters = useFiltersOptional()?.filters ?? EMPTY_FILTER_CONTEXT
  const [question, setQuestion] = useState(
    'What is active headcount and voluntary attrition?',
  )
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WizardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function ask() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, filters }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Wizard failed')
      setResult(data as WizardResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wizard failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wizard-page">
      <header className="methodology-header">
        <h2 className="card-title">Wizard</h2>
        <p className="card-subtitle">
          Conversational analyst over the Meridian semantic layer. Inherits the
          active global filter context. Charts render through the shared library
          (WIZ-5).
        </p>
      </header>

      <div className="wizard-form">
        <label className="wizard-label" htmlFor="wizard-q">
          Ask a question
        </label>
        <textarea
          id="wizard-q"
          className="wizard-input"
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="button" className="wizard-ask" onClick={() => void ask()} disabled={loading}>
          {loading ? 'Thinking…' : 'Ask'}
        </button>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="wizard-answer card">
          {result.refused ? (
            <p className="card-subtitle">{result.answer}</p>
          ) : (
            <>
              <p>{result.answer}</p>
              {result.filterOverridden ? (
                <p className="admin-meta">Filters were overridden for this answer.</p>
              ) : (
                <p className="admin-meta">Answer uses the current global filters.</p>
              )}
              {result.citations?.length ? (
                <ul className="wizard-citations">
                  {result.citations.map((c, i) => (
                    <li key={i}>
                      {c.measureId}
                      {c.tables?.length ? ` · ${c.tables.join(', ')}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.chart ? (
                <MetricChart
                  chart={{
                    id: 'wizard-chart',
                    title: result.chart.title,
                    form: result.chart.form,
                    dimension: result.chart.dimension,
                    measure: result.chart.measure,
                    points: result.chart.points ?? [],
                    seriesKeys: result.chart.seriesKeys,
                    referenceLines: result.chart.referenceLines,
                    summary: result.chart.summary || result.answer,
                    methodologyId: result.chart.methodologyId,
                    emptyReason: result.chart.points?.length
                      ? null
                      : 'Wizard returned a chart spec without series points.',
                  }}
                />
              ) : null}
            </>
          )}
        </section>
      )}
    </div>
  )
}
