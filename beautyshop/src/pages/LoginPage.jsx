import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { Eye, EyeOff, Lock, Mail, TrendingUp, Upload, X, Plus, Check, ChevronRight, ChevronLeft } from 'lucide-react'
import toast from 'react-hot-toast'

const BUSINESS_TYPES = [
  { value: 'salon',      label: 'Salon & Spa',         emoji: '💇',  categories: ['Hair', 'Nails', 'Skin', 'Lashes', 'Makeup', 'Body Treatments', 'Waxing'] },
  { value: 'retail',     label: 'Retail Shop',          emoji: '🛒',  categories: ['Electronics', 'Clothing', 'Food & Grocery', 'General Merchandise', 'Accessories'] },
  { value: 'restaurant', label: 'Restaurant & Café',    emoji: '☕',  categories: ['Food', 'Beverages', 'Desserts', 'Alcohol', 'Snacks', 'Specials'] },
  { value: 'pharmacy',   label: 'Pharmacy & Clinic',    emoji: '💊',  categories: ['Prescription', 'Over the Counter', 'Cosmetics', 'Medical Equipment', 'Vitamins'] },
  { value: 'boutique',   label: 'Boutique & Fashion',   emoji: '👗',  categories: ['Ladies Wear', 'Mens Wear', 'Kids Wear', 'Accessories', 'Shoes', 'Bags'] },
  { value: 'hardware',   label: 'Hardware & Auto',      emoji: '🔧',  categories: ['Building Materials', 'Electrical', 'Plumbing', 'Tools', 'Auto Parts', 'Paint'] },
  { value: 'beauty',     label: 'Beauty Supply',        emoji: '💄',  categories: ['Skincare', 'Haircare', 'Makeup', 'Fragrance', 'Tools & Accessories', 'Wigs'] },
  { value: 'other',      label: 'Other Business',       emoji: '🏪',  categories: ['Products', 'Services', 'General'] },
]

const BRAND_COLORS = [
  { label: 'Rose Gold',     value: '#c8456a' },
  { label: 'Royal Blue',    value: '#2563eb' },
  { label: 'Forest Green',  value: '#059669' },
  { label: 'Deep Purple',   value: '#7c3aed' },
  { label: 'Sunset Orange', value: '#ea580c' },
  { label: 'Golden',        value: '#d97706' },
  { label: 'Teal',          value: '#0891b2' },
  { label: 'Crimson',       value: '#dc2626' },
  { label: 'Slate',         value: '#475569' },
  { label: 'Custom',        value: 'custom'  },
]

function pwdStrength(pwd) {
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  return Math.max(1, score)
}

function Spinner() {
  return <div style={{ width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTop:'2px solid #fff',borderRadius:'50%',animation:'spin 0.7s linear infinite' }} />
}

