import { useState, useEffect, useRef, useCallback } from 'react'
import { generateInsight, buildShareCardData, loadShopBaseline, recordInsightShown, loadSalesAssistant } from '../lib/insightsEngine'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate, fmtDateTime, pctChange } from '../lib/utils'
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, format } from 'date-fns'
import { TrendingUp, TrendingDown, AlertCircle, ArrowRight, CheckCircle2, Circle, Store, Package, Tag, Users, ShoppingCart, Wrench, ChevronRight, X } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const parseDateFromReceipt = (receipt_no) => {
  const m = receipt_no?.match(/-(\d{6})-/)
  if (!m) return null
  const c = m[1]
  return new Date(2000 + parseInt(c.slice(0,2)), parseInt(c.slice(2,4))-1, parseInt(c.slice(4,6)))
}

// ─── SUBSCRIPTION PAYBACK DAY ────────────────────────────────────
function SubscriptionPaybackDay({ shop, avgDailyRevenue }) {
  if (!shop || avgDailyRevenue == null || avgDailyRevenue === 0) return null

  const PLAN_COST = 10000
  const daysToPayback = Math.ceil(PLAN_COST / avgDailyRevenue)
  const paybackDate = new Date(Date.now() + daysToPayback * 86400000)
  const subStart = shop.subscription_ends_at
    ? new Date(new Date(shop.subscription_ends_at).getTime() - 30 * 86400000)
    : new Date(shop.created || Date.now())
  const daysSincePayment = Math.floor((new Date() - subStart) / 86400000)
  const alreadyPaidBack = daysSincePayment >= daysToPayback
  const paybackDateLabel = paybackDate.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{
      background: alreadyPaidBack ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : 'linear-gradient(135deg,#fdf5f7,#fff9fb)',
      border: `1.5px solid ${alreadyPaidBack ? '#bbf7d0' : '#f0e4e8'}`,
      borderRadius: 14, padding: '14px 20px', marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 28, flexShrink: 0 }}>{alreadyPaidBack ? '✅' : '💰'}</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        {alreadyPaidBack ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>Running on pure profit since {paybackDateLabel}</div>
            <div style={{ fontSize: 11, color: '#34d399', marginTop: 2 }}>Your KES 10,000 subscription paid itself back — everything from here is yours.</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#8b2550' }}>
              💡 Subscription paid back in <span style={{ color: '#c8456a' }}>{daysToPayback} day{daysToPayback !== 1 ? 's' : ''}</span> — on {paybackDateLabel}
            </div>
            <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>
              At your {shop.currency || 'KES'} {Math.round(avgDailyRevenue).toLocaleString('en-KE')} daily average, SalesTrack costs you less than one sale.
            </div>
          </>
        )}
      </div>
      <div style={{
        background: alreadyPaidBack ? '#059669' : '#c8456a',
        color: '#fff', borderRadius: 10, padding: '6px 14px',
        fontSize: 11, fontWeight: 800, flexShrink: 0,
      }}>
        {alreadyPaidBack ? 'Profit Mode 🚀' : `Day ${Math.min(daysSincePayment + 1, daysToPayback)} of ${daysToPayback}`}
      </div>
    </div>
  )
}

