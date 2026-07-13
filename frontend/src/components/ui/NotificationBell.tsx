import { useEffect, useRef, useState } from 'react'
import { Bell, X, CheckCheck, Package, DollarSign, AlertTriangle, Info } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Link } from 'react-router-dom'
import { playSound } from '@/lib/sound'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  link?: string
  createdAt: string
}

const typeIcon = (type: string) => {
  switch (type) {
    case 'LOW_STOCK': return <Package size={14} className="text-orange-500 dark:text-orange-400" />
    case 'PENDING_DEBT': return <DollarSign size={14} className="text-yellow-600 dark:text-yellow-400" />
    case 'CASH_SESSION': return <AlertTriangle size={14} className="text-blue-500 dark:text-blue-400" />
    default: return <Info size={14} className="text-gray-400 dark:text-slate-500" />
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 60_000,
  })

  const unread = notifications.filter(n => !n.read).length

  // Suena solo cuando aparecen notificaciones nuevas (no en el primer fetch)
  const prevUnread = useRef<number | null>(null)
  useEffect(() => {
    if (prevUnread.current !== null && unread > prevUnread.current) playSound('notify')
    prevUnread.current = unread
  }, [unread])

  const markOne = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell size={20} className="text-gray-600 dark:text-slate-300" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notificaciones" className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700">
            <h3 className="font-semibold text-gray-900 dark:text-slate-100 text-sm">Notificaciones</h3>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                  title="Marcar todas como leídas"
                  aria-label="Marcar todas como leídas"
                >
                  <CheckCheck size={15} />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500" aria-label="Cerrar notificaciones">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-slate-800">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-gray-400 dark:text-slate-500 text-sm">Sin notificaciones</div>
            ) : notifications.map(n => {
              const inner = (
                <div
                  key={n.id}
                  className={`flex gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors ${!n.read ? 'bg-blue-50/40' : ''}`}
                  onClick={() => { if (!n.read) markOne.mutate(n.id); setOpen(false) }}
                >
                  <div className="mt-0.5 flex-shrink-0">{typeIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!n.read ? 'font-semibold text-gray-900 dark:text-slate-100' : 'text-gray-700 dark:text-slate-300'}`}>{n.title}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0 mt-0.5">{timeAgo(n.createdAt)}</span>
                </div>
              )
              return n.link ? <Link to={n.link} key={n.id}>{inner}</Link> : <div key={n.id}>{inner}</div>
            })}
          </div>
        </div>
      )}
    </div>
  )
}