function StepBar({ step }) {
  const labels = ['Account','Business','Categories','Brand']
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, marginBottom:28 }}>
      {labels.map((label, i) => {
        const s = i + 1
        const done = step > s
        const active = step === s
        return (
          <div key={s} style={{ display:'flex', alignItems:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
              <div style={{
                width:30, height:30, borderRadius:'50%',
                background: done ? '#059669' : active ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'rgba(255,255,255,0.1)',
                border: active||done ? 'none' : '1.5px solid rgba(255,255,255,0.2)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:12, fontWeight:700, color:'#fff', transition:'all 0.3s',
                boxShadow: active ? '0 4px 14px #c8456a66' : 'none',
              }}>
                {done ? <Check size={13}/> : s}
              </div>
              <div style={{ fontSize:10, color: active ? '#fce8ed' : 'rgba(252,232,237,0.35)', fontWeight: active ? 700 : 400, whiteSpace:'nowrap' }}>
                {label}
              </div>
            </div>
            {i < labels.length-1 && (
              <div style={{ width:40, height:2, background: done ? '#059669' : 'rgba(255,255,255,0.1)', margin:'0 4px', marginBottom:18, transition:'background 0.3s' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function LoginPage() {
  const { login, loadShop } = useAuth()
  const navigate  = useNavigate()
  const logoRef   = useRef(null)

  const [mode, setMode]       = useState('login')
  const [step, setStep]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  // Step 1
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  // Step 2
  const [bizName, setBizName]           = useState('')
  const [bizType, setBizType]           = useState('')
  const [bizTypeCustom, setBizTypeCustom] = useState('')
  const [phone, setPhone]               = useState('')
  const [address, setAddress]           = useState('')
  const [bizEmail, setBizEmail]         = useState('')
  const [logoFile, setLogoFile]         = useState(null)
  const [logoPreview, setLogoPreview]   = useState(null)
  const [dragOver, setDragOver]         = useState(false)

  // Step 3
  const [selectedCats, setSelectedCats] = useState([])
  const [customCat, setCustomCat]       = useState('')

  // Step 4
  const [brandColor, setBrandColor]     = useState('#c8456a')
  const [customColor, setCustomColor]   = useState('#c8456a')
  const [currency, setCurrency]         = useState('KES')
  const [taxRate, setTaxRate]           = useState(16)
  const [receiptFooter, setReceiptFooter] = useState('')

  const currentBizType = BUSINESS_TYPES.find(b => b.value === bizType)
  const activeBrandColor = brandColor === 'custom' ? customColor : brandColor

  const handleLogoFile = (file) => {
    if (!file) return
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { toast.error('JPG, PNG or WebP only'); return }
    if (file.size > 5*1024*1024) { toast.error('Max 5MB'); return }
    setLogoFile(file)
    const r = new FileReader()
    r.onload = e => setLogoPreview(e.target.result)
    r.readAsDataURL(file)
  }

  const toggleCat = (cat) => setSelectedCats(prev => prev.includes(cat) ? prev.filter(c=>c!==cat) : [...prev, cat])

  const addCustomCat = () => {
    const v = customCat.trim()
    if (!v) return
    if (selectedCats.includes(v)) { toast.error('Already added'); return }
    setSelectedCats(p => [...p, v])
    setCustomCat('')
  }

  const handleBizType = (type) => {
    setBizType(type)
    const preset = BUSINESS_TYPES.find(b => b.value === type)
    if (preset) setSelectedCats(preset.categories.slice(0, 4))
  }

  const canProceed = () => {
    if (step === 1) return name.trim() && email.trim() && password.length >= 8
    if (step === 2) return bizName.trim() && bizType
    if (step === 3) return selectedCats.length > 0
    return true
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      toast.success('Welcome back!')
      navigate('/app/dashboard')
    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Invalid email or password')
    } finally { setLoading(false) }
  }

  const handleRegister = async () => {
    setLoading(true)
    try {
      await pb.collection(C.ADMINS).create({
        name, email, password, passwordConfirm: password,
        role: 'owner', is_active: true, business_type: bizType,
      })
      await login(email, password)

      const slug = bizName.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-') + '-' + Date.now()
      const fd = new FormData()
      fd.append('name', bizName)
      fd.append('slug', slug)
      fd.append('phone', phone)
      fd.append('address', address)
      fd.append('email', bizEmail || email)
      fd.append('currency', currency)
      fd.append('tax_rate', String(taxRate))
      fd.append('is_active', 'true')
      fd.append('business_type', bizType === 'other' ? (bizTypeCustom || 'Other') : (currentBizType?.label || bizType))
      fd.append('brand_color', activeBrandColor)
      fd.append('receipt_footer', receiptFooter || `Thank you for visiting ${bizName}! 🙏`)
      fd.append('receipt_show_logo', 'true')
      fd.append('receipt_show_tax', 'true')
      if (logoFile) fd.append('logo', logoFile)

      const newShop = await pb.collection(C.SHOPS).create(fd)

      await pb.collection(C.SHOP_ADMINS).create({
        shop_id: newShop.id,
        admin_id: pb.authStore.model.id,
        role: 'owner',
      })

      for (let i = 0; i < selectedCats.length; i++) {
        try {
          await pb.collection(C.CATEGORIES).create({ shop_id: newShop.id, name: selectedCats[i], sort_order: i })
        } catch {}
      }

      localStorage.setItem('st_pending_email', email)
      await loadShop(pb.authStore.model.id)
      toast.success(`Welcome to SalesTrack, ${name.split(' ')[0]}! 🎉`)
      navigate('/app/dashboard')
    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Something went wrong')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#1a0a0e 0%,#3d1020 50%,#6b1e38 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', position:'relative', overflow:'hidden' }}>
      {[...Array(4)].map((_,i) => (
        <div key={i} style={{ position:'absolute', width:[300,200,150,400][i], height:[300,200,150,400][i], borderRadius:'50%', background:['#c8456a','#e6b800','#8b2550','#c8456a'][i], opacity:[0.08,0.05,0.06,0.04][i], top:['10%','60%','80%','-10%'][i], left:['70%','10%','80%','20%'][i], filter:'blur(60px)', pointerEvents:'none' }} />
      ))}

      <div style={{ width:'100%', maxWidth: mode==='register' && step >= 2 ? 560 : 440, position:'relative', zIndex:1, transition:'max-width 0.3s ease' }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:52,height:52, background:'linear-gradient(135deg,#e6b800,#c8456a)', borderRadius:14, display:'inline-flex', alignItems:'center', justifyContent:'center', boxShadow:'0 8px 28px #c8456a55', marginBottom:10 }}>
            <TrendingUp size={24} color="#fff" />
          </div>
          <h1 style={{ fontFamily:'Playfair Display,serif', color:'#fce8ed', fontSize:28, fontWeight:700, margin:0 }}>SalesTrack</h1>
          <p style={{ color:'#f7c5d088', fontSize:12, marginTop:4 }}>Africa's #1 Business Management System</p>
        </div>

        {(mode === 'login' || step === 1) && (
          <div style={{ display:'flex', background:'rgba(255,255,255,0.08)', borderRadius:12, padding:4, marginBottom:24, gap:4 }}>
            {['login','register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setStep(1) }} style={{ flex:1, padding:'9px', borderRadius:9, border:'none', background: mode===m ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent', color: mode===m ? '#fff' : '#f7c5d066', fontWeight:700, fontSize:13, cursor:'pointer', transition:'all 0.2s', fontFamily:'Nunito,sans-serif' }}>
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>
        )}

        {mode === 'register' && <StepBar step={step} />}

        {/* ── LOGIN ── */}
        {mode === 'login' && (
          <div style={card}>
            <h2 style={cardTitle}>Welcome back ✦</h2>
            <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={lbl}>Email address</label>
                <div style={{ position:'relative' }}>
                  <Mail size={15} style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'#f7c5d066' }} />
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@yourbusiness.com" style={{ ...inp, paddingLeft:40 }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Password</label>
                <div style={{ position:'relative' }}>
                  <Lock size={15} style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'#f7c5d066' }} />
                  <input type={showPwd?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" style={{ ...inp, paddingLeft:40, paddingRight:42 }} />
                  <button type="button" onClick={()=>setShowPwd(!showPwd)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#f7c5d066', display:'flex' }}>
                    {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} style={btnPrimary(loading)}>
                {loading ? <><Spinner/> Please wait…</> : '✦ Sign In'}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 1 ── */}
        {mode==='register' && step===1 && (
          <div style={card}>
            <h2 style={cardTitle}>Create your account ✦</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={lbl}>Your full name *</label>
                <input type="text" value={name} onChange={e=>setName(e.target.value)} required placeholder="Jane Wanjiku" style={inp} />
              </div>
              <div>
                <label style={lbl}>Email address *</label>
                <div style={{ position:'relative' }}>
                  <Mail size={15} style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'#f7c5d066' }} />
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@business.com" style={{ ...inp, paddingLeft:40 }} />
                </div>
              </div>
              <div>
                <label style={lbl}>Password *</label>
                <div style={{ position:'relative' }}>
                  <Lock size={15} style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'#f7c5d066' }} />
                  <input type={showPwd?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} placeholder="Min. 8 characters" style={{ ...inp, paddingLeft:40, paddingRight:42 }} />
                  <button type="button" onClick={()=>setShowPwd(!showPwd)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#f7c5d066', display:'flex' }}>
                    {showPwd ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
                {password && (
                  <div style={{ marginTop:6 }}>
                    <div style={{ display:'flex', gap:3, marginBottom:3 }}>
                      {[...Array(4)].map((_,i) => (
                        <div key={i} style={{ flex:1, height:3, borderRadius:3, background: i < pwdStrength(password) ? ['#dc2626','#f59e0b','#3b82f6','#059669'][pwdStrength(password)-1] : 'rgba(255,255,255,0.1)', transition:'all 0.2s' }} />
                      ))}
                    </div>
                    <div style={{ fontSize:10, color:['#dc2626','#f59e0b','#3b82f6','#059669'][pwdStrength(password)-1] }}>
                      {['','Weak — add numbers & symbols','Fair — getting better','Good password','Strong password ✓'][pwdStrength(password)]}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => canProceed() && setStep(2)} disabled={!canProceed()} style={btnPrimary(!canProceed())}>
                Continue <ChevronRight size={15}/>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {mode==='register' && step===2 && (
          <div style={card}>
            <h2 style={cardTitle}>Your business 🏪</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={lbl}>Business name *</label>
                <input type="text" value={bizName} onChange={e=>setBizName(e.target.value)} placeholder="e.g. Glam Studio Nairobi" style={inp} />
              </div>
              <div>
                <label style={lbl}>Business type *</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:7 }}>
                  {BUSINESS_TYPES.map(bt => (
                    <button key={bt.value} type="button" onClick={() => handleBizType(bt.value)} style={{ padding:'9px 5px', borderRadius:10, border:'1.5px solid', borderColor: bizType===bt.value ? '#c8456a' : 'rgba(255,255,255,0.12)', background: bizType===bt.value ? 'rgba(200,69,106,0.2)' : 'rgba(255,255,255,0.04)', color:'#fce8ed', cursor:'pointer', textAlign:'center', transition:'all 0.2s', boxShadow: bizType===bt.value ? '0 0 0 2px #c8456a44' : 'none' }}>
                      <div style={{ fontSize:18, marginBottom:3 }}>{bt.emoji}</div>
                      <div style={{ fontSize:9, fontWeight:700, lineHeight:1.2 }}>{bt.label}</div>
                    </button>
                  ))}
                </div>
                {bizType === 'other' && (
                  <input type="text" value={bizTypeCustom} onChange={e=>setBizTypeCustom(e.target.value)} placeholder="Describe your business" style={{ ...inp, marginTop:8 }} />
                )}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={lbl}>Phone number</label>
                  <input type="text" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+254 7xx xxx xxx" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Business email</label>
                  <input type="email" value={bizEmail} onChange={e=>setBizEmail(e.target.value)} placeholder="biz@email.com" style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Business address</label>
                <input type="text" value={address} onChange={e=>setAddress(e.target.value)} placeholder="e.g. Westlands, Nairobi" style={inp} />
              </div>
              {/* Logo upload */}
              <div>
                <label style={lbl}>Business logo — appears on all receipts & invoices</label>
                <div onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);handleLogoFile(e.dataTransfer.files[0])}} onClick={()=>logoRef.current?.click()} style={{ border:`2px dashed ${dragOver?'#c8456a':'rgba(255,255,255,0.2)'}`, borderRadius:12, padding:'18px', textAlign:'center', cursor:'pointer', background: dragOver?'rgba(200,69,106,0.1)':'rgba(255,255,255,0.04)', transition:'all 0.2s' }}>
                  {logoPreview ? (
                    <div style={{ position:'relative', display:'inline-block' }}>
                      <img src={logoPreview} alt="logo" style={{ width:72, height:72, objectFit:'contain', borderRadius:8 }} />
                      <button type="button" onClick={e=>{e.stopPropagation();setLogoFile(null);setLogoPreview(null)}} style={{ position:'absolute', top:-8, right:-8, width:20, height:20, borderRadius:'50%', background:'#dc2626', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <X size={11}/>
                      </button>
                      <div style={{ fontSize:10, color:'#f7c5d066', marginTop:4 }}>Click to change</div>
                    </div>
                  ) : (
                    <>
                      <Upload size={24} color="rgba(252,232,237,0.35)" style={{ margin:'0 auto 6px' }} />
                      <div style={{ fontSize:12, color:'#f7c5d077', fontWeight:600 }}>Drop logo or click to upload</div>
                      <div style={{ fontSize:10, color:'#f7c5d044', marginTop:3 }}>JPG · PNG · WebP · Max 5MB</div>
                    </>
                  )}
                </div>
                <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={e=>handleLogoFile(e.target.files[0])} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" onClick={()=>setStep(1)} style={btnBack}><ChevronLeft size={15}/> Back</button>
                <button type="button" onClick={()=>canProceed()&&setStep(3)} disabled={!canProceed()} style={{ ...btnPrimary(!canProceed()), flex:2 }}>Continue <ChevronRight size={15}/></button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3 ── */}
        {mode==='register' && step===3 && (
          <div style={card}>
            <h2 style={cardTitle}>Your categories 🏷️</h2>
            <p style={{ color:'#f7c5d066', fontSize:12, marginBottom:16, textAlign:'center' }}>
              Suggested for {currentBizType?.label}. Select, remove or add your own.
            </p>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:14 }}>
              {(currentBizType?.categories || []).map(cat => {
                const sel = selectedCats.includes(cat)
                return (
                  <button key={cat} type="button" onClick={()=>toggleCat(cat)} style={{ padding:'6px 13px', borderRadius:20, border:'1.5px solid', borderColor: sel?'#c8456a':'rgba(255,255,255,0.15)', background: sel?'rgba(200,69,106,0.2)':'rgba(255,255,255,0.05)', color: sel?'#fce8ed':'#f7c5d077', fontSize:12, fontWeight: sel?700:400, cursor:'pointer', display:'flex', alignItems:'center', gap:5, transition:'all 0.15s' }}>
                    {sel && <Check size={11}/>}{cat}
                  </button>
                )
              })}
            </div>
            {selectedCats.filter(c=>!currentBizType?.categories.includes(c)).length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:10, color:'#f7c5d055', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Custom categories</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {selectedCats.filter(c=>!currentBizType?.categories.includes(c)).map(cat => (
                    <div key={cat} style={{ padding:'5px 11px', borderRadius:20, background:'rgba(230,184,0,0.15)', border:'1.5px solid rgba(230,184,0,0.3)', color:'#e6b800', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:5 }}>
                      {cat}
                      <button type="button" onClick={()=>toggleCat(cat)} style={{ background:'none', border:'none', color:'#e6b800', cursor:'pointer', padding:0, display:'flex' }}><X size={11}/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:'flex', gap:7, marginBottom:8 }}>
              <input type="text" value={customCat} onChange={e=>setCustomCat(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addCustomCat())} placeholder="Add custom e.g. Wigs, Threading, Juice Bar…" style={{ ...inp, flex:1, fontSize:12 }} />
              <button type="button" onClick={addCustomCat} style={{ padding:'10px 13px', borderRadius:10, border:'none', background:'rgba(230,184,0,0.2)', color:'#e6b800', cursor:'pointer', display:'flex', alignItems:'center', gap:3, fontWeight:700, fontSize:12, fontFamily:'Nunito,sans-serif' }}>
                <Plus size={15}/> Add
              </button>
            </div>
            <div style={{ fontSize:10, color:'#f7c5d033', marginBottom:18 }}>
              {selectedCats.length} {selectedCats.length===1?'category':'categories'} · Add more anytime in the app
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button type="button" onClick={()=>setStep(2)} style={btnBack}><ChevronLeft size={15}/> Back</button>
              <button type="button" onClick={()=>canProceed()&&setStep(4)} disabled={!canProceed()} style={{ ...btnPrimary(!canProceed()), flex:2 }}>Continue <ChevronRight size={15}/></button>
            </div>
          </div>
        )}

        {/* ── STEP 4 ── */}
        {mode==='register' && step===4 && (
          <div style={card}>
            <h2 style={cardTitle}>Make it yours 🎨</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={lbl}>Brand color — shown on receipts & invoices</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginBottom:8 }}>
                  {BRAND_COLORS.map(bc => (
                    <button key={bc.value} type="button" onClick={()=>setBrandColor(bc.value)} title={bc.label} style={{ width:32, height:32, borderRadius:'50%', border:'3px solid', borderColor: brandColor===bc.value?'#fff':'transparent', background: bc.value==='custom'?'linear-gradient(135deg,#ff0080,#7928ca,#0070f3)':bc.value, cursor:'pointer', transition:'all 0.15s', boxShadow: brandColor===bc.value?'0 0 0 2px rgba(255,255,255,0.4)':'none', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {brandColor===bc.value && <Check size={13} color="#fff"/>}
                    </button>
                  ))}
                </div>
                {brandColor==='custom' && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <input type="color" value={customColor} onChange={e=>setCustomColor(e.target.value)} style={{ width:40, height:40, borderRadius:8, border:'2px solid rgba(255,255,255,0.2)', cursor:'pointer', padding:2, background:'none' }} />
                    <input type="text" value={customColor} onChange={e=>setCustomColor(e.target.value)} placeholder="#c8456a" style={{ ...inp, flex:1, fontFamily:'monospace', fontSize:13 }} />
                  </div>
                )}
                {/* Live preview */}
                <div style={{ background:activeBrandColor, borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
                  {logoPreview
                    ? <img src={logoPreview} alt="logo" style={{ width:30, height:30, objectFit:'contain', borderRadius:6, background:'rgba(255,255,255,0.9)', padding:2 }} />
                    : <div style={{ width:30, height:30, borderRadius:6, background:'rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13 }}>🏪</div>
                  }
                  <div>
                    <div style={{ color:'#fff', fontWeight:700, fontSize:13 }}>{bizName || 'Your Business'}</div>
                    <div style={{ color:'rgba(255,255,255,0.65)', fontSize:10 }}>Receipt header preview</div>
                  </div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={lbl}>Currency</label>
                  <select value={currency} onChange={e=>setCurrency(e.target.value)} style={inp}>
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
                  <label style={lbl}>VAT / Tax Rate (%)</label>
                  <input type="number" min={0} max={100} step={0.5} value={taxRate} onChange={e=>setTaxRate(parseFloat(e.target.value))} style={inp} />
                </div>
              </div>
              <div>
                <label style={lbl}>Receipt footer message</label>
                <input type="text" value={receiptFooter} onChange={e=>setReceiptFooter(e.target.value)} placeholder={`Thank you for visiting ${bizName||'your business'}! 🙏`} style={inp} />
                <div style={{ fontSize:10, color:'#f7c5d033', marginTop:3 }}>Printed at the bottom of every receipt & invoice</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button type="button" onClick={()=>setStep(3)} style={btnBack}><ChevronLeft size={15}/> Back</button>
                <button type="button" onClick={handleRegister} disabled={loading} style={{ ...btnPrimary(loading), flex:2 }}>
                  {loading ? <><Spinner/> Creating your business…</> : '🎉 Launch My Business!'}
                </button>
              </div>
            </div>
          </div>
        )}

        <p style={{ textAlign:'center', color:'#f7c5d033', fontSize:11, marginTop:16 }}>
          {mode==='register' ? '🔒 Your data is encrypted and secure · Cancel anytime' : 'Powered by SalesTrack v2.0 · Business POS'}
        </p>
      </div>
    </div>
  )
}

const card = { background:'rgba(255,255,255,0.06)', backdropFilter:'blur(20px)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:22, padding:'28px 32px', boxShadow:'0 24px 80px rgba(0,0,0,0.4)' }
const cardTitle = { fontFamily:'Playfair Display,serif', color:'#fce8ed', fontSize:19, margin:'0 0 20px', textAlign:'center' }
const lbl = { display:'block', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#f7c5d0aa', marginBottom:6 }
const inp = { width:'100%', padding:'10px 13px', borderRadius:9, border:'1.5px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.08)', color:'#fce8ed', fontSize:13, fontFamily:'Nunito,sans-serif', outline:'none', boxSizing:'border-box' }
const btnPrimary = (disabled) => ({ padding:'12px', borderRadius:11, flex:1, background: disabled?'rgba(255,255,255,0.08)':'linear-gradient(135deg,#c8456a,#8b2550)', color: disabled?'rgba(255,255,255,0.25)':'#fff', border:'none', fontWeight:700, fontSize:14, cursor: disabled?'not-allowed':'pointer', fontFamily:'Nunito,sans-serif', boxShadow: disabled?'none':'0 5px 20px #c8456a55', display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'all 0.2s' })
const btnBack = { padding:'12px 14px', borderRadius:11, flex:1, background:'rgba(255,255,255,0.05)', color:'#f7c5d066', border:'1px solid rgba(255,255,255,0.1)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'Nunito,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }