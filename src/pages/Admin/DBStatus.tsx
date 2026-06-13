import { Database, FileText, Network, Plug, RefreshCw } from 'lucide-react'
import DBStatusCard from '../../components/admin/DBStatusCard'
import { useConnections, useDBStatus } from '../../lib/hooks/useJob'

function ConnectionsPanel() {
  const { data, isLoading, isFetching, error, refetch } = useConnections()

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Plug className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">연결 상태</div>
          <span className="text-xs text-slate-500">
            주소는 백엔드 .env 에서 읽음 (변경은 .env 수정 후 재시작)
          </span>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          <RefreshCw className={'w-3.5 h-3.5' + (isFetching ? ' animate-spin' : '')} />
          다시 점검
        </button>
      </div>
      {isLoading && <div className="text-xs text-slate-400">연결 점검 중…</div>}
      {error != null && (
        <div className="text-xs text-rose-500">
          점검 실패: {(error as Error)?.message ?? 'unknown'}
        </div>
      )}
      {data && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {data.services.map((s) => (
            <li key={s.name} className="flex items-center gap-3 py-2.5 text-xs">
              <span
                className={
                  'w-2 h-2 rounded-full shrink-0 ' + (s.ok ? 'bg-emerald-500' : 'bg-rose-500')
                }
              />
              <span className="w-40 shrink-0 font-medium text-slate-700 dark:text-slate-200">
                {s.name}
              </span>
              <span className="w-56 shrink-0 font-mono text-slate-500 truncate" title={s.address}>
                {s.address}
              </span>
              <span
                className={
                  'flex-1 truncate ' +
                  (s.ok ? 'text-slate-500' : 'text-rose-500')
                }
                title={s.detail}
              >
                {s.detail}
              </span>
              <span className="shrink-0 text-slate-400 tabular-nums">{s.latency_ms}ms</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function DBStatusPage() {
  const { data, isLoading, error } = useDBStatus()

  if (isLoading) return <div className="p-6 text-slate-400">DB 상태 측정 중…</div>
  if (error || !data) return <div className="p-6 text-rose-500">측정 실패: {(error as Error)?.message ?? 'unknown'}</div>

  const mariadbRows = Object.entries(data.mariadb).map(([k, v]) => ({ label: k, value: v }))
  const qdrantRows = Object.entries(data.qdrant).flatMap(([coll, info]) => [
    { label: `${coll} · points`, value: info.points_count },
    { label: `${coll} · vectors`, value: info.vectors_count },
  ])
  const neo4jRows = [
    ...Object.entries(data.neo4j.nodes ?? {}).map(([k, v]) => ({ label: `(:${k})`, value: v })),
    ...Object.entries(data.neo4j.rels ?? {}).map(([k, v]) => ({ label: `[:${k}]`, value: v })),
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-baseline gap-3 mb-6">
        <h1 className="text-xl font-semibold">DB 상태</h1>
        <span className="text-xs text-slate-500">
          측정 시각 {new Date(data.measured_at).toLocaleTimeString('ko-KR')}
        </span>
      </div>
      <ConnectionsPanel />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <DBStatusCard
          title="MariaDB"
          icon={<FileText className="w-5 h-5" />}
          rows={mariadbRows}
        />
        <DBStatusCard
          title="Qdrant"
          icon={<Database className="w-5 h-5" />}
          rows={qdrantRows}
        />
        <DBStatusCard
          title="Neo4j"
          icon={<Network className="w-5 h-5" />}
          rows={neo4jRows}
        />
      </div>
    </div>
  )
}
