import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import {
  Eye, EyeOff, Lock, Mail, TrendingUp, Upload, X, Plus, Check,
  ChevronRight, ChevronLeft, Gift, Sparkles, ArrowLeft, Send
} from 'lucide-react'
import toast from 'react-hot-toast'

/* ═══════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════ */
const BUSINESS_TYPES = [
  { value: 'salon',      label: 'Salon & Spa',       emoji: '💇', categories: ['Hair', 'Nails', 'Skin', 'Lashes', 'Makeup', 'Body Treatments', 'Waxing'] },
  { value: 'retail',     label: 'Retail Shop',        emoji: '🛒', categories: ['Electronics', 'Clothing', 'Food & Grocery', 'General Merchandise', 'Accessories'] },
  { value: 'restaurant', label: 'Restaurant & Café',  emoji: '☕', categories: ['Food', 'Beverages', 'Desserts', 'Alcohol', 'Snacks', 'Specials'] },
  { value: 'pharmacy',   label: 'Pharmacy & Clinic',  emoji: '💊', categories: ['Prescription', 'OTC Medicines', 'Cosmetics', 'Medical Equipment', 'Vitamins'] },
  { value: 'boutique',   label: 'Boutique & Fashion', emoji: '👗', categories: ['Ladies Wear', 'Mens Wear', 'Kids Wear', 'Accessories', 'Shoes', 'Bags'] },
  { value: 'hardware',   label: 'Hardware & Auto',    emoji: '🔧', categories: ['Building Materials', 'Electrical', 'Plumbing', 'Tools', 'Auto Parts', 'Paint'] },
  { value: 'beauty',     label: 'Beauty Supply',      emoji: '💄', categories: ['Skincare', 'Haircare', 'Makeup', 'Fragrance', 'Tools & Accessories', 'Wigs'] },
  { value: 'electronics', label: 'Phone & Electronics', emoji: '📱', categories: ['Smartphones', 'Feature Phones', 'Chargers & Cables', 'Cases & Screen Protectors', 'Earphones & Headphones', 'Power Banks', 'Memory & Storage', 'Smartwatches & Bands', 'Phone Accessories', 'Laptops & Tablets', 'Repairs & Services'] },
  { value: 'other',      label: 'Other Business',     emoji: '🏪', categories: ['Products', 'Services', 'General'] },
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

// Demo products seeded per business type so dashboard isn't empty on day 1
const UNIT_MAP = {
  bottle: 'piece', tube: 'piece', jar: 'piece', strip: 'piece',
  capsule: 'piece', sachet: 'piece', pair: 'piece', tin: 'piece',
  plate: 'service', cup: 'piece', packet: 'piece', sheet: 'piece',
  bag: 'piece', metre: 'piece', piece: 'piece', kg: 'kg',
  ml: 'ml', g: 'g', litre: 'litre', box: 'box', set: 'set',
  dozen: 'dozen', service: 'service',
}

const DEMO_PRODUCTS = {
  salon: [
    { name: 'Hair Relaxer (Small)', selling_price_kes: 1500, cost_price_kes: 600, stock_qty: 20, unit: 'piece' },
    { name: 'Shampoo 500ml', selling_price_kes: 850, cost_price_kes: 300, stock_qty: 30, unit: 'bottle' },
    { name: 'Hair Treatment Mask', selling_price_kes: 1200, cost_price_kes: 450, stock_qty: 15, unit: 'piece' },
    { name: 'Nail Polish (per colour)', selling_price_kes: 400, cost_price_kes: 120, stock_qty: 50, unit: 'piece' },
    { name: 'Skin Bleaching Cream', selling_price_kes: 950, cost_price_kes: 350, stock_qty: 25, unit: 'tube' },
  ],
  retail: [
    { name: 'Mineral Water 500ml', selling_price_kes: 60, cost_price_kes: 30, stock_qty: 200, unit: 'bottle' },
    { name: 'Bread (White Loaf)', selling_price_kes: 65, cost_price_kes: 48, stock_qty: 50, unit: 'piece' },
    { name: 'Cooking Oil 1L', selling_price_kes: 280, cost_price_kes: 200, stock_qty: 40, unit: 'bottle' },
    { name: 'Sugar 2kg', selling_price_kes: 260, cost_price_kes: 190, stock_qty: 60, unit: 'packet' },
    { name: 'Milk 500ml', selling_price_kes: 70, cost_price_kes: 50, stock_qty: 80, unit: 'packet' },
  ],
  restaurant: [
    { name: 'Pilau (Full)', selling_price_kes: 350, cost_price_kes: 120, stock_qty: 100, unit: 'plate' },
    { name: 'Chai Maziwa', selling_price_kes: 50, cost_price_kes: 15, stock_qty: 200, unit: 'cup' },
    { name: 'Chapati', selling_price_kes: 30, cost_price_kes: 10, stock_qty: 150, unit: 'piece' },
    { name: 'Soda 300ml', selling_price_kes: 80, cost_price_kes: 55, stock_qty: 100, unit: 'bottle' },
    { name: 'Beef Stew', selling_price_kes: 250, cost_price_kes: 100, stock_qty: 80, unit: 'plate' },
  ],
  pharmacy: [
    { name: 'Paracetamol 500mg (Strip)', selling_price_kes: 30, cost_price_kes: 15, stock_qty: 200, unit: 'strip' },
    { name: 'Amoxicillin 250mg (Cap)', selling_price_kes: 15, cost_price_kes: 8, stock_qty: 300, unit: 'capsule' },
    { name: 'Malaria Test Kit', selling_price_kes: 150, cost_price_kes: 80, stock_qty: 50, unit: 'kit' },
    { name: 'ORS Sachet', selling_price_kes: 20, cost_price_kes: 8, stock_qty: 200, unit: 'sachet' },
    { name: 'Vaseline 250ml', selling_price_kes: 120, cost_price_kes: 60, stock_qty: 40, unit: 'jar' },
  ],
  boutique: [
    { name: 'Ladies Dress (Casual)', selling_price_kes: 1800, cost_price_kes: 800, stock_qty: 15, unit: 'piece' },
    { name: 'Mens Polo Shirt', selling_price_kes: 1200, cost_price_kes: 500, stock_qty: 20, unit: 'piece' },
    { name: 'Kids T-Shirt', selling_price_kes: 600, cost_price_kes: 250, stock_qty: 30, unit: 'piece' },
    { name: 'Ladies Handbag', selling_price_kes: 2500, cost_price_kes: 1000, stock_qty: 10, unit: 'piece' },
    { name: 'Canvas Shoes', selling_price_kes: 1500, cost_price_kes: 600, stock_qty: 25, unit: 'pair' },
  ],
  hardware: [
    { name: 'Cement (50kg Bag)', selling_price_kes: 680, cost_price_kes: 550, stock_qty: 100, unit: 'bag' },
    { name: 'Iron Sheet (Gauge 30)', selling_price_kes: 850, cost_price_kes: 650, stock_qty: 200, unit: 'sheet' },
    { name: 'Electrical Wire (1m)', selling_price_kes: 45, cost_price_kes: 25, stock_qty: 500, unit: 'metre' },
    { name: 'Paint Emulsion 4L', selling_price_kes: 1400, cost_price_kes: 950, stock_qty: 30, unit: 'tin' },
    { name: 'Nails 4" (1kg)', selling_price_kes: 180, cost_price_kes: 120, stock_qty: 80, unit: 'kg' },
  ],
  beauty: [
    { name: 'Aloe Vera Gel 200ml', selling_price_kes: 450, cost_price_kes: 180, stock_qty: 40, unit: 'bottle' },
    { name: 'Lace Front Wig (Short)', selling_price_kes: 4500, cost_price_kes: 2000, stock_qty: 10, unit: 'piece' },
    { name: 'Mascara', selling_price_kes: 650, cost_price_kes: 250, stock_qty: 30, unit: 'piece' },
    { name: 'Foundation (Medium)', selling_price_kes: 1200, cost_price_kes: 450, stock_qty: 20, unit: 'bottle' },
    { name: 'Lip Gloss', selling_price_kes: 350, cost_price_kes: 120, stock_qty: 50, unit: 'piece' },
  ],
  electronics: [
    { name: 'Samsung Galaxy A15 128GB', selling_price_kes: 21999, cost_price_kes: 17500, stock_qty: 10, unit: 'piece' },
    { name: 'Infinix Hot 40i 128GB', selling_price_kes: 14999, cost_price_kes: 11500, stock_qty: 8, unit: 'piece' },
    { name: 'USB-C Charging Cable 1m', selling_price_kes: 350, cost_price_kes: 120, stock_qty: 50, unit: 'piece' },
    { name: 'Phone Case (Universal)', selling_price_kes: 500, cost_price_kes: 150, stock_qty: 30, unit: 'piece' },
    { name: 'Screen Replacement - Samsung (Service)', selling_price_kes: 3500, cost_price_kes: 800, stock_qty: 999, unit: 'service' },
  ],
  other: [
    { name: 'Sample Product 1', selling_price_kes: 500, cost_price_kes: 200, stock_qty: 50, unit: 'piece' },
    { name: 'Sample Product 2', selling_price_kes: 750, cost_price_kes: 300, stock_qty: 20, unit: 'piece' },
    { name: 'Sample Product 3', selling_price_kes: 1000, cost_price_kes: 400, stock_qty: 20, unit: 'piece' },
  ],
}

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
function pwdStrength(pwd) {
  let score = 0
  if (pwd.length >= 8) score++
  if (pwd.length >= 12) score++
  if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  return Math.max(1, score)
}

function Spinner({ size = 16, color = '#fff' }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid ${color}33`,
      borderTop: `2px solid ${color}`,
      borderRadius: '50%',
      animation: 'st-spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  )
}

// Lightweight confetti using pure CSS + JS — no extra package needed
function fireConfetti() {
  const colors = ['#c8456a', '#e6b800', '#059669', '#2563eb', '#7c3aed', '#ea580c', '#fff']
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;overflow:hidden'
  document.body.appendChild(container)

  for (let i = 0; i < 120; i++) {
    const el = document.createElement('div')
    const size = Math.random() * 8 + 4
    const color = colors[Math.floor(Math.random() * colors.length)]
    const x = Math.random() * 100
    const delay = Math.random() * 0.8
    const duration = Math.random() * 2 + 2
    const rotation = Math.random() * 720
    const shape = Math.random() > 0.5 ? '50%' : '2px'

    el.style.cssText = `
      position:absolute;
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:${shape};
      left:${x}%;top:-10px;
      animation:st-confetti-fall ${duration}s ${delay}s ease-in forwards;
      transform:rotate(0deg);
    `
    container.appendChild(el)
  }

  // Inject keyframes if not present
  if (!document.getElementById('st-confetti-style')) {
    const style = document.createElement('style')
    style.id = 'st-confetti-style'
    style.textContent = `
      @keyframes st-confetti-fall {
        0%   { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
        100% { transform: translateY(110vh) rotate(720deg) scale(0.3); opacity: 0; }
      }
      @keyframes st-spin { to { transform: rotate(360deg); } }
      @keyframes st-slide-in-right { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }
      @keyframes st-slide-in-left  { from { opacity:0; transform:translateX(-30px); } to { opacity:1; transform:translateX(0); } }
      @keyframes st-fade-up { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      @keyframes st-pulse-ring { 0%,100% { box-shadow: 0 0 0 0 rgba(200,69,106,0.4); } 50% { box-shadow: 0 0 0 14px rgba(200,69,106,0); } }
      @keyframes st-bounce { 0%,100% { transform:scale(1); } 50% { transform:scale(1.1); } }
      @keyframes st-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    `
    document.head.appendChild(style)
  }

  setTimeout(() => document.body.removeChild(container), 4000)
}

/* ═══════════════════════════════════════════════
   STEP PROGRESS BAR
═══════════════════════════════════════════════ */
function StepBar({ step }) {
  const steps = [
    { label: 'Account', icon: '👤' },
    { label: 'Business', icon: '🏪' },
    { label: 'Categories', icon: '🏷️' },
    { label: 'Brand', icon: '🎨' },
  ]
  return (
    <div style={{ marginBottom: 24 }}>
      {/* Progress line */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ position: 'absolute', left: '15px', right: '15px', top: '15px', height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 3, zIndex: 0 }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg,#c8456a,#e6b800)', borderRadius: 3, width: `${((step - 1) / 3) * 100}%`, transition: 'width 0.5s ease' }} />
        </div>
        {steps.map((s, i) => {
          const num = i + 1
          const done = step > num
          const active = step === num
          return (
            <div key={num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 1 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: done ? '#059669' : active ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'rgba(30,10,20,0.8)',
                border: done || active ? 'none' : '2px solid rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: done ? 12 : 11,
                fontWeight: 700, color: '#fff',
                transition: 'all 0.3s',
                boxShadow: active ? '0 0 0 4px rgba(200,69,106,0.25), 0 4px 14px rgba(200,69,106,0.4)' : 'none',
                animation: active ? 'st-pulse-ring 2s infinite' : 'none',
              }}>
                {done ? <Check size={13} /> : <span style={{ fontSize: 10 }}>{s.icon}</span>}
              </div>
              <div style={{
                fontSize: 9, fontWeight: active ? 700 : 400,
                color: active ? '#fce8ed' : done ? '#86efac' : 'rgba(252,232,237,0.3)',
                transition: 'all 0.3s', whiteSpace: 'nowrap',
              }}>
                {s.label}
              </div>
            </div>
          )
        })}
      </div>
      {/* Trial badge */}
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px',
          background: 'rgba(5,150,105,0.15)', border: '1px solid rgba(5,150,105,0.3)',
          borderRadius: 20, fontSize: 10, color: '#86efac', fontWeight: 700,
        }}>
          <span style={{ fontSize: 8 }}>🎁</span> 14-day free trial · No card required
        </span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   CELEBRATION SCREEN (shown after step 4 completes)
═══════════════════════════════════════════════ */
function CelebrationScreen({ bizName, adminName, onDone }) {
  useEffect(() => {
    fireConfetti()
    // Fire a second burst
    setTimeout(fireConfetti, 1200)
  }, [])

  return (
    <div style={{
      ...card,
      textAlign: 'center',
      padding: '40px 28px',
      animation: 'st-fade-up 0.5s ease',
    }}>
      <div style={{
        fontSize: 64, marginBottom: 8,
        animation: 'st-bounce 0.6s ease 0.3s both',
        display: 'inline-block',
      }}>🎉</div>
      <h2 style={{
        fontFamily: 'Playfair Display, serif',
        color: '#fce8ed', fontSize: 22, margin: '0 0 8px',
        lineHeight: 1.3,
      }}>
        You're all set,<br />
        <span style={{ color: '#e6b800' }}>{adminName?.split(' ')[0] || 'Boss'}!</span>
      </h2>
      <p style={{ color: '#f7c5d077', fontSize: 13, margin: '0 0 6px', lineHeight: 1.6 }}>
        <strong style={{ color: '#fce8ed' }}>{bizName}</strong> is live on SalesTrack.
      </p>
      <p style={{ color: '#f7c5d055', fontSize: 12, margin: '0 0 24px' }}>
        Your 14-day free trial has started. Demo products have been added so you can start selling immediately.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
        {[
          { icon: '🛒', label: 'Make your first sale' },
          { icon: '📦', label: 'Add your inventory' },
          { icon: '👥', label: 'Add your staff' },
        ].map(item => (
          <div key={item.label} style={{
            padding: '12px 8px', borderRadius: 12,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{item.icon}</div>
            <div style={{ fontSize: 10, color: '#f7c5d077', fontWeight: 600, lineHeight: 1.3 }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* WhatsApp virality button */}
      <button
        onClick={() => {
          const msg = `🎉 My shop *${bizName}* is now live on SalesTrack!\n\nI can now manage sales, inventory & staff right from my phone 📱\n\nTry it free for 14 days 👉 https://glamtrack-beautyshop.vercel.app`
          try { navigator.clipboard.writeText(msg) } catch {}
          const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`
          const a = document.createElement('a'); a.href = wa; a.target = '_blank'; a.rel = 'noopener noreferrer'
          document.body.appendChild(a); a.click(); document.body.removeChild(a)
        }}
        style={{
          width: '100%', marginBottom: 10,
          padding: '12px', borderRadius: 12,
          background: 'rgba(37,211,102,0.15)', color: '#25D366',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
          fontFamily: 'Nunito,sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          border: '1.5px solid rgba(37,211,102,0.25)',
        }}
      >
        📲 Share on WhatsApp Status
      </button>

      <button onClick={onDone} style={{
        ...btnPrimaryStyle,
        width: '100%',
        background: 'linear-gradient(135deg,#e6b800,#c8456a)',
        fontSize: 15,
        padding: '14px',
        boxShadow: '0 6px 24px rgba(230,184,0,0.35)',
        animation: 'st-shimmer 2s linear infinite',
        backgroundSize: '200% auto',
      }}>
        🚀 Open My Dashboard
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   FORGOT PASSWORD FLOW
═══════════════════════════════════════════════ */
function ForgotPasswordView({ onBack }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      await pb.collection(C.ADMINS).requestPasswordReset(email.trim())
      setSent(true)
    } catch {
      // Always show success to prevent email enumeration
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '32px 24px', animation: 'st-fade-up 0.4s ease' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>📬</div>
        <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontSize: 20, margin: '0 0 10px' }}>Check your email</h2>
        <p style={{ color: '#f7c5d077', fontSize: 13, margin: '0 0 6px', lineHeight: 1.6 }}>
          If an account exists for <strong style={{ color: '#fce8ed' }}>{email}</strong>, a reset link has been sent.
        </p>
        <p style={{ color: '#f7c5d044', fontSize: 11, margin: '0 0 24px' }}>Check your spam folder if you don't see it.</p>
        <button onClick={onBack} style={{ ...btnPrimaryStyle, width: '100%', fontSize: 14 }}>
          ← Back to Sign In
        </button>
      </div>
    )
  }

  return (
    <div style={{ ...card, animation: 'st-slide-in-right 0.3s ease' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#f7c5d066', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginBottom: 16, fontFamily: 'Nunito,sans-serif' }}>
        <ArrowLeft size={14} /> Back to login
      </button>
      <h2 style={cardTitleStyle}>Reset password 🔐</h2>
      <p style={{ color: '#f7c5d066', fontSize: 12, margin: '-12px 0 20px', textAlign: 'center', lineHeight: 1.5 }}>
        Enter your email and we'll send you a reset link
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={lblStyle}>Email address</label>
          <div style={{ position: 'relative' }}>
            <Mail size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#f7c5d066' }} />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="you@yourbusiness.com"
              style={{ ...inpStyle, paddingLeft: 40 }}
            />
          </div>
        </div>
        <button type="submit" disabled={loading || !email.trim()} style={{ ...btnPrimaryStyle, width: '100%', opacity: loading || !email.trim() ? 0.5 : 1 }}>
          {loading ? <><Spinner />&nbsp;Sending…</> : <><Send size={15} />&nbsp;Send Reset Link</>}
        </button>
      </form>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════ */
export default function LoginPage() {
  const { login, loadShop } = useAuth()
  const navigate = useNavigate()
  const logoRef = useRef(null)

  const [mode, setMode] = useState('login')     // 'login' | 'register' | 'forgot'
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [slideDir, setSlideDir] = useState('right') // animation direction

  // ── STEP 1
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [showReferral, setShowReferral] = useState(false)

  // ── STEP 2
  const [bizName, setBizName] = useState('')
  const [bizType, setBizType] = useState('')
  const [bizTypeCustom, setBizTypeCustom] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [bizEmail, setBizEmail] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  // ── STEP 3
  const [selectedCats, setSelectedCats] = useState([])
  const [customCat, setCustomCat] = useState('')

  // ── STEP 4
  const [brandColor, setBrandColor] = useState('#c8456a')
  const [customColor, setCustomColor] = useState('#c8456a')
  const [currency, setCurrency] = useState('KES')
  const [taxRate, setTaxRate] = useState(16)
  const [receiptFooter, setReceiptFooter] = useState('')

  // After registration
  const [newAdminName, setNewAdminName] = useState('')
  const [newBizName, setNewBizName] = useState('')

  const currentBizType = BUSINESS_TYPES.find(b => b.value === bizType)
  const activeBrandColor = brandColor === 'custom' ? customColor : brandColor

  // Ensure spin keyframe exists
  useEffect(() => {
    if (!document.getElementById('st-confetti-style')) {
      const style = document.createElement('style')
      style.id = 'st-confetti-style'
      style.textContent = `
        @keyframes st-spin { to { transform: rotate(360deg); } }
        @keyframes st-slide-in-right { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }
        @keyframes st-slide-in-left  { from { opacity:0; transform:translateX(-30px); } to { opacity:1; transform:translateX(0); } }
        @keyframes st-fade-up { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes st-pulse-ring { 0%,100% { box-shadow: 0 0 0 4px rgba(200,69,106,0.25), 0 4px 14px rgba(200,69,106,0.4); } 50% { box-shadow: 0 0 0 8px rgba(200,69,106,0.1), 0 4px 14px rgba(200,69,106,0.4); } }
        @keyframes st-bounce { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
        @keyframes st-shimmer { 0% { background-position: 0% center; } 100% { background-position: -200% center; } }
        @keyframes st-confetti-fall { 0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg) scale(0.3); opacity: 0; } }
      `
      document.head.appendChild(style)
    }
  }, [])

  const handleLogoFile = (file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error('JPG, PNG or WebP only'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return }
    setLogoFile(file)
    const r = new FileReader()
    r.onload = e => setLogoPreview(e.target.result)
    r.readAsDataURL(file)
  }

  const toggleCat = (cat) => setSelectedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])

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

  const goNext = () => {
    if (!canProceed()) return
    setSlideDir('right')
    setStep(s => s + 1)
  }

  const goBack = () => {
    setSlideDir('left')
    setStep(s => s - 1)
  }

  // ── DEMO LOGIN
  const handleDemoLogin = async () => {
    setLoading(true)
    try {
      await login('demo@salestrack.co.ke', 'demo123456')
      toast.success('Demo mode — explore freely!')
      navigate('/app/dashboard')
    } catch {
      toast.error('Demo account unavailable')
    } finally {
      setLoading(false)
    }
  }

  // ── REAL LOGIN
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      toast.success('Welcome back! 👋')
      navigate('/app/dashboard')
    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  // ── REGISTER (final step)
  const handleRegister = async () => {
    setLoading(true)
    try {
      // 1. Create admin account
      await pb.collection(C.ADMINS).create({
        name, email, password, passwordConfirm: password,
        role: 'owner', is_active: true, business_type: bizType,
      })

      // 2. Login immediately
      await login(email, password)

      // 3. Create shop with all settings
      const slug = bizName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now()
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
      // Auto-generate this shop's unique outbound referral code
      const initials = bizName.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'SHOP'
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
      fd.append('referral_code', `${initials}${rand}`)
      // Subscription fields — 14-day free trial
      fd.append('subscription_status', 'trial')
      const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      fd.append('trial_ends_at', trialEnd.toISOString().replace('T', ' ').replace('Z', '.000Z'))
      if (referralCode.trim()) fd.append('referral_code_used', referralCode.trim().toUpperCase())
      // Track signup attribution — reads UTM param if present, falls back to 'organic'
      const utmSource = new URLSearchParams(window.location.search).get('utm_source') || 'organic'
      fd.append('signup_source', utmSource)
      if (logoFile) fd.append('logo', logoFile)

      const newShop = await pb.collection(C.SHOPS).create(fd)

      // 4. Link admin to shop
      await pb.collection(C.SHOP_ADMINS).create({
        shop_id: newShop.id,
        admin_id: pb.authStore.model.id,
        role: 'owner',
      })

      // 5. Create selected categories
      for (let i = 0; i < selectedCats.length; i++) {
        try {
          await pb.collection(C.CATEGORIES).create({ shop_id: newShop.id, name: selectedCats[i], sort_order: i })
        } catch { /* non-critical */ }
      }

      // 6. Seed demo products so dashboard isn't empty
      const demoProds = DEMO_PRODUCTS[bizType] || DEMO_PRODUCTS.other
      // Get category IDs we just created
      let cats = []
      try {
        const catRes = await pb.collection(C.CATEGORIES).getFullList({ filter: `shop_id = "${newShop.id}"` })
        cats = catRes
      } catch { /* skip */ }

      for (const prod of demoProds) {
        try {
          const catMatch = cats.find(c => {
            const name = c.name.toLowerCase()
            const prodName = prod.name.toLowerCase()
            return prodName.includes(name.split(' ')[0].toLowerCase())
          })
          const payload = {
            shop_id: newShop.id,
            name: prod.name,
            price_kes: prod.selling_price_kes,
            cost_price_kes: prod.cost_price_kes,
            stock_qty: prod.stock_qty,
            unit: UNIT_MAP[prod.unit] || 'piece',
            track_inventory: true,
            status: 'active',
          }
          const catId = catMatch?.id || cats[0]?.id
          if (catId) payload.category_id = catId
          await pb.collection(C.PRODUCTS).create(payload)
        } catch (err) {
          console.error('Demo product failed:', prod.name, err?.data || err?.message || err)
        }
      }

      await loadShop(pb.authStore.model.id)

      // 7. Show celebration
      setNewAdminName(name)
      setNewBizName(bizName)
      toast.success(`${bizName} is live! 🎉`, { duration: 4000 })
      setCelebrate(true)

    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const slideAnim = slideDir === 'right' ? 'st-slide-in-right' : 'st-slide-in-left'

  /* ── RENDER ── */
  if (celebrate) {
    return (
      <PageWrapper>
        <Header />
        <CelebrationScreen
          bizName={newBizName}
          adminName={newAdminName}
          onDone={() => navigate('/app/dashboard')}
        />
        <Footer mode="register" />
      </PageWrapper>
    )
  }

  if (mode === 'forgot') {
    return (
      <PageWrapper>
        <Header />
        <ForgotPasswordView onBack={() => setMode('login')} />
        <Footer mode="login" />
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <Header />

      {/* Mode toggle — only show on login or step 1 */}
      {(mode === 'login' || step === 1) && (
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.08)',
          borderRadius: 12, padding: 4, marginBottom: 24, gap: 4,
        }}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setStep(1) }}
              style={{
                flex: 1, padding: '10px', borderRadius: 9, border: 'none',
                background: mode === m ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent',
                color: mode === m ? '#fff' : '#f7c5d055',
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                transition: 'all 0.2s', fontFamily: 'Nunito,sans-serif',
                boxShadow: mode === m ? '0 3px 12px rgba(200,69,106,0.35)' : 'none',
              }}
            >
              {m === 'login' ? '✦ Sign In' : '🚀 Start Free Trial'}
            </button>
          ))}
        </div>
      )}

      {/* Step bar for registration */}
      {mode === 'register' && <StepBar step={step} />}

      {/* ══ LOGIN ══ */}
      {mode === 'login' && (
        <div style={{ ...card, animation: 'st-fade-up 0.4s ease' }}>
          <h2 style={cardTitleStyle}>Welcome back ✦</h2>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={lblStyle}>Email address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#f7c5d066' }} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@yourbusiness.com" style={{ ...inpStyle, paddingLeft: 40 }} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...lblStyle, marginBottom: 0 }}>Password</label>
                <button type="button" onClick={() => setMode('forgot')} style={{ background: 'none', border: 'none', color: '#c8456a', fontSize: 11, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', fontWeight: 700 }}>
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#f7c5d066' }} />
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={{ ...inpStyle, paddingLeft: 40, paddingRight: 42 }} />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#f7c5d066', display: 'flex' }}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{ ...btnPrimaryStyle, width: '100%', opacity: loading ? 0.7 : 1 }}>
              {loading ? <><Spinner />&nbsp;Signing in…</> : '✦ Sign In'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ color: '#f7c5d044', fontSize: 11 }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
          </div>

          {/* Demo login */}
          <button onClick={handleDemoLogin} disabled={loading} style={{
            width: '100%', padding: '11px', borderRadius: 11, border: '1.5px solid rgba(230,184,0,0.3)',
            background: 'rgba(230,184,0,0.08)', color: '#e6b800', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'Nunito,sans-serif', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 7, transition: 'all 0.2s',
          }}>
            <Sparkles size={15} /> Try Demo Account
          </button>
          <p style={{ textAlign: 'center', color: '#f7c5d033', fontSize: 10, margin: '6px 0 0', letterSpacing: '0.02em' }}>
            demo@salestrack.co.ke · demo123456
          </p>

          <p style={{ textAlign: 'center', color: '#f7c5d044', fontSize: 11, marginTop: 16, marginBottom: 0 }}>
            New here?{' '}
            <button onClick={() => setMode('register')} style={{ background: 'none', border: 'none', color: '#c8456a', cursor: 'pointer', fontWeight: 700, fontSize: 11, fontFamily: 'Nunito,sans-serif' }}>
              Start your 14-day free trial →
            </button>
          </p>
        </div>
      )}

      {/* ══ STEP 1 — Account ══ */}
      {mode === 'register' && step === 1 && (
        <div style={{ ...card, animation: `${slideAnim} 0.35s ease` }}>
          <h2 style={cardTitleStyle}>Create your account 👤</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lblStyle}>Your full name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Wanjiku" style={inpStyle} autoComplete="name" />
            </div>
            <div>
              <label style={lblStyle}>Email address *</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#f7c5d066' }} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@business.com" style={{ ...inpStyle, paddingLeft: 40 }} autoComplete="email" />
              </div>
            </div>
            <div>
              <label style={lblStyle}>Password * (min. 8 characters)</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#f7c5d066' }} />
                <input
                  type={showPwd ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} minLength={8}
                  placeholder="Min. 8 characters"
                  style={{ ...inpStyle, paddingLeft: 40, paddingRight: 42 }}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#f7c5d066', display: 'flex' }}>
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {password && (
                <div style={{ marginTop: 7 }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                    {[...Array(4)].map((_, i) => (
                      <div key={i} style={{
                        flex: 1, height: 3, borderRadius: 3,
                        background: i < pwdStrength(password)
                          ? ['#dc2626', '#f59e0b', '#3b82f6', '#059669'][pwdStrength(password) - 1]
                          : 'rgba(255,255,255,0.1)',
                        transition: 'all 0.2s',
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: ['#dc2626', '#f59e0b', '#3b82f6', '#059669'][pwdStrength(password) - 1] }}>
                    {['', 'Weak — add numbers & symbols', 'Fair — getting better', 'Good password', 'Strong password ✓'][pwdStrength(password)]}
                  </div>
                </div>
              )}
            </div>

            {/* Referral code — collapsible */}
            <div>
              {!showReferral ? (
                <button type="button" onClick={() => setShowReferral(true)} style={{ background: 'none', border: 'none', color: '#e6b800', fontSize: 11, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}>
                  <Gift size={13} /> Have a referral code? (get 1 month free)
                </button>
              ) : (
                <div style={{ animation: 'st-fade-up 0.3s ease' }}>
                  <label style={lblStyle}>Referral code</label>
                  <input
                    type="text" value={referralCode}
                    onChange={e => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="e.g. JANE2024"
                    style={{ ...inpStyle, letterSpacing: '0.1em', fontFamily: 'monospace', fontWeight: 700 }}
                    autoComplete="off"
                  />
                  <div style={{ fontSize: 10, color: '#86efac', marginTop: 4 }}>🎁 1 free month added if code is valid after trial</div>
                </div>
              )}
            </div>

            <button
              onClick={goNext}
              disabled={!canProceed()}
              style={{ ...btnPrimaryStyle, width: '100%', opacity: canProceed() ? 1 : 0.45 }}
            >
              Continue <ChevronRight size={16} />
            </button>

            <p style={{ textAlign: 'center', color: '#f7c5d044', fontSize: 11, margin: 0 }}>
              Already have an account?{' '}
              <button onClick={() => setMode('login')} style={{ background: 'none', border: 'none', color: '#c8456a', cursor: 'pointer', fontWeight: 700, fontSize: 11, fontFamily: 'Nunito,sans-serif' }}>
                Sign in →
              </button>
            </p>
          </div>
        </div>
      )}

      {/* ══ STEP 2 — Business ══ */}
      {mode === 'register' && step === 2 && (
        <div style={{ ...card, animation: `${slideAnim} 0.35s ease` }}>
          <h2 style={cardTitleStyle}>Your business 🏪</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={lblStyle}>Business name *</label>
              <input type="text" value={bizName} onChange={e => setBizName(e.target.value)} placeholder="e.g. Glam Studio Nairobi" style={inpStyle} />
            </div>

            <div>
              <label style={lblStyle}>What type of business? *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {BUSINESS_TYPES.map(bt => (
                  <button key={bt.value} type="button" onClick={() => handleBizType(bt.value)} style={{
                    padding: '10px 4px', borderRadius: 10, border: '1.5px solid',
                    borderColor: bizType === bt.value ? '#c8456a' : 'rgba(255,255,255,0.1)',
                    background: bizType === bt.value ? 'rgba(200,69,106,0.2)' : 'rgba(255,255,255,0.04)',
                    color: '#fce8ed', cursor: 'pointer', textAlign: 'center',
                    transition: 'all 0.2s',
                    boxShadow: bizType === bt.value ? '0 0 0 2px rgba(200,69,106,0.3), 0 4px 12px rgba(200,69,106,0.2)' : 'none',
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 3 }}>{bt.emoji}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.2, color: bizType === bt.value ? '#fce8ed' : '#f7c5d077' }}>
                      {bt.label}
                    </div>
                  </button>
                ))}
              </div>
              {bizType === 'other' && (
                <input type="text" value={bizTypeCustom} onChange={e => setBizTypeCustom(e.target.value)} placeholder="Describe your business…" style={{ ...inpStyle, marginTop: 8 }} />
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblStyle}>Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+254 7xx xxx xxx" style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Business email</label>
                <input type="email" value={bizEmail} onChange={e => setBizEmail(e.target.value)} placeholder="biz@email.com" style={inpStyle} />
              </div>
            </div>

            <div>
              <label style={lblStyle}>Business address / Location</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. Westlands, Nairobi" style={inpStyle} />
            </div>

            {/* Logo upload */}
            <div>
              <label style={lblStyle}>Business logo — on all receipts (optional)</label>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleLogoFile(e.dataTransfer.files[0]) }}
                onClick={() => logoRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#c8456a' : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 12, padding: '16px', textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? 'rgba(200,69,106,0.08)' : 'rgba(255,255,255,0.03)',
                  transition: 'all 0.2s', minHeight: 70,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {logoPreview ? (
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <img src={logoPreview} alt="logo" style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 8, background: 'rgba(255,255,255,0.1)' }} />
                    <div>
                      <div style={{ fontSize: 11, color: '#fce8ed', fontWeight: 700 }}>Logo uploaded ✓</div>
                      <div style={{ fontSize: 10, color: '#f7c5d055' }}>Tap to change</div>
                    </div>
                    <button type="button" onClick={e => { e.stopPropagation(); setLogoFile(null); setLogoPreview(null) }} style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, borderRadius: '50%', background: '#dc2626', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload size={20} color="rgba(252,232,237,0.3)" style={{ margin: '0 auto 6px' }} />
                    <div style={{ fontSize: 11, color: '#f7c5d055', fontWeight: 600 }}>Drop logo or tap to upload</div>
                    <div style={{ fontSize: 10, color: '#f7c5d033', marginTop: 2 }}>JPG · PNG · WebP · Max 5MB</div>
                  </div>
                )}
              </div>
              <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => handleLogoFile(e.target.files[0])} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={goBack} style={btnBackStyle}><ChevronLeft size={15} /> Back</button>
              <button type="button" onClick={goNext} disabled={!canProceed()} style={{ ...btnPrimaryStyle, flex: 2, opacity: canProceed() ? 1 : 0.45 }}>
                Continue <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ STEP 3 — Categories ══ */}
      {mode === 'register' && step === 3 && (
        <div style={{ ...card, animation: `${slideAnim} 0.35s ease` }}>
          <h2 style={cardTitleStyle}>Your categories 🏷️</h2>
          <p style={{ color: '#f7c5d055', fontSize: 12, marginBottom: 16, textAlign: 'center', margin: '-12px 0 16px' }}>
            Pre-selected for <strong style={{ color: '#fce8ed' }}>{currentBizType?.label}</strong>. Tap to add or remove.
          </p>

          {/* Preset categories */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
            {(currentBizType?.categories || []).map(cat => {
              const sel = selectedCats.includes(cat)
              return (
                <button key={cat} type="button" onClick={() => toggleCat(cat)} style={{
                  padding: '7px 14px', borderRadius: 20, border: '1.5px solid',
                  borderColor: sel ? '#c8456a' : 'rgba(255,255,255,0.12)',
                  background: sel ? 'rgba(200,69,106,0.18)' : 'rgba(255,255,255,0.04)',
                  color: sel ? '#fce8ed' : '#f7c5d066', fontSize: 12,
                  fontWeight: sel ? 700 : 400, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.15s',
                  boxShadow: sel ? '0 2px 8px rgba(200,69,106,0.2)' : 'none',
                }}>
                  {sel && <Check size={11} />}{cat}
                </button>
              )
            })}
          </div>

          {/* Custom categories */}
          {selectedCats.filter(c => !currentBizType?.categories.includes(c)).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: '#f7c5d044', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Custom</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selectedCats.filter(c => !currentBizType?.categories.includes(c)).map(cat => (
                  <div key={cat} style={{ padding: '5px 11px', borderRadius: 20, background: 'rgba(230,184,0,0.12)', border: '1.5px solid rgba(230,184,0,0.25)', color: '#e6b800', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {cat}
                    <button type="button" onClick={() => toggleCat(cat)} style={{ background: 'none', border: 'none', color: '#e6b800', cursor: 'pointer', padding: 0, display: 'flex' }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add custom */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
            <input
              type="text" value={customCat}
              onChange={e => setCustomCat(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomCat())}
              placeholder="Add custom… e.g. Wigs, Juice Bar, Threading"
              style={{ ...inpStyle, flex: 1, fontSize: 12 }}
            />
            <button type="button" onClick={addCustomCat} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: 'rgba(230,184,0,0.15)', color: '#e6b800', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 12, fontFamily: 'Nunito,sans-serif', flexShrink: 0 }}>
              <Plus size={14} /> Add
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#f7c5d033', marginBottom: 18 }}>
            {selectedCats.length} {selectedCats.length === 1 ? 'category' : 'categories'} selected · Add more anytime in the app
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={goBack} style={btnBackStyle}><ChevronLeft size={15} /> Back</button>
            <button type="button" onClick={goNext} disabled={!canProceed()} style={{ ...btnPrimaryStyle, flex: 2, opacity: canProceed() ? 1 : 0.45 }}>
              Continue <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* ══ STEP 4 — Brand ══ */}
      {mode === 'register' && step === 4 && (
        <div style={{ ...card, animation: `${slideAnim} 0.35s ease` }}>
          <h2 style={cardTitleStyle}>Make it yours 🎨</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Brand color */}
            <div>
              <label style={lblStyle}>Brand color — used on receipts & your booking page</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {BRAND_COLORS.map(bc => (
                  <button key={bc.value} type="button" onClick={() => setBrandColor(bc.value)} title={bc.label} style={{
                    width: 34, height: 34, borderRadius: '50%', border: '3px solid',
                    borderColor: brandColor === bc.value ? '#fff' : 'transparent',
                    background: bc.value === 'custom' ? 'linear-gradient(135deg,#ff0080,#7928ca,#0070f3)' : bc.value,
                    cursor: 'pointer', transition: 'all 0.15s',
                    boxShadow: brandColor === bc.value ? '0 0 0 3px rgba(255,255,255,0.3)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {brandColor === bc.value && <Check size={14} color="#fff" />}
                  </button>
                ))}
              </div>
              {brandColor === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)} style={{ width: 42, height: 42, borderRadius: 8, border: '2px solid rgba(255,255,255,0.2)', cursor: 'pointer', padding: 2, background: 'none', flexShrink: 0 }} />
                  <input type="text" value={customColor} onChange={e => setCustomColor(e.target.value)} placeholder="#c8456a" style={{ ...inpStyle, fontFamily: 'monospace', fontSize: 13 }} />
                </div>
              )}

              {/* Live receipt preview */}
              <div style={{ background: activeBrandColor, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.3s' }}>
                {logoPreview
                  ? <img src={logoPreview} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.9)', padding: 2 }} />
                  : <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{currentBizType?.emoji || '🏪'}</div>
                }
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{bizName || 'Your Business'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>Receipt header preview</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>KES 1,250</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 9 }}>Sample receipt</div>
                </div>
              </div>
            </div>

            {/* Currency & Tax */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lblStyle}>Currency</label>
                <select value={currency} onChange={e => setCurrency(e.target.value)} style={inpStyle}>
                  <option value="KES">KES — Kenya Shilling</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="GBP">GBP — British Pound</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </div>
              <div>
                <label style={lblStyle}>VAT / Tax rate (%)</label>
                <input type="number" min={0} max={100} step={0.5} value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} style={inpStyle} />
              </div>
            </div>

            {/* Receipt footer */}
            <div>
              <label style={lblStyle}>Receipt footer message</label>
              <input type="text" value={receiptFooter} onChange={e => setReceiptFooter(e.target.value)} placeholder={`Thank you for visiting ${bizName || 'your business'}! 🙏`} style={inpStyle} />
              <div style={{ fontSize: 10, color: '#f7c5d033', marginTop: 3 }}>Printed at the bottom of every receipt</div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={goBack} style={btnBackStyle}><ChevronLeft size={15} /> Back</button>
              <button type="button" onClick={handleRegister} disabled={loading} style={{ ...btnPrimaryStyle, flex: 2, opacity: loading ? 0.7 : 1 }}>
                {loading
                  ? <><Spinner />&nbsp;Setting up your business…</>
                  : '🎉 Launch My Business!'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer mode={mode} />
    </PageWrapper>
  )
}

/* ═══════════════════════════════════════════════
   LAYOUT COMPONENTS
═══════════════════════════════════════════════ */
function PageWrapper({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg,#0d0508 0%,#2a0b18 40%,#4a1228 70%,#6b1e38 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))', position: 'relative', overflow: 'hidden',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {/* Ambient orbs */}
      {[
        { w: 280, h: 280, bg: '#c8456a', op: 0.07, top: '8%',  left: '65%' },
        { w: 180, h: 180, bg: '#e6b800', op: 0.05, top: '60%', left: '5%'  },
        { w: 350, h: 350, bg: '#8b2550', op: 0.06, top: '-5%', left: '15%' },
      ].map((orb, i) => (
        <div key={i} style={{ position: 'absolute', width: orb.w, height: orb.h, borderRadius: '50%', background: orb.bg, opacity: orb.op, top: orb.top, left: orb.left, filter: 'blur(70px)', pointerEvents: 'none' }} />
      ))}

      <div style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}

function Header() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 20 }}>
      <div style={{
        width: 54, height: 54,
        background: 'linear-gradient(135deg,#e6b800,#c8456a)',
        borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 28px rgba(200,69,106,0.45)', marginBottom: 10,
      }}>
        <TrendingUp size={26} color="#fff" />
      </div>
      <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
        SalesTrack
      </h1>
      <p style={{ color: '#f7c5d055', fontSize: 11, marginTop: 4 }}>
        Run your business from your phone 📱
      </p>
    </div>
  )
}

function Footer({ mode }) {
  return (
    <p style={{ textAlign: 'center', color: '#f7c5d022', fontSize: 10, marginTop: 16 }}>
      {mode === 'register'
        ? '🔒 256-bit encrypted · Cancel anytime · Kenya data centres'
        : 'SalesTrack v2.0 · Africa\'s #1 Business POS · © 2025'}
    </p>
  )
}

/* ═══════════════════════════════════════════════
   SHARED STYLE TOKENS
═══════════════════════════════════════════════ */
const card = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20,
  padding: '24px 20px',
  boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
}

const cardTitleStyle = {
  fontFamily: 'Playfair Display,serif',
  color: '#fce8ed', fontSize: 18,
  margin: '0 0 20px', textAlign: 'center',
}

const lblStyle = {
  display: 'block', fontSize: 10, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  color: '#f7c5d088', marginBottom: 6,
}

const inpStyle = {
  width: '100%', padding: '11px 13px', borderRadius: 10,
  border: '1.5px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.07)',
  color: '#fce8ed', fontSize: 14,
  fontFamily: 'Nunito,sans-serif', outline: 'none',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
  transition: 'border-color 0.2s',
}

const btnPrimaryStyle = {
  padding: '13px 18px',
  borderRadius: 12, border: 'none',
  background: 'linear-gradient(135deg,#c8456a,#8b2550)',
  color: '#fff', fontWeight: 700, fontSize: 14,
  cursor: 'pointer', fontFamily: 'Nunito,sans-serif',
  boxShadow: '0 5px 20px rgba(200,69,106,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  transition: 'all 0.2s',
  WebkitTapHighlightColor: 'transparent',
  minHeight: 48, // accessibility — minimum touch target
}

const btnBackStyle = {
  padding: '13px 14px', borderRadius: 12, flex: 1,
  background: 'rgba(255,255,255,0.05)',
  color: '#f7c5d055', border: '1px solid rgba(255,255,255,0.1)',
  fontWeight: 700, fontSize: 13, cursor: 'pointer',
  fontFamily: 'Nunito,sans-serif',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
  WebkitTapHighlightColor: 'transparent',
  minHeight: 48,
}