import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import pb, { C, PB_URL } from '../lib/pb'

function fmtKES(n) {
  return `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
}

export default function ReceiptPublicPage() {
  const { token } = useParams()
  const [sale, setSale]   = useState(null)
  const [items, setItems] = useState([])
  const [shop, setShop]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const saleRes = await pb.collection(C.SALES).getFirstListItem(
          `share_token="${token}"`,
          { '$autoCancel': false, 'query': { token } }
        )
        const [shopRes, itemsRes] = await Promise.all([
          pb.collection(C.SHOPS).getOne(saleRes.shop_id, { '$autoCancel': false }),
          pb.collection(C.SALE_ITEMS).getList(1, 100, {
            filter: `sale_id="${saleRes.id}"`, '$autoCancel': false,
            'query': { token },
          }).then(r => r.items),
        ])
        setSale(saleRes)
        setShop(shopRes)
        setItems(itemsRes)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #f0e4e8', borderTop: '3px solid #c8456a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif', padding: 24, textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
        <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020' }}>Receipt not found</h2>
        <p style={{ color: '#9b6070' }}>This receipt link may be invalid.</p>
      </div>
    </div>
  )

  const brand = shop?.brand_color || '#c8456a'
  const logoUrl = shop?.logo
    ? `${PB_URL}/api/files/${shop.collectionId}/${shop.id}/${shop.logo}?thumb=200x200`
    : null
  const date = new Date(sale.created).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = new Date(sale.created).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'Nunito,sans-serif', padding: '24px 16px' }}>
      <style>{`@media print{body{background:#fff}.no-print{display:none!important}}`}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.10)' }}>

        {/* Header */}
        <div style={{ background: `linear-gradient(135deg,${brand},${brand}cc)`, padding: '24px 20px', textAlign: 'center' }}>
          {logoUrl
            ? <img src={logoUrl} alt={shop.name} style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.4)', margin: '0 auto 10px', display: 'block' }} />
            : <div style={{ fontSize: 36, marginBottom: 8 }}>🧾</div>
          }
          <div style={{ color: '#fff', fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700 }}>{shop?.name}</div>
          {shop?.address && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 }}>📍 {shop.address}</div>}
          {shop?.receipt_header && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>{shop.receipt_header}</div>}
        </div>

        {/* Receipt meta */}
        <div style={{ padding: '16px 20px', borderBottom: '1px dashed #f0e4e8', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: '#9b6070', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Receipt No.</div>
            <div style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 14, color: '#1a1a1f' }}>{sale.receipt_no}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#9b6070' }}>{date}</div>
            <div style={{ fontSize: 12, color: '#9b6070' }}>{time}</div>
          </div>
        </div>

        {/* Items */}
        <div style={{ padding: '16px 20px', borderBottom: '1px dashed #f0e4e8' }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', marginBottom: 12 }}>Items</div>
          {items.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < items.length - 1 ? '1px solid #f5edf0' : 'none' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1f' }}>{item.product_name}</div>
                <div style={{ fontSize: 11, color: '#9b6070' }}>Qty: {item.qty} × {fmtKES(item.unit_price_kes)}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1f' }}>{fmtKES(item.total_kes)}</div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ padding: '14px 20px', borderBottom: '1px dashed #f0e4e8' }}>
          {[
            { label: 'Subtotal',    value: fmtKES(sale.subtotal_kes),    show: true },
            { label: 'Discount',    value: `-${fmtKES(sale.discount_kes)}`, show: sale.discount_kes > 0 },
            { label: 'Tax',         value: fmtKES(sale.tax_amount_kes),  show: sale.tax_amount_kes > 0 && shop?.receipt_show_tax },
          ].filter(r => r.show).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b4050', padding: '4px 0' }}>
              <span>{r.label}</span><span>{r.value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, color: '#1a1a1f', padding: '10px 0 0', borderTop: '1.5px solid #f0e4e8', marginTop: 6 }}>
            <span>TOTAL</span><span style={{ color: brand }}>{fmtKES(sale.total_kes)}</span>
          </div>
          <div style={{ fontSize: 12, color: '#9b6070', marginTop: 6 }}>
            Paid via {sale.payment_method?.toUpperCase()} · {sale.payment_status}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', textAlign: 'center' }}>
          {shop?.receipt_footer && <div style={{ fontSize: 13, color: '#6b4050', fontStyle: 'italic', marginBottom: 12 }}>{shop.receipt_footer}</div>}
          {shop?.phone && (
            <a href={`https://wa.me/${shop.phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(`Hi ${shop?.name}! I have a question about receipt ${sale.receipt_no}.`)}`}
              target="_blank" rel="noopener noreferrer" className="no-print"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none', marginBottom: 12 }}>
              📲 Query this receipt on WhatsApp
            </a>
          )}
          <div style={{ marginTop: 8 }}>
            <a href={`${window.location.origin}/shop/${shop?.slug}`} style={{ color: brand, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              View our services & book online →
            </a>
          </div>
          <div style={{ fontSize: 10, color: '#c8b0b8', marginTop: 16 }}>
            Powered by <strong style={{ color: brand }}>SalesTrack</strong>
          </div>
          <button onClick={() => window.print()} className="no-print"
            style={{ marginTop: 12, padding: '8px 20px', borderRadius: 8, border: '1.5px solid #f0e4e8', background: '#fff', color: '#6b4050', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
            🖨️ Print Receipt
          </button>
        </div>
      </div>
    </div>
  )
}