import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(console.error)
}
