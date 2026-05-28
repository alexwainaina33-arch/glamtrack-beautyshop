import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, CheckCircle } from 'lucide-react'

export default function PaymentSuccessPage() {
  const navigate    = useNavigate()
  const [count, setCount] = useState(5)

  const plan   = localStorage.getItem('st_plan')   || 'Growth'
  const period = localStorage.getItem('st_period') || 'monthly'
  const ref    = localStorage.getItem('st_ref')    || '—'

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(c => {
        if (c <= 1) { clearInterval(interval); navigate('/app/dashboard'); }        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [navigate])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#1a0a0e 0%,#3d1020 50%,#6b1e38 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>

        {/* Animated success icon */}
        <div style={{ marginBottom: 24, position: 'relative', display: 'inline-block' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'rgba(76,175,80,0.15)', border: '2px solid rgba(76,175,80,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
            <CheckCircle size={52} color="#4caf50" />
          </div>
        </div>

        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#e6b800', marginBottom: 10, textTransform: 'uppercase' }}>
          Payment Confirmed
        </div>
        <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontSize: 30, fontWeight: 700, margin: '0 0 12px' }}>
          Welcome to SalesTrack! 🎉
        </h1>
        <p style={{ color: '#f7c5d077', fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>
          Your <strong style={{ color: '#fce8ed' }}>{plan}</strong> plan ({period}) is now active.<br />
          Transaction ref: <span style={{ color: '#e6b800', fontFamily: 'monospace', fontSize: 12 }}>{ref}</span>
        </p>

        {/* Plan badge */}
        <div style={{ display: 'inline-block', background: 'rgba(200,69,106,0.15)', border: '1px solid rgba(200,69,106,0.3)', borderRadius: 12, padding: '12px 28px', marginBottom: 32 }}>
          <div style={{ color: '#f7c5d077', fontSize: 11, marginBottom: 4 }}>Active plan</div>
          <div style={{ color: '#fce8ed', fontSize: 20, fontWeight: 800 }}>{plan}</div>
          <div style={{ color: '#c8456a', fontSize: 12, textTransform: 'capitalize' }}>{period} billing</div>
        </div>

        {/* Auto redirect */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#f7c5d055', fontSize: 13, marginBottom: 14 }}>
            Taking you to your dashboard in <span style={{ color: '#e6b800', fontWeight: 700, fontSize: 16 }}>{count}</span>s…
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', maxWidth: 200, margin: '0 auto' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,#c8456a,#e6b800)', borderRadius: 2, width: `${(count / 5) * 100}%`, transition: 'width 1s linear' }} />
          </div>
        </div>

        <button onClick={() => navigate('/app/dashboard')} style={{
          padding: '13px 36px', borderRadius: 12,
          background: 'linear-gradient(135deg,#c8456a,#8b2550)',
          color: '#fff', border: 'none', fontWeight: 700, fontSize: 15,
          cursor: 'pointer', fontFamily: 'Nunito,sans-serif',
          boxShadow: '0 6px 24px #c8456a55',
        }}>
          Go to Dashboard Now →
        </button>

        <p style={{ color: '#f7c5d033', fontSize: 11, marginTop: 20 }}>
          A receipt has been sent to your email · Powered by SalesTrack v2.0
        </p>
      </div>
    </div>
  )
}