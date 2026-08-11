import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import toast from 'react-hot-toast'
import { Save, Store, ShieldCheck, Users, Plus, Trash2, X, Tag, Palette, Upload, Edit2, Check, Link, ExternalLink } from 'lucide-react'

const TABS = [
  { label: 'Business',    icon: Store },
  { label: 'Branding',    icon: Palette },
  { label: 'Booking',     icon: Link },
  { label: 'Marketing',   icon: ExternalLink },
  { label: 'Categories',  icon: Tag },
  { label: 'eTIMS / KRA', icon: ShieldCheck },
  { label: 'Staff',       icon: Users },
]

const BRAND_COLORS = [
  '#c8456a','#2563eb','#059669','#7c3aed',
  '#ea580c','#d97706','#0891b2','#dc2626','#475569',
]

const ROLES    = ['owner','manager','cashier','viewer']
const ROLE_DESC = { owner:'Full access', manager:'All except settings', cashier:'POS + sales only', viewer:'Read-only reports' }

const CAT_EMOJI = { hair: '💇', nails: '💅', skin: '✨', body: '💆', lashes: '👁️', makeup: '💄', other: '🌸' }

export default function SettingsPage() {
  const { shop, switchShop, isLocked } = useAuth()
  const logoRef   = useRef(null)
  const coverRef  = useRef(null)
  const [coverFile,    setCoverFile]    = useState(null)
  const [coverPreview, setCoverPreview] = useState(null)
  const [coverDragOver,setCoverDragOver]= useState(false)

  const [tab,       setTab]       = useState(0)
  const [shopForm,  setShopForm]  = useState({})
  const [saving,    setSaving]    = useState(false)
  const [staff,     setStaff]     = useState([])
  const [categories, setCategories] = useState([])
  const [services,  setServices]  = useState([])

  const [showAddStaff, setShowAddStaff] = useState(false)
  const [showAddCat,   setShowAddCat]   = useState(false)
  const [newCatName,   setNewCatName]   = useState('')
  const [editCatId,    setEditCatId]    = useState(null)
  const [editCatName,  setEditCatName]  = useState('')
  const [newStaff,     setNewStaff]     = useState({ name:'', email:'', password:'', role:'cashier', phone:'' })
  const [addingStaff,  setAddingStaff]  = useState(false)
  const [logoFile,     setLogoFile]     = useState(null)
  const [logoPreview,  setLogoPreview]  = useState(null)
  const [dragOver,     setDragOver]     = useState(false)
  const [customColor,  setCustomColor]  = useState('#c8456a')

  // GOLDMINE — copy state for booking links
  const [copiedKey, setCopiedKey] = useState(null)

  const PB_URL = import.meta.env.VITE_PB_URL || 'https://fieldtrack-kenya.fly.dev'
  const logoUrl = shop?.logo
    ? `${PB_URL}/api/files/${C.SHOPS}/${shop.id}/${shop.logo}?thumb=200x200`
    : null

  useEffect(() => {
    if (shop) {
      const DEFAULT_HOURS = { Mon:{open:'08:00',close:'18:00',closed:false}, Tue:{open:'08:00',close:'18:00',closed:false}, Wed:{open:'08:00',close:'18:00',closed:false}, Thu:{open:'08:00',close:'18:00',closed:false}, Fri:{open:'08:00',close:'18:00',closed:false}, Sat:{open:'09:00',close:'17:00',closed:false}, Sun:{open:'09:00',close:'14:00',closed:true} }
      setShopForm({
        name:                shop.name                || '',
        phone:               shop.phone               || '',
        address:             shop.address             || '',
        email:               shop.email               || '',
        website:             shop.website             || '',
        instagram:           shop.instagram           || '',
        currency:            shop.currency            || 'KES',
        tax_rate:            shop.tax_rate            || 0,
        business_type:       shop.business_type       || '',
        etims_pin:           shop.etims_pin           || '',
        etims_serial:        shop.etims_serial        || '',
        brand_color:         shop.brand_color         || '#c8456a',
        receipt_footer:      shop.receipt_footer      || '',
        receipt_header:      shop.receipt_header      || '',
        receipt_show_logo:   shop.receipt_show_logo   ?? true,
        receipt_show_tax:    shop.receipt_show_tax    ?? true,
        whatsapp_welcome_msg: shop.whatsapp_welcome_msg || '',
        opening_capital_kes: shop.opening_capital_kes  || 0,
        tagline:             shop.tagline             || '',
        about_text:          shop.about_text          || '',
        founded_year:        shop.founded_year        || '',
        business_hours:      (shop.business_hours && Object.keys(shop.business_hours).length > 0) ? shop.business_hours : DEFAULT_HOURS,
      })
      setCustomColor(shop.brand_color || '#c8456a')
      loadStaff()
      loadCategories()
      loadServices()
    }
  }, [shop])

  const loadStaff = async () => {
    try {
      const res = await pb.collection(C.SHOP_ADMINS).getFullList({ filter: `shop_id="${shop.id}"`, expand: 'admin_id' })
      setStaff(res)
    } catch {}
  }

  const loadCategories = async () => {
    try {
      const res = await pb.collection(C.CATEGORIES).getFullList({ filter: `shop_id="${shop.id}"`, sort: 'sort_order,name' })
      setCategories(res)
    } catch {}
  }

  const loadServices = async () => {
    try {
      const res = await pb.collection(C.SERVICES).getList(1, 100, {
        filter: `shop_id="${shop.id}" && is_active=true`, sort: 'name',
        '$cancelKey': 'settings-svcs',
      })
      setServices(res.items)
    } catch {}
  }

  const handleLogoFile = (file) => {
    if (!file) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { toast.error('JPG, PNG or WebP only'); return }
    if (file.size > 5*1024*1024) { toast.error('Max 5MB'); return }
    setLogoFile(file)
    const r = new FileReader()
    r.onload = e => setLogoPreview(e.target.result)
    r.readAsDataURL(file)
  }

  const handleCoverFile = (file) => {
    if (!file) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { toast.error('JPG, PNG or WebP only'); return }
    if (file.size > 5*1024*1024) { toast.error('Max 5MB'); return }
    setCoverFile(file)
    const r = new FileReader()
    r.onload = e => setCoverPreview(e.target.result)
    r.readAsDataURL(file)
  }

  const saveShop = async (e) => {
    e?.preventDefault()
    setSaving(true)
    try {
      const fd = new FormData()
      Object.entries(shopForm).forEach(([k,v]) => {
        if (k === 'business_hours') fd.append(k, JSON.stringify(v))
        else fd.append(k, String(v ?? ''))
      })
      if (logoFile)  fd.append('logo', logoFile)
      if (coverFile) fd.append('cover_image', coverFile)
      const updated = await pb.collection(C.SHOPS).update(shop.id, fd)
      switchShop(updated)
      setLogoFile(null)
      setLogoPreview(null)
      setCoverFile(null)
      setCoverPreview(null)
      toast.success('Settings saved! ✅')
    } catch (err) { toast.error(err?.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const addCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    try {
      await pb.collection(C.CATEGORIES).create({ shop_id: shop.id, name, sort_order: categories.length })
      toast.success('Category added!')
      setNewCatName('')
      setShowAddCat(false)
      loadCategories()
    } catch { toast.error('Failed to add category') }
  }

  const updateCategory = async (id) => {
    const name = editCatName.trim()
    if (!name) return
    try {
      await pb.collection(C.CATEGORIES).update(id, { name })
      toast.success('Updated!')
      setEditCatId(null)
      loadCategories()
    } catch { toast.error('Failed') }
  }

  const deleteCategory = async (id) => {
    if (!confirm('Delete this category? Products in it will become uncategorised.')) return
    try { await pb.collection(C.CATEGORIES).delete(id); toast.success('Deleted'); loadCategories() }
    catch { toast.error('Failed') }
  }

  const handleAddStaff = async (e) => {
    e.preventDefault()
    setAddingStaff(true)
    try {
      const admin = await pb.collection(C.ADMINS).create({
        name: newStaff.name, email: newStaff.email,
        password: newStaff.password, passwordConfirm: newStaff.password,
        phone: newStaff.phone, role: newStaff.role, is_active: true,
      })
      await pb.collection(C.SHOP_ADMINS).create({ shop_id: shop.id, admin_id: admin.id, role: newStaff.role })
      toast.success('Staff member added!')
      setShowAddStaff(false)
      setNewStaff({ name:'', email:'', password:'', role:'cashier', phone:'' })
      loadStaff()
    } catch (err) { toast.error(err?.data?.message || err?.message || 'Failed') }
    finally { setAddingStaff(false) }
  }

  const removeStaff = async (id) => {
    if (!confirm('Remove this staff member?')) return
    try { await pb.collection(C.SHOP_ADMINS).delete(id); toast.success('Removed'); loadStaff() }
    catch { toast.error('Failed') }
  }

  const changeStaffRole = async (shopAdminId, adminId, newRole) => {
    try {
      await pb.collection(C.SHOP_ADMINS).update(shopAdminId, { role: newRole })
      if (adminId) await pb.collection(C.ADMINS).update(adminId, { role: newRole })
      toast.success(`Role updated to ${newRole}`)
      loadStaff()
    } catch (err) {
      toast.error(err?.message || 'Failed to update role')
    }
  }

  // GOLDMINE — copy link helper
  const copyLink = (key, url) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedKey(key)
      toast.success('Link copied!')
      setTimeout(() => setCopiedKey(null), 2000)
    }).catch(() => toast.error('Could not copy'))
  }

  const brandColor    = shopForm.brand_color || '#c8456a'
  const bookingUrl    = shop?.slug ? `${window.location.origin}/book/${shop.slug}` : ''
  const shopPageUrl   = shop?.slug ? `${window.location.origin}/shop/${shop.slug}` : ''
  const qrUrl         = (url) => `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(url)}&size=400x400&margin=12`

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Settings ⚙️</div>
        <div className="page-subtitle">Manage every detail of {shop?.name}</div>
      </div>

      {/* Tab nav */}
      <div className="tab-nav" style={{ display:'flex', gap:3, marginBottom:24, background:'#fce8ed', borderRadius:12, padding:4, width:'fit-content', flexWrap:'wrap' }}>
        {TABS.map((t, i) => (
          <button key={i} onClick={() => setTab(i)}
            style={{ padding:'8px 18px', borderRadius:8, border:'none', background: tab===i ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent', color: tab===i ? '#fff' : '#8b2550', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'Nunito,sans-serif', display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
            <t.icon size={13}/> {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB 0: BUSINESS INFO ── */}
      {tab === 0 && (
        <div className="card" style={{ maxWidth:680 }}>
          <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:20, color:'#3d1020', margin:'0 0 24px' }}>Business Information</h2>
          <form onSubmit={saveShop} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="label">Business Name *</label>
                <input className="input" required value={shopForm.name||''} onChange={e=>setShopForm(f=>({...f,name:e.target.value}))} />
              </div>
              <div>
                <label className="label">Business Type</label>
                <input className="input" value={shopForm.business_type||''} onChange={e=>setShopForm(f=>({...f,business_type:e.target.value}))} placeholder="e.g. Salon & Spa" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={shopForm.phone||''} onChange={e=>setShopForm(f=>({...f,phone:e.target.value}))} placeholder="+254 7xx xxx xxx" />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" value={shopForm.email||''} onChange={e=>setShopForm(f=>({...f,email:e.target.value}))} />
              </div>
              <div>
                <label className="label">Website</label>
                <input className="input" value={shopForm.website||''} onChange={e=>setShopForm(f=>({...f,website:e.target.value}))} placeholder="https://yourbusiness.com" />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="label">Physical Address</label>
                <textarea className="input" rows={2} value={shopForm.address||''} onChange={e=>setShopForm(f=>({...f,address:e.target.value}))} style={{ resize:'vertical' }} placeholder="Address for receipts" />
              </div>
              <div>
                <label className="label">Instagram Handle</label>
                <input className="input" value={shopForm.instagram||''} onChange={e=>setShopForm(f=>({...f,instagram:e.target.value}))} placeholder="@yourbusiness" />
              </div>
              <div>
                <label className="label">Currency</label>
                <select className="input" value={shopForm.currency||'KES'} onChange={e=>setShopForm(f=>({...f,currency:e.target.value}))}>
                  <option value="KES">KES — Kenyan Shilling</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="UGX">UGX — Ugandan Shilling</option>
                  <option value="TZS">TZS — Tanzanian Shilling</option>
                  <option value="RWF">RWF — Rwandan Franc</option>
                </select>
              </div>
              <div>
                <label className="label">VAT Rate (%)</label>
                <input className="input" type="number" min={0} max={100} step={0.5} value={shopForm.tax_rate||0} onChange={e=>setShopForm(f=>({...f,tax_rate:e.target.value}))} placeholder="16 for standard VAT" />
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label className="label">Opening Capital (KES)</label>
                <input className="input" type="number" min={0} step={1} value={shopForm.opening_capital_kes||0} onChange={e=>setShopForm(f=>({...f,opening_capital_kes:e.target.value}))} placeholder="e.g. 150000" />
                <div style={{ fontSize:11, color:'#9b6070', marginTop:4 }}>The amount you invested to start this business — cash + value of starting stock/equipment. Set once. Used to calculate your Balance Sheet equity in Reports.</div>
              </div>
            </div>
            <div style={{ paddingTop:8, borderTop:'1px solid #f5edf0' }}>
              <button type="submit" className="btn-primary" disabled={saving}><Save size={15}/>{saving?'Saving…':'Save Business Settings'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── TAB 1: BRANDING ── */}
      {tab === 1 && (
        <div style={{ maxWidth:780 }}>
        <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
          {/* Logo */}
          <div className="card">
            <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:17, color:'#3d1020', margin:'0 0 16px' }}>Business Logo</h3>
            <p style={{ fontSize:13, color:'#9b6070', marginBottom:16 }}>Appears on all receipts, invoices, reports and the sidebar. Keep it square for best results.</p>
            {(logoPreview || logoUrl) && (
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, padding:'12px', background:'#fdf5f7', borderRadius:12, border:'1px solid #f0e4e8' }}>
                <img src={logoPreview || logoUrl} alt="logo" style={{ width:60, height:60, objectFit:'contain', borderRadius:8, background:'#fff', padding:4, border:'1px solid #f0e4e8' }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#3d1020' }}>{shop?.name}</div>
                  <div style={{ fontSize:11, color:'#9b6070' }}>{logoFile ? 'New logo ready to save' : 'Current logo'}</div>
                </div>
                {logoPreview && (
                  <button onClick={()=>{setLogoFile(null);setLogoPreview(null)}} style={{ marginLeft:'auto', background:'none', border:'none', color:'#dc2626', cursor:'pointer' }}><X size={16}/></button>
                )}
              </div>
            )}
            <div
              onDragOver={e=>{e.preventDefault();setDragOver(true)}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);handleLogoFile(e.dataTransfer.files[0])}}
              onClick={()=>logoRef.current?.click()}
              style={{ border:`2px dashed ${dragOver?'#c8456a':'#f0e4e8'}`, borderRadius:12, padding:'20px', textAlign:'center', cursor:'pointer', background: dragOver?'#fce8ed':'#fdf5f7', transition:'all 0.2s' }}
            >
              <Upload size={28} color={dragOver?'#c8456a':'#d4a0b0'} style={{ margin:'0 auto 8px' }} />
              <div style={{ fontSize:13, color:'#9b6070', fontWeight:600 }}>Drop logo or click to upload</div>
              <div style={{ fontSize:11, color:'#c8b0b8', marginTop:3 }}>JPG · PNG · WebP · Max 5MB</div>
            </div>
            <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={e=>handleLogoFile(e.target.files[0])} />
            {logoFile && (
              <button onClick={saveShop} disabled={saving} className="btn-primary" style={{ marginTop:12, width:'100%' }}>
                <Save size={14}/>{saving?'Saving…':'Save Logo'}
              </button>
            )}
          </div>

          {/* Brand color & receipt */}
          <div className="card">
            <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:17, color:'#3d1020', margin:'0 0 16px' }}>Brand & Receipt</h3>
            <form onSubmit={saveShop} style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="label">Brand Color</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                  {BRAND_COLORS.map(c => (
                    <button key={c} type="button" onClick={()=>setShopForm(f=>({...f,brand_color:c}))}
                      style={{ width:30, height:30, borderRadius:'50%', border:'3px solid', borderColor: brandColor===c?'#3d1020':'transparent', background:c, cursor:'pointer', boxShadow: brandColor===c?'0 0 0 2px rgba(61,16,32,0.3)':'none', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {brandColor===c && <Check size={12} color="#fff"/>}
                    </button>
                  ))}
                  <input type="color" value={customColor} onChange={e=>{setCustomColor(e.target.value);setShopForm(f=>({...f,brand_color:e.target.value}))}}
                    style={{ width:30, height:30, borderRadius:'50%', border:'2px solid #f0e4e8', cursor:'pointer', padding:1 }} title="Custom color" />
                </div>
                <div style={{ background:brandColor, borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  {(logoPreview||logoUrl)
                    ? <img src={logoPreview||logoUrl} alt="logo" style={{ width:28, height:28, objectFit:'contain', borderRadius:5, background:'rgba(255,255,255,0.9)', padding:2 }} />
                    : <div style={{ width:28, height:28, borderRadius:5, background:'rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12 }}>🏪</div>
                  }
                  <div>
                    <div style={{ color:'#fff', fontWeight:700, fontSize:13 }}>{shop?.name}</div>
                    <div style={{ color:'rgba(255,255,255,0.65)', fontSize:10 }}>Receipt header preview</div>
                  </div>
                </div>
              </div>
              <div>
                <label className="label">Receipt Header Tagline</label>
                <input className="input" value={shopForm.receipt_header||''} onChange={e=>setShopForm(f=>({...f,receipt_header:e.target.value}))} placeholder="e.g. Your beauty, our passion ✨" />
              </div>
              <div>
                <label className="label">Receipt Footer Message</label>
                <input className="input" value={shopForm.receipt_footer||''} onChange={e=>setShopForm(f=>({...f,receipt_footer:e.target.value}))} placeholder={`Thank you for visiting ${shop?.name}! 🙏`} />
              </div>
              <div>
                <label className="label">WhatsApp Welcome Message</label>
                <textarea className="input" rows={2} style={{ resize:'vertical' }} value={shopForm.whatsapp_welcome_msg||''} onChange={e=>setShopForm(f=>({...f,whatsapp_welcome_msg:e.target.value}))} placeholder="Hi {name}! Welcome to our shop 🎉" />
                <div style={{ fontSize:11, color:'#9b6070', marginTop:3 }}>Use {'{name}'} to insert customer name</div>
              </div>
              <div style={{ display:'flex', gap:16 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#6b4050' }}>
                  <input type="checkbox" checked={shopForm.receipt_show_logo??true} onChange={e=>setShopForm(f=>({...f,receipt_show_logo:e.target.checked}))} />
                  Show logo on receipts
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'#6b4050' }}>
                  <input type="checkbox" checked={shopForm.receipt_show_tax??true} onChange={e=>setShopForm(f=>({...f,receipt_show_tax:e.target.checked}))} />
                  Show tax breakdown
                </label>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}><Save size={14}/>{saving?'Saving…':'Save Branding'}</button>
            </form>
          </div>
        </div>

        {/* ── Cover Image ── */}
        <div className="card" style={{ marginBottom:16 }}>
          <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:17, color:'#3d1020', margin:'0 0 6px' }}>🖼️ Cover Photo</h3>
          <p style={{ fontSize:13, color:'#9b6070', margin:'0 0 14px' }}>A wide banner photo shown at the top of your public shop page. Ideal size: 1200 × 400px. Shows your shopfront, workspace, or a hero product shot.</p>
          {(coverPreview || shop?.cover_image) && (
            <div style={{ position:'relative', marginBottom:14, borderRadius:12, overflow:'hidden', border:'1.5px solid #f0e4e8' }}>
              <img
                src={coverPreview || `${PB_URL}/api/files/${C.SHOPS}/${shop.id}/${shop.cover_image}?thumb=1200x400`}
                alt="cover"
                style={{ width:'100%', height:160, objectFit:'cover', display:'block' }}
              />
              {coverPreview && (
                <button onClick={()=>{setCoverFile(null);setCoverPreview(null)}}
                  style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.55)', border:'none', borderRadius:'50%', width:28, height:28, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>✕</button>
              )}
              <div style={{ position:'absolute', bottom:8, left:10, fontSize:11, color:'rgba(255,255,255,.85)', fontWeight:700, background:'rgba(0,0,0,.38)', padding:'2px 8px', borderRadius:6 }}>
                {coverPreview ? 'New cover — save to publish' : 'Current cover photo'}
              </div>
            </div>
          )}
          <div
            onDragOver={e=>{e.preventDefault();setCoverDragOver(true)}}
            onDragLeave={()=>setCoverDragOver(false)}
            onDrop={e=>{e.preventDefault();setCoverDragOver(false);handleCoverFile(e.dataTransfer.files[0])}}
            onClick={()=>coverRef.current?.click()}
            style={{ border:`2px dashed ${coverDragOver?'#c8456a':'#f0e4e8'}`, borderRadius:12, padding:'18px', textAlign:'center', cursor:'pointer', background:coverDragOver?'#fce8ed':'#fdf5f7', transition:'all 0.2s' }}
          >
            <Upload size={26} color={coverDragOver?'#c8456a':'#d4a0b0'} style={{ margin:'0 auto 6px' }} />
            <div style={{ fontSize:13, color:'#9b6070', fontWeight:600 }}>Drop cover photo or click to upload</div>
            <div style={{ fontSize:11, color:'#c8b0b8', marginTop:2 }}>JPG · PNG · WebP · Max 5MB · Recommended 1200×400px</div>
          </div>
          <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={e=>handleCoverFile(e.target.files[0])} />
          {coverFile && (
            <button onClick={saveShop} disabled={saving} className="btn-primary" style={{ marginTop:12, width:'100%' }}>
              <Save size={14}/>{saving?'Saving…':'Save Cover Photo'}
            </button>
          )}
        </div>

        {/* ── Shop Profile ── */}
        <div className="card" style={{ marginBottom:16 }}>
          <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:17, color:'#3d1020', margin:'0 0 6px' }}>🏪 Shop Profile</h3>
          <p style={{ fontSize:13, color:'#9b6070', margin:'0 0 16px' }}>Shown on your public shop page under your name. Helps new customers decide to visit.</p>
          <form onSubmit={saveShop} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label className="label">Tagline / Slogan</label>
              <input className="input" value={shopForm.tagline||''} onChange={e=>setShopForm(f=>({...f,tagline:e.target.value}))} placeholder="e.g. Your beauty, our passion ✨" maxLength={80} />
              <div style={{ fontSize:11, color:'#9b6070', marginTop:3 }}>One short line shown under your shop name on your public page.</div>
            </div>
            <div>
              <label className="label">About / Our Story</label>
              <textarea className="input" rows={4} style={{ resize:'vertical' }} value={shopForm.about_text||''} onChange={e=>setShopForm(f=>({...f,about_text:e.target.value}))} placeholder="Tell customers who you are, what makes you different, and why they should choose you…" maxLength={600} />
              <div style={{ fontSize:11, color:'#9b6070', marginTop:3 }}>{(shopForm.about_text||'').length}/600 characters · Shown in the About tab on your shop page.</div>
            </div>
            <div>
              <label className="label">Year Founded</label>
              <input className="input" type="number" min={1900} max={new Date().getFullYear()} value={shopForm.founded_year||''} onChange={e=>setShopForm(f=>({...f,founded_year:e.target.value}))} placeholder={`e.g. ${new Date().getFullYear() - 3}`} style={{ maxWidth:160 }} />
              <div style={{ fontSize:11, color:'#9b6070', marginTop:3 }}>Shows "Est. {shopForm.founded_year||'YYYY'}" on your shop page as a trust signal.</div>
            </div>
            <div style={{ paddingTop:4, borderTop:'1px solid #f5edf0' }}>
              <button type="submit" className="btn-primary" disabled={saving}><Save size={14}/>{saving?'Saving…':'Save Shop Profile'}</button>
            </div>
          </form>
        </div>

        {/* ── Business Hours ── */}
        <div className="card">
          <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:17, color:'#3d1020', margin:'0 0 6px' }}>🕐 Opening Hours</h3>
          <p style={{ fontSize:13, color:'#9b6070', margin:'0 0 16px' }}>Set your opening hours per day. Customers see a live "Open now" / "Closed" badge on your shop page.</p>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day => {
            const hrs = (shopForm.business_hours || {})[day] || { open:'08:00', close:'18:00', closed:false }
            const updateDay = (patch) => setShopForm(f => ({
              ...f,
              business_hours: { ...(f.business_hours||{}), [day]: { ...hrs, ...patch } }
            }))
            const dayFull = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday', Sun:'Sunday' }[day]
            return (
              <div key={day} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #fdf5f7', flexWrap:'wrap' }}>
                <div style={{ width:80, fontSize:13, fontWeight:700, color: hrs.closed ? '#9b6070' : '#3d1020', flexShrink:0 }}>{dayFull}</div>
                <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:12, color:'#6b4050', flexShrink:0 }}>
                  <input type="checkbox" checked={!hrs.closed} onChange={e=>updateDay({closed:!e.target.checked})} />
                  Open
                </label>
                {!hrs.closed ? (
                  <div style={{ display:'flex', alignItems:'center', gap:6, flex:1, flexWrap:'wrap' }}>
                    <input type="time" value={hrs.open||'08:00'} onChange={e=>updateDay({open:e.target.value})}
                      style={{ padding:'5px 8px', borderRadius:8, border:'1.5px solid #f0e4e8', fontSize:13, fontFamily:'Nunito,sans-serif', background:'#fdf5f7', color:'#3d1020', minWidth:100 }} />
                    <span style={{ fontSize:12, color:'#9b6070' }}>to</span>
                    <input type="time" value={hrs.close||'18:00'} onChange={e=>updateDay({close:e.target.value})}
                      style={{ padding:'5px 8px', borderRadius:8, border:'1.5px solid #f0e4e8', fontSize:13, fontFamily:'Nunito,sans-serif', background:'#fdf5f7', color:'#3d1020', minWidth:100 }} />
                  </div>
                ) : (
                  <span style={{ fontSize:12, color:'#9b6070', fontStyle:'italic', flex:1 }}>Closed all day</span>
                )}
              </div>
            )
          })}
          <div style={{ paddingTop:14, marginTop:4 }}>
            <button onClick={saveShop} disabled={saving} className="btn-primary" style={{ width:'100%' }}>
              <Save size={14}/>{saving?'Saving…':'Save Opening Hours'}
            </button>
          </div>
        </div>

        </div>
      )}

      {/* ── TAB 2: BOOKING LINKS (GOLDMINE) ── */}
      {tab === 2 && (
        <div style={{ maxWidth: 720 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:20, color:'#3d1020', margin:'0 0 6px' }}>🔗 Your Links & QR Codes</h2>
            <p style={{ fontSize:13, color:'#9b6070', margin:0 }}>Share these links on WhatsApp, Instagram bio, printed flyers, or as QR codes at your counter. No login required for customers.</p>
          </div>

          {/* Public Shop Page — PRIMARY LINK */}
          <div className="card" style={{ marginBottom: 16, border: '2px solid #c8456a' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:10 }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <div style={{ fontFamily:'Playfair Display,serif', fontSize:17, color:'#3d1020', fontWeight:700 }}>🏪 Your Shop Page</div>
                  <span style={{ background:'#fce8ed', color:'#c8456a', fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:20, textTransform:'uppercase', letterSpacing:'0.05em' }}>Recommended</span>
                </div>
                <div style={{ fontSize:12, color:'#9b6070' }}>Your free mini-website — services, products, prices & booking, all in one. Share this everywhere.</div>
              </div>
              <a href={shopPageUrl} target="_blank" rel="noopener noreferrer"
                style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:'#c8456a', fontWeight:700, textDecoration:'none' }}>
                Preview <ExternalLink size={12}/>
              </a>
            </div>

            <div style={{ background:'#fdf5f7', border:'1.5px solid #f0e4e8', borderRadius:10, padding:'11px 14px', fontSize:13, color:'#3d1020', fontWeight:600, wordBreak:'break-all', marginBottom:14 }}>
              {shopPageUrl}
            </div>

            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:20, alignItems:'center' }}>
              <button onClick={() => !isLocked && copyLink('shoppage', shopPageUrl)} disabled={isLocked}
                style={{ padding:'9px 16px', borderRadius:10, border:'none', background: isLocked ? '#e5d5db' : copiedKey==='shoppage'?'#059669':'#c8456a', color:'#fff', fontWeight:700, fontSize:13, cursor: isLocked ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', gap:6, transition:'background 0.2s' }}>
                {isLocked ? '🔒 Locked' : copiedKey==='shoppage' ? <><Check size={14}/> Copied!</> : '📋 Copy Link'}
              </button>
              {!isLocked && (
                <>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Check out ${shop?.name}! 💅\n\nServices, prices & online booking:\n👉 ${shopPageUrl}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ padding:'9px 16px', borderRadius:10, border:'none', background:'#25D366', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>
                    📲 Share on WhatsApp
                  </a>
                  <a href={qrUrl(shopPageUrl)} target="_blank" rel="noopener noreferrer"
                    style={{ padding:'9px 16px', borderRadius:10, border:'1.5px solid #f0e4e8', background:'#fff', color:'#3d1020', fontWeight:700, fontSize:13, cursor:'pointer', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>
                    🖨️ Print QR Code
                  </a>
                </>
              )}
              {isLocked && (
                <span style={{ fontSize:12, color:'#9b6070', fontStyle:'italic' }}>Renew to share or print this link</span>
              )}
            </div>

            {shopPageUrl && !isLocked && (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em', color:'#9b6070', marginBottom:10 }}>QR Code — put this on your counter, business card or receipts</div>
                <div style={{ display:'inline-block', background:'#fff', border:'2px solid #f0e4e8', borderRadius:14, padding:12 }}>
                  <img src={qrUrl(shopPageUrl)} alt="Shop page QR code" style={{ width:160, height:160, display:'block' }} />
                  <div style={{ fontSize:11, color:'#9b6070', marginTop:8, fontWeight:600 }}>{shop?.name}</div>
                </div>
              </div>
            )}
            {shopPageUrl && isLocked && (
              <div style={{ textAlign:'center', padding:'20px', background:'#fdf5f7', borderRadius:14, border:'1.5px dashed #f0e4e8' }}>
                <div style={{ fontSize:24, marginBottom:6 }}>🔒</div>
                <div style={{ fontSize:12, color:'#9b6070' }}>QR code hidden — renew your subscription to print or share</div>
              </div>
            )}
          </div>

          {/* Booking-only page — secondary */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:10 }}>
              <div>
                <div style={{ fontFamily:'Playfair Display,serif', fontSize:17, color:'#3d1020', fontWeight:700, marginBottom:4 }}>📅 Booking-Only Page</div>
                <div style={{ fontSize:12, color:'#9b6070' }}>Skips straight to the booking form — useful if a customer already knows what they want.</div>
              </div>
              <a href={bookingUrl} target="_blank" rel="noopener noreferrer"
                style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:12, color:'#c8456a', fontWeight:700, textDecoration:'none' }}>
                Preview <ExternalLink size={12}/>
              </a>
            </div>

            <div style={{ background:'#fdf5f7', border:'1.5px solid #f0e4e8', borderRadius:10, padding:'11px 14px', fontSize:13, color:'#3d1020', fontWeight:600, wordBreak:'break-all', marginBottom:14 }}>
              {bookingUrl}
            </div>

            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <button onClick={() => !isLocked && copyLink('main', bookingUrl)} disabled={isLocked}
                style={{ padding:'9px 16px', borderRadius:10, border:'none', background: isLocked ? '#e5d5db' : copiedKey==='main'?'#059669':'#c8456a', color:'#fff', fontWeight:700, fontSize:13, cursor: isLocked ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', gap:6, transition:'background 0.2s' }}>
                {isLocked ? '🔒 Locked' : copiedKey==='main' ? <><Check size={14}/> Copied!</> : '📋 Copy Link'}
              </button>
              {!isLocked && (
                <>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Book an appointment at ${shop?.name}! 💅\n\n👉 ${bookingUrl}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ padding:'9px 16px', borderRadius:10, border:'none', background:'#25D366', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>
                    📲 Share on WhatsApp
                  </a>
                  <a href={qrUrl(bookingUrl)} target="_blank" rel="noopener noreferrer"
                    style={{ padding:'9px 16px', borderRadius:10, border:'1.5px solid #f0e4e8', background:'#fff', color:'#3d1020', fontWeight:700, fontSize:13, cursor:'pointer', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>
                    🖨️ Print QR Code
                  </a>
                </>
              )}
              {isLocked && (
                <span style={{ fontSize:12, color:'#9b6070', fontStyle:'italic' }}>Renew to share or print this link</span>
              )}
            </div>
          </div>

          {/* Per-service links */}
          <div className="card">
            <div style={{ fontFamily:'Playfair Display,serif', fontSize:17, color:'#3d1020', fontWeight:700, marginBottom:6 }}>Per-Service Links</div>
            <p style={{ fontSize:12, color:'#9b6070', margin:'0 0 16px' }}>
              Each link opens your booking page with that service already pre-selected. Put a different link in each Instagram story or WhatsApp broadcast for each service you want to promote.
            </p>

            {services.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 20px', color:'#9b6070' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>💅</div>
                <div style={{ fontSize:13 }}>No active services found.</div>
                <div style={{ fontSize:12, marginTop:4 }}>Add services in Staff & Commissions → Services first.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {services.map(svc => {
                  const svcUrl = `${window.location.origin}/book/${shop?.slug}?service=${encodeURIComponent(svc.name)}`
                  const copyKey = `svc-${svc.id}`
                  return (
                    <div key={svc.id} style={{ border:'1.5px solid #f0e4e8', borderRadius:12, padding:'14px 16px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10, flexWrap:'wrap', gap:8 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <span style={{ fontSize:22 }}>{CAT_EMOJI[svc.category] || '💅'}</span>
                          <div>
                            <div style={{ fontSize:14, fontWeight:700, color:'#1a1a1f' }}>{svc.name}</div>
                            <div style={{ fontSize:11, color:'#9b6070' }}>{svc.duration_minutes} min · KES {svc.price_kes?.toLocaleString()}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          {isLocked ? (
                            <span style={{ fontSize:11, color:'#9b6070', fontStyle:'italic', padding:'6px 0' }}>🔒 Renew to share</span>
                          ) : (
                            <>
                              <button onClick={() => copyLink(copyKey, svcUrl)}
                                style={{ padding:'6px 12px', borderRadius:8, border:'none', background: copiedKey===copyKey?'#059669':'#c8456a', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:5, transition:'background 0.2s', minWidth:72 }}>
                                {copiedKey===copyKey ? <><Check size={11}/> Copied!</> : '📋 Copy'}
                              </button>
                              <a href={`https://wa.me/?text=${encodeURIComponent(`Book *${svc.name}* at ${shop?.name}!\n⏱ ${svc.duration_minutes} min · KES ${svc.price_kes?.toLocaleString()}\n\n👉 ${svcUrl}`)}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#25D366', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer', textDecoration:'none', display:'inline-flex', alignItems:'center' }}>
                                📲
                              </a>
                              <a href={qrUrl(svcUrl)} target="_blank" rel="noopener noreferrer"
                                style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid #f0e4e8', background:'#fff', color:'#3d1020', fontWeight:700, fontSize:12, cursor:'pointer', textDecoration:'none', display:'inline-flex', alignItems:'center' }}>
                                🖨️
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ background:'#fdf5f7', borderRadius:8, padding:'8px 10px', fontSize:11, color:'#6b4050', wordBreak:'break-all', fontFamily:'monospace' }}>
                        {svcUrl}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pro tip */}
          <div style={{ background:'linear-gradient(135deg,#fce8ed,#fdf5f7)', border:'1px solid #f0e4e8', borderRadius:12, padding:'14px 18px', marginTop:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#8b2550', marginBottom:6 }}>💡 Pro tip — get 3x more bookings</div>
            <div style={{ fontSize:13, color:'#6b4050', lineHeight:1.6 }}>
              Put your main booking link in your WhatsApp bio and Instagram bio. Then send service-specific links in your WhatsApp broadcasts — "Book your Gel Manicure this weekend 👉 [link]". Customers land straight on that service, skip browsing, and book in under 60 seconds.
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: MARKETING TOOLS ── */}
      {tab === 3 && (
        <div style={{ maxWidth: 720 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', margin: '0 0 6px' }}>📣 Marketing Tools</h2>
            <p style={{ fontSize: 13, color: '#9b6070', margin: 0 }}>Free tools to get more customers — no ads, no agency needed.</p>
          </div>

          {/* WhatsApp Auto-Reply Generator */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', fontWeight: 700, marginBottom: 6 }}>📲 WhatsApp Auto-Reply Script</div>
            <p style={{ fontSize: 12, color: '#9b6070', margin: '0 0 16px' }}>
              Copy this message → open WhatsApp Business → Settings → Away Message → paste. Every customer who messages you gets your prices, booking link, and hours automatically.
            </p>
            {(() => {
              const shopUrl = shop?.slug ? `${window.location.origin}/shop/${shop.slug}` : `${window.location.origin}/book/${shop.slug}`
              const topServices = services.slice(0, 5)
              const script = [
                `Hi! 👋 Welcome to *${shop?.name}*`,
                ``,
                topServices.length > 0 ? `✨ *Our Services:*\n${topServices.map(s => `• ${s.name} — KES ${s.price_kes?.toLocaleString()}`).join('\n')}` : '',
                ``,
                `📅 *Book your appointment online:*\n👉 ${shopUrl}`,
                ``,
                shop?.address ? `📍 ${shop.address}` : '',
                shop?.phone   ? `📞 ${shop.phone}` : '',
                ``,
                `_We'll confirm your booking via WhatsApp!_`,
              ].filter(l => l !== null).join('\n')

              return (
                <>
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '14px 16px', fontSize: 13, color: '#1a1a1f', whiteSpace: 'pre-wrap', lineHeight: 1.7, marginBottom: 14, fontFamily: 'monospace' }}>
                    {script}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isLocked ? (
                      <span style={{ fontSize: 12, color: '#9b6070', fontStyle: 'italic' }}>🔒 Renew to copy this script</span>
                    ) : (
                      <button
                        onClick={() => { navigator.clipboard.writeText(script).then(() => toast.success('Script copied! Paste into WhatsApp Business Away Message 📲')).catch(() => toast.error('Could not copy')) }}
                        style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                        📋 Copy Script
                      </button>
                    )}
                    <a href="https://www.whatsapp.com/download" target="_blank" rel="noopener noreferrer"
                      style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid #f0e4e8', background: '#fff', color: '#3d1020', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                      📱 Get WhatsApp Business
                    </a>
                  </div>
                </>
              )
            })()}
          </div>

          {/* QR Business Card */}
          <div className="card">
            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', fontWeight: 700, marginBottom: 6 }}>🖨️ Printable QR Business Card</div>
            <p style={{ fontSize: 12, color: '#9b6070', margin: '0 0 16px' }}>
              Print this at any cyber café for KES 20. Place it at your counter, stick it on receipts, or hand it out. Customers scan to book instantly.
            </p>
            {(() => {
              const shopUrl = shop?.slug ? `${window.location.origin}/shop/${shop.slug}` : `${window.location.origin}/book/${shop.slug}`
              const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(shopUrl)}&size=400x400&margin=16`
              return (
                <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ background: '#fff', border: '2px solid #f0e4e8', borderRadius: 16, padding: 16, textAlign: 'center', minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#3d1020', marginBottom: 8 }}>{shop?.name}</div>
                    <img src={qrSrc} alt="QR Code" style={{ width: 140, height: 140, display: 'block', margin: '0 auto 8px' }} />
                    <div style={{ fontSize: 11, color: '#9b6070', fontWeight: 600 }}>Scan to book & see prices</div>
                    {shop?.phone && <div style={{ fontSize: 11, color: '#6b4050', marginTop: 4 }}>📞 {shop.phone}</div>}
                    {shop?.address && <div style={{ fontSize: 10, color: '#9b6070', marginTop: 2 }}>📍 {shop.address}</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, color: '#6b4050', lineHeight: 1.8, marginBottom: 14 }}>
                      <div>✅ Works with any smartphone camera</div>
                      <div>✅ Customers land on your booking page</div>
                      <div>✅ Updates automatically when you add services</div>
                      <div>✅ Print A6 size at any Nairobi cyber café — KES 20</div>
                    </div>
                    {isLocked ? (
                      <span style={{ fontSize: 12, color: '#9b6070', fontStyle: 'italic' }}>🔒 Renew to download or print this QR code</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <a href={qrSrc} download={`${shop?.name}-qr-code.png`} target="_blank" rel="noopener noreferrer"
                          style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#c8456a,#8b2550)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          ⬇️ Download QR Code
                        </a>
                        <button onClick={() => window.print()}
                          style={{ padding: '9px 16px', borderRadius: 10, border: '1.5px solid #f0e4e8', background: '#fff', color: '#3d1020', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                          🖨️ Print
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── TAB 4: CATEGORIES ── */}
      {tab === 4 && (
        <div style={{ maxWidth:600 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
            <div>
              <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:20, color:'#3d1020', margin:0 }}>Product Categories</h2>
              <p style={{ fontSize:13, color:'#9b6070', margin:'4px 0 0' }}>Organise your products and services into categories</p>
            </div>
            <button className="btn-primary" onClick={()=>setShowAddCat(true)}><Plus size={15}/> Add Category</button>
          </div>

          {showAddCat && (
            <div style={{ background:'#fdf5f7', border:'1.5px solid #f0e4e8', borderRadius:12, padding:'14px 16px', marginBottom:16, display:'flex', gap:8, alignItems:'center' }}>
              <input className="input" autoFocus value={newCatName} onChange={e=>setNewCatName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCategory()} placeholder="Category name e.g. Hair, Nails, Skincare…" style={{ flex:1 }} />
              <button onClick={addCategory} className="btn-primary" style={{ padding:'8px 16px' }}><Check size={14}/> Add</button>
              <button onClick={()=>{setShowAddCat(false);setNewCatName('')}} className="btn-ghost" style={{ padding:'8px 10px' }}><X size={14}/></button>
            </div>
          )}

          <div className="card" style={{ padding:0 }}>
            {categories.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px 20px', color:'#9b6070' }}>
                <Tag size={32} style={{ margin:'0 auto 12px', opacity:0.4 }} />
                <div style={{ fontSize:14, fontWeight:600 }}>No categories yet</div>
                <div style={{ fontSize:12, marginTop:4 }}>Add categories to organise your products</div>
              </div>
            ) : categories.map((cat, idx) => (
              <div key={cat.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 20px', borderBottom: idx < categories.length-1 ? '1px solid #f5edf0' : 'none' }}>
                <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg,#fce8ed,#f5c0cc)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                  {cat.icon || '🏷️'}
                </div>
                {editCatId === cat.id ? (
                  <input className="input" autoFocus value={editCatName} onChange={e=>setEditCatName(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') updateCategory(cat.id); if(e.key==='Escape') setEditCatId(null) }} style={{ flex:1, padding:'6px 10px', fontSize:13 }} />
                ) : (
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#1a1a1f' }}>{cat.name}</div>
                    <div style={{ fontSize:11, color:'#9b6070' }}>Sort order: {cat.sort_order ?? idx}</div>
                  </div>
                )}
                <div style={{ display:'flex', gap:4 }}>
                  {editCatId === cat.id ? (
                    <>
                      <button onClick={()=>updateCategory(cat.id)} className="btn-ghost" style={{ padding:'5px 10px', color:'#059669', fontSize:12, fontWeight:700 }}>Save</button>
                      <button onClick={()=>setEditCatId(null)} className="btn-ghost" style={{ padding:'5px 8px' }}><X size={13}/></button>
                    </>
                  ) : (
                    <>
                      <button onClick={()=>{setEditCatId(cat.id);setEditCatName(cat.name)}} className="btn-ghost" style={{ padding:'5px 8px' }}><Edit2 size={14}/></button>
                      <button onClick={()=>deleteCategory(cat.id)} className="btn-ghost" style={{ padding:'5px 8px', color:'#dc2626' }}><Trash2 size={14}/></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 5: TAX / eTIMS READINESS ── */}
      {tab === 5 && (
        <div className="card" style={{ maxWidth:640 }}>
          <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:20, color:'#3d1020', margin:'0 0 8px' }}>Tax & eTIMS Readiness</h2>
          <p style={{ fontSize:13, color:'#9b6070', marginBottom:20 }}>SalesTrack does not currently submit invoices or receipts to KRA eTIMS.</p>
          <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:12, padding:'14px 16px', marginBottom:10 }}>
            <div style={{ fontWeight:800, color:'#9a3412', fontSize:13 }}>⚠️ Integration not active yet</div>
            <div style={{ fontSize:13, color:'#7c2d12', marginTop:5, lineHeight:1.6 }}>
              Do not rely on SalesTrack receipts as proof of eTIMS submission. KRA/eTIMS status will only appear after a real server-verified integration is implemented and tested.
            </div>
          </div>
          <div style={{ fontSize:12, color:'#9b6070', lineHeight:1.6 }}>Normal SalesTrack digital receipts remain available for customer and business records.</div>
        </div>
      )}

      {/* ── TAB 6: STAFF ── */}
      {tab === 6 && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
            <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:20, color:'#3d1020', margin:0 }}>Staff & Access Control</h2>
            <button className="btn-primary" onClick={()=>setShowAddStaff(true)} disabled={isLocked} title={isLocked ? 'Account locked — renew to add staff' : ''}>
              {isLocked ? '🔒 Locked' : <><Plus size={15}/> Add Staff</>}
            </button>
          </div>
          <div className="stat-grid-4" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:18 }}>
            {ROLES.map(role => (
              <div key={role} style={{ background:'#fff', border:'1.5px solid #f0e4e8', borderRadius:12, padding:'12px 14px' }}>
                <div style={{ fontWeight:700, textTransform:'capitalize', color:'#3d1020', marginBottom:3, fontSize:13 }}>{role}</div>
                <div style={{ fontSize:11, color:'#9b6070' }}>{ROLE_DESC[role]}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding:0 }}>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                          <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#c8456a,#6b1e38)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:13 }}>
                            {s.expand?.admin_id?.name?.[0]?.toUpperCase()||'?'}
                          </div>
                          <div style={{ fontWeight:600, fontSize:13 }}>{s.expand?.admin_id?.name||'Unknown'}</div>
                        </div>
                      </td>
                      <td style={{ fontSize:12, color:'#9b6070' }}>{s.expand?.admin_id?.email}</td>
                      <td>
                        <select
                          value={s.role || 'cashier'}
                          onChange={e => changeStaffRole(s.id, s.expand?.admin_id?.id, e.target.value)}
                          style={{ padding:'4px 10px', borderRadius:20, border:'1.5px solid #f0e4e8', background:'#fce8ed', color:'#8b2550', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Nunito,sans-serif' }}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td>
                        <span style={{ background: s.expand?.admin_id?.is_active ? '#f0fdf4' : '#fee2e2', color: s.expand?.admin_id?.is_active ? '#059669' : '#dc2626', padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:700 }}>
                          {s.expand?.admin_id?.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button className="btn-ghost" style={{ padding:'4px 8px', color:'#dc2626' }} onClick={()=>removeStaff(s.id)}><Trash2 size={13}/></button>
                      </td>
                    </tr>
                  ))}
                  {staff.length===0 && <tr><td colSpan={5} style={{ textAlign:'center', padding:'28px 0', color:'#9b6070', fontSize:13 }}>No staff assigned yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Permission matrix info card */}
          <div style={{ background:'linear-gradient(135deg,#fce8ed,#fdf5f7)', border:'1px solid #f0e4e8', borderRadius:12, padding:'14px 18px', marginTop:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#8b2550', marginBottom:10 }}>🔐 What each role can access</div>
            <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
              {ROLES.map(r => (
                <div key={r} style={{ background:'#fff', borderRadius:10, padding:'10px 14px', border:'1px solid #f0e4e8' }}>
                  <div style={{ fontWeight:700, textTransform:'capitalize', color:'#3d1020', fontSize:13, marginBottom:4 }}>{r}</div>
                  <div style={{ fontSize:11, color:'#9b6070', lineHeight:1.6 }}>{ROLE_DESC[r]}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:11, color:'#9b6070', marginTop:10 }}>
              💡 Change a staff member's role using the dropdown above — takes effect on their next login.
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {showAddStaff && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddStaff(false)}>
          <div className="modal" style={{ maxWidth:440 }}>
            <div className="modal-header">
              <span className="modal-title">Add Staff Member</span>
              <button onClick={()=>setShowAddStaff(false)} className="btn-ghost" style={{ padding:6 }}><X size={16}/></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAddStaff} style={{ display:'flex', flexDirection:'column', gap:13 }}>
                <div><label className="label">Full Name *</label><input className="input" required value={newStaff.name} onChange={e=>setNewStaff(f=>({...f,name:e.target.value}))}/></div>
                <div><label className="label">Email *</label><input className="input" type="email" required value={newStaff.email} onChange={e=>setNewStaff(f=>({...f,email:e.target.value}))}/></div>
                <div><label className="label">Phone</label><input className="input" value={newStaff.phone} onChange={e=>setNewStaff(f=>({...f,phone:e.target.value}))}/></div>
                <div><label className="label">Password *</label><input className="input" type="password" required minLength={8} value={newStaff.password} onChange={e=>setNewStaff(f=>({...f,password:e.target.value}))}/></div>
                <div>
                  <label className="label">Role</label>
                  <select className="input" value={newStaff.role} onChange={e=>setNewStaff(f=>({...f,role:e.target.value}))}>
                    {ROLES.map(r=><option key={r} value={r}>{r} — {ROLE_DESC[r]}</option>)}
                  </select>
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end', paddingTop:4 }}>
                  <button type="button" className="btn-secondary" onClick={()=>setShowAddStaff(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={addingStaff}>{addingStaff?'Creating…':'✅ Add Staff'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}