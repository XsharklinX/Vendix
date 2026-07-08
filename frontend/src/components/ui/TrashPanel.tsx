import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, getErrorMessage } from '@/lib/api'
import { EmptyState } from '@/components/ui/EmptyState'
import { QueryError } from '@/components/ui/QueryError'
import { ListRowSkeleton } from '@/components/ui/Skeleton'

interface TrashItem {
  id: string
  name: string
  deletedAt?: string | null
  phone?: string | null
  email?: string | null
  role?: string | null
  barcode?: string | null
}

interface TrashPanelProps {
  businessId: string
  queryKey: string
  endpoint: string
  label: string
}

export function TrashPanel({ businessId, queryKey, endpoint, label }: TrashPanelProps) {
  const qc = useQueryClient()
  const listKey = [queryKey, businessId]
  const trashKey = [...listKey, 'trash']

  const { data: items = [], isLoading, isError, refetch } = useQuery<TrashItem[]>({
    queryKey: trashKey,
    queryFn: () => api.get(`/businesses/${businessId}/${endpoint}`, { params: { deleted: 'only' } }).then(r => r.data.data ?? r.data),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/businesses/${businessId}/${endpoint}/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: listKey })
      qc.invalidateQueries({ queryKey: trashKey })
      toast.success(`${label} restaurado`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
        <h3 className="font-bold text-gray-900 dark:text-slate-100">Papelera</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400">Restaura registros eliminados por error. No se muestran en la operación diaria hasta restaurarlos.</p>
      </div>
      {isLoading ? (
        <ListRowSkeleton rows={4} />
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Trash2} title="La papelera está vacía" description={`No hay ${label.toLowerCase()}s eliminados.`} />
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-slate-800">
          {items.map(item => (
            <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-gray-900 dark:text-slate-100">{item.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  {[item.role, item.phone, item.email, item.barcode, item.deletedAt ? `Eliminado: ${new Date(item.deletedAt).toLocaleDateString('es-DO')}` : null].filter(Boolean).join(' · ') || 'Sin detalles adicionales'}
                </p>
              </div>
              <button
                onClick={() => restoreMutation.mutate(item.id)}
                disabled={restoreMutation.isPending}
                className="btn-secondary w-full justify-center sm:w-auto"
              >
                <RotateCcw size={15} /> Restaurar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
