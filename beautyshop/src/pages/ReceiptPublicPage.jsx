import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import pb, { C, PB_URL } from '../lib/pb'

function fmtKES(n) {
  return `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
}

// Tiny confetti burst — runs once on mount, cleans up after itself
function triggerConfetti() {
  const colors = ['#c8456a', '#f9c8d8', '#25D366', '#fff', '#ffd700']
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden'
  document.body.appendChild(container)

  for (let i = 0; i < 60; i++) {
    const dot = document.createElement('div')
    const size = Math.random() * 8 + 4
    const x = Math.random() * 100
    const delay = Math.random() * 0.6
    const dur = Math.random() * 1.5 + 1.2
    const color = colors[Math.floor(Math.random() * colors.length)]
    dot.style.cssText = `
      position:absolute;
      left:${x}%;top:-10px;
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      opacity:1;
      animation:confettiFall ${dur}s ${delay}s ease-in forwards
    `
    container.appendChild(dot)
  }

  const style = document.createElement('style')
  style.textContent = `
    @keyframes confettiFall {
      0%   { transform: translateY(0) rotate(0deg);   opacity: 1; }
      80%  { opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }
  `
  document.head.appendChild(style)
  setTimeout(() => { container.remove(); style.remove() }, 3000)
}

export default function ReceiptPublicPage() {
  const { token } = useParams()
  const [sale, setSale]     = useState(null)
  const [items, setItems]   = useState([])
  const [shop, setShop]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [shared, setShared]     = useState(false)   // for share button feedback
  const [appreciated, setAppreciated] = useState(false) // for appreciate button feedback

  useEffect(() => {
    const load = async () => {
      try {
        // expand: 'served_by' pulls the staff record so we get their name
        const saleRes = await pb.collection(C.SALES).getFirstListItem(
          `share_token="${token}"`,
          { '$autoCancel': false, 'query': { token }, expand: 'served_by' }
        )
        saleRes.served_by_name = saleRes.expand?.served_by?.name || ''

        const [shopRes, itemsRes] = await Promise.all([
          pb.collection(C.SHOPS).getOne(saleRes.shop_id, { '$autoCancel': false }),
          pb.collection(C.SALE_ITEMS).getList(1, 100, {
            filter: `sale_id="${saleRes.id}"`,
            '$autoCancel': false,
            'query': { token },
          }).then(r => r.items),
        ])

        setSale(saleRes)
        setShop(shopRes)
        setItems(itemsRes)

        // 🎉 small delight: confetti when receipt loads successfully
        triggerConfetti()
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  // ── Share receipt ────────────────────────────────────────────────────────
  const handleShare = async (receiptNo) => {
    const url = window.location.href
    const text = `Here's my receipt #${receiptNo} 🧾`
    if (navigator.share) {
      try { await navigator.share({ title: 'My Receipt', text, url }) } catch {}
    } else {
      await navigator.clipboard.writeText(url).catch(() => {})
      setShared(true)
      setTimeout(() => setShared(false), 2500)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #f0e4e8', borderTop: '3px solid #c8456a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // ── Not found ────────────────────────────────────────────────────────────
  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif', padding: 24, textAlign: 'center' }}>
      <div>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🧾</div>
        <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020' }}>Receipt not found</h2>
        <p style={{ color: '#9b6070' }}>This receipt link may be invalid or has expired.</p>
      </div>
    </div>
  )

  // ── Derived values ───────────────────────────────────────────────────────
  const brand   = shop?.brand_color || '#c8456a'
  const logoUrl = shop?.logo
    ? `${PB_URL}/api/files/${shop.collectionId}/${shop.id}/${shop.logo}?thumb=200x200`
    : null
  const date = new Date(sale.created).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = new Date(sale.created).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })

  const reorderPhone = shop.phone ? shop.phone.replace(/[^0-9]/g, '') : ''
  const reorderMsg   = encodeURIComponent(
    'Hi ' + shop.name + '! 👋\n\n' +
    "I'd like to order the same items as receipt *#" + sale.receipt_no + '*:\n\n' +
    items.map(it => '• ' + it.product_name + ' × ' + it.qty).join('\n') +
    '\n\nPlease confirm availability. Thank you! 🙏'
  )
  const appreciateMsg = encodeURIComponent(
    'Hi ' + shop.name + '! 💝\n\n' +
    'I\'d like to appreciate *' + sale.served_by_name + '* who served me on receipt *#' + sale.receipt_no + '*.\n\n' +
    'Fantastic service — please pass on my gratitude! 🙏\n\n' +
    '_' + shop.name + ' · Powered by SalesTrack_'
  )

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'Nunito,sans-serif', padding: '24px 16px' }}>
      <style>{`
        @media print { body { background: #fff } .no-print { display: none !important } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important } }
      `}</style>

      {/* data-receipt is required by the Save as Image querySelector below */}
      <div data-receipt style={{ maxWidth: 480, margin: '0 auto', background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 4px 32px rgba(0,0,0,0.10)' }}>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{ background: `linear-gradient(135deg,${brand},${brand}cc)`, padding: '24px 20px', textAlign: 'center' }}>
          {logoUrl
            ? <img src={logoUrl} alt={shop.name} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.5)', margin: '0 auto 10px', display: 'block', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }} />
            : <div style={{ fontSize: 40, marginBottom: 8 }}>🧾</div>
          }
          <div style={{ color: '#fff', fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700 }}>{shop?.name}</div>
          {shop?.address  && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 4 }}>📍 {shop.address}</div>}
          {shop?.phone    && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>📞 {shop.phone}</div>}
          {shop?.receipt_header && <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6, fontStyle: 'italic' }}>{shop.receipt_header}</div>}
        </div>

        {/* ── Receipt meta ─────────────────────────────────────────────── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px dashed #f0e4e8', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: '#9b6070', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Receipt No.</div>
            <div style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: 15, color: '#1a1a1f' }}>{sale.receipt_no}</div>
            {/* Served-by badge — only shown if staff name was loaded */}
            {sale.served_by_name && (
              <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff0f5', border: '1px solid #f9c8d8', borderRadius: 20, padding: '3px 10px' }}>
                <span style={{ fontSize: 13 }}>👤</span>
                <span style={{ fontSize: 11, color: '#c8456a', fontWeight: 700 }}>Served by {sale.served_by_name}</span>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#9b6070' }}>{date}</div>
            <div style={{ fontSize: 12, color: '#9b6070' }}>{time}</div>
          </div>
        </div>

        {/* ── Items ────────────────────────────────────────────────────── */}
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

        {/* ── Totals ───────────────────────────────────────────────────── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px dashed #f0e4e8' }}>
          {[
            { label: 'Subtotal', value: fmtKES(sale.subtotal_kes),       show: true },
            { label: 'Discount', value: `-${fmtKES(sale.discount_kes)}`, show: sale.discount_kes > 0 },
            { label: 'Tax',      value: fmtKES(sale.tax_amount_kes),     show: sale.tax_amount_kes > 0 && shop?.receipt_show_tax },
          ].filter(r => r.show).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b4050', padding: '4px 0' }}>
              <span>{r.label}</span><span>{r.value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, color: '#1a1a1f', padding: '10px 0 0', borderTop: '1.5px solid #f0e4e8', marginTop: 6 }}>
            <span>TOTAL</span><span style={{ color: brand }}>{fmtKES(sale.total_kes)}</span>
          </div>
          <div style={{ fontSize: 12, color: '#9b6070', marginTop: 6 }}>
            Paid via <strong style={{ color: '#1a1a1f' }}>{sale.payment_method?.toUpperCase()}</strong> · {sale.payment_status}
          </div>
        </div>

        {/* ── Footer / CTAs ─────────────────────────────────────────────── */}
        <div style={{ padding: '20px 20px 24px', textAlign: 'center' }}>
          {shop?.receipt_footer && (
            <div style={{ fontSize: 13, color: '#6b4050', fontStyle: 'italic', marginBottom: 16 }}>{shop.receipt_footer}</div>
          )}

          {/* 1 — Query on WhatsApp */}
          {shop?.phone && (
            <a
              href={`https://wa.me/${shop.phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(`Hi ${shop?.name}! I have a question about receipt ${sale.receipt_no}.`)}`}
              target="_blank" rel="noopener noreferrer" className="no-print"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none', marginBottom: 10 }}
            >
              📲 Query this receipt on WhatsApp
            </a>
          )}

          {/* 2 — Reorder same items */}
          {shop?.phone && items.length > 0 && (
            <div className="no-print" style={{ margin: '10px 0' }}>
              <a
                href={`https://wa.me/${reorderPhone}?text=${reorderMsg}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}
              >
                🔁 Order Same Items Again
              </a>
              <div style={{ fontSize: 11, color: '#9b6070', marginTop: 5 }}>Tap to reorder via WhatsApp</div>
            </div>
          )}

          {/* 3 — Appreciate the staff member */}
          {shop?.phone && sale?.served_by_name && (
            <div className="no-print" style={{ marginTop: 10 }}>
              <a
                href={`https://wa.me/${shop.phone.replace(/[^0-9]/g,'')}?text=${appreciateMsg}`}
                target="_blank" rel="noopener noreferrer"
                onClick={() => { setAppreciated(true); setTimeout(() => setAppreciated(false), 3000) }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: appreciated ? '#fff0f5' : '#fff0f5', border: `1.5px solid ${appreciated ? brand : '#f9c8d8'}`, color: brand, fontWeight: 700, fontSize: 13, textDecoration: 'none', transition: 'all 0.2s' }}
              >
                {appreciated ? '💝 Sent!' : `💝 Appreciate ${sale.served_by_name}`}
              </a>
              <div style={{ fontSize: 10, color: '#c8b0b8', marginTop: 4 }}>Great service? Send a thank-you via WhatsApp</div>
            </div>
          )}

          {/* 4 — Share receipt link */}
          <div className="no-print" style={{ marginTop: 10 }}>
            <button
              onClick={() => handleShare(sale.receipt_no)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, background: '#f5f5f5', border: '1.5px solid #e8e0e4', color: '#3d1020', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', transition: 'background 0.2s' }}
            >
              {shared ? '✅ Link copied!' : '🔗 Share this receipt'}
            </button>
            {!shared && <div style={{ fontSize: 10, color: '#c8b0b8', marginTop: 4 }}>Share with anyone via link</div>}
          </div>

          {/* View shop */}
          <div style={{ marginTop: 16 }}>
            <a href={`${window.location.origin}/shop/${shop?.slug}`} style={{ color: brand, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
              View our services & book online →
            </a>
          </div>

          {/* Powered by */}
          <div style={{ fontSize: 10, color: '#c8b0b8', marginTop: 14 }}>
            Powered by <strong style={{ color: brand }}>SalesTrack</strong>
          </div>

          {/* Print + Save as Image */}
          <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => window.print()}
              style={{ padding: '8px 20px', borderRadius: 8, border: '1.5px solid #f0e4e8', background: '#fff', color: '#6b4050', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}
            >
              🖨️ Print Receipt
            </button>
            <button
              onClick={async () => {
                // data-receipt must exist on the outer div — it does ✅
                const el = document.querySelector('[data-receipt]')
                if (!el) return
                try {
                  const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js')
                  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
                  const link   = document.createElement('a')
                  link.download = `receipt-${sale.receipt_no}.png`
                  link.href     = canvas.toDataURL('image/png')
                  link.click()
                } catch {
                  alert('Could not save image. Try screenshot instead.')
                }
              }}
              style={{ padding: '8px 20px', borderRadius: 8, border: '1.5px solid #f0e4e8', background: '#fff', color: '#6b4050', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}
            >
              💾 Save as Image
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}