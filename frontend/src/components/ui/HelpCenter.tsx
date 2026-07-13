import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, HelpCircle, ArrowRight } from 'lucide-react'
import { HELP_TOPICS } from '@/lib/helpTopics'
import { useHelpCenterStore } from '@/store/helpCenter'

export function HelpCenter() {
  const navigate = useNavigate()
  const { open, setOpen } = useHelpCenterStore()
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setExpandedId(null)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (open && e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, setOpen])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return HELP_TOPICS
    return HELP_TOPICS.filter(t => t.question.toLowerCase().includes(q) || t.answer.toLowerCase().includes(q))
  }, [query])

  const goTo = (to: string) => {
    navigate(to)
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh] px-4">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Centro de ayuda" className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 overflow-hidden animate-fade-in flex flex-col max-h-[70vh]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
          <Search size={16} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="¿En qué necesitas ayuda?"
            className="flex-1 text-sm outline-none placeholder:text-gray-400 dark:text-slate-500 bg-transparent dark:text-slate-100"
          />
          <kbd className="hidden sm:inline text-[10px] font-semibold text-gray-400 dark:text-slate-500 border border-gray-200 dark:border-slate-600 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <div className="overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-slate-500">
              <HelpCircle size={24} className="mx-auto mb-2 opacity-40" />
              Sin resultados para "{query}"
            </div>
          ) : results.map(topic => {
            const expanded = expandedId === topic.id
            return (
              <div key={topic.id} className="border-b border-gray-50 dark:border-slate-800 last:border-0">
                <button
                  onClick={() => setExpandedId(expanded ? null : topic.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${expanded ? 'bg-blue-50 dark:bg-blue-950/40' : 'hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                >
                  <span className="flex-1 text-sm font-medium text-gray-800 dark:text-slate-200">{topic.question}</span>
                </button>
                {expanded && (
                  <div className="px-4 pb-3 pt-0.5">
                    <p className="text-sm text-gray-600 dark:text-slate-300 leading-snug">{topic.answer}</p>
                    {topic.to && (
                      <button
                        onClick={() => goTo(topic.to!)}
                        className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                      >
                        Ir a la pantalla <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 flex-shrink-0">
          <p className="text-[11px] text-gray-400 dark:text-slate-500">
            ¿No encontraste lo que buscabas?{' '}
            <button onClick={() => goTo('/configuraciones?tab=sistema')} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Ve a Sistema para info de soporte
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
