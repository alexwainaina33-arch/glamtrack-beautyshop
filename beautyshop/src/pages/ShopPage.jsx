import { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import pb, { C, PB_URL } from '../lib/pb'

// ─── helpers ───────────────────────────────────────────────────────────────
const CAT_EMOJI = {
  hair: '💇', nails: '💅', skin: '✨', body: '💆',
  lashes: '👁️', makeup: '💄', other: '🌸',
}

function fmtPrice(n, currency) {
  const amount = Number(n)
  switch ((currency || 'KES').toUpperCase()) {
    case 'USD': return `$${amount.toLocaleString('en-US')}`
    case 'GBP': return `£${amount.toLocaleString('en-GB')}`
    case 'EUR': return `€${amount.toLocaleString()}`
    default:    return `KES ${amount.toLocaleString('en-KE')}`
  }
}

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function getOpenStatus(businessHours) {
  if (!businessHours || typeof businessHours !== 'object') return null
  const now    = new Date()
  const dowJS  = now.getDay()                          // 0=Sun
  const dayKey = DAYS[dowJS === 0 ? 6 : dowJS - 1]
  const hrs    = businessHours[dayKey]
  if (!hrs || hrs.closed) {
    return { open: false, label: 'Closed today', nextOpen: getNextOpen(businessHours, dowJS) }
  }
  const [oh, om] = (hrs.open  || '08:00').split(':').map(Number)
  const [ch, cm] = (hrs.close || '18:00').split(':').map(Number)
  const nowM   = now.getHours() * 60 + now.getMinutes()
  const openM  = oh * 60 + om
  const closeM = ch * 60 + cm
  if (nowM < openM)  return { open: false, label: `Opens at ${hrs.open}`,  nextOpen: null }
  if (nowM >= closeM) return { open: false, label: `Closed · Was open until ${hrs.close}`, nextOpen: getNextOpen(businessHours, dowJS) }
  const left = closeM - nowM
  return { open: true, label: `Open now · Closes ${hrs.close}${left <= 60 ? ` (${left}m left)` : ''}`, nextOpen: null }
}

function getNextOpen(bh, todayDow) {
  for (let i = 1; i <= 7; i++) {
    const idx = (todayDow + i) % 7
    const key = DAYS[idx === 0 ? 6 : idx - 1]
    const hrs = bh[key]
    if (hrs && !hrs.closed) return `${key} ${hrs.open}`
  }
  return null
}

function toWaPhone(phone) {
  if (!phone) return ''
  let p = phone.replace(/[^\d+]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('0')) p = '254' + p.slice(1)
  if (!p.startsWith('254') && p.length === 9) p = '254' + p
  return p
}

// ─── mini cart logic ────────────────────────────────────────────────────────
function buildWhatsAppOrder(cart, shop, bookingUrl) {
  const lines = cart.map(i => `• ${i.name} x${i.qty} — ${fmtPrice(i.price_kes * i.qty, shop.currency)}`)
  const total = cart.reduce((s, i) => s + i.price_kes * i.qty, 0)
  return [
    `🛍️ *Order from ${shop.name}*`,
    ``,
    ...lines,
    ``,
    `*Total: ${fmtPrice(total, shop.currency)}*`,
    ``,
    `Please confirm availability and payment details.`,
    ``,
    `_Sent via ${shop.name}'s online store · ${bookingUrl}_`,
  ].join('\n')
}

// ─── skeleton loader ────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 16, r = 8, mb = 0 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r, marginBottom: mb,
      background: 'linear-gradient(90deg,#f0e4e8 25%,#fce8ed 50%,#f0e4e8 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  )
}

