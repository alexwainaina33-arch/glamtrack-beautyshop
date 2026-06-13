import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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

function fmtKES(n) {
  return `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`
}

function today() {
  return new Date().toISOString().split('T')[0]
}

export default function BookingPage() {
  const { slug } = useParams()
  const [shop, setShop]         = useState(null)
  const [services, setServices] = useState([])
  const [staff, setStaff]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [step, setStep]         = useState(1) // 1=service 2=details 3=confirm 4=done
  const [selected, setSelected] = useState({
    service: null, staff_id: '', date: today(),
    time: '09:00', name: '', phone: '', notes: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [bookingRef, setBookingRef] = useState('')
  const [error, setError]           = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        // Fetch shop by slug — public read allowed via viewRule
        const shopRes = await pb.collection(C.SHOPS).getFirstListItem(
          `slug="${slug}"`,
          { '$autoCancel': false }
        )
        setShop(shopRes)

        const [svcs, stf] = await Promise.all([
          pb.collection(C.SERVICES).getList(1, 100, {
            filter: `shop_id="${shopRes.id}" && is_active=true`,
            sort: 'name',
            '$autoCancel': false,
          }).then(r => r.items),
          pb.collection(C.STAFF).getList(1, 100, {
            filter: `shop_id="${shopRes.id}" && is_active=true`,
            sort: 'name',
            '$autoCancel': false,
          }).then(r => r.items),
        ])
        setServices(svcs)
        setStaff(stf)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [slug])

  const brand = shop?.brand_color || '#c8456a'

  const handleSubmit = async () => {
    setError('')
    if (!selected.name.trim()) return setError('Please enter your name.')
    if (!selected.phone.trim()) return setError('Please enter your phone number.')
    if (!selected.service)      return setError('Please select a service.')
    if (!selected.date)         return setError('Please select a date.')
    if (!selected.time)         return setError('Please select a time.')

    setSubmitting(true)
    try {
      const end_time = addMinutes(selected.time, selected.service.duration_minutes || 60)
      const ref = `BK-${Date.now().toString(36).toUpperCase()}`
      await pb.collection(C.APPOINTMENTS).create({
        shop_id:          shop.id,
        customer_name:    selected.name.trim(),
        customer_phone:   selected.phone.trim(),
        service_id:       selected.service.id,
        service_name:     selected.service.name,
        staff_id:         selected.staff_id || '',
        appt_date:        selected.date,
        start_time:       selected.time,
        end_time,
        duration_minutes: selected.service.duration_minutes || 60,
        price_kes:        selected.service.price_kes || 0,
        deposit_paid:     0,
        status:           'scheduled',
        notes:            selected.notes.trim(),
        reminder_sent:    false,
      })
      setBookingRef(ref)
      setStep(4)
    } catch (e) {
      setError('Booking failed. Please try again or call the shop directly.')
    } finally {
      setSubmitting(false)
    }
  }

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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}} .fade-up{animation:fadeUp 0.4s ease forwards}`}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${brand}, ${brand}cc)`, padding: '28px 24px 24px', textAlign: 'center' }}>
        {logoUrl && (
          <img src={logoUrl} alt={shop.name} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.4)', margin: '0 auto 12px', display: 'block' }} />
        )}
        {!logoUrl && (
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 32 }}>💅</div>
        )}
        <h1 style={{ fontFamily: 'Playfair Display,serif', color: '#fff', fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>{shop.name}</h1>
        {shop.address && <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: '0 0 4px' }}>📍 {shop.address}</p>}
        {shop.phone && <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: 0 }}>📞 {shop.phone}</p>}
      </div>

      {/* Step indicator */}
      {step < 4 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #f0e4e8', padding: '12px 24px', display: 'flex', justifyContent: 'center', gap: 8 }}>
          {['Service', 'Date & Time', 'Your Details'].map((label, i) => {
            const n = i + 1
            const active = step === n
            const done = step > n
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

        {/* STEP 1 — Service selection */}
        {step === 1 && (
          <div className="fade-up">
            <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', fontSize: 20, marginBottom: 16 }}>Choose a service</h2>
            {services.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 14, padding: 24, textAlign: 'center', color: '#9b6070' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>💅</div>
                <p>No services available yet. Please call us to book.</p>
                {shop.phone && <a href={`tel:${shop.phone}`} style={{ color: brand, fontWeight: 700 }}>{shop.phone}</a>}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {services.map(svc => (
                  <div key={svc.id}
                    onClick={() => { setSelected(s => ({ ...s, service: svc })); setStep(2) }}
                    style={{
                      background: '#fff', borderRadius: 14, padding: '16px 18px',
                      border: `2px solid ${selected.service?.id === svc.id ? brand : '#f0e4e8'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                      boxShadow: selected.service?.id === svc.id ? `0 4px 16px ${brand}22` : '0 1px 4px #0001',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 24 }}>{CAT_EMOJI[svc.category] || '💅'}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1f' }}>{svc.name}</div>
                          {svc.description && <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{svc.description}</div>}
                          <div style={{ fontSize: 12, color: '#9b6070', marginTop: 4 }}>⏱ {svc.duration_minutes} min</div>
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: brand, flexShrink: 0, marginLeft: 8 }}>{fmtKES(svc.price_kes)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2 — Date, time, staff */}
        {step === 2 && (
          <div className="fade-up">
            <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: brand, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>← Back</button>
            <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', fontSize: 20, marginBottom: 16 }}>Pick date & time</h2>

            {/* Selected service summary */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 20, border: `1px solid ${brand}33`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1f' }}>
                {CAT_EMOJI[selected.service?.category] || '💅'} {selected.service?.name}
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: brand }}>{fmtKES(selected.service?.price_kes)}</div>
            </div>

            {/* Date */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 8 }}>Date</label>
              <input
                type="date"
                min={today()}
                value={selected.date}
                onChange={e => setSelected(s => ({ ...s, date: e.target.value }))}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #f0e4e8', fontSize: 15, fontFamily: 'Nunito,sans-serif', outline: 'none', background: '#fff' }}
              />
            </div>

            {/* Time slots */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 8 }}>Time</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {TIMES.map(t => (
                  <div key={t}
                    onClick={() => setSelected(s => ({ ...s, time: t }))}
                    style={{
                      padding: '10px 4px', borderRadius: 10, textAlign: 'center', fontSize: 13, fontWeight: 700,
                      background: selected.time === t ? brand : '#fff',
                      color: selected.time === t ? '#fff' : '#3d1020',
                      border: `1.5px solid ${selected.time === t ? brand : '#f0e4e8'}`,
                      cursor: 'pointer', transition: 'all 0.1s',
                    }}
                  >{t}</div>
                ))}
              </div>
            </div>

            {/* Staff (optional) */}
            {staff.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 8 }}>Staff preference (optional)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div
                    onClick={() => setSelected(s => ({ ...s, staff_id: '' }))}
                    style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: !selected.staff_id ? brand : '#fff', color: !selected.staff_id ? '#fff' : '#3d1020', border: `1.5px solid ${!selected.staff_id ? brand : '#f0e4e8'}` }}
                  >Anyone available</div>
                  {staff.map(s => (
                    <div key={s.id}
                      onClick={() => setSelected(prev => ({ ...prev, staff_id: s.id }))}
                      style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: selected.staff_id === s.id ? brand : '#fff', color: selected.staff_id === s.id ? '#fff' : '#3d1020', border: `1.5px solid ${selected.staff_id === s.id ? brand : '#f0e4e8'}` }}
                    >{s.name}</div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setStep(3)}
              style={{ width: '100%', padding: '14px', borderRadius: 14, background: `linear-gradient(135deg,${brand},${brand}cc)`, color: '#fff', border: 'none', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', boxShadow: `0 6px 20px ${brand}44` }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* STEP 3 — Customer details */}
        {step === 3 && (
          <div className="fade-up">
            <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: brand, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}>← Back</button>
            <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', fontSize: 20, marginBottom: 16 }}>Your details</h2>

            {/* Booking summary */}
            <div style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #f0e4e8' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', marginBottom: 10 }}>Booking summary</div>
              {[
                { label: 'Service', value: `${CAT_EMOJI[selected.service?.category] || '💅'} ${selected.service?.name}` },
                { label: 'Date', value: selected.date },
                { label: 'Time', value: selected.time },
                { label: 'Duration', value: `${selected.service?.duration_minutes} min` },
                { label: 'Price', value: fmtKES(selected.service?.price_kes) },
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
                <input
                  placeholder="Full name"
                  value={selected.name}
                  onChange={e => setSelected(s => ({ ...s, name: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #f0e4e8', fontSize: 15, fontFamily: 'Nunito,sans-serif', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 6 }}>Phone number *</label>
                <input
                  placeholder="+254…"
                  type="tel"
                  value={selected.phone}
                  onChange={e => setSelected(s => ({ ...s, phone: e.target.value }))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #f0e4e8', fontSize: 15, fontFamily: 'Nunito,sans-serif', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', display: 'block', marginBottom: 6 }}>Special requests (optional)</label>
                <textarea
                  placeholder="Any preferences, allergies, special requests…"
                  value={selected.notes}
                  onChange={e => setSelected(s => ({ ...s, notes: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #f0e4e8', fontSize: 14, fontFamily: 'Nunito,sans-serif', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {error && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                  ⚠️ {error}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={{ width: '100%', padding: '15px', borderRadius: 14, background: submitting ? '#f0e4e8' : `linear-gradient(135deg,${brand},${brand}cc)`, color: submitting ? '#9b6070' : '#fff', border: 'none', fontWeight: 800, fontSize: 16, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'Nunito,sans-serif', boxShadow: submitting ? 'none' : `0 6px 20px ${brand}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
              >
                {submitting
                  ? <><div style={{ width: 16, height: 16, border: '2px solid #9b6070', borderTop: '2px solid #c8456a', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Booking…</>
                  : '✅ Confirm Booking'
                }
              </button>
            </div>
          </div>
        )}

        {/* STEP 4 — Success */}
        {step === 4 && (
          <div className="fade-up" style={{ textAlign: 'center', paddingTop: 20 }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#d1fae5', border: '3px solid #059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 36 }}>✅</div>
            <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#3d1020', fontSize: 24, marginBottom: 8 }}>You're booked!</h2>
            <p style={{ color: '#9b6070', fontSize: 14, marginBottom: 24 }}>
              {shop.name} will confirm your appointment shortly.
            </p>

            <div style={{ background: '#fff', borderRadius: 14, padding: '20px 20px', marginBottom: 24, border: '1px solid #f0e4e8', textAlign: 'left' }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', marginBottom: 12 }}>Appointment details</div>
              {[
                { label: 'Service', value: selected.service?.name },
                { label: 'Date', value: selected.date },
                { label: 'Time', value: selected.time },
                { label: 'Price', value: fmtKES(selected.service?.price_kes) },
                { label: 'Name', value: selected.name },
                { label: 'Phone', value: selected.phone },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 5 ? '1px solid #f5edf0' : 'none', fontSize: 13 }}>
                  <span style={{ color: '#9b6070' }}>{r.label}</span>
                  <span style={{ fontWeight: 700, color: '#1a1a1f' }}>{r.value}</span>
                </div>
              ))}
            </div>

            {shop.phone && (
              <a
                href={`https://wa.me/${shop.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello ' + shop.name + '! I just booked a ' + (selected.service?.name || '') + ' appointment for ' + selected.date + ' at ' + selected.time + '. My name is ' + selected.name + '. Please confirm. Thank you!')}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 14, background: '#25D366', color: '#fff', border: 'none', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', textDecoration: 'none', textAlign: 'center', marginBottom: 12, boxSizing: 'border-box' }}
              >
                📲 Confirm on WhatsApp
              </a>
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