// ─── RENEWAL REGRET PREVENTER ─────────────────────────────────────
function RenewalRegretCard({ shop, stats, onClick }) {
  if (!shop || !stats) return null
  const now = new Date()
  const expiryDate = shop.subscription_ends_at
    ? new Date(shop.subscription_ends_at)
    : shop.trial_ends_at
    ? new Date(shop.trial_ends_at)
    : null
  if (!expiryDate) return null
  const hoursLeft = (expiryDate - now) / 3600000
  if (hoursLeft > 72 || hoursLeft < 0) return null
  const daysLeft = Math.max(0, Math.ceil(hoursLeft / 24))

  return (
    <div onClick={onClick} style={{
      background: 'linear-gradient(135deg,#fff1f2,#fff)',
      border: '2px solid #fca5a5', borderRadius: 14, padding: '16px 20px',
      marginBottom: 20, cursor: 'pointer', boxShadow: '0 4px 20px rgba(220,38,38,0.12)',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 30, flexShrink: 0 }}>⏰</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626' }}>
          {daysLeft === 0 ? 'Expires today' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`} — renew to protect your data
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>
          In the last 30 days you recorded <strong style={{ color: '#1a1a1f' }}>
            KES {(stats.revenue || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
          </strong> in sales. Without SalesTrack, that's <strong style={{ color: '#dc2626' }}>gone</strong>.
        </div>
      </div>
      <div style={{
        background: 'linear-gradient(135deg,#dc2626,#991b1b)',
        color: '#fff', borderRadius: 10, padding: '8px 18px',
        fontSize: 12, fontWeight: 800, flexShrink: 0,
        boxShadow: '0 4px 14px rgba(220,38,38,0.35)',
      }}>
        Renew via M-Pesa →
      </div>
    </div>
  )
}

// ─── EMAIL VERIFICATION BANNER ───────────────────────────────────
function EmailVerificationBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [sending, setSending] = useState(false)
  const model = pb.authStore.model
  if (dismissed || model?.verified) return null
  const resend = async () => {
    setSending(true)
    try {
      await pb.collection(C.ADMINS).requestVerification(model.email)
      toast.success('Verification email sent! Check your inbox.')
    } catch { toast.error('Could not send email — try again shortly') }
    finally { setSending(false) }
  }
  return (
    <div style={{
      background: '#fffbeb', border: '1px solid #fde68a',
      borderRadius: 12, padding: '12px 16px', marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 18 }}>📧</span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>Verify your email address</div>
        <div style={{ fontSize: 12, color: '#b45309', marginTop: 2 }}>
          Enables password recovery. Check <strong>{model?.email}</strong> for the link.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={resend} disabled={sending} style={{
          padding: '6px 14px', borderRadius: 8, border: 'none',
          background: '#f59e0b', color: '#fff', fontWeight: 700,
          fontSize: 12, cursor: sending ? 'not-allowed' : 'pointer',
          fontFamily: 'Nunito,sans-serif', opacity: sending ? 0.7 : 1,
        }}>
          {sending ? 'Sending…' : 'Resend email'}
        </button>
        <button onClick={() => setDismissed(true)} style={{
          padding: '6px 10px', borderRadius: 8, border: '1px solid #fde68a',
          background: 'transparent', color: '#92400e', fontWeight: 700,
          fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif',
        }}>✕</button>
      </div>
    </div>
  )
}

// ─── DEAD HOURS MAP ──────────────────────────────────────────────
function DeadHoursMap({ hourData, shop }) {
  if (!hourData || hourData.length === 0) return null
  const max = Math.max(...hourData.map(h => h.count), 1)
  const deadHours = [...hourData].sort((a, b) => a.count - b.count).slice(0, 3)
  const deadStart = deadHours.reduce((min, h) => h.hour < min ? h.hour : min, deadHours[0]?.hour ?? 0)
  const fmt = h => `${String(h).padStart(2,'00')}:00`

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', margin: 0 }}>🕐 Shop Traffic by Hour</h3>
        <span style={{ fontSize: 10, color: '#9b6070', background: '#fdf5f7', padding: '3px 8px', borderRadius: 20, border: '1px solid #f0e4e8' }}>All-time</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24,1fr)', gap: 2, marginBottom: 6 }}>
        {hourData.map(({ hour, count }) => {
          const intensity = count / max
          const bg = intensity === 0 ? '#f5edf0' : `rgba(200,69,106,${0.12 + intensity * 0.88})`
          const isDead = deadHours.some(d => d.hour === hour)
          return (
            <div key={hour} title={`${fmt(hour)}: ${count} sale${count !== 1 ? 's' : ''}`} style={{
              height: 28, borderRadius: 4, background: bg,
              border: isDead ? '1.5px solid #fbbf24' : '1px solid transparent',
              cursor: 'default',
            }} />
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24,1fr)', gap: 2, marginBottom: 12 }}>
        {hourData.map(({ hour }) => (
          <div key={hour} style={{ fontSize: 7, color: '#c8b0b8', textAlign: 'center' }}>
            {hour % 4 === 0 ? String(hour).padStart(2,'0') : ''}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          {[0.08, 0.25, 0.5, 0.75, 1].map((op, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(200,69,106,${op})` }} />
          ))}
          <span style={{ fontSize: 10, color: '#9b6070', marginLeft: 4 }}>Low → Peak</span>
        </div>
        <div style={{ fontSize: 10, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 10, height: 10, border: '1.5px solid #fbbf24', borderRadius: 2, display: 'inline-block' }} />
          Quietest hours
        </div>
      </div>
      {deadHours[0]?.count < max * 0.15 ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>💡 Your shop goes quiet around {fmt(deadStart)}</div>
          <div style={{ fontSize: 11, color: '#b45309', marginTop: 3, lineHeight: 1.5 }}>
            Send a WhatsApp flash promo at {fmt(Math.max(0, deadStart - 1))} to fill those slow hours. Dead time = paid rent with zero sales.
          </div>
          {shop?.phone && (
            <a
              href={'https://wa.me/' + shop.phone.replace(/[^0-9]/g, '') + '?text=' + encodeURIComponent(
                '📢 *Flash Offer — ' + fmt(deadStart) + ' Special!*\n\n' +
                'We have slots open right now at ' + (shop.name || 'our shop') + '!\n\n' +
                '✨ Walk in this hour and get priority service — no waiting.\n\n' +
                'Limited spots — first come, first served! 🏃‍♀️💨\n\n' +
                '_' + (shop.name || 'Us') + ' · Powered by SalesTrack_'
              )}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '8px 16px', borderRadius: 10, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}
            >
              📢 Post Flash Promo on WhatsApp
            </a>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#9b6070', textAlign: 'center', padding: '6px 0' }}>
          📈 Great spread — your shop stays busy across the day.
        </div>
      )}
    </div>
  )
}

