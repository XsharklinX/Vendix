import { useSoundStore } from '@/store/sound'

export type SoundName = 'success' | 'beep' | 'error' | 'notify'

const cache = new Map<SoundName, HTMLAudioElement>()

/** Reproduce un sonido corto de la UI si el usuario los tiene activados. */
export function playSound(name: SoundName) {
  const { enabled, volume } = useSoundStore.getState()
  if (!enabled) return

  let audio = cache.get(name)
  if (!audio) {
    audio = new Audio(`/sounds/${name}.wav`)
    cache.set(name, audio)
  }
  audio.volume = volume
  audio.currentTime = 0
  // Ignorar si el navegador bloquea autoplay; no debe romper el flujo.
  audio.play().catch(() => {})
}
