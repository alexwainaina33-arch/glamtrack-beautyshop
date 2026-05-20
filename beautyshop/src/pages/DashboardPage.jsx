import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate, fmtDateTime, pctChange } from '../lib/utils'
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays, subMonths, format } from 'date-fns'
import { TrendingUp, TrendingDown, ShoppingBag, Package, Users, AlertCircle, ArrowRight } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const parseDateFromReceipt = (receipt_no) => {
  const m = receipt_no?.match(/-(\d{6})-/)
  if (!m) return null
  const c = m[1]
  return new Date(2000 + parseInt(c.slice(0,2)), parseInt(c.slice(2,4))-1, parseInt(c.slice(4,6)))
}

export default function DashboardPage() {
  const { shop, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [salesChart, setSalesChart] = useState([])
  const [recentSales, setRecentSales] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [birthdayCustomers, setBirthdayCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')

  useEffect(() => {
    if (shop) loadAll()
  }, [shop, period])

  const getPeriodRange = () => {
    const now = new Date()
    if (period === 'today') return { from: startOfDay(now), to: endOfDay(now) }
    if (period === 'month') return { from: startOfMonth(now), to: endOfMonth(now) }
    if (period === '7d') return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) }
    return { from: startOfDay(now), to: endOfDay(now) }
  }

  const filterByReceiptDate = (items, from, to) => {
    return items.filter(x => {
      const d = parseDateFromReceipt(x.receipt_no)
      if (!d) return false
      return d.getTime() >= startOfDay(from).getTime() && d.getTime() <= endOfDay(to).getTime()
    })
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const { from, to } = getPeriodRange()
      const prevFrom = subDays(from, period === 'today' ? 1 : 30)
      const prevTo = subDays(to, period === 'today' ? 1 : 30)

      const [sales, prevSales, expenses, products, customers, recent] = await Promise.all([
        pb.collection(C.SALES).getList(1, 500, { filter: `shop_id="${shop.id}" && status="completed"`, '$autoCancel': false, '$cancelKey': 'dash-sales' })
          .then(r => filterByReceiptDate(r.items, from, to)),
        pb.collection(C.SALES).getList(1, 500, { filter: `shop_id="${shop.id}" && status="completed"`, '$autoCancel': false, '$cancelKey': 'dash-prev-sales' })
          .then(r => filterByReceiptDate(r.items, prevFrom, prevTo)),
        pb.collection(C.EXPENSES).getList(1, 500, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'dash-expenses' })
          .then(r => r.items.filter(x => { const d = x.expense_date?.slice(0,10); return d && d >= from.toISOString().split('T')[0] && d <= to.toISOString().split('T')[0] })),
        pb.collection(C.PRODUCTS).getList(1, 500, { filter: `shop_id="${shop.id}" && status="active" && track_inventory=true`, '$autoCancel': false, '$cancelKey': 'dash-products' })
          .then(r => r.items),
        pb.collection(C.CUSTOMERS).getList(1, 1, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'dash-customers' }),
        pb.collection(C.SALES).getList(1, 8, { filter: `shop_id="${shop.id}" && status="completed"`, expand: 'customer_id', '$autoCancel': false, '$cancelKey': 'dash-recent' })
      ])

      const revenue = sales.reduce((s, x) => s + (x.total_kes || 0), 0)
      const grossProfit = sales.reduce((s, x) => s + (x.gross_profit_kes || 0), 0)
      const totalExpenses = expenses.reduce((s, x) => s + (x.amount_kes || 0), 0)
      const prevRevenue = prevSales.reduce((s, x) => s + (x.total_kes || 0), 0)
      const netProfit = grossProfit - totalExpenses
      const lowStockProds = products.filter(p => p.stock_qty !== null && p.stock_qty <= (p.reorder_point || 5))

      setStats({
        revenue, grossProfit, totalExpenses, netProfit,
        salesCount: sales.length,
        prevRevenue,
        totalCustomers: customers.totalItems,
        lowStockCount: lowStockProds.length,
        avgOrderValue: sales.length ? revenue / sales.length : 0
      })
      setLowStock(lowStockProds.slice(0, 5))
      setRecentSales(recent.items)

      // Birthday tracker
      try {
        const allCustomers = await pb.collection(C.CUSTOMERS).getList(1, 500, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'birthday-fetch' }).then(r => r.items)
        const today = new Date()
        const upcoming = allCustomers.filter(c => {
          if (!c.birthday) return false
          const bday = new Date(c.birthday)
          const next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate())
          if (next < today) next.setFullYear(today.getFullYear() + 1)
          const daysLeft = Math.ceil((next - today) / (1000 * 60 * 60 * 24))
          c._daysLeft = daysLeft === 365 ? 0 : daysLeft
          return c._daysLeft <= 7
        }).sort((a, b) => a._daysLeft - b._daysLeft)
        setBirthdayCustomers(upcoming)
      } catch { setBirthdayCustomers([]) }

      // Build chart data
      if (period === 'today') {
        const hours = Array.from({ length: 12 }, (_, i) => {
          const h = i * 2
          const label = `${String(h).padStart(2,'0')}:00`
          const daySales = sales.filter(s => {
            const d = parseDateFromReceipt(s.receipt_no)
            return d && d.getHours() >= h && d.getHours() < h + 2
          })
          return { label, revenue: daySales.reduce((a, s) => a + s.total_kes, 0), count: daySales.length }
        })
        setSalesChart(hours)
      } else {
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = subDays(new Date(), 6 - i)
          const label = format(d, 'EEE')
          const ds = d.toDateString()
          const daySales = sales.filter(s => {
            const rd = parseDateFromReceipt(s.receipt_no)
            return rd && rd.toDateString() === ds
          })
          return { label, revenue: daySales.reduce((a, s) => a + s.total_kes, 0), count: daySales.length }
        })
        setSalesChart(days)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (!shop) return (
    <div className="card" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🏪</div>
      <p style={{ color: '#9b6070' }}>No shop assigned. Please contact your administrator.</p>
    </div>
  )

  const statCards = stats ? [
    { label: 'Revenue', value: fmtKES(stats.revenue), sub: `${pctChange(stats.revenue, stats.prevRevenue)}% vs prev`, icon: '💰', cls: 'rose', trend: stats.revenue >= stats.prevRevenue },
    { label: 'Gross Profit', value: fmtKES(stats.grossProfit), sub: `Margin ${stats.revenue ? ((stats.grossProfit/stats.revenue)*100).toFixed(1) : 0}%`, icon: '📈', cls: 'gold', trend: stats.grossProfit > 0 },
    { label: 'Net Profit', value: fmtKES(stats.netProfit), sub: `After KES ${(stats.totalExpenses/1000).toFixed(1)}k expenses`, icon: '🎯', cls: stats.netProfit >= 0 ? 'green' : 'rose', trend: stats.netProfit >= 0 },
    { label: 'Transactions', value: stats.salesCount, sub: `Avg ${fmtKES(stats.avgOrderValue)}`, icon: '🧾', cls: 'blue', trend: true },
  ] : []

  const sendWhatsAppSummary = () => {
    if (!shop) return
    const phone = shop.phone?.replace(/[^0-9]/g, '') || ''
    if (!phone) { toast.error('Add your phone number in Settings first'); return }
    const today = format(new Date(), 'dd MMM yyyy')
    const s = stats || { revenue: 0, grossProfit: 0, totalExpenses: 0, netProfit: 0, salesCount: 0, avgOrderValue: 0, lowStockCount: 0 }
    const msg = [
      `📊 *GlamTrack Daily Summary — ${shop.name}*`,
      `📅 ${today}`,
      ``,
      `💰 Revenue: KES ${s.revenue.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      `📈 Gross Profit: KES ${s.grossProfit.toLocaleString('en-KE', { minimumFractionDigits: 2 })} (${s.revenue ? ((s.grossProfit / s.revenue) * 100).toFixed(1) : 0}% margin)`,
      `💸 Expenses: KES ${s.totalExpenses.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      `🎯 Net Profit: KES ${s.netProfit.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      ``,
      `🧾 Transactions: ${s.salesCount}`,
      `🛒 Avg Sale: KES ${s.avgOrderValue.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      ``,
      s.lowStockCount > 0 ? `⚠️ Low Stock Alert: ${s.lowStockCount} product(s) need restocking` : `✅ Stock levels OK`,
      ``,
      `_Powered by GlamTrack POS_`
    ].join('\n')
    const a = document.createElement('a')
    a.href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Good {getGreeting()}, {pb.authStore.model?.name?.split(' ')[0]} ✨</div>
          <div className="page-subtitle">{shop.name} · {fmtDate(new Date())}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={sendWhatsAppSummary}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
            📲 WhatsApp Summary
          </button>
          {['today', '7d', 'month'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{
                padding: '7px 16px', borderRadius: 8, border: 'none',
                background: period === p ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fff',
                color: period === p ? '#fff' : '#8b2550',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
                boxShadow: period === p ? '0 4px 14px #c8456a44' : '0 1px 4px #0001',
                fontFamily: 'Nunito,sans-serif'
              }}>
              {p === 'today' ? 'Today' : p === '7d' ? '7 Days' : 'This Month'}
            </button>
          ))}
        </div>
      </div>

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
                  {s.trend ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
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
                  <Tooltip formatter={(v) => fmtKES(v)} labelStyle={{ fontFamily: 'Nunito,sans-serif', fontSize: 12 }} contentStyle={{ borderRadius: 10, border: '1px solid #f0e4e8', fontFamily: 'Nunito,sans-serif' }} />
                  <Bar dataKey="revenue" fill="url(#roseGrad)" radius={[6, 6, 0, 0]} />
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
                { label: 'Revenue', value: stats.revenue, color: '#059669' },
                { label: '− Cost of Sales', value: stats.revenue - stats.grossProfit, color: '#dc2626' },
                { label: '= Gross Profit', value: stats.grossProfit, color: '#1a1a1f', bold: true, border: true },
                { label: '− Expenses', value: stats.totalExpenses, color: '#dc2626' },
                { label: '= Net Profit', value: stats.netProfit, color: stats.netProfit >= 0 ? '#059669' : '#dc2626', bold: true, border: true },
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
                <button onClick={() => navigate('/sales')} className="btn-ghost" style={{ fontSize: 12 }}>View all <ArrowRight size={12} /></button>
              </div>
              {recentSales.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9b6070', fontSize: 14 }}>No sales yet today</div>
              ) : recentSales.map(sale => (
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
              ))}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: 0 }}>
                  Low Stock {stats?.lowStockCount > 0 && <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 11, padding: '2px 8px', borderRadius: 20, marginLeft: 8 }}>{stats.lowStockCount}</span>}
                </h3>
                <button onClick={() => navigate('/inventory')} className="btn-ghost" style={{ fontSize: 12 }}>Manage <ArrowRight size={12} /></button>
              </div>
              {lowStock.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#059669', fontSize: 14 }}>✅ All products are well stocked</div>
              ) : lowStock.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5edf0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertCircle size={16} color="#dc2626" />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1f' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#9b6070' }}>Reorder at: {p.reorder_point || 5}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: p.stock_qty === 0 ? '#dc2626' : '#f59e0b' }}>
                    {p.stock_qty} left
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: 0 }}>
                  Birthdays 🎂 {birthdayCustomers.length > 0 && <span style={{ background: '#fef3c7', color: '#b45309', fontSize: 11, padding: '2px 8px', borderRadius: 20, marginLeft: 8 }}>{birthdayCustomers.length}</span>}
                </h3>
                <button onClick={() => navigate('/customers')} className="btn-ghost" style={{ fontSize: 12 }}>All <ArrowRight size={12} /></button>
              </div>
              {birthdayCustomers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9b6070', fontSize: 14 }}>No birthdays in next 7 days 🎀</div>
              ) : birthdayCustomers.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5edf0' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1f' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: c._daysLeft === 0 ? '#b45309' : '#9b6070', fontWeight: c._daysLeft === 0 ? 700 : 400 }}>
                      {c._daysLeft === 0 ? '🎉 Today!' : `in ${c._daysLeft} day${c._daysLeft === 1 ? '' : 's'}`}
                    </div>
                  </div>
                  {c.phone && (
                    <button onClick={() => {
                      const msg = `🎂 Happy Birthday ${c.name}! 🎉\n\nWishing you a beautiful day from all of us at ${shop.name}.\n\nAs our valued customer, enjoy a special birthday discount on your next visit! 💄✨`
                      window.open(`https://wa.me/${c.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
                    }} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      📲 Greet
                    </button>
                  )}
                </div>
              ))}
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