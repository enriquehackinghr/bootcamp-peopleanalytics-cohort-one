'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/** Fires a page_access audit event on every client-side route change. */
export function AuditPageTracker() {
  const pathname = usePathname()
  const last = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || pathname === last.current) return
    if (pathname === '/login') return
    last.current = pathname

    void fetch('/api/audit/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'page_access',
        route: pathname,
        targetType: 'page',
        targetId: pathname,
      }),
      keepalive: true,
    }).catch(() => undefined)
  }, [pathname])

  return null
}
