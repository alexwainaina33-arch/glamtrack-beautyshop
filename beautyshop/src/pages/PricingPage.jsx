import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── PAYSTACK CONFIG ──────────────────────────────────────────────
// To go LIVE: swap TEST_PUBLIC_KEY for your live key below
const TEST_PUBLIC_KEY  = 'pk_test_523b218b82f8a13cab86ed2ae719de25ecb9e913'
const LIVE_PUBLIC_KEY  = 'pk_live_45e42fea03a2eb76f541a47b3d189cfbaacf4f7c'
const USE_LIVE         = false   // ← flip to true when going live
const PAYSTACK_KEY     = USE_LIVE ? LIVE_PUBLIC_KEY : TEST_PUBLIC_KEY
// ─────────────────────────────────────────────────────────────────

const PLANS = {
  monthly: [
    {
      id: 'starter', name: 'Starter', price: 2500, period: 'monthly',
      color: '#f7c5d0', highlight: false, save: null,
      features: ['1 user', 'POS & Inventory', 'Basic reports', 'Barcode labels', 'Email support'],
      missing: ['Smart Analytics', 'Staff commissions', 'Multi-branch'],
    },
    {
      id: 'growth', name: 'Growth', price: 6500, period: 'monthly',
      color: '#e6b800', highlight: true, save: null,
      features: ['5 users', 'Everything in Starter', 'Smart Analytics', 'Staff & commissions', 'Appointments', 'Priority support'],
      missing: ['Multi-branch'],
    },
    {
      id: 'enterprise', name: 'Enterprise', price: 15000, period: 'monthly',
      color: '#c8456a', highlight: false, save: null,
      features: ['Unlimited users', 'Everything in Growth', 'Multi-branch', 'Dedicated support', 'Custom reports', 'API access'],
      missing: [],
    },
  ],
  quarterly: [
    {
      id: 'starter', name: 'Starter', price: 6750, period: 'quarterly',
      color: '#f7c5d0', highlight: false, save: 'Save KES 750',
      features: ['1 user', 'POS & Inventory', 'Basic reports', 'Barcode labels', 'Email support'],
      missing: ['Smart Analytics', 'Staff commissions', 'Multi-branch'],
    },
    {
      id: 'growth', name: 'Growth', price: 17550, period: 'quarterly',
      color: '#e6b800', highlight: true, save: 'Save KES 1,950',
      features: ['5 users', 'Everything in Starter', 'Smart Analytics', 'Staff & commissions', 'Appointments', 'Priority support'],
      missing: ['Multi-branch'],
    },
    {
      id: 'enterprise', name: 'Enterprise', price: 40500, period: 'quarterly',
      color: '#c8456a', highlight: false, save: 'Save KES 4,500',
      features: ['Unlimited users', 'Everything in Growth', 'Multi-branch', 'Dedicated support', 'Custom reports', 'API access'],
      missing: [],
    },
  ],
  yearly: [
    {
      id: 'starter', name: 'Starter', price: 24000, period: 'yearly',
      color: '#f7c5d0', highlight: false, save: 'Save KES 6,000',
      features: ['1 user', 'POS & Inventory', 'Basic reports', 'Barcode labels', 'Email support'],
      missing: ['Smart Analytics', 'Staff commissions', 'Multi-branch'],
    },
    {
      id: 'growth', name: 'Growth', price: 62400, period: 'yearly',
      color: '#e6b800', highlight: true, save: 'Save KES 15,600',
      features: ['5 users', 'Everything in Starter', 'Smart Analytics', 'Staff & commissions', 'Appointments', 'Priority support'],
      missing: ['Multi-branch'],
    },
    {
      id: 'enterprise', name: 'Enterprise', price: 144000, period: 'yearly',
      color: '#c8456a', highlight: false, save: 'Save KES 36,000',
      features: ['Unlimited users', 'Everything in Growth', 'Multi-branch', 'Dedicated support', 'Custom reports', 'API access'],
      missing: [],
    },
  ],
}

const PERIOD_LABELS = { monthly: '/ month', quarterly: '/ quarter', yearly: '/ year' }

function fmt(n) {
  return 'KES ' + n.toLocaleString('en-KE')
}

