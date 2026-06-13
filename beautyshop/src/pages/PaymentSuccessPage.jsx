import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import pb, { C } from '../lib/pb'
import { useAuth } from '../context/AuthContext'

const PLAN_DAILY_COSTS = {
  starter:    { monthly: 167, yearly: 137 },
  growth:     { monthly: 333, yearly: 274 },
  enterprise: { monthly: 833, yearly: 685 },
}

const PLAN_MESSAGES = {
  starter:    'Less than a loaf of bread — for your entire business records, stock alerts, and daily profit reports.',
  growth:     'Less than your cheapest product — for unlimited sales tracking, staff commissions, and AI insights.',
  enterprise: 'Your business now runs on autopilot — every branch, every staff member, every sale tracked from one phone.',
}

const FEATURES = [
  'Unlimited sales tracking',
  'Stock alerts before you run out',
  'Profit reports in seconds',
  'Works offline on any phone',
  'M-Pesa payments built in',
  'WhatsApp summaries daily',
]

function MomentumReceipt({ shop, planName, planPeriod }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  const planKey   = (planName || 'growth').toLowerCase()
  const periodKey = (planPeriod || 'monthly').toLowerCase()
  const dailyCost = PLAN_DAILY_COSTS[planKey]?.[periodKey]
    || parseInt(localStorage.getItem('st_dailycost') || '333')
  const message   = PLAN_MESSAGES[planKey] || PLAN_MESSAGES.growth

  useEffect(() => {
    if (!shop?.id) { setLoading(false); return }
    const run = async () => {
      try {
        const thirtyAgo = new Date(Date.now() - 30 * 86400000)
        const res = await pb.collection(C.SALES).getList(1, 500, {
          filter: `shop_id="${shop.id}" && status="completed"`,
          fields: 'total_kes,created',
          '$autoCancel': false,
          '$cancelKey': 'pay-success-momentum',
        })
        const last30   = res.items.filter(s => new Date(s.created) >= thirtyAgo)
        const totalRev = last30.reduce((sum, s) => sum + (s.total_kes || 0), 0)
        setData({ count: last30.length, totalRev })
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [shop])

  if (loading) return (
    <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(230,184,0,0.2)', borderRadius: 14, padding: '18px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 90 }}>
      <div style={{ width: 18, height: 18, border: '2px solid rgba(230,184,0,0.3)', borderTop: '2px solid #e6b800', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(230,184,0,0.25)', borderRadius: 14, padding: '18px 20px', marginBottom: 20, textAlign: 'left' }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: '#e6b800', textTransform: 'uppercase', marginBottom: 12 }}>
        💡 Your Investment Breakdown
      </div>

      {data && data.count > 0 ? (
        <>
          {[
            { label: 'Plan cost', value: `KES ${parseInt(localStorage.getItem('st_price') || '9999').toLocaleString('en-KE')}` },
            { label: 'Sales last 30 days', value: `${data.count.toLocaleString('en-KE')} transactions` },
            { label: 'Revenue tracked', value: `KES ${data.totalRev.toLocaleString('en-KE', { minimumFractionDigits: 2 })}` },
            { label: 'SalesTrack costs you', value: `KES ${dailyCost}/day` },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
              <span style={{ fontSize: 12, color: '#f7c5d077' }}>{r.label}</span>
              <span style={{ fontSize: i === 3 ? 15 : 13, fontWeight: i === 3 ? 800 : 700, color: i === 3 ? '#e6b800' : '#fce8ed' }}>{r.value}</span>
            </div>
          ))}
          <div style={{ marginTop: 12, background: 'rgba(230,184,0,0.08)', borderRadius: 8, padding: '9px 12px', fontSize: 11, color: '#e6b800', lineHeight: 1.6 }}>
            {message}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: 12, color: '#f7c5d077' }}>SalesTrack costs you</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#e6b800' }}>KES {dailyCost}/day</span>
          </div>
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#f7c5d0aa' }}>
                <span style={{ color: '#4caf50', fontSize: 14, flexShrink: 0 }}>✓</span>
                {f}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, background: 'rgba(230,184,0,0.08)', borderRadius: 8, padding: '9px 12px', fontSize: 11, color: '#e6b800', lineHeight: 1.6 }}>
            {message}
          </div>
        </>
      )}
    </div>
  )
}

export default function PaymentSuccessPage() {
  const navigate      = useNavigate()
  const { shop }      = useAuth()
  const [count, setCount] = useState(10)

  const plan   = localStorage.getItem('st_plan')   || 'Growth'
  const period = localStorage.getItem('st_period') || 'monthly'
  const ref    = localStorage.getItem('st_ref')    || '—'

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(c => {
        if (c <= 1) { clearInterval(interval); navigate('/app/dashboard') }
        return c - 1
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
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ textAlign: 'center', maxWidth: 460, width: '100%' }}>

        <div style={{ marginBottom: 20, display: 'inline-block' }}>
          <div style={{ width: 86, height: 86, borderRadius: '50%', background: 'rgba(76,175,80,0.15)', border: '2px solid rgba(76,175,80,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
            <CheckCircle size={48} color="#4caf50" />
          </div>
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#e6b800', marginBottom: 8, textTransform: 'uppercase' }}>
          Payment Confirmed
        </div>
        <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontSize: 28, fontWeight: 700, margin: '0 0 10px' }}>
          Welcome to SalesTrack! 🎉
        </h1>
        <p style={{ color: '#f7c5d077', fontSize: 13, lineHeight: 1.7, marginBottom: 22 }}>
          Your <strong style={{ color: '#fce8ed' }}>{plan}</strong> plan ({period}) is now active.<br />
          Transaction ref: <span style={{ color: '#e6b800', fontFamily: 'monospace', fontSize: 11 }}>{ref}</span>
        </p>

        <MomentumReceipt shop={shop} planName={plan} planPeriod={period} />

        <div style={{ display: 'inline-block', background: 'rgba(200,69,106,0.15)', border: '1px solid rgba(200,69,106,0.3)', borderRadius: 12, padding: '10px 24px', marginBottom: 24 }}>
          <div style={{ color: '#f7c5d077', fontSize: 10, marginBottom: 3 }}>Active plan</div>
          <div style={{ color: '#fce8ed', fontSize: 18, fontWeight: 800 }}>{plan}</div>
          <div style={{ color: '#c8456a', fontSize: 11, textTransform: 'capitalize' }}>{period} billing</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ color: '#f7c5d055', fontSize: 12, marginBottom: 12 }}>
            Taking you to your dashboard in <span style={{ color: '#e6b800', fontWeight: 700, fontSize: 15 }}>{count}</span>s…
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', maxWidth: 200, margin: '0 auto' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg,#c8456a,#e6b800)', borderRadius: 2, width: `${(count / 10) * 100}%`, transition: 'width 1s linear' }} />
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

        <p style={{ color: '#f7c5d033', fontSize: 11, marginTop: 18 }}>
          A receipt has been sent to your email · Powered by SalesTrack v2.0
        </p>
      </div>
    </div>
  )
}