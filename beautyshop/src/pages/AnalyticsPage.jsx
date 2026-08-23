import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, r2 } from '../lib/utils'
import { subDays, subWeeks, subMonths, format, eachWeekOfInterval, endOfWeek, eachMonthOfInterval } from 'date-fns'
import { AlertCircle, Zap, Download } from 'lucide-react'
import { ResponsiveContainer, Tooltip, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Cell } from 'recharts'
import toast from 'react-hot-toast'

export default function AnalyticsPage() {
  const { shop, loading: authLoading } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generatingPO, setGeneratingPO] = useState(false)
  const [windowDays, setWindowDays] = useState(30)
  const [trendGrain, setTrendGrain] = useState('week')

  useEffect(() => { if (shop) loadAnalytics() }, [shop, windowDays])

  // receipt_no is the reliable date source — `created` can be empty on
  // offline-synced records (same gotcha already documented for Dead Hours Map)
  const saleDate = (s) => {
    const m = s?.receipt_no?.match(/-(\d{6})-/)
    if (!m) return null
    const c = m[1]
    return `20${c.slice(0, 2)}-${c.slice(2, 4)}-${c.slice(4, 6)}`
  }
  const itemDate = (item) => saleDate(item?.expand?.sale_id)

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      const [products, sales, saleItemsAll] = await Promise.all([
        pb.collection(C.PRODUCTS).getList(1, 500, { filter: `shop_id="${shop.id}" && status="active"`, expand: 'category_id', '$autoCancel': false, '$cancelKey': 'analytics-products' }).then(r => r.items),
        pb.collection(C.SALES).getList(1, 500, { filter: `shop_id="${shop.id}" && status="completed"`, expand: 'customer_id', sort: '-receipt_no', '$autoCancel': false, '$cancelKey': 'analytics-sales' }).then(r => r.items),
        pb.collection(C.SALE_ITEMS).getList(1, 500, { filter: `sale_id.shop_id="${shop.id}"`, expand: 'sale_id', '$autoCancel': false, '$cancelKey': 'analytics-items' }).then(r => r.items),
      ])

      const windowFrom = format(subDays(new Date(), windowDays), 'yyyy-MM-dd')
      const days7From  = format(subDays(new Date(), 7), 'yyyy-MM-dd')

      const saleItemsWindow = saleItemsAll.filter(i => { const d = itemDate(i); return d && d >= windowFrom })
      const saleItems7      = saleItemsAll.filter(i => { const d = itemDate(i); return d && d >= days7From })

      const velocity = {}, revenueWin = {}, profitWin = {}
      saleItemsWindow.forEach(item => {
        velocity[item.product_id] = (velocity[item.product_id] || 0) + item.qty
        revenueWin[item.product_id] = (revenueWin[item.product_id] || 0) + item.total_kes
        profitWin[item.product_id] = (profitWin[item.product_id] || 0) + (item.unit_price_kes - (item.unit_cost_kes || 0)) * item.qty
      })

      const sold7 = {}
      saleItems7.forEach(item => { sold7[item.product_id] = (sold7[item.product_id] || 0) + item.qty })

      const enriched = products.map(p => {
        const unitsSoldWin = velocity[p.id] || 0
        const dailyVelocity = unitsSoldWin / windowDays
        const daysOfStock = dailyVelocity > 0 ? Math.floor((p.stock_qty || 0) / dailyVelocity) : 999
        const isFastMover = unitsSoldWin >= Math.max(3, Math.round(windowDays / 3))
        const isDeadStock = unitsSoldWin === 0 && (p.stock_qty || 0) > 0
        const isSlowMover = unitsSoldWin > 0 && unitsSoldWin < Math.max(2, Math.round(windowDays / 6))
        const needsReorder = (p.stock_qty || 0) <= (p.reorder_point || 5) && p.track_inventory
        const suggestedOrderQty = needsReorder ? Math.max((p.reorder_point || 5) * 3 - (p.stock_qty || 0), 10) : 0
        const revenueW = revenueWin[p.id] || 0
        const profitW = profitWin[p.id] || 0
        return {
          ...p,
          unitsSold30: unitsSoldWin, dailyVelocity, daysOfStock,
          revenue30: revenueW, profit30: profitW,
          marginPct: revenueW ? (profitW / revenueW) * 100 : 0,
          unitsSold7: sold7[p.id] || 0,
          isFastMover, isDeadStock, isSlowMover, needsReorder, suggestedOrderQty,
          margin: p.price_kes && p.cost_price_kes ? ((p.price_kes - p.cost_price_kes) / p.price_kes * 100) : 0,
        }
      })

      const fastMovers    = enriched.filter(p => p.isFastMover).sort((a, b) => b.unitsSold30 - a.unitsSold30).slice(0, 8)
      const deadStock     = enriched.filter(p => p.isDeadStock).sort((a, b) => b.stock_qty - a.stock_qty)
      const slowMovers    = enriched.filter(p => p.isSlowMover).sort((a, b) => a.daysOfStock - b.daysOfStock)
      const reorderList   = enriched.filter(p => p.needsReorder).sort((a, b) => a.stock_qty - b.stock_qty)
      const criticalStock = enriched.filter(p => p.daysOfStock <= 7 && p.daysOfStock < 999 && p.track_inventory)
      const topMargin      = enriched.filter(p => p.unitsSold30 > 0).sort((a, b) => b.marginPct - a.marginPct).slice(0, 10)

      const catProfit = {}
      enriched.forEach(p => {
        const catName = p.expand?.category_id?.name || 'Uncategorized'
        if (!catProfit[catName]) catProfit[catName] = { revenue: 0, profit: 0, units: 0, products: 0 }
        catProfit[catName].revenue += p.revenue30
        catProfit[catName].profit += p.profit30
        catProfit[catName].units += p.unitsSold30
        catProfit[catName].products++
      })
      const categoryData = Object.entries(catProfit).map(([name, v]) => ({
        name, ...v, margin: v.revenue ? ((v.profit / v.revenue) * 100).toFixed(0) : 0
      })).sort((a, b) => b.profit - a.profit)

      // Revenue trend — built client-side from the sales already fetched above, zero extra calls
      const weekStarts = eachWeekOfInterval({ start: subWeeks(new Date(), 7), end: new Date() }, { weekStartsOn: 1 })
      const weeklyTrend = weekStarts.map(ws => {
        const we = endOfWeek(ws, { weekStartsOn: 1 })
        const wsStr = format(ws, 'yyyy-MM-dd'), weStr = format(we, 'yyyy-MM-dd')
        const inWeek = sales.filter(s => { const d = saleDate(s); return d && d >= wsStr && d <= weStr })
        const revenue = inWeek.reduce((a, s) => a + (s.total_kes || 0), 0)
        const cost = inWeek.reduce((a, s) => a + (s.total_cost_kes || 0), 0)
        return { label: format(ws, 'dd MMM'), revenue, grossProfit: revenue - cost }
      })
      const monthStarts = eachMonthOfInterval({ start: subMonths(new Date(), 5), end: new Date() })
      const monthlyTrend = monthStarts.map(m => {
        const key = format(m, 'yyyy-MM')
        const inMonth = sales.filter(s => saleDate(s)?.startsWith(key))
        const revenue = inMonth.reduce((a, s) => a + (s.total_kes || 0), 0)
        const cost = inMonth.reduce((a, s) => a + (s.total_cost_kes || 0), 0)
        return { label: format(m, 'MMM yy'), revenue, grossProfit: revenue - cost }
      })

      // Cohort retention — % of customers who returned within 30/60/90 days of their first purchase,
      // based on the most recent 500 completed sales (analytics query cap)
      const customerPurchases = {}
      sales.forEach(s => {
        if (!s.customer_id) return
        const d = saleDate(s)
        if (!d) return
        if (!customerPurchases[s.customer_id]) customerPurchases[s.customer_id] = []
        customerPurchases[s.customer_id].push(d)
      })
      const today = new Date()
      let e30 = 0, r30 = 0, e60 = 0, r60 = 0, e90 = 0, r90 = 0
      Object.values(customerPurchases).forEach(dates => {
        const sorted = [...new Set(dates)].sort()
        const first = new Date(sorted[0])
        const daysSinceFirst = Math.floor((today - first) / 86400000)
        const returnedWithin = (days) => sorted.some(d => {
          const diff = Math.floor((new Date(d) - first) / 86400000)
          return diff > 0 && diff <= days
        })
        if (daysSinceFirst >= 30) { e30++; if (returnedWithin(30)) r30++ }
        if (daysSinceFirst >= 60) { e60++; if (returnedWithin(60)) r60++ }
        if (daysSinceFirst >= 90) { e90++; if (returnedWithin(90)) r90++ }
      })
      const cohort = {
        d30: e30 ? Math.round((r30 / e30) * 100) : null, e30,
        d60: e60 ? Math.round((r60 / e60) * 100) : null, e60,
        d90: e90 ? Math.round((r90 / e90) * 100) : null, e90,
      }

      setData({ enriched, fastMovers, deadStock, slowMovers, reorderList, criticalStock, categoryData, topMargin, weeklyTrend, monthlyTrend, cohort })
    } catch (err) {
      console.error(err)
      toast.error('Analytics load failed')
    } finally { setLoading(false) }
  }

  const generatePurchaseOrder = async () => {
    if (!data?.reorderList.length) return toast.error('No items need reordering')
    setGeneratingPO(true)
    try {
      const items = data.reorderList.map(p => ({
        product_id: p.id,
        product_name: p.name,
        current_stock: p.stock_qty || 0,
        reorder_point: p.reorder_point || 5,
        suggested_qty: p.suggestedOrderQty,
        unit_cost: p.cost_price_kes || 0,
        total_cost: p.suggestedOrderQty * (p.cost_price_kes || 0),
      }))
      const totalCost = items.reduce((a, i) => a + i.total_cost, 0)
      const poNum = `PO-${format(new Date(), 'yyyyMMdd-HHmm')}`

      const csv = ['Product,Current Stock,Reorder At,Order Qty,Unit Cost,Total Cost',
        ...items.map(i => `"${i.product_name}",${i.current_stock},${i.reorder_point},${i.suggested_qty},${i.unit_cost},${i.total_cost}`)
      ].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${poNum}.csv`; a.click()

      toast.success(`Purchase Order ${poNum} generated! (${items.length} items, ${fmtKES(totalCost)})`, { duration: 5000 })
    } catch { toast.error('Failed to generate PO') }
    finally { setGeneratingPO(false) }
  }

  const exportCSV = (rows, filename) => {
    if (!rows.length) return toast.error('Nothing to export')
    const headers = Object.keys(rows[0])
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div className="spinner" /></div>
  if (!data) return null

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Smart Analytics ⚡</div>
          <div className="page-subtitle">AI-powered insights · Trailing {windowDays} days · Auto reorder detection</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: '#fce8ed', borderRadius: 10, padding: 4 }}>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setWindowDays(d)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: windowDays === d ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent', color: windowDays === d ? '#fff' : '#8b2550', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                {d}d
              </button>
            ))}
          </div>
          {data.reorderList.length > 0 && (
            <button className="btn-primary" onClick={generatePurchaseOrder} disabled={generatingPO} style={{ background: 'linear-gradient(135deg,#d97706,#92400e)', boxShadow: '0 4px 14px #d9770644' }}>
              {generatingPO ? 'Generating…' : `📦 Auto-Generate PO (${data.reorderList.length} items)`}
            </button>
          )}
        </div>
      </div>

      {(data.criticalStock.length > 0 || data.deadStock.length > 0) && (
        <div style={{ background: 'linear-gradient(90deg,#fee2e2,#fef3c7)', border: '1px solid #fca5a5', borderRadius: 12, padding: '12px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <AlertCircle size={20} color="#dc2626" />
          {data.criticalStock.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>⚠️ {data.criticalStock.length} products will run out within 7 days</span>}
          {data.deadStock.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: '#d97706' }}>💤 {data.deadStock.length} products have ZERO sales in {windowDays} days (dead stock)</span>}
          {data.reorderList.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>📦 {data.reorderList.length} products need reordering now</span>}
        </div>
      )}

      <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Fast Movers', value: data.fastMovers.length, icon: '🚀', color: '#059669', sub: `Top sellers · ${windowDays}d` },
          { label: 'Dead Stock Items', value: data.deadStock.length, icon: '💤', color: '#dc2626', sub: `0 sales in ${windowDays}d` },
          { label: 'Need Reorder', value: data.reorderList.length, icon: '📦', color: '#d97706', sub: 'Below reorder point' },
          { label: 'Critical (≤7 days)', value: data.criticalStock.length, icon: '🚨', color: '#c8456a', sub: 'Will stock out soon' },
        ].map((kpi, i) => (
          <div key={i} className="stat-card" style={{ cursor: 'default' }}>
            <div style={{ fontSize: 28 }}>{kpi.icon}</div>
            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 26, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 12, color: '#9b6070' }}>{kpi.label}</div>
            <div style={{ fontSize: 11, color: '#b09090', marginTop: 2 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 4px' }}>🔁 Customer Cohort Retention</h3>
        <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 16 }}>% of customers who came back after their first visit, based on the most recent 500 completed sales linked to a customer</div>
        <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { label: '30-Day Return Rate', value: data.cohort.d30, n: data.cohort.e30 },
            { label: '60-Day Return Rate', value: data.cohort.d60, n: data.cohort.e60 },
            { label: '90-Day Return Rate', value: data.cohort.d90, n: data.cohort.e90 },
          ].map((c, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '14px', background: '#fdf5f7', borderRadius: 12 }}>
              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 28, fontWeight: 700, color: c.value === null ? '#b09090' : c.value >= 30 ? '#059669' : c.value >= 15 ? '#d97706' : '#dc2626' }}>
                {c.value === null ? '—' : `${c.value}%`}
              </div>
              <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{c.label}</div>
              <div style={{ fontSize: 10, color: '#b09090', marginTop: 2 }}>{c.n} eligible customer{c.n !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: 0 }}>📈 Revenue Trend</h3>
          <div style={{ display: 'flex', gap: 4, background: '#fce8ed', borderRadius: 10, padding: 4 }}>
            {[['week', 'Weekly'], ['month', 'Monthly']].map(([v, l]) => (
              <button key={v} onClick={() => setTrendGrain(v)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: trendGrain === v ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent', color: trendGrain === v ? '#fff' : '#8b2550', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trendGrain === 'week' ? data.weeklyTrend : data.monthlyTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9b6070' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => fmtKES(v)} contentStyle={{ borderRadius: 10, fontFamily: 'Nunito,sans-serif', fontSize: 12 }} />
            <Line type="monotone" dataKey="revenue" stroke="#c8456a" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
            <Line type="monotone" dataKey="grossProfit" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} name="Gross Profit" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={18} color="#c8456a" /> Fast Movers ({windowDays} days)
          </h3>
          {data.fastMovers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9b6070', fontSize: 14 }}>No data yet — make some sales!</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.fastMovers.map(p => ({ name: p.name.split(' ').slice(0, 2).join(' '), units: p.unitsSold30, revenue: p.revenue30 }))} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9b6070' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9b6070' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v, n) => [n === 'units' ? `${v} units` : fmtKES(v), n === 'units' ? 'Units Sold' : 'Revenue']} contentStyle={{ borderRadius: 10, fontFamily: 'Nunito,sans-serif', fontSize: 12 }} />
                <Bar dataKey="units" radius={[6, 6, 0, 0]}>
                  {data.fastMovers.map((_, i) => <Cell key={i} fill={`hsl(${340 + i * 10}, 65%, ${50 + i * 3}%)`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px' }}>📊 Profit by Category</h3>
          {data.categoryData.map((cat, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{cat.name}</span>
                <span style={{ color: '#059669', fontWeight: 700 }}>{fmtKES(cat.profit)} <span style={{ color: '#9b6070', fontWeight: 400 }}>({cat.margin}%)</span></span>
              </div>
              <div style={{ background: '#f5edf0', borderRadius: 4, height: 8 }}>
                <div style={{ background: `linear-gradient(90deg, hsl(${340 - i * 20},65%,55%), hsl(${340 - i * 20},65%,40%))`, height: 8, borderRadius: 4, width: `${Math.min(100, cat.profit > 0 ? (cat.profit / (data.categoryData[0]?.profit || 1)) * 100 : 0)}%`, transition: 'width 1s' }} />
              </div>
              <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>{cat.units} units · {cat.products} products</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 20 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: 0 }}>🏆 Top 10 Products by Profit Margin</h3>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => exportCSV(data.topMargin.map(p => ({ Product: p.name, Units_Sold: p.unitsSold30, Revenue_KES: p.revenue30, Profit_KES: p.profit30, Margin_Pct: p.marginPct.toFixed(1) })), 'top-margin-products.csv')}>
            <Download size={14} /> Export
          </button>
        </div>
        {data.topMargin.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#9b6070', fontSize: 14 }}>No sales in this window yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Product</th><th>Units Sold</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr></thead>
              <tbody>
                {data.topMargin.map((p, i) => (
                  <tr key={p.id}>
                    <td style={{ color: '#9b6070', fontSize: 12 }}>#{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.unitsSold30}</td>
                    <td>{fmtKES(p.revenue30)}</td>
                    <td style={{ color: '#059669', fontWeight: 600 }}>{fmtKES(p.profit30)}</td>
                    <td><span style={{ background: p.marginPct > 50 ? '#f0fdf4' : p.marginPct > 25 ? '#fefce8' : '#fee2e2', color: p.marginPct > 50 ? '#059669' : p.marginPct > 25 ? '#d97706' : '#dc2626', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{p.marginPct.toFixed(0)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.reorderList.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', background: 'linear-gradient(90deg,#fef3c7,#fff)', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#92400e', margin: 0 }}>📦 Reorder Alert — {data.reorderList.length} items</h3>
            <button className="btn-primary" style={{ background: 'linear-gradient(135deg,#d97706,#92400e)', boxShadow: 'none', fontSize: 13 }} onClick={generatePurchaseOrder} disabled={generatingPO}>
              ⬇️ Download Purchase Order CSV
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Current Stock</th><th>Reorder At</th><th>Suggested Order</th><th>Est. Cost</th><th>Days Left</th></tr></thead>
              <tbody>
                {data.reorderList.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td><span style={{ fontWeight: 700, color: p.stock_qty <= 0 ? '#dc2626' : '#d97706' }}>{r2(p.stock_qty || 0)}</span></td>
                    <td style={{ color: '#9b6070' }}>{p.reorder_point || 5}</td>
                    <td><span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{p.suggestedOrderQty} units</span></td>
                    <td style={{ fontWeight: 600 }}>{fmtKES(p.suggestedOrderQty * (p.cost_price_kes || 0))}</td>
                    <td>
                      <span style={{ background: p.daysOfStock <= 3 ? '#fee2e2' : '#fef3c7', color: p.daysOfStock <= 3 ? '#dc2626' : '#d97706', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                        {p.daysOfStock >= 999 ? '∞' : `${p.daysOfStock}d`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.deadStock.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', background: 'linear-gradient(90deg,#fee2e2,#fff)', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#991b1b', margin: 0 }}>💤 Dead Stock — No Sales in {windowDays} Days</h3>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => exportCSV(data.deadStock.map(p => ({ Product: p.name, Stock_Qty: p.stock_qty || 0, Cost_Value_KES: (p.stock_qty || 0) * (p.cost_price_kes || 0), Retail_Value_KES: (p.stock_qty || 0) * (p.price_kes || 0), Margin_Pct: p.margin.toFixed(0) })), 'dead-stock.csv')}>
              <Download size={14} /> Export
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Stock Qty</th><th>Cost Value</th><th>Retail Value</th><th>Margin</th><th>Action</th></tr></thead>
              <tbody>
                {data.deadStock.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ fontWeight: 700, color: '#dc2626' }}>{r2(p.stock_qty)}</td>
                    <td>{fmtKES((p.stock_qty || 0) * (p.cost_price_kes || 0))}</td>
                    <td style={{ fontWeight: 600 }}>{fmtKES((p.stock_qty || 0) * (p.price_kes || 0))}</td>
                    <td><span style={{ background: '#f5f5f5', color: '#6b7280', padding: '2px 8px', borderRadius: 20, fontSize: 11 }}>{p.margin.toFixed(0)}%</span></td>
                    <td><span style={{ fontSize: 12, color: '#9b6070' }}>💡 Consider discount or return to supplier</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: 0 }}>📈 All Products — Sales Velocity</h3>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => exportCSV(data.enriched.sort((a, b) => b.unitsSold30 - a.unitsSold30).map(p => ({ Product: p.name, Units_Sold: p.unitsSold30, Units_7d: p.unitsSold7, Daily_Velocity: p.dailyVelocity.toFixed(2), Days_Of_Stock: p.daysOfStock >= 999 ? '' : p.daysOfStock, Revenue_KES: p.revenue30, Profit_KES: p.profit30, Status: p.isFastMover ? 'Fast' : p.isDeadStock ? 'Dead' : p.isSlowMover ? 'Slow' : 'Normal' })), 'product-velocity.csv')}>
            <Download size={14} /> Export
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>{windowDays}d Units</th><th>7d Units</th><th>Daily Velocity</th><th>Days of Stock</th><th>{windowDays}d Revenue</th><th>{windowDays}d Profit</th><th>Status</th></tr></thead>
            <tbody>
              {data.enriched.sort((a, b) => b.unitsSold30 - a.unitsSold30).map(p => {
                const tag = p.isFastMover ? { label: '🚀 Fast', bg: '#f0fdf4', color: '#059669' }
                  : p.isDeadStock ? { label: '💤 Dead', bg: '#fee2e2', color: '#dc2626' }
                  : p.isSlowMover ? { label: '🐢 Slow', bg: '#fefce8', color: '#d97706' }
                  : { label: '✅ Normal', bg: '#f0f9ff', color: '#0369a1' }
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</td>
                    <td style={{ fontWeight: 700 }}>{p.unitsSold30}</td>
                    <td style={{ color: p.unitsSold7 > 0 ? '#059669' : '#9b6070' }}>{p.unitsSold7}</td>
                    <td style={{ fontSize: 12 }}>{p.dailyVelocity.toFixed(1)}/day</td>
                    <td>
                      <span style={{ background: p.daysOfStock <= 7 ? '#fee2e2' : p.daysOfStock <= 14 ? '#fef3c7' : '#f0fdf4', color: p.daysOfStock <= 7 ? '#dc2626' : p.daysOfStock <= 14 ? '#d97706' : '#059669', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                        {p.daysOfStock >= 999 ? '∞' : `${p.daysOfStock}d`}
                      </span>
                    </td>
                    <td>{fmtKES(p.revenue30)}</td>
                    <td style={{ color: '#059669', fontWeight: 600 }}>{fmtKES(p.profit30)}</td>
                    <td><span style={{ background: tag.bg, color: tag.color, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{tag.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
