import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES } from '../lib/utils'
import { Plus, Search, Upload, Edit2, Trash2, X, Package, BarChart2, FileUp } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY = { name: '', sku: '', barcode: '', category_id: '', description: '', unit: 'piece', price_kes: '', cost_price_kes: '', compare_price_kes: '', stock_qty: '', reorder_point: 5, track_inventory: true, is_service: false, is_taxable: true, brand: '', tags: '', status: 'active' }

export default function ProductsPage() {
  const { shop, loading: authLoading } = useAuth()
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [imageFiles, setImageFiles] = useState([])
  const [imagePreview, setImagePreview] = useState([])
  const [showBulk, setShowBulk] = useState(false)
  const [bulkFile, setBulkFile] = useState(null)
  const [bulkPreview, setBulkPreview] = useState([])
  const [bulkImporting, setBulkImporting] = useState(false)
  const fileInputRef = useRef()
  const csvInputRef = useRef()

  useEffect(() => {
    if (shop?.id && !authLoading) {
      loadData()
    }
  }, [shop?.id, authLoading])

  const loadData = async () => {
    if (!shop?.id) return
    setLoading(true)
    try {
      const [prods, cats] = await Promise.all([
        pb.collection(C.PRODUCTS).getList(1, 500, {
          filter: `shop_id="${shop.id}"`,
          '$autoCancel': false,
        }).then(r => r.items).catch(() => []),
        pb.collection(C.CATEGORIES).getList(1, 200, {
          filter: `shop_id="${shop.id}"`,
          '$autoCancel': false,
        }).then(r => r.items).catch(() => []),
      ])
      setProducts(prods)
      setCategories(cats)
    } finally {
      setLoading(false)
    }
  }

  const openNew = () => { setEditing(null); setForm(EMPTY); setImageFiles([]); setImagePreview([]); setShowModal(true) }
  const openEdit = (p) => { setEditing(p); setForm({ ...p }); setImageFiles([]); setImagePreview([]); setShowModal(true) }

  const handleImages = (e) => {
    const files = Array.from(e.target.files)
    setImageFiles(files)
    const previews = files.map(f => URL.createObjectURL(f))
    setImagePreview(previews)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') data.append(k, v)
      })
      data.append('shop_id', shop.id)
      imageFiles.forEach(f => data.append('images', f))

      if (editing) {
        await pb.collection(C.PRODUCTS).update(editing.id, data)
        toast.success('Product updated!')
      } else {
        await pb.collection(C.PRODUCTS).create(data)
        toast.success('Product created!')
      }
      setShowModal(false)
      loadData()
    } catch (err) {
      toast.error(err?.message || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return
    try {
      await pb.collection(C.PRODUCTS).delete(id)
      toast.success('Product deleted')
      loadData()
    } catch { toast.error('Delete failed') }
  }

  // CSV Bulk import
  const handleCsvUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setBulkFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').filter(Boolean)
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',')
        const obj = {}
        headers.forEach((h, i) => { obj[h] = vals[i]?.trim() || '' })
        return obj
      })
      setBulkPreview(rows.slice(0, 50))
    }
    reader.readAsText(file)
  }

  const handleBulkImport = async () => {
    if (!bulkPreview.length) return
    setBulkImporting(true)
    let success = 0, failed = 0
    for (const row of bulkPreview) {
      try {
        const cat = row.category ? categories.find(c => c.name.toLowerCase() === row.category?.toLowerCase()) : null
        await pb.collection(C.PRODUCTS).create({
          shop_id: shop.id,
          name: row.name || row.product_name || 'Unnamed',
          sku: row.sku || '',
          barcode: row.barcode || '',
          category_id: cat?.id || '',
          price_kes: parseFloat(row.price_kes || row.price || 0),
          cost_price_kes: parseFloat(row.cost_price_kes || row.cost || 0),
          stock_qty: parseInt(row.stock_qty || row.stock || 0),
          brand: row.brand || '',
          unit: row.unit || 'piece',
          status: 'active',
          track_inventory: true,
        })
        success++
      } catch { failed++ }
    }
    toast.success(`Imported ${success} products${failed ? `, ${failed} failed` : ''}`)
    setShowBulk(false)
    setBulkPreview([])
    loadData()
    setBulkImporting(false)
  }

  const filtered = products.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search) || p.sku?.includes(search) || p.brand?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Products 📦</div>
          <div className="page-subtitle">{products.length} products · {categories.length} categories</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-secondary" onClick={() => setShowBulk(true)}><Upload size={16} /> Bulk Import</button>
          <button className="btn-primary" onClick={openNew}><Plus size={16} /> Add Product</button>
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
          <input className="input" style={{ paddingLeft: 42 }} placeholder="Search by name, barcode, SKU, or brand…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Barcode/SKU</th>
                  <th>Price</th>
                  <th>Cost</th>
                  <th>Margin</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const cat = categories.find(c => c.id === p.category_id)
                  const margin = p.price_kes && p.cost_price_kes ? (((p.price_kes - p.cost_price_kes) / p.price_kes) * 100).toFixed(0) : null
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#1a1a1f' }}>{p.name}</div>
                        {p.brand && <div style={{ fontSize: 11, color: '#9b6070' }}>{p.brand}</div>}
                      </td>
                      <td><span style={{ fontSize: 12, color: '#9b6070' }}>{cat?.name || '—'}</span></td>
                      <td>
                        {p.barcode && <div style={{ fontFamily: 'monospace', fontSize: 12, background: '#f5edf0', padding: '2px 8px', borderRadius: 6, display: 'inline-block' }}>{p.barcode}</div>}
                        {p.sku && <div style={{ fontSize: 11, color: '#9b6070' }}>SKU: {p.sku}</div>}
                      </td>
                      <td style={{ fontWeight: 600 }}>{fmtKES(p.price_kes)}</td>
                      <td style={{ color: '#9b6070' }}>{fmtKES(p.cost_price_kes)}</td>
                      <td>{margin !== null ? <span style={{ background: margin > 50 ? '#f0fdf4' : margin > 20 ? '#fefce8' : '#fee2e2', color: margin > 50 ? '#059669' : margin > 20 ? '#d97706' : '#dc2626', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{margin}%</span> : '—'}</td>
                      <td>
                        {p.track_inventory
                          ? <span style={{ fontWeight: 700, color: p.stock_qty <= 0 ? '#dc2626' : p.stock_qty <= (p.reorder_point || 5) ? '#d97706' : '#059669' }}>{p.stock_qty ?? 0}</span>
                          : <span style={{ color: '#9b6070', fontSize: 12 }}>∞</span>}
                      </td>
                      <td><span className={`badge ${p.status === 'active' ? 'text-emerald-600 bg-emerald-50' : p.status === 'draft' ? 'text-amber-600 bg-amber-50' : 'text-gray-500 bg-gray-100'}`}>{p.status}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-ghost" style={{ padding: '5px 10px' }} onClick={() => openEdit(p)}><Edit2 size={14} /></button>
                          <button className="btn-ghost" style={{ padding: '5px 10px', color: '#dc2626' }} onClick={() => handleDelete(p.id)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>No products found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Product' : 'New Product'}</span>
              <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label className="label">Product Name *</label>
                    <input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Cantu Shea Butter Leave-In" />
                  </div>
                  <div>
                    <label className="label">Barcode</label>
                    <input className="input" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} placeholder="Scan or type barcode" />
                  </div>
                  <div>
                    <label className="label">SKU</label>
                    <input className="input" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="Internal code" />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                      <option value="">Select category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Unit</label>
                    <select className="input" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                      {['piece','ml','g','kg','litre','box','set','dozen','service'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Selling Price (KES) *</label>
                    <input className="input" type="number" required min={0} step="0.01" value={form.price_kes} onChange={e => setForm(f => ({ ...f, price_kes: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Cost Price (KES)</label>
                    <input className="input" type="number" min={0} step="0.01" value={form.cost_price_kes} onChange={e => setForm(f => ({ ...f, cost_price_kes: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Compare Price (KES)</label>
                    <input className="input" type="number" min={0} step="0.01" value={form.compare_price_kes} onChange={e => setForm(f => ({ ...f, compare_price_kes: e.target.value }))} placeholder="Original/crossed-out price" />
                  </div>
                  <div>
                    <label className="label">Brand</label>
                    <input className="input" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="e.g. Cantu, ORS, Dark & Lovely" />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Stock Quantity</label>
                    <input className="input" type="number" min={0} value={form.stock_qty} onChange={e => setForm(f => ({ ...f, stock_qty: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Reorder Point</label>
                    <input className="input" type="number" min={0} value={form.reorder_point} onChange={e => setForm(f => ({ ...f, reorder_point: e.target.value }))} />
                  </div>
                  <div style={{ gridColumn: '1/-1', display: 'flex', gap: 20 }}>
                    {[
                      { key: 'track_inventory', label: 'Track Inventory' },
                      { key: 'is_service', label: 'Is a Service' },
                      { key: 'is_taxable', label: 'Taxable (VAT)' },
                    ].map(({ key, label }) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                        <input type="checkbox" checked={!!form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} style={{ accentColor: '#c8456a', width: 16, height: 16 }} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label className="label">Product Images (up to 8)</label>
                    <div onClick={() => fileInputRef.current?.click()}
                      style={{ border: '2px dashed #e8c0cc', borderRadius: 12, padding: '20px', textAlign: 'center', cursor: 'pointer', transition: 'border 0.2s', background: '#fff5f7' }}>
                      {imagePreview.length > 0 ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                          {imagePreview.map((src, i) => <img key={i} src={src} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />)}
                        </div>
                      ) : (
                        <div style={{ color: '#9b6070' }}>
                          <Upload size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                          <div style={{ fontSize: 13 }}>Click to upload images</div>
                          <div style={{ fontSize: 11, marginTop: 4 }}>JPG, PNG, WebP · Max 10MB each</div>
                        </div>
                      )}
                    </div>
                    <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handleImages} />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label className="label">Tags (comma separated)</label>
                    <input className="input" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="hair care, moisturizer, leave-in" />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label className="label">Description</label>
                    <textarea className="input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Product description…" style={{ resize: 'vertical' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : editing ? '💾 Update Product' : '✨ Create Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBulk(false)}>
          <div className="modal" style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <span className="modal-title">Bulk Import Products 📊</span>
              <button onClick={() => setShowBulk(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#fce8ed', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
                <strong>CSV Format:</strong> name, sku, barcode, category, price_kes, cost_price_kes, stock_qty, unit, brand
              </div>
              <div onClick={() => csvInputRef.current?.click()}
                style={{ border: '2px dashed #e8c0cc', borderRadius: 12, padding: '24px', textAlign: 'center', cursor: 'pointer', background: '#fff5f7', marginBottom: 16 }}>
                <FileUp size={28} style={{ margin: '0 auto 8px', display: 'block', color: '#c8456a' }} />
                <div style={{ fontWeight: 600, color: '#3d1020' }}>{bulkFile ? bulkFile.name : 'Click to upload CSV file'}</div>
                <div style={{ fontSize: 12, color: '#9b6070', marginTop: 4 }}>Max 50 products per batch</div>
              </div>
              <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCsvUpload} />

              {bulkPreview.length > 0 && (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#3d1020' }}>Preview ({bulkPreview.length} rows)</div>
                  <div className="table-wrap" style={{ maxHeight: 250, overflowY: 'auto', marginBottom: 16 }}>
                    <table>
                      <thead><tr><th>Name</th><th>Barcode</th><th>Price</th><th>Cost</th><th>Stock</th><th>Category</th></tr></thead>
                      <tbody>
                        {bulkPreview.map((r, i) => (
                          <tr key={i}>
                            <td>{r.name || r.product_name}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{r.barcode}</td>
                            <td>{r.price_kes || r.price}</td>
                            <td>{r.cost_price_kes || r.cost}</td>
                            <td>{r.stock_qty || r.stock}</td>
                            <td>{r.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleBulkImport} disabled={bulkImporting}>
                    {bulkImporting ? 'Importing…' : `🚀 Import ${bulkPreview.length} Products`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}