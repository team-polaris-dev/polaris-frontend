import { Database, FileText, Network } from 'lucide-react'
import DBStatusCard from '../../components/admin/DBStatusCard'
import { useDBStatus } from '../../lib/hooks/useJob'

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
