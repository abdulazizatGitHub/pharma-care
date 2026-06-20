import { PageHeader }           from '@/components/ui/PageHeader'
import { ReturnApprovalQueue } from '@/components/returns/ReturnApprovalQueue'
import { getPendingReturns, getReturnHistory } from '@/app/actions/returns'

export default async function ReturnsPage() {
  const [pendingResult, historyResult] = await Promise.all([
    getPendingReturns(),
    getReturnHistory({ pageSize: 20 }),
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Returns & Exchanges"
        description="Review pending return requests and view full return history."
      />
      <ReturnApprovalQueue
        initialPending={pendingResult.data  ?? []}
        initialHistory={historyResult.data  ?? { items: [], total: 0 }}
      />
    </div>
  )
}
