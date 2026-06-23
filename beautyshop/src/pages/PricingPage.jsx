import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TrendingUp, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import MpesaModal from '../components/MpesaModal'
import pb, { C } from '../lib/pb'
import { useAuth } from '../context/AuthContext'

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_KEY || ''

const PLANS = {
  monthly: [
    {
      id: 'starter', name: 'Starter', price: 4999, period: 'monthly',
      dailyCost: 167, color: '#f7c5d0', highlight: false, save: null,
      tagline: 'Everything you need to run your shop from your phone',
      features: [
        '1 owner + 1 cashier login account',
        'Full POS — cash, M-Pesa & card payments',
        'Offline mode — sells without internet',
        'Hold & resume multiple sales at once',
        'Barcode scanner & label printing',
        'Inventory tracking & stock levels',
        'Low stock WhatsApp alerts (per-item & bulk)',
        'Expense tracking with photo receipt capture',
        'Customer profiles & loyalty points system',
        'Digital receipts sent via WhatsApp',
        'Free public shop website (shop page & catalogue)',
        'Daily, weekly & monthly sales reports',
        'Gross profit shown on every single sale',
        'Stock valuation report (for your accountant)',
        'Sales & customer CSV export',
        'Brand settings — logo, color, receipt footer',
        'PWA — installs on your phone like a native app',
        'WhatsApp support',
      ],
      missing: [
        'Appointment booking page',
        'Staff commissions & attendance',
        'AI business insights',
        'Lender-ready P&L report',
        'Multi-branch management',
      ],
    },
    {
      id: 'growth', name: 'Growth', price: 9999, period: 'monthly',
      dailyCost: 333, color: '#e6b800', highlight: true, save: null,
      tagline: 'For shops with staff, bookings and bigger ambitions',
      features: [
        'Everything in Starter',
        'Unlimited staff login accounts',
        'Staff commission calculator — % or flat per service',
        'Staff attendance clock in & clock out',
        'Staff leaderboard & monthly sales targets',
        'Payout recording with WhatsApp receipt to staff',
        'Appointment booking page — public link, no app needed',
        'Multi-service booking cart for customers',
        'Auto WhatsApp reminders sent to customers',
        'Staff notified on WhatsApp when booked or reassigned',
        'AI daily business insight — personalised to your data',
        'Dead hours map — know your slow times, fill them',
        'Business health score — track your shop\'s fitness',
        'Customer cohort retention — 30, 60 & 90 day analysis',
        'Revenue trend chart — week & month view',
        'Top 10 products by gross profit margin',
        'Lender-ready 6-month P&L report',
        'DSCR calculator — know if you qualify for a loan',
        'Accounts receivable aging — track who owes you',
        'WhatsApp auto-reply script generator',
        'Printable QR business card (scan-to-book)',
        'Daily branded share card for WhatsApp Status',
        'Priority WhatsApp support',
      ],
      missing: [
        'Multi-branch management',
        'eTIMS / KRA compliance',
        'Dedicated account manager',
      ],
    },
    {
      id: 'enterprise', name: 'Enterprise', price: 24999, period: 'monthly',
      dailyCost: 833, color: '#c8456a', highlight: false, save: null,
      tagline: 'For multi-branch businesses scaling across Kenya',
      features: [
        'Everything in Growth',
        'Unlimited branches under one login',
        'Multi-branch sales & profit dashboard',
        'eTIMS integration — KRA-compliant receipts',
        'Multi-currency support (KES, USD, GBP, EUR)',
        'Dedicated account manager',
        'Hands-on onboarding & staff training session',
        'Custom reports built on request',
        'Priority phone & WhatsApp support (fastest SLA)',
      ],
      missing: [],
    },
  ],
  yearly: [
    {
      id: 'starter', name: 'Starter', price: 49990, period: 'yearly',
      dailyCost: 137, color: '#f7c5d0', highlight: false, save: '2 months free — save KES 9,998',
      tagline: 'Everything you need to run your shop from your phone',
      features: [
        '1 owner + 1 cashier login account',
        'Full POS — cash, M-Pesa & card payments',
        'Offline mode — sells without internet',
        'Hold & resume multiple sales at once',
        'Barcode scanner & label printing',
        'Inventory tracking & stock levels',
        'Low stock WhatsApp alerts (per-item & bulk)',
        'Expense tracking with photo receipt capture',
        'Customer profiles & loyalty points system',
        'Digital receipts sent via WhatsApp',
        'Free public shop website (shop page & catalogue)',
        'Daily, weekly & monthly sales reports',
        'Gross profit shown on every single sale',
        'Stock valuation report (for your accountant)',
        'Sales & customer CSV export',
        'Brand settings — logo, color, receipt footer',
        'PWA — installs on your phone like a native app',
        'WhatsApp support',
      ],
      missing: [
        'Appointment booking page',
        'Staff commissions & attendance',
        'AI business insights',
        'Lender-ready P&L report',
        'Multi-branch management',
      ],
    },
    {
      id: 'growth', name: 'Growth', price: 99990, period: 'yearly',
      dailyCost: 274, color: '#e6b800', highlight: true, save: '2 months free — save KES 19,998',
      tagline: 'For shops with staff, bookings and bigger ambitions',
      features: [
        'Everything in Starter',
        'Unlimited staff login accounts',
        'Staff commission calculator — % or flat per service',
        'Staff attendance clock in & clock out',
        'Staff leaderboard & monthly sales targets',
        'Payout recording with WhatsApp receipt to staff',
        'Appointment booking page — public link, no app needed',
        'Multi-service booking cart for customers',
        'Auto WhatsApp reminders sent to customers',
        'Staff notified on WhatsApp when booked or reassigned',
        'AI daily business insight — personalised to your data',
        'Dead hours map — know your slow times, fill them',
        'Business health score — track your shop\'s fitness',
        'Customer cohort retention — 30, 60 & 90 day analysis',
        'Revenue trend chart — week & month view',
        'Top 10 products by gross profit margin',
        'Lender-ready 6-month P&L report',
        'DSCR calculator — know if you qualify for a loan',
        'Accounts receivable aging — track who owes you',
        'WhatsApp auto-reply script generator',
        'Printable QR business card (scan-to-book)',
        'Daily branded share card for WhatsApp Status',
        'Priority WhatsApp support',
      ],
      missing: [
        'Multi-branch management',
        'eTIMS / KRA compliance',
        'Dedicated account manager',
      ],
    },
    {
      id: 'enterprise', name: 'Enterprise', price: 249990, period: 'yearly',
      dailyCost: 685, color: '#c8456a', highlight: false, save: '2 months free — save KES 49,998',
      tagline: 'For multi-branch businesses scaling across Kenya',
      features: [
        'Everything in Growth',
        'Unlimited branches under one login',
        'Multi-branch sales & profit dashboard',
        'eTIMS integration — KRA-compliant receipts',
        'Multi-currency support (KES, USD, GBP, EUR)',
        'Dedicated account manager',
        'Hands-on onboarding & staff training session',
        'Custom reports built on request',
        'Priority phone & WhatsApp support (fastest SLA)',
      ],
      missing: [],
    },
  ],
}

