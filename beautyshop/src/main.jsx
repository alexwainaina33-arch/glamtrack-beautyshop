import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Auto-update service worker silently
const updateSW = registerSW({
  onNeedRefresh() {
    // New version available — auto-update without bothering user
    updateSW(true)
  },
  onOfflineReady() {
    console.log('[GlamTrack] App ready to work offline')
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)