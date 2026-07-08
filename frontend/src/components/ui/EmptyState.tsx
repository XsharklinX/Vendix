import { LucideIcon } from 'lucide-react'
import { ReactNode } from 'react'

type EmptyStateTone = 'blue' | 'green' | 'amber' | 'rose' | 'teal' | 'gray'

const TONE_STYLES: Record<EmptyStateTone, { circle: string; icon: string; accent: string }> = {
  blue: { circle: 'text-blue-50 dark:text-blue-950/40', icon: 'text-blue-400 dark:text-blue-300', accent: '#3b82f6' },
  green: { circle: 'text-green-50 dark:text-green-950/40', icon: 'text-green-400 dark:text-green-300', accent: '#22c55e' },
  amber: { circle: 'text-amber-50 dark:text-amber-950/40', icon: 'text-amber-400 dark:text-amber-300', accent: '#f59e0b' },
  rose: { circle: 'text-rose-50 dark:text-rose-950/40', icon: 'text-rose-400 dark:text-rose-300', accent: '#f43f5e' },
  teal: { circle: 'text-teal-50 dark:text-teal-950/40', icon: 'text-teal-400 dark:text-teal-300', accent: '#14b8a6' },
  gray: { circle: 'text-gray-100 dark:text-slate-800', icon: 'text-gray-400 dark:text-slate-400', accent: '#9ca3af' },
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  tone?: EmptyStateTone
}

export function EmptyState({ icon: Icon, title, description, action, tone = 'gray' }: EmptyStateProps) {
  const t = TONE_STYLES[tone]
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="relative w-20 h-20 mb-4">
        <svg viewBox="0 0 80 80" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <circle cx="40" cy="40" r="38" className={t.circle} fill="currentColor" />
          <circle cx="67" cy="16" r="5" fill={t.accent} opacity="0.35" />
          <circle cx="12" cy="58" r="4" fill={t.accent} opacity="0.25" />
          <circle cx="70" cy="64" r="3" fill={t.accent} opacity="0.3" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <Icon size={28} className={t.icon} />
        </div>
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 dark:text-slate-400 max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  )
}
