import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TipsState {
  firstSeenAt: number | null
  lastShownAt: number | null
  shownIds: string[]
  sessionStartAt: number | null
  longSessionTipShown: boolean
  markFirstSeen: () => void
  markShown: (id: string) => void
  startSession: () => void
}

export const useTipsStore = create<TipsState>()(
  persist(
    (set, get) => ({
      firstSeenAt: null,
      lastShownAt: null,
      shownIds: [],
      sessionStartAt: null,
      longSessionTipShown: false,
      markFirstSeen: () => {
        if (!get().firstSeenAt) set({ firstSeenAt: Date.now() })
      },
      markShown: (id) => set(state => ({
        lastShownAt: Date.now(),
        shownIds: [...state.shownIds, id],
      })),
      startSession: () => set({ sessionStartAt: Date.now(), longSessionTipShown: false }),
    }),
    { name: 'vendix-tips' }
  )
)
