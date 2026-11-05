import { useState, useRef, useEffect } from 'react'
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
// UNVERIFIED paths: confirm the file names inside beautyshop/public/legal/
const LEGAL = { terms: '/legal/terms.html', privacy: '/legal/privacy.html' }

const BUSINESS_TYPES = [
  { value: 'salon',       label: 'Salon & Spa',          emoji: '💇', categories: ['Hair', 'Nails', 'Skin', 'Lashes', 'Makeup', 'Body Treatments', 'Waxing'] },
  { value: 'retail',      label: 'Retail Shop',          emoji: '🛒', categories: ['Electronics', 'Clothing', 'Food & Grocery', 'General Merchandise', 'Accessories'] },
  { value: 'restaurant',  label: 'Restaurant & Café',    emoji: '☕', categories: ['Food', 'Beverages', 'Desserts', 'Alcohol', 'Snacks', 'Specials'] },
  { value: 'pharmacy',    label: 'Pharmacy & Clinic',    emoji: '💊', categories: ['Prescription', 'OTC Medicines', 'Cosmetics', 'Medical Equipment', 'Vitamins'] },
  { value: 'boutique',    label: 'Boutique & Fashion',   emoji: '👗', categories: ['Ladies Wear', 'Mens Wear', 'Kids Wear', 'Accessories', 'Shoes', 'Bags'] },
  { value: 'hardware',    label: 'Hardware & Auto',      emoji: '🔧', categories: ['Building Materials', 'Electrical', 'Plumbing', 'Tools', 'Auto Parts', 'Paint'] },
  { value: 'beauty',      label: 'Beauty Supply',        emoji: '💄', categories: ['Skincare', 'Haircare', 'Makeup', 'Fragrance', 'Tools & Accessories', 'Wigs'] },
  { value: 'electronics', label: 'Phone & Electronics',  emoji: '📱', categories: ['Smartphones', 'Feature Phones', 'Chargers & Cables', 'Cases & Screen Protectors', 'Earphones & Headphones', 'Power Banks', 'Memory & Storage', 'Smartwatches & Bands', 'Phone Accessories', 'Laptops & Tablets', 'Repairs & Services'] },
  { value: 'agrovet',     label: 'Agrovet & Farm Supply', emoji: '🌾', categories: ['Fertilizers', 'Seeds', 'Pesticides & Herbicides', 'Animal Feed', 'Veterinary Supplies', 'Farm Tools'] },
  { value: 'other',       label: 'Other Business',       emoji: '🏪', categories: ['Products', 'Services', 'General'] },
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
  { label: 'Custom',        value: 'custom' },
]

const UNIT_MAP = {
  bottle: 'piece', tube: 'piece', jar: 'piece', strip: 'piece',
  capsule: 'piece', sachet: 'piece', pair: 'piece', tin: 'piece',
  plate: 'service', cup: 'piece', packet: 'piece', sheet: 'piece',
  bag: 'piece', metre: 'piece', piece: 'piece', kg: 'kg',
  ml: 'ml', g: 'g', litre: 'litre', box: 'box', set: 'set',
  dozen: 'dozen', service: 'service',
}

// Demo products seeded per business type so the dashboard isn't empty on day 1
const p = (name, selling_price_kes, cost_price_kes, stock_qty, unit) =>
  ({ name, selling_price_kes, cost_price_kes, stock_qty, unit })

const DEMO_PRODUCTS = {
  salon: [
    p('Hair Relaxer (Small)', 1500, 600, 20, 'piece'),
    p('Shampoo 500ml', 850, 300, 30, 'bottle'),
    p('Hair Treatment Mask', 1200, 450, 15, 'piece'),
    p('Nail Polish (per colour)', 400, 120, 50, 'piece'),
    p('Body Lotion 400ml', 950, 350, 25, 'bottle'),
  ],
  retail: [
    p('Mineral Water 500ml', 60, 30, 200, 'bottle'),
    p('Bread (White Loaf)', 65, 48, 50, 'piece'),
    p('Cooking Oil 1L', 280, 200, 40, 'bottle'),
    p('Sugar 2kg', 260, 190, 60, 'packet'),
    p('Milk 500ml', 70, 50, 80, 'packet'),
  ],
  restaurant: [
    p('Pilau (Full)', 350, 120, 100, 'plate'),
    p('Chai Maziwa', 50, 15, 200, 'cup'),
    p('Chapati', 30, 10, 150, 'piece'),
    p('Soda 300ml', 80, 55, 100, 'bottle'),
    p('Beef Stew', 250, 100, 80, 'plate'),
  ],
  pharmacy: [
    p('Paracetamol 500mg (Strip)', 30, 15, 200, 'strip'),
    p('Amoxicillin 250mg (Cap)', 15, 8, 300, 'capsule'),
    p('Malaria Test Kit', 150, 80, 50, 'kit'),
    p('ORS Sachet', 20, 8, 200, 'sachet'),
    p('Vaseline 250ml', 120, 60, 40, 'jar'),
  ],
  boutique: [
    p('Ladies Dress (Casual)', 1800, 800, 15, 'piece'),
    p('Mens Polo Shirt', 1200, 500, 20, 'piece'),
    p('Kids T-Shirt', 600, 250, 30, 'piece'),
    p('Ladies Handbag', 2500, 1000, 10, 'piece'),
    p('Canvas Shoes', 1500, 600, 25, 'pair'),
  ],
  hardware: [
    p('Cement (50kg Bag)', 680, 550, 100, 'bag'),
    p('Iron Sheet (Gauge 30)', 850, 650, 200, 'sheet'),
    p('Electrical Wire (1m)', 45, 25, 500, 'metre'),
    p('Paint Emulsion 4L', 1400, 950, 30, 'tin'),
    p('Nails 4" (1kg)', 180, 120, 80, 'kg'),
  ],
  beauty: [
    p('Aloe Vera Gel 200ml', 450, 180, 40, 'bottle'),
    p('Lace Front Wig (Short)', 4500, 2000, 10, 'piece'),
    p('Mascara', 650, 250, 30, 'piece'),
    p('Foundation (Medium)', 1200, 450, 20, 'bottle'),
    p('Lip Gloss', 350, 120, 50, 'piece'),
  ],
  electronics: [
    p('Samsung Galaxy A15 128GB', 21999, 17500, 10, 'piece'),
    p('Infinix Hot 40i 128GB', 14999, 11500, 8, 'piece'),
    p('USB-C Charging Cable 1m', 350, 120, 50, 'piece'),
    p('Phone Case (Universal)', 500, 150, 30, 'piece'),
    p('Screen Replacement - Samsung (Service)', 3500, 800, 999, 'service'),
  ],
  agrovet: [
    p('Fertilizers DAP 50kg', 3800, 3200, 40, 'bag'),
    p('Fertilizers CAN 50kg', 3200, 2700, 35, 'bag'),
    p('Seeds Hybrid Maize 2kg', 950, 700, 60, 'packet'),
    p('Pesticides Roundup Herbicide 1L', 850, 600, 30, 'bottle'),
    p('Animal Dairy Meal 70kg', 2900, 2450, 25, 'bag'),
    p('Veterinary Dewormer for Cattle', 650, 420, 20, 'bottle'),
  ],
  other: [
    p('Sample Product 1', 500, 200, 50, 'piece'),
    p('Sample Product 2', 750, 300, 20, 'piece'),
    p('Sample Product 3', 1000, 400, 20, 'piece'),
  ],
}

