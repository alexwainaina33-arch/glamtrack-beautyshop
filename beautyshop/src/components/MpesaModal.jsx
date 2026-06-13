import { useState } from 'react'
import { Smartphone, X, Loader } from 'lucide-react'
import toast from 'react-hot-toast'

export default function MpesaModal({ plan, onClose, onSuccess }) {
  const [phone,   setPhone]   = useState('')
  const [step,    setStep]    = useState('input')   // input | waiting | done
  const [checkoutId, setCheckoutId] = useState(null)
  const [loading, setLoading] = useState(false)

  const fmt = (p) => {
    p = p.replace(/\s/g, '')
    if (p.startsWith('07') || p.startsWith('01')) return '254' + p.slice(1)
    if (p.startsWith('+254')) return p.slice(1)
    return p
  }

  const isValid = /^(07|01|\+2547|\+2541|2547|2541)\d{8}$/.test(phone.replace(/\s/g, ''))

  const initiatePush = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/mpesa/stkpush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone:    fmt(phone),
          amount:   plan.price,
          planId:   plan.id,
          planName: plan.name,
          period:   plan.period,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'STK push failed')
      setCheckoutId(data.checkoutRequestId)
      setStep('waiting')
      pollPayment(data.checkoutRequestId)
    } catch (e) {
      toast.error(e.message || 'Could not reach M-Pesa. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const pollPayment = (cid) => {
    let attempts = 0
    const max    = 24  // 2 minutes
    const iv = setInterval(async () => {
      attempts++
      if (attempts > max) {
        clearInterval(iv)
        setStep('input')
        toast.error('Payment timed out. Please try again.')
        return
      }
      try {
        const r    = await fetch('/api/mpesa/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkoutRequestId: cid }),
        })
        const data = await r.json()
        if (data.ResultCode === '0' || data.ResultCode === 0) {
          clearInterval(iv)
          setStep('done')
          onSuccess({ ref: cid, plan })
        } else if (data.ResultCode === '1032' || data.ResultCode === 1032) {
          clearInterval(iv)
          setStep('input')
          toast('Payment cancelled on your phone.', { icon: '📵' })
        }
        // Any other code = still pending — keep polling
      } catch { /* network blip — keep polling */ }
    }, 5000)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: 20,
    }}>
      <div style={{
        background: 'linear-gradient(135deg,#1a0a0e,#3d1020)',
        border: '1px solid rgba(200,69,106,0.3)',
        borderRadius: 20, padding: 32, width: '100%', maxWidth: 380,
        position: 'relative',
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          background: 'none', border: 'none', color: '#f7c5d066',
          cursor: 'pointer',
        }}><X size={20} /></button>

        {/* M-Pesa logo area */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(76,175,80,0.15)',
            border: '2px solid rgba(76,175,80,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Smartphone size={32} color="#4caf50" />
          </div>
          <div style={{ color: '#4caf50', fontWeight: 800, fontSize: 18 }}>Lipa na M-Pesa</div>
          <div style={{ color: '#f7c5d066', fontSize: 13, marginTop: 4 }}>
            {plan.name} · KES {plan.price.toLocaleString('en-KE')} / {plan.period}
          </div>
        </div>

        {step === 'input' && (
          <>
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: '#f7c5d0aa', fontSize: 13, display: 'block', marginBottom: 8 }}>
                Safaricom phone number
              </label>
              <input
                type="tel"
                placeholder="07xx xxx xxx"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={{
                  width: '100%', padding: '14px 16px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 12, color: '#fce8ed',
                  fontSize: 18, fontFamily: 'Nunito,sans-serif',
                  outline: 'none', boxSizing: 'border-box',
                  letterSpacing: 2,
                }}
              />
              <div style={{ color: '#f7c5d044', fontSize: 11, marginTop: 6 }}>
                You will get an M-Pesa prompt on this number
              </div>
            </div>

            <button
              onClick={initiatePush}
              disabled={!isValid || loading}
              style={{
                width: '100%', padding: '15px',
                background: isValid && !loading
                  ? 'linear-gradient(135deg,#4caf50,#2e7d32)'
                  : 'rgba(255,255,255,0.08)',
                border: 'none', borderRadius: 12,
                color: '#fff', fontWeight: 800, fontSize: 16,
                cursor: isValid && !loading ? 'pointer' : 'not-allowed',
                fontFamily: 'Nunito,sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
              {loading
                ? <><Loader size={18} style={{ animation: 'spin 0.7s linear infinite' }} /> Sending…</>
                : `Pay KES ${plan.price.toLocaleString('en-KE')} →`
              }
            </button>

            <div style={{ textAlign: 'center', marginTop: 16, color: '#f7c5d033', fontSize: 11 }}>
              Secured by Safaricom · Sandbox mode
            </div>
          </>
        )}

        {step === 'waiting' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 56, height: 56, border: '3px solid rgba(76,175,80,0.2)',
              borderTop: '3px solid #4caf50', borderRadius: '50%',
              animation: 'spin 1s linear infinite', margin: '0 auto 20px',
            }} />
            <div style={{ color: '#fce8ed', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
              Check your phone
            </div>
            <div style={{ color: '#f7c5d066', fontSize: 13, lineHeight: 1.6 }}>
              An M-Pesa prompt has been sent to<br />
              <strong style={{ color: '#4caf50' }}>{phone}</strong><br /><br />
              Enter your M-Pesa PIN to complete payment.
            </div>
            <div style={{ color: '#f7c5d033', fontSize: 11, marginTop: 20 }}>
              Waiting for confirmation…
            </div>
          </div>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ color: '#4caf50', fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
              Payment confirmed!
            </div>
            <div style={{ color: '#f7c5d066', fontSize: 13 }}>
              Your {plan.name} plan is now active.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}