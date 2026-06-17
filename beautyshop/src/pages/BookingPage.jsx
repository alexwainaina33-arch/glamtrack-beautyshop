import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import pb, { C, PB_URL } from '../lib/pb'

const CAT_EMOJI = {
  hair: '💇', nails: '💅', skin: '✨', body: '💆',
  lashes: '👁️', makeup: '💄', other: '🌸'
}

const TIMES = Array.from({ length: 26 }, (_, i) => {
  const h = Math.floor(i / 2) + 8
  const m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
}).filter(t => t <= '20:00')

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function fmtPrice(n, currency) {
  const amount = Number(n)
  switch ((currency || 'KES').toUpperCase()) {
    case 'USD': return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    case 'GBP': return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`
    case 'EUR': return `€${amount.toLocaleString('en-EU', { minimumFractionDigits: 0 })}`
    default:    return `KES ${amount.toLocaleString('en-KE', { minimumFractionDigits: 0 })}`
  }
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function smartDefaultTime() {
  const now = new Date()
  const totalMins = now.getHours() * 60 + now.getMinutes() + 30
  const slotMins  = Math.ceil(totalMins / 30) * 30
  const slotH     = Math.floor(slotMins / 60)
  const slotStr   = `${String(slotH).padStart(2, '0')}:${String(slotMins % 60).padStart(2, '0')}`
  if (slotH >= 8 && slotStr <= '20:00') return { time: slotStr, date: today() }
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  return { time: '09:00', date: tomorrow.toISOString().split('T')[0] }
}

function timeAgo(isoStr) {
  if (!isoStr) return null
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60)     return 'just now'
  if (diff < 3600)   return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400)  return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) > 1 ? 's' : ''} ago`
  if (diff < 172800) return 'yesterday'
  return null
}

// LIVE CLOCK — updates every second
function useLiveClock() {
  const [time, setTime] = useState(() => {
    const now = new Date()
    return now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  })
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }))
    }, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

