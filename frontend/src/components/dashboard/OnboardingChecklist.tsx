import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, X, Rocket } from 'lucide-react'

export interface ChecklistStep {
  label: string
  done: boolean
  to: string
}

interface OnboardingChecklistProps {
  bid: string
  steps: ChecklistStep[]
}

const storageKey = (bid: string) => `vendix_checklist_dismissed_${bid}`

export function OnboardingChecklist({ bid, steps }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(storageKey(bid)) === '1')

  const doneCount = steps.filter(s => s.done).length
  const allDone = doneCount === steps.length

  if (dismissed || allDone) return null

  const dismiss = () => {
    localStorage.setItem(storageKey(bid), '1')
    setDismissed(true)
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 border-b border-blue-200">
        <Rocket size={16} className="text-blue-500 flex-shrink-0" />
        <p className="text-sm font-bold text-blue-800 flex-1">
          Primeros pasos — {doneCount}/{steps.length}
        </p>
        <button onClick={dismiss} className="p-1 rounded-lg hover:bg-blue-100 transition-colors" title="Ocultar">
          <X size={14} className="text-blue-400" />
        </button>
      </div>
      <div className="divide-y divide-blue-100">
        {steps.map((step, i) => (
          <Link
            key={i}
            to={step.to}
            className="flex items-center gap-3 px-5 py-2.5 hover:bg-blue-100/50 transition-colors group"
          >
            {step.done
              ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
              : <Circle size={16} className="text-blue-300 flex-shrink-0" />}
            <p className={`text-sm ${step.done ? 'text-gray-400 line-through' : 'text-blue-800'}`}>{step.label}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
