import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TrendingUp, Check, X } from 'lucide-react'
import toast from 'react-hot-toast'
import MpesaModal from '../components/MpesaModal'
import pb from '../lib/pb'
import { useAuth } from '../context/AuthContext'

const PAYSTACK_KEY = import.meta.env.VITE_PAYSTACK_KEY || ''

/* ═══════════════════════════════════════════════
   PLANS: defined once; monthly and yearly are derived from this.
   Prices, daily costs, savings and feature wording are unchanged.
═══════════════════════════════════════════════ */
const STARTER_FEATURES = [
  '1 owner + 1 cashier login account',
  'Full POS — cash, card & recorded M-Pesa sales',
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
]

const GROWTH_GROUPS = [
  {
    label: '👥 Staff & Payroll',
    items: [
      'Unlimited staff login accounts',
      'Staff commission calculator — % or flat per service',
      'Staff attendance clock in & clock out',
      'Staff leaderboard & monthly sales targets',
      'Payout recording with WhatsApp receipt to staff',
    ],
  },
  {
    label: '📅 Bookings & Customer Automation',
    items: [
      'Appointment booking page — public link, no app needed',
      'Multi-service booking cart for customers',
      'Auto WhatsApp reminders sent to customers',
      'Staff notified on WhatsApp when booked or reassigned',
      'Printable QR business card (scan-to-book)',
      'WhatsApp auto-reply script generator',
      'Daily branded share card for WhatsApp Status',
    ],
  },
  {
    label: '📊 Business Intelligence & Lending',
    items: [
      'Smart daily business insight — personalised to your data',
      'Dead hours map — know your slow times, fill them',
      'Business health score — track your shop\'s fitness',
      'Customer cohort retention — 30, 60 & 90 day analysis',
      'Revenue trend chart — week & month view',
      'Top 10 products by gross profit margin',
      'Lender-ready 6-month P&L report',
      'DSCR calculator — know if you qualify for a loan',
      'Accounts receivable aging — track who owes you',
    ],
  },
  { label: '💬 Support', items: ['Priority WhatsApp support'] },
]

const ENTERPRISE_GROUPS = [
  {
    label: '🏢 Multi-Branch & Compliance',
    items: [
      'Unlimited branches under one login',
      'Multi-branch sales & profit dashboard',
      'Multi-currency support (KES, USD, GBP, EUR)',
    ],
  },
  {
    label: '🤝 White-Glove Service',
    items: [
      'Dedicated account manager',
      'Hands-on onboarding & staff training session',
      'Custom reports built on request',
      'Priority phone & WhatsApp support (fastest SLA)',
    ],
  },
]

const PLAN_DEFS = [
  {
    id: 'starter', name: 'Starter', highlight: false,
    tagline: 'Everything you need to run your shop from your phone',
    intro: null,
    groups: [{ label: null, items: STARTER_FEATURES }],
    missing: ['Appointment booking page', 'Staff commissions & attendance', 'Smart business insights', 'Lender-ready P&L report', 'Multi-branch management'],
    price: { monthly: 2999, yearly: 29990 },
    dailyCost: { monthly: 100, yearly: 82 },
    save: { monthly: null, yearly: '2 months free — save KES 5,998' },
  },
  {
    id: 'growth', name: 'Growth', highlight: true,
    tagline: 'For shops with staff, bookings and bigger ambitions',
    intro: 'Everything in Starter, plus:',
    groups: GROWTH_GROUPS,
    missing: ['Multi-branch management', 'Dedicated account manager'],
    price: { monthly: 4999, yearly: 49990 },
    dailyCost: { monthly: 167, yearly: 137 },
    save: { monthly: null, yearly: '2 months free — save KES 9,998' },
  },
  {
    id: 'enterprise', name: 'Enterprise', highlight: false,
    tagline: 'For multi-branch businesses scaling across Kenya',
    intro: 'Everything in Growth, plus:',
    groups: ENTERPRISE_GROUPS,
    missing: [],
    price: { monthly: 6999, yearly: 69990 },
    dailyCost: { monthly: 233, yearly: 192 },
    save: { monthly: null, yearly: '2 months free — save KES 13,998' },
  },
]

const buildPlans = (period) => PLAN_DEFS.map(d => ({
  id: d.id, name: d.name, price: d.price[period], period,
  dailyCost: d.dailyCost[period], highlight: d.highlight, save: d.save[period],
  tagline: d.tagline, intro: d.intro, featureGroups: d.groups, missing: d.missing,
}))

