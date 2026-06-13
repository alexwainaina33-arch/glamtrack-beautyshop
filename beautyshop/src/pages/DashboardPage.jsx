import { useState, useEffect } from 'react'
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

// ─── SHOP SETUP WIZARD ───────────────────────────────────────────
function ShopSetupWizard() {
  const { admin, completeShopSetup } = useAuth()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '', phone: '', address: '', email: '',
    currency: 'KES', tax_rate: 16,
  })

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Shop name is required'); return }
    setSaving(true)
    try {
      // 1. Create the shop
      const slug = form.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now()
      const newShop = await pb.collection(C.SHOPS).create({
        ...form,
        slug,
        is_active: true,
      })
      // 2. Link admin to shop
      await pb.collection(C.SHOP_ADMINS).create({
        shop_id: newShop.id,
        admin_id: admin.id,
        role: 'owner',
      })
      toast.success(`Welcome to ${newShop.name}! 🎉`)
      completeShopSetup(newShop)
    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Failed to create shop')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      minHeight: '80vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '40px 20px',
    }}>
      <div style={{ width: '100%', maxWidth: 520 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 72, height: 72,
            background: 'linear-gradient(135deg,#e6b800,#c8456a)',
            borderRadius: 20, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 28px #c8456a44', marginBottom: 16,
          }}>
            <Store size={34} color="#fff" />
          </div>
          <h1 style={{ fontFamily: 'Playfair Display,serif', fontSize: 28, color: '#3d1020', margin: '0 0 8px' }}>
            Set up your shop 🏪
          </h1>
          <p style={{ color: '#9b6070', fontSize: 14, margin: 0 }}>
            Welcome, {admin?.name?.split(' ')[0]}! Let's get your business set up in 60 seconds.
          </p>
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {[1,2].map(s => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: step >= s ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#f5edf0',
                color: step >= s ? '#fff' : '#9b6070',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700,
              }}>{s}</div>
              {s < 2 && <div style={{ width: 40, height: 2, background: step > s ? '#c8456a' : '#f5edf0', borderRadius: 2 }} />}
            </div>
          ))}
        </div>

        <div style={{
          background: '#fff', borderRadius: 20,
          border: '1px solid #f0e4e8',
          boxShadow: '0 8px 32px rgba(200,69,106,0.08)',
          padding: '32px 36px',
        }}>
          <form onSubmit={step === 1 ? (e) => { e.preventDefault(); setStep(2) } : handleCreate}>
            {step === 1 && (
              <>
                <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 20px' }}>
                  Basic information
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="label">Business / Shop Name *</label>
                    <input className="input" required placeholder="e.g. Glam Studio Nairobi"
                      value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Phone Number</label>
                    <input className="input" placeholder="+254 7xx xxx xxx"
                      value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Business Email</label>
                    <input className="input" type="email" placeholder="business@email.com"
                      value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Physical Address</label>
                    <input className="input" placeholder="e.g. Westlands, Nairobi"
                      value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 20px' }}>
                  Financial settings
                </h2>
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
                    <input className="input" type="number" min={0} max={100} step={0.5}
                      value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: parseFloat(e.target.value) }))}
                      placeholder="16 for standard Kenya VAT" />
                    <div style={{ fontSize: 11, color: '#9b6070', marginTop: 4 }}>
                      Standard Kenya VAT is 16%. Set to 0 if not VAT-registered.
                    </div>
                  </div>

                  {/* Summary */}
                  <div style={{ background: '#fdf5f7', border: '1px solid #f0e4e8', borderRadius: 12, padding: '14px 16px', marginTop: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#8b2550', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Your shop summary
                    </div>
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
                <button type="button" onClick={() => setStep(1)}
                  style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #f0e4e8', background: '#fff', color: '#8b2550', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                  ← Back
                </button>
              )}
              <button type="submit" disabled={saving}
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: saving ? '#6b1e38' : 'linear-gradient(135deg,#c8456a,#8b2550)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'Nunito,sans-serif', boxShadow: '0 4px 16px #c8456a44', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {saving
                  ? <><div style={{ width: 16, height: 16, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Creating…</>
                  : step === 1 ? 'Continue →' : '🎉 Create My Shop'
                }
              </button>
            </div>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#9b6070', fontSize: 12, marginTop: 16 }}>
          You can update all these details anytime in Settings ⚙️
        </p>
      </div>
    </div>
  )
}

