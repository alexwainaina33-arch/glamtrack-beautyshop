import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate, fmtDateTime, r2 } from '../lib/utils'
import { Plus, Search, Edit2, Eye, X, Download } from 'lucide-react'
import { format } from 'date-fns'

const EMPTY = { name: '', phone: '', email: '', birthday: '', notes: '' }
const PAYMENTS = 'bs_payments'

// ---- helpers start (pure functions) ----
const MS_DAY = 86400000
const BUCKET_LABELS = ['0–7 days', '8–30 days', '31–60 days', '60+ days']

function ageDays(created, now) {
  const t = new Date(String(created || '').replace(' ', 'T')).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / MS_DAY))
}

function agingBucket(days) {
  if (days <= 7) return 0
  if (days <= 30) return 1
  if (days <= 60) return 2
  return 3
}

function toWaNumber(phone) {
  const d = String(phone || '').replace(/[^0-9]/g, '')
  if (d.length === 10 && d.startsWith('0')) return '254' + d.slice(1)
  if (d.length === 9 && /^[17]/.test(d)) return '254' + d
  return d
}

// balance of a credit sale = total - payments recorded for it
function computeCredit(sales, payments, now) {
  const paid = {}
  payments.forEach(p => { paid[p.sale_id] = r2((paid[p.sale_id] || 0) + (Number(p.amount_kes) || 0)) })
  const byCustomer = {}
  const buckets = [0, 0, 0, 0]
  let totalOwed = 0
  sales.forEach(s => {
    if (!s.customer_id) return
    const balance = r2((Number(s.total_kes) || 0) - (paid[s.id] || 0))
    if (balance <= 0.005) return
    const days = ageDays(s.created, now)
    const row = { ...s, paid: paid[s.id] || 0, balance, days }
    const e = byCustomer[s.customer_id] || (byCustomer[s.customer_id] = { balance: 0, oldestDays: 0, sales: [] })
    e.balance = r2(e.balance + balance)
    e.oldestDays = Math.max(e.oldestDays, days)
    e.sales.push(row)
    const b = agingBucket(days)
    buckets[b] = r2(buckets[b] + balance)
    totalOwed = r2(totalOwed + balance)
  })
  Object.values(byCustomer).forEach(e => e.sales.sort((a, b) => b.days - a.days)) // oldest first
  return { byCustomer, buckets, totalOwed, count: Object.keys(byCustomer).length }
}
// ---- helpers end ----

