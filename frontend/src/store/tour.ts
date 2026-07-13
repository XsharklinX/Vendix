import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TourState {
  venderTourSeen: boolean
  markVenderTourSeen: () => void
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      venderTourSeen: false,
      markVenderTourSeen: () => set({ venderTourSeen: true }),
    }),
    { name: 'vendix-tour' }
  )
)
