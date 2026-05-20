import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import toast from 'react-hot-toast'
import { Save, Store, ShieldCheck, Users, Plus, Trash2, X } from 'lucide-react'

const TABS = ['Shop Settings', 'eTIMS / KRA', 'Staff & Access']

export default function SettingsPage() {
  const { shop, switchShop } = useAuth()
  const [tab, setTab] = useState(0)
  const [shopForm, setShopForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [staff, setStaff] = useState([])
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [newStaff, setNewStaff] = useState({ name: '', email: '', password: '', role: 'cashier', phone: '' })
  const [addingStaff, setAddingStaff] = useState(false)

  useEffect(() => {
    if (shop) {
      setShopForm({ name: shop.name || '', phone: shop.phone || '', address: shop.address || '', email: shop.email || '', currency: shop.currency || 'KES', tax_rate: shop.tax_rate || 0, etims_pin: shop.etims_pin || '', etims_serial: shop.etims_serial || '' })
      loadStaff()
    }
  }, [shop])

  const loadStaff = async () => {
    try {
      const res = await pb.collection(C.SHOP_ADMINS).getFullList({ filter: `shop_id="${shop.id}"`, expand: 'admin_id' })
      setStaff(res)
    } catch {}
  }

  const saveShop = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const updated = await pb.collection(C.SHOPS).update(shop.id, shopForm)
      switchShop(updated)
      toast.success('Settings saved!')
    } catch (err) { toast.error(err?.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleAddStaff = async (e) => {
    e.preventDefault()
    setAddingStaff(true)
    try {
      // Create account in bs_admins — fully independent
      const admin = await pb.collection(C.ADMINS).create({
        name: newStaff.name,
        email: newStaff.email,
        password: newStaff.password,
        passwordConfirm: newStaff.password,
        phone: newStaff.phone,
        role: newStaff.role,
        is_active: true,
      })
      // Link to this shop
      await pb.collection(C.SHOP_ADMINS).create({
        shop_id: shop.id,
        admin_id: admin.id,
        role: newStaff.role
      })
      toast.success('Staff member added!')
      setShowAddStaff(false)
      setNewStaff({ name: '', email: '', password: '', role: 'cashier', phone: '' })
      loadStaff()
    } catch (err) { toast.error(err?.data?.message || err?.message || 'Failed') }
    finally { setAddingStaff(false) }
  }

  const removeStaff = async (id) => {
    if (!confirm('Remove this staff member from the shop?')) return
    try { await pb.collection(C.SHOP_ADMINS).delete(id); toast.success('Removed'); loadStaff() }
    catch { toast.error('Failed') }
  }

  const ROLES = ['owner', 'manager', 'cashier', 'viewer']
  const ROLE_DESC = { owner: 'Full access', manager: 'All except settings', cashier: 'POS + sales only', viewer: 'Read-only reports' }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Settings ⚙️</div>
        <div className="page-subtitle">Configure your {shop?.name} shop</div>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fce8ed', borderRadius: 12, padding: 4, width: 'fit-content' }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: tab === i ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent', color: tab === i ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
            {[<Store size={14}/>, <ShieldCheck size={14}/>, <Users size={14}/>][i]} {t}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', margin: '0 0 24px' }}>Shop Information</h2>
          <form onSubmit={saveShop} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="label">Shop Name *</label>
                <input className="input" required value={shopForm.name || ''} onChange={e => setShopForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={shopForm.phone || ''} onChange={e => setShopForm(f => ({ ...f, phone: e.target.value }))} placeholder="+254 7xx xxx xxx" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={shopForm.email || ''} onChange={e => setShopForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label className="label">Address</label>
                <textarea className="input" rows={2} value={shopForm.address || ''} onChange={e => setShopForm(f => ({ ...f, address: e.target.value }))} style={{ resize: 'vertical' }} placeholder="Physical address for receipts" />
              </div>
              <div>
                <label className="label">Currency</label>
                <select className="input" value={shopForm.currency || 'KES'} onChange={e => setShopForm(f => ({ ...f, currency: e.target.value }))}>
                  <option value="KES">KES — Kenyan Shilling</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="GBP">GBP — British Pound</option>
                </select>
              </div>
              <div>
                <label className="label">VAT Rate (%)</label>
                <input className="input" type="number" min={0} max={100} step={0.5} value={shopForm.tax_rate || 0} onChange={e => setShopForm(f => ({ ...f, tax_rate: e.target.value }))} placeholder="16 for standard VAT" />
              </div>
            </div>
            <div style={{ paddingTop: 8, borderTop: '1px solid #f5edf0' }}>
              <button type="submit" className="btn-primary" disabled={saving}><Save size={16} />{saving ? 'Saving…' : 'Save Shop Settings'}</button>
            </div>
          </form>
        </div>
      )}

      {tab === 1 && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', margin: '0 0 8px' }}>eTIMS / KRA Integration</h2>
          <p style={{ fontSize: 14, color: '#9b6070', marginBottom: 24 }}>Kenya Revenue Authority Electronic Tax Invoice Management System. All sales are automatically submitted to KRA when configured.</p>

          <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13 }}>⚠️ eTIMS Integration Status</div>
            <div style={{ fontSize: 13, color: '#78350f', marginTop: 4 }}>
              {shopForm.etims_pin ? '✅ PIN configured. Complete serial setup to go live.' : 'Not yet configured. Enter your KRA PIN and eTIMS device serial to activate.'}
            </div>
          </div>

          <form onSubmit={saveShop} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">KRA PIN</label>
              <input className="input" value={shopForm.etims_pin || ''} onChange={e => setShopForm(f => ({ ...f, etims_pin: e.target.value }))} placeholder="e.g. P000000000A" maxLength={11} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
            </div>
            <div>
              <label className="label">eTIMS Device Serial</label>
              <input className="input" value={shopForm.etims_serial || ''} onChange={e => setShopForm(f => ({ ...f, etims_serial: e.target.value }))} placeholder="Device serial from KRA portal" style={{ fontFamily: 'monospace' }} />
            </div>

            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#0369a1' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>eTIMS API Endpoint</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>Production: https://etims.kra.go.ke/etims-api/</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>Sandbox: https://etims-sbx.kra.go.ke/etims-api/</div>
              <div style={{ marginTop: 8, fontSize: 12 }}>Replace the <code>submitEtims()</code> stub in <code>POSPage.jsx</code> with actual API calls once you have your credentials.</div>
            </div>

            <div>
              <button type="submit" className="btn-primary" disabled={saving}><Save size={16} />{saving ? 'Saving…' : 'Save eTIMS Settings'}</button>
            </div>
          </form>
        </div>
      )}

      {tab === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', margin: 0 }}>Staff & Access Control</h2>
            <button className="btn-primary" onClick={() => setShowAddStaff(true)}><Plus size={16} /> Add Staff Member</button>
          </div>

          {/* Role legend */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {ROLES.map(role => (
              <div key={role} style={{ background: '#fff', border: '1.5px solid #f0e4e8', borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ fontWeight: 700, textTransform: 'capitalize', color: '#3d1020', marginBottom: 4 }}>{role}</div>
                <div style={{ fontSize: 12, color: '#9b6070' }}>{ROLE_DESC[role]}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#c8456a,#6b1e38)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}>
                            {s.expand?.admin_id?.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div style={{ fontWeight: 600 }}>{s.expand?.admin_id?.name || 'Unknown'}</div>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: '#9b6070' }}>{s.expand?.admin_id?.email}</td>
                      <td>
                        <span style={{ background: '#fce8ed', color: '#8b2550', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{s.role}</span>
                      </td>
                      <td><span style={{ background: '#f0fdf4', color: '#059669', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Active</span></td>
                      <td>
                        <button className="btn-ghost" style={{ padding: '5px 10px', color: '#dc2626' }} onClick={() => removeStaff(s.id)}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  {staff.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: '#9b6070' }}>No staff assigned</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Staff Modal */}
          {showAddStaff && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddStaff(false)}>
              <div className="modal" style={{ maxWidth: 460 }}>
                <div className="modal-header">
                  <span className="modal-title">Add Staff Member</span>
                  <button onClick={() => setShowAddStaff(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
                </div>
                <div className="modal-body">
                  <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div><label className="label">Full Name *</label><input className="input" required value={newStaff.name} onChange={e => setNewStaff(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><label className="label">Email *</label><input className="input" type="email" required value={newStaff.email} onChange={e => setNewStaff(f => ({ ...f, email: e.target.value }))} /></div>
                    <div><label className="label">Phone</label><input className="input" value={newStaff.phone} onChange={e => setNewStaff(f => ({ ...f, phone: e.target.value }))} /></div>
                    <div><label className="label">Password *</label><input className="input" type="password" required minLength={8} value={newStaff.password} onChange={e => setNewStaff(f => ({ ...f, password: e.target.value }))} /></div>
                    <div>
                      <label className="label">Role</label>
                      <select className="input" value={newStaff.role} onChange={e => setNewStaff(f => ({ ...f, role: e.target.value }))}>
                        {ROLES.map(r => <option key={r} value={r}>{r} — {ROLE_DESC[r]}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-secondary" onClick={() => setShowAddStaff(false)}>Cancel</button>
                      <button type="submit" className="btn-primary" disabled={addingStaff}>{addingStaff ? 'Creating…' : '✅ Add Staff'}</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
