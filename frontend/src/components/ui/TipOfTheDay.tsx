import { useEffect, useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { useTipsStore } from '@/store/tips'
import { pickNextTip, type Tip } from '@/lib/tips'

const OPEN_DELAY_MS = 4000
const AUTO_HIDE_MS = 15000
const LONG_SESSION_MS = 25 * 60 * 1000
const MIN_GAP_NEW_USER_MS = 3 * 60 * 60 * 1000
const MIN_GAP_REGULAR_MS = 10 * 60 * 60 * 1000

function isNewUser(firstSeenAt: number | null): boolean {
  if (!firstSeenAt) return true
  return (Date.now() - firstSeenAt) / (1000 * 60 * 60 * 24) <= 7
}

export function TipOfTheDay() {
  const { firstSeenAt, lastShownAt, shownIds, longSessionTipShown, markFirstSeen, markShown, startSession } = useTipsStore()
  const [tip, setTip] = useState<Tip | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    markFirstSeen()
    startSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canShow = () => {
    if (!lastShownAt) return true
    const gap = isNewUser(firstSeenAt) ? MIN_GAP_NEW_USER_MS : MIN_GAP_REGULAR_MS
    return Date.now() - lastShownAt > gap
  }

  const show = () => {
    if (!canShow()) return
    setTip(pickNextTip(useTipsStore.getState().shownIds, firstSeenAt))
    setVisible(true)
  }

  // Al abrir la app
  useEffect(() => {
    const t = setTimeout(show, OPEN_DELAY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tras una sesión larga con la app abierta
  useEffect(() => {
    if (longSessionTipShown) return
    const t = setTimeout(() => {
      if (canShow()) {
        show()
        useTipsStore.setState({ longSessionTipShown: true })
      }
    }, LONG_SESSION_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => dismiss(), AUTO_HIDE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const dismiss = () => {
    setVisible(false)
    if (tip) markShown(tip.id)
  }

  if (!visible || !tip) return null

  return (
    <div
      role="status"
      className="fixed bottom-5 right-5 z-40 w-80 max-w-[calc(100vw-2.5rem)] animate-fade-in"
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-amber-100 dark:border-amber-900/50 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          <div className="w-9 h-9 bg-amber-50 dark:bg-amber-950/40 rounded-xl flex items-center justify-center flex-shrink-0">
            <Lightbulb size={18} className="text-amber-500 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">¿Sabías que...?</p>
            <p className="text-sm text-gray-700 dark:text-slate-300 leading-snug">{tip.text}</p>
          </div>
          <button
            onClick={dismiss}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 dark:text-slate-500 flex-shrink-0"
            aria-label="Cerrar consejo"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
