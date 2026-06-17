import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate, fmtDateTime } from '../lib/utils'
import { Plus, Search, Edit2, Eye, X, User, Download } from 'lucide-react'
import { format } from 'date-fns'

const EMPTY = { name: '', phone: '', email: '', birthday: '', notes: '' }

export default function CustomersPage() {
  const { shop, loading: authLoading } = useAuth()
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [viewCustomer, setViewCustomer] = useState(null)
  const [customerSales, setCustomerSales] = useState([])

  const [creditSales, setCreditSales] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, authLoading])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await pb.collection(C.CUSTOMERS).getList(1, 500, { filter: `shop_id="${shop.id}"`, sort: '-total_spent_kes' }).then(r => r.items)
      setCustomers(res)
    } finally { setLoading(false) }
  }

  const openView = async (customer) => {
    setViewCustomer(customer)
    try {
      const [sales, credits] = await Promise.all([
        pb.collection(C.SALES).getList(1, 10, { filter: `shop_id="${shop.id}" && customer_id="${customer.id}" && status="completed" && payment_status!="pending"`, sort: '-created' }),
        pb.collection(C.SALES).getList(1, 200, { filter: `shop_id="${shop.id}" && customer_id="${customer.id}" && payment_status="pending"` }).then(r => r.items)
      ])
      setCustomerSales(sales.items)
      setCreditSales(credits)
    } catch {}
  }

  const handleSave = async (e) => {
    e.preventDefault()
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
    return matchSearch && matchFrom && matchTo
  })

  const exportCustomersCSV = () => {
    if (!filtered.length) return toast.error('No customers to export')
    const rows = filtered.map(c => ({
      Name: c.name,
      Phone: c.phone || '',
      Email: c.email || '',
      Total_Spent_KES: c.total_spent_kes || 0,
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

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Customers 👥</div>
          <div className="page-subtitle">{customers.length} customers · {fmtKES(totalSpend)} total spent</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={exportCustomersCSV}><Download size={16} /> Export CSV</button>
          <button className="btn-primary" onClick={() => { setEditing(null); setForm(EMPTY); setShowModal(true) }}><Plus size={16} /> Add Customer</button>
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

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
          <input className="input" style={{ paddingLeft: 40 }} placeholder="Search by name, phone, or email…" value={search} onChange={e => setSearch(e.target.value)} />
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
              <tr><th>Customer</th><th>Phone</th><th>Total Spent</th><th>Visits</th><th>Loyalty Pts</th><th>Birthday</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(c => (
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
                  <td style={{ fontWeight: 700, color: '#c8456a' }}>{fmtKES(c.total_spent_kes)}</td>
                  <td>{c.visit_count || 0}</td>
                  <td>
                    {c.loyalty_points > 0
                      ? <span style={{ background: '#fefce8', color: '#d97706', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>⭐ {c.loyalty_points} pts</span>
                      : <span style={{ color: '#9b6070', fontSize: 12 }}>0 pts</span>}
                  </td>
                  <td style={{ fontSize: 12, color: '#9b6070' }}>{fmtDate(c.created)}</td>
                  <td>
                    {c.birthday ? (() => {
                      const today = new Date()
                      const bday = new Date(c.birthday)
                      const next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate())
                      if (next < today) next.setFullYear(today.getFullYear() + 1)
                      const daysLeft = Math.ceil((next - today) / (1000 * 60 * 60 * 24))
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
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn-ghost" style={{ padding: '5px 10px' }} onClick={() => openView(c)}><Eye size={14} /></button>
                      <button className="btn-ghost" style={{ padding: '5px 10px' }} onClick={() => { setEditing(c); setForm({ name: c.name, phone: c.phone || '', email: c.email || '', birthday: c.birthday || '', notes: c.notes || '' }); setShowModal(true) }}><Edit2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>No customers yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer detail modal */}
      {viewCustomer && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setViewCustomer(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <span className="modal-title">Customer Profile</span>
              <button onClick={() => setViewCustomer(null)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
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

              <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Total Spent', value: fmtKES(viewCustomer.total_spent_kes), color: '#c8456a' },
                  { label: 'Visits', value: viewCustomer.visit_count || 0, color: '#3b82f6' },
                  { label: 'Loyalty Points', value: `⭐ ${viewCustomer.loyalty_points || 0}`, color: '#d97706' },
                ].map((kpi, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '12px', background: '#fff5f7', borderRadius: 10 }}>
                    <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                    <div style={{ fontSize: 11, color: '#9b6070' }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontWeight: 700, fontSize: 13, color: '#3d1020', marginBottom: 10 }}>Recent Purchases</div>
              {creditSales.length > 0 && (
                <div style={{ background: '#fff5f5', border: '2px solid #fee2e2', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: '#dc2626', fontSize: 14 }}>
                      💳 Outstanding Credit: {fmtKES(creditSales.reduce((s, x) => s + x.total_kes, 0))}
                    </span>
                    {viewCustomer.phone && (
                      <button onClick={() => {
                        const total = creditSales.reduce((s, x) => s + x.total_kes, 0)
                        const msg = `Hello ${viewCustomer.name} 👋\n\nFriendly reminder — you have an outstanding balance of *${fmtKES(total)}* at our shop.\n\nKindly settle at your earliest convenience. Thank you! 💄✨`
                        window.open(`https://wa.me/${viewCustomer.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
                      }} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        📲 Remind
                      </button>
                    )}
                  </div>
                  {creditSales.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #fee2e2', color: '#6b4050' }}>
                      <span style={{ fontFamily: 'monospace', color: '#c8456a' }}>{s.receipt_no}</span>
                      <span>{fmtDate(s.created)}</span>
                      <span style={{ fontWeight: 700, color: '#dc2626' }}>{fmtKES(s.total_kes)}</span>
                    </div>
                  ))}
                </div>
              )}
              {customerSales.length === 0 ? <div style={{ color: '#9b6070', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No purchases yet</div> : customerSales.map(sale => (
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

      {/* Edit/Add Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Customer' : 'New Customer'}</span>
              <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
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