'use client'

import { Suspense, type ReactNode } from 'react'
import { MetricsCacheProvider } from '@/components/shell/MetricsCacheProvider'
import { FilterProvider } from '@/components/shell/FilterProvider'
import { SessionProvider } from '@/components/shell/SessionProvider'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { FilterBar } from '@/components/shell/FilterBar'
import { FloatingWizard } from '@/components/shell/FloatingWizard'
import { AuditPageTracker } from '@/components/shell/AuditPageTracker'
import { isWizardEnabled } from '@/lib/features'

function ShellChrome({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AuditPageTracker />
      <Sidebar />
      <Topbar />
      <main className="main">
        <FilterBar />
        {children}
      </main>
      {isWizardEnabled() ? (
        <Suspense fallback={<aside className="wizard-rail" aria-hidden="true" />}>
          <FloatingWizard />
        </Suspense>
      ) : null}
    </div>
  )
}

function ShellWithFilters({ children }: { children: ReactNode }) {
  return (
    <FilterProvider>
      <ShellChrome>{children}</ShellChrome>
    </FilterProvider>
  )
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <MetricsCacheProvider>
        <Suspense
          fallback={
            <div className="app-shell">
              <Sidebar />
              <main className="main">
                <p className="admin-meta">Loading filters…</p>
                {children}
              </main>
            </div>
          }
        >
          <ShellWithFilters>{children}</ShellWithFilters>
        </Suspense>
      </MetricsCacheProvider>
    </SessionProvider>
  )
}
