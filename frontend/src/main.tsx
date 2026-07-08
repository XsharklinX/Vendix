import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Si un chunk lazy falla al cargar (p. ej. tras un deploy que cambió los
// hashes de los archivos), recargamos la página una sola vez en lugar de
// dejar la pantalla de "Cargando..." colgada para siempre.
const CHUNK_RELOAD_KEY = 'vendix-chunk-reload'
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
    window.location.reload()
  }
})
// La carga actual fue exitosa: liberamos el "presupuesto" de reintento
// para que un futuro fallo de chunk también pueda recargar una vez.
window.setTimeout(() => sessionStorage.removeItem(CHUNK_RELOAD_KEY), 5000)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(console.error)
}
