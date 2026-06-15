import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES } from '../lib/utils'
import { Printer, Search, Plus, Minus, Download } from 'lucide-react'
import { useReactToPrint } from 'react-to-print'
import QRCode from 'qrcode'

const LABEL_SIZES = [
  { id: 'small',  label: '30×20mm',  w: 114, h: 76  },
  { id: 'medium', label: '50×30mm',  w: 189, h: 113 },
  { id: 'large',  label: '80×50mm',  w: 302, h: 189 },
]

export default function BarcodeLabelsPage() {
  const { shop, loading: authLoading } = useAuth()
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [queue, setQueue] = useState([])   // { product, qty, size }
  const [labelSize, setLabelSize] = useState('medium')
  const [loading, setLoading] = useState(true)
  const [qrCodes, setQrCodes] = useState({})
  const printRef = useRef()
  const handlePrint = useReactToPrint({ content: () => printRef.current })

  useEffect(() => { if (shop) loadProducts() }, [shop])

  const loadProducts = async () => {
    setLoading(true)
    try {
      const prods = await pb.collection(C.PRODUCTS).getList(1, 500, { filter: `shop_id="${shop.id}" && status="active"`, sort: 'name' }).then(r => r.items)
      setProducts(prods)
      // Pre-generate QR codes
      const codes = {}
      await Promise.all(prods.map(async p => {
        if (p.barcode || p.sku) {
          codes[p.id] = await QRCode.toDataURL(p.barcode || p.sku, { width: 60, margin: 0 })
        }
      }))
      setQrCodes(codes)
    } finally { setLoading(false) }
  }

  const addToQueue = (product) => {
    setQueue(q => {
      const exists = q.find(i => i.product.id === product.id)
      if (exists) return q.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...q, { product, qty: 1, size: labelSize }]
    })
  }

  const updateQty = (id, delta) => setQueue(q => q.map(i => i.product.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
  const removeFromQueue = (id) => setQueue(q => q.filter(i => i.product.id !== id))

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search) || p.sku?.includes(search))
  const size = LABEL_SIZES.find(s => s.id === labelSize)
  const totalLabels = queue.reduce((a, i) => a + i.qty, 0)

  // Expand queue into individual labels for printing
  const printLabels = queue.flatMap(item => Array(item.qty).fill(item))

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Barcode Labels 🏷️</div>
          <div className="page-subtitle">Generate and print product price tags & barcode labels</div>
        </div>
        <button className="btn-primary desktop-action-btn" onClick={handlePrint} disabled={queue.length === 0}>
          <Printer size={16} /> Print {totalLabels} Label{totalLabels !== 1 ? 's' : ''}
        </button>
      </div>

      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20 }}>
        {/* Product selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
                <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
                <input className="input" style={{ paddingLeft: 36 }} placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div>
                <label className="label" style={{ marginBottom: 4 }}>Label Size</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {LABEL_SIZES.map(s => (
                    <button key={s.id} onClick={() => setLabelSize(s.id)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: labelSize === s.id ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fce8ed', color: labelSize === s.id ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, minWidth: 0, overflow: 'hidden' }}>
            <div className="table-wrap">
              <table style={{ minWidth: 560 }}>
                <thead><tr><th>Product</th><th>Barcode/SKU</th><th>Price</th><th>Add</th></tr></thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        {p.brand && <div style={{ fontSize: 11, color: '#9b6070' }}>{p.brand}</div>}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.barcode || p.sku || <span style={{ color: '#9b6070' }}>No barcode</span>}</td>
                      <td style={{ fontWeight: 700, color: '#c8456a' }}>{fmtKES(p.price_kes)}</td>
                      <td>
                        <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12, boxShadow: 'none' }} onClick={() => addToQueue(p)}>
                          <Plus size={12} /> Add
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Print queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px' }}>Print Queue ({totalLabels})</h3>
            {queue.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#9b6070', fontSize: 14 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🏷️</div>
                Add products to print their labels
              </div>
            ) : queue.map(item => (
              <div key={item.product.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f5edf0' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{item.product.name}</div>
                  <div style={{ fontSize: 12, color: '#c8456a' }}>{fmtKES(item.product.price_kes)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => updateQty(item.product.id, -1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e8d0d6', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={11} /></button>
                  <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.product.id, 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e8d0d6', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={11} /></button>
                  <button onClick={() => removeFromQueue(item.product.id)} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: '#fee2e2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#dc2626' }}>✕</button>
                </div>
              </div>
            ))}
          </div>

          {/* Label preview */}
          {queue.length > 0 && (
            <div className="card">
              <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 12px' }}>Label Preview</h3>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <LabelPreview product={queue[0].product} qrCode={qrCodes[queue[0].product.id]} size={size} shop={shop} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden print sheet */}
      <div ref={printRef} style={{ display: 'none' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '4px' }}>
          {printLabels.map((item, i) => (
            <LabelPreview key={i} product={item.product} qrCode={qrCodes[item.product.id]} size={size} shop={shop} />
          ))}
        </div>
      </div>
    </div>
  )
}

function LabelPreview({ product, qrCode, size, shop }) {
  return (
    <div style={{
      width: size.w, height: size.h,
      border: '1px solid #ccc',
      borderRadius: 4,
      padding: '4px 6px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      background: '#fff',
      fontFamily: 'monospace',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      <div style={{ fontSize: 8, fontWeight: 700, color: '#3d1020', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {shop?.name || 'SALESTRACK'}
      </div>
      <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {product.name}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#c8456a' }}>KES {product.price_kes?.toLocaleString()}</div>
          {product.barcode && <div style={{ fontSize: 7, color: '#555', marginTop: 2 }}>{product.barcode}</div>}
        </div>
        {qrCode && <img src={qrCode} style={{ width: 36, height: 36 }} alt="qr" />}
      </div>
    </div>
  )
}