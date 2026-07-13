import { useEffect, useState } from 'react'
import { useTourStore } from '@/store/tour'

interface TourStep {
  target: string
  title: string
  body: string
}

const STEPS: TourStep[] = [
  { target: 'pos-search', title: 'Busca o escanea', body: 'Escribe el nombre del producto o usa el lector de código de barras para encontrarlo al instante.' },
  { target: 'pos-grid', title: 'Toca para agregar', body: 'Toca un producto para sumarlo al carrito. Puedes tocarlo varias veces para aumentar la cantidad.' },
  { target: 'pos-cart', title: 'Tu carrito', body: 'Aquí ves todo lo que llevas, el descuento y el total — puedes ajustar cantidades o quitar productos.' },
  { target: 'pos-pay', title: 'Cobra la venta', body: 'Elige el método de pago y presiona Cobrar (o Enter) para completar la venta.' },
]

const TOOLTIP_WIDTH = 280
const MARGIN = 12

// Tour de la primera venta: solo aparece una vez, la primera vez que el
// usuario visita "Vender". No bloquea el uso de la app si algo no calza en
// pantalla (móvil muy chico, target no encontrado) — simplemente no se muestra.
export function VenderTour() {
  const seen = useTourStore(s => s.venderTourSeen)
  const markSeen = useTourStore(s => s.markVenderTourSeen)
  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (seen) return
    const t = setTimeout(() => setActive(true), 700)
    return () => clearTimeout(t)
  }, [seen])

  useEffect(() => {
    if (!active) return
    const measure = () => {
      const els = document.querySelectorAll<HTMLElement>(`[data-tour="${STEPS[step].target}"]`)
      const visible = Array.from(els).find(el => el.offsetParent !== null)
      if (!visible) {
        // El objetivo de este paso no está visible en este layout (ej. el
        // carrito móvil solo existe en el DOM cuando el usuario lo abre) —
        // saltar el paso en vez de dejar el tour trabado a medias.
        if (step < STEPS.length - 1) setStep(s => s + 1)
        else { markSeen(); setActive(false) }
        return
      }
      setRect(visible.getBoundingClientRect())
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [active, step, markSeen])

  if (seen || !active || !rect) return null

  const finish = () => { markSeen(); setActive(false) }
  const next = () => step < STEPS.length - 1 ? setStep(s => s + 1) : finish()

  const pad = 8
  const spotTop = rect.top - pad
  const spotLeft = rect.left - pad
  const spotWidth = rect.width + pad * 2
  const spotHeight = rect.height + pad * 2

  const spaceBelow = window.innerHeight - rect.bottom
  const placeBelow = spaceBelow > 160
  const tooltipTop = placeBelow ? rect.bottom + 14 : Math.max(MARGIN, rect.top - 14)
  const tooltipLeft = Math.min(
    Math.max(MARGIN, rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2),
    window.innerWidth - TOOLTIP_WIDTH - MARGIN
  )

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        className="absolute rounded-2xl pointer-events-none transition-all duration-300 ease-out"
        style={{ top: spotTop, left: spotLeft, width: spotWidth, height: spotHeight, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.65)' }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Guía de la primera venta"
        className="absolute bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-700 p-4 animate-fade-in"
        style={{ top: tooltipTop, left: tooltipLeft, width: TOOLTIP_WIDTH, transform: placeBelow ? undefined : 'translateY(-100%)' }}
      >
        <p className="text-sm font-bold text-gray-900 dark:text-slate-100 mb-1">{STEPS[step].title}</p>
        <p className="text-xs text-gray-500 dark:text-slate-400 leading-snug mb-3">{STEPS[step].body}</p>
        <div className="flex items-center justify-between">
          <button onClick={finish} className="text-xs font-medium text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
            Saltar
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-300 dark:text-slate-600">{step + 1}/{STEPS.length}</span>
            <button onClick={next} className="btn-primary text-xs px-3 py-1.5">
              {step < STEPS.length - 1 ? 'Siguiente' : 'Entendido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