const PLANS = { monthly: buildPlans('monthly'), yearly: buildPlans('yearly') }
const PERIOD_LABELS = { monthly: 'per month', yearly: 'per year' }

/* ═══════════════════════════════════════════════
   STYLE TOKENS
═══════════════════════════════════════════════ */
const T = { text: '#fce8ed', muted: '#e4bcc7', faint: '#c7a1ac', gold: '#e6b800', green: '#86efac' }

const CSS = `
@keyframes st-pricing-spin { to { transform: rotate(360deg); } }
.st-pricing .sr-only { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.st-pricing :focus-visible { outline: 2px solid #e6b800; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .st-pricing *, .st-pricing *::before, .st-pricing *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`

const navBtn = { background: 'none', border: 'none', color: T.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', padding: '10px 6px', minHeight: 44 }

/* ═══════════════════════════════════════════════
   PAYMENT (logic unchanged)
═══════════════════════════════════════════════ */
// Paid entitlement is server-authoritative. The browser only submits a
// Paystack reference; the server verifies payment, shop ownership and amount.
async function activateVerifiedPaystackPayment({ reference, plan, shopId }) {
  const authToken = pb.authStore.token
  if (!authToken) throw new Error('Your session expired. Sign in again before activating your plan.')

  const r = await fetch('/api/payments/verify-paystack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ reference, planId: plan.id, period: plan.period, shopId }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data?.ok) throw new Error(data?.error || 'Payment could not be verified securely.')
  return data
}

/* ═══════════════════════════════════════════════
   SMALL PIECES
═══════════════════════════════════════════════ */
function Feature({ text, accent }) {
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 9, fontSize: 13, lineHeight: 1.45, color: T.muted }}>
      <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', background: accent ? 'rgba(200,69,106,0.35)' : 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        <Check size={10} color={accent ? '#f08ca7' : T.muted} strokeWidth={3} />
      </span>
      {text}
    </li>
  )
}

function Missing({ text }) {
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 9, fontSize: 13, lineHeight: 1.45, color: T.faint, textDecoration: 'line-through' }}>
      <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        <X size={10} color={T.faint} strokeWidth={3} />
      </span>
      <span><span className="sr-only">Not included: </span>{text}</span>
    </li>
  )
}

