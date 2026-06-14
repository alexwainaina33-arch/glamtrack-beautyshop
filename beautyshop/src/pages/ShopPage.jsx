import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import pb, { C, PB_URL } from '../lib/pb'

const CAT_EMOJI = {
  hair: '💇', nails: '💅', skin: '✨', body: '💆',
  lashes: '👁️', makeup: '💄', other: '🌸'
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

export default function ShopPage() {
  const { slug } = useParams()
  const [shop, setShop]         = useState(null)
  const [services, setServices] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [tab, setTab]           = useState('services')

  useEffect(() => {
    const load = async () => {
      try {
        const shopRes = await pb.collection(C.SHOPS).getFirstListItem(
          `slug="${slug}"`, { '$autoCancel': false }
        )
        setShop(shopRes)
        const [svcs, prods] = await Promise.all([
          pb.collection(C.SERVICES).getList(1, 100, {
            filter: `shop_id="${shopRes.id}" && is_active=true`,
            sort: 'category,name', '$autoCancel': false,
          }).then(r => r.items),
          pb.collection(C.PRODUCTS).getList(1, 100, {
            filter: `shop_id="${shopRes.id}" && status="active"`,
            sort: 'name', '$autoCancel': false,
          }).then(r => r.items),
        ])
        setServices(svcs)
        setProducts(prods)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #f0e4e8', borderTop: '3px solid #c8456a', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: '#8b2550', fontSize: 15 }}>Loading…</p>
      </div>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020' }}>Shop not found</h2>
        <p style={{ color: '#9b6070' }}>This link may be incorrect or the shop may have moved.</p>
      </div>
    </div>
  )

  const brand = shop.brand_color || '#c8456a'
  const logoUrl = shop.logo
    ? `${PB_URL}/api/files/${shop.collectionId}/${shop.id}/${shop.logo}?thumb=400x400`
    : null
  const bookingUrl = `${window.location.origin}/book/${shop.slug}`

  const groupedServices = services.reduce((acc, svc) => {
    const cat = svc.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(svc)
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100vh', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}.fade-up{animation:fadeUp 0.4s ease forwards}`}</style>

      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${brand}, ${brand}cc)`, padding: '36px 24px 28px', textAlign: 'center' }}>
        {logoUrl
          ? <img src={logoUrl} alt={shop.name} style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)', margin: '0 auto 14px', display: 'block' }} />
          : <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 40 }}>🏪</div>
        }
        <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#fff', fontSize: 26, margin: '0 0 6px' }}>{shop.name}</h1>
        {shop.business_type && <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{shop.business_type}</p>}
        {shop.address && <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '0 0 3px' }}>📍 {shop.address}</p>}
        {shop.phone   && <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '0 0 0' }}>📞 {shop.phone}</p>}

        {/* Book CTA */}
        <a href={bookingUrl}
          style={{ display: 'inline-block', marginTop: 18, padding: '13px 32px', borderRadius: 14, background: '#fff', color: brand, fontWeight: 800, fontSize: 15, textDecoration: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          📅 Book Appointment
        </a>

        {/* Social links */}
        {(shop.instagram || shop.website) && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 14 }}>
            {shop.instagram && (
              <a href={`https://instagram.com/${shop.instagram.replace('@','')}`} target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                📸 {shop.instagram}
              </a>
            )}
            {shop.website && (
              <a href={shop.website} target="_blank" rel="noopener noreferrer"
                style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                🌐 Website
              </a>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      {products.length > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #f0e4e8', padding: '0 24px', display: 'flex', gap: 0 }}>
          {['services','products'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '14px 20px', border: 'none', borderBottom: tab === t ? `3px solid ${brand}` : '3px solid transparent', background: 'none', fontWeight: 700, fontSize: 13, color: tab === t ? brand : '#9b6070', cursor: 'pointer', fontFamily: 'Nunito,sans-serif', textTransform: 'capitalize' }}>
              {t === 'services' ? `💅 Services (${services.length})` : `🛍️ Products (${products.length})`}
            </button>
          ))}
        </div>
      )}

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 80px' }}>

        {/* Services */}
        {tab === 'services' && (
          <div className="fade-up">
            {services.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9b6070' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💅</div>
                <p>No services listed yet. Call us to enquire.</p>
                {shop.phone && <a href={`tel:${shop.phone}`} style={{ color: brand, fontWeight: 700 }}>{shop.phone}</a>}
              </div>
            ) : (
              Object.entries(groupedServices).map(([cat, svcs]) => (
                <div key={cat} style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {CAT_EMOJI[cat] || '✨'} {cat}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {svcs.map(svc => (
                      <div key={svc.id} style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1.5px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1f' }}>{svc.name}</div>
                          {svc.description && <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{svc.description}</div>}
                          <div style={{ fontSize: 12, color: '#9b6070', marginTop: 4 }}>⏱ {svc.duration_minutes} min</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 15, color: brand }}>{fmtPrice(svc.price_kes, shop.currency)}</div>
                          <a href={`${bookingUrl}?service=${encodeURIComponent(svc.name)}`}
                            style={{ padding: '6px 14px', borderRadius: 8, background: brand, color: '#fff', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                            Book
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Products */}
        {tab === 'products' && (
          <div className="fade-up">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
              {products.map(p => (
                <div key={p.id} style={{ background: '#fff', borderRadius: 14, padding: '14px', border: '1.5px solid #f0e4e8' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1f', marginBottom: 4 }}>{p.name}</div>
                  {p.brand && <div style={{ fontSize: 11, color: '#9b6070' }}>{p.brand}</div>}
                  <div style={{ fontWeight: 800, fontSize: 14, color: brand, marginTop: 6 }}>{fmtPrice(p.price_kes, shop.currency)}</div>
                  {p.stock_qty !== null && p.stock_qty <= 5 && p.stock_qty > 0 && (
                    <div style={{ fontSize: 10, color: '#d97706', fontWeight: 700, marginTop: 4 }}>Only {p.stock_qty} left</div>
                  )}
                  {p.stock_qty === 0 && (
                    <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, marginTop: 4 }}>Out of stock</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sticky book button */}
        {services.length > 0 && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px', background: '#fff', borderTop: '1px solid #f0e4e8', zIndex: 100 }}>
            <a href={bookingUrl}
              style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 14, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', textAlign: 'center', fontWeight: 800, fontSize: 16, textDecoration: 'none', boxSizing: 'border-box', boxShadow: `0 6px 20px ${brand}44` }}>
              📅 Book an Appointment
            </a>
          </div>
        )}

        {/* WhatsApp contact */}
        {shop.phone && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <a href={`https://wa.me/${shop.phone.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(`Hi ${shop.name}! I'd like to enquire about your services.`)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              📲 Chat on WhatsApp
            </a>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: '#c8b0b8', marginTop: 32 }}>
          Powered by <strong style={{ color: brand }}>SalesTrack</strong> · Run your business from your phone
        </p>
      </div>
    </div>
  )
}