// ─── BUSINESS HEALTH SCORE ───────────────────────────────────────
function BusinessHealthScore({ stats, shop }) {
  if (!stats) return null

  let score = 0
  const breakdown = []

  const revTrend = stats.prevRevenue > 0
    ? ((stats.revenue - stats.prevRevenue) / stats.prevRevenue) * 100
    : stats.revenue > 0 ? 20 : 0
  const revScore = Math.min(25, Math.max(0, 12.5 + revTrend * 0.5))
  score += revScore
  breakdown.push({ label: 'Revenue trend', score: revScore, max: 25, good: revTrend >= 0 })

  const margin = stats.revenue > 0 ? (stats.grossProfit / stats.revenue) * 100 : 0
  const marginScore = Math.min(25, Math.max(0, (margin / 40) * 25))
  score += marginScore
  breakdown.push({ label: 'Gross margin', score: marginScore, max: 25, good: margin >= 30, detail: `${margin.toFixed(0)}%` })

  const expRatio = stats.revenue > 0 ? (stats.totalExpenses / stats.revenue) * 100 : 0
  const expScore = Math.min(20, Math.max(0, 20 - (expRatio / 30) * 20))
  score += expScore
  breakdown.push({ label: 'Expense control', score: expScore, max: 20, good: expRatio < 30, detail: `${expRatio.toFixed(0)}% of rev` })

  const volScore = Math.min(15, (stats.salesCount / 20) * 15)
  score += volScore
  breakdown.push({ label: 'Sales volume', score: volScore, max: 15, good: stats.salesCount >= 10 })

  const stockScore = Math.max(0, 15 - (stats.lowStockCount * 3))
  score += stockScore
  breakdown.push({ label: 'Stock health', score: stockScore, max: 15, good: stats.lowStockCount === 0, detail: stats.lowStockCount > 0 ? `${stats.lowStockCount} low` : 'All good' })

  const finalScore = Math.round(score)
  const verdict = finalScore >= 85
    ? { text: 'Excellent — firing on all cylinders.', color: '#059669', emoji: '🚀' }
    : finalScore >= 70
    ? { text: 'Healthy — small tweaks to reach excellent.', color: '#0284c7', emoji: '💪' }
    : finalScore >= 50
    ? { text: 'Steady — focus on margins and stock.', color: '#d97706', emoji: '📈' }
    : { text: 'Needs attention — review expenses.', color: '#dc2626', emoji: '⚠️' }
  const scoreColor = finalScore >= 85 ? '#059669' : finalScore >= 70 ? '#0284c7' : finalScore >= 50 ? '#d97706' : '#dc2626'

  const shareScore = () => {
    const phone = shop?.phone?.replace(/[^0-9]/g, '')
    if (!phone) { toast.error('Add your phone number in Settings first'); return }
    const msg = [
      `📊 *${shop?.name} — Business Health*`,
      `Score: *${finalScore}/100* ${verdict.emoji}`,
      verdict.text,
      '',
      breakdown.map(b => `• ${b.label}: ${b.score.toFixed(0)}/${b.max}${b.detail ? ` (${b.detail})` : ''}`).join('\n'),
      '',
      '_Powered by SalesTrack_'
    ].join('\n')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', margin: 0 }}>Business Health</h3>
        {shop?.phone && (
          <button onClick={shareScore} style={{
            padding: '4px 10px', borderRadius: 8, border: 'none',
            background: '#25D366', color: '#fff', fontSize: 10,
            fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito,sans-serif',
          }}>📲 Share</button>
        )}
      </div>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 52, fontWeight: 900, color: scoreColor, fontFamily: 'Playfair Display,serif', lineHeight: 1 }}>{finalScore}</div>
        <div style={{ fontSize: 13, color: '#9b6070', marginTop: 2 }}>out of 100</div>
        <div style={{ height: 6, background: '#f5edf0', borderRadius: 6, margin: '10px 0 8px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${finalScore}%`, background: `linear-gradient(90deg,${scoreColor},${scoreColor}88)`, borderRadius: 6, transition: 'width 1s ease' }} />
        </div>
        <div style={{ fontSize: 12, color: verdict.color, fontWeight: 700 }}>{verdict.emoji} {verdict.text}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {breakdown.map((b, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 10, color: b.good ? '#059669' : '#d97706', width: 8, flexShrink: 0 }}>{b.good ? '●' : '○'}</div>
            <div style={{ fontSize: 11, color: '#6b4050', flex: 1 }}>
              {b.label}{b.detail ? <span style={{ color: '#9b6070' }}> · {b.detail}</span> : ''}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3d1020' }}>{b.score.toFixed(0)}/{b.max}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── SHOP SETUP WIZARD ───────────────────────────────────────────
function ShopSetupWizard() {
  const { admin, completeShopSetup } = useAuth()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', address: '', email: '', currency: 'KES', tax_rate: 16 })

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Shop name is required'); return }
    setSaving(true)
    try {
      const slug = form.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now()
      const newShop = await pb.collection(C.SHOPS).create({ ...form, slug, is_active: true })
      await pb.collection(C.SHOP_ADMINS).create({ shop_id: newShop.id, admin_id: admin.id, role: 'owner' })
      toast.success(`Welcome to ${newShop.name}! 🎉`)
      completeShopSetup(newShop)
    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Failed to create shop')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 72, height: 72, background: 'linear-gradient(135deg,#e6b800,#c8456a)', borderRadius: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 28px #c8456a44', marginBottom: 16 }}>
            <Store size={34} color="#fff" />
          </div>
          <h1 style={{ fontFamily: 'Playfair Display,serif', fontSize: 28, color: '#3d1020', margin: '0 0 8px' }}>Set up your shop 🏪</h1>
          <p style={{ color: '#9b6070', fontSize: 14, margin: 0 }}>Welcome, {admin?.name?.split(' ')[0]}! Let's get your business set up in 60 seconds.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {[1,2].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: step >= s ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#f5edf0', color: step >= s ? '#fff' : '#9b6070', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{s}</div>
              {s < 2 && <div style={{ width: 40, height: 2, background: step > s ? '#c8456a' : '#f5edf0', borderRadius: 2 }} />}
            </div>
          ))}
        </div>
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #f0e4e8', boxShadow: '0 8px 32px rgba(200,69,106,0.08)', padding: '32px 36px' }}>
          <form onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2) } : handleCreate}>
            {step === 1 && (
              <>
                <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 20px' }}>Basic information</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div><label className="label">Business / Shop Name *</label><input className="input" required placeholder="e.g. Glam Studio Nairobi" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><label className="label">Phone Number</label><input className="input" placeholder="+254 7xx xxx xxx" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div><label className="label">Business Email</label><input className="input" type="email" placeholder="business@email.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><label className="label">Physical Address</label><input className="input" placeholder="e.g. Westlands, Nairobi" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 20px' }}>Financial settings</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="label">Currency</label>
                    <select className="input" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                      <option value="KES">KES — Kenyan Shilling</option>
                      <option value="USD">USD — US Dollar</option>
                      <option value="GBP">GBP — British Pound</option>
                      <option value="EUR">EUR — Euro</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">VAT / Tax Rate (%)</label>
                    <input className="input" type="number" min={0} max={100} step={0.5} value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) }))} placeholder="16 for standard Kenya VAT" />
                    <div style={{ fontSize: 11, color: '#9b6070', marginTop: 4 }}>Standard Kenya VAT is 16%. Set to 0 if not VAT-registered.</div>
                  </div>
                  <div style={{ background: '#fdf5f7', border: '1px solid #f0e4e8', borderRadius: 12, padding: '14px 16px', marginTop: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#8b2550', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your shop summary</div>
                    <div style={{ fontSize: 13, color: '#6b4050', lineHeight: 1.8 }}>
                      🏪 <strong>{form.name || 'Your Shop'}</strong><br />
                      {form.phone && <>📞 {form.phone}<br /></>}
                      {form.address && <>📍 {form.address}<br /></>}
                      💰 {form.currency} · {form.tax_rate}% VAT
                    </div>
                  </div>
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              {step === 2 && (
                <button type="button" onClick={() => setStep(1)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #f0e4e8', background: '#fff', color: '#8b2550', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>← Back</button>
              )}
              <button type="submit" disabled={saving} style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: saving ? '#6b1e38' : 'linear-gradient(135deg,#c8456a,#8b2550)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Nunito,sans-serif', boxShadow: '0 4px 16px #c8456a44', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {saving ? <><div style={{ width: 16, height: 16, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Creating…</> : step === 1 ? 'Continue →' : '🎉 Create My Shop'}
              </button>
            </div>
          </form>
        </div>
        <p style={{ textAlign: 'center', color: '#9b6070', fontSize: 12, marginTop: 16 }}>You can update all these details anytime in Settings ⚙️</p>
      </div>
    </div>
  )
}

// ─── ONBOARDING CHECKLIST ────────────────────────────────────────
function OnboardingChecklist({ shop, onDismiss }) {
  const navigate = useNavigate()
  const [checks, setChecks] = useState({ shop: true, category: false, product: false, staff: false, sale: false })
  const [loadingChecks, setLoadingChecks] = useState(true)

  useEffect(() => { if (shop) checkProgress() }, [shop])

  const checkProgress = async () => {
    setLoadingChecks(true)
    try {
      const [cats, prods, staff, sales] = await Promise.all([
        pb.collection(C.CATEGORIES).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'ob-cats' }),
        pb.collection(C.PRODUCTS).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'ob-prods' }),
        pb.collection(C.STAFF).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'ob-staff' }),
        pb.collection(C.SALES).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'ob-sales' }),
      ])
      const next = { shop: true, category: cats.totalItems > 0, product: prods.totalItems > 0, staff: staff.totalItems > 0, sale: sales.totalItems > 0 }
      setChecks(prev => {
        const keys = ['category','product','staff','sale']
        keys.forEach(k => {
          if (!prev[k] && next[k]) {
            const labels = { category: 'Category added', product: 'First product live', staff: 'Staff member added', sale: 'First sale made' }
            const doneCount = Object.values(next).filter(Boolean).length
            toast.success(`🎉 ${labels[k]}! ${doneCount}/5 setup steps complete.`, { duration: 4000 })
          }
        })
        return next
      })
    } catch {}
    finally { setLoadingChecks(false) }
  }

  const steps = [
    { key: 'shop',     icon: Store,        label: 'Create your shop',       desc: 'Shop profile set up',               action: null },
    { key: 'category', icon: Tag,          label: 'Add a product category', desc: 'e.g. Hair, Nails, Skincare',        action: () => navigate('/app/products') },
    { key: 'product',  icon: Package,      label: 'Add your first product', desc: 'Add products with price and stock', action: () => navigate('/app/products') },
    { key: 'staff',    icon: Users,        label: 'Add a staff member',     desc: 'Set up your team and commissions',  action: () => navigate('/app/staff') },
    { key: 'sale',     icon: ShoppingCart, label: 'Make your first sale',   desc: 'Complete a sale on the POS',        action: () => navigate('/app/pos') },
  ]

  const completed = Object.values(checks).filter(Boolean).length
  const pct = Math.round((completed / steps.length) * 100)
  if (completed === steps.length) return null

  return (
    <div style={{ background: 'linear-gradient(135deg,#fff9fb,#fff)', border: '1.5px solid #f0e4e8', borderRadius: 16, padding: '20px 24px', marginBottom: 24, position: 'relative', boxShadow: '0 4px 20px rgba(200,69,106,0.06)' }}>
      <button onClick={onDismiss} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#c8b0b8', padding: 4 }}><X size={16} /></button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', fontWeight: 700 }}>🚀 Set up your shop — {pct}% done</div>
          <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{completed} of {steps.length} steps complete · Takes about 5 minutes</div>
        </div>
      </div>
      <div style={{ height: 6, background: '#f5edf0', borderRadius: 6, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#c8456a,#e6b800)', borderRadius: 6, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map(({ key, icon: Icon, label, desc, action }) => {
          const done = checks[key]
          return (
            <div key={key} onClick={!done && action ? action : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: done ? '#f0fdf4' : '#fdf5f7', border: `1px solid ${done ? '#bbf7d0' : '#f5e4ea'}`, cursor: !done && action ? 'pointer' : 'default', opacity: loadingChecks ? 0.6 : 1 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: done ? '#dcfce7' : 'rgba(200,69,106,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={done ? '#059669' : '#c8456a'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: done ? '#059669' : '#3d1020', textDecoration: done ? 'line-through' : 'none' }}>{label}</div>
                <div style={{ fontSize: 11, color: '#9b6070', marginTop: 1 }}>{desc}</div>
              </div>
              {done ? <CheckCircle2 size={18} color="#059669" /> : action ? <ChevronRight size={16} color="#c8456a" /> : <Circle size={18} color="#d4a0b0" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── TOMORROWS APPOINTMENTS BANNER ───────────────────────────────
function TomorrowsBanner({ shop, onViewAppointments }) {
  const [tomorrowCount, setTomorrowCount] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!shop) return
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().split('T')[0]
    pb.collection(C.APPOINTMENTS).getList(1, 200, {
      filter: `shop_id="${shop.id}" && appt_date="${dateStr}" && status!="cancelled"`,
      '$autoCancel': false,
      '$cancelKey': 'tomorrow-banner',
    }).then(r => setTomorrowCount(r.totalItems)).catch(() => {})
  }, [shop])

  if (dismissed || tomorrowCount === 0) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
      border: '1.5px solid #93c5fd',
      borderRadius: 14, padding: '14px 20px', marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <div style={{ fontSize: 26, flexShrink: 0 }}>📅</div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8' }}>
          You have {tomorrowCount} appointment{tomorrowCount !== 1 ? 's' : ''} tomorrow
        </div>
        <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>
          Send reminders now so customers don't forget — one tap per customer.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={onViewAppointments} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
          📲 Send Reminders →
        </button>
        <button onClick={() => setDismissed(true)} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #93c5fd', background: 'transparent', color: '#3b82f6', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>✕</button>
      </div>
    </div>
  )
}

// ─── AI INSIGHT WIDGET ───────────────────────────────────────────
function AIInsightWidget({ stats, hourData, shop, period, memory, onRecord }) {
  const [insight, setInsight] = useState(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!stats || !shop) return
    const result = generateInsight({ stats, hourData, shop, period, memory })
    setInsight(result)
    if (result && onRecord) onRecord(result)
  }, [stats, hourData, shop, period, memory])

  if (!insight || !visible) return null

  const colors = {
    positive: { bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '#86efac', title: '#065f46', body: '#047857', badge: '#059669', badgeTxt: '#fff' },
    warning:  { bg: 'linear-gradient(135deg,#fff7ed,#ffedd5)', border: '#fdba74', title: '#9a3412', body: '#c2410c', badge: '#ea580c', badgeTxt: '#fff' },
    tip:      { bg: 'linear-gradient(135deg,#fdf5f7,#fff9fb)', border: '#f0e4e8', title: '#8b2550', body: '#6b4050', badge: '#c8456a', badgeTxt: '#fff' },
  }
  const c = colors[insight.type] || colors.tip

  return (
    <div style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      <div style={{ fontSize: 26, flexShrink: 0, marginTop: 2 }}>{insight.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: c.title }}>{insight.title}</span>
          <span style={{ fontSize: 10, background: c.badge, color: c.badgeTxt, padding: '2px 8px', borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>Smart Insight</span>
        </div>
        <div style={{ fontSize: 12, color: c.body, lineHeight: 1.6 }}>{insight.body}</div>
      </div>
      <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.body, padding: '0 0 0 4px', flexShrink: 0, fontSize: 14, opacity: 0.6 }}>✕</button>
    </div>
  )
}

