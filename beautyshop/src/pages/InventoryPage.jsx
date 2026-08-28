import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDateTime, r2 } from '../lib/utils'
import { Plus, AlertTriangle, ArrowUp, ArrowDown, RefreshCw, X, Filter, Upload, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

export default function InventoryPage() {
  const { shop, loading: authLoading, isLocked } = useAuth()
  const [products, setProducts] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('stock') // stock | movements
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState(null)
  const [adjustType, setAdjustType] = useState('stock_in')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustCost, setAdjustCost] = useState('')
  const [adjustExtraCost, setAdjustExtraCost] = useState('')
  const [adjustSupplier, setAdjustSupplier] = useState('')
  const [adjustFunding, setAdjustFunding] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [filterAlert, setFilterAlert] = useState(false)
  const [valFrom, setValFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10)
  })
  const [valTo, setValTo] = useState(() => new Date().toISOString().slice(0,10))
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [importData, setImportData] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()
  const [selectedProducts, setSelectedProducts] = useState(new Set())

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, authLoading])

  useEffect(() => {
    // Auto-alert on low stock items
    if (products.length > 0) {
      const lowItems = products.filter(p => p.stock_qty <= (p.reorder_point || 5))
      const outItems = lowItems.filter(p => p.stock_qty <= 0)
      if (outItems.length > 0) {
        setTimeout(() => {
          toast.error(`? ${outItems.length} item(s) out of stock!`, { icon: '??', duration: 6000 })
        }, 1500)
      }
    }
  }, [products])

  const loadData = async () => {
    setLoading(true)
    try {
      const [prods, movs] = await Promise.all([
        pb.collection(C.PRODUCTS).getList(1, 500, { filter: `shop_id="${shop.id}" && track_inventory=true && status="active"`, sort: 'name' }).then(r => r.items),
        pb.collection(C.INV_MOVEMENTS).getList(1, 100, { filter: `shop_id="${shop.id}"`, sort: '-created', expand: 'product_id,created_by' })
      ])
      setProducts(prods)
      setMovements(movs.items)
    } finally { setLoading(false) }
  }

  const openAdjust = (product, type = 'stock_in') => {
    setAdjustProduct(product)
    setAdjustType(type)
    setAdjustQty('')
    setAdjustNote('')
    setAdjustCost(product?.cost_price_kes || '')
    setAdjustExtraCost('')
    setAdjustSupplier('')
    setAdjustFunding('cash')
    setShowAdjust(true)
  }

  const handleAdjust = async (e) => {
    e.preventDefault()
    if (isLocked) return toast.error('?? Account locked — renew your subscription to adjust stock', { duration: 6000 })
    if (!adjustQty || isNaN(adjustQty) || Number(adjustQty) <= 0) return toast.error('Enter valid quantity')
    setSaving(true)
    try {
      if (!adjustProduct) return toast.error('Select a product')

      const qty = Number(adjustQty)
      const currentQty = Number(adjustProduct.stock_qty || 0)
      const currentCost = Number(adjustProduct.cost_price_kes || 0)
      const isInbound = ['stock_in', 'return', 'opening_stock'].includes(adjustType)
      const isPurchase = ['stock_in', 'opening_stock'].includes(adjustType)
      const deltaQty = isInbound ? qty : -qty
      const newQty = r2(Math.max(0, currentQty + deltaQty))

      const supplierUnitCost = Number(adjustCost) || 0
      const extraProcurementCost = isPurchase ? Number(adjustExtraCost) || 0 : 0
      const landedUnitCost = isPurchase && qty > 0
        ? ((supplierUnitCost * qty) + extraProcurementCost) / qty
        : supplierUnitCost

      // Moving weighted average keeps Martin's existing stock and new stock
      // economically correct when purchase costs change between batches.
      const weightedAverageCost = isPurchase && newQty > 0
        ? (adjustType === 'opening_stock' || currentQty <= 0
          ? landedUnitCost
          : ((currentQty * currentCost) + (qty * landedUnitCost)) / newQty)
        : currentCost

      const productUpdate = { stock_qty: newQty }
      if (isPurchase) productUpdate.cost_price_kes = Number(weightedAverageCost.toFixed(4))
      await pb.collection(C.PRODUCTS).update(adjustProduct.id, productUpdate)

      const procurementNote = isPurchase && extraProcurementCost > 0
        ? `Additional procurement cost KES ${extraProcurementCost.toFixed(2)}; landed cost KES ${landedUnitCost.toFixed(2)}/${adjustProduct.unit || 'unit'}`
        : ''
      const movementNote = [adjustNote, procurementNote].filter(Boolean).join(' | ')

      await pb.collection(C.INV_MOVEMENTS).create({
        shop_id: shop.id,
        product_id: adjustProduct.id,
        type: adjustType,
        qty: isInbound ? qty : -qty,
        before_qty: currentQty,
        after_qty: newQty,
        cost_per_unit: isInbound ? landedUnitCost : null,
        funding_source: isPurchase ? adjustFunding : null,
        supplier_name: adjustSupplier || null,
        notes: movementNote,
        reference: adjustNote,
        created_by: pb.authStore.model?.id
      })

      toast.success(
        adjustType === 'opening_stock' ? '? Opening stock recorded!' :
        adjustType === 'damage' ? '?? Damage recorded' :
        adjustType === 'stock_in' ? '?? Stock received!' : '? Adjustment saved'
      )
      setShowAdjust(false)
      loadData()
    } catch (err) { toast.error(err?.message || 'Failed') }
    finally { setSaving(false) }
  }

  const filteredProducts = filterAlert
    ? products.filter(p => p.stock_qty <= (p.reorder_point || 5))
    : products

  const handleBulkImportCSV = async () => {
    if (!importData.trim()) return toast.error('Paste CSV data first')
    setImporting(true)
    try {
      const lines = importData.trim().split('\n').filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const rows = lines.slice(1).map(l => {
        const vals = l.split(',').map(v => v.trim())
        const obj = {}
        headers.forEach((h, i) => { obj[h] = vals[i] || '' })
        return obj
      })

      let success = 0, failed = 0
      for (const row of rows) {
        try {
          const productName = row.name || row.product_name
          if (!productName) continue
          
          const qty = Number(row.qty || row.quantity || 0)
          const cost = Number(row.cost || row.cost_price || 0)
          const notes = row.notes || row.reference || ''

          // Find product by name
          const prod = products.find(p => p.name.toLowerCase().trim() === productName.toLowerCase().trim())
          if (!prod) { failed++; continue }

          const newQty = r2(Math.max(0, (prod.stock_qty || 0) + qty))
          await pb.collection(C.PRODUCTS).update(prod.id, { stock_qty: newQty })
          await pb.collection(C.INV_MOVEMENTS).create({
            shop_id: shop.id,
            product_id: prod.id,
            type: 'stock_in',
            qty: qty,
            before_qty: prod.stock_qty || 0,
            after_qty: newQty,
            cost_per_unit: cost,
            funding_source: 'bulk_import',
            notes: notes,
            created_by: pb.authStore.model?.id
          })
          success++
        } catch (e) { failed++ }
      }
      toast.success(`? Imported ${success} products${failed > 0 ? ` (${failed} failed)` : ''}`)
      setShowBulkImport(false)
      setImportData('')
      loadData()
    } finally { setImporting(false) }
  }

  const toggleProductSelection = (prodId) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(prodId)) {
      newSelected.delete(prodId)
    } else {
      newSelected.add(prodId)
    }
    setSelectedProducts(newSelected)
  }

  const calcStockForecast = (product) => {
    // Estimate days of stock remaining based on recent sales
    const recentSales = movements.filter(m => m.product_id === product.id && m.type === 'sale').slice(0, 7)
    if (recentSales.length === 0) return null
    const avgDaily = recentSales.reduce((s, m) => s + Math.abs(m.qty || 0), 0) / 7
    if (avgDaily === 0) return null
    return Math.ceil((product.stock_qty || 0) / avgDaily)
  }

  const totalStockValue = products.reduce((s, p) => s + ((p.stock_qty || 0) * (p.cost_price_kes || 0)), 0)
  const totalRetailValue = products.reduce((s, p) => s + ((p.stock_qty || 0) * (p.price_kes || 0)), 0)
  const lowCount = products.filter(p => p.stock_qty <= (p.reorder_point || 5)).length
  const outCount = products.filter(p => p.stock_qty <= 0).length

  // Stock Valuation Report — computed from movements in date range
  const valReport = products.map(p => {
    const pMovs = movements.filter(m => m.product_id === p.id || m.expand?.product_id?.id === p.id)
    const inRange = pMovs.filter(m => {
      const d = m.created?.slice(0,10)
      return d >= valFrom && d <= valTo
    })
    const opening = pMovs.filter(m => m.created?.slice(0,10) < valFrom)
      .reduce((s, m) => s + (m.qty || 0), 0)
    const received = inRange.filter(m => ['stock_in','opening_stock','return'].includes(m.type))
      .reduce((s, m) => s + Math.abs(m.qty || 0), 0)
    const damaged = inRange.filter(m => m.type === 'damage')
      .reduce((s, m) => s + Math.abs(m.qty || 0), 0)
    const sold = inRange.filter(m => ['sale','stock_out'].includes(m.type))
      .reduce((s, m) => s + Math.abs(m.qty || 0), 0)
    const closing = opening + received - damaged - sold
    const closingValue = closing * (p.cost_price_kes || 0)
    return { ...p, opening, received, damaged, sold, closing, closingValue }
  }).filter(p => p.opening > 0 || p.received > 0 || p.closing > 0)

  const valTotals = valReport.reduce((t, p) => ({
    opening: t.opening + p.opening,
    received: t.received + p.received,
    damaged: t.damaged + p.damaged,
    sold: t.sold + p.sold,
    closing: t.closing + p.closing,
    closingValue: t.closingValue + p.closingValue,
  }), { opening: 0, received: 0, damaged: 0, sold: 0, closing: 0, closingValue: 0 })

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Inventory ??</div>
          <div className="page-subtitle">{products.length} tracked products</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setShowBulkImport(true)} disabled={isLocked}><Upload size={14} /> Bulk Import</button>
          <button className="btn-primary" onClick={() => openAdjust(null, 'stock_in')} disabled={isLocked} title={isLocked ? 'Account locked — renew to adjust stock' : ''}>
            {isLocked ? '?? Locked' : <><Plus size={16} /> Receive Stock</>}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Stock Value (Cost)', value: fmtKES(totalStockValue), icon: '??', cls: 'rose' },
          { label: 'Retail Value', value: fmtKES(totalRetailValue), icon: '???', cls: 'gold' },
          { label: 'Low Stock Items', value: lowCount, icon: '??', cls: lowCount > 0 ? 'rose' : 'green' },
          { label: 'Out of Stock', value: outCount, icon: '?', cls: outCount > 0 ? 'rose' : 'green' },
        ].map((s, i) => (
          <div key={i} className={`stat-card ${s.cls}`}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Playfair Display,serif' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#fce8ed', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {[['stock', '?? Stock Levels'], ['movements', '?? Movements'], ['valuation', '?? Stock Report']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: tab === v ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent', color: tab === v ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#3d1020', fontSize: 14 }}>Stock Levels</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {lowCount > 0 && (
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, color: '#25d366', fontWeight: 700, minHeight: 36 }}
                  onClick={() => {
                    const lowItems = products.filter(p => p.stock_qty <= (p.reorder_point || 5))
                    const lines = lowItems.map((p, i) =>
                      `${i + 1}. *${p.name}*\n    Stock: ${r2(p.stock_qty ?? 0)} ${p.unit || 'pcs'} (reorder at ${p.reorder_point || 5})`
                    ).join('\n\n')
                    const outItems = lowItems.filter(p => p.stock_qty <= 0)
                    const msg = `?? *Low Stock Report — ${shop.name}*\n\n${outItems.length > 0 ? `? *${outItems.length} item(s) completely out of stock*\n` : ''}?? *${lowItems.length} product(s) need restocking:*\n\n${lines}\n\n_Please reorder to avoid losing sales._\n\n_${shop.name} · SalesTrack_`
                    const phone = shop.phone ? shop.phone.replace(/\D/g, '').replace(/^0/, '254') : ''
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
                  }}
                >
                  ?? Alert All ({lowCount})
                </button>
              )}
              <button onClick={() => setFilterAlert(!filterAlert)} className={`btn-ghost ${filterAlert ? 'text-red-600' : ''}`} style={{ fontSize: 12, minHeight: 36 }}>
                <Filter size={14} /> {filterAlert ? 'Show All' : 'Low Stock Only'}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Barcode</th>
                  <th>On Hand</th>
                  <th>Reorder At</th>
                  <th>Days Left</th>
                  <th>Cost Value</th>
                  <th>Retail Value</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => {
                  const isLow = p.stock_qty <= (p.reorder_point || 5)
                  const isOut = p.stock_qty <= 0
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        {p.brand && <div style={{ fontSize: 11, color: '#9b6070' }}>{p.brand}</div>}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.barcode || p.sku || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 16, color: isOut ? '#dc2626' : isLow ? '#d97706' : '#059669' }}>
                          {r2(p.stock_qty ?? 0)}
                        </span>
                        <span style={{ color: '#9b6070', fontSize: 12, marginLeft: 4 }}>{p.unit || 'pcs'}</span>
                      </td>
                      <td style={{ color: '#9b6070', fontSize: 13 }}>{p.reorder_point || 5}</td>
                      <td>
                        {(() => {
                          const forecast = calcStockForecast(p)
                          return forecast ? (
                            <span style={{ fontWeight: 700, color: forecast < 7 ? '#dc2626' : '#3b82f6' }}>
                              {forecast} {forecast === 1 ? 'day' : 'days'}
                            </span>
                          ) : <span style={{ color: '#9b6070' }}>—</span>
                        })()}
                      </td>
                      <td>{fmtKES((p.stock_qty || 0) * (p.cost_price_kes || 0))}</td>
                      <td>{fmtKES((p.stock_qty || 0) * (p.price_kes || 0))}</td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isOut ? '#fee2e2' : isLow ? '#fefce8' : '#f0fdf4', color: isOut ? '#dc2626' : isLow ? '#d97706' : '#059669' }}>
                          {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn-ghost" onClick={() => openAdjust(p, 'stock_in')} title="Stock In" style={{ padding: '5px 10px', color: '#059669', minHeight: 44 }}><ArrowUp size={14} /></button>
                          <button className="btn-ghost" onClick={() => openAdjust(p, 'stock_out')} title="Stock Out / Damage" style={{ padding: '5px 10px', color: '#dc2626', minHeight: 44 }}><ArrowDown size={14} /></button>
                          <button className="btn-ghost" onClick={() => openAdjust(p, 'adjustment')} title="Adjust" style={{ padding: '5px 10px', minHeight: 44 }}><RefreshCw size={14} /></button>
                          {(isLow || isOut) && (
                            <button
                              className="btn-ghost"
                              title="Send low stock alert to yourself via WhatsApp"
                              style={{ padding: '5px 10px', color: '#25d366', minHeight: 44, fontWeight: 700, fontSize: 12 }}
                              onClick={() => {
                                const msg = `?? *Low Stock Alert — ${shop.name}*\n\n*Product:*\n${p.name}${p.brand ? ' (' + p.brand + ')' : ''}\n\n*Current Stock:*\n${r2(p.stock_qty ?? 0)} ${p.unit || 'pcs'}\n\n*Reorder Level:*\n${p.reorder_point || 5} ${p.unit || 'pcs'}\n\n*Retail Price:*\n${fmtKES(p.price_kes)}\n\n?? Restock this product to avoid losing sales.\n\n_${shop.name} · SalesTrack_`
                                const phone = shop.phone ? shop.phone.replace(/\D/g, '').replace(/^0/, '254') : ''
                                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
                              }}
                            >
                              ??
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'valuation' && (
        <div>
          {/* Date range picker */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="label">Period From</label>
                <input className="input" type="date" value={valFrom} onChange={e => setValFrom(e.target.value)} style={{ maxWidth: 160 }} />
              </div>
              <div>
                <label className="label">Period To</label>
                <input className="input" type="date" value={valTo} onChange={e => setValTo(e.target.value)} style={{ maxWidth: 160 }} />
              </div>
              <button className="btn-primary" style={{ marginBottom: 2 }} onClick={() => {
                const lines = valReport.map(p =>
                  `*${p.name}*\nOpen: ${p.opening} | +Received: ${p.received} | -Damaged: ${p.damaged} | -Sold: ${p.sold} | Closing: ${p.closing} @ ${fmtKES(p.cost_price_kes || 0)}/unit = *${fmtKES(p.closingValue)}*`
                ).join('\n\n')
                const msg = `?? *Stock Valuation Report*\n*${shop.name}*\nPeriod: ${valFrom} ? ${valTo}\n\n${lines}\n\n----------------\n*TOTAL CLOSING STOCK VALUE*\n*${fmtKES(valTotals.closingValue)}*\n\n_Valued at cost price · SalesTrack_`
                const phone = shop.phone?.replace(/\D/g,'').replace(/^0/,'254') || ''
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
              }}>
                ?? Share Report
              </button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Opening Stock', value: valTotals.opening + ' units', color: '#3b82f6', icon: '??' },
              { label: 'Stock Received', value: '+' + valTotals.received + ' units', color: '#059669', icon: '??' },
              { label: 'Damaged / Sold', value: '-' + (valTotals.damaged + valTotals.sold) + ' units', color: '#dc2626', icon: '??' },
              { label: 'Closing Value (Cost)', value: fmtKES(valTotals.closingValue), color: '#c8456a', icon: '??' },
            ].map((s, i) => (
              <div key={i} className="stat-card">
                <div style={{ fontSize: 24 }}>{s.icon}</div>
                <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f5edf0' }}>
              <div style={{ fontWeight: 700, color: '#3d1020', fontSize: 14 }}>Stock Movement Statement — valued at cost</div>
              <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Opening + Received - Damaged - Sold = Closing</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Opening</th>
                    <th style={{ textAlign: 'right', color: '#059669' }}>+Received</th>
                    <th style={{ textAlign: 'right', color: '#ef4444' }}>-Damaged</th>
                    <th style={{ textAlign: 'right', color: '#c8456a' }}>-Sold</th>
                    <th style={{ textAlign: 'right' }}>Closing Qty</th>
                    <th style={{ textAlign: 'right' }}>Cost/Unit</th>
                    <th style={{ textAlign: 'right', fontWeight: 800 }}>Closing Value</th>
                  </tr>
                </thead>
                <tbody>
                  {valReport.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: '#9b6070' }}>No stock movements in this period. Record opening stock or stock received first.</td></tr>
                  ) : valReport.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        {p.brand && <div style={{ fontSize: 11, color: '#9b6070' }}>{p.brand}</div>}
                      </td>
                      <td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>{p.opening}</td>
                      <td style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>+{p.received}</td>
                      <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{p.damaged > 0 ? '-' + p.damaged : '—'}</td>
                      <td style={{ textAlign: 'right', color: '#c8456a', fontWeight: 600 }}>-{p.sold}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{p.closing}</td>
                      <td style={{ textAlign: 'right', color: '#9b6070', fontSize: 12 }}>{fmtKES(p.cost_price_kes || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#3d1020', fontSize: 14 }}>{fmtKES(p.closingValue)}</td>
                    </tr>
                  ))}
                  {valReport.length > 0 && (
                    <tr style={{ background: 'linear-gradient(135deg,#fce8ed,#fdf5f7)', borderTop: '2px solid #f0e4e8' }}>
                      <td style={{ fontWeight: 800, color: '#3d1020' }}>TOTAL</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#3b82f6' }}>{valTotals.opening}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669' }}>+{valTotals.received}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{valTotals.damaged > 0 ? '-' + valTotals.damaged : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#c8456a' }}>-{valTotals.sold}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16 }}>{valTotals.closing}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#c8456a' }}>{fmtKES(valTotals.closingValue)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'movements' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Before</th><th>After</th><th>Reference</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {movements.map(m => {
                  const typeColors = { stock_in: '#059669', stock_out: '#dc2626', sale: '#c8456a', return: '#3b82f6', damage: '#ef4444', adjustment: '#8b5cf6' }
                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12, color: '#9b6070', whiteSpace: 'nowrap' }}>{fmtDateTime(m.created)}</td>
                      <td style={{ fontWeight: 600 }}>{m.expand?.product_id?.name || m.product_id}</td>
                      <td><span style={{ background: typeColors[m.type] + '20', color: typeColors[m.type], padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{m.type}</span></td>
                      <td style={{ fontWeight: 700, color: m.qty > 0 ? '#059669' : '#dc2626' }}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
                      <td style={{ color: '#9b6070' }}>{r2(m.before_qty)}</td>
                      <td style={{ fontWeight: 600 }}>{r2(m.after_qty)}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{m.reference || '—'}</td>
                      <td style={{ fontSize: 12, color: '#9b6070' }}>{m.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjust && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdjust(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">{adjustType === 'stock_in' ? 'Receive Stock' : 'Stock Adjustment'}</span>
              <button onClick={() => setShowAdjust(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!adjustProduct && (
                  <div>
                    <label className="label">Product *</label>
                    <select className="input" onChange={e => setAdjustProduct(products.find(p => p.id === e.target.value))} required>
                      <option value="">Select product</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {r2(p.stock_qty || 0)} {p.unit || 'pcs'})</option>)}
                    </select>
                  </div>
                )}
                {adjustProduct && <div style={{ background: '#fce8ed', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>
                  <strong>{adjustProduct.name}</strong> · Current stock: <strong>{r2(adjustProduct.stock_qty || 0)} {adjustProduct.unit || 'pcs'}</strong>
                </div>}
                <div>
                  <label className="label">Movement Type</label>
                  <select className="input" value={adjustType} onChange={e => setAdjustType(e.target.value)}>
                    <option value="opening_stock">?? Opening Stock (Day 1 entry)</option>
                    <option value="stock_in">?? Stock Received (GRN)</option>
                    <option value="stock_out">?? Stock Out (Removed)</option>
                    <option value="return">?? Customer Return</option>
                    <option value="damage">?? Damaged / Written Off</option>
                    <option value="adjustment">?? Manual Adjustment</option>
                  </select>
                </div>
                <div>
                  <label className="label">Quantity {adjustProduct ? `(${adjustProduct.unit || 'pcs'})` : ''} *</label>
                  <input className="input" type="number" min={0.01} step="0.01" inputMode="decimal" required value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="Enter quantity" />
                </div>
                {['stock_in', 'opening_stock'].includes(adjustType) && (
                  <>
                    <div>
                      <label className="label">Supplier Cost per {adjustProduct?.unit || 'unit'} (KES) *</label>
                      <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={adjustCost} onChange={e => setAdjustCost(e.target.value)} placeholder="e.g. 145" />
                    </div>
                    <div>
                      <label className="label">Transport / Other Procurement Cost (KES)</label>
                      <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={adjustExtraCost} onChange={e => setAdjustExtraCost(e.target.value)} placeholder="e.g. 300 transport for this batch" />
                      <div style={{ fontSize: 11, color: '#9b6070', marginTop: 5 }}>Optional. SalesTrack spreads this cost across the quantity received.</div>
                    </div>
                    {Number(adjustQty) > 0 && Number(adjustCost) >= 0 && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 12px', color: '#166534', fontSize: 12 }}>
                        <strong>Landed cost:</strong> {fmtKES(((Number(adjustCost) || 0) * Number(adjustQty) + (Number(adjustExtraCost) || 0)) / Number(adjustQty))} / {adjustProduct?.unit || 'unit'}
                        <div style={{ marginTop: 3, color: '#4b7a5b' }}>Used as the inventory cost for profit calculations.</div>
                      </div>
                    )}
                    <div>
                      <label className="label">How did you pay for this stock? *</label>
                      <select className="input" value={adjustFunding} onChange={e => setAdjustFunding(e.target.value)}>
                        <option value="cash">?? Cash / M-Pesa — paid now</option>
                        <option value="payable">?? On Credit — supplier not yet paid</option>
                        <option value="owner_capital">?? From my own capital (new investment)</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Supplier Name</label>
                      <input className="input" value={adjustSupplier} onChange={e => setAdjustSupplier(e.target.value)} placeholder="e.g. Safaricom Devices, Jumia, Mr. Hassan…" />
                    </div>
                  </>
                )}
                <div>
                  <label className="label">Notes / Reference</label>
                  <input className="input" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="e.g. Supplier invoice #123, LPO reference…" />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowAdjust(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : (adjustType === 'stock_in' ? 'Receive Stock' : 'Save Adjustment')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBulkImport(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header"><span className="modal-title">?? Bulk Stock Import</span><button onClick={() => setShowBulkImport(false)} className="btn-ghost" style={{ padding: 8 }}><X size={16} /></button></div>
            <div className="modal-body">
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12, color: '#166534' }}>
                <strong>Format:</strong> Paste CSV with columns: name, qty, cost, notes
                <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 11 }}>
                  <div>Product Name,Qty,Cost,Notes</div>
                  <div>Hair Shampoo 500ml,10,350,Supplier Invoice #123</div>
                  <div>Nail Polish,25,150,Opening stock</div>
                </div>
              </div>
              
              <textarea style={{
                width: '100%', height: 200, padding: 12, border: '1px solid #f0e4e8', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, marginBottom: 12, resize: 'vertical'
              }} placeholder="Paste CSV data here..." value={importData} onChange={e => setImportData(e.target.value)} />

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => setShowBulkImport(false)} disabled={importing}>Cancel</button>
                <button className="btn-primary" onClick={handleBulkImportCSV} disabled={importing || !importData.trim()}>
                  {importing ? <><div style={{ width: 14, height: 14, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', marginRight: 6 }} /> Importing…</> : `<Zap size={14} /> Import ${importData.split('\n').length - 1} items`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