const PERIOD_LABELS = { monthly: '/ month', yearly: '/ year' }

// ── Referral credit: called silently after every successful payment ──────
// Never throws — referral credit is a bonus, never a blocker.
async function creditReferrer(referralCodeUsed) {
  if (!referralCodeUsed?.trim()) return
  try {
    const code = referralCodeUsed.trim().toUpperCase()
    console.log('[referral] searching for code:', code)
    // Find the shop that owns this referral code
    const res = await pb.collection(C.SHOPS).getList(1, 1, {
      filter: `referral_code="${code}"`,
      '$cancelKey': 'referral-credit',
    })
    console.log('[referral] search result:', res)
    if (!res.items.length) { console.log('[referral] no match, exiting'); return }
    const referrer = res.items[0]
    console.log('[referral] found referrer:', referrer.id, referrer.name)
    // Base date: use existing subscription_ends_at if it's in the future,
    // otherwise start from today (handles lapsed referrers fairly)
    const now = new Date()
    const existing = referrer.subscription_ends_at ? new Date(referrer.subscription_ends_at) : null
    const base = existing && existing > now ? existing : now
    const newEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)
    console.log('[referral] about to update with newEnd:', newEnd.toISOString())
    await pb.collection(C.SHOPS).update(referrer.id, {
      subscription_ends_at: newEnd.toISOString().replace('T', ' ').replace('Z', '.000Z'),
      subscription_status: 'active',
    })
    console.log(`Referral credit applied: ${code} → ${referrer.name} extended to ${newEnd.toDateString()}`)
  } catch (e) {
    // Silent — never surface referral errors to the paying customer
    console.error('Referral credit failed silently:', e?.message || e)
    console.error('[referral] full error object:', e)
  }
}

