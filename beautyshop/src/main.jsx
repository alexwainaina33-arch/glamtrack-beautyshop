import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// Error monitoring — only active in production builds, error capture only
// (no Replay, no Performance/Tracing — keeps bundle impact minimal)
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
  })
}

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

function ErrorFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      textAlign: 'center',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
      <h2 style={{ margin: '0 0 8px' }}>Something went wrong</h2>
      <p style={{ color: '#666', marginBottom: 20 }}>
        We've been notified. Please refresh the page to continue.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          minHeight: 48,
          padding: '0 24px',
          background: '#8b2550',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          cursor: 'pointer'
        }}
      >
        Refresh
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
    <App />
  </Sentry.ErrorBoundary>
)