export default function BookingPage() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const liveTime = useLiveClock()

  const [shop, setShop]         = useState(null)
  const [services, setServices] = useState([])
  const [staff, setStaff]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [lastBookedAgo, setLastBookedAgo] = useState(null)

  const smartDefaults = smartDefaultTime()
  const [step, setStep]     = useState(1)
  const [selected, setSelected] = useState({
    services: [], staff_id: '', date: smartDefaults.date,
    time: smartDefaults.time, name: '', phone: '', notes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const shopRes = await pb.collection(C.SHOPS).getFirstListItem(
          `slug="${slug}"`, { '$autoCancel': false }
        )
        setShop(shopRes)

        // GOLDMINE #2 — restore returning customer
        const saved = (() => {
          try { return JSON.parse(localStorage.getItem(`booking_${slug}`)) } catch { return null }
        })()
        if (saved?.name || saved?.phone) {
          setSelected(s => ({ ...s, name: saved.name || '', phone: saved.phone || '' }))
        }

        const [svcs, stf] = await Promise.all([
          pb.collection(C.SERVICES).getList(1, 100, {
            filter: `shop_id="${shopRes.id}" && is_active=true`,
            sort: 'name', '$autoCancel': false,
          }).then(r => r.items),
          pb.collection(C.STAFF).getList(1, 100, {
            filter: `shop_id="${shopRes.id}" && is_active=true`,
            sort: 'name', '$autoCancel': false,
          }).then(r => r.items),
        ])
        setServices(svcs)
        setStaff(stf)

        // GOLDMINE #6 — social proof: last booking
        try {
          const lastRes = await pb.collection(C.APPOINTMENTS).getList(1, 1, {
            filter: `shop_id="${shopRes.id}"`,
            sort: '-created', '$autoCancel': false,
          })
          if (lastRes.items.length > 0) {
            const ago = timeAgo(lastRes.items[0].created)
            if (ago) setLastBookedAgo(ago)
          }
        } catch { /* non-critical */ }

        // GOLDMINE #1 — URL param ?service=Name deep-link
        const serviceParam = searchParams.get('service')
        if (serviceParam && svcs.length > 0) {
          const match = svcs.find(s => s.name.toLowerCase() === serviceParam.toLowerCase().trim())
          if (match) { setSelected(s => ({ ...s, services: [match] })); setStep(2) }
        }

      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug, searchParams])

  const brand    = shop?.brand_color || '#c8456a'
  const currency = shop?.currency    || 'KES'

  // GOLDMINE G4 — WhatsApp message (used both for auto-open and the manual button)
  const buildWaMessage = (shopData, sel) => {
    if (!shopData || !sel.services?.length) return ''
    const fmtDate = new Date(sel.date + 'T12:00:00').toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    const svcLines = sel.services.map(s => `   • ${s.name} (${s.duration_minutes} min)`).join('\n')
    const total = sel.services.reduce((sum, s) => sum + (s.price_kes || 0), 0)
    return encodeURIComponent(
      `💅 *Booking Request — ${shopData.name}*\n\nHi! I'd like to confirm my appointment:\n\n▸ *Name:* ${sel.name}\n▸ *Date:* ${fmtDate}\n▸ *Time:* ${sel.time}\n▸ *Phone:* ${sel.phone}\n\n*Services:*\n${svcLines}\n\n▸ *Total:* ${fmtPrice(total, shopData.currency)}\n\nPlease confirm. Thank you! 🙏`
    )
  }

  const handleSubmit = async () => {
    setError('')
    if (!selected.name.trim())       return setError('Please enter your name.')
    if (!selected.phone.trim())      return setError('Please enter your phone number.')
    if (!selected.services?.length)  return setError('Please select at least one service.')
    if (!selected.date)              return setError('Please select a date.')
    if (!selected.time)              return setError('Please select a time.')

    setSubmitting(true)
    try {
      // Chain appointments sequentially — end time of service N = start time of service N+1
      let currentStart = selected.time
      for (const svc of selected.services) {
        const end_time = addMinutes(currentStart, svc.duration_minutes || 60)
        await pb.collection(C.APPOINTMENTS).create({
          shop_id:          shop.id,
          customer_name:    selected.name.trim(),
          customer_phone:   selected.phone.trim(),
          service_id:       svc.id,
          service_name:     svc.name,
          staff_id:         selected.staff_id || '',
          appt_date:        selected.date,
          start_time:       currentStart,
          end_time,
          duration_minutes: svc.duration_minutes || 60,
          price_kes:        svc.price_kes || 0,
          deposit_paid:     0,
          status:           'scheduled',
          notes:            selected.notes.trim(),
          reminder_sent:    false,
        })
        currentStart = end_time
      }
      // GOLDMINE #2 — save for next visit
      try { localStorage.setItem(`booking_${slug}`, JSON.stringify({ name: selected.name.trim(), phone: selected.phone.trim() })) } catch {}

      // GOLDMINE G3 — auto-open WhatsApp immediately on successful booking
      // Open before setStep(4) so the browser popup fires while still in the user gesture
      if (shop.phone) {
        const waUrl = `https://wa.me/${shop.phone.replace(/[^0-9]/g, '')}?text=${buildWaMessage(shop, selected)}`
        window.open(waUrl, '_blank')
      }

      setStep(4)
    } catch {
      setError('Booking failed. Please try again or call the shop directly.')
    } finally {
      setSubmitting(false)
    }
  }

  // waMessage for the manual "Confirm on WhatsApp" button on Step 4 (fallback)
  const waMessage = buildWaMessage(shop, selected)

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf5f7' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid #f0e4e8', borderTop: '3px solid #c8456a', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 16px' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: '#8b2550', fontFamily: 'Nunito,sans-serif', fontSize: 15 }}>Loading booking page…</p>
      </div>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
        <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', marginBottom: 8 }}>Shop not found</h2>
        <p style={{ color: '#9b6070' }}>This booking link may be incorrect or the shop may have moved.</p>
      </div>
    </div>
  )

  const logoUrl = shop.logo
    ? `${PB_URL}/api/files/${shop.collectionId}/${shop.id}/${shop.logo}?thumb=200x200`
    : null

  return (
    <div style={{ minHeight: '100vh', background: '#fdf5f7', fontFamily: 'Nunito,sans-serif' }}>
      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeUp  { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulseDot{ 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes tickIn  { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
        .fade-up { animation: fadeUp 0.4s ease forwards }
      `}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${brand}, ${brand}cc)`, padding: '28px 24px 20px', textAlign: 'center' }}>
        {logoUrl ? (
          <img src={logoUrl} alt={shop.name} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)', margin: '0 auto 12px', display: 'block' }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 32 }}>💅</div>
        )}
        <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#fff', fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>{shop.name}</h1>
        {shop.address && <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '0 0 3px' }}>📍 {shop.address}</p>}
        {shop.phone   && <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '0 0 0' }}>📞 {shop.phone}</p>}

        {/* LIVE CLOCK */}
        <div style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: 600, letterSpacing: '0.04em', animation: 'tickIn 0.3s ease' }}>
          🕐 {liveTime}
        </div>

        {/* GOLDMINE #6 — social proof */}
        {lastBookedAgo && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '5px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.18)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'pulseDot 1.8s ease infinite' }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>Last booking: {lastBookedAgo}</span>
          </div>
        )}
      </div>

      {/* Step indicator */}
      {step < 4 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #f0e4e8', padding: '12px 24px', display: 'flex', justifyContent: 'center', gap: 8 }}>
          {['Service', 'Date & Time', 'Your Details'].map((label, i) => {
            const n = i + 1; const active = step === n; const done = step > n
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: done ? '#059669' : active ? brand : '#f0e4e8', color: done || active ? '#fff' : '#9b6070', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  {done ? '✓' : n}
                </div>
                <span style={{ fontSize: 12, fontWeight: done || active ? 700 : 400, color: done ? '#059669' : active ? brand : '#9b6070' }}>{label}</span>
                {i < 2 && <div style={{ width: 20, height: 1, background: '#f0e4e8', margin: '0 2px' }} />}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 60px' }}>

        {/* STEP 1 — Service selection (multi-select cart) */}
        {step === 1 && (
          <div className="fade-up">
            <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', fontSize: 20, marginBottom: 4 }}>Choose your services</h2>
            <p style={{ fontSize: 13, color: '#9b6070', marginBottom: 16 }}>Tap to add — you can book multiple services in one appointment.</p>
            {services.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 14, padding: 24, textAlign: 'center', color: '#9b6070' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💅</div>
                <p>No services available yet. Please call us to book.</p>
                {shop.phone && <a href={`tel:${shop.phone}`} style={{ color: brand, fontWeight: 700 }}>{shop.phone}</a>}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {services.map(svc => {
                    const inCart = selected.services.some(s => s.id === svc.id)
                    return (
                      <div key={svc.id}
                        onClick={() => setSelected(s => ({
                          ...s,
                          services: inCart
                            ? s.services.filter(x => x.id !== svc.id)
                            : [...s.services, svc]
                        }))}
                        style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: `2px solid ${inCart ? brand : '#f0e4e8'}`, cursor: 'pointer', transition: 'all 0.15s', boxShadow: inCart ? `0 4px 16px ${brand}22` : '0 1px 4px #0001', position: 'relative' }}
                      >
                        {inCart && (
                          <div style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: '50%', background: brand, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', fontWeight: 800 }}>✓</div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 24 }}>{CAT_EMOJI[svc.category] || '💅'}</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1f' }}>{svc.name}</div>
                              {svc.description && <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{svc.description}</div>}
                              <div style={{ fontSize: 12, color: '#9b6070', marginTop: 4 }}>⏱ {svc.duration_minutes} min</div>
                            </div>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 16, color: brand, flexShrink: 0, marginLeft: 8 }}>{fmtPrice(svc.price_kes, currency)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Cart summary + proceed button */}
                {selected.services.length > 0 && (
                  <div style={{ position: 'sticky', bottom: 16, marginTop: 16, background: '#fff', borderRadius: 16, padding: '16px 18px', boxShadow: `0 8px 32px ${brand}33`, border: `2px solid ${brand}` }}>
                    <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9b6070', marginBottom: 8 }}>Your selection</div>
                    {selected.services.map(s => (
                      <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                        <span style={{ color: '#1a1a1f' }}>{CAT_EMOJI[s.category] || '💅'} {s.name}</span>
                        <span style={{ fontWeight: 700, color: brand }}>{fmtPrice(s.price_kes, currency)}</span>
                      </div>
                    ))}
                    <div style={{ borderTop: `1px solid ${brand}22`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, color: '#9b6070' }}>Total · {selected.services.reduce((t, s) => t + (s.duration_minutes || 60), 0)} min</div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: brand }}>{fmtPrice(selected.services.reduce((t, s) => t + (s.price_kes || 0), 0), currency)}</div>
                      </div>
                      <button onClick={() => setStep(2)}
                        style={{ padding: '12px 24px', borderRadius: 12, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: `0 4px 14px ${brand}44` }}
                      >Continue →</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 2 — Date, time, staff */}
        {step === 2 && (
          <div className="fade-up">
            <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: brand, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>← Back</button>
            <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', fontSize: 20, marginBottom: 16 }}>Pick date & time</h2>

            <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 20, border: `1px solid ${brand}33` }}>
              {selected.services.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1f' }}>{CAT_EMOJI[s.category] || '💅'} {s.name} <span style={{ fontWeight: 400, color: '#9b6070' }}>· {s.duration_minutes} min</span></div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: brand, marginLeft: 8 }}>{fmtPrice(s.price_kes, currency)}</div>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${brand}22`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: '#9b6070' }}>Total · {selected.services.reduce((t, s) => t + (s.duration_minutes || 60), 0)} min</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: brand }}>{fmtPrice(selected.services.reduce((t, s) => t + (s.price_kes || 0), 0), currency)}</div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 8 }}>Date</label>
              <input type="date" min={today()} value={selected.date}
                onChange={e => setSelected(s => ({ ...s, date: e.target.value }))}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #f0e4e8', fontSize: 15, fontFamily: 'Nunito,sans-serif', outline: 'none', background: '#fff', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 8 }}>Time</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {TIMES.map(t => (
                  <div key={t} onClick={() => setSelected(s => ({ ...s, time: t }))}
                    style={{ padding: '10px 4px', borderRadius: 10, textAlign: 'center', fontSize: 13, fontWeight: 700, background: selected.time === t ? brand : '#fff', color: selected.time === t ? '#fff' : '#3d1020', border: `1.5px solid ${selected.time === t ? brand : '#f0e4e8'}`, cursor: 'pointer', transition: 'all 0.1s' }}
                  >{t}</div>
                ))}
              </div>
            </div>

            {staff.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 8 }}>Staff preference (optional)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div onClick={() => setSelected(s => ({ ...s, staff_id: '' }))}
                    style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: !selected.staff_id ? brand : '#fff', color: !selected.staff_id ? '#fff' : '#3d1020', border: `1.5px solid ${!selected.staff_id ? brand : '#f0e4e8'}` }}
                  >Anyone available</div>
                  {staff.map(s => (
                    <div key={s.id} onClick={() => setSelected(prev => ({ ...prev, staff_id: s.id }))}
                      style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: selected.staff_id === s.id ? brand : '#fff', color: selected.staff_id === s.id ? '#fff' : '#3d1020', border: `1.5px solid ${selected.staff_id === s.id ? brand : '#f0e4e8'}` }}
                    >{s.name}</div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={() => setStep(3)}
              style={{ width: '100%', padding: '14px', borderRadius: 14, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', border: 'none', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', boxShadow: `0 6px 20px ${brand}44` }}
            >Continue →</button>
          </div>
        )}

        {/* STEP 3 — Customer details */}
        {step === 3 && (
          <div className="fade-up">
            <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: brand, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>← Back</button>
            <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', fontSize: 20, marginBottom: 16 }}>Your details</h2>

            <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #f0e4e8' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', marginBottom: 10 }}>Booking summary</div>
              {[
                { label: 'Services', value: selected.services.map(s => s.name).join(', ') },
                { label: 'Date',     value: selected.date },
                { label: 'Time',     value: selected.time },
                { label: 'Duration', value: `${selected.services.reduce((t, s) => t + (s.duration_minutes || 60), 0)} min total` },
                { label: 'Total',    value: fmtPrice(selected.services.reduce((t, s) => t + (s.price_kes || 0), 0), currency) },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: i < 4 ? '1px solid #f5edf0' : 'none', fontSize: 13 }}>
                  <span style={{ color: '#9b6070' }}>{r.label}</span>
                  <span style={{ fontWeight: 700, color: '#1a1a1f' }}>{r.value}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 6 }}>Your name *</label>
                <input placeholder="Full name" value={selected.name}
                  onChange={e => setSelected(s => ({ ...s, name: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #f0e4e8', fontSize: 15, fontFamily: 'Nunito,sans-serif', outline: 'none', boxSizing: 'border-box' }}
                />
                {selected.name && (() => { try { const s = JSON.parse(localStorage.getItem(`booking_${slug}`)); return s?.name === selected.name } catch { return false } })() && (
                  <div style={{ fontSize: 11, color: '#059669', marginTop: 4, fontWeight: 600 }}>✓ Welcome back!</div>
                )}
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 6 }}>Phone number *</label>
                <input placeholder="+254…" type="tel" value={selected.phone}
                  onChange={e => setSelected(s => ({ ...s, phone: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #f0e4e8', fontSize: 15, fontFamily: 'Nunito,sans-serif', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 6 }}>Special requests (optional)</label>
                <textarea placeholder="Any preferences, allergies, special requests…" value={selected.notes}
                  onChange={e => setSelected(s => ({ ...s, notes: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #f0e4e8', fontSize: 14, fontFamily: 'Nunito,sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {error && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>⚠️ {error}</div>
              )}

              <button onClick={handleSubmit} disabled={submitting}
                style={{ width: '100%', padding: '15px', borderRadius: 14, background: submitting ? '#f0e4e8' : `linear-gradient(135deg,${brand},${brand}cc)`, color: submitting ? '#9b6070' : '#fff', border: 'none', fontWeight: 800, fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Nunito,sans-serif', boxShadow: submitting ? 'none' : `0 6px 20px ${brand}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 52, marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
              >
                {submitting ? <><div style={{ width: 16, height: 16, border: '2px solid #9b6070', borderTop: '2px solid #c8456a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Booking…</> : '✅ Confirm Booking'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Success */}
        {step === 4 && (
          <div className="fade-up" style={{ textAlign: 'center', paddingTop: 20 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#d1fae5', border: '3px solid #059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 36 }}>✅</div>
            <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', fontSize: 24, marginBottom: 8 }}>You're booked!</h2>
            <p style={{ color: '#9b6070', fontSize: 14, marginBottom: 4 }}>{shop.name} will confirm your appointment shortly.</p>
            {/* G3 — let user know WhatsApp was already opened */}
            {shop.phone && (
              <p style={{ color: '#059669', fontSize: 13, fontWeight: 600, marginBottom: 20 }}>📲 WhatsApp opened automatically — just hit Send!</p>
            )}

            <div style={{ background: '#fff', borderRadius: 14, padding: '20px', marginBottom: 24, border: '1px solid #f0e4e8', textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', marginBottom: 12 }}>Appointment details</div>
              {[
                { label: 'Services', value: selected.services.map(s => s.name).join(', ') },
                { label: 'Date',    value: selected.date },
                { label: 'Time',    value: selected.time },
                { label: 'Total',   value: fmtPrice(selected.services.reduce((t, s) => t + (s.price_kes || 0), 0), currency) },
                { label: 'Name',    value: selected.name },
                { label: 'Phone',   value: selected.phone },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 5 ? '1px solid #f5edf0' : 'none', fontSize: 13 }}>
                  <span style={{ color: '#9b6070' }}>{r.label}</span>
                  <span style={{ fontWeight: 700, color: '#1a1a1f' }}>{r.value}</span>
                </div>
              ))}
            </div>

            {/* G3 — fallback manual button in case popup was blocked */}
            {shop.phone && (
              <a href={`https://wa.me/${shop.phone.replace(/[^0-9]/g, '')}?text=${waMessage}`}
                target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 14, background: '#25D366', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', textDecoration: 'none', textAlign: 'center', marginBottom: 12, boxSizing: 'border-box' }}
              >📲 Confirm on WhatsApp</a>
            )}

            <p style={{ fontSize: 12, color: '#b09090', marginTop: 16 }}>
              Powered by <strong style={{ color: brand }}>SalesTrack</strong> · Booking system for African businesses
            </p>
          </div>
        )}
      </div>
    </div>
  )
}