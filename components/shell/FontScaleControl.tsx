'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'meridian-text-scale'
const MIN = 0.9
const MAX = 1.3
const STEP = 0.1

function clamp(n: number) {
  return Math.min(MAX, Math.max(MIN, Math.round(n * 10) / 10))
}

function readStoredScale(): number {
  if (typeof window === 'undefined') return 1
  const raw = window.localStorage.getItem(STORAGE_KEY)
  const n = raw ? Number(raw) : 1
  return Number.isFinite(n) ? clamp(n) : 1
}

function applyScale(scale: number) {
  document.documentElement.style.setProperty('--text-scale', String(scale))
  document.documentElement.setAttribute('data-text-scale', String(scale))
}

export function FontScaleControl() {
  const [scale, setScale] = useState(1)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const next = readStoredScale()
    setScale(next)
    applyScale(next)
    setMounted(true)
  }, [])

  function setAndPersist(next: number) {
    const value = clamp(next)
    setScale(value)
    applyScale(value)
    window.localStorage.setItem(STORAGE_KEY, String(value))
  }

  const pct = Math.round(scale * 100)

  return (
    <div className="font-scale" role="group" aria-label="Text size">
      <button
        type="button"
        className="font-scale-btn"
        onClick={() => setAndPersist(scale - STEP)}
        disabled={!mounted || scale <= MIN}
        aria-label="Decrease text size"
        title="Decrease text size"
      >
        A−
      </button>
      <span className="font-scale-value" aria-live="polite">
        {mounted ? `${pct}%` : '100%'}
      </span>
      <button
        type="button"
        className="font-scale-btn"
        onClick={() => setAndPersist(scale + STEP)}
        disabled={!mounted || scale >= MAX}
        aria-label="Increase text size"
        title="Increase text size"
      >
        A+
      </button>
    </div>
  )
}
