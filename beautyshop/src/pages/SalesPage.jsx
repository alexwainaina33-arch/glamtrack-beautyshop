import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDateTime, fmtDate } from '../lib/utils'
import { Eye, Search, RefreshCw, X } from 'lucide-react'
import { format, startOfDay, endOfDay, subDays } from 'date-fns'
import ReceiptModal from '../components/ReceiptModal'
import toast from 'react-hot-toast'

export default function SalesPage() {
  const { shop, role } = useAuth()
  const isCashier = role === 'cashier'
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedSale, setSelectedSale] = useState(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const PER_PAGE = 25

  useEffect(() => { if (shop) loadSales() }, [shop, dateFrom, dateTo, statusFilter, page])

  const loadSales = async () => {
    setLoading(true)
    try {
      const filters = [`shop_id="${shop.id}"`]
      if (isCashier) filters.push(`served_by="${pb.authStore.model?.id}"`)
      if (statusFilter === 'credit') filters.push(`payment_status="pending"`)
      else if (statusFilter) filters.push(`status="${statusFilter}"`)
      const res = await pb.collection(C.SALES).getList(page, PER_PAGE, {
        filter: filters.join(' && '),
        expand: 'customer_id,served_by'
      })
      const dateFiltered = res.items.filter(s => {
        const m = s.receipt_no?.match(/-(\d{6})-/)
        if (!m) return true // show if no receipt date parseable
        const c = m[1]
        const saleDate = `20${c.slice(0,2)}-${c.slice(2,4)}-${c.slice(4,6)}`
        if (dateFrom && saleDate < dateFrom) return false
        if (dateTo && saleDate > dateTo) return false
        return true
      })
      setSales(dateFiltered)
      setTotal(res.totalItems)
    } finally { setLoading(false) }
  }

  const viewSale = async (sale) => {
    try {
      const items = await pb.collection(C.SALE_ITEMS).getList(1, 200, { filter: `sale_id="${sale.id}"` }).then(r => r.items)
      setSelectedSale({ ...sale, items })
      setShowReceipt(true)
    } catch { toast.error('Failed to load sale details') }
  }

  const voidSale = async (sale) => {
    if (!confirm(`Void sale ${sale.receipt_no}? This cannot be undone.`)) return
    try {
      await pb.collection(C.SALES).update(sale.id, { status: 'voided' })
      toast.success('Sale voided')
      loadSales()
    } catch { toast.error('Failed to void sale') }
  }

  const markPaid = async (sale) => {
    if (!confirm(`Mark ${sale.receipt_no} as paid? This will record full payment received.`)) return
    try {
      await pb.collection(C.SALES).update(sale.id, { payment_status: 'paid', payment_method: 'cash', notes: (sale.notes || '') + ' | PAID ' + new Date().toLocaleDateString('en-KE') })
      // Add to customer total spent
      if (sale.expand?.customer_id) {
        const c = sale.expand.customer_id
        await pb.collection(C.CUSTOMERS).update(c.id, { total_spent_kes: (c.total_spent_kes || 0) + sale.total_kes })
      }
      toast.success('✅ Marked as paid!')
      loadSales()
    } catch { toast.error('Failed') }
  }

  const sendWhatsAppReminder = (sale) => {
    const customer = sale.expand?.customer_id
    if (!customer?.phone) return toast.error('Customer has no phone number')
    const msg = `Hello ${customer.name} 👋\n\nThis is a friendly reminder that you have an outstanding balance of *${fmtKES(sale.total_kes)}* at ${sale.shop_id ? 'our shop' : 'our shop'}.\n\nReceipt: ${sale.receipt_no}\n\nKindly settle at your earliest convenience. Thank you! 🙏`
    window.open(`https://wa.me/${customer.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const filtered = sales.filter(s =>
    !search || s.receipt_no?.toLowerCase().includes(search.toLowerCase()) ||
    s.expand?.customer_id?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalRevenue = filtered.reduce((s, x) => s + (x.payment_status !== 'pending' ? (x.total_kes || 0) : 0), 0)
  const totalProfit = filtered.reduce((s, x) => s + (x.payment_status !== 'pending' ? (x.gross_profit_kes || 0) : 0), 0)
  const totalOutstanding = filtered.reduce((s, x) => s + (x.payment_status === 'pending' ? (x.total_kes || 0) : 0), 0)
  const avgSaleValue = filtered.length ? totalRevenue / Math.max(1, filtered.filter(s => s.status === 'completed' && s.payment_status !== 'pending').length) : 0

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Sales 🧾</div>
        <div className="page-subtitle">{total} records found</div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px 160px auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label className="label">Search</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
              <input className="input" style={{ paddingLeft: 36 }} placeholder="Receipt no, customer…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Date From</label>
            <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Date To</label>
            <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="credit">💳 Credit (Unpaid)</option>
              <option value="voided">Voided</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <button className="btn-secondary" onClick={loadSales} style={{ alignSelf: 'flex-end' }}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 20 }}>
        {(isCashier ? [
          { label: 'My Sales', value: filtered.length, color: '#3b82f6', isCount: true },
          { label: 'My Revenue', value: fmtKES(totalRevenue), color: '#c8456a' },
        ] : [
          { label: 'Total Revenue', value: fmtKES(totalRevenue), color: '#c8456a' },
          { label: 'Gross Profit', value: fmtKES(totalProfit), color: '#059669' },
          { label: 'Avg Sale Value', value: fmtKES(avgSaleValue), color: '#3b82f6' },
          { label: '💳 Outstanding Credit', value: fmtKES(totalOutstanding), color: totalOutstanding > 0 ? '#dc2626' : '#9b6070', alert: totalOutstanding > 0 },
        ]).map((s, i) => (
          <div key={i} className="card" style={{ textAlign: 'center', padding: '16px', border: s.alert ? '2px solid #fee2e2' : undefined, background: s.alert ? '#fff5f5' : undefined }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Playfair Display,serif', color: s.color }}>{s.isCount ? s.value : s.value}</div>
            <div style={{ fontSize: 12, color: '#9b6070', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
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
                  <th>Receipt No</th>
                  <th>Date & Time</th>
                  <th>Customer</th>
                  {!isCashier && <th>Served By</th>}
                  <th>Subtotal</th>
                  <th>Discount</th>
                  <th>Total</th>
                  {!isCashier && <th>Profit</th>}
                  <th>Payment</th>
                  {!isCashier && <th>eTIMS</th>}
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(sale => (
                  <tr key={sale.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#c8456a' }}>{sale.receipt_no}</td>
                    <td style={{ fontSize: 12, color: '#9b6070', whiteSpace: 'nowrap' }}>{fmtDateTime(sale.created)}</td>
                    <td style={{ fontSize: 13 }}>{sale.expand?.customer_id?.name || <span style={{ color: '#9b6070' }}>Walk-in</span>}</td>
                    {!isCashier && <td style={{ fontSize: 12, color: '#9b6070' }}>{sale.expand?.served_by?.name || '—'}</td>}
                    <td>{fmtKES(sale.subtotal_kes)}</td>
                    <td style={{ color: '#dc2626' }}>{sale.discount_kes > 0 ? fmtKES(sale.discount_kes) : '—'}</td>
                    <td style={{ fontWeight: 700 }}>{fmtKES(sale.total_kes)}</td>
                    {!isCashier && <td style={{ color: '#059669', fontWeight: 600 }}>{fmtKES(sale.gross_profit_kes)}</td>}
                    <td>
                      <span style={{ fontSize: 12, background: sale.payment_status === 'pending' ? '#fef3c7' : '#f5edf0', color: sale.payment_status === 'pending' ? '#b45309' : '#6b4050', padding: '2px 8px', borderRadius: 20, fontWeight: sale.payment_status === 'pending' ? 700 : 400 }}>
                        {sale.payment_method === 'cash' ? '💵' : sale.payment_method === 'mpesa' ? '📱' : sale.payment_method === 'credit' ? '💳' : '💳'} {sale.payment_method}
                        {sale.payment_status === 'pending' && ' ⚠️'}
                      </span>
                    </td>
                    {!isCashier && <td>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sale.etims_status === 'success' ? '#f0fdf4' : sale.etims_status === 'failed' ? '#fee2e2' : '#fefce8', color: sale.etims_status === 'success' ? '#059669' : sale.etims_status === 'failed' ? '#dc2626' : '#d97706' }}>
                        {sale.etims_status || 'pending'}
                      </span>
                    </td>}
                    <td>
                      <span className={`badge ${sale.status === 'completed' ? 'text-emerald-600 bg-emerald-50' : sale.status === 'voided' ? 'text-red-600 bg-red-50' : 'text-gray-500 bg-gray-100'}`}>
                        {sale.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn-ghost" style={{ padding: '5px 10px' }} onClick={() => viewSale(sale)}><Eye size={14} /></button>
                        {sale.payment_status === 'pending' && (
                          <>
                            <button onClick={() => markPaid(sale)} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: '#f0fdf4', color: '#059669', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>✅ Paid</button>
                            <button onClick={() => sendWhatsAppReminder(sale)} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: '#f0fdf4', color: '#25D366', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>📲</button>
                          </>
                        )}
                        {!isCashier && sale.status === 'completed' && sale.payment_status !== 'pending' && (
                          <button className="btn-ghost" style={{ padding: '5px 10px', color: '#dc2626', fontSize: 11 }} onClick={() => voidSale(sale)}>Void</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={isCashier ? 8 : 12} style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>No sales found</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > PER_PAGE && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 20px', borderTop: '1px solid #f5edf0' }}>
            <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <span style={{ padding: '8px 16px', fontSize: 13, color: '#6b4050' }}>Page {page} of {Math.ceil(total / PER_PAGE)}</span>
            <button className="btn-secondary" disabled={page >= Math.ceil(total / PER_PAGE)} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        )}
      </div>

      {showReceipt && selectedSale && (
        <ReceiptModal sale={selectedSale} shop={shop} onClose={() => { setShowReceipt(false); setSelectedSale(null) }} />
      )}
    </div>
  )
}