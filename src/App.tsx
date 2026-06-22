import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import ChatApp from './pages/Chatbot'

import AdminGate from './components/admin/AdminGate'
import AdminLayout from './pages/Admin/AdminLayout'
import PipelineConsole from './pages/Admin/PipelineConsole'
import JobsHistory from './pages/Admin/JobsHistory'
import JobDetail from './pages/Admin/JobDetail'
import DBStatusPage from './pages/Admin/DBStatus'
import AnalyticsPage from './pages/Admin/Analytics'
import QCReportPage from './pages/Admin/QCReport'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<ChatApp />} />
      <Route
        path="/admin"
        element={
          <AdminGate>
            <AdminLayout />
          </AdminGate>
        }
      >
        <Route index element={<Navigate to="/admin/pipeline" replace />} />
        <Route path="pipeline" element={<PipelineConsole />} />
        <Route path="jobs" element={<JobsHistory />} />
        <Route path="jobs/:jobId" element={<JobDetail />} />
        <Route path="qc" element={<QCReportPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="db" element={<DBStatusPage />} />
      </Route>
      {/* 와일드카드는 항상 맨 마지막 — 위 라우트가 정상 매칭되도록 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
