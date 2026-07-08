import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SoundState {
  enabled: boolean
  volume: number
  setEnabled: (enabled: boolean) => void
  setVolume: (volume: number) => void
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set) => ({
      enabled: false,
      volume: 0.5,
      setEnabled: (enabled) => set({ enabled }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
    }),
    { name: 'vendix-sound' }
  )
)
