'use client'

import { Suspense, type ReactNode } from 'react'
import { MetricsCacheProvider } from '@/components/shell/MetricsCacheProvider'
import { FilterProvider } from '@/components/shell/FilterProvider'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { FilterBar } from '@/components/shell/FilterBar'
import { FloatingWizard } from '@/components/shell/FloatingWizard'

function ShellChrome({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <Topbar />
      <main className="main">
        <FilterBar />
        {children}
      </main>
      <Suspense fallback={<aside className="wizard-rail" aria-hidden="true" />}>
        <FloatingWizard />
      </Suspense>
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
  )
}
