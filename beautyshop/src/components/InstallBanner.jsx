import { useState, useEffect } from 'react'

export default function InstallBanner() {
  const [prompt, setPrompt] = useState(null)
  const [show, setShow] = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Check if dismissed before
    if (localStorage.getItem('pwa-installed')) return

    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => setInstalled(true))

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      localStorage.setItem('pwa-installed', '1')
      setInstalled(true)
    }
    setShow(false)
  }

  const handleDismiss = () => {
    setShow(false) // session only — no localStorage, shows again on next refresh
  }

  if (!show || installed) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: '#8b2550',
      color: '#fff',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
      fontFamily: 'Nunito, sans-serif'
    }}>
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: '#fff', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22
      }}>📈</div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Install SalesTrack</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 1 }}>
          Add to home screen — works without internet
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.4)',
            color: '#fff', borderRadius: 8, padding: '6px 10px',
            fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito, sans-serif'
          }}
        >
          Not now
        </button>
        <button
          onClick={handleInstall}
          style={{
            background: '#fff', border: 'none',
            color: '#8b2550', borderRadius: 8, padding: '6px 14px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'Nunito, sans-serif'
          }}
        >
          Install
        </button>
      </div>
    </div>
  )
}