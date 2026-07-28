import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { FilterBar } from '@/components/shell/FilterBar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="app-shell">
      <Sidebar />
      <Topbar />
      <main className="main">
        <FilterBar />
        {children}
      </main>
    </div>
  )
}
