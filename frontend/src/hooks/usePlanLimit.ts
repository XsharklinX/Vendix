import { useState, useEffect } from 'react'

export const PLAN_LIMIT_EVENT = 'plan-limit-reached'

export function emitPlanLimit(message?: string) {
  window.dispatchEvent(new CustomEvent(PLAN_LIMIT_EVENT, { detail: { message } }))
}

export function usePlanLimit() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<string | undefined>()

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setMessage(detail?.message)
      setOpen(true)
    }
    window.addEventListener(PLAN_LIMIT_EVENT, handler)
    return () => window.removeEventListener(PLAN_LIMIT_EVENT, handler)
  }, [])

  return { open, message, close: () => setOpen(false) }
}
