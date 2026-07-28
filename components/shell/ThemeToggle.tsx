'use client'

import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem('meridian-theme') as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = getInitialTheme()
    setTheme(t)
    document.documentElement.setAttribute('data-theme', t)
    setMounted(true)
  }, [])

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    window.localStorage.setItem('meridian-theme', next)
  }

  return (
    <button
      type="button"
      className="topbar-chip"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title="Toggle theme"
    >
      <span aria-hidden="true">{mounted ? (theme === 'light' ? '☾' : '☀') : '·'}</span>
      <span>{mounted ? (theme === 'light' ? 'Dark' : 'Light') : 'Theme'}</span>
    </button>
  )
}