/* ═══════════════════════════════════════════════
   STYLES (colour tokens, one global <style> block)
═══════════════════════════════════════════════ */
const T = {
  text: '#fce8ed', muted: '#e4bcc7', faint: '#c7a1ac',
  link: '#f08ca7', gold: '#e6b800', green: '#86efac', danger: '#fca5a5',
}

const CSS = `
@keyframes st-spin { to { transform: rotate(360deg); } }
@keyframes st-slide-in-right { from { opacity:0; transform:translateX(30px); } to { opacity:1; transform:translateX(0); } }
@keyframes st-slide-in-left  { from { opacity:0; transform:translateX(-30px); } to { opacity:1; transform:translateX(0); } }
@keyframes st-fade-up { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
@keyframes st-bounce { 0%,100% { transform:scale(1); } 50% { transform:scale(1.15); } }
@keyframes st-confetti-fall { 0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg) scale(0.3); opacity: 0; } }
.st-page input::placeholder { color: rgba(247,197,208,0.5); }
.st-page a, .st-page button, .st-page input, .st-page select, .st-page [role="button"] { -webkit-tap-highlight-color: transparent; }
.st-page :focus-visible { outline: 2px solid #e6b800; outline-offset: 2px; }
.st-page button:disabled { cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) {
  .st-page *, .st-page *::before, .st-page *::after { animation: none !important; transition: none !important; }
}
`

const card = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20, padding: '24px 20px',
  boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
}
const cardTitleStyle = { fontFamily: 'Playfair Display,serif', color: T.text, fontSize: 20, margin: '0 0 20px', textAlign: 'center' }
const lblStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }
const inpStyle = {
  width: '100%', padding: '12px 13px', borderRadius: 10,
  border: '1.5px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.07)',
  color: T.text, fontSize: 16, // 16px stops iOS zooming into the field
  fontFamily: 'Nunito,sans-serif', outline: 'none', boxSizing: 'border-box',
  WebkitAppearance: 'none', transition: 'border-color 0.2s', minHeight: 46,
}
const selStyle = { ...inpStyle, WebkitAppearance: 'menulist', appearance: 'auto', colorScheme: 'dark' }
const iconStyle = { position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: T.faint, pointerEvents: 'none' }
const btnPrimaryStyle = {
  padding: '13px 18px', borderRadius: 12, border: 'none',
  background: 'linear-gradient(135deg,#c8456a,#8b2550)',
  color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Nunito,sans-serif',
  boxShadow: '0 5px 20px rgba(200,69,106,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  transition: 'all 0.2s', minHeight: 48, textDecoration: 'none', boxSizing: 'border-box',
}
const btnBackStyle = {
  padding: '13px 14px', borderRadius: 12, flex: 1,
  background: 'rgba(255,255,255,0.05)', color: T.muted, border: '1px solid rgba(255,255,255,0.15)',
  fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito,sans-serif',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 48,
}
const linkBtn = {
  background: 'none', border: 'none', color: T.link, cursor: 'pointer', fontWeight: 700,
  fontSize: 13, fontFamily: 'Nunito,sans-serif', padding: '8px 4px', minHeight: 36,
}
const noteStyle = { textAlign: 'center', color: T.faint, fontSize: 13, margin: 0 }

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

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
    <div aria-hidden="true" style={{
      width: size, height: size, border: `2px solid ${color}33`, borderTop: `2px solid ${color}`,
      borderRadius: '50%', animation: 'st-spin 0.7s linear infinite', flexShrink: 0,
    }} />
  )
}

// Lightweight confetti, no extra package. Skipped for people who prefer reduced motion.
function fireConfetti() {
  if (prefersReducedMotion()) return
  const colors = ['#c8456a', '#e6b800', '#059669', '#2563eb', '#7c3aed', '#ea580c', '#fff']
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;overflow:hidden'
  document.body.appendChild(container)
  for (let i = 0; i < 120; i++) {
    const el = document.createElement('div')
    const size = Math.random() * 8 + 4
    el.style.cssText = `position:absolute;width:${size}px;height:${size}px;` +
      `background:${colors[Math.floor(Math.random() * colors.length)]};` +
      `border-radius:${Math.random() > 0.5 ? '50%' : '2px'};left:${Math.random() * 100}%;top:-10px;` +
      `animation:st-confetti-fall ${Math.random() * 2 + 2}s ${Math.random() * 0.8}s ease-in forwards;`
    container.appendChild(el)
  }
  setTimeout(() => { if (container.parentNode) container.parentNode.removeChild(container) }, 4000)
}

