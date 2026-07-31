'use client'

import { FormEvent, useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { isStudentShowcase } from '@/lib/features'

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const showcase = isStudentShowcase()

  useEffect(() => {
    if (!showcase) return
    const next = search.get('next') || '/overview'
    window.location.replace(`/api/auth/guest?next=${encodeURIComponent(next)}`)
  }, [showcase, search])

  if (showcase) {
    return (
      <main className="login-page">
        <p className="admin-meta">Opening student showcase…</p>
      </main>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(body.error || 'That email is not authorized for this dashboard.')
        return
      }
      const next = search.get('next') || '/overview'
      router.replace(next)
      router.refresh()
    } catch {
      setError('Sign-in failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={onSubmit}>
        <p className="eyebrow">Meridian People Analytics</p>
        <h1 className="page-title">Sign in</h1>
        <p className="lede">
          Enter your Meridian work email. No password — email-only authentication for this
          synthetic bootcamp environment.
        </p>
        <label className="login-label" htmlFor="email">
          Work email
        </label>
        <input
          id="email"
          className="login-input"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="first.last@meridian.example"
        />
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login-page"><p>Loading…</p></main>}>
      <LoginForm />
    </Suspense>
  )
}
