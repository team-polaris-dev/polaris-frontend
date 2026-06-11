import { Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import ChatApp from './pages/Chatbot'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      <Route path="/app" element={<ChatApp />} />

    </Routes>
  )
}