export default function CustomersPage() {
  const { shop, admin, role, loading: authLoading, isLocked } = useAuth()
  const isCashier = role === 'cashier'
  const canReceive = !isCashier && !isLocked

  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [onlyOwing, setOnlyOwing] = useState(false)

  const [viewId, setViewId] = useState(null)
  const [customerSales, setCustomerSales] = useState([])
  const [churn, setChurn] = useState(null)

  const [creditSales, setCreditSales] = useState([])
  const [payments, setPayments] = useState([])
  const [creditError, setCreditError] = useState(false)

  const [payCustomerId, setPayCustomerId] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payRef, setPayRef] = useState('')
  const [paying, setPaying] = useState(false)

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, authLoading])

  const credit = useMemo(() => computeCredit(creditSales, payments, Date.now()), [creditSales, payments])

  const loadCredit = async () => {
    try {
      const [cs, ps] = await Promise.all([
        pb.collection(C.SALES).getFullList({ filter: `shop_id="${shop.id}" && payment_status="pending"`, sort: 'created', '$autoCancel': false, '$cancelKey': 'cust-credit' }),
        pb.collection(PAYMENTS).getFullList({ filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'cust-payments' }),
      ])
      setCreditSales(cs); setPayments(ps); setCreditError(false)
    } catch (err) {
      setCreditError(true)
      toast.error('Could not load balances: ' + (err?.message || 'Unknown error'), { id: 'cust-credit-err' })
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await pb.collection(C.CUSTOMERS).getList(1, 500, { filter: `shop_id="${shop.id}"`, sort: '-total_spent_kes' }).then(r => r.items)
      setCustomers(res)
    } catch (err) {
      toast.error('Could not load customers: ' + (err?.message || 'Unknown error'))
    } finally { setLoading(false) }
    await loadCredit()
  }

  const viewCustomer = customers.find(c => c.id === viewId) || null
  const payCustomer = customers.find(c => c.id === payCustomerId) || null
  const payEntry = payCustomer ? credit.byCustomer[payCustomer.id] : null

  const openView = async (customer) => {
    setViewId(customer.id); setCustomerSales([]); setChurn(null)
    try {
      const sales = await pb.collection(C.SALES).getList(1, 10, {
        filter: `shop_id="${shop.id}" && customer_id="${customer.id}" && status="completed" && payment_status!="pending"`,
        sort: '-created'
      })
      setCustomerSales(sales.items)
      // Churn Whisper: compare recent basket avg vs lifetime avg
      const visits = customer.visit_count || 0
      const lifetimeAvg = visits > 0 ? (customer.total_spent_kes || 0) / visits : 0
      const recentSales = sales.items.slice(0, 3)
      const recentAvg = recentSales.length >= 3
        ? recentSales.reduce((s, x) => s + (x.total_kes || 0), 0) / recentSales.length
        : null
      const show = visits >= 4 && recentAvg !== null && lifetimeAvg > 0 && recentAvg < lifetimeAvg * 0.7
      setChurn({ show, lifetimeAvg, recentAvg })
    } catch (err) {
      toast.error('Could not load sales: ' + (err?.message || 'Unknown error'))
    }
  }

  const openPay = (c) => {
    const e = credit.byCustomer[c.id]
    if (!e) return
    setPayCustomerId(c.id); setPayAmount(String(e.balance)); setPayMethod('cash'); setPayRef('')
  }

  const submitPayment = async () => {
    if (isLocked) return toast.error('🔒 Account locked — renew your subscription to record payments', { duration: 6000 })
    if (paying || !payCustomer || !payEntry) return
    const amt = r2(Number(payAmount) || 0)
    if (amt <= 0) return toast.error('Enter an amount above 0')
    if (amt > payEntry.balance + 0.005) return toast.error(`Amount is more than the balance (${fmtKES(payEntry.balance)})`)
    setPaying(true)
    let left = amt, recorded = 0
    let spent = payCustomer.total_spent_kes || 0
    try {
      // Oldest credit sale first
      for (const s of payEntry.sales) {
        if (left <= 0.005) break
        const part = r2(Math.min(left, s.balance))
        await pb.collection(PAYMENTS).create({
          shop_id: shop.id, customer_id: payCustomer.id, sale_id: s.id,
          amount_kes: part, method: payMethod, paid_on: new Date().toISOString(),
          payment_ref: payRef.trim(), created_by: admin?.id || null,
        })
        recorded = r2(recorded + part); left = r2(left - part)
        if (part >= s.balance - 0.005) {
          // Sale fully settled: same effect as the Sales page "Paid" button
          await pb.collection(C.SALES).update(s.id, {
            payment_status: 'paid', payment_method: payMethod,
            notes: (s.notes || '') + ' | PAID ' + new Date().toLocaleDateString('en-KE'),
          })
          spent = r2(spent + (Number(s.total_kes) || 0))
          await pb.collection(C.CUSTOMERS).update(payCustomer.id, { total_spent_kes: spent })
        }
      }
      toast.success(`✅ ${fmtKES(recorded)} received from ${payCustomer.name}`)
      setPayCustomerId(null)
    } catch (err) {
      toast.error(`Stopped after recording ${fmtKES(recorded)}: ${err?.message || 'Unknown error'}`, { duration: 8000 })
    } finally {
      setPaying(false)
      await loadData()
    }
  }

  const remind = (c, amount) => {
    if (!c.phone) return toast.error('Customer has no phone number')
    const msg = `Hello ${c.name} 👋\n\nFriendly reminder — you have an outstanding balance of *${fmtKES(amount)}* at ${shop?.name || 'our shop'}.\n\nKindly settle at your earliest convenience. Thank you! 🙏`
    window.open(`https://wa.me/${toWaNumber(c.phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (isLocked) return toast.error('🔒 Account locked — renew your subscription to add or edit customers', { duration: 6000 })
    setSaving(true)
    try {
      if (editing) {
        await pb.collection(C.CUSTOMERS).update(editing.id, { ...form, birthday: form.birthday || null })
        toast.success('Customer updated')
      } else {
        await pb.collection(C.CUSTOMERS).create({ ...form, shop_id: shop.id, loyalty_points: 0, total_spent_kes: 0, visit_count: 0 })
        toast.success('Customer added')
      }
      setShowModal(false)
      loadData()
    } catch (err) { toast.error(err?.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const filtered = customers.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search) || c.email?.toLowerCase().includes(search.toLowerCase())
    const joined = c.created?.slice(0, 10)
    const matchFrom = !dateFrom || (joined && joined >= dateFrom)
    const matchTo = !dateTo || (joined && joined <= dateTo)
    const matchOwing = !onlyOwing || !!credit.byCustomer[c.id]
    return matchSearch && matchFrom && matchTo && matchOwing
  })
  if (onlyOwing) filtered.sort((a, b) => (credit.byCustomer[b.id]?.balance || 0) - (credit.byCustomer[a.id]?.balance || 0))

  const exportCustomersCSV = () => {
    if (!filtered.length) return toast.error('No customers to export')
    const rows = filtered.map(c => ({
      Name: c.name,
      Phone: c.phone || '',
      Email: c.email || '',
      Total_Paid_KES: c.total_spent_kes || 0,
      Balance_Due_KES: credit.byCustomer[c.id]?.balance || 0,
      Visits: c.visit_count || 0,
      Loyalty_Points: c.loyalty_points || 0,
      Birthday: c.birthday ? c.birthday.slice(0, 10) : '',
      Joined: c.created ? c.created.slice(0, 10) : '',
    }))
    const headers = Object.keys(rows[0])
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'customers.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const totalSpend = customers.reduce((s, c) => s + (c.total_spent_kes || 0), 0)
  const totalVisits = customers.reduce((s, c) => s + (c.visit_count || 0), 0)
  const viewEntry = viewCustomer ? credit.byCustomer[viewCustomer.id] : null

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Customers 👥</div>
          <div className="page-subtitle">{customers.length} customers · {fmtKES(totalSpend)} total paid</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={exportCustomersCSV}><Download size={16} /> Export CSV</button>
          <button className="btn-primary" onClick={() => { setEditing(null); setForm(EMPTY); setShowModal(true) }} disabled={isLocked} title={isLocked ? 'Account locked — renew to add customers' : ''}>
            {isLocked ? '🔒 Locked' : <><Plus size={16} /> Add Customer</>}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Total Customers', value: customers.length, icon: '👤', color: '#c8456a' },
          { label: 'Total Revenue', value: fmtKES(totalSpend), icon: '💰', color: '#059669' },
          { label: 'Total Visits', value: totalVisits, icon: '🚶', color: '#3b82f6' },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div style={{ fontSize: 28 }}>{s.icon}</div>
            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Money owed */}
      {creditError && (
        <div role="alert" style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
          Balances could not be loaded, so balances due are hidden and Receive Payment is off. Refresh the page to try again.
        </div>
      )}
      {!creditError && credit.totalOwed > 0 && (
        <div className="card" style={{ marginBottom: 16, border: '2px solid #fee2e2', background: '#fff5f5' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9b6070', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Outstanding</div>
              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700, color: '#dc2626' }}>{fmtKES(credit.totalOwed)}</div>
              <div style={{ fontSize: 12, color: '#9b6070' }}>from {credit.count} customer{credit.count !== 1 ? 's' : ''}</div>
            </div>
            <button className="btn-secondary" aria-pressed={onlyOwing} onClick={() => setOnlyOwing(v => !v)}>
              {onlyOwing ? 'Show all customers' : 'Show only customers with a balance'}
            </button>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#9b6070', marginBottom: 6 }}>Ageing of Balances</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 8 }}>
            {BUCKET_LABELS.map((label, i) => (
              <div key={label} style={{ background: '#fff', borderRadius: 10, padding: '8px 10px', border: '1px solid #fee2e2' }}>
                <div style={{ fontSize: 11, color: '#9b6070' }}>{label}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: credit.buckets[i] > 0 ? (i >= 2 ? '#dc2626' : '#b45309') : '#9b6070' }}>{fmtKES(credit.buckets[i])}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
          <input className="input" style={{ paddingLeft: 40 }} placeholder="Search by name, phone, or email…" aria-label="Search customers" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Joined From</label>
            <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Joined To</label>
            <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Customer</th><th>Phone</th><th>Balance Due</th><th>Total Paid</th><th>Visits</th><th>Loyalty Pts</th><th>Birthday</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const owe = credit.byCustomer[c.id]
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#c8456a,#6b1e38)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                          {c.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          {c.email && <div style={{ fontSize: 11, color: '#9b6070' }}>{c.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>{c.phone || '—'}</td>
                    <td>
                      {owe ? (
                        <div>
                          <div style={{ fontWeight: 700, color: '#dc2626' }}>{fmtKES(owe.balance)}</div>
                          <div style={{ fontSize: 11, color: owe.oldestDays > 30 ? '#dc2626' : '#9b6070' }}>oldest {owe.oldestDays}d</div>
                        </div>
                      ) : <span style={{ color: '#9b6070', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ fontWeight: 700, color: '#c8456a' }}>{fmtKES(c.total_spent_kes)}</td>
                    <td>{c.visit_count || 0}</td>
                    <td>
                      {c.loyalty_points > 0
                        ? <span style={{ background: '#fefce8', color: '#d97706', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>⭐ {c.loyalty_points} pts</span>
                        : <span style={{ color: '#9b6070', fontSize: 12 }}>0 pts</span>}
                    </td>
                    <td>
                      {c.birthday ? (() => {
                        const today = new Date()
                        const bday = new Date(c.birthday)
                        const next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate())
                        if (next < today) next.setFullYear(today.getFullYear() + 1)
                        const daysLeft = Math.ceil((next - today) / MS_DAY)
                        const isToday = daysLeft === 0 || daysLeft === 365
                        const isSoon = daysLeft <= 7
                        return (
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                            background: isToday ? '#fef3c7' : isSoon ? '#fce8ed' : '#f5edf0',
                            color: isToday ? '#b45309' : isSoon ? '#c8456a' : '#9b6070' }}>
                            {isToday ? '🎂 Today!' : isSoon ? `🎂 ${daysLeft}d` : format(bday, 'dd MMM')}
                          </span>
                        )
                      })() : <span style={{ color: '#9b6070', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ fontSize: 12, color: '#9b6070' }}>{fmtDate(c.created)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {owe && canReceive && !creditError && (
                          <button onClick={() => openPay(c)} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: '#f0fdf4', color: '#059669', fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>💵 Receive</button>
                        )}
                        <button className="btn-ghost" style={{ padding: '5px 10px' }} aria-label={`View ${c.name}`} title="View" onClick={() => openView(c)}><Eye size={14} /></button>
                        <button className="btn-ghost" style={{ padding: '5px 10px' }} aria-label={`Edit ${c.name}`} title="Edit" onClick={() => { setEditing(c); setForm({ name: c.name, phone: c.phone || '', email: c.email || '', birthday: c.birthday || '', notes: c.notes || '' }); setShowModal(true) }}><Edit2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>{loading ? 'Loading…' : onlyOwing ? 'No customers have a balance right now' : 'No customers yet'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer detail modal */}
      {viewCustomer && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewId(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Customer profile" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <span className="modal-title">Customer Profile</span>
              <button onClick={() => setViewId(null)} aria-label="Close" className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', background: '#fce8ed', borderRadius: 12, marginBottom: 20 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#c8456a,#6b1e38)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 22 }}>
                  {viewCustomer.name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700 }}>{viewCustomer.name}</div>
                  <div style={{ fontSize: 13, color: '#6b4050' }}>{viewCustomer.phone} {viewCustomer.email && `· ${viewCustomer.email}`}</div>
                </div>
              </div>

              {churn?.show && (
                <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 12, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>📉</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#b45309' }}>Spending less than usual</div>
                    <div style={{ fontSize: 12, color: '#92400e', marginTop: 2 }}>
                      Recent avg {fmtKES(Math.round(churn.recentAvg))} vs lifetime avg {fmtKES(Math.round(churn.lifetimeAvg))} — worth a personal check-in.
                    </div>
                  </div>
                </div>
              )}
              <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Total Paid', value: fmtKES(viewCustomer.total_spent_kes), color: '#c8456a' },
                  { label: 'Visits', value: viewCustomer.visit_count || 0, color: '#3b82f6' },
                  { label: 'Loyalty Points', value: `⭐ ${viewCustomer.loyalty_points || 0}`, color: '#d97706' },
                ].map((kpi, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '12px', background: '#fff5f7', borderRadius: 10 }}>
                    <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                    <div style={{ fontSize: 11, color: '#9b6070' }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              {viewEntry && (
                <div style={{ background: '#fff5f5', border: '2px solid #fee2e2', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>💳 Balance Due: {fmtKES(viewEntry.balance)}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {canReceive && !creditError && (
                        <button onClick={() => openPay(viewCustomer)} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>💵 Receive Payment</button>
                      )}
                      {viewCustomer.phone && (
                        <button onClick={() => remind(viewCustomer, viewEntry.balance)} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>📲 Remind</button>
                      )}
                    </div>
                  </div>
                  {viewEntry.sales.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '4px 0', borderBottom: '1px solid #fee2e2', color: '#6b4050' }}>
                      <span style={{ fontFamily: 'monospace', color: '#c8456a', wordBreak: 'break-all' }}>{s.receipt_no}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>{fmtDate(s.created)} · {s.days}d</span>
                      <span style={{ fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap', textAlign: 'right' }}>
                        {fmtKES(s.balance)}
                        {s.paid > 0 && <span style={{ display: 'block', fontSize: 10, color: '#9b6070', fontWeight: 400 }}>of {fmtKES(s.total_kes)}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontWeight: 700, fontSize: 13, color: '#3d1020', marginBottom: 10 }}>Recent Sales</div>
              {customerSales.length === 0 ? <div style={{ color: '#9b6070', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No sales yet</div> : customerSales.map(sale => (
                <div key={sale.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5edf0', fontSize: 13 }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#c8456a' }}>{sale.receipt_no}</div>
                    <div style={{ fontSize: 11, color: '#9b6070' }}>{fmtDateTime(sale.created)}</div>
                  </div>
                  <div style={{ fontWeight: 700 }}>{fmtKES(sale.total_kes)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Receive payment modal */}
      {payCustomer && payEntry && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !paying && setPayCustomerId(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Receive payment" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span className="modal-title">💵 Receive Payment</span>
              <button onClick={() => setPayCustomerId(null)} disabled={paying} aria-label="Close" className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#fff5f5', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <div style={{ fontWeight: 700 }}>{payCustomer.name}</div>
                <div style={{ fontSize: 13, color: '#dc2626', marginTop: 2 }}>Balance due {fmtKES(payEntry.balance)} across {payEntry.sales.length} sale{payEntry.sales.length !== 1 ? 's' : ''}</div>
                <div style={{ fontSize: 11, color: '#9b6070', marginTop: 4 }}>The payment is applied to the oldest sale first.</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label className="label" htmlFor="pay-amount">Amount received (KES)</label>
                  <input id="pay-amount" className="input" type="number" min="0" step="0.01" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)} onFocus={e => e.target.select()} />
                  <button type="button" onClick={() => setPayAmount(String(payEntry.balance))} style={{ marginTop: 4, background: 'none', border: 'none', color: '#c8456a', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Pay full balance</button>
                </div>
                <div>
                  <label className="label" htmlFor="pay-method">Paid by</label>
                  <select id="pay-method" className="input" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="visa_mc">Card</option>
                  </select>
                </div>
                {payMethod !== 'cash' && (
                  <div>
                    <label className="label" htmlFor="pay-ref">Reference (optional)</label>
                    <input id="pay-ref" className="input" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="e.g. M-Pesa code" />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setPayCustomerId(null)} disabled={paying}>Cancel</button>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={submitPayment} disabled={paying}>{paying ? 'Saving…' : 'Record Payment'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Add Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit customer' : 'New customer'} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Customer' : 'New Customer'}</span>
              <button onClick={() => setShowModal(false)} aria-label="Close" className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label className="label">Name *</label><input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+254…" /></div>
                <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><label className="label">Birthday 🎂</label><input className="input" type="date" value={form.birthday} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))} /></div>
                <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} /></div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Add Customer'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