export default function PricingPage() {
  const navigate = useNavigate()
  const [period, setPeriod]   = useState('monthly')
  const [loading, setLoading] = useState(null)
  const plans = PLANS[period]

  const openPaystack = (plan, userEmail) => {
    const handler = window.PaystackPop.setup({
      key:      PAYSTACK_KEY,
      email:    userEmail || 'customer@salestrack.app',
      amount:   plan.price * 100,
      currency: 'KES',
      ref:      `ST-${plan.id.toUpperCase()}-${Date.now()}`,
      metadata: {
        plan_id:   plan.id,
        plan_name: plan.name,
        period:    plan.period,
        custom_fields: [
          { display_name: 'Plan',   variable_name: 'plan',   value: plan.name },
          { display_name: 'Period', variable_name: 'period', value: plan.period },
        ],
      },
      callback: (response) => {
        localStorage.setItem('st_plan',      plan.name)
        localStorage.setItem('st_period',    plan.period)
        localStorage.setItem('st_ref',       response.reference)
        localStorage.setItem('st_activated', 'true')
        setLoading(null)
        navigate('/payment-success')
      },
      onClose: () => {
        setLoading(null)
        toast('Payment cancelled — you can try again anytime.', { icon: '👋' })
      },
    })
    handler.openIframe()
  }

  const handleSelect = (plan) => {
    const userEmail = localStorage.getItem('st_pending_email') || ''
    setLoading(plan.id)

    const existing = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]')
    if (existing && window.PaystackPop) {
      openPaystack(plan, userEmail)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://js.paystack.co/v1/inline.js'
    script.onload = () => openPaystack(plan, userEmail)
    script.onerror = () => {
      setLoading(null)
      toast.error('Could not load payment gateway. Check your internet connection.')
    }
    document.head.appendChild(script)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#1a0a0e 0%,#3d1020 50%,#6b1e38 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', position: 'relative', overflow: 'hidden',
    }}>
      {[...Array(3)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: [300, 200, 350][i], height: [300, 200, 350][i],
          borderRadius: '50%',
          background: ['#c8456a', '#e6b800', '#8b2550'][i],
          opacity: 0.05,
          top: ['0%', '70%', '20%'][i], left: ['60%', '5%', '80%'][i],
          filter: 'blur(70px)', pointerEvents: 'none',
        }} />
      ))}

      <div style={{ width: '100%', maxWidth: 720, position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#e6b800,#c8456a)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} color="#fff" />
            </div>
            <span style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontSize: 22, fontWeight: 700 }}>SalesTrack</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#e6b800', marginBottom: 10, textTransform: 'uppercase' }}>Simple Pricing</div>
          <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontSize: 30, fontWeight: 700, margin: '0 0 8px' }}>
            Choose the right plan for your business
          </h1>
          <p style={{ color: '#f7c5d066', fontSize: 14, marginBottom: 24 }}>
            14-day free trial · No credit card required · Cancel anytime
          </p>

          {/* Period toggle */}
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, padding: 4, gap: 2 }}>
            {['monthly', 'quarterly', 'yearly'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '8px 20px', borderRadius: 20, border: 'none',
                background: period === p ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent',
                color: period === p ? '#fff' : '#f7c5d066',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                fontFamily: 'Nunito,sans-serif', transition: 'all 0.2s', position: 'relative',
              }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
                {p === 'yearly' && (
                  <span style={{ position: 'absolute', top: -8, right: -4, background: '#e6b800', color: '#1a0a0e', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8 }}>
                    −20%
                  </span>
                )}
                {p === 'quarterly' && (
                  <span style={{ position: 'absolute', top: -8, right: -4, background: '#4caf50', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8 }}>
                    −10%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
          {plans.map(plan => (
            <div key={plan.id} style={{
              background: plan.highlight ? 'rgba(200,69,106,0.12)' : 'rgba(255,255,255,0.06)',
              border: plan.highlight ? '2px solid #c8456a' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 18, padding: '24px 20px', position: 'relative',
              display: 'flex', flexDirection: 'column',
              transition: 'transform 0.2s',
            }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#c8456a,#8b2550)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 20, whiteSpace: 'nowrap', boxShadow: '0 4px 12px #c8456a55' }}>
                  ⭐ MOST POPULAR
                </div>
              )}

              <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: plan.highlight ? '#e6b800' : '#f7c5d077' }}>
                {plan.name}
              </div>

              {/* Price */}
              <div style={{ marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: '#f7c5d066' }}>KES </span>
                <span style={{ fontSize: 34, fontWeight: 800, color: '#fce8ed', lineHeight: 1 }}>
                  {plan.price.toLocaleString('en-KE')}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#f7c5d055', marginBottom: plan.save ? 2 : 16 }}>
                {PERIOD_LABELS[period]}
              </div>
              {plan.save && (
                <div style={{ fontSize: 11, color: '#4caf50', fontWeight: 700, marginBottom: 16 }}>
                  {plan.save}
                </div>
              )}

              {/* Features */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16, flex: 1 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 9, fontSize: 12, color: '#f7c5d0aa' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: plan.highlight ? 'rgba(200,69,106,0.3)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <Check size={9} color={plan.highlight ? '#c8456a' : '#f7c5d077'} strokeWidth={3} />
                    </div>
                    {f}
                  </div>
                ))}
                {plan.missing.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 9, fontSize: 12, color: '#f7c5d033', textDecoration: 'line-through' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      <X size={9} color="#f7c5d033" strokeWidth={3} />
                    </div>
                    {f}
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => handleSelect(plan)}
                disabled={loading === plan.id}
                style={{
                  marginTop: 20, width: '100%', padding: '12px',
                  borderRadius: 10,
                  border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.2)',
                  background: loading === plan.id
                    ? 'rgba(255,255,255,0.05)'
                    : plan.highlight
                      ? 'linear-gradient(135deg,#c8456a,#8b2550)'
                      : 'rgba(255,255,255,0.08)',
                  color: '#fce8ed', fontWeight: 700, fontSize: 13,
                  cursor: loading === plan.id ? 'not-allowed' : 'pointer',
                  fontFamily: 'Nunito,sans-serif',
                  boxShadow: plan.highlight ? '0 6px 20px #c8456a44' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {loading === plan.id
                  ? <><div style={{ width: 14, height: 14, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Loading…</>
                  : `Start ${plan.name} →`
                }
              </button>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', color: '#f7c5d033', fontSize: 12 }}>
          All plans include SSL security · Daily backups · 99.9% uptime SLA · M-Pesa & card payments
        </p>
        <div style={{ textAlign: 'center', marginTop: 12, display: 'flex', gap: 20, justifyContent: 'center' }}>
          <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: '#f7c5d044', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
            ← Back to login
          </button>
          <button onClick={() => navigate('/tutorial')} style={{ background: 'none', border: 'none', color: '#f7c5d044', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
            ← Back to tutorial
          </button>
          <button onClick={() => window.location.href='/landing.html'} style={{ background: 'none', border: 'none', color: '#f7c5d044', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
            ← SalesTrack website
          </button>
        </div>
      </div>
    </div>
  )
}