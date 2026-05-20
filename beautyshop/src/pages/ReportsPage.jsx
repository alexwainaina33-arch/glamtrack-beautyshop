import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate } from '../lib/utils'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, eachMonthOfInterval } from 'date-fns'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Download, Printer, TrendingUp, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'

const TABS = ['P&L Statement', 'Balance Sheet', 'Sales Report', 'Expense Report', 'Stock Valuation']

export default function ReportsPage() {
  const { shop, loading: authLoading } = useAuth()
  const [tab, setTab] = useState(0)
  const [period, setPeriod] = useState('month')
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const printRef = useRef()

  useEffect(() => {
    if (period === 'month') {
      setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
      setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
    } else if (period === 'year') {
      setDateFrom(format(startOfYear(new Date()), 'yyyy-MM-dd'))
      setDateTo(format(endOfYear(new Date()), 'yyyy-MM-dd'))
    } else if (period === 'last_month') {
      const lm = subMonths(new Date(), 1)
      setDateFrom(format(startOfMonth(lm), 'yyyy-MM-dd'))
      setDateTo(format(endOfMonth(lm), 'yyyy-MM-dd'))
    }
  }, [period])

  useEffect(() => { if (shop && dateFrom && dateTo) loadReport() }, [shop, dateFrom, dateTo, tab])

  const loadReport = async () => {
    setLoading(true)
    try {
      const fromISO = new Date(dateFrom).toISOString()
      const toISO = new Date(dateTo + 'T23:59:59').toISOString()

      const [salesAll, expenses, products, categories, expCats] = await Promise.all([
        pb.collection(C.SALES).getList(1, 500, { filter: `shop_id="${shop.id}" && status="completed"`, '$autoCancel': false, '$cancelKey': 'report-sales' }).then(r => r.items.filter(x => {
          const m = x.receipt_no?.match(/-(\d{6})-/)
          if (!m) return false
          const c = m[1]
          const d = `20${c.slice(0,2)}-${c.slice(2,4)}-${c.slice(4,6)}`
          return d >= dateFrom && d <= dateTo
        })),
        pb.collection(C.EXPENSES).getList(1, 500, { filter: `shop_id="${shop.id}"`, expand: 'category_id', '$autoCancel': false, '$cancelKey': 'report-expenses' }).then(r => r.items.filter(e => { const d = e.expense_date?.slice(0,10); return d && d >= dateFrom && d <= dateTo })),
        pb.collection(C.PRODUCTS).getList(1, 500, { filter: `shop_id="${shop.id}" && status="active"`, '$autoCancel': false, '$cancelKey': 'report-products' }).then(r => r.items),
        pb.collection(C.CATEGORIES).getList(1, 200, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'report-categories' }).then(r => r.items),
        pb.collection(C.EXPENSE_CATS).getList(1, 200, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'report-expcats' }).then(r => r.items)
      ])
      const sales = salesAll

      const revenue = sales.reduce((s, x) => s + (x.total_kes || 0), 0)
      const costOfSales = sales.reduce((s, x) => s + (x.total_cost_kes || 0), 0)
      const grossProfit = revenue - costOfSales
      const grossMargin = revenue ? (grossProfit / revenue) * 100 : 0
      const totalExpenses = expenses.reduce((s, x) => s + (x.amount_kes || 0), 0)
      const netProfit = grossProfit - totalExpenses
      const netMargin = revenue ? (netProfit / revenue) * 100 : 0

      // Expenses by category
      const expByCat = expCats.map(cat => ({
        name: `${cat.icon || ''} ${cat.name}`,
        total: expenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + e.amount_kes, 0)
      })).filter(c => c.total > 0)
      const uncatExp = expenses.filter(e => !e.category_id).reduce((s, e) => s + e.amount_kes, 0)
      if (uncatExp > 0) expByCat.push({ name: 'Other', total: uncatExp })

      // Sales by day for chart (use receipt_no date — created field may be empty)
      const salesByDay = {}
      sales.forEach(s => {
        const mm = s.receipt_no?.match(/-(\d{6})-/)
        if (!mm) return
        const cc = mm[1]
        const day = format(new Date(`20${cc.slice(0,2)}-${cc.slice(2,4)}-${cc.slice(4,6)}`), 'dd MMM')
        salesByDay[day] = (salesByDay[day] || 0) + s.total_kes
      })
      const salesChart = Object.entries(salesByDay).map(([label, revenue]) => ({ label, revenue })).slice(-30)

      // Monthly trend (last 6 months)
      const last6Months = eachMonthOfInterval({ start: subMonths(new Date(), 5), end: new Date() })
      const monthlyTrend = await Promise.all(last6Months.map(async (month) => {
        const mKey = format(month, 'yyyy-MM')
        const mFromDate = format(startOfMonth(month), 'yyyy-MM-dd')
        const mToDate = format(endOfMonth(month), 'yyyy-MM-dd')
        const mSales = await pb.collection(C.SALES).getList(1, 500, { filter: `shop_id="${shop.id}" && status="completed"`, '$autoCancel': false, '$cancelKey': `trend-sales-${mKey}` }).then(r => r.items.filter(x => {
          const mm = x.receipt_no?.match(/-(\d{6})-/)
          if (!mm) return false
          const cc = mm[1]
          const d = `20${cc.slice(0,2)}-${cc.slice(2,4)}-${cc.slice(4,6)}`
          return d >= mFromDate && d <= mToDate
        }))
        const mExp = await pb.collection(C.EXPENSES).getList(1, 500, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': `trend-exp-${mKey}` }).then(r => r.items.filter(e => { const d = e.expense_date?.slice(0,10); return d && d >= mFromDate && d <= mToDate }))
        const rev = mSales.reduce((s, x) => s + x.total_kes, 0)
        const cost = mSales.reduce((s, x) => s + (x.total_cost_kes || 0), 0)
        const exp = mExp.reduce((s, x) => s + x.amount_kes, 0)
        return { label: format(month, 'MMM yy'), revenue: rev, grossProfit: rev - cost, netProfit: rev - cost - exp, expenses: exp }
      }))

      // Stock valuation
      const stockVal = products.map(p => ({
        ...p,
        costValue: (p.stock_qty || 0) * (p.cost_price_kes || 0),
        retailValue: (p.stock_qty || 0) * (p.price_kes || 0),
      })).sort((a, b) => b.retailValue - a.retailValue)
      const totalStockCost = stockVal.reduce((s, p) => s + p.costValue, 0)
      const totalStockRetail = stockVal.reduce((s, p) => s + p.retailValue, 0)

      // Sales by product
      const saleItems = await pb.collection(C.SALE_ITEMS).getList(1, 500, { filter: `sale_id.shop_id="${shop.id}"`, expand: 'product_id', '$autoCancel': false, '$cancelKey': 'sale-items-report' }).then(r => r.items)
      const prodSales = {}
      saleItems.forEach(item => {
        const name = item.product_name || item.expand?.product_id?.name || item.product_id
        if (!prodSales[name]) prodSales[name] = { revenue: 0, qty: 0, profit: 0 }
        prodSales[name].revenue += item.total_kes
        prodSales[name].qty += item.qty
        prodSales[name].profit += (item.unit_price_kes - (item.unit_cost_kes || 0)) * item.qty
      })
      const topProducts = Object.entries(prodSales)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)

      // Payment method breakdown
      const payMethods = {}
      sales.forEach(s => { payMethods[s.payment_method] = (payMethods[s.payment_method] || 0) + s.total_kes })
      const payBreakdown = Object.entries(payMethods).map(([method, total]) => ({ method, total })).sort((a,b) => b.total - a.total)

      // Peak hours (guard against empty created field)
      const hourTally = Array(24).fill(0)
      sales.forEach(s => {
        if (!s.created) return
        const h = new Date(s.created.replace(' ', 'T')).getHours()
        if (!isNaN(h)) hourTally[h] += s.total_kes
      })
      const peakHours = Array.from({length: 12}, (_, i) => {
        const h = i * 2
        return { label: `${String(h).padStart(2,'0')}:00`, revenue: hourTally[h] + hourTally[h+1] }
      })

      // Customer stats (guard against empty created field)
      const customerSales = {}
      sales.forEach(s => {
        if (s.customer_id) {
          if (!customerSales[s.customer_id]) customerSales[s.customer_id] = { count: 0, total: 0 }
          customerSales[s.customer_id].count++
          customerSales[s.customer_id].total += s.total_kes
        }
      })
      const returningCount = Object.keys(customerSales).length
      const walkInCount = sales.filter(s => !s.customer_id).length
      const avgCustomerValue = returningCount ? Object.values(customerSales).reduce((s,c) => s + c.total, 0) / returningCount : 0

      setData({
        revenue, costOfSales, grossProfit, grossMargin,
        totalExpenses, netProfit, netMargin,
        expByCat, salesChart, monthlyTrend,
        stockVal, totalStockCost, totalStockRetail,
        topProducts, salesCount: sales.length,
        expensesRaw: expenses,
        payBreakdown, peakHours,
        returningCount, walkInCount, avgCustomerValue,
        creditOutstanding: sales.filter(s => s.payment_status === 'pending').reduce((sum, s) => sum + s.total_kes, 0),
      })
    } catch (err) {
      console.error(err)
      toast.error('Failed to load report')
    } finally { setLoading(false) }
  }

  const handlePrint = () => window.print()

  const exportCSV = (rows, filename) => {
    const headers = Object.keys(rows[0] || {})
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const PIE_COLORS = ['#c8456a','#e6b800','#8b2550','#059669','#3b82f6','#8b5cf6','#f59e0b','#ec4899']

  return (
    <div ref={printRef}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Reports & Analytics 📊</div>
          <div className="page-subtitle">{shop?.name} · {fmtDate(new Date(dateFrom))} – {fmtDate(new Date(dateTo))}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={handlePrint}><Printer size={16} /> Print</button>
        </div>
      </div>

      {/* Period & Date Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <label className="label">Quick Period</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['month', 'This Month'], ['last_month', 'Last Month'], ['year', 'This Year'], ['custom', 'Custom']].map(([v, l]) => (
                <button key={v} onClick={() => setPeriod(v)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: period === v ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fce8ed', color: period === v ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>{l}</button>
              ))}
            </div>
          </div>
          {period === 'custom' && <>
            <div>
              <label className="label">From</label>
              <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">To</label>
              <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </>}
        </div>
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{ padding: '9px 18px', borderRadius: 10, border: tab !== i ? '1px solid #f0e4e8' : 'none', background: tab === i ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fff', color: tab === i ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: tab === i ? '0 4px 14px #c8456a44' : '0 1px 4px #0001', fontFamily: 'Nunito,sans-serif' }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <div className="spinner" />
        </div>
      ) : data ? (
        <>
          {/* P&L Statement */}
          {tab === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* P&L Table */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, color: '#3d1020', margin: 0 }}>Profit & Loss Statement</h2>
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => exportCSV([
                    { Item: 'Revenue', Amount_KES: data.revenue },
                    { Item: 'Cost of Sales', Amount_KES: -data.costOfSales },
                    { Item: 'Gross Profit', Amount_KES: data.grossProfit },
                    { Item: 'Total Expenses', Amount_KES: -data.totalExpenses },
                    { Item: 'Net Profit', Amount_KES: data.netProfit },
                  ], 'pl-statement.csv')}>
                    <Download size={14} /> Export
                  </button>
                </div>

                <div style={{ fontSize: 12, color: '#9b6070', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 12 }}>
                  Period: {fmtDate(new Date(dateFrom))} – {fmtDate(new Date(dateTo))}
                </div>

                {/* Revenue Section */}
                <PLSection title="REVENUE" color="#059669">
                  <PLRow label="Gross Sales" value={data.revenue} bold />
                  <PLRow label="No. of Transactions" value={data.salesCount} isCurrency={false} color="#3b82f6" />
                </PLSection>

                <PLSection title="COST OF SALES" color="#dc2626">
                  <PLRow label="Cost of Goods Sold" value={data.costOfSales} negative />
                </PLSection>

                <PLRow label="GROSS PROFIT" value={data.grossProfit} bold big border
                  sub={`Margin: ${data.grossMargin.toFixed(1)}%`}
                  color={data.grossProfit >= 0 ? '#059669' : '#dc2626'} />

                <PLSection title="OPERATING EXPENSES" color="#dc2626" style={{ marginTop: 12 }}>
                  {data.expByCat.map((cat, i) => (
                    <PLRow key={i} label={cat.name} value={cat.total} negative indent />
                  ))}
                  <PLRow label="Total Expenses" value={data.totalExpenses} negative bold border />
                </PLSection>

                <div style={{ height: 8 }} />
                <PLRow label="NET PROFIT / (LOSS)" value={data.netProfit} bold big border
                  sub={`Net Margin: ${data.netMargin.toFixed(1)}%`}
                  color={data.netProfit >= 0 ? '#059669' : '#dc2626'} />
              </div>

              {/* Charts */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Revenue', value: fmtKES(data.revenue), color: '#c8456a', icon: '💰' },
                    { label: 'Gross Profit', value: fmtKES(data.grossProfit), color: '#059669', icon: '📈' },
                    { label: 'Total Expenses', value: fmtKES(data.totalExpenses), color: '#dc2626', icon: '💸' },
                    { label: 'Net Profit', value: fmtKES(data.netProfit), color: data.netProfit >= 0 ? '#059669' : '#dc2626', icon: data.netProfit >= 0 ? '🎯' : '⚠️' },
                  ].map((kpi, i) => (
                    <div key={i} className="card" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: 24 }}>{kpi.icon}</div>
                      <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                      <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>{kpi.label}</div>
                    </div>
                  ))}
                </div>

                {/* Monthly trend chart */}
                <div className="card">
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 16px' }}>6-Month Trend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={data.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9b6070' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => fmtKES(v)} contentStyle={{ borderRadius: 10, fontFamily: 'Nunito,sans-serif', fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Nunito,sans-serif' }} />
                      <Line type="monotone" dataKey="revenue" stroke="#c8456a" strokeWidth={2} dot={false} name="Revenue" />
                      <Line type="monotone" dataKey="grossProfit" stroke="#059669" strokeWidth={2} dot={false} name="Gross Profit" />
                      <Line type="monotone" dataKey="netProfit" stroke="#3b82f6" strokeWidth={2} dot={false} name="Net Profit" strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Expense breakdown pie */}
                {data.expByCat.length > 0 && (
                  <div className="card">
                    <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 12px' }}>Expense Breakdown</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={data.expByCat} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name.split(' ').slice(-1)[0]} ${(percent*100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                          {data.expByCat.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v) => fmtKES(v)} contentStyle={{ borderRadius: 10, fontFamily: 'Nunito,sans-serif', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Payment method breakdown */}
                {data.payBreakdown.length > 0 && (
                  <div className="card">
                    <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 12px' }}>💳 Payment Methods</h3>
                    {data.payBreakdown.map((pm, i) => (
                      <div key={i} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                          <span style={{ fontWeight: 600 }}>
                            {pm.method === 'cash' ? '💵 Cash' : pm.method === 'mpesa' ? '📱 M-Pesa' : pm.method === 'credit' ? '💳 Credit' : pm.method === 'mixed' ? '🔀 Split' : pm.method}
                          </span>
                          <span style={{ color: '#c8456a', fontWeight: 700 }}>{fmtKES(pm.total)}</span>
                        </div>
                        <div style={{ background: '#f5edf0', borderRadius: 4, height: 6 }}>
                          <div style={{ background: 'linear-gradient(90deg,#c8456a,#8b2550)', height: 6, borderRadius: 4, width: `${Math.min(100,(pm.total/data.revenue)*100)}%` }} />
                        </div>
                        <div style={{ fontSize: 10, color: '#9b6070', textAlign: 'right' }}>{data.revenue ? ((pm.total/data.revenue)*100).toFixed(1) : 0}%</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Customer insights */}
                <div className="card">
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 12px' }}>👥 Customer Insights</h3>
                  {[
                    { label: 'Repeat Customers', value: data.returningCount, icon: '🔄', color: '#059669' },
                    { label: 'Walk-in (No Name)', value: data.walkInCount, icon: '🚶', color: '#9b6070' },
                    { label: 'Avg Spend / Customer', value: fmtKES(data.avgCustomerValue), icon: '💰', color: '#c8456a' },
                    { label: 'Unpaid Credit', value: fmtKES(data.creditOutstanding), icon: '⚠️', color: data.creditOutstanding > 0 ? '#dc2626' : '#059669' },
                  ].map((kpi, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5edf0' }}>
                      <span style={{ fontSize: 13, color: '#6b4050' }}>{kpi.icon} {kpi.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: kpi.color }}>{kpi.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Balance Sheet */}
          {tab === 1 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, color: '#3d1020', margin: 0 }}>Balance Sheet</h2>
                  <div style={{ fontSize: 12, color: '#9b6070' }}>As at {fmtDate(new Date(dateTo))}</div>
                </div>

                <PLSection title="ASSETS" color="#059669">
                  <PLRow label="Stock Value (at cost)" value={data.totalStockCost} indent />
                  <PLRow label="Stock Value (at retail)" value={data.totalStockRetail} indent color="#6b4050" />
                  <PLRow label="Total Assets" value={data.totalStockCost} bold border />
                </PLSection>

                <div style={{ height: 20 }} />

                <PLSection title="EQUITY" color="#3b82f6">
                  <PLRow label="Net Profit (Period)" value={data.netProfit} indent color={data.netProfit >= 0 ? '#059669' : '#dc2626'} />
                  <PLRow label="Total Equity" value={data.netProfit} bold border color={data.netProfit >= 0 ? '#059669' : '#dc2626'} />
                </PLSection>

                <div style={{ height: 20 }} />
                <div style={{ background: data.netProfit >= 0 ? '#f0fdf4' : '#fff5f5', border: `1px solid ${data.netProfit >= 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1f' }}>Business Position</span>
                    <span style={{ fontFamily: 'Playfair Display,serif', fontWeight: 700, fontSize: 20, color: data.netProfit >= 0 ? '#059669' : '#dc2626' }}>
                      {data.netProfit >= 0 ? '✅ PROFITABLE' : '⚠️ LOSS-MAKING'}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#6b4050', marginTop: 6 }}>
                    {data.netProfit >= 0
                      ? `Business earned ${fmtKES(data.netProfit)} net profit this period (${data.netMargin.toFixed(1)}% net margin)`
                      : `Business made a net loss of ${fmtKES(Math.abs(data.netProfit))} this period`}
                  </div>
                </div>
              </div>

              {/* Stock value breakdown */}
              <div className="card">
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px' }}>Stock Asset Valuation</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, padding: '12px 16px', background: '#fce8ed', borderRadius: 10 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#c8456a' }}>{fmtKES(data.totalStockCost)}</div>
                    <div style={{ fontSize: 11, color: '#9b6070' }}>At Cost</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#059669' }}>{fmtKES(data.totalStockRetail)}</div>
                    <div style={{ fontSize: 11, color: '#9b6070' }}>At Retail</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>{fmtKES(data.totalStockRetail - data.totalStockCost)}</div>
                    <div style={{ fontSize: 11, color: '#9b6070' }}>Markup Value</div>
                  </div>
                </div>
                <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
                  <table>
                    <thead><tr><th>Product</th><th>Qty</th><th>Cost Value</th><th>Retail Value</th></tr></thead>
                    <tbody>
                      {data.stockVal.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</td>
                          <td style={{ fontSize: 12, textAlign: 'center' }}>{p.stock_qty || 0}</td>
                          <td style={{ fontSize: 12 }}>{fmtKES(p.costValue)}</td>
                          <td style={{ fontSize: 12, fontWeight: 600 }}>{fmtKES(p.retailValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Sales Report */}
          {tab === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => exportCSV(data.topProducts.map(p => ({ Product: p.name, Qty_Sold: p.qty, Revenue_KES: p.revenue.toFixed(2), Profit_KES: p.profit.toFixed(2) })), 'sales-report.csv')}>
                  <Download size={14} /> Export CSV
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
                <div className="card">
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px' }}>Daily Sales</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={data.salesChart} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9b6070' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => fmtKES(v)} contentStyle={{ borderRadius: 10, fontFamily: 'Nunito,sans-serif', fontSize: 12 }} />
                      <Bar dataKey="revenue" fill="url(#rg)" radius={[4,4,0,0]} name="Revenue">
                        <defs><linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8456a"/><stop offset="100%" stopColor="#8b2550"/></linearGradient></defs>
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 16px' }}>Top Products</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {data.topProducts.slice(0, 6).map((p, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                          <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{p.name}</span>
                          <span style={{ color: '#c8456a', fontWeight: 700 }}>{fmtKES(p.revenue)}</span>
                        </div>
                        <div style={{ background: '#f5edf0', borderRadius: 4, height: 5 }}>
                          <div style={{ background: 'linear-gradient(90deg,#c8456a,#8b2550)', height: 5, borderRadius: 4, width: `${Math.min(100,(p.revenue/data.topProducts[0].revenue)*100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Peak hours + transaction stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
                <div className="card">
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 16px' }}>⏰ Peak Selling Hours</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={data.peakHours} barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#9b6070' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => fmtKES(v)} contentStyle={{ borderRadius: 10, fontFamily: 'Nunito,sans-serif', fontSize: 12 }} />
                      <Bar dataKey="revenue" radius={[4,4,0,0]} name="Revenue">
                        {data.peakHours.map((entry, i) => {
                          const maxRev = Math.max(...data.peakHours.map(h => h.revenue))
                          return <Cell key={i} fill={entry.revenue === maxRev ? '#c8456a' : '#f0c0ce'} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{ fontSize: 11, color: '#9b6070', textAlign: 'center', marginTop: 4 }}>
                    🔥 Peak: {data.peakHours.reduce((a, b) => a.revenue > b.revenue ? a : b, {label:'—',revenue:0}).label} — {fmtKES(Math.max(...data.peakHours.map(h => h.revenue)))}
                  </div>
                </div>
                <div className="card">
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 12px' }}>📊 Period Stats</h3>
                  {[
                    { label: 'Total Transactions', value: data.salesCount },
                    { label: 'Avg Transaction', value: fmtKES(data.salesCount ? data.revenue / data.salesCount : 0) },
                    { label: 'Repeat Customers', value: data.returningCount },
                    { label: 'Walk-in Sales', value: data.walkInCount },
                    { label: 'Credit Outstanding', value: fmtKES(data.creditOutstanding), alert: data.creditOutstanding > 0 },
                  ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid #f5edf0' }}>
                      <span style={{ color: '#6b4050' }}>{s.label}</span>
                      <span style={{ fontWeight: 700, color: s.alert ? '#dc2626' : '#1a1a1f' }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between' }}>
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: 0 }}>Product Performance</h3>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Product</th><th>Units Sold</th><th>Revenue</th><th>Gross Profit</th><th>Margin</th></tr></thead>
                    <tbody>
                      {data.topProducts.map((p, i) => (
                        <tr key={i}>
                          <td style={{ color: '#9b6070', fontSize: 12 }}>#{i+1}</td>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td>{p.qty}</td>
                          <td style={{ fontWeight: 600 }}>{fmtKES(p.revenue)}</td>
                          <td style={{ color: '#059669', fontWeight: 600 }}>{fmtKES(p.profit)}</td>
                          <td>
                            <span style={{ background: p.revenue ? (p.profit/p.revenue>0.4?'#f0fdf4':p.profit/p.revenue>0.2?'#fefce8':'#fee2e2') : '#f5f5f5', color: p.revenue ? (p.profit/p.revenue>0.4?'#059669':p.profit/p.revenue>0.2?'#d97706':'#dc2626') : '#9b6070', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>
                              {p.revenue ? ((p.profit/p.revenue)*100).toFixed(0) : 0}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Expense Report */}
          {tab === 3 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: 0 }}>All Expenses</h3>
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => exportCSV(data.expensesRaw.map(e => ({ Date: e.expense_date?.split('T')[0], Description: e.description, Category: e.expand?.category_id?.name||'', Amount_KES: e.amount_kes, Payment: e.payment_method, Ref: e.reference||'' })), 'expenses.csv')}>
                    <Download size={14} /> CSV
                  </button>
                </div>
                <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <table>
                    <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
                    <tbody>
                      {data.expensesRaw.map(e => (
                        <tr key={e.id}>
                          <td style={{ fontSize: 11, color: '#9b6070' }}>{fmtDate(e.expense_date)}</td>
                          <td style={{ fontSize: 13 }}>{e.description}</td>
                          <td style={{ fontSize: 12 }}>{e.expand?.category_id?.icon} {e.expand?.category_id?.name || '—'}</td>
                          <td style={{ fontWeight: 700, color: '#dc2626' }}>{fmtKES(e.amount_kes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="card">
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 16px' }}>By Category</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.expByCat} layout="vertical" barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#9b6070' }} axisLine={false} tickLine={false} width={100} />
                      <Tooltip formatter={(v) => fmtKES(v)} contentStyle={{ borderRadius: 10, fontFamily: 'Nunito,sans-serif', fontSize: 12 }} />
                      <Bar dataKey="total" fill="#c8456a" radius={[0,6,6,0]} name="Amount" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#3d1020', marginBottom: 12 }}>Category Summary</div>
                  {data.expByCat.map((cat, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f5edf0' }}>
                      <span>{cat.name}</span>
                      <span style={{ fontWeight: 700, color: '#dc2626' }}>{fmtKES(cat.total)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, padding: '10px 0 0', fontWeight: 700 }}>
                    <span>TOTAL</span>
                    <span style={{ color: '#dc2626', fontFamily: 'Playfair Display,serif' }}>{fmtKES(data.totalExpenses)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stock Valuation */}
          {tab === 4 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button className="btn-secondary" onClick={() => exportCSV(data.stockVal.map(p => ({ Product: p.name, Brand: p.brand||'', SKU: p.sku||'', Barcode: p.barcode||'', Stock_Qty: p.stock_qty||0, Unit: p.unit||'', Cost_Price: p.cost_price_kes||0, Selling_Price: p.price_kes||0, Cost_Value: p.costValue.toFixed(2), Retail_Value: p.retailValue.toFixed(2) })), 'stock-valuation.csv')}>
                  <Download size={14} /> Export CSV
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
                {[
                  { label: 'Total Products', value: data.stockVal.length, color: '#c8456a', icon: '📦' },
                  { label: 'Stock at Cost', value: fmtKES(data.totalStockCost), color: '#d97706', icon: '💰' },
                  { label: 'Stock at Retail', value: fmtKES(data.totalStockRetail), color: '#059669', icon: '🏷️' },
                ].map((kpi, i) => (
                  <div key={i} className="stat-card">
                    <div style={{ fontSize: 28 }}>{kpi.icon}</div>
                    <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                    <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{kpi.label}</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Product</th><th>Brand</th><th>Barcode</th><th>Qty</th><th>Cost Price</th><th>Selling Price</th><th>Cost Value</th><th>Retail Value</th><th>Markup %</th></tr></thead>
                    <tbody>
                      {data.stockVal.map(p => {
                        const markup = p.cost_price_kes ? (((p.price_kes - p.cost_price_kes) / p.cost_price_kes) * 100).toFixed(0) : null
                        return (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</td>
                            <td style={{ fontSize: 12, color: '#9b6070' }}>{p.brand || '—'}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.barcode || p.sku || '—'}</td>
                            <td style={{ fontWeight: 700, color: p.stock_qty <= 0 ? '#dc2626' : '#1a1a1f' }}>{p.stock_qty || 0}</td>
                            <td>{fmtKES(p.cost_price_kes)}</td>
                            <td style={{ fontWeight: 600 }}>{fmtKES(p.price_kes)}</td>
                            <td>{fmtKES(p.costValue)}</td>
                            <td style={{ fontWeight: 600 }}>{fmtKES(p.retailValue)}</td>
                            <td>{markup !== null ? <span style={{ background: markup > 50 ? '#f0fdf4' : '#fefce8', color: markup > 50 ? '#059669' : '#d97706', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{markup}%</span> : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

function PLSection({ title, color, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color, marginBottom: 6, paddingBottom: 4, borderBottom: `2px solid ${color}22` }}>{title}</div>
      {children}
    </div>
  )
}

function PLRow({ label, value, bold, big, negative, indent, border, sub, color, isCurrency = true }) {
  const display = isCurrency ? fmtKES(Math.abs(value)) : value
  const displayColor = color || (negative ? '#dc2626' : '#1a1a1f')
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: `${big ? 10 : 5}px 0`, borderTop: border ? '1.5px solid #f0e4e8' : 'none', marginTop: border ? 4 : 0 }}>
      <div>
        <span style={{ fontSize: big ? 15 : 13, fontWeight: bold ? 700 : 400, color: '#3d1020', paddingLeft: indent ? 12 : 0 }}>{label}</span>
        {sub && <div style={{ fontSize: 11, color: '#9b6070' }}>{sub}</div>}
      </div>
      <span style={{ fontSize: big ? 16 : 13, fontWeight: bold ? 700 : 500, color: displayColor, fontFamily: big ? 'Playfair Display,serif' : 'Nunito,sans-serif' }}>
        {negative && isCurrency && value > 0 ? '(' : ''}{display}{negative && isCurrency && value > 0 ? ')' : ''}
      </span>
    </div>
  )
}