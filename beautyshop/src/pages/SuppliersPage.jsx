import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate, fmtDateTime } from '../lib/utils'
import { Plus, Edit2, Trash2, X, Phone, MessageCircle, Package } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY_SUPPLIER = { name: '', phone: '', email: '', address: '', notes: '', payment_terms: 'net30', credit_limit: '' }

export default function SuppliersPage() {
  const { shop, loading: authLoading, role, isLocked } = useAuth()
  const canPay = role === 'owner' || role === 'manager'
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_SUPPLIER)
  const [saving, setSaving] = useState(false)
  const [moves, setMoves] = useState([])
  const [pays, setPays] = useState([])
  const [ledgerOk, setLedgerOk] = useState(false)
  const [payFor, setPayFor] = useState(null)
  const [payBal, setPayBal] = useState(0)
  const [payAmt, setPayAmt] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payDate, setPayDate] = useState('')
  const [payRef, setPayRef] = useState('')
  const [paySaving, setPaySaving] = useState(false)
  const [histFor, setHistFor] = useState(null)

  // We store suppliers in bs_customers with a tag — or use a simple local state + PocketBase
  // For simplicity we use bs_customers with notes="SUPPLIER"
  useEffect(() => { if (shop) loadSuppliers() }, [shop])

  const loadSuppliers = async () => {
    setLoading(true)
    try {
      // Reuse bs_customers collection with a supplier flag in notes
      const res = await pb.collection(C.CUSTOMERS).getList(1, 500, {
        filter: `shop_id="${shop.id}" && notes~"__SUPPLIER__"`,
        sort: 'name'
      }).then(r => r.items)
      setSuppliers(res)
      loadLedger()
    } finally { setLoading(false) }
  }

  const loadLedger = async () => {
    try {
      const [mv, py] = await Promise.all([
        pb.collection(C.INV_MOVEMENTS).getFullList({ filter: 'shop_id="' + shop.id + '" && funding_source="payable"', '$autoCancel': false }),
        pb.collection('bs_supplier_payments').getFullList({ filter: 'shop_id="' + shop.id + '"', sort: '-paid_on', '$autoCancel': false }),
      ])
      setMoves(mv); setPays(py); setLedgerOk(true)
    } catch (e) { console.warn('supplier ledger load failed', e); setLedgerOk(false) }
  }

  const openPay = (name, bal) => {
    setPayFor(name)
    setPayBal(bal)
    setPayAmt(String(bal))
    setPayMethod('cash')
    setPayDate(new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10))
    setPayRef('')
  }

  const savePayment = async (e) => {
    e.preventDefault()
    if (isLocked) return toast.error('Account locked. Renew your subscription to record payments.')
    if (!canPay) return toast.error('Only the owner or a manager can record supplier payments')
    const amt = Math.round(Number(payAmt) * 100) / 100
    if (!amt || isNaN(amt) || amt <= 0) return toast.error('Enter an amount above 0')
    if (amt > payBal + 0.005) return toast.error('That is more than the balance owed (' + fmtKES(payBal) + ')')
    if (!payDate || payDate.length !== 10) return toast.error('Choose the payment date')
    setPaySaving(true)
    try {
      await pb.collection('bs_supplier_payments').create({
        shop_id: shop.id,
        supplier_name: payFor,
        amount_kes: amt,
        method: payMethod,
        paid_on: payDate + ' 12:00:00.000Z',
        reference: payRef.trim(),
        created_by: pb.authStore.model?.id,
      })
      toast.success('Payment recorded')
      setPayFor(null)
      await loadLedger()
    } catch (err) { toast.error(err?.message || 'Payment not saved') }
    finally { setPaySaving(false) }
  }

  const clean = (t) => String(t || '').replace(/\|/g, '/')

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        shop_id: shop.id,
        name: form.name,
        phone: form.phone,
        email: form.email,
        notes: `__SUPPLIER__ | Terms: ${form.payment_terms} | Limit: ${form.credit_limit} | Addr: ${clean(form.address)} | ${clean(form.notes)}`,
        loyalty_points: 0,
        total_spent_kes: 0,
        visit_count: 0,
      }
      if (editing) {
        await pb.collection(C.CUSTOMERS).update(editing.id, payload)
        toast.success('Supplier updated!')
      } else {
        await pb.collection(C.CUSTOMERS).create(payload)
        toast.success('Supplier added!')
      }
      setShowModal(false)
      loadSuppliers()
    } catch (err) { toast.error(err?.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier?')) return
    try { await pb.collection(C.CUSTOMERS).delete(id); toast.success('Deleted'); loadSuppliers() }
    catch { toast.error('Delete failed') }
  }

  const openEdit = (s) => {
    const notes = s.notes || ''
    const terms = notes.match(/Terms: ([^|]+)/)?.[1]?.trim() || 'net30'
    const limit = notes.match(/Limit: ([^|]+)/)?.[1]?.trim() || ''
    const addr  = notes.match(/Addr: ([^|]+)/)?.[1]?.trim() || ''
    const extra = notes.split('|').slice(4).join('|').trim() || ''
    setEditing(s)
    setForm({ name: s.name, phone: s.phone || '', email: s.email || '', address: addr, payment_terms: terms, credit_limit: limit, notes: extra })
    setShowModal(true)
  }

  const sendWhatsApp = (supplier, message) => {
    let phone = (supplier.phone || '').replace(/\D/g, ''); if (phone.startsWith('0')) phone = '254' + phone.slice(1); else if (phone.length === 9 && /^[17]/.test(phone)) phone = '254' + phone
    if (!phone) return toast.error('No phone number for this supplier')
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(url, '_blank')
    toast.success('Opening WhatsApp…')
  }

  const sendPOWhatsApp = (supplier) => {
    const msg = `Hello ${supplier.name},\n\nWe would like to place a purchase order. Please confirm availability and pricing.\n\nThank you,\n${shop?.name}`
    sendWhatsApp(supplier, msg)
  }

  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
  const norm = (t) => String(t || '').trim().toLowerCase()
  const owedBy = {}
  const paidBy = {}
  moves.forEach(m => { const k = norm(m.supplier_name); owedBy[k] = (owedBy[k] || 0) + Math.abs(m.qty || 0) * (m.cost_per_unit || 0) })
  pays.forEach(p => { const k = norm(p.supplier_name); paidBy[k] = (paidBy[k] || 0) + (Number(p.amount_kes) || 0) })
  const cardNames = new Set(suppliers.map(s => norm(s.name)))
  let unOwed = 0, unPaid = 0
  Object.keys(owedBy).forEach(k => { if (!cardNames.has(k)) unOwed += owedBy[k] })
  Object.keys(paidBy).forEach(k => { if (!cardNames.has(k)) unPaid += paidBy[k] })
  const unassigned = r2(unOwed - unPaid)
  const totalOwed = r2(Object.values(owedBy).reduce((a, b) => a + b, 0) - Object.values(paidBy).reduce((a, b) => a + b, 0))
  const TERMS = ['immediate', 'net7', 'net14', 'net30', 'net60', 'cod', 'prepaid']

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Suppliers 🚚</div>
          <div className="page-subtitle">{suppliers.length} suppliers · WhatsApp PO in one click</div>
        </div>
        <button className="btn-primary" onClick={() => { setEditing(null); setForm(EMPTY_SUPPLIER); setShowModal(true) }}>
          <Plus size={16} /> Add Supplier
        </button>
      </div>

      {ledgerOk && (Math.abs(totalOwed) > 0.005 || Math.abs(unassigned) > 0.005) && (
        <div className="card" style={{ marginBottom: 16, background: '#fffbeb', border: '1px solid #fde68a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontWeight: 700, color: '#92400e' }}>Total owed to suppliers (same as Trade payables in Reports)</span>
            <span style={{ fontFamily: 'Playfair Display,serif', fontSize: 22, fontWeight: 700, color: '#d97706' }}>{fmtKES(totalOwed)}</span>
          </div>
          {Math.abs(unassigned) > 0.005 && <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>Of this, {fmtKES(unassigned)} has no supplier name, or no supplier card with the same name. Add a card with the exact name used in Inventory to manage it here.</div>}
        </div>
      )}

      {suppliers.length === 0 && !loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚚</div>
          <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', marginBottom: 8 }}>No suppliers yet</div>
          <div style={{ color: '#9b6070', fontSize: 14, marginBottom: 20 }}>Add your product suppliers to send WhatsApp purchase orders in one click</div>
          <button className="btn-primary" onClick={() => { setEditing(null); setForm(EMPTY_SUPPLIER); setShowModal(true) }}><Plus size={16} /> Add First Supplier</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {suppliers.map(s => {
            const terms = s.notes?.match(/Terms: ([^|]+)/)?.[1]?.trim() || '—'
            const limit = s.notes?.match(/Limit: ([^|]+)/)?.[1]?.trim() || '—'
            return (
              <div key={s.id} className="card" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#c8456a,#6b1e38)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18 }}>
                      {s.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1f' }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: '#9b6070' }}>{s.phone || 'No phone'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-ghost" style={{ padding: '5px 8px' }} onClick={() => openEdit(s)}><Edit2 size={13} /></button>
                    <button className="btn-ghost" style={{ padding: '5px 8px', color: '#dc2626' }} onClick={() => handleDelete(s.id)}><Trash2 size={13} /></button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <span style={{ background: '#fce8ed', color: '#8b2550', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                    📋 {terms}
                  </span>
                  {limit && limit !== '—' && (
                    <span style={{ background: '#f0f9ff', color: '#0369a1', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                      💳 Limit: {fmtKES(Number(limit))}
                    </span>
                  )}
                </div>

                {s.email && <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 8 }}>📧 {s.email}</div>}

                {ledgerOk && (() => {
                  const k = norm(s.name)
                  const o = r2(owedBy[k] || 0), pd = r2(paidBy[k] || 0), bal = r2(o - pd), lim = Number(limit) || 0, over = lim > 0 && bal > lim
                  return (
                    <div style={{ background: '#fdf5f7', borderRadius: 10, padding: '10px 12px', marginBottom: 8, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Owed (incl. transport)</span><strong>{fmtKES(o)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Paid</span><strong>{fmtKES(pd)}</strong></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f0e4e8', marginTop: 4, paddingTop: 4 }}><span>Balance</span><strong style={{ color: bal > 0 ? '#dc2626' : '#059669' }}>{fmtKES(bal)}</strong></div>
                      {over && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4, fontWeight: 700 }}>Over the credit limit of {fmtKES(lim)} by {fmtKES(r2(bal - lim))}</div>}
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        {canPay && <button type="button" className="btn-primary" style={{ flex: 1, fontSize: 12, padding: '6px 10px' }} disabled={bal <= 0.005} onClick={() => openPay(s.name, bal)}>Record payment</button>}
                        {pd > 0 && <button type="button" className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setHistFor(s.name)}>History</button>}
                      </div>
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f5edf0' }}>
                  <button
                    onClick={() => sendPOWhatsApp(s)}
                    style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#25d366,#128c7e)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'Nunito,sans-serif' }}>
                    <MessageCircle size={14} /> WhatsApp PO
                  </button>
                  {s.phone && (
                    <a href={`tel:${s.phone}`} style={{ flex: 1, padding: '8px', borderRadius: 10, border: '1px solid #f0e4e8', background: '#fff', color: '#6b1e38', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', fontFamily: 'Nunito,sans-serif' }}>
                      <Phone size={14} /> Call
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {payFor !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setPayFor(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <span className="modal-title">Record payment</span>
              <button onClick={() => setPayFor(null)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={savePayment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#fce8ed', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}><strong>{payFor}</strong> - balance owed <strong>{fmtKES(payBal)}</strong></div>
                <div><label className="label">Amount paid (KES) *</label><input className="input" type="number" min={0.01} step="0.01" inputMode="decimal" required value={payAmt} onChange={e => setPayAmt(e.target.value)} /></div>
                <div><label className="label">Paid by *</label>
                  <select className="input" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="bank">Bank transfer</option>
                  </select>
                </div>
                <div><label className="label">Payment date *</label><input className="input" type="date" required value={payDate} onChange={e => setPayDate(e.target.value)} /></div>
                <div><label className="label">Reference</label><input className="input" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="e.g. M-Pesa code or invoice number" /></div>
                <div style={{ fontSize: 11, color: '#9b6070' }}>This lowers what you owe and your cash by the same amount. A saved payment cannot be edited here.</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setPayFor(null)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={paySaving}>{paySaving ? 'Saving...' : 'Save payment'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {histFor !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setHistFor(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <span className="modal-title">Payments to {histFor}</span>
              <button onClick={() => setHistFor(null)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {pays.filter(p => norm(p.supplier_name) === norm(histFor)).map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5edf0', fontSize: 13 }}>
                  <span>{String(p.paid_on || '').slice(0, 10)} - {p.method}{p.reference ? ' - ' + p.reference : ''}</span>
                  <strong>{fmtKES(p.amount_kes)}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Supplier' : 'New Supplier'}</span>
              <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label className="label">Company Name *</label><input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Nairobi General Distributors" /></div>
                <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div><label className="label">Phone (WhatsApp) *</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+254712345678" /></div>
                  <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><label className="label">Payment Terms</label>
                    <select className="input" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}>
                      {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Credit Limit (KES)</label><input className="input" type="number" min={0} value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} /></div>
                </div>
                <div><label className="label">Address</label><input className="input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
                <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} /></div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : '✅ Add Supplier'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}