// ─── SALES ASSISTANT WIDGET ──────────────────────────────────────
function SalesAssistantWidget({ shop, assistantData }) {
  if (!assistantData || !assistantData.lapsedCustomers?.length) return null
  const { lapsedCustomers } = assistantData

  return (
    <div style={{ background: 'linear-gradient(135deg,#fdf5f7,#fff)', border: '1.5px solid #f0e4e8', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#8b2550', marginBottom: 10 }}>
        🤝 Sales Assistant — {lapsedCustomers.length} customer{lapsedCustomers.length !== 1 ? 's' : ''} haven't visited in 14+ days
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lapsedCustomers.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', borderRadius: 10, border: '1px solid #f5edf0' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1f' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: '#9b6070' }}>
                KES {(c.totalSpent || 0).toLocaleString('en-KE')} lifetime · {c.daysSince != null ? `${c.daysSince} days since last visit` : 'no visit recorded'}
              </div>
            </div>
            {c.phone && (
              <button
                onClick={() => {
                  const msg = `Hi ${c.name}! 👋 We miss you at ${shop?.name}. It's been a while since your last visit — come in this week and enjoy a special welcome-back offer just for you! 💄✨\n\n_${shop?.name} · Powered by SalesTrack_`
                  window.open(`https://wa.me/${c.phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
                }}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
              >
                📲 Re-engage
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── DAILY SHARE CARD ────────────────────────────────────────────
function roundRectFill(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

function DailyShareCard({ stats, shop, period }) {
  const canvasRef = useRef(null)
  const [sharing, setSharing] = useState(false)
  const [preview, setPreview] = useState(false)

  const drawCard = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !stats) return null
    const ctx = canvas.getContext('2d')
    const W = 800, H = 800
    canvas.width = W; canvas.height = H

    const cardData = buildShareCardData({ stats, shop, period })
    const fmt = (n) => `${cardData.currency} ${Math.round(n).toLocaleString('en-KE')}`

    const bg = ctx.createLinearGradient(0, 0, W, H)
    bg.addColorStop(0, '#3d1020')
    bg.addColorStop(0.5, '#8b2550')
    bg.addColorStop(1, '#c8456a')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    ctx.globalAlpha = 0.08
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(W - 80, 80, 180, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(80, H - 80, 140, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1

    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '500 26px Nunito, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(cardData.date, W / 2, 70)

    ctx.fillStyle = '#fff'
    ctx.font = 'bold 52px Nunito, Arial, sans-serif'
    ctx.fillText(cardData.shopName, W / 2, 140)

    const badgeW = 200, badgeH = 40, badgeX = W / 2 - badgeW / 2, badgeY = 160
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    roundRectFill(ctx, badgeX, badgeY, badgeW, badgeH, 20)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = '600 20px Nunito, Arial, sans-serif'
    ctx.fillText(cardData.periodLabel, W / 2, badgeY + 27)

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(60, 230); ctx.lineTo(W - 60, 230); ctx.stroke()

    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '500 22px Nunito, Arial, sans-serif'
    ctx.fillText('REVENUE', W / 2, 290)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 80px Nunito, Arial, sans-serif'
    ctx.fillText(fmt(cardData.revenue), W / 2, 380)

    const cols = [
      { label: 'GROSS PROFIT', value: fmt(cardData.grossProfit), color: '#86efac' },
      { label: 'NET PROFIT',   value: fmt(cardData.netProfit),   color: cardData.netPositive ? '#6ee7b7' : '#fca5a5' },
      { label: 'TRANSACTIONS', value: String(cardData.transactions), color: '#93c5fd' },
    ]
    const colW = W / 3
    cols.forEach((col, i) => {
      const cx = colW * i + colW / 2
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.font = '500 17px Nunito, Arial, sans-serif'
      ctx.fillText(col.label, cx, 460)
      ctx.fillStyle = col.color
      ctx.font = 'bold 34px Nunito, Arial, sans-serif'
      ctx.fillText(col.value, cx, 510)
    })

    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    roundRectFill(ctx, W / 2 - 140, 545, 280, 56, 28)
    ctx.fillStyle = '#fde68a'
    ctx.font = 'bold 28px Nunito, Arial, sans-serif'
    ctx.fillText(`📈 ${cardData.margin}% Gross Margin`, W / 2, 582)

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.beginPath(); ctx.moveTo(60, 630); ctx.lineTo(W - 60, 630); ctx.stroke()

    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '500 20px Nunito, Arial, sans-serif'
    ctx.fillText('Powered by SalesTrack · Run your business from your phone', W / 2, 680)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = 'bold 18px Nunito, Arial, sans-serif'
    ctx.fillText('salestrack.co.ke', W / 2, 720)

    return canvas
  }, [stats, shop, period])

  const handleShare = async () => {
    setSharing(true)
    try {
      const canvas = drawCard()
      if (!canvas) { toast.error('No data to share yet'); setSharing(false); return }
      canvas.toBlob(async (blob) => {
        try {
          const file = new File([blob], 'daily-summary.png', { type: 'image/png' })
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: `${shop?.name} — Daily Summary` })
          } else {
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `${(shop?.name || 'summary').replace(/\s+/g,'-')}-${new Date().toISOString().slice(0,10)}.png`
            a.click(); URL.revokeObjectURL(url)
            toast.success('Image downloaded — share it to WhatsApp Status! 📲', { duration: 5000 })
          }
        } catch (err) {
          if (err?.name !== 'AbortError') toast.error('Could not share — image downloaded instead')
        } finally { setSharing(false) }
      }, 'image/png')
    } catch { setSharing(false) }
  }

  const handlePreview = () => {
    setPreview(true)
    setTimeout(drawCard, 50)
  }

  if (!stats) return null

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <div style={{ background: 'linear-gradient(135deg,#3d1020,#8b2550)', borderRadius: 14, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 26 }}>📊</div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Daily Summary Card</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>Branded image — share to WhatsApp Status in one tap</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <button onClick={handlePreview} style={{ padding: '7px 14px', borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>👁 Preview</button>
          <button onClick={handleShare} disabled={sharing} style={{ padding: '7px 16px', borderRadius: 10, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 12, cursor: sharing ? 'not-allowed' : 'pointer', fontFamily: 'Nunito,sans-serif', opacity: sharing ? 0.7 : 1 }}>{sharing ? 'Preparing…' : '📲 Share to WhatsApp'}</button>
        </div>
      </div>

      {preview && (
        <div onClick={() => setPreview(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'relative', maxWidth: 400, width: '100%' }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', borderRadius: 16, display: 'block' }} />
            <button onClick={() => setPreview(false)} style={{ position: 'absolute', top: -12, right: -12, width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#fff', color: '#3d1020', fontWeight: 900, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            <button onClick={() => { setPreview(false); handleShare() }} style={{ display: 'block', width: '100%', marginTop: 12, padding: '12px', borderRadius: 12, border: 'none', background: '#25D366', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>📲 Share this to WhatsApp Status</button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────────
export default function DashboardPage() {
  const { shop, needsShop, role } = useAuth()
  const isCashier = role === 'cashier'
  const isViewer  = role === 'viewer'
  const isLimited = isCashier || isViewer
  const navigate = useNavigate()

  useEffect(() => {
    if (role === 'cashier') {
      navigate('/app/pos', { replace: true })
    }
  }, [role])

  const [stats, setStats]             = useState(null)
  const [salesChart, setSalesChart]   = useState([])
  const [recentSales, setRecentSales] = useState([])
  const [lowStock, setLowStock]       = useState([])
  const [birthdayCustomers, setBirthdayCustomers] = useState([])
  const [loading, setLoading]         = useState(true)
  const [period, setPeriod]           = useState('today')
  const [showChecklist, setShowChecklist] = useState(true)
  const [avgDailyRevenue, setAvgDailyRevenue] = useState(null)
  const [hourData, setHourData]       = useState([])
  const [insightMemory, setInsightMemory] = useState(null)
  const [assistantData, setAssistantData] = useState(null)

  useEffect(() => { if (shop) loadAll() }, [shop, period])

  const getPeriodRange = () => {
    const now = new Date()
    if (period === 'today') return { from: startOfDay(now), to: endOfDay(now) }
    if (period === 'month') return { from: startOfMonth(now), to: endOfMonth(now) }
    return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) }
  }

  const filterByReceiptDate = (items, from, to) =>
    items.filter(x => {
      const d = parseDateFromReceipt(x.receipt_no)
      if (!d) return false
      return d >= startOfDay(from) && d <= endOfDay(to)
    })

  const loadAll = async () => {
    setLoading(true)
    try {
      const { from, to } = getPeriodRange()
      const prevFrom = subDays(from, period === 'today' ? 1 : 30)
      const prevTo   = subDays(to,   period === 'today' ? 1 : 30)

      const currentUserId = pb.authStore.model?.id
      const salesFilter = isCashier
        ? `shop_id="${shop.id}" && status="completed" && served_by="${currentUserId}"`
        : `shop_id="${shop.id}" && status="completed"`

      const [sales, prevSales, expenses, products, customers, recent] = await Promise.all([
        pb.collection(C.SALES).getList(1, 500, { filter: salesFilter, '$autoCancel': false, '$cancelKey': 'dash-sales' })
          .then(r => filterByReceiptDate(r.items, from, to)),
        pb.collection(C.SALES).getList(1, 500, { filter: salesFilter, '$autoCancel': false, '$cancelKey': 'dash-prev' })
          .then(r => filterByReceiptDate(r.items, prevFrom, prevTo)),
        pb.collection(C.EXPENSES).getList(1, 500, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'dash-exp' })
          .then(r => r.items.filter(x => {
            const d = x.expense_date?.slice(0,10)
            return d && d >= from.toISOString().slice(0,10) && d <= to.toISOString().slice(0,10)
          })),
        pb.collection(C.PRODUCTS).getList(1, 500, { filter: `shop_id="${shop.id}" && status="active" && track_inventory=true`, '$autoCancel': false, '$cancelKey': 'dash-prod' })
          .then(r => r.items),
        pb.collection(C.CUSTOMERS).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'dash-custs' }),
        pb.collection(C.SALES).getList(1, 8, { filter: `shop_id="${shop.id}" && status="completed"`, expand: 'customer_id', '$autoCancel': false, '$cancelKey': 'dash-recent' }),
      ])

      const revenue       = sales.reduce((s, x) => s + (x.total_kes || 0), 0)
      const grossProfit   = sales.reduce((s, x) => s + (x.gross_profit_kes || 0), 0)
      const totalExpenses = expenses.reduce((s, x) => s + (x.amount_kes || 0), 0)
      const prevRevenue   = prevSales.reduce((s, x) => s + (x.total_kes || 0), 0)
      const netProfit     = grossProfit - totalExpenses
      const lowStockProds = products.filter(p => p.stock_qty !== null && p.stock_qty <= (p.reorder_point || 5))

      setStats({ revenue, grossProfit, totalExpenses, netProfit, salesCount: sales.length, prevRevenue, totalCustomers: customers.totalItems, lowStockCount: lowStockProds.length, avgOrderValue: sales.length ? revenue / sales.length : 0 })
      setLowStock(lowStockProds.slice(0, 5))
      setRecentSales(recent.items)

      // Birthday tracker
      try {
        const allCusts = await pb.collection(C.CUSTOMERS).getList(1, 500, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'bday' }).then(r => r.items)
        const today = new Date()
        const upcoming = allCusts.filter(c => {
          if (!c.birthday) return false
          const b = new Date(c.birthday)
          const next = new Date(today.getFullYear(), b.getMonth(), b.getDate())
          if (next < today) next.setFullYear(today.getFullYear() + 1)
          c._daysLeft = Math.ceil((next - today) / 86400000)
          if (c._daysLeft === 365) c._daysLeft = 0
          return c._daysLeft <= 7
        }).sort((a, b) => a._daysLeft - b._daysLeft)
        setBirthdayCustomers(upcoming)
      } catch { setBirthdayCustomers([]) }

      // Dead Hours Map data
      try {
        const allSalesRes = await pb.collection(C.SALES).getList(1, 500, {
          filter: `shop_id="${shop.id}" && status="completed"`,
          '$autoCancel': false, '$cancelKey': 'dash-hours'
        })
        const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }))
        allSalesRes.items.forEach(s => {
          const hr = new Date(s.created).getHours()
          if (buckets[hr]) buckets[hr].count++
        })
        setHourData(buckets)
      } catch (err) { console.error('Dead Hours Map fetch failed:', err?.message || err); setHourData([]) }

      // Avg daily revenue (last 30 days)
      try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
        const recentAll = await pb.collection(C.SALES).getList(1, 500, {
          filter: `shop_id="${shop.id}" && status="completed"`,
          '$autoCancel': false, '$cancelKey': 'dash-payback'
        })
        const last30 = recentAll.items.filter(s => new Date(s.created) >= thirtyDaysAgo)
        const totalRev30 = last30.reduce((sum, s) => sum + (s.total_kes || 0), 0)
        setAvgDailyRevenue(totalRev30 / 30)
      } catch { setAvgDailyRevenue(0) }

      // Chart
      if (period === 'today') {
        setSalesChart(Array.from({ length: 12 }, (_, i) => {
          const h = i * 2
          const label = `${String(h).padStart(2,'0')}:00`
          const ds = sales.filter(s => { const d = parseDateFromReceipt(s.receipt_no); return d && d.getHours() >= h && d.getHours() < h+2 })
          return { label, revenue: ds.reduce((a,s) => a+s.total_kes, 0), count: ds.length }
        }))
      } else {
        setSalesChart(Array.from({ length: 7 }, (_, i) => {
          const d = subDays(new Date(), 6-i)
          const label = format(d, 'EEE')
          const ds = sales.filter(s => { const rd = parseDateFromReceipt(s.receipt_no); return rd && rd.toDateString() === d.toDateString() })
          return { label, revenue: ds.reduce((a,s) => a+s.total_kes, 0), count: ds.length }
        }))
      }

      // Load AI memory and sales assistant in parallel (non-blocking)
      await Promise.all([
        loadShopBaseline(shop.id).then(setInsightMemory).catch(() => {}),
        loadSalesAssistant(shop.id, shop).then(setAssistantData).catch(() => {}),
      ])

    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const sendWhatsAppSummary = () => {
    const phone = shop?.phone?.replace(/[^0-9]/g, '')
    if (!phone) { toast.error('Add your phone number in Settings first'); return }
    const s = stats || {}
    const msg = [
      `💅 *${shop.name}*`,
      `_Daily Summary — ${format(new Date(), 'dd MMM yyyy')}_`,
      ``,
      `💰 Revenue`,
      `*KES ${(s.revenue||0).toLocaleString('en-KE')}*`,
      ``,
      `📈 Gross Profit`,
      `*KES ${(s.grossProfit||0).toLocaleString('en-KE')}*`,
      ``,
      `💸 Expenses`,
      `*KES ${(s.totalExpenses||0).toLocaleString('en-KE')}*`,
      ``,
      `🎯 Net Profit`,
      `*KES ${(s.netProfit||0).toLocaleString('en-KE')}*`,
      ``,
      `🧾 Transactions: *${s.salesCount||0}*`,
      ``,
      (s.lowStockCount||0) > 0 ? `⚠️ Stock alert: *${s.lowStockCount} item(s) running low*` : `✅ All stock levels healthy`,
      ``,
      `_${shop.name} · Powered by SalesTrack_`
    ].join('\n')
    const a = document.createElement('a')
    a.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    a.target = '_blank'; a.rel = 'noopener noreferrer'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  if (needsShop) return <ShopSetupWizard />

  const statCards = stats ? (isCashier ? [
    { label: 'My Sales Today', value: stats.salesCount,       sub: 'Transactions you processed', icon: '🧾', cls: 'blue', trend: true },
    { label: 'My Revenue',     value: fmtKES(stats.revenue), sub: 'Your sales total',            icon: '💰', cls: 'rose', trend: stats.revenue > 0 },
  ] : [
    { label: 'Revenue',      value: fmtKES(stats.revenue),     sub: `${pctChange(stats.revenue, stats.prevRevenue)}% vs prev`, icon: '💰', cls: 'rose', trend: stats.revenue >= stats.prevRevenue },
    { label: 'Gross Profit', value: fmtKES(stats.grossProfit), sub: `Margin ${stats.revenue ? ((stats.grossProfit/stats.revenue)*100).toFixed(1) : 0}%`, icon: '📈', cls: 'gold', trend: stats.grossProfit > 0 },
    { label: 'Net Profit',   value: fmtKES(stats.netProfit),   sub: `After KES ${(stats.totalExpenses/1000).toFixed(1)}k expenses`, icon: '🎯', cls: stats.netProfit >= 0 ? 'green' : 'rose', trend: stats.netProfit >= 0 },
    { label: 'Transactions', value: stats.salesCount,          sub: `Avg ${fmtKES(stats.avgOrderValue)}`, icon: '🧾', cls: 'blue', trend: true },
  ]) : []

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Good {getGreeting()}, {pb.authStore.model?.name?.split(' ')[0]} ✨</div>
          <div className="page-subtitle">{shop?.name} · {fmtDate(new Date())}{isCashier ? ' · My sales only' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          {!isLimited && (
            <button onClick={sendWhatsAppSummary} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', display: 'flex', alignItems: 'center', gap: 6, minHeight: 40 }}>
              📲 WhatsApp Summary
            </button>
          )}
          {['today','7d','month'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: period === p ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fff', color: period === p ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: period === p ? '0 4px 14px #c8456a44' : '0 1px 4px #0001', fontFamily: 'Nunito,sans-serif', minHeight: 40 }}>
              {p === 'today' ? 'Today' : p === '7d' ? '7 Days' : 'Month'}
            </button>
          ))}
        </div>
      </div>

      <SubscriptionPaybackDay shop={shop} avgDailyRevenue={avgDailyRevenue} />
      <RenewalRegretCard shop={shop} stats={stats} onClick={() => navigate('/pricing')} />
      <EmailVerificationBanner />
      <TomorrowsBanner shop={shop} onViewAppointments={() => { navigate('/app/appointments'); toast.success('Pre-filtered to tomorrow — hit Remind All!') }} />
      {showChecklist && shop && <OnboardingChecklist shop={shop} onDismiss={() => setShowChecklist(false)} />}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
            {statCards.map((s, i) => (
              <div key={i} className={`stat-card ${s.cls}`}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1f', fontFamily: 'Playfair Display,serif' }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{s.label}</div>
                <div style={{ fontSize: 12, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, color: s.trend ? '#059669' : '#dc2626' }}>
                  {s.trend ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
                  {s.sub}
                </div>
              </div>
            ))}
          </div>

          {!isLimited && <AIInsightWidget stats={stats} hourData={hourData} shop={shop} period={period} memory={insightMemory} onRecord={(insight) => recordInsightShown(shop.id, insight, stats)} />}
          {!isLimited && <SalesAssistantWidget shop={shop} assistantData={assistantData} />}
          {!isLimited && <DailyShareCard stats={stats} shop={shop} period={period} />}

          {!isLimited && (
            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: 0 }}>Revenue Overview</h3>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={salesChart} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9b6070', fontFamily: 'Nunito,sans-serif' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#9b6070', fontFamily: 'Nunito,sans-serif' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => fmtKES(v)} contentStyle={{ borderRadius: 10, border: '1px solid #f0e4e8', fontFamily: 'Nunito,sans-serif' }} />
                    <Bar dataKey="revenue" fill="url(#roseGrad)" radius={[6,6,0,0]} />
                    <defs>
                      <linearGradient id="roseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c8456a" />
                        <stop offset="100%" stopColor="#8b2550" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 20px' }}>P&L Summary</h3>
                {stats && [
                  { label: 'Revenue',         value: stats.revenue,                     color: '#059669' },
                  { label: '− Cost of Sales', value: stats.revenue - stats.grossProfit, color: '#dc2626' },
                  { label: '= Gross Profit',  value: stats.grossProfit,                 color: '#1a1a1f', bold: true, border: true },
                  { label: '− Expenses',      value: stats.totalExpenses,               color: '#dc2626' },
                  { label: '= Net Profit',    value: stats.netProfit,                   color: stats.netProfit >= 0 ? '#059669' : '#dc2626', bold: true, border: true },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: r.border ? '1.5px solid #f0e4e8' : 'none', marginTop: r.border ? 4 : 0 }}>
                    <span style={{ fontSize: 13, color: '#6b4050', fontWeight: r.bold ? 700 : 400 }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: r.bold ? 700 : 600, color: r.color, fontFamily: 'Playfair Display,serif' }}>{fmtKES(r.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dead Hours Map + G8-C flash promo */}
          {!isLimited && hourData.length > 0 && <DeadHoursMap hourData={hourData} shop={shop} />}

          {/* Bottom row */}
          <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: isCashier ? '1fr' : '1fr 1fr 1fr 1fr', gap: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: 0 }}>Recent Sales</h3>
                <button onClick={() => navigate('/app/sales')} className="btn-ghost" style={{ fontSize: 12 }}>View all <ArrowRight size={12}/></button>
              </div>
              {recentSales.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#9b6070', fontSize: 14 }}>No sales yet — <button onClick={() => navigate('/app/pos')} style={{ background: 'none', border: 'none', color: '#c8456a', fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', fontSize: 14 }}>make your first sale →</button></div>
                : recentSales.map(sale => (
                  <div key={sale.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5edf0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1f' }}>{sale.receipt_no}</div>
                      <div style={{ fontSize: 11, color: '#9b6070' }}>{fmtDateTime(sale.created)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#c8456a' }}>{fmtKES(sale.total_kes)}</div>
                      <div style={{ fontSize: 11, color: '#9b6070' }}>{sale.payment_method}</div>
                    </div>
                  </div>
                ))
              }
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: 0 }}>
                  Low Stock {stats?.lowStockCount > 0 && <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '2px 8px', borderRadius: 20, marginLeft: 8 }}>{stats.lowStockCount}</span>}
                </h3>
                {!isLimited && <button onClick={() => navigate('/app/inventory')} className="btn-ghost" style={{ fontSize: 12 }}>Manage <ArrowRight size={12}/></button>}
              </div>
              {lowStock.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#059669', fontSize: 14 }}>✅ All products well stocked</div>
                : lowStock.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5edf0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AlertCircle size={16} color="#dc2626" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1f' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#9b6070' }}>Reorder at: {p.reorder_point || 5}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: p.stock_qty === 0 ? '#dc2626' : '#f59e0b' }}>{p.stock_qty} left</div>
                  </div>
                ))
              }
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: 0 }}>
                  Birthdays 🎂 {birthdayCustomers.length > 0 && <span style={{ background: '#fef3c7', color: '#b45309', fontSize: 11, padding: '2px 8px', borderRadius: 20, marginLeft: 8 }}>{birthdayCustomers.length}</span>}
                </h3>
                <button onClick={() => navigate('/app/customers')} className="btn-ghost" style={{ fontSize: 12 }}>All <ArrowRight size={12}/></button>
              </div>
              {birthdayCustomers.length === 0
                ? <div style={{ textAlign: 'center', padding: '24px 0', color: '#9b6070', fontSize: 14 }}>No birthdays in next 7 days 🎀</div>
                : birthdayCustomers.map(c => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5edf0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1f' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: c._daysLeft === 0 ? '#b45309' : '#9b6070', fontWeight: c._daysLeft === 0 ? 700 : 400 }}>
                        {c._daysLeft === 0 ? '🎉 Today!' : `in ${c._daysLeft} day${c._daysLeft === 1 ? '' : 's'}`}
                      </div>
                    </div>
                    {c.phone && (
                      <button onClick={() => {
                        const msg = `🎂 Happy Birthday ${c.name}! 🎉\n\nWishing you a beautiful day from all of us at ${shop?.name}.\n\nEnjoy a special birthday discount on your next visit! 💄✨`
                        window.open(`https://wa.me/${c.phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(msg)}`, '_blank')
                      }} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        📲 Greet
                      </button>
                    )}
                  </div>
                ))
              }
            </div>

            {!isLimited && <BusinessHealthScore stats={stats} shop={shop} />}
          </div>
        </>
      )}
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}