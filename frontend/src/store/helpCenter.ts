import { create } from 'zustand'

interface HelpCenterState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const useHelpCenterStore = create<HelpCenterState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set(s => ({ open: !s.open })),
}))