// ═══════════════════════════════════════════════════════════════════════════
export default function ShopPage() {
  const { slug } = useParams()

  const [shop,       setShop]       = useState(null)
  const [services,   setServices]   = useState([])
  const [products,   setProducts]   = useState([])
  const [salesCount, setSalesCount] = useState(0)
  const [custCount,  setCustCount]  = useState(0)
  const [loading,    setLoading]    = useState(true)
  const [notFound,   setNotFound]   = useState(false)
  const [tab,        setTab]        = useState('services') // services | products | about | hours
  const [cart,       setCart]       = useState([])
  const [cartOpen,   setCartOpen]   = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [imgModal,   setImgModal]   = useState(null)   // full-screen product image
  const heroRef = useRef(null)

  useEffect(() => {
    const load = async () => {
      try {
        const shopRes = await pb.collection(C.SHOPS).getFirstListItem(
          `slug="${slug}"`, { '$autoCancel': false }
        )
        setShop(shopRes)
        const [svcs, prods, sales, custs] = await Promise.all([
          pb.collection(C.SERVICES).getList(1, 200, {
            filter: `shop_id="${shopRes.id}" && is_active=true`,
            sort: 'category,name', '$autoCancel': false,
          }).then(r => r.items),
          pb.collection(C.PRODUCTS).getList(1, 200, {
            filter: `shop_id="${shopRes.id}" && status="active"`,
            sort: 'name', '$autoCancel': false,
          }).then(r => r.items),
          pb.collection(C.SALES).getList(1, 1, {
            filter: `shop_id="${shopRes.id}" && status="completed"`,
            '$autoCancel': false,
          }).then(r => r.totalItems).catch(() => 0),
          pb.collection(C.CUSTOMERS).getList(1, 1, {
            filter: `shop_id="${shopRes.id}"`,
            '$autoCancel': false,
          }).then(r => r.totalItems).catch(() => 0),
        ])
        setServices(svcs)
        setProducts(prods)
        setSalesCount(sales)
        setCustCount(custs)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug])

  // ── cart helpers ──────────────────────────────────────────────────────────
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { ...product, qty: 1 }]
    })
    setCartOpen(true)
  }
  const removeFromCart = (id) => setCart(prev => prev.filter(i => i.id !== id))
  const updateQty = (id, delta) => setCart(prev =>
    prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i)
  )
  const cartTotal  = cart.reduce((s, i) => s + i.price_kes * i.qty, 0)
  const cartCount  = cart.reduce((s, i) => s + i.qty, 0)

  const shareShopLink = () => {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: shop?.name, url }).catch(() => {})
    } else {
      navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
    }
  }

  // ── loading skeleton ──────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif' }}>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ height: 220, background: 'linear-gradient(90deg,#f0e4e8 25%,#fce8ed 50%,#f0e4e8 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s infinite' }} />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 24, alignItems: 'center' }}>
          <Skeleton w={72} h={72} r={36} />
          <div style={{ flex: 1 }}>
            <Skeleton h={22} mb={8} />
            <Skeleton h={14} w="60%" />
          </div>
        </div>
        {[1,2,3,4].map(i => <Skeleton key={i} h={72} r={14} mb={12} />)}
      </div>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', margin: '0 0 8px' }}>Shop not found</h2>
        <p style={{ color: '#9b6070', margin: 0 }}>This link may be incorrect or the shop may have moved.</p>
      </div>
    </div>
  )

  const brand      = shop.brand_color || '#c8456a'
  const brandDark  = brand            // used for darken where needed
  const logoUrl    = shop.logo
    ? `${PB_URL}/api/files/${shop.collectionId}/${shop.id}/${shop.logo}?thumb=400x400`
    : null
  const coverUrl   = shop.cover_image
    ? `${PB_URL}/api/files/${shop.collectionId}/${shop.id}/${shop.cover_image}?thumb=1200x400`
    : null
  const bookingUrl = `${window.location.origin}/book/${shop.slug}`
  const shopUrl    = window.location.href
  const waPhone    = toWaPhone(shop.phone)
  const openStatus = getOpenStatus(shop.business_hours)
  const mapQuery   = encodeURIComponent(shop.address || shop.name)

  const groupedServices = services.reduce((acc, svc) => {
    const cat = svc.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(svc)
    return acc
  }, {})

  const hasProducts = products.length > 0
  const hasAbout    = !!(shop.about_text || shop.founded_year)
  const hasHours    = !!(shop.business_hours && Object.keys(shop.business_hours).length > 0)

  const tabs = [
    { key: 'services', label: `💅 Services`, count: services.length },
    hasProducts && { key: 'products', label: `🛍️ Shop`,     count: products.length },
    hasAbout    && { key: 'about',    label: `ℹ️ About`,     count: null },
    hasHours    && { key: 'hours',    label: `🕐 Hours`,     count: null },
  ].filter(Boolean)

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif', paddingBottom: 120 }}>
      <style>{`
        @keyframes fadeUp   { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer  { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:.45} }
        @keyframes slideUp  { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes scaleIn  { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
        .fade-up   { animation: fadeUp  .38s ease forwards }
        .live-dot  { animation: pulse   2s ease-in-out infinite }
        .slide-up  { animation: slideUp .3s cubic-bezier(.4,0,.2,1) forwards }
        .scale-in  { animation: scaleIn .22s ease forwards }

        .svc-card  { transition: box-shadow .2s, transform .2s; }
        .svc-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,.1); transform: translateY(-2px); }
        .prod-card { transition: box-shadow .2s, transform .2s; cursor: pointer; }
        .prod-card:hover { box-shadow: 0 6px 24px rgba(0,0,0,.1); transform: translateY(-2px); }
        .book-btn:hover { filter: brightness(1.08); transform: scale(1.02); }
        .book-btn { transition: all .18s; }
        .tab-pill { transition: all .18s; white-space: nowrap; }

        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:#d4a0b0; border-radius:4px; }
      `}</style>

      {/* ══ HERO ══════════════════════════════════════════════════════════ */}
      <div ref={heroRef} style={{ position: 'relative' }}>

        {/* Cover / gradient banner */}
        <div style={{
          height: coverUrl ? 240 : 160,
          background: coverUrl
            ? `url(${coverUrl}) center/cover no-repeat`
            : `linear-gradient(135deg, ${brand} 0%, ${brand}99 60%, #fdf5f7 100%)`,
          position: 'relative',
        }}>
          {coverUrl && (
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,.08) 0%, rgba(0,0,0,.52) 100%)' }} />
          )}
          {/* Share button top-right */}
          <button onClick={shareShopLink}
            style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,.22)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,.35)', borderRadius: 20, padding: '6px 14px', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            {copied ? '✅ Copied!' : '🔗 Share'}
          </button>
        </div>

        {/* Logo + name card */}
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: coverUrl ? -44 : -28, position: 'relative', zIndex: 2 }}>
            {logoUrl
              ? <img src={logoUrl} alt={shop.name} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '4px solid #fff', flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,.18)' }} />
              : <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg,${brand},${brand}99)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, border: '4px solid #fff', flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,.18)' }}>🏪</div>
            }
            <div style={{ flex: 1, paddingBottom: 4 }}>
              <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#1a1a1f', fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{shop.name}</h1>
              {shop.tagline && <p style={{ color: '#6b4050', fontSize: 13, margin: '3px 0 0', fontStyle: 'italic' }}>{shop.tagline}</p>}
              {shop.business_type && <p style={{ color: '#9b6070', fontSize: 11, margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '.06em' }}>{shop.business_type}</p>}
            </div>
          </div>

          {/* Open/Closed badge */}
          {openStatus && (
            <div style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: openStatus.open ? '#f0fdf4' : '#fef3c7', border: `1px solid ${openStatus.open ? '#bbf7d0' : '#fde68a'}` }}>
              <span className={openStatus.open ? 'live-dot' : ''} style={{ width: 7, height: 7, borderRadius: '50%', background: openStatus.open ? '#059669' : '#d97706', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: openStatus.open ? '#059669' : '#92400e' }}>{openStatus.label}</span>
              {!openStatus.open && openStatus.nextOpen && (
                <span style={{ fontSize: 11, color: '#9b6070' }}>· Opens {openStatus.nextOpen}</span>
              )}
            </div>
          )}

          {/* Info row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
            {shop.address && (
              <a href={`https://maps.google.com/?q=${mapQuery}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6b4050', textDecoration: 'none', background: '#fff', border: '1px solid #f0e4e8', borderRadius: 8, padding: '4px 10px' }}>
                📍 {shop.address.length > 38 ? shop.address.slice(0, 38) + '…' : shop.address}
              </a>
            )}
            {shop.instagram && (
              <a href={`https://instagram.com/${shop.instagram.replace('@','')}`} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6b4050', textDecoration: 'none', background: '#fff', border: '1px solid #f0e4e8', borderRadius: 8, padding: '4px 10px' }}>
                📸 {shop.instagram}
              </a>
            )}
            {shop.website && (
              <a href={shop.website} target="_blank" rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: brand, textDecoration: 'none', background: '#fff', border: '1px solid #f0e4e8', borderRadius: 8, padding: '4px 10px', fontWeight: 700 }}>
                🌐 Website
              </a>
            )}
          </div>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <a href={bookingUrl} className="book-btn"
              style={{ padding: '11px 20px', borderRadius: 12, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, boxShadow: `0 4px 16px ${brand}44` }}>
              📅 Book Appointment
            </a>
            {waPhone && (
              <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(`Hi ${shop.name}! I saw your shop page and would like to enquire 😊`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ padding: '11px 16px', borderRadius: 12, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                💬 Chat
              </a>
            )}
            {shop.phone && (
              <a href={`tel:${shop.phone}`}
                style={{ padding: '11px 14px', borderRadius: 12, border: '1.5px solid #f0e4e8', background: '#fff', color: '#3d1020', fontWeight: 700, fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                📞 Call
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ══ SOCIAL PROOF BAR ═════════════════════════════════════════════ */}
      <div style={{ maxWidth: 640, margin: '18px auto 0', padding: '0 16px' }}>
        {(salesCount > 5 || custCount > 2 || services.length > 0 || shop.founded_year) && (
          <div className="fade-up" style={{ display: 'flex', background: '#fff', borderRadius: 16, border: '1.5px solid #f0e4e8', overflow: 'hidden', boxShadow: '0 2px 12px rgba(200,69,106,.07)' }}>
            {[
              salesCount  > 5 && { icon: '🧾', value: salesCount > 999 ? `${(salesCount/1000).toFixed(1)}k+` : `${salesCount}+`, label: 'Sales' },
              custCount   > 2 && { icon: '❤️', value: custCount  > 999 ? `${(custCount /1000).toFixed(1)}k+` : `${custCount}+`,  label: 'Customers' },
              services.length > 0 && { icon: '💅', value: services.length, label: 'Services' },
              shop.founded_year   && { icon: '🏆', value: `Est. ${shop.founded_year}`, label: 'Founded' },
            ].filter(Boolean).map((s, i, arr) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', padding: '12px 6px', borderRight: i < arr.length - 1 ? '1px solid #f0e4e8' : 'none' }}>
                <div style={{ fontSize: 18 }}>{s.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 15, color: brand, fontFamily: 'Playfair Display,serif', lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: '#9b6070', fontWeight: 600, marginTop: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ TABS ══════════════════════════════════════════════════════════ */}
      <div style={{ maxWidth: 640, margin: '18px auto 0', padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className="tab-pill"
              style={{ padding: '9px 16px', borderRadius: 24, border: 'none', background: tab === t.key ? `linear-gradient(135deg,${brand},${brand}cc)` : '#fff', color: tab === t.key ? '#fff' : '#6b4050', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', boxShadow: tab === t.key ? `0 3px 12px ${brand}44` : '0 1px 4px rgba(0,0,0,.06)', border: tab !== t.key ? '1.5px solid #f0e4e8' : 'none', flexShrink: 0 }}>
              {t.label}{t.count !== null ? ` (${t.count})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* ══ CONTENT ═══════════════════════════════════════════════════════ */}
      <div style={{ maxWidth: 640, margin: '16px auto 0', padding: '0 16px' }}>

        {/* ── SERVICES TAB ── */}
        {tab === 'services' && (
          <div className="fade-up">
            {services.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', background: '#fff', borderRadius: 16, border: '1.5px solid #f0e4e8' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>💅</div>
                <p style={{ color: '#9b6070', margin: 0 }}>No services listed yet.</p>
                {shop.phone && <a href={`tel:${shop.phone}`} style={{ color: brand, fontWeight: 700 }}>{shop.phone}</a>}
              </div>
            ) : (
              Object.entries(groupedServices).map(([cat, svcs]) => (
                <div key={cat} style={{ marginBottom: 28 }}>
                  {/* Category header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg,${brand}22,${brand}44)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                      {CAT_EMOJI[cat] || '✨'}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b4050' }}>{cat}</span>
                    <div style={{ flex: 1, height: 1, background: '#f0e4e8' }} />
                    <span style={{ fontSize: 11, color: '#9b6070' }}>{svcs.length} service{svcs.length !== 1 ? 's' : ''}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {svcs.map(svc => (
                      <div key={svc.id} className="svc-card"
                        style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: '1.5px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1f', marginBottom: 2 }}>{svc.name}</div>
                          {svc.description && <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 4, lineHeight: 1.4 }}>{svc.description}</div>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: '#9b6070', background: '#fdf5f7', padding: '2px 8px', borderRadius: 6 }}>⏱ {svc.duration_minutes} min</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 16, color: brand, fontFamily: 'Playfair Display,serif' }}>
                            {fmtPrice(svc.price_kes, shop.currency)}
                          </div>
                          <a href={`${bookingUrl}?service=${encodeURIComponent(svc.name)}`}
                            style={{ padding: '7px 16px', borderRadius: 10, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: `0 2px 8px ${brand}33` }}>
                            Book →
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            {/* Book all CTA */}
            {services.length > 3 && (
              <div style={{ background: `linear-gradient(135deg,${brand}11,${brand}22)`, border: `1.5px solid ${brand}33`, borderRadius: 16, padding: '20px', textAlign: 'center', marginTop: 8 }}>
                <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', marginBottom: 6 }}>Ready to book?</div>
                <p style={{ fontSize: 13, color: '#6b4050', margin: '0 0 14px' }}>Pick your service, choose your stylist and confirm in under 60 seconds.</p>
                <a href={bookingUrl}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 28px', borderRadius: 12, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', fontWeight: 800, fontSize: 14, textDecoration: 'none', boxShadow: `0 4px 16px ${brand}44` }}>
                  📅 Book an Appointment
                </a>
              </div>
            )}
          </div>
        )}

        {/* ── PRODUCTS / SHOP TAB ── */}
        {tab === 'products' && hasProducts && (
          <div className="fade-up">
            {/* Cart summary banner */}
            {cart.length > 0 && (
              <div onClick={() => setCartOpen(true)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: brand, borderRadius: 14, padding: '13px 18px', marginBottom: 16, cursor: 'pointer', boxShadow: `0 4px 16px ${brand}44` }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>🛒 {cartCount} item{cartCount !== 1 ? 's' : ''} in cart</div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{fmtPrice(cartTotal, shop.currency)} →</div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              {products.map(p => {
                const inCart    = cart.find(i => i.id === p.id)
                const imgUrl    = p.images?.length
                  ? `${PB_URL}/api/files/${p.collectionId}/${p.id}/${p.images[0]}?thumb=400x400`
                  : null
                const outOfStock = p.track_inventory && p.stock_qty === 0

                return (
                  <div key={p.id} className="prod-card"
                    style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${inCart ? brand : '#f0e4e8'}`, overflow: 'hidden', opacity: outOfStock ? 0.55 : 1, position: 'relative' }}>

                    {/* Product image */}
                    <div onClick={() => imgUrl && setImgModal(imgUrl)}
                      style={{ height: 130, background: imgUrl ? `url(${imgUrl}) center/cover no-repeat` : `linear-gradient(135deg,${brand}18,${brand}33)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, cursor: imgUrl ? 'zoom-in' : 'default' }}>
                      {!imgUrl && '🛍️'}
                    </div>

                    {/* Low stock badge */}
                    {p.track_inventory && p.stock_qty !== null && p.stock_qty > 0 && p.stock_qty <= 5 && (
                      <div style={{ position: 'absolute', top: 8, left: 8, background: '#d97706', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6 }}>
                        Only {p.stock_qty} left
                      </div>
                    )}
                    {outOfStock && (
                      <div style={{ position: 'absolute', top: 8, left: 8, background: '#dc2626', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6 }}>
                        Out of stock
                      </div>
                    )}
                    {inCart && (
                      <div style={{ position: 'absolute', top: 8, right: 8, background: brand, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 6 }}>
                        ✓ In cart
                      </div>
                    )}

                    <div style={{ padding: '10px 12px 12px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1f', marginBottom: 2, lineHeight: 1.3 }}>{p.name}</div>
                      {p.brand && <div style={{ fontSize: 11, color: '#9b6070', marginBottom: 4 }}>{p.brand}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 6 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14, color: brand, fontFamily: 'Playfair Display,serif' }}>{fmtPrice(p.price_kes, shop.currency)}</div>
                          {p.compare_price_kes > p.price_kes && (
                            <div style={{ fontSize: 11, color: '#9b6070', textDecoration: 'line-through' }}>{fmtPrice(p.compare_price_kes, shop.currency)}</div>
                          )}
                        </div>
                        {!outOfStock && (
                          <button onClick={() => addToCart(p)}
                            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: inCart ? '#f0fdf4' : `linear-gradient(135deg,${brand},${brand}cc)`, color: inCart ? '#059669' : '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 32 }}>
                            {inCart ? '✓ Added' : '+ Add'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Order via WhatsApp note */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '14px 16px', marginTop: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
              <div style={{ fontSize: 12, color: '#166534', lineHeight: 1.6 }}>
                <strong>How ordering works:</strong> Add items to your cart, then tap "Order via WhatsApp" to send your order directly to {shop.name}. They'll confirm availability and share payment details.
              </div>
            </div>
          </div>
        )}

        {/* ── ABOUT TAB ── */}
        {tab === 'about' && hasAbout && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Story card */}
            {shop.about_text && (
              <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #f0e4e8', padding: '20px 20px' }}>
                <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: brand, marginBottom: 12 }}>Our Story</div>
                <p style={{ fontSize: 14, color: '#3d1020', lineHeight: 1.8, margin: 0 }}>{shop.about_text}</p>
                {shop.founded_year && (
                  <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, background: `${brand}11`, padding: '8px 14px', borderRadius: 10 }}>
                    <span style={{ fontSize: 18 }}>🏆</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: brand }}>Serving customers since {shop.founded_year} · {new Date().getFullYear() - shop.founded_year} years of excellence</span>
                  </div>
                )}
              </div>
            )}

            {/* Contact card */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #f0e4e8', padding: '20px' }}>
              <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: brand, marginBottom: 14 }}>Get in Touch</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {shop.phone && (
                  <a href={`tel:${shop.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fdf5f7', borderRadius: 10, textDecoration: 'none', color: '#3d1020' }}>
                    <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>📞</span>
                    <div><div style={{ fontSize: 11, color: '#9b6070', fontWeight: 700 }}>PHONE</div><div style={{ fontSize: 14, fontWeight: 600 }}>{shop.phone}</div></div>
                  </a>
                )}
                {waPhone && (
                  <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#f0fdf4', borderRadius: 10, textDecoration: 'none', color: '#166534' }}>
                    <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>💬</span>
                    <div><div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700 }}>WHATSAPP</div><div style={{ fontSize: 14, fontWeight: 600 }}>Chat with us</div></div>
                  </a>
                )}
                {shop.email && (
                  <a href={`mailto:${shop.email}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fdf5f7', borderRadius: 10, textDecoration: 'none', color: '#3d1020' }}>
                    <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>✉️</span>
                    <div><div style={{ fontSize: 11, color: '#9b6070', fontWeight: 700 }}>EMAIL</div><div style={{ fontSize: 14, fontWeight: 600 }}>{shop.email}</div></div>
                  </a>
                )}
                {shop.address && (
                  <a href={`https://maps.google.com/?q=${mapQuery}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fdf5f7', borderRadius: 10, textDecoration: 'none', color: '#3d1020' }}>
                    <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>📍</span>
                    <div><div style={{ fontSize: 11, color: '#9b6070', fontWeight: 700 }}>LOCATION</div><div style={{ fontSize: 14, fontWeight: 600 }}>{shop.address}</div></div>
                  </a>
                )}
                {shop.instagram && (
                  <a href={`https://instagram.com/${shop.instagram.replace('@','')}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fdf5f7', borderRadius: 10, textDecoration: 'none', color: '#3d1020' }}>
                    <span style={{ fontSize: 20, width: 32, textAlign: 'center' }}>📸</span>
                    <div><div style={{ fontSize: 11, color: '#9b6070', fontWeight: 700 }}>INSTAGRAM</div><div style={{ fontSize: 14, fontWeight: 600 }}>{shop.instagram}</div></div>
                  </a>
                )}
              </div>
            </div>

            {/* Map embed */}
            {shop.address && (
              <div style={{ borderRadius: 16, overflow: 'hidden', border: '1.5px solid #f0e4e8' }}>
                <iframe
                  title="map"
                  width="100%" height="200"
                  style={{ border: 0, display: 'block' }}
                  loading="lazy"
                  src={`https://maps.google.com/maps?q=${mapQuery}&output=embed&z=15`}
                />
                <div style={{ background: '#fff', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#3d1020', fontWeight: 600 }}>📍 {shop.address}</span>
                  <a href={`https://maps.google.com/?q=${mapQuery}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: brand, fontWeight: 700, textDecoration: 'none' }}>
                    Directions →
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── HOURS TAB ── */}
        {tab === 'hours' && hasHours && (
          <div className="fade-up">
            <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #f0e4e8', padding: '20px', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: brand, marginBottom: 14 }}>Opening Hours</div>

              {openStatus && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: openStatus.open ? '#f0fdf4' : '#fef3c7', marginBottom: 16 }}>
                  <span className={openStatus.open ? 'live-dot' : ''} style={{ width: 9, height: 9, borderRadius: '50%', background: openStatus.open ? '#059669' : '#d97706', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: openStatus.open ? '#059669' : '#92400e' }}>{openStatus.label}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {DAYS.map((day, idx) => {
                  const hrs     = shop.business_hours?.[day]
                  if (!hrs) return null
                  const dowJS   = new Date().getDay()
                  const todayKey = DAYS[dowJS === 0 ? 6 : dowJS - 1]
                  const isToday  = todayKey === day
                  return (
                    <div key={day} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: idx < DAYS.length - 1 ? '1px solid #fdf5f7' : 'none', background: isToday ? `${brand}08` : 'transparent', margin: isToday ? '0 -4px' : 0, padding: isToday ? '11px 4px' : '11px 0', borderRadius: isToday ? 8 : 0 }}>
                      <span style={{ fontSize: 14, fontWeight: isToday ? 800 : 500, color: isToday ? brand : '#3d1020' }}>
                        {day}{isToday ? ' · Today' : ''}
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: hrs.closed ? '#9b6070' : isToday ? brand : '#3d1020' }}>
                        {hrs.closed ? '🔴 Closed' : `${hrs.open} – ${hrs.close}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Book reminder */}
            <div style={{ background: `linear-gradient(135deg,${brand}11,${brand}22)`, border: `1px solid ${brand}33`, borderRadius: 14, padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 28, flexShrink: 0 }}>📅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#3d1020', marginBottom: 4 }}>Book your appointment online</div>
                <div style={{ fontSize: 12, color: '#6b4050' }}>Skip the call — pick your time and confirm in under 60 seconds.</div>
              </div>
              <a href={bookingUrl}
                style={{ padding: '9px 16px', borderRadius: 10, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: `0 2px 8px ${brand}33`, flexShrink: 0 }}>
                Book →
              </a>
            </div>
          </div>
        )}

      </div>

      {/* ══ FOOTER ════════════════════════════════════════════════════════ */}
      <div style={{ maxWidth: 640, margin: '32px auto 0', padding: '0 16px' }}>
        <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #f0e4e8', padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href={bookingUrl}
              style={{ padding: '9px 18px', borderRadius: 10, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
              📅 Book Now
            </a>
            {waPhone && (
              <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer"
                style={{ padding: '9px 18px', borderRadius: 10, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                💬 WhatsApp
              </a>
            )}
            <button onClick={shareShopLink}
              style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid #f0e4e8', background: '#fff', color: '#3d1020', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
              {copied ? '✅ Copied!' : '🔗 Share this page'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: '#c8b0b8', margin: 0 }}>
            Powered by <strong style={{ color: brand }}>SalesTrack</strong> · Run your business from your phone
          </p>
        </div>
      </div>

      {/* ══ STICKY BOTTOM BAR (mobile) ════════════════════════════════════ */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #f0e4e8', padding: '10px 16px', zIndex: 200, paddingBottom: 'calc(10px + env(safe-area-inset-bottom,0px))' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', gap: 8 }}>
          {cart.length > 0 ? (
            <button onClick={() => setCartOpen(true)}
              style={{ flex: 1, padding: '13px', borderRadius: 14, border: 'none', background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: `0 4px 16px ${brand}44` }}>
              <span>🛒 {cartCount} item{cartCount !== 1 ? 's' : ''}</span>
              <span>{fmtPrice(cartTotal, shop.currency)} · View cart →</span>
            </button>
          ) : (
            <a href={bookingUrl}
              style={{ flex: 1, padding: '13px', borderRadius: 14, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none', textAlign: 'center', boxShadow: `0 4px 16px ${brand}44` }}>
              📅 Book an Appointment
            </a>
          )}
          {waPhone && (
            <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer"
              style={{ padding: '13px 16px', borderRadius: 14, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 15, textDecoration: 'none', flexShrink: 0 }}>
              💬
            </a>
          )}
        </div>
      </div>

      {/* ══ CART DRAWER ═══════════════════════════════════════════════════ */}
      {cartOpen && (
        <div onClick={e => e.target === e.currentTarget && setCartOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.48)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div className="slide-up" style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 640, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Drawer header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#3d1020' }}>🛒 Your Cart</div>
              <button onClick={() => setCartOpen(false)}
                style={{ background: '#f5edf0', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>✕</button>
            </div>

            {/* Cart items */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 20px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#9b6070' }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>🛍️</div>
                  <div>Your cart is empty</div>
                </div>
              ) : cart.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f5edf0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1f' }}>{item.name}</div>
                    <div style={{ fontSize: 12, color: brand, fontWeight: 700 }}>{fmtPrice(item.price_kes, shop.currency)} each</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => updateQty(item.id, -1)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #f0e4e8', background: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                    <button onClick={() => updateQty(item.id, +1)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: brand, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#1a1a1f', minWidth: 70, textAlign: 'right' }}>{fmtPrice(item.price_kes * item.qty, shop.currency)}</div>
                  <button onClick={() => removeFromCart(item.id)} style={{ background: '#fee2e2', border: 'none', borderRadius: 6, width: 26, height: 26, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', flexShrink: 0 }}>✕</button>
                </div>
              ))}
            </div>

            {/* Cart footer */}
            {cart.length > 0 && (
              <div style={{ padding: '14px 20px', borderTop: '1px solid #f0e4e8', flexShrink: 0, paddingBottom: 'calc(14px + env(safe-area-inset-bottom,0px))' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 16, fontWeight: 800, color: '#1a1a1f' }}>
                  <span>Total</span>
                  <span style={{ color: brand }}>{fmtPrice(cartTotal, shop.currency)}</span>
                </div>
                <a href={`https://wa.me/${waPhone}?text=${encodeURIComponent(buildWhatsAppOrder(cart, shop, bookingUrl))}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 14, background: '#25D366', color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none', textAlign: 'center', boxSizing: 'border-box' }}>
                  📲 Order via WhatsApp
                </a>
                <div style={{ textAlign: 'center', fontSize: 11, color: '#9b6070', marginTop: 8 }}>
                  Your order will be sent to {shop.name} on WhatsApp for confirmation
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ IMAGE LIGHTBOX ════════════════════════════════════════════════ */}
      {imgModal && (
        <div onClick={() => setImgModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.88)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}>
          <img src={imgModal} alt="Product" className="scale-in"
            style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 12, objectFit: 'contain' }} />
          <button onClick={() => setImgModal(null)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,.18)', border: 'none', borderRadius: '50%', width: 36, height: 36, color: '#fff', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}

    </div>
  )
}