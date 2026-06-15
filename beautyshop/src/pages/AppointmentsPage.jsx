import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES } from '../lib/utils'
import { format, addDays, subDays, isToday } from 'date-fns'
import { Plus, ChevronLeft, ChevronRight, Clock, X, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const STATUS = {
  scheduled:   { bg: '#dbeafe', color: '#1d4ed8', label: 'Scheduled',   emoji: '📅' },
  confirmed:   { bg: '#d1fae5', color: '#065f46', label: 'Confirmed',   emoji: '✅' },
  in_progress: { bg: '#fef3c7', color: '#92400e', label: 'In Progress', emoji: '⏳' },
  completed:   { bg: '#d1fae5', color: '#065f46', label: 'Completed',   emoji: '🎉' },
  cancelled:   { bg: '#fee2e2', color: '#991b1b', label: 'Cancelled',   emoji: '❌' },
  no_show:     { bg: '#fef9c3', color: '#713f12', label: 'No Show',     emoji: '👻' },
}

const CAT_EMOJI = { hair: '💇', nails: '💅', skin: '✨', body: '💆', lashes: '👁️', makeup: '💄', other: '🌸' }

const DAY_START   = 8
const PX_PER_HOUR = 80
const TOTAL_HOURS = 13

function addMinutesToTime(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
}

export default function AppointmentsPage() {
  const { shop } = useAuth()
  const navigate  = useNavigate()

  const [selectedDate, setSelectedDate] = useState(new Date())
  const [appointments, setAppointments] = useState([])
  const [services,     setServices]     = useState([])
  const [staff,        setStaff]        = useState([])
  const [customers,    setCustomers]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)
  const [selectedAppt, setSelectedAppt] = useState(null)
  const [showDetail,   setShowDetail]   = useState(false)

  // GOLDMINE — share links panel
  const [showShareLinks, setShowShareLinks] = useState(false)
  const [copiedId,       setCopiedId]       = useState(null)

  const emptyForm = {
    customer_name: '', customer_phone: '', customer_id: '',
    service_id: '', service_name: '', staff_id: '',
    appt_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '09:00', duration_minutes: 60, price_kes: 0,
    notes: '', deposit_paid: 0, status: 'scheduled'
  }
  const [form,       setForm]       = useState(emptyForm)
  const [editId,     setEditId]     = useState(null)
  const [custSearch, setCustSearch] = useState('')

  useEffect(() => { if (shop) loadAll() }, [shop, selectedDate])

  const loadAll = async () => {
    setLoading(true)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const [appts, svcs, stf, custs] = await Promise.all([
        pb.collection(C.APPOINTMENTS).getList(1, 200, {
          filter: `shop_id="${shop.id}" && appt_date="${dateStr}"`,
          expand: 'service_id,staff_id,customer_id',
          sort:   'start_time',
          '$cancelKey': 'appts-load',
        }).then(r => r.items),
        pb.collection(C.SERVICES).getList(1, 200, {
          filter: `shop_id="${shop.id}" && is_active=true`, sort: 'name',
          '$cancelKey': 'svcs-load',
        }).then(r => r.items),
        pb.collection(C.STAFF).getList(1, 200, {
          filter: `shop_id="${shop.id}" && is_active=true`, sort: 'name',
          '$cancelKey': 'stf-load',
        }).then(r => r.items),
        pb.collection(C.CUSTOMERS).getList(1, 500, {
          filter: `shop_id="${shop.id}"`, sort: 'name',
          '$cancelKey': 'custs-load',
        }).then(r => r.items),
      ])
      setAppointments(appts)
      setServices(svcs)
      setStaff(stf)
      setCustomers(custs)
    } catch (e) {
      console.error(e)
      toast.error('Failed to load appointments')
    } finally {
      setLoading(false)
    }
  }

  const openAdd = (time = '09:00') => {
    setEditId(null)
    setForm({ ...emptyForm, appt_date: format(selectedDate, 'yyyy-MM-dd'), start_time: time })
    setCustSearch('')
    setShowModal(true)
  }

  const openEdit = (appt) => {
    setEditId(appt.id)
    setForm({
      customer_name: appt.customer_name, customer_phone: appt.customer_phone || '',
      customer_id: appt.customer_id || '', service_id: appt.service_id || '',
      service_name: appt.service_name || '', staff_id: appt.staff_id || '',
      appt_date: appt.appt_date, start_time: appt.start_time,
      duration_minutes: appt.duration_minutes || 60, price_kes: appt.price_kes || 0,
      notes: appt.notes || '', deposit_paid: appt.deposit_paid || 0,
      status: appt.status || 'scheduled'
    })
    setCustSearch(appt.customer_name)
    setShowModal(true)
    setShowDetail(false)
  }

  const handleServiceChange = (serviceId) => {
    const svc = services.find(s => s.id === serviceId)
    setForm(f => ({
      ...f, service_id: serviceId,
      service_name:     svc?.name || '',
      duration_minutes: svc?.duration_minutes || 60,
      price_kes:        svc?.price_kes || 0,
    }))
  }

  const handleCustomerSelect = (c) => {
    setForm(f => ({ ...f, customer_id: c.id, customer_name: c.name, customer_phone: c.phone || '' }))
    setCustSearch(c.name)
  }

  const handleSave = async () => {
    if (!form.customer_name.trim()) return toast.error('Customer name required')
    if (!form.start_time)           return toast.error('Start time required')
    try {
      const end_time = addMinutesToTime(form.start_time, form.duration_minutes)
      const payload  = { ...form, end_time, shop_id: shop.id, created_by: pb.authStore.model?.id }
      if (editId) {
        await pb.collection(C.APPOINTMENTS).update(editId, payload)
        toast.success('Appointment updated!')
      } else {
        await pb.collection(C.APPOINTMENTS).create(payload)
        toast.success('Appointment booked! 📅')
      }
      setShowModal(false)
      loadAll()
    } catch (e) { toast.error('Failed to save: ' + e.message) }
  }

  const updateStatus = async (appt, newStatus) => {
    try {
      await pb.collection(C.APPOINTMENTS).update(appt.id, { status: newStatus })
      toast.success(`Status → ${STATUS[newStatus].label}`)
      setShowDetail(false)
      loadAll()
    } catch { toast.error('Failed to update status') }
  }

  const deleteAppt = async (appt) => {
    if (!confirm(`Delete this appointment for ${appt.customer_name}?`)) return
    try {
      await pb.collection(C.APPOINTMENTS).delete(appt.id)
      toast.success('Appointment deleted')
      setShowDetail(false)
      loadAll()
    } catch { toast.error('Failed to delete') }
  }

  // GOLDMINE G8 — "Book again" link appended to every reminder
  const bookingPageUrl = `${window.location.origin}/book/${shop?.slug}`

  const sendWhatsApp = (appt) => {
    const phone = appt.customer_phone?.replace(/[^0-9]/g, '')
    if (!phone) return toast.error('No phone number on this appointment')
    const dateFormatted = format(new Date(appt.appt_date), 'EEEE, dd MMMM yyyy')
    // G8 — append "book again" link so every reminder becomes a marketing message
    const msg = `✨ *${shop.name}*\n\n Hi ${appt.customer_name}! Your appointment is confirmed:\n\n▸ *Service:* ${appt.service_name || 'Service'}\n▸ *Date:* ${dateFormatted}\n▸ *Time:* ${appt.start_time}\n▸ *Price:* KES ${appt.price_kes?.toLocaleString() || 0}\n\nPlease arrive 5 minutes early. We can't wait to see you! 💅\n\n_Need to reschedule or book again?_\n👉 ${bookingPageUrl}`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
    pb.collection(C.APPOINTMENTS).update(appt.id, { reminder_sent: true }).catch(() => {})
    toast.success('WhatsApp reminder sent! 📲')
    loadAll()
  }

  // GOLDMINE — "Remind All" bulk WhatsApp for today's pending appointments
  const remindAll = () => {
    const pending = appointments.filter(a => ['scheduled','confirmed'].includes(a.status) && a.customer_phone)
    if (pending.length === 0) return toast.error('No pending appointments with phone numbers to remind')
    pending.forEach((appt, i) => {
      setTimeout(() => sendWhatsApp(appt), i * 800) // stagger to avoid popup blockers
    })
    toast.success(`Opening WhatsApp for ${pending.length} customer${pending.length > 1 ? 's' : ''}…`)
  }

  const convertToSale = (appt) => {
    window.location.href = '/app/pos'
    toast.success(`Open for ${appt.customer_name} — ${appt.service_name}`)
  }

  // GOLDMINE — copy per-service booking link
  const copyServiceLink = (svc) => {
    const url = `${window.location.origin}/book/${shop.slug}?service=${encodeURIComponent(svc.name)}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(svc.id)
      toast.success(`Link copied for "${svc.name}"`)
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(() => toast.error('Could not copy — try manually'))
  }

  const shareServiceWhatsApp = (svc) => {
    const url = `${window.location.origin}/book/${shop.slug}?service=${encodeURIComponent(svc.name)}`
    const msg = `Book *${svc.name}* at ${shop.name} — ${svc.duration_minutes} min · KES ${svc.price_kes?.toLocaleString()}\n\n👉 ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // Stats
  const total       = appointments.length
  const confirmed   = appointments.filter(a => ['confirmed','in_progress'].includes(a.status)).length
  const completed   = appointments.filter(a => a.status === 'completed').length
  const noShows     = appointments.filter(a => a.status === 'no_show').length
  const expectedRev = appointments.filter(a => !['cancelled','no_show'].includes(a.status)).reduce((s,a) => s + (a.price_kes || 0), 0)
  // GOLDMINE — no-show rate + lost revenue
  const noShowRate  = total > 0 ? Math.round((noShows / total) * 100) : 0
  const lostRev     = appointments.filter(a => a.status === 'no_show').reduce((s,a) => s + (a.price_kes || 0), 0)

  const getApptStyle = (appt) => {
    const [h, m] = appt.start_time.split(':').map(Number)
    const minsFromStart = (h - DAY_START) * 60 + m
    const top    = minsFromStart * (PX_PER_HOUR / 60)
    const height = Math.max((appt.duration_minutes || 60) * (PX_PER_HOUR / 60), 40)
    return { top, height }
  }

  const filteredCusts = custSearch.length > 1
    ? customers.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()) || (c.phone || '').includes(custSearch)).slice(0, 5)
    : []

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Appointments 💅</div>
          <div className="page-subtitle">Booking calendar · {format(selectedDate, 'EEEE, dd MMMM yyyy')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => setSelectedDate(new Date())}>Today</button>
          <button className="btn-secondary" style={{ padding: '8px 12px' }} onClick={() => setSelectedDate(d => subDays(d, 1))}><ChevronLeft size={16} /></button>
          <input className="input" type="date" value={format(selectedDate, 'yyyy-MM-dd')} onChange={e => setSelectedDate(new Date(e.target.value + 'T12:00:00'))} style={{ width: 160 }} />
          <button className="btn-secondary" style={{ padding: '8px 12px' }} onClick={() => setSelectedDate(d => addDays(d, 1))}><ChevronRight size={16} /></button>

          {/* GOLDMINE — Remind All button */}
          {appointments.filter(a => ['scheduled','confirmed'].includes(a.status) && a.customer_phone).length > 0 && (
            <button
              onClick={remindAll}
              style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              📲 Remind All ({appointments.filter(a => ['scheduled','confirmed'].includes(a.status) && a.customer_phone).length})
            </button>
          )}

          {/* GOLDMINE — Share booking links */}
          <button
            onClick={() => setShowShareLinks(v => !v)}
            style={{ padding: '8px 14px', borderRadius: 10, border: '1.5px solid #c8456a', background: showShareLinks ? '#c8456a' : '#fff', color: showShareLinks ? '#fff' : '#c8456a', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            🔗 Booking Links
          </button>

          <button className="btn-primary" onClick={() => openAdd()}>
            <Plus size={16} /> New Appointment
          </button>
        </div>
      </div>

      {/* GOLDMINE — Booking Links Panel */}
      {showShareLinks && (
        <div style={{ background: '#fff', border: '1.5px solid #f0e4e8', borderRadius: 14, padding: '20px 24px', marginBottom: 20, boxShadow: '0 4px 20px #c8456a11' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', fontWeight: 700 }}>🔗 Your Booking Links</div>
              <div style={{ fontSize: 12, color: '#9b6070', marginTop: 3 }}>Share these links on WhatsApp, Instagram bio, or print as QR codes</div>
            </div>
            <button onClick={() => setShowShareLinks(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="#9b6070" /></button>
          </div>

          {/* Main booking page link */}
          <div style={{ background: 'linear-gradient(135deg,#fce8ed,#fdf5f7)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, border: '1px solid #f0e4e8' }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9b6070', marginBottom: 6 }}>Main Booking Page</div>
            <div style={{ fontSize: 13, color: '#3d1020', fontWeight: 600, wordBreak: 'break-all', marginBottom: 10 }}>{bookingPageUrl}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => { navigator.clipboard.writeText(bookingPageUrl); toast.success('Main link copied!') }}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#c8456a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >📋 Copy Link</button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Book an appointment at ${shop?.name}! 💅\n\n👉 ${bookingPageUrl}`)}`}
                target="_blank" rel="noopener noreferrer"
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >📲 Share on WhatsApp</a>
              {/* QR code — free, no API key, no dep */}
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(bookingPageUrl)}&size=300x300&margin=10`}
                target="_blank" rel="noopener noreferrer"
                style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #f0e4e8', background: '#fff', color: '#3d1020', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >🖨️ QR Code</a>
            </div>
          </div>

          {/* Per-service links */}
          {services.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9b6070', marginBottom: 10 }}>Per-Service Links (send one link per service to customers)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {services.map(svc => {
                  const link = `${window.location.origin}/book/${shop?.slug}?service=${encodeURIComponent(svc.name)}`
                  return (
                    <div key={svc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fdf5f7', borderRadius: 10, border: '1px solid #f0e4e8', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 18 }}>{CAT_EMOJI[svc.category] || '💅'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1f' }}>{svc.name}</div>
                        <div style={{ fontSize: 11, color: '#9b6070', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => copyServiceLink(svc)}
                          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: copiedId === svc.id ? '#059669' : '#c8456a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'background 0.2s', minWidth: 64, display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          {copiedId === svc.id ? <><Check size={12} /> Copied!</> : '📋 Copy'}
                        </button>
                        <button
                          onClick={() => shareServiceWhatsApp(svc)}
                          style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                        >📲</button>
                        <a
                          href={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(link)}&size=300x300&margin=10`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #f0e4e8', background: '#fff', color: '#3d1020', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'none' }}
                        >🖨️</a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats — now includes no-show rate */}
      <div className="appt-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: "Today's Bookings",   value: total,           color: '#c8456a', icon: '📅' },
          { label: 'Confirmed / Active', value: confirmed,       color: '#3b82f6', icon: '✅' },
          { label: 'Completed',          value: completed,       color: '#059669', icon: '🎉' },
          { label: 'Expected Revenue',   value: fmtKES(expectedRev), color: '#d97706', icon: '💰' },
          // GOLDMINE — no-show stat card
          {
            label:   lostRev > 0 ? `No-shows · ${fmtKES(lostRev)} lost` : 'No-show Rate',
            value:   `${noShowRate}%`,
            color:   noShowRate > 20 ? '#dc2626' : noShowRate > 10 ? '#d97706' : '#059669',
            icon:    '👻',
          },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: 'default' }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: i === 4 ? 20 : 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {services.length === 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 12, padding: '14px 20px', marginBottom: 20, fontSize: 14, color: '#92400e' }}>
          ⚠️ No services found. Go to <strong>Staff & Commissions</strong> → Services tab to add your service menu first.
        </div>
      )}

      {/* Main layout: timeline + sidebar */}
      <div className="appt-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>

        {/* Timeline */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: 0 }}>
              {isToday(selectedDate) ? "Today's Schedule" : format(selectedDate, 'EEE dd MMM')}
            </h3>
            <span style={{ fontSize: 12, color: '#9b6070' }}>{total} appointment{total !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 700 }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: 56, flexShrink: 0 }}>
                {Array.from({ length: TOTAL_HOURS }, (_, i) => i + DAY_START).map(h => (
                  <div key={h} style={{ height: PX_PER_HOUR, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 10, paddingTop: 6 }}>
                    <span style={{ fontSize: 11, color: '#9b6070', fontWeight: 600 }}>{String(h).padStart(2,'0')}:00</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, position: 'relative', borderLeft: '1px solid #f0e4e8' }}>
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div key={i} style={{ height: PX_PER_HOUR, borderBottom: '1px dashed #f0e4e8', cursor: 'pointer' }}
                    onClick={() => openAdd(`${String(i + DAY_START).padStart(2,'0')}:00`)} />
                ))}
                {appointments.map(appt => {
                  const { top, height } = getApptStyle(appt)
                  const st  = STATUS[appt.status] || STATUS.scheduled
                  const svc = appt.expand?.service_id
                  return (
                    <div key={appt.id}
                      onClick={() => { setSelectedAppt(appt); setShowDetail(true) }}
                      style={{ position: 'absolute', left: 8, right: 8, top, height, background: st.bg, border: `1.5px solid ${st.color}33`, borderLeft: `4px solid ${st.color}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s', boxShadow: '0 1px 4px #0001', zIndex: 1 }}
                      onMouseOver={e => e.currentTarget.style.transform = 'translateX(2px)'}
                      onMouseOut={e  => e.currentTarget.style.transform = 'none'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: st.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {CAT_EMOJI[svc?.category] || '💅'} {appt.customer_name}
                        </div>
                        <span style={{ fontSize: 10, background: st.color + '22', color: st.color, padding: '1px 6px', borderRadius: 10, fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>{st.emoji}</span>
                      </div>
                      {height > 45 && (
                        <div style={{ fontSize: 11, color: '#6b4050', marginTop: 2 }}>
                          {appt.service_name || svc?.name || 'Service'} · {appt.start_time} – {appt.end_time}
                        </div>
                      )}
                      {height > 60 && appt.expand?.staff_id && (
                        <div style={{ fontSize: 10, color: '#9b6070', marginTop: 2 }}>👩 {appt.expand.staff_id.name}</div>
                      )}
                    </div>
                  )
                })}
                {loading && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff8' }}>
                    <div className="spinner" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #f5edf0' }}>
              <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 15, color: '#3d1020', margin: 0 }}>Booking List</h3>
            </div>
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {appointments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9b6070' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                  <div style={{ fontSize: 13 }}>No appointments</div>
                  <button className="btn-primary" style={{ marginTop: 12, fontSize: 12 }} onClick={() => openAdd()}>
                    <Plus size={14} /> Book First
                  </button>
                </div>
              ) : appointments.map(appt => {
                const st = STATUS[appt.status] || STATUS.scheduled
                return (
                  <div key={appt.id} onClick={() => { setSelectedAppt(appt); setShowDetail(true) }}
                    style={{ padding: '12px 16px', borderBottom: '1px solid #f5edf0', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseOver={e => e.currentTarget.style.background = '#fef5f7'}
                    onMouseOut={e  => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1f' }}>{appt.customer_name}</span>
                      <span style={{ fontSize: 10, background: st.bg, color: st.color, padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>{st.emoji} {st.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#9b6070' }}>
                      <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
                      {appt.start_time} · {appt.service_name || 'Service'}
                    </div>
                    {appt.expand?.staff_id && (
                      <div style={{ fontSize: 11, color: '#b09090', marginTop: 2 }}>👩 {appt.expand.staff_id.name}</div>
                    )}
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#c8456a', marginTop: 4 }}>{fmtKES(appt.price_kes || 0)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000055', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px #0003' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', margin: 0 }}>
                {editId ? 'Edit Appointment' : '📅 New Appointment'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} color="#9b6070" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Customer *</label>
                <div style={{ position: 'relative' }}>
                  <input className="input" placeholder="Search by name or phone…"
                    value={custSearch}
                    onChange={e => { setCustSearch(e.target.value); setForm(f => ({ ...f, customer_name: e.target.value, customer_id: '' })) }}
                  />
                  {filteredCusts.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #f0e4e8', borderRadius: 10, boxShadow: '0 4px 20px #0002', zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
                      {filteredCusts.map(c => (
                        <div key={c.id} onClick={() => handleCustomerSelect(c)}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f5edf0', fontSize: 13 }}
                          onMouseOver={e => e.currentTarget.style.background = '#fef5f7'}
                          onMouseOut={e  => e.currentTarget.style.background = '#fff'}
                        >
                          <div style={{ fontWeight: 600 }}>{c.name}</div>
                          {c.phone && <div style={{ color: '#9b6070', fontSize: 11 }}>{c.phone}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Phone</label>
                <input className="input" placeholder="+254…" value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} />
              </div>

              <div>
                <label className="label">Service</label>
                <select className="input" value={form.service_id} onChange={e => handleServiceChange(e.target.value)}>
                  <option value="">— Select service —</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{CAT_EMOJI[s.category] || '💅'} {s.name} — {s.duration_minutes}min — {fmtKES(s.price_kes)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Staff Member</label>
                <select className="input" value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                  <option value="">— Any available —</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role || 'staff'})</option>)}
                </select>
              </div>

              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Date *</label>
                  <input className="input" type="date" value={form.appt_date} onChange={e => setForm(f => ({ ...f, appt_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Start Time *</label>
                  <input className="input" type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
              </div>

              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Duration (minutes)</label>
                  <input className="input" type="number" min={15} step={15} value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 60 }))} />
                </div>
                <div>
                  <label className="label">Price (KES)</label>
                  <input className="input" type="number" min={0} value={form.price_kes} onChange={e => setForm(f => ({ ...f, price_kes: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>

              <div>
                <label className="label">Deposit Paid (KES)</label>
                <input className="input" type="number" min={0} value={form.deposit_paid} onChange={e => setForm(f => ({ ...f, deposit_paid: parseFloat(e.target.value) || 0 }))} placeholder="0" />
              </div>

              {editId && (
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} placeholder="Any special requests, allergies, preferences…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>

              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-primary" style={{ flex: 2 }} onClick={handleSave}>
                  {editId ? '💾 Save Changes' : '📅 Book Appointment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && selectedAppt && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000055', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowDetail(false)}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px #0003' }}>
            {(() => {
              const appt      = selectedAppt
              const st        = STATUS[appt.status] || STATUS.scheduled
              const svc       = appt.expand?.service_id
              const stf       = appt.expand?.staff_id
              const remaining = (appt.price_kes || 0) - (appt.deposit_paid || 0)
              return (
                <>
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', fontWeight: 700 }}>{appt.customer_name}</div>
                      <span style={{ fontSize: 12, background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>{st.emoji} {st.label}</span>
                    </div>
                    <button onClick={() => setShowDetail(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} color="#9b6070" /></button>
                  </div>
                  <div style={{ padding: '20px 24px' }}>
                    {[
                      { icon: '💅', label: 'Service',     value: appt.service_name || svc?.name || '—' },
                      { icon: '👩', label: 'Staff',       value: stf?.name || 'Any available' },
                      { icon: '📅', label: 'Date',        value: format(new Date(appt.appt_date + 'T12:00:00'), 'EEEE, dd MMMM yyyy') },
                      { icon: '⏰', label: 'Time',        value: `${appt.start_time} – ${appt.end_time} (${appt.duration_minutes}min)` },
                      { icon: '💰', label: 'Price',       value: fmtKES(appt.price_kes || 0) },
                      { icon: '🏦', label: 'Deposit',     value: fmtKES(appt.deposit_paid || 0) },
                      { icon: '💳', label: 'Balance Due', value: fmtKES(remaining) },
                    ].map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f5edf0', fontSize: 13 }}>
                        <span style={{ color: '#6b4050' }}>{r.icon} {r.label}</span>
                        <span style={{ fontWeight: 600, color: '#1a1a1f' }}>{r.value}</span>
                      </div>
                    ))}
                    {appt.notes && (
                      <div style={{ marginTop: 12, background: '#fef5f7', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#6b4050', fontStyle: 'italic' }}>📝 {appt.notes}</div>
                    )}

                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', marginBottom: 8 }}>Update Status</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {appt.status !== 'confirmed' && (
                          <button onClick={() => updateStatus(appt, 'confirmed')} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#d1fae5', color: '#065f46', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✅ Confirm</button>
                        )}
                        {appt.status !== 'in_progress' && ['confirmed','scheduled'].includes(appt.status) && (
                          <button onClick={() => updateStatus(appt, 'in_progress')} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>⏳ Start</button>
                        )}
                        {!['completed','cancelled'].includes(appt.status) && (
                          <button onClick={() => updateStatus(appt, 'completed')} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#c8456a', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>🎉 Complete</button>
                        )}
                        {!['cancelled','completed'].includes(appt.status) && (
                          <button onClick={() => updateStatus(appt, 'cancelled')} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>❌ Cancel</button>
                        )}
                        {!['cancelled','completed'].includes(appt.status) && (
                          <button onClick={() => updateStatus(appt, 'no_show')} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#fef9c3', color: '#713f12', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>👻 No Show</button>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                      <button onClick={() => sendWhatsApp(appt)} style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        📲 {appt.reminder_sent ? 'Re-send' : 'Send'} Reminder
                      </button>
                      <button onClick={() => openEdit(appt)} style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #f0e4e8', background: '#fff', color: '#8b2550', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>✏️ Edit</button>
                      {['completed','confirmed','in_progress'].includes(appt.status) && (
                        <button onClick={() => convertToSale(appt)} style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#c8456a,#8b2550)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🛒 POS</button>
                      )}
                      <button onClick={() => deleteAppt(appt)} style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: '#fee2e2', color: '#dc2626', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>🗑️</button>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}