/* ═══════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════ */
export default function PricingPage() {
  const navigate = useNavigate()
  const { shop } = useAuth()
  const [searchParams] = useSearchParams()
  const preselectedPlan = searchParams.get('plan') // 'starter' | 'growth' | 'enterprise' | null
  const [period, setPeriod]         = useState('monthly')
  const [loading, setLoading]       = useState(null)
  const [mpesaPlan, setMpesaPlan]   = useState(null)
  const [collapsedGroups, setCollapsedGroups] = useState({ '📊 Business Intelligence & Lending': true })

  const toggleGroup = (label) => setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }))
  const plans = PLANS[period]
  const planRefs = useRef({})

  useEffect(() => {
    if (!preselectedPlan) return
    const el = planRefs.current[preselectedPlan]
    if (!el) return
    const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
    return () => clearTimeout(t)
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
        try {
          if (!shop?.id) throw new Error('No shop is attached to this signed-in account.')
          await activateVerifiedPaystackPayment({ reference: response.reference, plan, shopId: shop.id })
          localStorage.setItem('st_plan', plan.name)
          localStorage.setItem('st_period', plan.period)
          localStorage.setItem('st_ref', response.reference)
          localStorage.setItem('st_price', plan.price)
          localStorage.setItem('st_dailycost', plan.dailyCost)
          localStorage.setItem('st_activated', 'true')
          navigate('/payment-success')
        } catch (e) {
          console.error('Secure Paystack activation failed:', e)
          toast.error(e?.message || 'Payment received, but secure activation could not be verified. Contact support with your payment reference.', { duration: 9000 })
        } finally {
          setLoading(null)
        }
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
    // STK Push is currently hidden/coming soon. Never activate paid entitlement
    // from a browser callback without server-side payment verification.
    console.info('M-Pesa payment requires secure server verification.', { ref, plan: plan?.id })
    setMpesaPlan(null)
    toast.success('Payment confirmation received. Secure account activation is pending verification.', { duration: 7000 })
  }

  const handlePaystack = (plan) => {
    // NEW guard: without a signed-in shop the payment would be taken but could not be activated.
    if (!shop?.id) {
      toast.error('Please sign in first, so we can activate your plan after payment.')
      navigate('/login')
      return
    }
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
    <div className="st-pricing" style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg,#1a0a0e 0%,#3d1020 50%,#6b1e38 100%)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '32px 16px calc(32px + env(safe-area-inset-bottom, 0px))', position: 'relative', overflow: 'hidden',
    }}>
      <style>{CSS}</style>
      {[
        { s: 300, bg: '#c8456a', top: '0%', left: '60%' },
        { s: 200, bg: '#e6b800', top: '70%', left: '5%' },
        { s: 350, bg: '#8b2550', top: '20%', left: '80%' },
      ].map((o, i) => (
        <div key={i} aria-hidden="true" style={{ position: 'absolute', width: o.s, height: o.s, borderRadius: '50%', background: o.bg, opacity: 0.05, top: o.top, left: o.left, filter: 'blur(70px)', pointerEvents: 'none' }} />
      ))}

      <main style={{ width: '100%', maxWidth: 1000, position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div aria-hidden="true" style={{ width: 40, height: 40, background: 'linear-gradient(135deg,#e6b800,#c8456a)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} color="#fff" />
            </div>
            <span style={{ fontFamily: 'Playfair Display,serif', color: T.text, fontSize: 22, fontWeight: 700 }}>SalesTrack</span>
          </div>
          <h1 style={{ fontFamily: 'Playfair Display,serif', color: T.text, fontSize: 28, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.25 }}>
            Know your profit before you close tonight
          </h1>
          <p style={{ color: T.muted, fontSize: 15, margin: '0 0 24px' }}>
            7-day free trial · No credit card required
          </p>

          {/* Period toggle */}
          <div role="group" aria-label="Billing period" style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 24, padding: 4, gap: 2 }}>
            {['monthly', 'yearly'].map(p => (
              <button key={p} type="button" onClick={() => setPeriod(p)} aria-pressed={period === p} style={{
                padding: '10px 28px', borderRadius: 20, border: 'none', minHeight: 44,
                background: period === p ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent',
                color: period === p ? '#fff' : T.muted,
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
                fontFamily: 'Nunito,sans-serif', position: 'relative',
              }}>
                {p === 'monthly' ? 'Monthly' : 'Yearly'}
                {p === 'yearly' && (
                  <span style={{ position: 'absolute', top: -10, right: -6, background: T.gold, color: '#1a0a0e', fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                    2 months free
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginBottom: 28, alignItems: 'stretch' }}>
          {plans.map(plan => {
            const isPreselected = preselectedPlan === plan.id
            const busy = loading === plan.id
            return (
              <section key={plan.id} aria-labelledby={`plan-${plan.id}`} ref={el => { planRefs.current[plan.id] = el }} style={{
                background: plan.highlight ? 'rgba(200,69,106,0.12)' : 'rgba(255,255,255,0.06)',
                border: isPreselected ? '2px solid #e6b800' : plan.highlight ? '2px solid #c8456a' : '1px solid rgba(255,255,255,0.15)',
                borderRadius: 18, padding: '28px 20px 24px', position: 'relative',
                display: 'flex', flexDirection: 'column',
                boxShadow: isPreselected ? '0 0 0 4px rgba(230,184,0,0.18)' : 'none',
              }}>
                {isPreselected && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#e6b800,#b38f00)', color: '#1a0a0e', fontSize: 12, fontWeight: 800, padding: '4px 14px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                    Your selection
                  </div>
                )}
                {!isPreselected && plan.highlight && (
                  <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#c8456a,#8b2550)', color: '#fff', fontSize: 12, fontWeight: 800, padding: '4px 14px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                    ⭐ Most popular
                  </div>
                )}

                <h2 id={`plan-${plan.id}`} style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700, color: plan.highlight ? T.gold : T.text, margin: '0 0 4px' }}>
                  {plan.name}
                </h2>
                <p style={{ fontSize: 13, color: T.muted, margin: '0 0 14px', lineHeight: 1.45 }}>{plan.tagline}</p>

                {/* Price */}
                <div style={{ marginBottom: 2 }}>
                  <span style={{ fontSize: 13, color: T.muted }}>KES </span>
                  <span style={{ fontSize: 34, fontWeight: 800, color: T.text, lineHeight: 1 }}>{plan.price.toLocaleString('en-KE')}</span>
                </div>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 6 }}>{PERIOD_LABELS[period]}</div>

                <div style={{ display: 'inline-block', background: 'rgba(230,184,0,0.1)', border: '1px solid rgba(230,184,0,0.3)', borderRadius: 20, padding: '3px 10px', fontSize: 12, color: T.gold, fontWeight: 700, marginBottom: plan.save ? 8 : 16, alignSelf: 'flex-start' }}>
                  KES {plan.dailyCost} per day
                </div>

                {plan.save && (
                  <div style={{ fontSize: 13, color: T.green, fontWeight: 700, marginBottom: 16 }}>🎁 {plan.save}</div>
                )}

                {/* Features */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 16, flex: 1 }}>
                  {plan.intro && (
                    <p style={{ fontSize: 13, fontWeight: 700, color: plan.highlight ? T.gold : T.muted, margin: '0 0 10px' }}>{plan.intro}</p>
                  )}
                  {plan.featureGroups.map((group, gi) => {
                    const collapsible = !!group.label && group.items.length > 5
                    const isCollapsed = collapsible && !!collapsedGroups[group.label]
                    const listId = `grp-${plan.id}-${gi}`
                    return (
                      <div key={gi} style={{ marginBottom: group.label ? 14 : 0 }}>
                        {group.label && (collapsible ? (
                          <button type="button" onClick={() => toggleGroup(group.label)} aria-expanded={!isCollapsed} aria-controls={listId}
                            style={{ width: '100%', background: 'none', border: 'none', padding: '6px 0', minHeight: 40, marginTop: gi > 0 ? 4 : 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'Nunito,sans-serif', textAlign: 'left' }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{group.label}</span>
                            <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>
                              {isCollapsed ? `Show ${group.items.length}` : 'Hide'}
                            </span>
                          </button>
                        ) : (
                          <h3 style={{ fontSize: 14, fontWeight: 800, color: T.text, margin: `${gi > 0 ? 4 : 0}px 0 7px` }}>{group.label}</h3>
                        ))}
                        {!isCollapsed && (
                          <ul id={listId} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {group.items.map(f => <Feature key={f} text={f} accent={plan.highlight} />)}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                  {plan.missing.length > 0 && (
                    <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
                      {plan.missing.map(f => <Missing key={f} text={f} />)}
                    </ul>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSelect(plan)}
                  disabled={busy}
                  style={{
                    marginTop: 20, width: '100%', padding: '12px', minHeight: 48,
                    borderRadius: 10,
                    border: plan.highlight ? 'none' : '1px solid rgba(255,255,255,0.25)',
                    background: busy ? 'rgba(255,255,255,0.05)' : plan.highlight ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'rgba(255,255,255,0.08)',
                    color: T.text, fontWeight: 700, fontSize: 15,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    fontFamily: 'Nunito,sans-serif',
                    boxShadow: plan.highlight ? '0 6px 20px #c8456a44' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  {busy
                    ? <><span aria-hidden="true" style={{ width: 14, height: 14, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'st-pricing-spin 0.7s linear infinite' }} /> Loading…</>
                    : `Start with ${plan.name}`}
                </button>
              </section>
            )
          })}
        </div>

        {/* Paystack fallback: only offered once a plan has been picked */}
        {mpesaPlan && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <span style={{ color: T.muted, fontSize: 13 }}>Prefer to pay by card? </span>
            <button type="button" onClick={() => { setMpesaPlan(null); handlePaystack(mpesaPlan) }} style={{ ...navBtn, textDecoration: 'underline' }}>
              Pay with card instead
            </button>
          </div>
        )}

        {mpesaPlan && (
          <MpesaModal
            plan={mpesaPlan}
            onClose={() => setMpesaPlan(null)}
            onSuccess={handleMpesaSuccess}
          />
        )}

        <p style={{ textAlign: 'center', color: T.muted, fontSize: 13, margin: 0 }}>
          All plans include digital receipts and offline selling.
        </p>
        <nav aria-label="Other pages" style={{ textAlign: 'center', marginTop: 8, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => navigate('/login')} style={navBtn}>← Back to login</button>
          <button type="button" onClick={() => navigate('/tutorial')} style={navBtn}>← Back to tutorial</button>
          <button type="button" onClick={() => { window.location.href = '/landing.html' }} style={navBtn}>← SalesTrack website</button>
        </nav>
      </main>
    </div>
  )
}
