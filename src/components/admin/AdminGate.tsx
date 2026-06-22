import { useEffect, useState } from 'react'
import { adminApi, clearAdminToken, getAdminToken, setAdminToken } from '../../lib/api/admin'

type Props = { children: React.ReactNode }

export default function AdminGate({ children }: Props) {
  const [ok, setOk] = useState<boolean>(!!getAdminToken())
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!getAdminToken()) {
      setOk(false)
      return
    }
    let cancelled = false
    adminApi
      .health()
      .then(() => !cancelled && setOk(true))
      .catch(() => {
        clearAdminToken()
        if (!cancelled) setOk(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (ok) return <>{children}</>

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    setAdminToken(token)
    try {
      await adminApi.health()
      setOk(true)
    } catch {
      clearAdminToken()
      setError('토큰이 유효하지 않습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow p-8 space-y-4 border border-slate-200 dark:border-slate-800"
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            POLARIS 관리자
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            ADMIN_TOKEN 을 입력하세요.
          </p>
        </div>
        <input
          type="password"
          autoComplete="off"
          aria-label="관리자 토큰"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="토큰"
        />
        {error && <p className="text-sm text-rose-500">{error}</p>}
        <button
          type="submit"
          disabled={busy || !token}
          className="w-full py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '확인 중…' : '들어가기'}
        </button>
      </form>
    </div>
  )
}
