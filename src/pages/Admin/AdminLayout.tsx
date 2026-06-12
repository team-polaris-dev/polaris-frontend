import { NavLink, Outlet } from 'react-router-dom'
import { Activity, BarChart3, Database, History, Workflow, LogOut } from 'lucide-react'
import { clearAdminToken } from '../../lib/api/admin'

const NAV = [
  { to: '/admin/pipeline',  label: '파이프라인', icon: Workflow },
  { to: '/admin/jobs',      label: '잡 목록',    icon: History },
  { to: '/admin/analytics', label: '챗봇 통계',  icon: BarChart3 },
  { to: '/admin/db',        label: 'DB 상태',    icon: Database },
]

export default function AdminLayout() {
  function logout() {
    clearAdminToken()
    window.location.href = '/admin'
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <aside className="w-60 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-6">
          <Activity className="w-5 h-5 text-blue-600" />
          <div className="text-sm font-semibold">POLARIS 관리자</div>
        </div>
        <nav className="space-y-1 flex-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm ' +
                (isActive
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300')
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <LogOut className="w-4 h-4" /> 로그아웃
        </button>
      </aside>
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
