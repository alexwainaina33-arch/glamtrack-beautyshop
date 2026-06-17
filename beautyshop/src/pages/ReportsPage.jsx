import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate } from '../lib/utils'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, eachMonthOfInterval } from 'date-fns'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Download, Printer, TrendingUp, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'

const TABS = ['P&L Statement', 'Balance Sheet', 'Sales Report', 'Expense Report', 'Stock Valuation', '🏦 Lender Pack']

export default function ReportsPage() {
  const { shop, loading: authLoading } = useAuth()
  const [tab, setTab] = useState(0)
  const [period, setPeriod] = useState('month')
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const printRef = useRef()

  // ── LENDER PACK STATE ──────────────────────────────────────────────
  const [lenderData, setLenderData]     = useState(null)
  const [lenderLoading, setLenderLoading] = useState(false)
  const [dscrLoan, setDscrLoan]         = useState('')
  const [dscrTerm, setDscrTerm]         = useState('12')
  const [dscrRate, setDscrRate]         = useState('14')

  useEffect(() => { if (tab === 5 && shop && !lenderData) loadLenderData() }, [tab, shop])

  const loadLenderData = async () => {
    setLenderLoading(true)
    try {
      // Lifetime sales — getFullList, shop_id only, no date limit
      const lifetimeSales = await pb.collection(C.SALES).getFullList({
        filter: `shop_id="${shop.id}" && status="completed"`,
        '$autoCancel': false, '$cancelKey': 'lender-lifetime',
      })

      // Parse date from receipt_no (same pattern used everywhere — created field unreliable)
      const rDate = (s) => {
        const m = s?.receipt_no?.match(/-(\d{6})-/)
        if (!m) return null
        const c = m[1]
        return `20${c.slice(0,2)}-${c.slice(2,4)}-${c.slice(4,6)}`
      }

      // Months active — from shop.created to today
      const shopCreated = shop.created ? new Date(shop.created) : new Date()
      const monthsActive = Math.max(1, Math.round((new Date() - shopCreated) / (1000 * 60 * 60 * 24 * 30.44)))
      const lifetimeRevenue = lifetimeSales.reduce((s, x) => s + (x.total_kes || 0), 0)
      const avgMonthlyRevenue = lifetimeRevenue / monthsActive

      // AR Aging — credit sales with payment_status pending
      const pendingSales = lifetimeSales.filter(s => s.payment_status === 'pending' || s.payment_status === 'partial')
      const today = new Date()
      const arBuckets = { current: { count: 0, total: 0 }, d30: { count: 0, total: 0 }, d60: { count: 0, total: 0 }, d90: { count: 0, total: 0 } }
      pendingSales.forEach(s => {
        const d = rDate(s)
        if (!d) return
        const age = Math.floor((today - new Date(d)) / 86400000)
        const amt = s.total_kes || 0
        if (age <= 30)      { arBuckets.current.count++; arBuckets.current.total += amt }
        else if (age <= 60) { arBuckets.d30.count++;     arBuckets.d30.total += amt }
        else if (age <= 90) { arBuckets.d60.count++;     arBuckets.d60.total += amt }
        else                { arBuckets.d90.count++;     arBuckets.d90.total += amt }
      })
      const totalAR = Object.values(arBuckets).reduce((s, b) => s + b.total, 0)

      // 6-month P&L — parallel fetches
      const last6 = eachMonthOfInterval({ start: subMonths(new Date(), 5), end: new Date() })
      const monthlyPL = await Promise.all(last6.map(async (month) => {
        const mKey   = format(month, 'yyyy-MM')
        const mFrom  = format(startOfMonth(month), 'yyyy-MM-dd')
        const mTo    = format(endOfMonth(month), 'yyyy-MM-dd')
        const mSales = lifetimeSales.filter(x => { const d = rDate(x); return d && d >= mFrom && d <= mTo })
        const mExp   = await pb.collection(C.EXPENSES).getList(1, 500, {
          filter: `shop_id="${shop.id}"`,
          '$autoCancel': false, '$cancelKey': `lender-exp-${mKey}`,
        }).then(r => r.items.filter(e => { const d = e.expense_date?.slice(0,10); return d && d >= mFrom && d <= mTo }))
        const revenue    = mSales.reduce((s, x) => s + (x.total_kes || 0), 0)
        const cogs       = mSales.reduce((s, x) => s + (x.total_cost_kes || 0), 0)
        const grossProfit = revenue - cogs
        const expenses   = mExp.reduce((s, x) => s + (x.amount_kes || 0), 0)
        const netProfit  = grossProfit - expenses
        const txCount    = mSales.length
        return {
          label: format(month, 'MMMM yyyy'),
          short: format(month, 'MMM yy'),
          revenue, cogs, grossProfit, expenses, netProfit, txCount,
          netMargin: revenue ? ((netProfit / revenue) * 100).toFixed(1) : '0.0',
        }
      }))

      const totalRevenue6m   = monthlyPL.reduce((s, m) => s + m.revenue, 0)
      const totalNetProfit6m = monthlyPL.reduce((s, m) => s + m.netProfit, 0)
      const avgMonthlyNet    = totalNetProfit6m / 6
      const activeMonths     = monthlyPL.filter(m => m.revenue > 0).length

      // Revenue consistency score — how many of the 6 months were profitable
      const profitableMonths = monthlyPL.filter(m => m.netProfit > 0).length
      const consistencyScore = Math.round((profitableMonths / 6) * 100)

      // Growth rate — last month vs first month revenue
      const firstMonthRev = monthlyPL[0]?.revenue || 0
      const lastMonthRev  = monthlyPL[5]?.revenue || 0
      const growthRate    = firstMonthRev > 0 ? (((lastMonthRev - firstMonthRev) / firstMonthRev) * 100).toFixed(0) : null

      setLenderData({
        lifetimeRevenue, lifetimeTx: lifetimeSales.length,
        monthsActive, avgMonthlyRevenue, avgMonthlyNet,
        monthlyPL, totalRevenue6m, totalNetProfit6m,
        activeMonths, profitableMonths, consistencyScore, growthRate,
        arBuckets, totalAR,
        generatedAt: new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }),
        reportId: `${shop.id.slice(0,8).toUpperCase()}-${format(new Date(), 'yyyyMMdd')}`,
      })
    } catch (err) {
      console.error(err)
      toast.error('Failed to load lender data')
    } finally { setLenderLoading(false) }
  }

  const calcDSCR = () => {
    if (!lenderData || !dscrLoan || !dscrTerm || !dscrRate) return null
    const principal    = parseFloat(dscrLoan)
    const months       = parseInt(dscrTerm)
    const annualRate   = parseFloat(dscrRate)
    if (!principal || !months || !annualRate) return null
    const r            = annualRate / 100 / 12
    const monthlyPmt   = r === 0 ? principal / months : (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1)
    const dscr         = lenderData.avgMonthlyNet > 0 ? lenderData.avgMonthlyNet / monthlyPmt : 0
    return { monthlyPmt, dscr }
  }

  const shareLenderWhatsApp = () => {
    if (!lenderData) return
    const d = lenderData
    const calc = calcDSCR()
    const lines = [
      `🏦 *Business Credit Summary*`,
      `*${shop?.name || ''}*`,
      ``,
      `Business Active`,
      `*${d.monthsActive} months*`,
      ``,
      `6-Month Total Revenue`,
      `*${fmtKES(d.totalRevenue6m)}*`,
      ``,
      `Average Monthly Revenue`,
      `*${fmtKES(d.avgMonthlyRevenue)}*`,
      ``,
      `Average Monthly Net Profit`,
      `*${fmtKES(d.avgMonthlyNet)}*`,
      ``,
      `Revenue Consistency`,
      `*${d.profitableMonths}/6 months profitable (${d.consistencyScore}%)*`,
      ...(d.growthRate !== null ? [``, `Revenue Growth (6 months)`, `*${d.growthRate > 0 ? '+' : ''}${d.growthRate}%*`] : []),
      ...(calc ? [``, `Debt Service Coverage Ratio`, `*${calc.dscr.toFixed(2)}x* ${calc.dscr >= 1.25 ? '✅ Bankable' : calc.dscr >= 1.0 ? '⚠️ Borderline' : '❌ High Risk'}`] : []),
      ``,
      `_All figures verified from immutable transaction records._`,
      `_Records cannot be edited or deleted by any user._`,
      `_Report ID: ${d.reportId}_`,
      `_${shop?.name} · Powered by SalesTrack_`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank')
  }

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

  const sharePLWhatsApp = () => {
    if (!data) return
    const lines = [
      `📊 *Profit & Loss Statement*`,
      `*${shop?.name || ''}*`,
      `Period: ${fmtDate(new Date(dateFrom))} – ${fmtDate(new Date(dateTo))}`,
      ``,
      `*REVENUE*`,
      fmtKES(data.revenue),
      ``,
      `*COST OF SALES*`,
      fmtKES(data.costOfSales),
      ``,
      `*GROSS PROFIT*`,
      `${fmtKES(data.grossProfit)} (${data.grossMargin.toFixed(1)}% margin)`,
      ``,
      `*OPERATING EXPENSES*`,
      fmtKES(data.totalExpenses),
      ``,
      `*NET PROFIT*`,
      `${fmtKES(data.netProfit)} (${data.netMargin.toFixed(1)}% margin)`,
      ``,
      `Transactions: ${data.salesCount}`,
      ``,
      `_Verified business records · Generated via SalesTrack_`,
      `_${shop?.name || ''} · Powered by SalesTrack_`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank')
  }

  const PIE_COLORS = ['#c8456a','#e6b800','#8b2550','#059669','#3b82f6','#8b5cf6','#f59e0b','#ec4899']

  return (
    <div ref={printRef}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* P&L Table */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                  <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, color: '#3d1020', margin: 0 }}>Profit & Loss Statement</h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={sharePLWhatsApp} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      📲 Share
                    </button>
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
                <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
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
              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
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
            <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
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
              <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
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
        {/* ═══ LENDER PACK ═══ */}
          {tab === 5 && (
            <div>
              <style>{`
                @media print {
                  .no-print { display: none !important; }
                  .page-header, .tab-nav-wrap, .period-filter-card { display: none !important; }
                  body { font-size: 12px !important; }
                  .lender-pack-root { max-width: 100% !important; }
                  .lender-section { page-break-inside: avoid; margin-bottom: 24px; }
                  .lender-print-header { display: flex !important; }
                }
                .lender-print-header { display: none; }
              `}</style>

              {/* Print-only header */}
              <div className="lender-print-header" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, paddingBottom: 12, borderBottom: '2px solid #c8456a' }}>
                <div>
                  <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700, color: '#3d1020' }}>{shop?.name}</div>
                  <div style={{ fontSize: 12, color: '#9b6070' }}>{shop?.business_type || 'Business'} · Business Credit Report</div>
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: '#9b6070' }}>
                  <div>Generated: {lenderData?.generatedAt}</div>
                  <div>Report ID: {lenderData?.reportId}</div>
                </div>
              </div>

              {/* Page header */}
              <div className="page-header no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, color: '#3d1020', fontWeight: 700 }}>🏦 Lender Pack</div>
                  <div style={{ fontSize: 13, color: '#9b6070', marginTop: 2 }}>Bank-grade credit document · {shop?.name} · Generated from verified immutable records</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={shareLenderWhatsApp} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    📲 Share Summary
                  </button>
                  <button onClick={() => window.print()} style={{ padding: '9px 16px', borderRadius: 10, border: '1.5px solid #c8456a', background: '#fff', color: '#c8456a', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    🖨️ Print / Save PDF
                  </button>
                  <button onClick={() => { setLenderData(null); loadLenderData() }} style={{ padding: '9px 16px', borderRadius: 10, border: '1.5px solid #f0e4e8', background: '#fff', color: '#9b6070', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    ↻ Refresh
                  </button>
                </div>
              </div>

              {lenderLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontSize: 13, color: '#9b6070' }}>Loading verified financial data…</div>
                  </div>
                </div>
              ) : lenderData ? (() => {
                const calc   = calcDSCR()
                const dscrOk = calc ? calc.dscr >= 1.25 : null
                const d      = lenderData
                return (
                  <div className="lender-pack-root">

                    {/* ── SECTION 1: BUSINESS SUMMARY ── */}
                    <div className="lender-section card" style={{ marginBottom: 20, background: 'linear-gradient(135deg,#3d1020,#8b2550)', color: '#fff', borderRadius: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Business Credit Report</div>
                          <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{shop?.name}</div>
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{shop?.business_type || 'Retail Business'} · {shop?.address || 'Kenya'}</div>
                          {shop?.phone && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{shop.phone}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Report ID</div>
                          <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>{d.reportId}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Generated</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{d.generatedAt}</div>
                        </div>
                      </div>

                      <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 20 }}>
                        {[
                          { label: 'Months Active', value: `${d.monthsActive}`, sub: 'on SalesTrack' },
                          { label: 'Lifetime Revenue', value: fmtKES(d.lifetimeRevenue), sub: `${d.lifetimeTx} transactions` },
                          { label: 'Avg Monthly Revenue', value: fmtKES(d.avgMonthlyRevenue), sub: 'all-time average' },
                          { label: 'Avg Monthly Net Profit', value: fmtKES(d.avgMonthlyNet), sub: 'last 6 months' },
                        ].map((kpi, i) => (
                          <div key={i} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#fff' }}>{kpi.value}</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{kpi.label}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>{kpi.sub}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── SECTION 2: 6-MONTH P&L TABLE ── */}
                    <div className="lender-section card" style={{ marginBottom: 20, padding: 0 }}>
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 2px' }}>6-Month Financial Performance</h2>
                          <div style={{ fontSize: 12, color: '#9b6070' }}>Month-by-month revenue, costs and profit — the core lending assessment table</div>
                        </div>
                        <button className="btn-secondary no-print" style={{ fontSize: 12 }} onClick={() => {
                          const rows = [
                            ...d.monthlyPL.map(m => ({ Month: m.label, Revenue_KES: m.revenue, COGS_KES: m.cogs, Gross_Profit_KES: m.grossProfit, Expenses_KES: m.expenses, Net_Profit_KES: m.netProfit, Net_Margin_Pct: m.netMargin, Transactions: m.txCount })),
                            { Month: 'TOTAL / AVERAGE', Revenue_KES: d.totalRevenue6m, COGS_KES: d.monthlyPL.reduce((s,m)=>s+m.cogs,0), Gross_Profit_KES: d.monthlyPL.reduce((s,m)=>s+m.grossProfit,0), Expenses_KES: d.monthlyPL.reduce((s,m)=>s+m.expenses,0), Net_Profit_KES: d.totalNetProfit6m, Net_Margin_Pct: d.totalRevenue6m ? ((d.totalNetProfit6m/d.totalRevenue6m)*100).toFixed(1) : '0.0', Transactions: d.monthlyPL.reduce((s,m)=>s+m.txCount,0) }
                          ]
                          const headers = Object.keys(rows[0])
                          const csv = [headers.join(','), ...rows.map(r => headers.map(h=>`"${r[h]??''}"`).join(','))].join('\n')
                          const blob = new Blob([csv], { type: 'text/csv' })
                          const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`${shop?.name?.replace(/\s+/g,'-')}-6month-pl.csv`; a.click(); URL.revokeObjectURL(url)
                        }}>
                          ⬇️ Download CSV
                        </button>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Month</th>
                              <th style={{ textAlign: 'right' }}>Revenue</th>
                              <th style={{ textAlign: 'right' }}>COGS</th>
                              <th style={{ textAlign: 'right' }}>Gross Profit</th>
                              <th style={{ textAlign: 'right' }}>Expenses</th>
                              <th style={{ textAlign: 'right' }}>Net Profit</th>
                              <th style={{ textAlign: 'right' }}>Margin</th>
                              <th style={{ textAlign: 'right' }}>Txns</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.monthlyPL.map((m, i) => (
                              <tr key={i} style={{ background: m.netProfit < 0 ? '#fff5f5' : 'transparent' }}>
                                <td style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>{m.label}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtKES(m.revenue)}</td>
                                <td style={{ textAlign: 'right', color: '#dc2626', fontSize: 12 }}>({fmtKES(m.cogs)})</td>
                                <td style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>{fmtKES(m.grossProfit)}</td>
                                <td style={{ textAlign: 'right', color: '#dc2626', fontSize: 12 }}>({fmtKES(m.expenses)})</td>
                                <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'Playfair Display,serif', color: m.netProfit >= 0 ? '#059669' : '#dc2626', fontSize: 15 }}>{fmtKES(m.netProfit)}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <span style={{ background: parseFloat(m.netMargin) > 10 ? '#f0fdf4' : parseFloat(m.netMargin) > 0 ? '#fefce8' : '#fee2e2', color: parseFloat(m.netMargin) > 10 ? '#059669' : parseFloat(m.netMargin) > 0 ? '#d97706' : '#dc2626', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{m.netMargin}%</span>
                                </td>
                                <td style={{ textAlign: 'right', color: '#9b6070', fontSize: 12 }}>{m.txCount}</td>
                              </tr>
                            ))}
                            {/* Total row */}
                            <tr style={{ background: '#fdf5f7', borderTop: '2px solid #c8456a' }}>
                              <td style={{ fontWeight: 800, fontSize: 13 }}>6-MONTH TOTAL</td>
                              <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmtKES(d.totalRevenue6m)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>({fmtKES(d.monthlyPL.reduce((s,m)=>s+m.cogs,0))})</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>{fmtKES(d.monthlyPL.reduce((s,m)=>s+m.grossProfit,0))}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>({fmtKES(d.monthlyPL.reduce((s,m)=>s+m.expenses,0))})</td>
                              <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'Playfair Display,serif', color: d.totalNetProfit6m >= 0 ? '#059669' : '#dc2626', fontSize: 16 }}>{fmtKES(d.totalNetProfit6m)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <span style={{ background: '#fdf5f7', color: '#c8456a', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800 }}>
                                  {d.totalRevenue6m ? ((d.totalNetProfit6m/d.totalRevenue6m)*100).toFixed(1) : '0'}%
                                </span>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700 }}>{d.monthlyPL.reduce((s,m)=>s+m.txCount,0)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* ── SECTION 3: REVENUE TREND CHART ── */}
                    <div className="lender-section card" style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 2px' }}>Revenue & Profit Trend</h2>
                          <div style={{ fontSize: 12, color: '#9b6070' }}>Month-on-month trajectory — a rising trend signals a healthy, growing business</div>
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          {d.growthRate !== null && (
                            <div style={{ textAlign: 'center', background: parseFloat(d.growthRate) >= 0 ? '#f0fdf4' : '#fff5f5', borderRadius: 10, padding: '8px 14px' }}>
                              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700, color: parseFloat(d.growthRate) >= 0 ? '#059669' : '#dc2626' }}>
                                {parseFloat(d.growthRate) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(d.growthRate))}%
                              </div>
                              <div style={{ fontSize: 11, color: '#9b6070' }}>Revenue growth</div>
                            </div>
                          )}
                          <div style={{ textAlign: 'center', background: d.consistencyScore >= 67 ? '#f0fdf4' : d.consistencyScore >= 34 ? '#fefce8' : '#fff5f5', borderRadius: 10, padding: '8px 14px' }}>
                            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700, color: d.consistencyScore >= 67 ? '#059669' : d.consistencyScore >= 34 ? '#d97706' : '#dc2626' }}>
                              {d.profitableMonths}/6
                            </div>
                            <div style={{ fontSize: 11, color: '#9b6070' }}>Profitable months</div>
                          </div>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={d.monthlyPL.map(m => ({ label: m.short, revenue: m.revenue, netProfit: Math.max(0, m.netProfit) }))} barSize={28} isAnimationActive={false}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9b6070' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: '#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v) => fmtKES(v)} contentStyle={{ borderRadius: 10, fontFamily: 'Nunito,sans-serif', fontSize: 12 }} />
                          <Bar dataKey="revenue" fill="#f0c0ce" radius={[4,4,0,0]} name="Revenue" />
                          <Bar dataKey="netProfit" fill="#c8456a" radius={[4,4,0,0]} name="Net Profit" />
                        </BarChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: '#9b6070', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#f0c0ce', display: 'inline-block' }} />Revenue</span>
                        <span style={{ fontSize: 11, color: '#9b6070', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: '#c8456a', display: 'inline-block' }} />Net Profit</span>
                      </div>
                    </div>

                    {/* ── SECTION 4: DSCR CALCULATOR ── */}
                    <div className="lender-section card" style={{ marginBottom: 20 }}>
                      <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 4px' }}>Debt Service Coverage Ratio (DSCR)</h2>
                      <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 20 }}>
                        DSCR = Average Monthly Net Profit ÷ Monthly Loan Repayment. Banks require ≥1.25x to approve a loan.
                        Enter the proposed loan details to calculate this business's borrowing capacity.
                      </div>
                      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                        <div>
                          <label className="label">Loan Amount (KES)</label>
                          <input className="input" type="number" min={0} placeholder="e.g. 500000" value={dscrLoan} onChange={e => setDscrLoan(e.target.value)} />
                        </div>
                        <div>
                          <label className="label">Loan Term (months)</label>
                          <input className="input" type="number" min={1} max={120} placeholder="e.g. 12" value={dscrTerm} onChange={e => setDscrTerm(e.target.value)} />
                        </div>
                        <div>
                          <label className="label">Annual Interest Rate (%)</label>
                          <input className="input" type="number" min={0} max={100} step={0.1} placeholder="e.g. 14" value={dscrRate} onChange={e => setDscrRate(e.target.value)} />
                        </div>
                      </div>

                      {calc ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                          <div style={{ background: '#fdf5f7', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 4 }}>Monthly Repayment</div>
                            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700, color: '#c8456a' }}>{fmtKES(calc.monthlyPmt)}</div>
                          </div>
                          <div style={{ background: '#fdf5f7', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 4 }}>Avg Monthly Net Profit</div>
                            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700, color: d.avgMonthlyNet >= 0 ? '#059669' : '#dc2626' }}>{fmtKES(d.avgMonthlyNet)}</div>
                          </div>
                          <div style={{ background: calc.dscr >= 1.25 ? '#f0fdf4' : calc.dscr >= 1.0 ? '#fefce8' : '#fee2e2', borderRadius: 12, padding: '16px', textAlign: 'center', border: `2px solid ${calc.dscr >= 1.25 ? '#059669' : calc.dscr >= 1.0 ? '#d97706' : '#dc2626'}` }}>
                            <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 4 }}>DSCR</div>
                            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 32, fontWeight: 700, color: calc.dscr >= 1.25 ? '#059669' : calc.dscr >= 1.0 ? '#d97706' : '#dc2626' }}>{calc.dscr.toFixed(2)}x</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: calc.dscr >= 1.25 ? '#059669' : calc.dscr >= 1.0 ? '#d97706' : '#dc2626', marginTop: 4 }}>
                              {calc.dscr >= 1.25 ? '✅ Bankable' : calc.dscr >= 1.0 ? '⚠️ Borderline' : '❌ High Risk'}
                            </div>
                            {calc.dscr < 1.25 && calc.dscr > 0 && (
                              <div style={{ fontSize: 11, color: '#9b6070', marginTop: 6 }}>
                                Try {fmtKES(Math.floor(d.avgMonthlyNet * 0.8 / (parseFloat(dscrRate)/100/12) * (1 - Math.pow(1 + parseFloat(dscrRate)/100/12, -parseInt(dscrTerm)))))} max loan for 1.25x DSCR
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ background: '#fdf5f7', borderRadius: 12, padding: '20px', textAlign: 'center', color: '#9b6070', fontSize: 13 }}>
                          Enter loan details above to calculate borrowing capacity
                        </div>
                      )}
                    </div>

                    {/* ── SECTION 5: AR AGING ── */}
                    <div className="lender-section card" style={{ marginBottom: 20 }}>
                      <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 4px' }}>Accounts Receivable Aging</h2>
                      <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 16 }}>Unpaid credit sales grouped by age. A healthy business collects most receivables within 30 days.</div>
                      {d.totalAR === 0 ? (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: 24, marginBottom: 4 }}>✅</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>No outstanding receivables</div>
                          <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>All sales are collected — excellent cash flow hygiene</div>
                        </div>
                      ) : (
                        <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                          {[
                            { label: 'Current (0–30 days)', data: d.arBuckets.current, color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
                            { label: '31–60 Days', data: d.arBuckets.d30, color: '#d97706', bg: '#fefce8', border: '#fde68a' },
                            { label: '61–90 Days', data: d.arBuckets.d60, color: '#ea580c', bg: '#fff7ed', border: '#fed7aa' },
                            { label: '90+ Days (Bad Debt Risk)', data: d.arBuckets.d90, color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' },
                          ].map((bucket, i) => (
                            <div key={i} style={{ background: bucket.bg, border: `1px solid ${bucket.border}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700, color: bucket.color }}>{fmtKES(bucket.data.total)}</div>
                              <div style={{ fontSize: 11, color: bucket.color, fontWeight: 600, marginTop: 2 }}>{bucket.data.count} invoice{bucket.data.count !== 1 ? 's' : ''}</div>
                              <div style={{ fontSize: 10, color: '#9b6070', marginTop: 4 }}>{bucket.label}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {d.totalAR > 0 && (
                        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#fdf5f7', borderRadius: 10, fontSize: 13 }}>
                          <span style={{ fontWeight: 600, color: '#3d1020' }}>Total Outstanding AR</span>
                          <span style={{ fontWeight: 800, color: '#c8456a', fontFamily: 'Playfair Display,serif', fontSize: 16 }}>{fmtKES(d.totalAR)}</span>
                        </div>
                      )}
                    </div>

                    {/* ── SECTION 6: VERIFICATION FOOTER ── */}
                    <div className="lender-section" style={{ background: '#1a1a1f', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ fontSize: 24, flexShrink: 0 }}>🔒</div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: '#fff', marginBottom: 6 }}>Data Integrity Verification</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
                            All figures in this report are derived exclusively from immutable transaction records maintained by SalesTrack.
                            No transaction, sale, or financial record in this system can be edited or deleted by any user — including the shop owner, managers, or SalesTrack administrators.
                            Every sale is timestamped, shop-isolated, and permanently stored with a full audit trail.
                            This data meets the standards required for credit assessment under CBK Prudential Guidelines for SME lending.
                          </div>
                          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {[
                              { label: 'Report ID', value: d.reportId },
                              { label: 'Generated', value: d.generatedAt },
                              { label: 'Business', value: shop?.name },
                              { label: 'Data Source', value: 'SalesTrack POS — Immutable Ledger' },
                            ].map((r, i) => (
                              <div key={i} style={{ fontSize: 11 }}>
                                <span style={{ color: 'rgba(255,255,255,0.4)' }}>{r.label}: </span>
                                <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{r.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                  </div>
                )
              })() : (
                <div style={{ textAlign: 'center', padding: 60, color: '#9b6070' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🏦</div>
                  <div style={{ fontSize: 14 }}>Click Refresh to load your lender pack</div>
                </div>
              )}
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