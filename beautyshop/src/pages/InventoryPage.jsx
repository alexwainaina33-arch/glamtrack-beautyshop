import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDateTime } from '../lib/utils'
import { Plus, AlertTriangle, ArrowUp, ArrowDown, RefreshCw, X, Filter } from 'lucide-react'
import toast from 'react-hot-toast'

export default function InventoryPage() {
  const { shop, loading: authLoading } = useAuth()
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
  const [saving, setSaving] = useState(false)
  const [filterAlert, setFilterAlert] = useState(false)

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, authLoading])

  const loadData = async () => {
    setLoading(true)
    try {
      const [prods, movs] = await Promise.all([
        pb.collection(C.PRODUCTS).getList(1, 500, { filter: `shop_id="${shop.id}" && track_inventory=true && status="active"`, sort: 'name' }).then(r => r.items),
        pb.collection(C.INV_MOVEMENTS).getList(1, 100, { filter: `shop_id="${shop.id}"`, expand: 'product_id,created_by' })
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
    setAdjustCost(product.cost_price_kes || '')
    setShowAdjust(true)
  }

  const handleAdjust = async (e) => {
    e.preventDefault()
    if (!adjustQty || isNaN(adjustQty) || Number(adjustQty) <= 0) return toast.error('Enter valid quantity')
    setSaving(true)
    try {
      const qty = Number(adjustQty)
      const isOut = ['stock_out', 'damage', 'adjustment'].includes(adjustType) && adjustType !== 'stock_in' && adjustType !== 'return'
      const deltaQty = adjustType === 'stock_in' || adjustType === 'return' ? qty : -qty
      const newQty = Math.max(0, (adjustProduct.stock_qty || 0) + deltaQty)

      await pb.collection(C.PRODUCTS).update(adjustProduct.id, { stock_qty: newQty })
      await pb.collection(C.INV_MOVEMENTS).create({
        shop_id: shop.id,
        product_id: adjustProduct.id,
        type: adjustType,
        qty: adjustType === 'stock_in' || adjustType === 'return' ? qty : -qty,
        before_qty: adjustProduct.stock_qty || 0,
        after_qty: newQty,
        cost_per_unit: adjustType === 'stock_in' ? Number(adjustCost) || 0 : null,
        notes: adjustNote,
        created_by: pb.authStore.model?.id
      })

      toast.success(`Stock ${adjustType === 'stock_in' ? 'added' : 'adjusted'}!`)
      setShowAdjust(false)
      loadData()
    } catch (err) { toast.error(err?.message || 'Failed') }
    finally { setSaving(false) }
  }

  const filteredProducts = filterAlert
    ? products.filter(p => p.stock_qty <= (p.reorder_point || 5))
    : products

  const totalStockValue = products.reduce((s, p) => s + ((p.stock_qty || 0) * (p.cost_price_kes || 0)), 0)
  const totalRetailValue = products.reduce((s, p) => s + ((p.stock_qty || 0) * (p.price_kes || 0)), 0)
  const lowCount = products.filter(p => p.stock_qty <= (p.reorder_point || 5)).length
  const outCount = products.filter(p => p.stock_qty <= 0).length

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Inventory 📦</div>
          <div className="page-subtitle">{products.length} tracked products</div>
        </div>
        <button className="btn-primary" onClick={() => openAdjust(null, 'stock_in')}><Plus size={16} /> Stock Adjustment</button>
      </div>

      {/* Summary cards */}
      <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Stock Value (Cost)', value: fmtKES(totalStockValue), icon: '💰', cls: 'rose' },
          { label: 'Retail Value', value: fmtKES(totalRetailValue), icon: '🏷️', cls: 'gold' },
          { label: 'Low Stock Items', value: lowCount, icon: '⚠️', cls: lowCount > 0 ? 'rose' : 'green' },
          { label: 'Out of Stock', value: outCount, icon: '❌', cls: outCount > 0 ? 'rose' : 'green' },
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
        {[['stock', '📊 Stock Levels'], ['movements', '🔄 Movements']].map(([v, l]) => (
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
                      `${i + 1}. *${p.name}*\n    Stock: ${p.stock_qty ?? 0} ${p.unit || 'pcs'} (reorder at ${p.reorder_point || 5})`
                    ).join('\n\n')
                    const outItems = lowItems.filter(p => p.stock_qty <= 0)
                    const msg = `⚠️ *Low Stock Report — ${shop.name}*\n\n${outItems.length > 0 ? `❌ *${outItems.length} item(s) completely out of stock*\n` : ''}📦 *${lowItems.length} product(s) need restocking:*\n\n${lines}\n\n_Please reorder to avoid losing sales._\n\n_${shop.name} · SalesTrack_`
                    const phone = shop.phone ? shop.phone.replace(/\D/g, '').replace(/^0/, '254') : ''
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
                  }}
                >
                  📲 Alert All ({lowCount})
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
                          {p.stock_qty ?? 0}
                        </span>
                        <span style={{ color: '#9b6070', fontSize: 12, marginLeft: 4 }}>{p.unit || 'pcs'}</span>
                      </td>
                      <td style={{ color: '#9b6070', fontSize: 13 }}>{p.reorder_point || 5}</td>
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
                                const msg = `⚠️ *Low Stock Alert — ${shop.name}*\n\n*Product:*\n${p.name}${p.brand ? ' (' + p.brand + ')' : ''}\n\n*Current Stock:*\n${p.stock_qty ?? 0} ${p.unit || 'pcs'}\n\n*Reorder Level:*\n${p.reorder_point || 5} ${p.unit || 'pcs'}\n\n*Retail Price:*\n${fmtKES(p.price_kes)}\n\n📦 Restock this product to avoid losing sales.\n\n_${shop.name} · SalesTrack_`
                                const phone = shop.phone ? shop.phone.replace(/\D/g, '').replace(/^0/, '254') : ''
                                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
                              }}
                            >
                              📲
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
                      <td style={{ color: '#9b6070' }}>{m.before_qty}</td>
                      <td style={{ fontWeight: 600 }}>{m.after_qty}</td>
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
              <span className="modal-title">Stock Adjustment</span>
              <button onClick={() => setShowAdjust(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!adjustProduct && (
                  <div>
                    <label className="label">Product *</label>
                    <select className="input" onChange={e => setAdjustProduct(products.find(p => p.id === e.target.value))} required>
                      <option value="">Select product</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock_qty || 0})</option>)}
                    </select>
                  </div>
                )}
                {adjustProduct && <div style={{ background: '#fce8ed', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>
                  <strong>{adjustProduct.name}</strong> · Current stock: <strong>{adjustProduct.stock_qty || 0}</strong>
                </div>}
                <div>
                  <label className="label">Movement Type</label>
                  <select className="input" value={adjustType} onChange={e => setAdjustType(e.target.value)}>
                    <option value="stock_in">📦 Stock In (Received)</option>
                    <option value="stock_out">📤 Stock Out (Removed)</option>
                    <option value="return">🔄 Return / Refund</option>
                    <option value="damage">💔 Damaged / Lost</option>
                    <option value="adjustment">✏️ Manual Adjustment</option>
                  </select>
                </div>
                <div>
                  <label className="label">Quantity *</label>
                  <input className="input" type="number" min={1} required value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="Enter quantity" />
                </div>
                {adjustType === 'stock_in' && (
                  <div>
                    <label className="label">Cost per Unit (KES)</label>
                    <input className="input" type="number" min={0} step="0.01" value={adjustCost} onChange={e => setAdjustCost(e.target.value)} />
                  </div>
                )}
                <div>
                  <label className="label">Notes / Reference</label>
                  <input className="input" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="e.g. Supplier invoice #123, LPO reference…" />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowAdjust(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : '💾 Save Adjustment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}