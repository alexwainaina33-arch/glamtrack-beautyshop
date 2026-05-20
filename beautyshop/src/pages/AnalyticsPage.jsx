import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate } from '../lib/utils'
import { subDays, format, startOfDay } from 'date-fns'
import { TrendingUp, TrendingDown, AlertCircle, Package, ShoppingCart, Zap } from 'lucide-react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell } from 'recharts'
import toast from 'react-hot-toast'

export default function AnalyticsPage() {
  const { shop, loading: authLoading } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generatingPO, setGeneratingPO] = useState(false)

  useEffect(() => { if (shop) loadAnalytics() }, [shop])

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      const days30From = subDays(new Date(), 30).toISOString()
      const days7From  = subDays(new Date(), 7).toISOString()

      const [products, saleItems30, saleItems7, movements] = await Promise.all([
        pb.collection(C.PRODUCTS).getList(1, 500, { filter: `shop_id="${shop.id}" && status="active"`, expand: 'category_id', '$autoCancel': false, '$cancelKey': 'analytics-products' }).then(r => r.items),
        pb.collection(C.SALE_ITEMS).getList(1, 500, { filter: `sale_id.shop_id="${shop.id}"`, expand: 'product_id', '$autoCancel': false, '$cancelKey': 'analytics-items30' }).then(r => r.items),
        pb.collection(C.SALE_ITEMS).getList(1, 500, { filter: `sale_id.shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'analytics-items7' }).then(r => r.items),
        pb.collection(C.INV_MOVEMENTS).getList(1, 500, { filter: `shop_id="${shop.id}" && type="stock_in"`, '$autoCancel': false, '$cancelKey': 'analytics-movements' }).then(r => r.items)
      ])

      // Sales velocity per product (units per day)
      const velocity = {}
      const revenue30 = {}
      const profit30 = {}
      saleItems30.forEach(item => {
        velocity[item.product_id] = (velocity[item.product_id] || 0) + item.qty
        revenue30[item.product_id] = (revenue30[item.product_id] || 0) + item.total_kes
        profit30[item.product_id] = (profit30[item.product_id] || 0) + (item.unit_price_kes - (item.unit_cost_kes || 0)) * item.qty
      })

      // Last 7 days sales
      const sold7 = {}
      saleItems7.forEach(item => { sold7[item.product_id] = (sold7[item.product_id] || 0) + item.qty })

      // Categorize products
      const enriched = products.map(p => {
        const unitsSold30 = velocity[p.id] || 0
        const dailyVelocity = unitsSold30 / 30
        const daysOfStock = dailyVelocity > 0 ? Math.floor((p.stock_qty || 0) / dailyVelocity) : 999
        const isFastMover = unitsSold30 >= 10
        const isDeadStock = unitsSold30 === 0 && (p.stock_qty || 0) > 0
        const isSlowMover = unitsSold30 > 0 && unitsSold30 < 5
        const needsReorder = (p.stock_qty || 0) <= (p.reorder_point || 5) && p.track_inventory
        const suggestedOrderQty = needsReorder ? Math.max((p.reorder_point || 5) * 3 - (p.stock_qty || 0), 10) : 0
        return {
          ...p,
          unitsSold30, dailyVelocity, daysOfStock,
          revenue30: revenue30[p.id] || 0,
          profit30: profit30[p.id] || 0,
          unitsSold7: sold7[p.id] || 0,
          isFastMover, isDeadStock, isSlowMover, needsReorder, suggestedOrderQty,
          margin: p.price_kes && p.cost_price_kes ? ((p.price_kes - p.cost_price_kes) / p.price_kes * 100) : 0,
        }
      })

      const fastMovers  = enriched.filter(p => p.isFastMover).sort((a, b) => b.unitsSold30 - a.unitsSold30).slice(0, 8)
      const deadStock   = enriched.filter(p => p.isDeadStock).sort((a, b) => b.stock_qty - a.stock_qty)
      const slowMovers  = enriched.filter(p => p.isSlowMover).sort((a, b) => a.daysOfStock - b.daysOfStock)
      const reorderList = enriched.filter(p => p.needsReorder).sort((a, b) => a.stock_qty - b.stock_qty)
      const criticalStock = enriched.filter(p => p.daysOfStock <= 7 && p.daysOfStock < 999 && p.track_inventory)

      // Profit heatmap by category
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

      setData({ enriched, fastMovers, deadStock, slowMovers, reorderList, criticalStock, categoryData })
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

      // Download as CSV auto-magically
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

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div className="spinner" /></div>
  if (!data) return null

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Smart Analytics ⚡</div>
          <div className="page-subtitle">AI-powered insights · Last 30 days · Auto reorder detection</div>
        </div>
        {data.reorderList.length > 0 && (
          <button className="btn-primary" onClick={generatePurchaseOrder} disabled={generatingPO} style={{ background: 'linear-gradient(135deg,#d97706,#92400e)', boxShadow: '0 4px 14px #d9770644' }}>
            {generatingPO ? 'Generating…' : `📦 Auto-Generate PO (${data.reorderList.length} items)`}
          </button>
        )}
      </div>

      {/* Alert banner */}
      {(data.criticalStock.length > 0 || data.deadStock.length > 0) && (
        <div style={{ background: 'linear-gradient(90deg,#fee2e2,#fef3c7)', border: '1px solid #fca5a5', borderRadius: 12, padding: '12px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <AlertCircle size={20} color="#dc2626" />
          {data.criticalStock.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>⚠️ {data.criticalStock.length} products will run out within 7 days</span>}
          {data.deadStock.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: '#d97706' }}>💤 {data.deadStock.length} products have ZERO sales in 30 days (dead stock)</span>}
          {data.reorderList.length > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>📦 {data.reorderList.length} products need reordering now</span>}
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Fast Movers', value: data.fastMovers.length, icon: '🚀', color: '#059669', sub: '10+ units/30 days' },
          { label: 'Dead Stock Items', value: data.deadStock.length, icon: '💤', color: '#dc2626', sub: '0 sales in 30 days' },
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

      {/* Fast Movers + Category Heatmap */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={18} color="#c8456a" /> Fast Movers (30 days)
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

      {/* Reorder List */}
      {data.reorderList.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', background: 'linear-gradient(90deg,#fef3c7,#fff)', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                    <td><span style={{ fontWeight: 700, color: p.stock_qty <= 0 ? '#dc2626' : '#d97706' }}>{p.stock_qty || 0}</span></td>
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

      {/* Dead Stock */}
      {data.deadStock.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 20 }}>
          <div style={{ padding: '14px 20px', background: 'linear-gradient(90deg,#fee2e2,#fff)', borderRadius: '16px 16px 0 0' }}>
            <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#991b1b', margin: 0 }}>💤 Dead Stock — No Sales in 30 Days</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Product</th><th>Stock Qty</th><th>Cost Value</th><th>Retail Value</th><th>Margin</th><th>Action</th></tr></thead>
              <tbody>
                {data.deadStock.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ fontWeight: 700, color: '#dc2626' }}>{p.stock_qty}</td>
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

      {/* All products velocity table */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5edf0' }}>
          <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: 0 }}>📈 All Products — Sales Velocity</h3>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>30d Units</th><th>7d Units</th><th>Daily Velocity</th><th>Days of Stock</th><th>30d Revenue</th><th>30d Profit</th><th>Status</th></tr></thead>
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