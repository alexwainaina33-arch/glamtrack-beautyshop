import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate } from '../lib/utils'
import { Plus, X, Edit2, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth } from 'date-fns'

const EMPTY = { description: '', category_id: '', amount_kes: '', expense_date: format(new Date(), 'yyyy-MM-dd'), payment_method: 'cash', reference: '', notes: '' }

export default function ExpensesPage() {
  const { shop, loading: authLoading } = useAuth()
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

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, dateFrom, dateTo])

  const loadData = async () => {
    setLoading(true)
    try {
      const [exps, cats] = await Promise.all([
        pb.collection(C.EXPENSES).getList(1, 500, { filter: `shop_id="${shop.id}"`, expand: 'category_id,created_by' }).then(r => r.items.filter(e => e.expense_date >= dateFrom && e.expense_date <= dateTo)),
        pb.collection(C.EXPENSE_CATS).getList(1, 200, { filter: `shop_id="${shop.id}"`, sort: 'name' }).then(r => r.items)
      ])
      setExpenses(exps)
      setCategories(cats)
    } finally { setLoading(false) }
  }

  const openNew = () => { setEditing(null); setForm(EMPTY); setReceiptFile(null); setShowModal(true) }
  const openEdit = (exp) => { setEditing(exp); setForm({ ...exp, expense_date: exp.expense_date?.split('T')[0] || format(new Date(), 'yyyy-MM-dd') }); setReceiptFile(null); setShowModal(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data = new FormData()
      Object.entries(form).forEach(([k, v]) => { if (v !== undefined && v !== '') data.append(k, v) })
      data.append('shop_id', shop.id)
      data.append('created_by', pb.authStore.model?.id)
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

  // Group by category for summary
  const catSummary = categories.map(cat => ({
    ...cat,
    total: expenses.filter(e => e.category_id === cat.id).reduce((s, e) => s + e.amount_kes, 0)
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  const totalExpenses = expenses.reduce((s, e) => s + e.amount_kes, 0)
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
          <button className="btn-primary" onClick={openNew}><Plus size={16} /> Add Expense</button>
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

      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Expenses table */}
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Description</th><th>Category</th><th>Payment</th><th>Amount</th><th>Receipt</th><th></th></tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
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
                    <td>{exp.receipt_file ? <span style={{ fontSize: 11, color: '#3b82f6' }}>📎 Attached</span> : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-ghost" style={{ padding: '5px 10px' }} onClick={() => openEdit(exp)}><Edit2 size={13} /></button>
                        <button className="btn-ghost" style={{ padding: '5px 10px', color: '#dc2626' }} onClick={() => handleDelete(exp.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>No expenses recorded</td></tr>}
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
                    {receiptFile ? receiptFile.name : 'Upload receipt photo or PDF'}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setReceiptFile(e.target.files[0])} />
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
                    <button className="btn-ghost" style={{ padding: '4px 8px', color: '#dc2626' }} onClick={async () => { await pb.collection(C.EXPENSE_CATS).delete(cat.id); loadData() }}><Trash2 size={13} /></button>
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