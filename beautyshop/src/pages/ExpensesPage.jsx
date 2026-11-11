import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate } from '../lib/utils'
import { Plus, X, Edit2, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, startOfWeek, subMonths, subDays, differenceInCalendarDays, parseISO, isValid } from 'date-fns'

const EMPTY = { description: '', category_id: '', amount_kes: '', expense_date: format(new Date(), 'yyyy-MM-dd'), payment_method: 'cash', reference: '', notes: '' }

export default function ExpensesPage() {
  const { shop, loading: authLoading, isLocked } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [receiptFile, setReceiptFile] = useState(null)
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('💼')
  const fileRef = useRef()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [prevTotal, setPrevTotal] = useState(null)

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, dateFrom, dateTo])

  const loadSeq = useRef(0)

  const loadAllExpenses = async () => {
    const perPage = 200
    let all = []
    for (let page = 1; page <= 50; page++) {
      const r = await pb.collection(C.EXPENSES).getList(page, perPage, { filter: `shop_id="${shop.id}"`, sort: '-expense_date', expand: 'category_id,created_by' })
      all = all.concat(r.items)
      if (r.items.length < perPage) break
    }
    const day = e => String(e.expense_date || '').slice(0, 10)
    const rows = all.filter(e => day(e) >= dateFrom && day(e) <= dateTo)
    const a = parseISO(dateFrom)
    const b = parseISO(dateTo)
    let prevTotal = null
    if (isValid(a) && isValid(b) && b >= a) {
      const days = differenceInCalendarDays(b, a) + 1
      const pTo = format(subDays(a, 1), 'yyyy-MM-dd')
      const pFrom = format(subDays(a, days), 'yyyy-MM-dd')
      prevTotal = all.filter(e => day(e) >= pFrom && day(e) <= pTo).reduce((s, e) => s + (Number(e.amount_kes) || 0), 0)
    }
    return { rows, prevTotal }
  }

  const loadData = async () => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const [loaded, cats] = await Promise.all([
        loadAllExpenses(),
        pb.collection(C.EXPENSE_CATS).getList(1, 200, { filter: `shop_id="${shop.id}"`, sort: 'name' }).then(r => r.items)
      ])
      if (seq !== loadSeq.current) return
      setExpenses(loaded.rows)
      setPrevTotal(loaded.prevTotal)
      setCategories(cats)
    } catch (err) {
      if (seq === loadSeq.current) toast.error('Could not load expenses. Check your connection and try again.')
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  const openNew = () => { setEditing(null); setForm(EMPTY); setReceiptFile(null); setShowModal(true) }
  const openEdit = (exp) => {
    setEditing(exp)
    setForm({
      description: exp.description || '',
      category_id: exp.category_id || '',
      amount_kes: exp.amount_kes ?? '',
      expense_date: String(exp.expense_date || '').slice(0, 10) || format(new Date(), 'yyyy-MM-dd'),
      payment_method: exp.payment_method || 'cash',
      reference: exp.reference || '',
      notes: exp.notes || ''
    })
    setReceiptFile(null)
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!editing && isLocked) return toast.error('🔒 Account locked — renew your subscription to record new expenses', { duration: 6000 })
    setSaving(true)
    try {
      const data = new FormData()
      const FIELDS = ['description', 'category_id', 'amount_kes', 'expense_date', 'payment_method', 'reference', 'notes']
      FIELDS.forEach(k => {
        const v = form[k]
        if (v === undefined || v === null) return
        if (v === '' && !editing) return
        data.append(k, v)
      })
      if (!editing) {
        data.append('shop_id', shop.id)
        data.append('created_by', pb.authStore.model?.id)
      }
      if (receiptFile) data.append('receipt_file', receiptFile)

      if (editing) {
        await pb.collection(C.EXPENSES).update(editing.id, data)
        toast.success('Expense updated')
      } else {
        await pb.collection(C.EXPENSES).create(data)
        toast.success('Expense recorded')
      }
      setShowModal(false)
      loadData()
    } catch (err) { toast.error(err?.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return
    try { await pb.collection(C.EXPENSES).delete(id); toast.success('Deleted'); loadData() }
    catch { toast.error('Delete failed') }
  }

  const handleAddCategory = async () => {
    if (!newCatName) return
    try {
      await pb.collection(C.EXPENSE_CATS).create({ shop_id: shop.id, name: newCatName, icon: newCatIcon })
      setNewCatName('')
      toast.success('Category added')
      loadData()
      setShowCatModal(false)
    } catch { toast.error('Failed') }
  }

  const handleDeleteCategory = async (cat) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return
    try { await pb.collection(C.EXPENSE_CATS).delete(cat.id); toast.success('Category deleted'); loadData() }
    catch { toast.error('Could not delete. The category may still be used by expenses.') }
  }

  // Group by category for summary
  const catSummary = categories.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + e.amount_kes, 0)
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  const totalExpenses = expenses.reduce((s, e) => s + e.amount_kes, 0)

  const byMethod = expenses.reduce((m, e) => { const k = e.payment_method || 'other'; m[k] = (m[k] || 0) + (Number(e.amount_kes) || 0); return m }, {})
  const q = search.trim().toLowerCase()
  const visible = expenses.filter(e =>
    (!catFilter || (catFilter === 'none' ? !e.category_id : e.category_id === catFilter)) &&
    (!q || `${e.description || ''} ${e.reference || ''} ${e.notes || ''}`.toLowerCase().includes(q)))
  const changePct = prevTotal > 0 ? ((totalExpenses - prevTotal) / prevTotal) * 100 : null

  const setPreset = (p) => {
    const now = new Date()
    const f = d => format(d, 'yyyy-MM-dd')
    if (p === 'today') { setDateFrom(f(now)); setDateTo(f(now)) }
    else if (p === 'week') { setDateFrom(f(startOfWeek(now, { weekStartsOn: 1 }))); setDateTo(f(now)) }
    else if (p === 'month') { setDateFrom(f(startOfMonth(now))); setDateTo(f(endOfMonth(now))) }
    else if (p === 'last') { const l = subMonths(now, 1); setDateFrom(f(startOfMonth(l))); setDateTo(f(endOfMonth(l))) }
  }

  const receiptUrl = (exp) => {
    try { return pb.files?.getUrl ? pb.files.getUrl(exp, exp.receipt_file) : pb.getFileUrl(exp, exp.receipt_file) }
    catch { return '#' }
  }

  const exportCsv = () => {
    const esc = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' }
    const head = ['Date', 'Description', 'Category', 'Payment', 'Amount (KES)', 'Reference', 'Notes']
    const lines = [head.map(esc).join(',')].concat(visible.map(e => [
      String(e.expense_date || '').slice(0, 10), e.description, e.expand?.category_id?.name || 'Uncategorized',
      e.payment_method, e.amount_kes, e.reference, e.notes
    ].map(esc).join(',')))
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses_${dateFrom}_to_${dateTo}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  const uncategorized = expenses.filter(e => !e.category_id).reduce((s, e) => s + e.amount_kes, 0)

  const DEFAULT_CATS = [
    { icon: '👤', name: 'Salaries & Wages' }, { icon: '💡', name: 'Electricity' },
    { icon: '💧', name: 'Water' }, { icon: '🚗', name: 'Transport' },
    { icon: '🏠', name: 'Rent' }, { icon: '📦', name: 'Packaging' },
    { icon: '📱', name: 'Airtime & Data' }, { icon: '🛠️', name: 'Repairs & Maintenance' },
    { icon: '📢', name: 'Marketing & Ads' }, { icon: '🧹', name: 'Cleaning' },
    { icon: '🏥', name: 'Medical' }, { icon: '📚', name: 'Training' },
  ]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Expenses 💸</div>
          <div className="page-subtitle">{expenses.length} entries · {fmtKES(totalExpenses)} total</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => setShowCatModal(true)}>⚙️ Categories</button>
          <button className="btn-primary" onClick={openNew} disabled={isLocked} title={isLocked ? 'Account locked — renew to add expenses' : ''}>
            {isLocked ? '🔒 Locked' : <><Plus size={16} /> Add Expense</>}
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="expenses-filter-grid" style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <label className="label">From</label>
            <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 24, fontWeight: 700, color: '#dc2626', marginLeft: 'auto', alignSelf: 'center' }}>
            Total: {fmtKES(totalExpenses)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['last', 'Last month']].map(([k, l]) => (
            <button key={k} type="button" className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => setPreset(k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#3d1020', marginBottom: 8 }}>
          {Object.entries(byMethod).map(([m, v]) => (
            <span key={m}><strong style={{ textTransform: 'capitalize' }}>{m}</strong>: {fmtKES(v)}</span>
          ))}
        </div>
        {byMethod.cash > 0 && (
          <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 8 }}>
            Cash expenses of {fmtKES(byMethod.cash)} reduce Expected Cash on the Cash Reconciliation page for the days they were paid.
          </div>
        )}
        {prevTotal !== null && (
          <div style={{ fontSize: 13, color: '#3d1020', marginBottom: 12 }}>
            Previous period (same length): {fmtKES(prevTotal)}
            {changePct !== null && <span style={{ fontWeight: 700, color: changePct > 0 ? '#dc2626' : '#059669' }}> ({changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%)</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Search description, reference or notes" aria-label="Search expenses" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input" style={{ width: 'auto' }} aria-label="Filter by category" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">All categories</option>
            <option value="none">Uncategorized</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <button type="button" className="btn-secondary" onClick={exportCsv} disabled={visible.length === 0}>Export CSV</button>
        </div>
        {visible.length !== expenses.length && (
          <div style={{ fontSize: 12, color: '#9b6070', marginTop: 8 }}>Showing {visible.length} of {expenses.length} entries</div>
        )}
      </div>

      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Expenses table */}
        <div className="card" style={{ padding: 0, minWidth: 0 }}>
          <div className="table-wrap">
            <table style={{ minWidth: 640 }}>
              <thead>
                <tr><th>Date</th><th>Description</th><th>Category</th><th>Payment</th><th>Amount</th><th>Receipt</th><th></th></tr>
              </thead>
              <tbody>
                {visible.map(exp => (
                  <tr key={exp.id}>
                    <td style={{ fontSize: 12, color: '#9b6070', whiteSpace: 'nowrap' }}>{fmtDate(exp.expense_date)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{exp.description}</div>
                      {exp.reference && <div style={{ fontSize: 11, color: '#9b6070' }}>Ref: {exp.reference}</div>}
                    </td>
                    <td>
                      {exp.expand?.category_id
                        ? <span style={{ fontSize: 12, background: '#fce8ed', color: '#8b2550', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{exp.expand.category_id.icon} {exp.expand.category_id.name}</span>
                        : <span style={{ color: '#9b6070', fontSize: 12 }}>Uncategorized</span>}
                    </td>
                    <td>
                      <span style={{ fontSize: 12, background: '#f5edf0', padding: '2px 8px', borderRadius: 20 }}>{exp.payment_method}</span>
                    </td>
                    <td style={{ fontWeight: 700, color: '#dc2626', fontSize: 15 }}>{fmtKES(exp.amount_kes)}</td>
                    <td>{exp.receipt_file ? <a href={receiptUrl(exp)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#3b82f6' }}>📎 Attached</a> : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-ghost" style={{ padding: '5px 10px' }} onClick={() => openEdit(exp)} aria-label={`Edit ${exp.description}`}><Edit2 size={13} /></button>
                        <button className="btn-ghost" style={{ padding: '5px 10px', color: '#dc2626' }} onClick={() => handleDelete(exp.id)} aria-label={`Delete ${exp.description}`}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>{loading ? 'Loading...' : expenses.length > 0 ? 'No expenses match your filters' : 'No expenses recorded in this period'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* By category */}
        <div className="card">
          <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px' }}>By Category</h3>
          {catSummary.map(cat => (
            <div key={cat.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span>{cat.icon} {cat.name}</span>
                <span style={{ fontWeight: 700, color: '#dc2626' }}>{fmtKES(cat.total)}</span>
              </div>
              <div style={{ background: '#f5edf0', borderRadius: 4, height: 6 }}>
                <div style={{ background: 'linear-gradient(90deg,#c8456a,#8b2550)', height: 6, borderRadius: 4, width: `${Math.min(100, (cat.total / totalExpenses) * 100)}%` }} />
              </div>
              <div style={{ fontSize: 11, color: '#9b6070', textAlign: 'right' }}>
                {((cat.total / totalExpenses) * 100).toFixed(1)}%
              </div>
            </div>
          ))}
          {uncategorized > 0 && (
            <div style={{ paddingTop: 10, borderTop: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9b6070' }}>
              <span>Uncategorized</span><span>{fmtKES(uncategorized)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expense Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Expense' : 'Record Expense'}</span>
              <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="label">Description *</label>
                  <input className="input" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Electricity bill August 2025" />
                </div>
                <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="label">Amount (KES) *</label>
                    <input className="input" type="number" required min={0} step="0.01" value={form.amount_kes} onChange={e => setForm(f => ({ ...f, amount_kes: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Date *</label>
                    <input className="input" type="date" required value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                      <option value="">Select category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Payment Method</label>
                    <select className="input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                      <option value="cash">💵 Cash</option>
                      <option value="mpesa">📱 M-Pesa</option>
                      <option value="bank">🏦 Bank Transfer</option>
                      <option value="card">💳 Card</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Reference / Receipt No</label>
                  <input className="input" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Invoice or receipt number" />
                </div>
                <div>
                  <label className="label">Receipt Upload</label>
                  <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e8c0cc', borderRadius: 10, padding: '14px', textAlign: 'center', cursor: 'pointer', background: '#fff5f7', fontSize: 13, color: '#9b6070' }}>
                    <Upload size={18} style={{ margin: '0 auto 4px', display: 'block', color: '#c8456a' }} />
                    {receiptFile
                      ? <span style={{ color: '#059669', fontWeight: 700 }}>✅ {receiptFile.name}</span>
                      : <><div>📷 Snap receipt photo or upload PDF</div><div style={{ fontSize: 11, marginTop: 3, color: '#c8b0b8' }}>On mobile — opens camera directly</div></>
                    }
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={e => setReceiptFile(e.target.files[0])} />
                </div>
                <div>
                  <label className="label">Notes</label>
                  <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : editing ? '💾 Update' : '✅ Record Expense'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCatModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">Expense Categories</span>
              <button onClick={() => setShowCatModal(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <input className="input" style={{ width: 50 }} value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)} placeholder="🏷️" />
                <input className="input" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" style={{ flex: 1 }} />
                <button className="btn-primary" onClick={handleAddCategory}><Plus size={16} /></button>
              </div>
              {categories.length === 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: '#9b6070', marginBottom: 8 }}>Quick add common categories:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {DEFAULT_CATS.map(cat => (
                      <button key={cat.name} className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                        onClick={async () => {
                          await pb.collection(C.EXPENSE_CATS).create({ shop_id: shop.id, name: cat.name, icon: cat.icon })
                          loadData()
                        }}>
                        {cat.icon} {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {categories.map(cat => (
                  <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fff5f7', borderRadius: 8 }}>
                    <span>{cat.icon} {cat.name}</span>
                    <button className="btn-ghost" style={{ padding: '4px 8px', color: '#dc2626' }} onClick={() => handleDeleteCategory(cat)} aria-label={`Delete category ${cat.name}`}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}