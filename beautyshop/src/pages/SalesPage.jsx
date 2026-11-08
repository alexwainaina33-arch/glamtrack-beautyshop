// SALES-FIX-2026-11-08: summary cards cover the whole selected period (not just the 25 rows on screen), voided/refunded sales are not counted, dates use the shop's local day, refund amount prefill fixed, CSV exports every matching sale
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDateTime, fmtDate, r2 } from '../lib/utils'
import { Eye, Search, RefreshCw, X, Download, Undo2, Copy, AlertCircle, CheckCircle2 } from 'lucide-react'
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek } from 'date-fns'
import ReceiptModal from '../components/ReceiptModal'
import toast from 'react-hot-toast'

const PAYMENTS = 'bs_payments'

// Format a Date for a PocketBase filter, e.g. created>="2026-11-07 21:00:00.000Z"
const toPbDate = (d) => d.toISOString().replace('T', ' ')
// A picked calendar day (yyyy-MM-dd) becomes the start / end of that day in the shop's local time.
const dayStart = (s) => toPbDate(new Date(s + 'T00:00:00'))
const dayEnd = (s) => toPbDate(new Date(s + 'T23:59:59.999'))

export default function SalesPage() {
  const { shop, role } = useAuth()
  const isCashier = role === 'cashier'
  const [sales, setSales] = useState([])
  const [paidMap, setPaidMap] = useState({}) // { [sale_id]: amount received so far } for credit sales on this page
  const [summary, setSummary] = useState(null) // totals for the whole selected period, not just this page
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
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [refundSale, setRefundSale] = useState(null)
  const [refundReason, setRefundReason] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [refundProcessing, setRefundProcessing] = useState(false)
  const [selectedSales, setSelectedSales] = useState(new Set())
  const [recentlyVoided, setRecentlyVoided] = useState([])
  const [exporting, setExporting] = useState(false)
  const summaryReq = useRef(0)

  useEffect(() => { if (shop) loadSales() }, [shop, dateFrom, dateTo, statusFilter, page])
  useEffect(() => { if (shop) loadSummary() }, [shop, dateFrom, dateTo, statusFilter])

  const refreshAll = () => { loadSales(); loadSummary() }

  // Amount still owed on a credit sale = total minus payments recorded for it
  const balanceOf = (sale) => Math.max(0, r2((sale.total_kes || 0) - (paidMap[sale.id] || 0)))

  // The same filter is used for the table, the summary cards and the CSV export
  const buildFilter = () => {
    const filters = [`shop_id="${shop.id}"`]
    if (isCashier) filters.push(`served_by="${pb.authStore.model?.id}"`)
    if (statusFilter === 'credit') filters.push(`payment_status="pending"`)
    else if (statusFilter) filters.push(`status="${statusFilter}"`)
    // Day bounds are the start and end of the picked days in local time
    if (dateFrom) filters.push(`created >= "${dayStart(dateFrom)}"`)
    if (dateTo) filters.push(`created <= "${dayEnd(dateTo)}"`)
    return filters.join(' && ')
  }

  const matchesSearch = (s) =>
    !search || s.receipt_no?.toLowerCase().includes(search.toLowerCase()) ||
    s.expand?.customer_id?.name?.toLowerCase().includes(search.toLowerCase())

  const loadPaid = async (items) => {
    const ids = items.filter(s => s.payment_status === 'pending').map(s => s.id)
    if (!ids.length) { setPaidMap({}); return }
    try {
      const ps = await pb.collection(PAYMENTS).getFullList({
        filter: `shop_id="${shop.id}" && (${ids.map(id => `sale_id="${id}"`).join(' || ')})`,
        '$autoCancel': false, '$cancelKey': 'sales-paid-map'
      })
      const map = {}
      ps.forEach(p => { map[p.sale_id] = r2((map[p.sale_id] || 0) + (Number(p.amount_kes) || 0)) })
      setPaidMap(map)
    } catch (err) {
      setPaidMap({})
      toast.error('Could not load part-payments, so balances may look higher than they are', { id: 'sales-paid-err' })
    }
  }

  const loadSales = async () => {
    setLoading(true)
    try {
      const res = await pb.collection(C.SALES).getList(page, PER_PAGE, {
        filter: buildFilter(),
        sort: '-created',
        expand: 'customer_id,served_by'
      })
      setSales(res.items)
      setTotal(res.totalItems)
      await loadPaid(res.items)
    } catch (err) {
      if (!err?.isAbort) toast.error('Could not load sales: ' + (err?.message || 'Unknown error'), { id: 'sales-load-err' })
    } finally { setLoading(false) }
  }

  // Totals for EVERY sale in the selected dates and status (the table only shows one page of 25)
  const loadSummary = async () => {
    const myReq = ++summaryReq.current
    setSummary(null)
    try {
      const all = await pb.collection(C.SALES).getFullList({
        filter: buildFilter(),
        fields: 'id,total_kes,gross_profit_kes,status,payment_status',
        '$autoCancel': false, '$cancelKey': 'sales-summary'
      })
      let revenue = 0, profit = 0, paidCount = 0, count = 0
      const credit = []
      all.forEach(s => {
        if (s.status === 'voided' || s.status === 'refunded') return // not real income
        count++
        if (s.payment_status === 'pending') credit.push(s)
        else { revenue += s.total_kes || 0; profit += s.gross_profit_kes || 0; paidCount++ }
      })
      let outstanding = 0
      if (credit.length) {
        const paid = {}
        try {
          const ps = await pb.collection(PAYMENTS).getFullList({
            filter: `shop_id="${shop.id}"`,
            fields: 'sale_id,amount_kes',
            '$autoCancel': false, '$cancelKey': 'sales-summary-paid'
          })
          ps.forEach(p => { paid[p.sale_id] = (paid[p.sale_id] || 0) + (Number(p.amount_kes) || 0) })
        } catch {}
        credit.forEach(s => { outstanding += Math.max(0, r2((s.total_kes || 0) - (paid[s.id] || 0))) })
      }
      if (myReq === summaryReq.current) {
        setSummary({ revenue: r2(revenue), profit: r2(profit), outstanding: r2(outstanding), paidCount, count })
      }
    } catch (err) {
      if (myReq === summaryReq.current) setSummary(null)
    }
  }

  const viewSale = async (sale) => {
    try {
      const items = await pb.collection(C.SALE_ITEMS).getList(1, 200, {
        filter: `sale_id="${sale.id}"`,
        '$cancelKey': 'view-sale-items'
      }).then(r => r.items)
      // Guard: ensure numeric fields are never undefined
      const safeItems = items.map(i => ({
        ...i,
        qty: i.qty || 1,
        unit_price_kes: i.unit_price_kes ?? i.unit_price ?? 0,
        total_kes: i.total_kes ?? 0,
        unit_cost_kes: i.unit_cost_kes ?? 0,
      }))
      setSelectedSale({ ...sale, items: safeItems })
      setShowReceipt(true)
    } catch (err) {
      toast.error('Could not load receipt: ' + (err?.message || 'Unknown error'))
    }
  }

  const voidSale = async (sale) => {
    if (!confirm(`Void sale ${sale.receipt_no}? This cannot be undone.`)) return
    try {
      await pb.collection(C.SALES).update(sale.id, { status: 'voided' })
      toast.success('Sale voided')
      refreshAll()
    } catch { toast.error('Failed to void sale') }
  }

  const markPaid = async (sale) => {
    if (isCashier) return // the bs_sales update rule only allows owner/manager
    const due = balanceOf(sale)
    if (!confirm(`Mark ${sale.receipt_no} as paid? This records ${fmtKES(due)} received in cash.`)) return
    try {
      const customerId = sale.customer_id || sale.expand?.customer_id?.id || null
      // Record the remaining balance as a payment (re-read first so nothing is counted twice)
      if (customerId) {
        const existing = await pb.collection(PAYMENTS).getFullList({ filter: `sale_id="${sale.id}"`, '$autoCancel': false, '$cancelKey': 'mark-paid-existing' })
        const already = existing.reduce((s, p) => s + (Number(p.amount_kes) || 0), 0)
        const remaining = r2((sale.total_kes || 0) - already)
        if (remaining > 0.005) {
          await pb.collection(PAYMENTS).create({
            shop_id: shop.id, customer_id: customerId, sale_id: sale.id,
            amount_kes: remaining, method: 'cash', paid_on: new Date().toISOString(),
            created_by: pb.authStore.model?.id || null,
          })
        }
      }
      await pb.collection(C.SALES).update(sale.id, { payment_status: 'paid', payment_method: 'cash', notes: (sale.notes || '') + ' | PAID ' + new Date().toLocaleDateString('en-KE') })
      // Add to customer total paid (fresh read so an older screen cannot overwrite a newer total)
      if (customerId) {
        const c = await pb.collection(C.CUSTOMERS).getOne(customerId)
        await pb.collection(C.CUSTOMERS).update(c.id, { total_spent_kes: (c.total_spent_kes || 0) + (sale.total_kes || 0) })
      }
      toast.success('✅ Marked as paid!')
      refreshAll()
    } catch (err) { toast.error('Failed: ' + (err?.message || 'Unknown error')) }
  }

  const sendWhatsAppReminder = (sale) => {
    const customer = sale.expand?.customer_id
    if (!customer?.phone) return toast.error('Customer has no phone number')
    const digits = customer.phone.replace(/[^0-9]/g, '')
    const wa = digits.length === 10 && digits.startsWith('0') ? '254' + digits.slice(1) : digits
    const msg = `Hello ${customer.name} 👋\n\nThis is a friendly reminder that you have an outstanding balance of *${fmtKES(balanceOf(sale))}* at ${shop?.name || 'our shop'}.\n\nReceipt: ${sale.receipt_no}\n\nKindly settle at your earliest convenience. Thank you! 🙏`
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
  }

  const procesRefund = async () => {
    if (!refundSale) return
    const amt = Number(refundAmount) || 0
    if (amt <= 0 || amt > refundSale.total_kes) return toast.error('Enter valid refund amount')
    if (!refundReason.trim()) return toast.error('Enter refund reason')

    setRefundProcessing(true)
    try {
      const isFullRefund = amt >= refundSale.total_kes
      await pb.collection(C.SALES).update(refundSale.id, {
        status: isFullRefund ? 'voided' : 'refunded',
        payment_status: 'refunded',
        notes: (refundSale.notes || '') + `\n[REFUND] ${refundReason} - ${fmtKES(amt)} on ${format(new Date(), 'dd/MM/yyyy HH:mm')}`
      })
      // Restore stock for refunded items
      if (isFullRefund) {
        const items = await pb.collection(C.SALE_ITEMS).getList(1, 200, { filter: `sale_id="${refundSale.id}"` }).then(r => r.items)
        await Promise.all(items.map(async (item) => {
          const prod = await pb.collection(C.PRODUCTS).getOne(item.product_id).catch(() => null)
          if (prod && prod.track_inventory) {
            const newQty = r2((prod.stock_qty || 0) + item.qty)
            await pb.collection(C.PRODUCTS).update(prod.id, { stock_qty: newQty })
          }
        }))
      }
      setRecentlyVoided(prev => [{ id: refundSale.id, receipt: refundSale.receipt_no, amount: amt, timestamp: new Date() }, ...prev].slice(0, 3))
      toast.success(`✅ Refund processed! ${fmtKES(amt)} from ${refundSale.receipt_no}`)
      setShowRefundModal(false)
      refreshAll()
    } catch (err) { toast.error('Refund failed: ' + err?.message) }
    finally { setRefundProcessing(false) }
  }

  const repeatSale = (sale) => {
    // Copy sale to clipboard as JSON so user can recreate in POS
    const data = {
      customer_id: sale.expand?.customer_id?.id || null,
      items: sale.items || [],
      total_kes: sale.total_kes
    }
    localStorage.setItem('repeat_sale_template', JSON.stringify(data))
    toast.success(`📋 Sale copied! Go to POS and look for "Repeat Sale" option to paste.`, { duration: 5000, icon: '✂️' })
  }

  const toggleSaleSelection = (saleId) => {
    const newSelected = new Set(selectedSales)
    if (newSelected.has(saleId)) {
      newSelected.delete(saleId)
    } else {
      newSelected.add(saleId)
    }
    setSelectedSales(newSelected)
  }

  const applyQuickFilter = (filterType) => {
    const now = new Date()
    if (filterType === 'today') {
      setDateFrom(format(startOfDay(now), 'yyyy-MM-dd'))
      setDateTo(format(endOfDay(now), 'yyyy-MM-dd'))
    } else if (filterType === 'week') {
      setDateFrom(format(startOfWeek(now), 'yyyy-MM-dd'))
      setDateTo(format(endOfWeek(now), 'yyyy-MM-dd'))
    } else if (filterType === 'month') {
      setDateFrom(format(startOfDay(subDays(now, 29)), 'yyyy-MM-dd'))
      setDateTo(format(endOfDay(now), 'yyyy-MM-dd'))
    }
    setPage(1)
  }

  const filtered = sales.filter(matchesSearch)

  const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

  // Exports EVERY sale matching the dates, status and search (not only the 25 on screen)
  const exportSalesCSV = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const all = await pb.collection(C.SALES).getFullList({
        filter: buildFilter(),
        sort: '-created',
        expand: 'customer_id,served_by',
        '$autoCancel': false, '$cancelKey': 'sales-export'
      })
      const list = all.filter(matchesSearch)
      if (!list.length) { toast.error('No sales to export'); return }
      const rows = list.map(s => {
        const base = {
          Receipt_No: s.receipt_no,
          Date: fmtDateTime(s.created),
          Customer: s.expand?.customer_id?.name || 'Walk-in',
          Subtotal_KES: s.subtotal_kes || 0,
          Discount_KES: s.discount_kes || 0,
          Total_KES: s.total_kes || 0,
          Payment_Method: s.payment_method,
          Payment_Status: s.payment_status,
          Status: s.status,
        }
        if (!isCashier) {
          base.Served_By = s.expand?.served_by?.name || ''
          base.Profit_KES = s.gross_profit_kes || 0
        }
        return base
      })
      const headers = Object.keys(rows[0])
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => csvCell(r[h])).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `sales-${dateFrom}-to-${dateTo}.csv`; a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${list.length} sales`)
    } catch (err) {
      toast.error('Export failed: ' + (err?.message || 'Unknown error'))
    } finally { setExporting(false) }
  }

  const summaryCards = isCashier ? [
    { label: 'My Sales', value: summary ? summary.count : '—', color: '#3b82f6' },
    { label: 'My Revenue', value: summary ? fmtKES(summary.revenue) : '—', color: '#c8456a' },
  ] : [
    { label: 'Total Revenue', value: summary ? fmtKES(summary.revenue) : '—', color: '#c8456a' },
    { label: 'Gross Profit', value: summary ? fmtKES(summary.profit) : '—', color: '#059669' },
    { label: 'Avg Sale Value', value: summary ? fmtKES(summary.paidCount ? summary.revenue / summary.paidCount : 0) : '—', color: '#3b82f6' },
    { label: '💳 Total Outstanding', value: summary ? fmtKES(summary.outstanding) : '—', color: summary && summary.outstanding > 0 ? '#dc2626' : '#9b6070', alert: !!summary && summary.outstanding > 0 },
  ]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Sales 🧾</div>
          <div className="page-subtitle">{total} records found</div>
        </div>
        <button className="btn-secondary" onClick={exportSalesCSV} disabled={exporting}><Download size={14} /> {exporting ? 'Preparing…' : 'Export CSV'}</button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        {/* Recently voided notification */}
        {recentlyVoided.length > 0 && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
            <AlertCircle size={16} color="#b45309" />
            <span style={{ flex: 1 }}>Recently refunded: {recentlyVoided.map(v => `${v.receipt} (${fmtKES(v.amount)})`).join(', ')}</span>
            <button onClick={() => setRecentlyVoided([])} className="btn-ghost" style={{ padding: '2px 6px' }}><X size={12} /></button>
          </div>
        )}

        {/* Quick filters */}
        <div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['today', '📅 Today'], ['week', '📊 This Week'], ['month', '📈 Last 30 Days']].map(([type, label]) => (
            <button key={type} onClick={() => applyQuickFilter(type)} style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid #f0e4e8', background: '#fff', color: '#8b2550', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif'
            }}>
              {label}
            </button>
          ))}
        </div>

        <div className="sales-filters-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px 160px auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label className="label">Search</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
              <input className="input" style={{ paddingLeft: 36 }} placeholder="Receipt no, customer…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Date From</label>
            <input className="input" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }} />
          </div>
          <div>
            <label className="label">Date To</label>
            <input className="input" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="credit">💳 Credit (Unpaid)</option>
              <option value="voided">Voided</option>
              <option value="refunded">Refunded</option>
            </select>
          </div>
          <button className="btn-secondary" onClick={refreshAll} aria-label="Refresh" style={{ alignSelf: 'flex-end' }}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Summary */}
      <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 8 }}>
        {summaryCards.map((s, i) => (
          <div key={i} className="card" style={{ textAlign: 'center', padding: '16px', border: s.alert ? '2px solid #fee2e2' : undefined, background: s.alert ? '#fff5f5' : undefined }}>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Playfair Display,serif', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#9b6070', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#9b6070', marginBottom: 20 }}>
        These cards cover all {total} records in the dates and status chosen above, not only this page. Voided and refunded sales are not counted.
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
                      {sale.payment_status === 'pending' && paidMap[sale.id] > 0 && (
                        <div style={{ fontSize: 10, color: '#b45309', marginTop: 3 }}>Balance {fmtKES(balanceOf(sale))}</div>
                      )}
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
                        <button className="btn-ghost" style={{ padding: '5px 10px' }} aria-label="View receipt" title="View receipt" onClick={() => viewSale(sale)}><Eye size={14} /></button>
                        {sale.payment_status === 'pending' && (
                          <>
                            {!isCashier && <button onClick={() => markPaid(sale)} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: '#f0fdf4', color: '#059669', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>✅ Paid</button>}
                            <button onClick={() => sendWhatsAppReminder(sale)} aria-label="Send WhatsApp reminder" title="Send WhatsApp reminder" style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: '#f0fdf4', color: '#25D366', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>📲</button>
                          </>
                        )}
                        {!isCashier && sale.status === 'completed' && sale.payment_status !== 'pending' && (
                          <>
                            <button onClick={() => { setRefundSale(sale); setRefundAmount(String(sale.total_kes || '')); setRefundReason(''); setShowRefundModal(true) }} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}><Undo2 size={11} style={{ display: 'inline', marginRight: 3 }} /> Refund</button>
                            <button onClick={() => repeatSale(sale)} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: '#f0f9ff', color: '#0369a1', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}><Copy size={11} style={{ display: 'inline', marginRight: 3 }} /> Repeat</button>
                            <button className="btn-ghost" style={{ padding: '5px 10px', color: '#dc2626', fontSize: 11 }} onClick={() => voidSale(sale)}>Void</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={isCashier ? 9 : 12} style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>No sales found</td></tr>}
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

      {/* Refund Modal */}
      {showRefundModal && refundSale && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowRefundModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header"><span className="modal-title">⏮️ Process Refund</span><button onClick={() => setShowRefundModal(false)} aria-label="Close" className="btn-ghost" style={{ padding: 8 }}><X size={16} /></button></div>
            <div className="modal-body">
              <div style={{ background: '#fff5f5', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b' }}>Receipt: {refundSale.receipt_no}</div>
                <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>Original Total: {fmtKES(refundSale.total_kes)}</div>
                {refundSale.expand?.customer_id && <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>Customer: {refundSale.expand.customer_id.name}</div>}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="label">Refund Amount *</label>
                <input className="input" type="number" placeholder="0" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} max={refundSale.total_kes} />
                <div style={{ fontSize: 11, color: '#9b6070', marginTop: 4 }}>Max: {fmtKES(refundSale.total_kes)}</div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="label">Reason *</label>
                <select className="input" value={refundReason} onChange={e => setRefundReason(e.target.value)} style={{ marginBottom: 8 }}>
                  <option value="">Select reason…</option>
                  <option value="Customer not satisfied">Customer not satisfied</option>
                  <option value="Damaged product">Damaged product</option>
                  <option value="Wrong item sold">Wrong item sold</option>
                  <option value="Customer changed mind">Customer changed mind</option>
                  <option value="System error">System error</option>
                  <option value="Other">Other</option>
                </select>
                {refundReason === 'Other' && (
                  <input className="input" placeholder="Explain reason…" onChange={e => setRefundReason(e.target.value)} style={{ marginTop: 6 }} />
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" onClick={() => setShowRefundModal(false)} style={{ flex: 1 }} disabled={refundProcessing}>Cancel</button>
                <button className="btn-primary" onClick={procesRefund} style={{ flex: 1, background: '#dc2626' }} disabled={refundProcessing || !refundAmount || !refundReason}>
                  {refundProcessing ? 'Processing…' : `Process Refund ${fmtKES(Number(refundAmount))}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
