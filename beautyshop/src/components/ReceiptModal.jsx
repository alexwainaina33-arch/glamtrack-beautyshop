import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { fmtKES, fmtDateTime } from '../lib/utils'
import { X, Printer, Download, Send } from 'lucide-react'

export default function ReceiptModal({ sale, shop, onClose }) {
  const receiptRef = useRef()
  const handlePrint = useReactToPrint({ content: () => receiptRef.current })

  const items = sale.items || []
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">Receipt ✅</span>
          <button onClick={onClose} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <button className="btn-primary" onClick={handlePrint} style={{ flex: 1, justifyContent: 'center' }}>
              <Printer size={16} /> Print Receipt
            </button>
            <button className="btn-secondary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
              New Sale
            </button>
          </div>

          {/* Digital receipt link — share via WhatsApp */}
          {sale.share_token && (
            <button
              onClick={() => {
                const receiptUrl = `${window.location.origin}/receipt/${sale.share_token}?token=${sale.share_token}`
                const custName = sale.customer?.name ? sale.customer.name.split(' ')[0] : 'there'
                const msg = [
                  `Hi ${custName}! 👋`,
                  ``,
                  `Thank you for shopping with *${shop?.name}*.`,
                  ``,
                  `🧾 Your digital receipt:`,
                  receiptUrl,
                  ``,
                  `_${shop?.name} · Powered by SalesTrack_`,
                ].join('\n')
                const phone = sale.customer?.phone?.replace(/[^0-9]/g, '')
                const waUrl = phone
                  ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
                  : `https://wa.me/?text=${encodeURIComponent(msg)}`
                window.open(waUrl, '_blank')
              }}
              style={{
                width: '100%', marginBottom: 20, padding: '11px',
                borderRadius: 12, border: 'none', background: '#25D366',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                fontFamily: 'Nunito,sans-serif', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 8,
              }}>
              <Send size={14} /> Send Digital Receipt via WhatsApp
            </button>
          )}

          {/* eTIMS status */}
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            <span style={{ color: '#059669', fontWeight: 700 }}>✅ eTIMS Compliant Receipt</span>
            {sale.etims_ref && <span style={{ color: '#6b7280', marginLeft: 8 }}>Ref: {sale.etims_ref}</span>}
          </div>

          {/* Print area */}
          <div ref={receiptRef} id="receipt-print" style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, background: '#fff', padding: 20, borderRadius: 10, border: '1px dashed #f0e4e8' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700, color: '#3d1020' }}>{shop?.name}</div>
              {shop?.address && <div style={{ fontSize: 11, color: '#6b4050' }}>{shop.address}</div>}
              {shop?.phone && <div style={{ fontSize: 11, color: '#6b4050' }}>Tel: {shop.phone}</div>}
              {shop?.etims_pin && <div style={{ fontSize: 11, color: '#6b4050' }}>PIN: {shop.etims_pin}</div>}
              <div style={{ marginTop: 8, borderTop: '1px dashed #ccc', paddingTop: 8, fontSize: 11 }}>
                <div style={{ fontWeight: 700 }}>OFFICIAL RECEIPT — eTIMS</div>
                <div>Receipt #: {sale.receipt_no}</div>
                <div>{fmtDateTime(sale.created || new Date())}</div>
                {sale.customer && <div>Customer: {sale.customer.name}</div>}
              </div>
            </div>

            {/* Items */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px dashed #ccc' }}>
                  <th style={{ textAlign: 'left', paddingBottom: 4 }}>ITEM</th>
                  <th style={{ textAlign: 'center' }}>QTY</th>
                  <th style={{ textAlign: 'right' }}>PRICE</th>
                  <th style={{ textAlign: 'right' }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ paddingTop: 4 }}>{item.name}</td>
                    <td style={{ textAlign: 'center' }}>{item.qty}</td>
                    <td style={{ textAlign: 'right' }}>{item.unit_price.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{(item.unit_price * item.qty).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ borderTop: '1px dashed #ccc', paddingTop: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal</span><span>KES {subtotal.toLocaleString()}</span>
              </div>
              {sale.discount_kes > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                  <span>Discount</span><span>- KES {sale.discount_kes.toLocaleString()}</span>
                </div>
              )}
              {sale.tax_amount_kes > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>VAT ({shop?.tax_rate}%)</span><span>KES {sale.tax_amount_kes.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px dashed #ccc', paddingTop: 6, marginTop: 4 }}>
                <span>TOTAL</span><span>KES {sale.total_kes?.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span>Payment</span><span style={{ textTransform: 'uppercase' }}>{sale.payment_method}</span>
              </div>
              {sale.change > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Change</span><span>KES {sale.change.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* eTIMS Footer */}
            <div style={{ textAlign: 'center', marginTop: 16, paddingTop: 10, borderTop: '1px dashed #ccc', fontSize: 10, color: '#6b7280' }}>
              {sale.etims_ref && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontWeight: 700 }}>KRA eTIMS Reference</div>
                  <div>{sale.etims_ref}</div>
                </div>
              )}
              <div>This receipt is electronically generated</div>
              <div>and submitted to KRA eTIMS system.</div>
              <div style={{ marginTop: 6, fontFamily: 'Playfair Display,serif', fontStyle: 'italic' }}>
                Thank you for shopping at {shop?.name}!
              </div>
              <div style={{ marginTop: 8 }}>★★★★★</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