export default function PricingPage() {
  const navigate = useNavigate()
  const { shop } = useAuth()
  const [searchParams] = useSearchParams()
  const preselectedPlan = searchParams.get('plan') // 'starter' | 'growth' | 'enterprise' | null
  const [period, setPeriod]         = useState('monthly')
  const [loading, setLoading]       = useState(null)
  const [mpesaPlan, setMpesaPlan]   = useState(null)
  const plans = PLANS[period]
  const planRefs = useRef({})

  useEffect(() => {
    if (!preselectedPlan) return
    const el = planRefs.current[preselectedPlan]
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
    }
  }, [preselectedPlan, period])

  const openPaystack = (plan, userEmail) => {
    const handler = window.PaystackPop.setup({
      key:      PAYSTACK_KEY,
      email:    userEmail || 'customer@salestrack.app',
      amount:   plan.price * 100,
      currency: 'KES',
      ref:      `ST-${plan.id.toUpperCase()}-${Date.now()}`,
      metadata: {
        plan_id: plan.id, plan_name: plan.name, period: plan.period,
        custom_fields: [
          { display_name: 'Plan',   variable_name: 'plan',   value: plan.name },
          { display_name: 'Period', variable_name: 'period', value: plan.period },
        ],
      },
      callback: async (response) => {
        localStorage.setItem('st_plan',      plan.name)
        localStorage.setItem('st_period',    plan.period)
        localStorage.setItem('st_ref',       response.reference)
        localStorage.setItem('st_price',     plan.price)
        localStorage.setItem('st_dailycost', plan.dailyCost)
        localStorage.setItem('st_activated', 'true')
        if (shop?.id) {
          try {
            await pb.collection(C.SHOPS).update(shop.id, {
              plan: plan.id,
              subscription_status: 'active',
              last_payment_ref: response.reference,
            })
          } catch (e) {
            console.error('Failed to write plan to shop record:', e)
          }
          // Credit the referrer 1 free month if this shop used a referral code
          await creditReferrer(shop.referral_code_used)
        }
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

  const handleSelect = (plan) => setMpesaPlan(plan)

  const handleMpesaSuccess = async ({ ref, plan }) => {
    localStorage.setItem('st_plan',      plan.name)
    localStorage.setItem('st_period',    plan.period)
    localStorage.setItem('st_ref',       ref)
    localStorage.setItem('st_price',     plan.price)
    localStorage.setItem('st_dailycost', plan.dailyCost)
    localStorage.setItem('st_activated', 'true')
    if (shop?.id) {
      try {
        await pb.collection(C.SHOPS).update(shop.id, {
          plan: plan.id,
          subscription_status: 'active',
          last_payment_ref: ref,
        })
      } catch (e) {
        console.error('Failed to write plan to shop record:', e)
      }
      // Credit the referrer 1 free month if this shop used a referral code
      await creditReferrer(shop.referral_code_used)
    }
    setMpesaPlan(null)
    navigate('/payment-success')
  }

  const handlePaystack = (plan) => {
    const userEmail = localStorage.getItem('st_pending_email') || ''
    setLoading(plan.id)
    const existing = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]')
    if (existing && window.PaystackPop) { openPaystack(plan, userEmail); return }
    const script = document.createElement('script')
    script.src = 'https://js.paystack.co/v1/inline.js'
    script.onload = () => openPaystack(plan, userEmail)
    script.onerror = () => { setLoading(null); toast.error('Could not load payment gateway.') }
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
          width: [300,200,350][i], height: [300,200,350][i],
          borderRadius: '50%',
          background: ['#c8456a','#e6b800','#8b2550'][i],
          opacity: 0.05,
          top: ['0%','70%','20%'][i], left: ['60%','5%','80%'][i],
          filter: 'blur(70px)', pointerEvents: 'none',
        }} />
      ))}

      <div style={{ width: '100%', maxWidth: 780, position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#e6b800,#c8456a)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} color="#fff" />
            </div>
            <span style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontSize: 22, fontWeight: 700 }}>SalesTrack</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#e6b800', marginBottom: 10, textTransform: 'uppercase' }}>Simple Pricing</div>
          <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>
            Know your profit before you close tonight
          </h1>
          <p style={{ color: '#f7c5d066', fontSize: 14, marginBottom: 24 }}>
            7-day free trial · No credit card required
          </p>

          {/* Period toggle */}
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, padding: 4, gap: 2 }}>
            {['monthly', 'yearly'].map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                padding: '8px 28px', borderRadius: 20, border: 'none',
                background: period === p ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent',
                color: period === p ? '#fff' : '#f7c5d066',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                fontFamily: 'Nunito,sans-serif', position: 'relative',
              }}>
                {p === 'monthly' ? 'Monthly' : 'Yearly'}
                {p === 'yearly' && (
                  <span style={{ position: 'absolute', top: -8, right: -4, background: '#e6b800', color: '#1a0a0e', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                    2 MONTHS FREE
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="pricing-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 28 }}>
          {plans.map(plan => {
            const isPreselected = preselectedPlan === plan.id
            return (
            <div key={plan.id} ref={el => { planRefs.current[plan.id] = el }} style={{
              background: plan.highlight ? 'rgba(200,69,106,0.12)' : 'rgba(255,255,255,0.06)',
              border: isPreselected ? '2px solid #e6b800' : plan.highlight ? '2px solid #c8456a' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 18, padding: '24px 20px', position: 'relative',
              display: 'flex', flexDirection: 'column',
              boxShadow: isPreselected ? '0 0 0 4px rgba(230,184,0,0.18)' : 'none',
            }}>
              {isPreselected && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#e6b800,#b38f00)', color: '#1a0a0e', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 20, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(230,184,0,0.5)' }}>
                  👉 YOUR SELECTION
                </div>
              )}
              {!isPreselected && plan.highlight && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#c8456a,#8b2550)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '4px 14px', borderRadius: 20, whiteSpace: 'nowrap', boxShadow: '0 4px 12px #c8456a55' }}>
                  ⭐ MOST POPULAR
                </div>
              )}

              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: plan.highlight ? '#e6b800' : '#f7c5d077', marginBottom: 4 }}>
                {plan.name}
              </div>
              <div style={{ fontSize: 11, color: '#f7c5d055', marginBottom: 12, lineHeight: 1.4 }}>
                {plan.tagline}
              </div>

              {/* Price */}
              <div style={{ marginBottom: 2 }}>
                <span style={{ fontSize: 11, color: '#f7c5d066' }}>KES </span>
                <span style={{ fontSize: 32, fontWeight: 800, color: '#fce8ed', lineHeight: 1 }}>
                  {plan.price.toLocaleString('en-KE')}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#f7c5d055', marginBottom: 4 }}>
                {PERIOD_LABELS[period]}
              </div>

              {/* Daily cost pill */}
              <div style={{ display: 'inline-block', background: 'rgba(230,184,0,0.1)', border: '1px solid rgba(230,184,0,0.2)', borderRadius: 20, padding: '3px 10px', fontSize: 10, color: '#e6b800', fontWeight: 700, marginBottom: plan.save ? 6 : 16, alignSelf: 'flex-start' }}>
                KES {plan.dailyCost}/day
              </div>

              {plan.save && (
                <div style={{ fontSize: 11, color: '#4caf50', fontWeight: 700, marginBottom: 16 }}>
                  🎁 {plan.save}
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

              <button
                onClick={() => handleSelect(plan)}
                disabled={loading === plan.id}
                style={{
                  marginTop: 20, width: '100%', padding: '12px',
                  borderRadius: 10,
                  border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.2)',
                  background: loading === plan.id ? 'rgba(255,255,255,0.05)' : plan.highlight ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'rgba(255,255,255,0.08)',
                  color: '#fce8ed', fontWeight: 700, fontSize: 13,
                  cursor: loading === plan.id ? 'not-allowed' : 'pointer',
                  fontFamily: 'Nunito,sans-serif',
                  boxShadow: plan.highlight ? '0 6px 20px #c8456a44' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {loading === plan.id
                  ? <><div style={{ width: 14, height: 14, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Loading…</>
                  : `Start with ${plan.name} →`
                }
              </button>
            </div>
            )
          })}
        </div>

        {/* Paystack fallback */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span style={{ color: '#f7c5d033', fontSize: 12 }}>Prefer to pay by card? </span>
          {mpesaPlan && (
            <button onClick={() => { setMpesaPlan(null); handlePaystack(mpesaPlan) }} style={{ background: 'none', border: 'none', color: '#f7c5d055', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
              Pay with card instead
            </button>
          )}
        </div>

        {mpesaPlan && (
          <MpesaModal
            plan={mpesaPlan}
            onClose={() => setMpesaPlan(null)}
            onSuccess={handleMpesaSuccess}
          />
        )}

        <button
          onClick={async () => {
            console.log('Testing serverless referral credit with code: REFTEST1')
            const r = await fetch('/api/referral/credit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ referralCodeUsed: 'REFTEST1' }),
            })
            const data = await r.json()
            console.log('[referral] serverless response:', data)
            alert(JSON.stringify(data))
          }}
          style={{ display: 'block', margin: '0 auto 20px', padding: '8px 16px', background: '#444', color: '#fff', borderRadius: 8, border: 'none', cursor: 'pointer' }}
        >
          🧪 TEST: Credit Referrer (serverless)
        </button>

        <p style={{ textAlign: 'center', color: '#f7c5d033', fontSize: 12 }}>
          All plans include SSL security · Daily backups · 99.9% uptime · M-Pesa & card payments
        </p>
        <div style={{ textAlign: 'center', marginTop: 12, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: '#f7c5d044', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>← Back to login</button>
          <button onClick={() => navigate('/tutorial')} style={{ background: 'none', border: 'none', color: '#f7c5d044', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>← Back to tutorial</button>
          <button onClick={() => window.location.href='/landing.html'} style={{ background: 'none', border: 'none', color: '#f7c5d044', fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>← SalesTrack website</button>
        </div>
      </div>
    </div>
  )
}