function PwdToggle({ shown, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}
      style={{ position: 'absolute', right: 3, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, background: 'none', border: 'none', cursor: 'pointer', color: T.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {shown ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
    </button>
  )
}

// Label linked to its input; optional icon, right-aligned label extra and hint line
function Field({ id, label, icon: Icon, aside, hint, children }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label htmlFor={id} style={{ ...lblStyle, marginBottom: 0 }}>{label}</label>
        {aside}
      </div>
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={15} aria-hidden="true" style={iconStyle} />}
        {children}
      </div>
      {hint}
    </div>
  )
}

function FormError({ message, children }) {
  if (!message) return null
  return (
    <div role="alert" style={{ background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(252,165,165,0.45)', color: T.danger, borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 }}>
      {message}{children}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   STEP PROGRESS BAR
═══════════════════════════════════════════════ */
function StepBar({ step }) {
  const steps = [
    { label: 'Account', icon: '👤' }, { label: 'Business', icon: '🏪' },
    { label: 'Categories', icon: '🏷️' }, { label: 'Brand', icon: '🎨' },
  ]
  return (
    <div style={{ marginBottom: 24 }} role="group" aria-label={`Sign-up progress: step ${step} of 4`}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ position: 'absolute', left: 15, right: 15, top: 15, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 3, zIndex: 0 }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg,#c8456a,#e6b800)', borderRadius: 3, width: `${((step - 1) / 3) * 100}%`, transition: 'width 0.5s ease' }} />
        </div>
        {steps.map((s, i) => {
          const num = i + 1
          const done = step > num
          const active = step === num
          return (
            <div key={num} aria-current={active ? 'step' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 1 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: done ? '#059669' : active ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'rgba(30,10,20,0.9)',
                border: done || active ? 'none' : '2px solid rgba(255,255,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                boxShadow: active ? '0 0 0 4px rgba(200,69,106,0.25), 0 4px 14px rgba(200,69,106,0.4)' : 'none',
                transition: 'all 0.3s',
              }}>
                {done ? <Check size={14} aria-label="Done" /> : <span aria-hidden="true" style={{ fontSize: 12 }}>{s.icon}</span>}
              </div>
              <div style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? T.text : done ? T.green : T.faint, whiteSpace: 'nowrap' }}>
                {s.label}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', background: 'rgba(5,150,105,0.15)', border: '1px solid rgba(5,150,105,0.35)', borderRadius: 20, fontSize: 12, color: T.green, fontWeight: 700 }}>
          7-day free trial · No card required
        </span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   CELEBRATION SCREEN
═══════════════════════════════════════════════ */
function CelebrationScreen({ bizName, adminName, seeded, onDone }) {
  useEffect(() => {
    fireConfetti()
    const t = setTimeout(fireConfetti, 1200)
    return () => clearTimeout(t)
  }, [])

  const msg = `🎉 My shop *${bizName}* is now live on SalesTrack!\n\nI can now manage sales, inventory & staff right from my phone 📱\n\nTry it free for 7 days 👉 https://getsalestrack.vercel.app`

  return (
    <div style={{ ...card, textAlign: 'center', padding: '40px 24px', animation: 'st-fade-up 0.5s ease' }}>
      <div aria-hidden="true" style={{ fontSize: 64, marginBottom: 8, animation: 'st-bounce 0.6s ease 0.3s both', display: 'inline-block' }}>🎉</div>
      <h2 style={{ fontFamily: 'Playfair Display, serif', color: T.text, fontSize: 24, margin: '0 0 8px', lineHeight: 1.3 }}>
        You're all set, {adminName?.split(' ')[0] || 'Boss'}!
      </h2>
      <p style={{ color: T.muted, fontSize: 15, margin: '0 0 6px', lineHeight: 1.6 }}>
        <strong style={{ color: T.text }}>{bizName}</strong> is live on SalesTrack.
      </p>
      <p style={{ color: T.muted, fontSize: 14, margin: '0 0 24px', lineHeight: 1.6 }}>
        Your 7-day free trial has started.{' '}
        {seeded.products > 0
          ? 'Sample products were added so you can start selling straight away.'
          : 'Add your first products in Inventory to start selling.'}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
        {[{ icon: '🛒', label: 'Make your first sale' }, { icon: '📦', label: 'Add your inventory' }, { icon: '👥', label: 'Add your staff' }].map(item => (
          <div key={item.label} style={{ padding: '12px 6px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div aria-hidden="true" style={{ fontSize: 22, marginBottom: 4 }}>{item.icon}</div>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, lineHeight: 1.3 }}>{item.label}</div>
          </div>
        ))}
      </div>

      <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer"
        style={{ ...btnPrimaryStyle, width: '100%', marginBottom: 10, background: 'rgba(37,211,102,0.15)', color: '#4ade80', boxShadow: 'none', border: '1.5px solid rgba(37,211,102,0.35)', fontSize: 14 }}>
        Share on WhatsApp
      </a>
      <button type="button" onClick={onDone} style={{ ...btnPrimaryStyle, width: '100%', background: 'linear-gradient(135deg,#e6b800,#c8456a)', boxShadow: '0 6px 24px rgba(230,184,0,0.35)', fontSize: 16 }}>
        Open my dashboard
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   FORGOT PASSWORD
═══════════════════════════════════════════════ */
function ForgotPasswordView({ onBack }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || loading) return
    setLoading(true)
    try {
      await pb.collection(C.ADMINS).requestPasswordReset(email.trim())
    } catch {
      // Always show success to prevent email enumeration
    } finally {
      setSent(true)
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '32px 24px', animation: 'st-fade-up 0.4s ease' }}>
        <div aria-hidden="true" style={{ fontSize: 52, marginBottom: 12 }}>📬</div>
        <h2 style={{ ...cardTitleStyle, margin: '0 0 10px' }}>Check your email</h2>
        <p style={{ color: T.muted, fontSize: 14, margin: '0 0 6px', lineHeight: 1.6 }}>
          If an account exists for <strong style={{ color: T.text }}>{email}</strong>, a reset link has been sent.
        </p>
        <p style={{ color: T.faint, fontSize: 13, margin: '0 0 24px' }}>Check your spam folder if you don't see it.</p>
        <button type="button" onClick={onBack} style={{ ...btnPrimaryStyle, width: '100%' }}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div style={{ ...card, animation: 'st-slide-in-right 0.3s ease' }}>
      <button type="button" onClick={onBack} style={{ ...linkBtn, color: T.muted, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 12 }}>
        <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
      </button>
      <h2 style={cardTitleStyle}>Reset password</h2>
      <p style={{ color: T.muted, fontSize: 14, margin: '-8px 0 20px', textAlign: 'center', lineHeight: 1.5 }}>
        Enter your email and we'll send you a reset link.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field id="forgot-email" label="Email address" icon={Mail}>
          <input id="forgot-email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            required autoComplete="email" placeholder="you@yourbusiness.com" style={{ ...inpStyle, paddingLeft: 40 }} />
        </Field>
        <button type="submit" disabled={loading || !email.trim()} style={{ ...btnPrimaryStyle, width: '100%', opacity: loading || !email.trim() ? 0.5 : 1 }}>
          {loading ? <><Spinner />&nbsp;Sending…</> : <><Send size={15} aria-hidden="true" />&nbsp;Send reset link</>}
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

  const params = new URLSearchParams(window.location.search)
  const startTrialFromUrl = params.get('start') === 'trial'
  const [mode, setMode] = useState(startTrialFromUrl ? 'register' : 'login') // 'login' | 'register' | 'forgot'
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const [slideDir, setSlideDir] = useState('right')
  const [error, setError] = useState('')

  // Step 1
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [showReferral, setShowReferral] = useState(false)
  // Step 2
  const [bizName, setBizName] = useState('')
  const [bizType, setBizType] = useState('')
  const [bizTypeCustom, setBizTypeCustom] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [bizEmail, setBizEmail] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  // Step 3
  const [selectedCats, setSelectedCats] = useState([])
  const [customCat, setCustomCat] = useState('')
  // Step 4
  const [brandColor, setBrandColor] = useState('#c8456a')
  const [customColor, setCustomColor] = useState('#c8456a')
  const [currency, setCurrency] = useState('KES')
  const [taxRate, setTaxRate] = useState(16)
  const [receiptFooter, setReceiptFooter] = useState('')
  // After registration
  const [newAdminName, setNewAdminName] = useState('')
  const [newBizName, setNewBizName] = useState('')
  const [seeded, setSeeded] = useState({ products: 0, categories: 0 })

  // Proof of arriving via the landing page's validated lead-capture form
  const cameFromLandingPage = params.get('demo') === '1'
  const [autoDemoTried, setAutoDemoTried] = useState(false)

  const currentBizType = BUSINESS_TYPES.find(b => b.value === bizType)
  const activeBrandColor = brandColor === 'custom' ? customColor : brandColor
  const customCats = selectedCats.filter(c => !currentBizType?.categories.includes(c))

  // Auto-login to the demo account when arriving from the landing page's lead form.
  // The "Try Demo Account" button stays as a manual fallback.
  useEffect(() => {
    if (cameFromLandingPage && !autoDemoTried && mode === 'login') {
      setAutoDemoTried(true)
      ;(async () => {
        setLoading(true)
        try {
          await login('demo@salestrack.co.ke', 'demo123456')
          toast.success('Demo mode — explore freely!')
          navigate('/app/dashboard')
        } catch {
          toast.error('Demo account unavailable — tap "Try Demo Account" below to retry')
        } finally {
          setLoading(false)
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const switchMode = (m) => { setMode(m); setStep(1); setError('') }

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
    setSelectedCats(prev => [...prev, v])
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

  const goNext = (e) => {
    e?.preventDefault?.()
    if (!canProceed()) return
    setError('')
    setSlideDir('right')
    setStep(s => s + 1)
  }

  const goBack = () => { setError(''); setSlideDir('left'); setStep(s => s - 1) }

  // ── DEMO LOGIN
  const handleDemoLogin = async () => {
    // Without ?demo=1, send people to the landing page's validated lead form
    if (!cameFromLandingPage) { window.location.href = '/landing.html#try-demo'; return }
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
    if (loading) return
    setLoading(true)
    setError('')
    try {
      await login(email.trim(), password)
      toast.success('Welcome back! 👋')
      navigate('/app/dashboard')
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  // ── REGISTER (final step)
  const handleRegister = async (e) => {
    e?.preventDefault?.()
    if (loading) return
    setLoading(true)
    setError('')
    try {
      // 1. Create account + shop on the server (role, trial dates and referral are set there)
      const bizTypeLabel = bizType === 'other' ? (bizTypeCustom || 'Other') : (currentBizType?.label || bizType)
      const utmSource = params.get('utm_source') || 'organic'
      const signupRes = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, password, bizName, bizType, bizTypeLabel,
          phone, address, bizEmail, currency, taxRate,
          brandColor: activeBrandColor, receiptFooter,
          referralCode, utmSource,
        }),
      })
      let signupData = {}
      try { signupData = await signupRes.json() } catch { /* not JSON */ }
      if (!signupRes.ok || !signupData.ok) throw new Error(signupData.error || 'We could not create your account. Please try again.')

      // 2. Sign in (the server stores the email in lowercase)
      try {
        await login(email.trim().toLowerCase(), password)
      } catch {
        setMode('login'); setStep(1)
        setError('Your account was created, but automatic sign-in failed. Please sign in with your email and password.')
        return
      }

      const shopId = signupData.shopId

      // 3. Optional logo upload
      let logoFailed = false
      if (logoFile) {
        try {
          const lf = new FormData()
          lf.append('logo', logoFile)
          await pb.collection(C.SHOPS).update(shopId, lf)
        } catch { logoFailed = true }
      }

      // 4. Categories (one at a time, in order; keep the created records)
      const createdCats = []
      for (let i = 0; i < selectedCats.length; i++) {
        try {
          createdCats.push(await pb.collection(C.CATEGORIES).create({ shop_id: shopId, name: selectedCats[i], sort_order: i }))
        } catch { /* non-critical */ }
      }

      // 5. Sample products so the dashboard isn't empty
      let productsAdded = 0
      for (const prod of DEMO_PRODUCTS[bizType] || DEMO_PRODUCTS.other) {
        try {
          const prodName = prod.name.toLowerCase()
          const catMatch = createdCats.find(c => prodName.includes(c.name.toLowerCase().split(' ')[0]))
          const payload = {
            shop_id: shopId,
            name: prod.name,
            price_kes: prod.selling_price_kes,
            cost_price_kes: prod.cost_price_kes,
            stock_qty: prod.stock_qty,
            unit: UNIT_MAP[prod.unit] || 'piece',
            track_inventory: true,
            status: 'active',
          }
          const catId = catMatch?.id || createdCats[0]?.id
          if (catId) payload.category_id = catId
          await pb.collection(C.PRODUCTS).create(payload)
          productsAdded++
        } catch (err) {
          console.error('Demo product failed:', prod.name, err?.data || err?.message || err)
        }
      }

      await loadShop(pb.authStore.model.id)

      setNewAdminName(name)
      setNewBizName(bizName)
      setSeeded({ products: productsAdded, categories: createdCats.length })
      toast.success(`${bizName} is live! 🎉`, { duration: 4000 })
      if (logoFailed) toast('Your logo could not be uploaded. You can add it later in the app.', { duration: 6000 })
      setCelebrate(true)
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Something went wrong. Please try again.')
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
        <CelebrationScreen bizName={newBizName} adminName={newAdminName} seeded={seeded} onDone={() => navigate('/app/dashboard')} />
        <Footer />
      </PageWrapper>
    )
  }

  if (mode === 'forgot') {
    return (
      <PageWrapper>
        <Header />
        <ForgotPasswordView onBack={() => switchMode('login')} />
        <Footer />
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <Header />

      {/* Mode toggle: only on login or step 1 */}
      {(mode === 'login' || step === 1) && (
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: 4, marginBottom: 24, gap: 4 }}>
          {[['login', 'Sign in'], ['register', 'Start free trial']].map(([m, label]) => (
            <button key={m} type="button" onClick={() => switchMode(m)} aria-pressed={mode === m}
              style={{
                flex: 1, padding: '10px', borderRadius: 9, border: 'none', minHeight: 44,
                background: mode === m ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent',
                color: mode === m ? '#fff' : T.muted, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                transition: 'all 0.2s', fontFamily: 'Nunito,sans-serif',
                boxShadow: mode === m ? '0 3px 12px rgba(200,69,106,0.35)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {mode === 'register' && <StepBar step={step} />}

      {/* ══ LOGIN ══ */}
      {mode === 'login' && (
        <div style={{ ...card, animation: 'st-fade-up 0.4s ease' }}>
          <h2 style={cardTitleStyle}>Welcome back</h2>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field id="login-email" label="Email address" icon={Mail}>
              <input id="login-email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email" placeholder="you@yourbusiness.com" style={{ ...inpStyle, paddingLeft: 40 }} />
            </Field>
            <Field id="login-password" label="Password" icon={Lock}
              aside={<button type="button" onClick={() => switchMode('forgot')} style={linkBtn}>Forgot password?</button>}>
              <input id="login-password" name="password" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                required autoComplete="current-password" placeholder="Your password" style={{ ...inpStyle, paddingLeft: 40, paddingRight: 46 }} />
              <PwdToggle shown={showPwd} onToggle={() => setShowPwd(s => !s)} />
            </Field>

            <FormError message={error} />

            <button type="submit" disabled={loading} style={{ ...btnPrimaryStyle, width: '100%', opacity: loading ? 0.7 : 1 }}>
              {loading ? <><Spinner />&nbsp;Signing in…</> : 'Sign in'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
            <span style={{ color: T.faint, fontSize: 12 }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
          </div>

          {/* Without ?demo=1 this sends people to the landing page's lead form */}
          <button type="button" onClick={handleDemoLogin} disabled={loading} style={{
            width: '100%', padding: '11px', borderRadius: 11, border: '1.5px solid rgba(230,184,0,0.4)', minHeight: 46,
            background: 'rgba(230,184,0,0.08)', color: T.gold, fontWeight: 700, fontSize: 14,
            cursor: 'pointer', fontFamily: 'Nunito,sans-serif', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 7, opacity: loading ? 0.6 : 1,
          }}>
            <Sparkles size={15} aria-hidden="true" /> Try demo account
          </button>

          <p style={{ ...noteStyle, marginTop: 14 }}>
            New here?{' '}
            <button type="button" onClick={() => switchMode('register')} style={linkBtn}>Start your 7-day free trial</button>
          </p>
        </div>
      )}

      {/* ══ STEP 1: Account ══ */}
      {mode === 'register' && step === 1 && (
        <form onSubmit={goNext} style={{ ...card, animation: `${slideAnim} 0.35s ease` }}>
          <h2 style={cardTitleStyle}>Create your account</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field id="reg-name" label="Your full name *">
              <input id="reg-name" name="name" type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Jane Wanjiku" style={inpStyle} autoComplete="name" />
            </Field>
            <Field id="reg-email" label="Email address *" icon={Mail}>
              <input id="reg-email" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@business.com" style={{ ...inpStyle, paddingLeft: 40 }} autoComplete="email" />
            </Field>
            <Field id="reg-password" label="Password * (at least 8 characters)" icon={Lock}
              hint={password && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 4 }} aria-hidden="true">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} style={{ flex: 1, height: 4, borderRadius: 3, background: i < pwdStrength(password) ? ['#ef4444', '#f59e0b', '#60a5fa', '#34d399'][pwdStrength(password) - 1] : 'rgba(255,255,255,0.12)', transition: 'all 0.2s' }} />
                    ))}
                  </div>
                  <div aria-live="polite" style={{ fontSize: 12, color: ['#fca5a5', '#fcd34d', '#93c5fd', '#6ee7b7'][pwdStrength(password) - 1] }}>
                    {['', 'Weak: add numbers and symbols', 'Fair: getting better', 'Good password', 'Strong password'][pwdStrength(password)]}
                  </div>
                </div>
              )}>
              <input id="reg-password" name="password" type={showPwd ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                required minLength={8} placeholder="At least 8 characters" style={{ ...inpStyle, paddingLeft: 40, paddingRight: 46 }} autoComplete="new-password" />
              <PwdToggle shown={showPwd} onToggle={() => setShowPwd(s => !s)} />
            </Field>

            {/* Referral code: collapsible */}
            <div>
              {!showReferral ? (
                <button type="button" onClick={() => setShowReferral(true)} style={{ ...linkBtn, color: T.gold, display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0' }}>
                  <Gift size={14} aria-hidden="true" /> Have a referral code?
                </button>
              ) : (
                <Field id="reg-referral" label="Referral code">
                  <input id="reg-referral" name="referral" type="text" value={referralCode} onChange={e => setReferralCode(e.target.value.toUpperCase())}
                    placeholder="e.g. JANE2024" autoComplete="off" autoCapitalize="characters"
                    style={{ ...inpStyle, letterSpacing: '0.1em', fontFamily: 'monospace', fontWeight: 700 }} />
                </Field>
              )}
            </div>

            <button type="submit" disabled={!canProceed()} style={{ ...btnPrimaryStyle, width: '100%', opacity: canProceed() ? 1 : 0.5 }}>
              Continue <ChevronRight size={16} aria-hidden="true" />
            </button>

            <p style={noteStyle}>
              Already have an account?{' '}
              <button type="button" onClick={() => switchMode('login')} style={linkBtn}>Sign in</button>
            </p>
          </div>
        </form>
      )}

      {/* ══ STEP 2: Business ══ */}
      {mode === 'register' && step === 2 && (
        <form onSubmit={goNext} style={{ ...card, animation: `${slideAnim} 0.35s ease` }}>
          <h2 style={cardTitleStyle}>Your business</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field id="biz-name" label="Business name *">
              <input id="biz-name" name="organization" type="text" value={bizName} onChange={e => setBizName(e.target.value)} required placeholder="e.g. Glam Studio Nairobi" style={inpStyle} autoComplete="organization" />
            </Field>

            <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
              <legend style={{ ...lblStyle, padding: 0 }}>What type of business? *</legend>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 6 }}>
                {BUSINESS_TYPES.map(bt => {
                  const on = bizType === bt.value
                  return (
                    <button key={bt.value} type="button" onClick={() => handleBizType(bt.value)} aria-pressed={on} style={{
                      padding: '10px 4px', borderRadius: 10, border: '1.5px solid', minHeight: 64,
                      borderColor: on ? '#c8456a' : 'rgba(255,255,255,0.15)',
                      background: on ? 'rgba(200,69,106,0.22)' : 'rgba(255,255,255,0.04)',
                      color: T.text, cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                      boxShadow: on ? '0 0 0 2px rgba(200,69,106,0.3)' : 'none',
                    }}>
                      <div aria-hidden="true" style={{ fontSize: 20, marginBottom: 3 }}>{bt.emoji}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2, color: on ? T.text : T.muted, fontFamily: 'Nunito,sans-serif' }}>{bt.label}</div>
                    </button>
                  )
                })}
              </div>
              {bizType === 'other' && (
                <input type="text" aria-label="Describe your business" value={bizTypeCustom} onChange={e => setBizTypeCustom(e.target.value)} placeholder="Describe your business…" style={{ ...inpStyle, marginTop: 8 }} />
              )}
            </fieldset>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              <Field id="biz-phone" label="Phone">
                <input id="biz-phone" name="tel" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+254 7xx xxx xxx" style={inpStyle} autoComplete="tel" />
              </Field>
              <Field id="biz-email" label="Business email">
                <input id="biz-email" name="biz-email" type="email" value={bizEmail} onChange={e => setBizEmail(e.target.value)} placeholder="biz@email.com" style={inpStyle} />
              </Field>
            </div>

            <Field id="biz-address" label="Business address / location">
              <input id="biz-address" name="address" type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. Westlands, Nairobi" style={inpStyle} />
            </Field>

            {/* Logo upload */}
            <div>
              <span id="logo-label" style={lblStyle}>Business logo for your receipts (optional)</span>
              <div
                role="button" tabIndex={0} aria-labelledby="logo-label"
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logoRef.current?.click() } }}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleLogoFile(e.dataTransfer.files[0]) }}
                onClick={() => logoRef.current?.click()}
                style={{
                  border: `2px dashed ${dragOver ? '#c8456a' : 'rgba(255,255,255,0.25)'}`,
                  borderRadius: 12, padding: 16, textAlign: 'center', cursor: 'pointer',
                  background: dragOver ? 'rgba(200,69,106,0.08)' : 'rgba(255,255,255,0.03)',
                  transition: 'all 0.2s', minHeight: 70, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {logoPreview ? (
                  <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <img src={logoPreview} alt="Your logo preview" style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 8, background: 'rgba(255,255,255,0.1)' }} />
                    <div>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 700 }}>Logo ready</div>
                      <div style={{ fontSize: 12, color: T.muted }}>Tap to change</div>
                    </div>
                    <button type="button" aria-label="Remove logo" onClick={e => { e.stopPropagation(); setLogoFile(null); setLogoPreview(null) }}
                      style={{ position: 'absolute', top: -12, right: -28, width: 32, height: 32, borderRadius: '50%', background: '#dc2626', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload size={20} color={T.faint} aria-hidden="true" style={{ margin: '0 auto 6px', display: 'block' }} />
                    <div style={{ fontSize: 13, color: T.muted, fontWeight: 600 }}>Drop a logo or tap to upload</div>
                    <div style={{ fontSize: 12, color: T.faint, marginTop: 2 }}>JPG, PNG or WebP, up to 5MB</div>
                  </div>
                )}
              </div>
              <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-hidden="true" style={{ display: 'none' }} onChange={e => handleLogoFile(e.target.files[0])} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={goBack} style={btnBackStyle}><ChevronLeft size={15} aria-hidden="true" /> Back</button>
              <button type="submit" disabled={!canProceed()} style={{ ...btnPrimaryStyle, flex: 2, opacity: canProceed() ? 1 : 0.5 }}>
                Continue <ChevronRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ══ STEP 3: Categories ══ */}
      {mode === 'register' && step === 3 && (
        <form onSubmit={goNext} style={{ ...card, animation: `${slideAnim} 0.35s ease` }}>
          <h2 style={cardTitleStyle}>Your categories</h2>
          <p style={{ color: T.muted, fontSize: 14, textAlign: 'center', margin: '-8px 0 16px' }}>
            Pre-selected for <strong style={{ color: T.text }}>{currentBizType?.label}</strong>. Tap to add or remove.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
            {(currentBizType?.categories || []).map(cat => {
              const sel = selectedCats.includes(cat)
              return (
                <button key={cat} type="button" onClick={() => toggleCat(cat)} aria-pressed={sel} style={{
                  padding: '8px 14px', borderRadius: 20, border: '1.5px solid', minHeight: 40,
                  borderColor: sel ? '#c8456a' : 'rgba(255,255,255,0.2)',
                  background: sel ? 'rgba(200,69,106,0.22)' : 'rgba(255,255,255,0.04)',
                  color: sel ? T.text : T.muted, fontSize: 13, fontWeight: sel ? 700 : 400, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', fontFamily: 'Nunito,sans-serif',
                }}>
                  {sel && <Check size={12} aria-hidden="true" />}{cat}
                </button>
              )
            })}
          </div>

          {customCats.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 700, marginBottom: 6 }}>Your custom categories</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {customCats.map(cat => (
                  <div key={cat} style={{ padding: '4px 6px 4px 12px', borderRadius: 20, background: 'rgba(230,184,0,0.12)', border: '1.5px solid rgba(230,184,0,0.3)', color: T.gold, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {cat}
                    <button type="button" aria-label={`Remove ${cat}`} onClick={() => toggleCat(cat)} style={{ background: 'none', border: 'none', color: T.gold, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={13} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
            <input
              type="text" aria-label="Add a custom category" value={customCat}
              onChange={e => setCustomCat(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCat() } }}
              placeholder="Add your own, e.g. Juice Bar"
              style={{ ...inpStyle, flex: 1 }}
            />
            <button type="button" onClick={addCustomCat} style={{ padding: '10px 14px', borderRadius: 10, border: 'none', background: 'rgba(230,184,0,0.15)', color: T.gold, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 14, fontFamily: 'Nunito,sans-serif', flexShrink: 0, minHeight: 46 }}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          </div>
          <div aria-live="polite" style={{ fontSize: 12, color: T.faint, marginBottom: 18 }}>
            {selectedCats.length} {selectedCats.length === 1 ? 'category' : 'categories'} selected. You can add more anytime in the app.
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={goBack} style={btnBackStyle}><ChevronLeft size={15} aria-hidden="true" /> Back</button>
            <button type="submit" disabled={!canProceed()} style={{ ...btnPrimaryStyle, flex: 2, opacity: canProceed() ? 1 : 0.5 }}>
              Continue <ChevronRight size={15} aria-hidden="true" />
            </button>
          </div>
        </form>
      )}

      {/* ══ STEP 4: Brand ══ */}
      {mode === 'register' && step === 4 && (
        <form onSubmit={handleRegister} style={{ ...card, animation: `${slideAnim} 0.35s ease` }}>
          <h2 style={cardTitleStyle}>Make it yours</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <fieldset style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
              <legend style={{ ...lblStyle, padding: 0 }}>Brand colour, used on receipts and your booking page</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {BRAND_COLORS.map(bc => {
                  const on = brandColor === bc.value
                  return (
                    <button key={bc.value} type="button" onClick={() => setBrandColor(bc.value)} aria-label={bc.label} aria-pressed={on} title={bc.label} style={{
                      width: 40, height: 40, borderRadius: '50%', border: '3px solid',
                      borderColor: on ? '#fff' : 'transparent',
                      background: bc.value === 'custom' ? 'linear-gradient(135deg,#ff0080,#7928ca,#0070f3)' : bc.value,
                      cursor: 'pointer', transition: 'all 0.15s',
                      boxShadow: on ? '0 0 0 3px rgba(255,255,255,0.3)' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {on && <Check size={15} color="#fff" aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
              {brandColor === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <input type="color" aria-label="Pick a custom colour" value={/^#[0-9a-fA-F]{6}$/.test(customColor) ? customColor : '#c8456a'} onChange={e => setCustomColor(e.target.value)}
                    style={{ width: 46, height: 46, borderRadius: 8, border: '2px solid rgba(255,255,255,0.25)', cursor: 'pointer', padding: 2, background: 'none', flexShrink: 0 }} />
                  <input type="text" aria-label="Custom colour hex code" value={customColor} onChange={e => setCustomColor(e.target.value)} maxLength={7} placeholder="#c8456a" style={{ ...inpStyle, fontFamily: 'monospace' }} />
                </div>
              )}

              {/* Live receipt preview */}
              <div style={{ background: activeBrandColor, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.3s' }}>
                {logoPreview
                  ? <img src={logoPreview} alt="" style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6, background: 'rgba(255,255,255,0.9)', padding: 2 }} />
                  : <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{currentBizType?.emoji || '🏪'}</div>}
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{bizName || 'Your Business'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Receipt header preview</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>KES 1,250</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>Sample</div>
                </div>
              </div>
            </fieldset>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
              <Field id="biz-currency" label="Currency">
                <select id="biz-currency" value={currency} onChange={e => setCurrency(e.target.value)} style={selStyle}>
                  <option value="KES">KES: Kenya Shilling</option>
                  <option value="USD">USD: US Dollar</option>
                  <option value="GBP">GBP: British Pound</option>
                  <option value="EUR">EUR: Euro</option>
                </select>
              </Field>
              <Field id="biz-tax" label="VAT / tax rate (%)">
                <input id="biz-tax" type="number" inputMode="decimal" min={0} max={100} step={0.5} value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} style={inpStyle} />
              </Field>
            </div>

            <Field id="biz-footer" label="Receipt footer message"
              hint={<div style={{ fontSize: 12, color: T.faint, marginTop: 4 }}>Printed at the bottom of every receipt.</div>}>
              <input id="biz-footer" type="text" value={receiptFooter} onChange={e => setReceiptFooter(e.target.value)} placeholder={`Thank you for visiting ${bizName || 'your business'}!`} style={inpStyle} />
            </Field>

            <FormError message={error}>
              {/\balready registered\b/i.test(error) && (
                <> <button type="button" onClick={() => switchMode('login')} style={{ ...linkBtn, color: T.text, textDecoration: 'underline', padding: 0, minHeight: 0 }}>Go to sign in</button></>
              )}
            </FormError>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={goBack} disabled={loading} style={btnBackStyle}><ChevronLeft size={15} aria-hidden="true" /> Back</button>
              <button type="submit" disabled={loading} style={{ ...btnPrimaryStyle, flex: 2, opacity: loading ? 0.7 : 1 }}>
                {loading ? <><Spinner />&nbsp;Setting up…</> : 'Launch my business'}
              </button>
            </div>
            <p style={noteStyle}>
              By continuing you agree to our{' '}
              <a href={LEGAL.terms} target="_blank" rel="noopener noreferrer" style={{ color: T.link }}>Terms</a> and{' '}
              <a href={LEGAL.privacy} target="_blank" rel="noopener noreferrer" style={{ color: T.link }}>Privacy Policy</a>.
            </p>
          </div>
        </form>
      )}

      <Footer />
    </PageWrapper>
  )
}

/* ═══════════════════════════════════════════════
   LAYOUT COMPONENTS
═══════════════════════════════════════════════ */
function PageWrapper({ children }) {
  return (
    <div className="st-page" style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg,#0d0508 0%,#2a0b18 40%,#4a1228 70%,#6b1e38 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '16px 16px calc(16px + env(safe-area-inset-bottom, 0px))', position: 'relative', overflow: 'hidden',
    }}>
      <style>{CSS}</style>
      {[
        { w: 280, h: 280, bg: '#c8456a', op: 0.07, top: '8%',  left: '65%' },
        { w: 180, h: 180, bg: '#e6b800', op: 0.05, top: '60%', left: '5%' },
        { w: 350, h: 350, bg: '#8b2550', op: 0.06, top: '-5%', left: '15%' },
      ].map((o, i) => (
        <div key={i} aria-hidden="true" style={{ position: 'absolute', width: o.w, height: o.h, borderRadius: '50%', background: o.bg, opacity: o.op, top: o.top, left: o.left, filter: 'blur(70px)', pointerEvents: 'none' }} />
      ))}
      <main style={{ width: '100%', maxWidth: 480, position: 'relative', zIndex: 1 }}>
        {children}
      </main>
    </div>
  )
}

function Header() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 20 }}>
      <div aria-hidden="true" style={{ width: 54, height: 54, background: 'linear-gradient(135deg,#e6b800,#c8456a)', borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 28px rgba(200,69,106,0.45)', marginBottom: 10 }}>
        <TrendingUp size={26} color="#fff" />
      </div>
      <h1 style={{ fontFamily: 'Playfair Display,serif', color: T.text, fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>SalesTrack</h1>
      <p style={{ color: T.muted, fontSize: 14, margin: '4px 0 0' }}>Run your business from your phone</p>
    </div>
  )
}

function Footer() {
  return (
    <p style={{ textAlign: 'center', color: T.faint, fontSize: 12, marginTop: 16 }}>
      © {new Date().getFullYear()} SalesTrack ·{' '}
      <a href={LEGAL.terms} target="_blank" rel="noopener noreferrer" style={{ color: T.muted }}>Terms</a> ·{' '}
      <a href={LEGAL.privacy} target="_blank" rel="noopener noreferrer" style={{ color: T.muted }}>Privacy</a>
    </p>
  )
}