// ─── ONBOARDING CHECKLIST ────────────────────────────────────────
function OnboardingChecklist({ shop, onDismiss }) {
  const navigate = useNavigate()
  const [checks, setChecks] = useState({
    shop: true,
    category: false,
    product: false,
    staff: false,
    sale: false,
  })
  const [loadingChecks, setLoadingChecks] = useState(true)

  useEffect(() => {
    if (shop) checkProgress()
  }, [shop])

  const checkProgress = async () => {
    setLoadingChecks(true)
    try {
      const [cats, prods, staff, sales] = await Promise.all([
        pb.collection(C.CATEGORIES).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'ob-cats' }),
        pb.collection(C.PRODUCTS).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'ob-prods' }),
        pb.collection(C.STAFF).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'ob-staff' }),
        pb.collection(C.SALES).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'ob-sales' }),
      ])
      const next = {
        shop: true,
        category: cats.totalItems > 0,
        product: prods.totalItems > 0,
        staff: staff.totalItems > 0,
        sale: sales.totalItems > 0,
      }
      // Fire toast when a step is newly completed
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
    { key: 'shop',     icon: Store,       label: 'Create your shop',       desc: 'Shop profile set up',                   action: null },
    { key: 'category', icon: Tag,         label: 'Add a product category', desc: 'e.g. Hair, Nails, Skincare',            action: () => navigate('/app/products') },
    { key: 'product',  icon: Package,     label: 'Add your first product', desc: 'Add products with price and stock',     action: () => navigate('/app/products') },
    { key: 'staff',    icon: Users,       label: 'Add a staff member',     desc: 'Set up your team and commissions',      action: () => navigate('/app/staff') },
    { key: 'sale',     icon: ShoppingCart,label: 'Make your first sale',   desc: 'Complete a sale on the POS',            action: () => navigate('/app/pos') },
  ]

  const completed = Object.values(checks).filter(Boolean).length
  const total = steps.length
  const allDone = completed === total
  const pct = Math.round((completed / total) * 100)

  if (allDone) return null

  return (
    <div style={{
      background: 'linear-gradient(135deg,#fff9fb,#fff)',
      border: '1.5px solid #f0e4e8',
      borderRadius: 16, padding: '20px 24px',
      marginBottom: 24, position: 'relative',
      boxShadow: '0 4px 20px rgba(200,69,106,0.06)',
    }}>
      {/* Dismiss */}
      <button onClick={onDismiss} style={{ position: 'absolute', top: 14, right: 14, background: 'none', border: 'none', cursor: 'pointer', color: '#c8b0b8', padding: 4 }}>
        <X size={16} />
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', fontWeight: 700 }}>
            🚀 Set up your shop — {pct}% done
          </div>
          <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>
            {completed} of {total} steps complete · Takes about 5 minutes
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: '#f5edf0', borderRadius: 6, marginBottom: 18, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#c8456a,#e6b800)', borderRadius: 6, transition: 'width 0.5s ease' }} />
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map(({ key, icon: Icon, label, desc, action }) => {
          const done = checks[key]
          return (
            <div key={key} onClick={!done && action ? action : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', borderRadius: 10,
                background: done ? '#f0fdf4' : '#fdf5f7',
                border: `1px solid ${done ? '#bbf7d0' : '#f5e4ea'}`,
                cursor: !done && action ? 'pointer' : 'default',
                transition: 'all 0.15s',
                opacity: loadingChecks ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!done && action) e.currentTarget.style.background = '#fce8ed' }}
              onMouseLeave={e => { if (!done && action) e.currentTarget.style.background = '#fdf5f7' }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                background: done ? '#dcfce7' : 'rgba(200,69,106,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={16} color={done ? '#059669' : '#c8456a'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: done ? '#059669' : '#3d1020', textDecoration: done ? 'line-through' : 'none' }}>
                  {label}
                </div>
                <div style={{ fontSize: 11, color: '#9b6070', marginTop: 1 }}>{desc}</div>
              </div>
              {done
                ? <CheckCircle2 size={18} color="#059669" />
                : action ? <ChevronRight size={16} color="#c8456a" /> : <Circle size={18} color="#d4a0b0" />
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── MAIN DASHBOARD ──────────────────────────────────────────────
export default function DashboardPage() {
  const { shop, needsShop, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats]               = useState(null)
  const [salesChart, setSalesChart]     = useState([])
  const [recentSales, setRecentSales]   = useState([])
  const [lowStock, setLowStock]         = useState([])
  const [birthdayCustomers, setBirthdayCustomers] = useState([])
  const [loading, setLoading]           = useState(true)
  const [period, setPeriod]             = useState('today')
  const [showChecklist, setShowChecklist] = useState(true)

  useEffect(() => {
    if (shop) loadAll()
  }, [shop, period])

  const getPeriodRange = () => {
    const now = new Date()
    if (period === 'today') return { from: startOfDay(now), to: endOfDay(now) }
    if (period === 'month') return { from: startOfMonth(now), to: endOfMonth(now) }
    if (period === '7d')   return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) }
    return { from: startOfDay(now), to: endOfDay(now) }
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

      const [sales, prevSales, expenses, products, customers, recent] = await Promise.all([
        pb.collection(C.SALES).getList(1, 500, { filter: `shop_id="${shop.id}" && status="completed"`, '$autoCancel': false, '$cancelKey': 'dash-sales' })
          .then(r => filterByReceiptDate(r.items, from, to)),
        pb.collection(C.SALES).getList(1, 500, { filter: `shop_id="${shop.id}" && status="completed"`, '$autoCancel': false, '$cancelKey': 'dash-prev' })
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
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const sendWhatsAppSummary = () => {
    const phone = shop?.phone?.replace(/[^0-9]/g, '')
    if (!phone) { toast.error('Add your phone number in Settings first'); return }
    const s = stats || {}
    const msg = [
      `📊 *SalesTrack Daily Summary — ${shop.name}*`,
      `📅 ${format(new Date(), 'dd MMM yyyy')}`,
      ``,
      `💰 Revenue: KES ${(s.revenue||0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      `📈 Gross Profit: KES ${(s.grossProfit||0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      `💸 Expenses: KES ${(s.totalExpenses||0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      `🎯 Net Profit: KES ${(s.netProfit||0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      `🧾 Transactions: ${s.salesCount||0}`,
      ``,
      (s.lowStockCount||0) > 0 ? `⚠️ Low Stock: ${s.lowStockCount} product(s) need restocking` : `✅ Stock levels OK`,
      ``,
      `_Powered by SalesTrack POS_`
    ].join('\n')
    const a = document.createElement('a')
    a.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    a.target = '_blank'; a.rel = 'noopener noreferrer'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  // ── Show wizard if no shop ──
  if (needsShop) return <ShopSetupWizard />

  const statCards = stats ? [
    { label: 'Revenue',      value: fmtKES(stats.revenue),      sub: `${pctChange(stats.revenue, stats.prevRevenue)}% vs prev`, icon: '💰', cls: 'rose', trend: stats.revenue >= stats.prevRevenue },
    { label: 'Gross Profit', value: fmtKES(stats.grossProfit),  sub: `Margin ${stats.revenue ? ((stats.grossProfit/stats.revenue)*100).toFixed(1) : 0}%`, icon: '📈', cls: 'gold', trend: stats.grossProfit > 0 },
    { label: 'Net Profit',   value: fmtKES(stats.netProfit),    sub: `After KES ${(stats.totalExpenses/1000).toFixed(1)}k expenses`, icon: '🎯', cls: stats.netProfit >= 0 ? 'green' : 'rose', trend: stats.netProfit >= 0 },
    { label: 'Transactions', value: stats.salesCount,           sub: `Avg ${fmtKES(stats.avgOrderValue)}`, icon: '🧾', cls: 'blue', trend: true },
  ] : []

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Good {getGreeting()}, {pb.authStore.model?.name?.split(' ')[0]} ✨</div>
          <div className="page-subtitle">{shop?.name} · {fmtDate(new Date())}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={sendWhatsAppSummary}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
            📲 WhatsApp Summary
          </button>
          {['today','7d','month'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: period === p ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fff', color: period === p ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: period === p ? '0 4px 14px #c8456a44' : '0 1px 4px #0001', fontFamily: 'Nunito,sans-serif' }}>
              {p === 'today' ? 'Today' : p === '7d' ? '7 Days' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

      {/* Email verification banner */}
      <EmailVerificationBanner />

      {/* Onboarding checklist */}
      {showChecklist && shop && (
        <OnboardingChecklist shop={shop} onDismiss={() => setShowChecklist(false)} />
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200 }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
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

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
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
                { label: 'Revenue',         value: stats.revenue,                       color: '#059669' },
                { label: '− Cost of Sales', value: stats.revenue - stats.grossProfit,   color: '#dc2626' },
                { label: '= Gross Profit',  value: stats.grossProfit,                   color: '#1a1a1f', bold: true, border: true },
                { label: '− Expenses',      value: stats.totalExpenses,                 color: '#dc2626' },
                { label: '= Net Profit',    value: stats.netProfit,                     color: stats.netProfit >= 0 ? '#059669' : '#dc2626', bold: true, border: true },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: r.border ? '1.5px solid #f0e4e8' : 'none', marginTop: r.border ? 4 : 0 }}>
                  <span style={{ fontSize: 13, color: '#6b4050', fontWeight: r.bold ? 700 : 400 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: r.bold ? 700 : 600, color: r.color, fontFamily: 'Playfair Display,serif' }}>{fmtKES(r.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
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
                <button onClick={() => navigate('/app/inventory')} className="btn-ghost" style={{ fontSize: 12 }}>Manage <ArrowRight size={12}/></button>
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