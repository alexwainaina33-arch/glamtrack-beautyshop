import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate } from '../lib/utils'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { Plus, X, Edit, TrendingUp, Award, Scissors } from 'lucide-react'
import toast from 'react-hot-toast'

const ROLES = ['stylist','nail_tech','skin_therapist','lash_tech','receptionist','manager','cashier']
const ROLE_EMOJI = { stylist: '💇', nail_tech: '💅', skin_therapist: '✨', lash_tech: '👁️', receptionist: '📞', manager: '👑', cashier: '💰' }
const COMMISSION_TYPES = [
  { value: 'none', label: 'No Commission' },
  { value: 'percent_of_sale', label: '% of Sale Revenue' },
  { value: 'percent_of_profit', label: '% of Gross Profit' },
  { value: 'flat_per_service', label: 'Flat KES per Service' },
]
const CAT_EMOJI = { hair: '💇', nails: '💅', skin: '✨', body: '💆', lashes: '👁️', makeup: '💄', other: '🌸' }

const calcCommission = (staff, sales) => {
  if (!staff.commission_type || staff.commission_type === 'none') return 0
  const revenue = sales.reduce((s, x) => s + (x.total_kes || 0), 0)
  const profit = sales.reduce((s, x) => s + (x.gross_profit_kes || 0), 0)
  const val = staff.commission_value || 0
  if (staff.commission_type === 'percent_of_sale') return revenue * (val / 100)
  if (staff.commission_type === 'percent_of_profit') return profit * (val / 100)
  if (staff.commission_type === 'flat_per_service') return sales.length * val
  return 0
}

// ─── Exported helper: send WhatsApp notification to a staff member ───────────
// Called from AppointmentsPage when a booking is created or reassigned.
// staffMember = bs_staff record (must have .phone and .name)
// appointment = { customer_name, service_name, appt_date, start_time }
// shopName = shop.name string
export const notifyStaffWhatsApp = (staffMember, appointment, shopName) => {
  if (!staffMember?.phone) return // no phone = silent, never crash
  const toWa = (p) => {
    let n = p.replace(/[^\d+]/g, '')
    if (n.startsWith('+')) n = n.slice(1)
    if (n.startsWith('0')) n = '254' + n.slice(1)
    if (!n.startsWith('254') && n.length === 9) n = '254' + n
    return n
  }
  const phone = toWa(staffMember.phone)
  if (!phone) return
  const msg = encodeURIComponent(
    `👋 Hi *${staffMember.name}*!\n\nNew booking assigned to you:\n\n` +
    `Service\n*${appointment.service_name || 'N/A'}*\n\n` +
    `Customer\n*${appointment.customer_name}*\n\n` +
    `Date & Time\n*${appointment.appt_date} at ${appointment.start_time}*\n\n` +
    `_${shopName} · Powered by SalesTrack_`
  )
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
}

export default function StaffPage() {
  const { shop } = useAuth()
  const [tab, setTab] = useState(0) // 0=Staff, 1=Leaderboard, 2=Services, 3=Payouts, 4=Attendance
  const [staff, setStaff] = useState([])
  const [services, setServices] = useState([])
  const [payouts, setPayouts] = useState([])
  const [allSales, setAllSales] = useState([])
  const [admins, setAdmins] = useState([])
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(true)
  const [showStaffModal, setShowStaffModal] = useState(false)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [editStaffId, setEditStaffId] = useState(null)
  const [editServiceId, setEditServiceId] = useState(null)
  const [payoutStaff, setPayoutStaff] = useState(null)
  const [receiptPayout, setReceiptPayout] = useState(null)
  const [clockingId, setClockingId] = useState(null)
  const [viewDate, setViewDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const thisMonth = { from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(endOfMonth(new Date()), 'yyyy-MM-dd') }
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const emptyStaffForm = { name: '', phone: '', role: 'stylist', commission_type: 'none', commission_value: 0, monthly_target_kes: 0, admin_id: '', hire_date: '', notes: '', is_active: true }
  const emptySvcForm = { name: '', category: 'hair', duration_minutes: 60, price_kes: 0, description: '', color: '#c8456a', is_active: true }
  const [staffForm, setStaffForm] = useState(emptyStaffForm)
  const [svcForm, setSvcForm] = useState(emptySvcForm)
  const [payoutForm, setPayoutForm] = useState({ period_from: thisMonth.from, period_to: thisMonth.to, commission_kes: 0, payment_method: 'cash', notes: '' })

  useEffect(() => { if (shop) loadAll() }, [shop])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [stf, svcs, pays, sales, shopAdmins, att] = await Promise.all([
        pb.collection(C.STAFF).getList(1, 200, { filter: `shop_id="${shop.id}"`, sort: 'name', '$cancelKey': 'staff-list' }).then(r => r.items),
        pb.collection(C.SERVICES).getList(1, 200, { filter: `shop_id="${shop.id}"`, sort: 'category,name', '$cancelKey': 'staff-svcs' }).then(r => r.items),
        pb.collection(C.COMMISSION_PAYOUTS).getList(1, 200, { filter: `shop_id="${shop.id}"`, expand: 'staff_id', sort: '-created', '$cancelKey': 'staff-pays' }).then(r => r.items),
        pb.collection(C.SALES).getList(1, 500, { filter: `shop_id="${shop.id}" && status="completed"`, '$cancelKey': 'staff-sales' }).then(r => r.items),
        // SECURITY FIX: only show admins who belong to THIS shop — never fetch global bs_admins
        pb.collection(C.SHOP_ADMINS).getList(1, 100, {
          filter: `shop_id="${shop.id}"`,
          expand: 'admin_id',
          '$cancelKey': 'staff-adms',
        }).then(r => r.items.map(sa => sa.expand?.admin_id).filter(Boolean)),
        pb.collection(C.ATTENDANCE).getList(1, 500, { filter: `shop_id="${shop.id}" && date>="${format(startOfMonth(new Date()), 'yyyy-MM-dd')}" && date<="${format(endOfMonth(new Date()), 'yyyy-MM-dd')}"`, sort: '-created', '$cancelKey': 'staff-att' }).then(r => r.items),
      ])
      setStaff(stf)
      setServices(svcs)
      setPayouts(pays)
      setAllSales(sales)
      setAdmins(shopAdmins)
      setAttendance(att)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // Get sales for a staff member this month (matched via admin_id → served_by)
  const getSalesForStaff = (staffMember, from = thisMonth.from, to = thisMonth.to) => {
    if (!staffMember.admin_id) return []
    return allSales.filter(s => {
      if (s.served_by !== staffMember.admin_id) return false
      const d = s.created ? s.created.slice(0, 10) : null
      if (!d) return true
      return d >= from && d <= to
    })
  }

  // Attendance helpers
  const toPbDate = (d) => d.toISOString().replace('T', ' ').slice(0, 23) + 'Z'
  const getTodayRecord = (staffId) => attendance.find(a => a.staff_id === staffId && a.date === todayStr && a.status === 'clocked_in')
  const getStaffAttendanceRecords = (staffId) => attendance.filter(a => a.staff_id === staffId)
  const hoursWorked = (rec) => {
    if (!rec.clock_in || !rec.clock_out) return 0
    return (new Date(rec.clock_out) - new Date(rec.clock_in)) / 3600000
  }
  const handleClockToggle = async (staffMember) => {
    setClockingId(staffMember.id)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const fresh = await pb.collection(C.ATTENDANCE).getList(1, 10, {
        filter: `shop_id="${shop.id}" && staff_id="${staffMember.id}" && date="${today}" && status="clocked_in"`,
        sort: '-created',
      })
      const open = fresh.items[0] || null
      if (open) {
        await pb.collection(C.ATTENDANCE).update(open.id, {
          clock_out: toPbDate(new Date()),
          status: 'clocked_out',
        })
        toast.success(`${staffMember.name} clocked out ⏰`)
      } else {
        await pb.collection(C.ATTENDANCE).create({
          shop_id: shop.id,
          staff_id: staffMember.id,
          date: today,
          clock_in: toPbDate(new Date()),
          status: 'clocked_in',
          recorded_by: pb.authStore.model?.id,
        })
        toast.success(`${staffMember.name} clocked in ⏰`)
      }
      loadAll()
    } catch (e) { toast.error('Failed: ' + (e?.data?.message || e.message)) }
    finally { setClockingId(null) }
  }

  // WhatsApp commission receipt
  const toWaPhone = (phone) => {
    if (!phone) return ''
    let p = phone.replace(/[^\d+]/g, '')
    if (p.startsWith('+')) p = p.slice(1)
    if (p.startsWith('0')) p = '254' + p.slice(1)
    if (!p.startsWith('254') && p.length === 9) p = '254' + p
    return p
  }
  const buildPayoutWaMessage = (payout, staffMember) => {
    const methodLabel = payout.payment_method === 'cash' ? 'Cash' : payout.payment_method === 'mpesa' ? 'M-Pesa' : 'Bank Transfer'
    return `🧾 *Commission Payment Receipt*\n\nStaff\n*${staffMember.name}*\n\nPeriod\n*${payout.period_from} → ${payout.period_to}*\n\nSales Handled\n*${fmtKES(payout.total_sales_kes || 0)}*\n\nCommission Paid\n*${fmtKES(payout.commission_kes)}*\n\nPayment Method\n*${methodLabel}*\n\nDate Paid\n*${payout.paid_date || todayStr}*\n\n_${shop.name} · Powered by SalesTrack_`
  }
  const sendPayoutWhatsApp = (payout, staffMember) => {
    const phone = toWaPhone(staffMember?.phone)
    if (!phone) return toast.error('No phone number on file for this staff member')
    const msg = encodeURIComponent(buildPayoutWaMessage(payout, staffMember))
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank')
  }

  // Staff modal
  const openAddStaff = () => { setEditStaffId(null); setStaffForm(emptyStaffForm); setShowStaffModal(true) }
  const openEditStaff = (s) => {
    setEditStaffId(s.id)
    setStaffForm({ name: s.name, phone: s.phone || '', role: s.role || 'stylist', commission_type: s.commission_type || 'none', commission_value: s.commission_value || 0, monthly_target_kes: s.monthly_target_kes || 0, admin_id: s.admin_id || '', hire_date: s.hire_date?.split('T')[0] || '', notes: s.notes || '', is_active: s.is_active !== false })
    setShowStaffModal(true)
  }
  const saveStaff = async () => {
    if (!staffForm.name.trim()) return toast.error('Name required')
    try {
      const payload = { ...staffForm, shop_id: shop.id }
      if (editStaffId) await pb.collection(C.STAFF).update(editStaffId, payload)
      else await pb.collection(C.STAFF).create(payload)
      toast.success(editStaffId ? 'Staff updated!' : 'Staff member added! 👩')
      setShowStaffModal(false); loadAll()
    } catch (e) { toast.error('Failed: ' + e.message) }
  }
  const toggleStaffActive = async (s) => {
    await pb.collection(C.STAFF).update(s.id, { is_active: !s.is_active })
    toast.success(s.is_active ? 'Staff deactivated' : 'Staff activated')
    loadAll()
  }

  // Service modal
  const openAddService = () => { setEditServiceId(null); setSvcForm(emptySvcForm); setShowServiceModal(true) }
  const openEditService = (s) => {
    setEditServiceId(s.id)
    setSvcForm({ name: s.name, category: s.category || 'hair', duration_minutes: s.duration_minutes || 60, price_kes: s.price_kes || 0, description: s.description || '', color: s.color || '#c8456a', is_active: s.is_active !== false })
    setShowServiceModal(true)
  }
  const saveService = async () => {
    if (!svcForm.name.trim()) return toast.error('Service name required')
    if (!svcForm.price_kes) return toast.error('Price required')
    try {
      const payload = { ...svcForm, shop_id: shop.id }
      if (editServiceId) await pb.collection(C.SERVICES).update(editServiceId, payload)
      else await pb.collection(C.SERVICES).create(payload)
      toast.success(editServiceId ? 'Service updated!' : 'Service added! 💅')
      setShowServiceModal(false); loadAll()
    } catch (e) { toast.error('Failed: ' + e.message) }
  }
  const toggleServiceActive = async (s) => {
    await pb.collection(C.SERVICES).update(s.id, { is_active: !s.is_active })
    loadAll()
  }

  // Payout modal
  const openPayout = (staffMember) => {
    const sales = getSalesForStaff(staffMember)
    const commission = calcCommission(staffMember, sales)
    setPayoutStaff(staffMember)
    setPayoutForm({ period_from: thisMonth.from, period_to: thisMonth.to, commission_kes: Math.round(commission), payment_method: 'cash', notes: '' })
    setShowPayoutModal(true)
  }
  const savePayout = async () => {
    if (!payoutStaff) return
    try {
      const sales = getSalesForStaff(payoutStaff, payoutForm.period_from, payoutForm.period_to)
      const created = await pb.collection(C.COMMISSION_PAYOUTS).create({
        shop_id: shop.id,
        staff_id: payoutStaff.id,
        ...payoutForm,
        total_sales_kes: sales.reduce((s, x) => s + x.total_kes, 0),
        total_profit_kes: sales.reduce((s, x) => s + (x.gross_profit_kes || 0), 0),
        status: 'paid',
        paid_date: format(new Date(), 'yyyy-MM-dd'),
        created_by: pb.authStore.model?.id,
      })
      toast.success(`Commission of ${fmtKES(payoutForm.commission_kes)} paid to ${payoutStaff.name} ✅`)
      setShowPayoutModal(false)
      if (payoutStaff.phone) sendPayoutWhatsApp(created, payoutStaff)
      loadAll()
    } catch (e) { toast.error('Failed: ' + e.message) }
  }

  const totalMonthlyCommission = staff.reduce((sum, s) => sum + calcCommission(s, getSalesForStaff(s)), 0)
  const totalMonthlyRevenue = allSales.filter(s => {
    const d = s.created ? s.created.slice(0, 10) : null
    if (!d) return false
    return d >= thisMonth.from && d <= thisMonth.to
  }).reduce((s, x) => s + (x.total_kes || 0), 0)

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Staff & Commissions 👩‍💼</div>
          <div className="page-subtitle">{staff.filter(s => s.is_active).length} active staff · {services.filter(s => s.is_active).length} services · {format(new Date(), 'MMMM yyyy')}</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {tab === 0 && <button className="btn-primary" onClick={openAddStaff}><Plus size={16} /> Add Staff</button>}
          {tab === 2 && <button className="btn-primary" onClick={openAddService}><Plus size={16} /> Add Service</button>}
        </div>
      </div>

      {/* KPI row */}
      <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Active Staff', value: staff.filter(s => s.is_active).length, color: '#c8456a', icon: '👩‍💼' },
          { label: 'Services Offered', value: services.filter(s => s.is_active).length, color: '#3b82f6', icon: '💅' },
          { label: 'This Month Revenue', value: fmtKES(totalMonthlyRevenue), color: '#059669', icon: '💰' },
          { label: 'Commissions Due', value: fmtKES(totalMonthlyCommission), color: '#d97706', icon: '🏆' },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: 'default' }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-nav" style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {['👩‍💼 Staff', '🏆 Leaderboard', '💅 Services', '💸 Commission Payouts', '⏰ Attendance'].map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{ padding: '9px 18px', borderRadius: 10, border: tab !== i ? '1px solid #f0e4e8' : 'none', background: tab === i ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fff', color: tab === i ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 13, cursor: 'pointer', boxShadow: tab === i ? '0 4px 14px #c8456a44' : '0 1px 4px #0001', fontFamily: 'Nunito,sans-serif' }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><div className="spinner" /></div>
      ) : (
        <>
          {/* ═══ TAB 0: STAFF ═══ */}
          {tab === 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {staff.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 48, gridColumn: '1/-1' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>👩‍💼</div>
                  <p style={{ color: '#9b6070' }}>No staff yet. Add your first team member!</p>
                  <button className="btn-primary" style={{ marginTop: 12 }} onClick={openAddStaff}><Plus size={16} /> Add Staff</button>
                </div>
              )}
              {staff.map(s => {
                const monthSales = getSalesForStaff(s)
                const revenue = monthSales.reduce((sum, x) => sum + x.total_kes, 0)
                const profit = monthSales.reduce((sum, x) => sum + (x.gross_profit_kes || 0), 0)
                const commission = calcCommission(s, monthSales)
                const paidThisMonth = payouts.filter(p => p.staff_id === s.id && p.period_from >= thisMonth.from && p.status === 'paid').reduce((sum, p) => sum + p.commission_kes, 0)
                const outstanding = Math.max(0, commission - paidThisMonth)

                return (
                  <div key={s.id} className="card" style={{ opacity: s.is_active ? 1 : 0.6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#c8456a,#8b2550)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>
                          {s.name[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1f' }}>{s.name}</div>
                          <div style={{ fontSize: 12, color: '#9b6070' }}>{ROLE_EMOJI[s.role] || '👤'} {s.role?.replace(/_/g,' ') || 'Staff'}</div>
                          {s.phone && <div style={{ fontSize: 11, color: '#b09090' }}>{s.phone}</div>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEditStaff(s)} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#f5edf0', color: '#8b2550', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                        <button onClick={() => toggleStaffActive(s)} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: s.is_active ? '#fee2e2' : '#f0fdf4', color: s.is_active ? '#dc2626' : '#059669', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
                          {s.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>

                    {/* Commission info */}
                    <div style={{ background: '#fef5f7', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', marginBottom: 6 }}>Commission Rule</div>
                      {s.commission_type === 'none' ? (
                        <div style={{ fontSize: 13, color: '#9b6070' }}>No commission set</div>
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#c8456a' }}>
                          {s.commission_type === 'percent_of_sale' && `${s.commission_value}% of sale revenue`}
                          {s.commission_type === 'percent_of_profit' && `${s.commission_value}% of gross profit`}
                          {s.commission_type === 'flat_per_service' && `KES ${s.commission_value} per service`}
                        </div>
                      )}
                    </div>

                    {/* This month stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                      {[
                        { label: 'Sales', value: monthSales.length, color: '#3b82f6' },
                        { label: 'Revenue', value: fmtKES(revenue), color: '#059669' },
                        { label: 'Profit Gen.', value: fmtKES(profit), color: '#8b5cf6' },
                        { label: 'Commission', value: fmtKES(commission), color: '#d97706' },
                      ].map((k, i) => (
                        <div key={i} style={{ background: '#fafafa', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: k.color }}>{k.value}</div>
                          <div style={{ fontSize: 10, color: '#9b6070' }}>{k.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Target progress bar — only shown when monthly_target_kes > 0 */}
                    {s.monthly_target_kes > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9b6070', marginBottom: 4 }}>
                          <span>🎯 Target: {fmtKES(s.monthly_target_kes)}</span>
                          <span style={{ fontWeight: 700, color: revenue >= s.monthly_target_kes ? '#059669' : '#9b6070' }}>{Math.round((revenue / s.monthly_target_kes) * 100)}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 6, background: '#f0e4e8', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, (revenue / s.monthly_target_kes) * 100)}%`, borderRadius: 6, background: revenue >= s.monthly_target_kes ? 'linear-gradient(90deg,#059669,#10b981)' : (revenue / s.monthly_target_kes) >= 0.5 ? 'linear-gradient(90deg,#d97706,#f59e0b)' : 'linear-gradient(90deg,#c8456a,#8b2550)' }} />
                        </div>
                      </div>
                    )}

                    {/* Outstanding commission */}
                    {outstanding > 0 && (
                      <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>⚠️ Commission Due</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>{fmtKES(outstanding)}</span>
                      </div>
                    )}

                    {s.commission_type !== 'none' && outstanding > 0 && (
                      <button onClick={() => openPayout(s)} style={{ width: '100%', padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#d97706,#92400e)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        💸 Record Commission Payout
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* ═══ TAB 1: LEADERBOARD ═══ */}
          {tab === 1 && (() => {
            const ranked = staff
              .filter(s => s.is_active)
              .map(s => {
                const sales = getSalesForStaff(s)
                const revenue = sales.reduce((sum, x) => sum + (x.total_kes || 0), 0)
                const commission = calcCommission(s, sales)
                const pct = s.monthly_target_kes > 0 ? Math.round((revenue / s.monthly_target_kes) * 100) : null
                return { ...s, revenue, commission, salesCount: sales.length, pct }
              })
              .sort((a, b) => b.revenue - a.revenue)
            const topRevenue = ranked[0]?.revenue || 1
            return (
              <div>
                {ranked.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
                    <p style={{ color: '#9b6070' }}>Add staff and link them to system accounts to see the leaderboard.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Month label */}
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9b6070', padding: '0 4px' }}>
                      {format(new Date(), 'MMMM yyyy')} · ranked by revenue
                    </div>

                    {ranked.map((s, idx) => {
                      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
                      const barWidth = topRevenue > 0 ? (s.revenue / topRevenue) * 100 : 0
                      const isLeader = idx === 0 && s.revenue > 0
                      return (
                        <div key={s.id} className="card" style={{
                          border: isLeader ? '2px solid #d97706' : undefined,
                          background: isLeader ? 'linear-gradient(135deg,#fffbeb,#fff)' : undefined,
                          position: 'relative',
                          overflow: 'hidden',
                        }}>
                          {isLeader && (
                            <div style={{ position: 'absolute', top: 0, right: 0, background: 'linear-gradient(135deg,#d97706,#92400e)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: '0 0 0 10px' }}>
                              👑 TOP PERFORMER
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                            {/* Rank */}
                            <div style={{ fontSize: isLeader ? 28 : 20, fontWeight: 700, minWidth: 36, textAlign: 'center', flexShrink: 0 }}>{medal}</div>
                            {/* Avatar */}
                            <div style={{ width: 44, height: 44, borderRadius: '50%', background: isLeader ? 'linear-gradient(135deg,#d97706,#92400e)' : 'linear-gradient(135deg,#c8456a,#8b2550)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                              {s.name[0].toUpperCase()}
                            </div>
                            {/* Name + role */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1f' }}>{s.name}</div>
                              <div style={{ fontSize: 11, color: '#9b6070' }}>{ROLE_EMOJI[s.role] || '👤'} {s.role?.replace(/_/g, ' ')}</div>
                            </div>
                            {/* Revenue */}
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: isLeader ? '#d97706' : '#c8456a' }}>{fmtKES(s.revenue)}</div>
                              <div style={{ fontSize: 11, color: '#9b6070' }}>{s.salesCount} sale{s.salesCount !== 1 ? 's' : ''}</div>
                            </div>
                          </div>

                          {/* Revenue bar */}
                          <div style={{ height: 8, borderRadius: 6, background: '#f0e4e8', overflow: 'hidden', marginBottom: 10 }}>
                            <div style={{ height: '100%', width: `${barWidth}%`, borderRadius: 6, background: isLeader ? 'linear-gradient(90deg,#d97706,#f59e0b)' : 'linear-gradient(90deg,#c8456a,#8b2550)', transition: 'width 0.8s ease' }} />
                          </div>

                          {/* Stats row */}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {s.commission > 0 && (
                              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#92400e', fontWeight: 700 }}>
                                💸 {fmtKES(s.commission)} commission
                              </div>
                            )}
                            {s.pct !== null && (
                              <div style={{ background: s.pct >= 100 ? '#f0fdf4' : '#fef5f7', border: `1px solid ${s.pct >= 100 ? '#bbf7d0' : '#f0e4e8'}`, borderRadius: 8, padding: '4px 10px', fontSize: 11, color: s.pct >= 100 ? '#059669' : '#9b6070', fontWeight: 700 }}>
                                🎯 {s.pct}% of target
                              </div>
                            )}
                            {s.revenue === 0 && (
                              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: '#92400e' }}>
                                ⚠️ No sales this month
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {/* Summary footer */}
                    <div style={{ background: 'linear-gradient(135deg,#fdf5f7,#fff)', border: '1.5px solid #f0e4e8', borderRadius: 14, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#c8456a' }}>{fmtKES(ranked.reduce((s, x) => s + x.revenue, 0))}</div>
                        <div style={{ fontSize: 11, color: '#9b6070' }}>Total team revenue</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#d97706' }}>{fmtKES(ranked.reduce((s, x) => s + x.commission, 0))}</div>
                        <div style={{ fontSize: 11, color: '#9b6070' }}>Total commissions due</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#3b82f6' }}>{ranked.reduce((s, x) => s + x.salesCount, 0)}</div>
                        <div style={{ fontSize: 11, color: '#9b6070' }}>Total team sales</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* ═══ TAB 2: SERVICES ═══ */}
          {tab === 2 && (
            <div>
              {services.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>💅</div>
                  <p style={{ color: '#9b6070' }}>No services yet. Add your service menu!</p>
                  <button className="btn-primary" style={{ marginTop: 12 }} onClick={openAddService}><Plus size={16} /> Add First Service</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {services.map(s => (
                    <div key={s.id} className="card" style={{ opacity: s.is_active ? 1 : 0.5, position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color || '#c8456a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                            {CAT_EMOJI[s.category] || '💅'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1f' }}>{s.name}</div>
                            <div style={{ fontSize: 11, color: '#9b6070', textTransform: 'capitalize' }}>{s.category}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => openEditService(s)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: '#f5edf0', color: '#8b2550', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                          <button onClick={() => toggleServiceActive(s)} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: s.is_active ? '#fee2e2' : '#f0fdf4', color: s.is_active ? '#dc2626' : '#059669', cursor: 'pointer', fontSize: 11 }}>
                            {s.is_active ? 'Hide' : 'Show'}
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9b6070', fontSize: 13 }}>
                          ⏱️ {s.duration_minutes} min
                        </div>
                        <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#c8456a' }}>{fmtKES(s.price_kes)}</div>
                      </div>
                      {s.description && <div style={{ fontSize: 12, color: '#9b6070', marginTop: 8, fontStyle: 'italic' }}>{s.description}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB 3: PAYOUTS ═══ */}
          {tab === 3 && (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5edf0' }}>
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: 0 }}>Commission Payout History</h3>
              </div>
              {payouts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: '#9b6070' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💸</div>
                  <div>No payouts recorded yet.</div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Staff</th><th>Period</th><th>Sales</th><th>Commission</th><th>Method</th><th>Date Paid</th><th>Status</th><th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payouts.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.expand?.staff_id?.name || '—'}</td>
                          <td style={{ fontSize: 12, color: '#9b6070' }}>{p.period_from} → {p.period_to}</td>
                          <td>{fmtKES(p.total_sales_kes || 0)}</td>
                          <td style={{ fontWeight: 700, color: '#d97706' }}>{fmtKES(p.commission_kes)}</td>
                          <td style={{ fontSize: 12 }}>{p.payment_method === 'cash' ? '💵' : p.payment_method === 'mpesa' ? '📱' : '🏦'} {p.payment_method}</td>
                          <td style={{ fontSize: 12, color: '#9b6070' }}>{p.paid_date || '—'}</td>
                          <td><span style={{ background: '#f0fdf4', color: '#059669', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>✅ Paid</span></td>
                          <td>
                            <button onClick={() => { setReceiptPayout(p); setShowReceiptModal(true) }} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#f5edf0', color: '#8b2550', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>🧾 View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB 4: ATTENDANCE ═══ */}
          {tab === 4 && (
            <div>
              <div className="card" style={{ marginBottom: 18 }}>
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 14px' }}>⏰ Today's Clock In / Out</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                  {staff.filter(s => s.is_active).length === 0 && <div style={{ color: '#9b6070', fontSize: 13 }}>No active staff to clock in.</div>}
                  {staff.filter(s => s.is_active).map(s => {
                    const open = getTodayRecord(s.id)
                    return (
                      <div key={s.id} style={{ background: open ? '#f0fdf4' : '#fafafa', border: open ? '1px solid #bbf7d0' : '1px solid #f0e4e8', borderRadius: 12, padding: 12 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1f' }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: '#9b6070', marginBottom: 8 }}>
                          {open ? `🟢 Clocked in ${format(new Date(open.clock_in), 'HH:mm')}` : '⚪ Not clocked in'}
                        </div>
                        <button onClick={() => handleClockToggle(s)} disabled={clockingId === s.id}
                          style={{ width: '100%', minHeight: 44, borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: '#fff', background: open ? 'linear-gradient(135deg,#dc2626,#991b1b)' : 'linear-gradient(135deg,#059669,#047857)', opacity: clockingId === s.id ? 0.6 : 1 }}>
                          {clockingId === s.id ? 'Saving…' : open ? '⏹ Clock Out' : '▶️ Clock In'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: 0 }}>Attendance Log</h3>
                  <input className="input" type="date" value={viewDate} onChange={e => setViewDate(e.target.value)} style={{ maxWidth: 160 }} />
                </div>
                {attendance.filter(a => a.date === viewDate).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 48, color: '#9b6070' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>⏰</div>
                    <div>No attendance records for this date.</div>
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Staff</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {attendance.filter(a => a.date === viewDate).sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in)).map(a => {
                          const sMember = staff.find(x => x.id === a.staff_id)
                          return (
                            <tr key={a.id}>
                              <td style={{ fontWeight: 600 }}>{sMember?.name || '—'}</td>
                              <td style={{ fontSize: 12 }}>{a.clock_in ? format(new Date(a.clock_in), 'HH:mm') : '—'}</td>
                              <td style={{ fontSize: 12 }}>{a.clock_out ? format(new Date(a.clock_out), 'HH:mm') : '—'}</td>
                              <td style={{ fontSize: 12 }}>{a.clock_out ? hoursWorked(a).toFixed(1) + 'h' : '—'}</td>
                              <td>
                                <span style={{ background: a.status === 'clocked_in' ? '#fef3c7' : '#f0fdf4', color: a.status === 'clocked_in' ? '#92400e' : '#059669', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                                  {a.status === 'clocked_in' ? '🟢 On Duty' : '✅ Done'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Staff Modal */}
      {showStaffModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000055', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowStaffModal(false)}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px #0003' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', margin: 0 }}>{editStaffId ? 'Edit Staff' : '👩‍💼 Add Staff Member'}</h2>
              <button onClick={() => setShowStaffModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#9b6070" /></button>
            </div>
            <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Full Name *</label>
                  <input className="input" value={staffForm.name} onChange={e => setStaffForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Jane Wanjiku" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={staffForm.phone} onChange={e => setStaffForm(f => ({ ...f, phone: e.target.value }))} placeholder="+254…" />
                </div>
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={staffForm.role} onChange={e => setStaffForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_EMOJI[r] || '👤'} {r.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Commission Type</label>
                <select className="input" value={staffForm.commission_type} onChange={e => setStaffForm(f => ({ ...f, commission_type: e.target.value }))}>
                  {COMMISSION_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              {staffForm.commission_type !== 'none' && (
                <div>
                  <label className="label">
                    {staffForm.commission_type === 'flat_per_service' ? 'Amount per Service (KES)' : 'Commission % value'}
                  </label>
                  <input className="input" type="number" min={0} max={staffForm.commission_type.includes('percent') ? 100 : undefined}
                    value={staffForm.commission_value}
                    onChange={e => setStaffForm(f => ({ ...f, commission_value: parseFloat(e.target.value) || 0 }))}
                    placeholder={staffForm.commission_type.includes('percent') ? 'e.g. 10 for 10%' : 'e.g. 200'} />
                </div>
              )}
              <div>
                <label className="label">Monthly Revenue Target (KES)</label>
                <input className="input" type="number" min={0} value={staffForm.monthly_target_kes}
                  onChange={e => setStaffForm(f => ({ ...f, monthly_target_kes: parseFloat(e.target.value) || 0 }))}
                  placeholder="e.g. 50000 — leave 0 to hide the progress bar" />
              </div>
              <div>
                <label className="label">Link to App Login Account (optional)</label>
                <select className="input" value={staffForm.admin_id} onChange={e => setStaffForm(f => ({ ...f, admin_id: e.target.value }))}>
                  <option value="">— No login account linked —</option>
                  {admins.map(a => <option key={a.id} value={a.id}>{a.name} ({a.email})</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#9b6070', marginTop: 4 }}>
                  Only needed if this person also logs into SalesTrack (e.g. as a cashier).
                  Linking lets the system match their POS sales to their commission automatically.
                  Most service providers don't need a login — they get notified via WhatsApp only.
                </div>
              </div>
              <div>
                <label className="label">Hire Date</label>
                <input className="input" type="date" value={staffForm.hire_date} onChange={e => setStaffForm(f => ({ ...f, hire_date: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={staffForm.notes} onChange={e => setStaffForm(f => ({ ...f, notes: e.target.value }))} placeholder="Specialties, certifications, notes…" style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowStaffModal(false)}>Cancel</button>
                <button className="btn-primary" style={{ flex: 2 }} onClick={saveStaff}>{editStaffId ? '💾 Save' : '👩‍💼 Add Staff'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Service Modal */}
      {showServiceModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000055', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowServiceModal(false)}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px #0003' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', margin: 0 }}>{editServiceId ? 'Edit Service' : '💅 Add Service'}</h2>
              <button onClick={() => setShowServiceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#9b6070" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Service Name *</label>
                <input className="input" value={svcForm.name} onChange={e => setSvcForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Hair Wash & Blowdry" />
              </div>
              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Category</label>
                  <select className="input" value={svcForm.category} onChange={e => setSvcForm(f => ({ ...f, category: e.target.value }))}>
                    {['hair','nails','skin','body','lashes','makeup','other'].map(c => <option key={c} value={c}>{CAT_EMOJI[c]} {c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Duration (minutes) *</label>
                  <select className="input" value={svcForm.duration_minutes} onChange={e => setSvcForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))}>
                    {[15,30,45,60,90,120,150,180,240].map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Price (KES) *</label>
                <input className="input" type="number" min={0} value={svcForm.price_kes} onChange={e => setSvcForm(f => ({ ...f, price_kes: parseFloat(e.target.value) || 0 }))} placeholder="e.g. 1500" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input" rows={2} value={svcForm.description} onChange={e => setSvcForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of what's included…" style={{ resize: 'vertical' }} />
              </div>
              <div>
                <label className="label">Colour Tag</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['#c8456a','#3b82f6','#059669','#d97706','#8b5cf6','#ec4899','#0ea5e9','#f97316'].map(c => (
                    <button key={c} onClick={() => setSvcForm(f => ({ ...f, color: c }))}
                      style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: svcForm.color === c ? '3px solid #1a1a1f' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowServiceModal(false)}>Cancel</button>
                <button className="btn-primary" style={{ flex: 2 }} onClick={saveService}>{editServiceId ? '💾 Save' : '💅 Add Service'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commission Payout Modal */}
      {showPayoutModal && payoutStaff && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000055', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowPayoutModal(false)}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px #0003' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, color: '#3d1020', margin: 0 }}>💸 Pay Commission</h2>
              <button onClick={() => setShowPayoutModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#9b6070" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#fef5f7', borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 4 }}>👩‍💼</div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{payoutStaff.name}</div>
                <div style={{ fontSize: 12, color: '#9b6070' }}>{payoutStaff.role?.replace(/_/g,' ')}</div>
              </div>
              <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Period From</label>
                  <input className="input" type="date" value={payoutForm.period_from} onChange={e => setPayoutForm(f => ({ ...f, period_from: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Period To</label>
                  <input className="input" type="date" value={payoutForm.period_to} onChange={e => setPayoutForm(f => ({ ...f, period_to: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Commission Amount (KES) *</label>
                <input className="input" type="number" min={0} value={payoutForm.commission_kes}
                  onChange={e => setPayoutForm(f => ({ ...f, commission_kes: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label">Payment Method</label>
                <select className="input" value={payoutForm.payment_method} onChange={e => setPayoutForm(f => ({ ...f, payment_method: e.target.value }))}>
                  <option value="cash">💵 Cash</option>
                  <option value="mpesa">📱 M-Pesa</option>
                  <option value="bank">🏦 Bank Transfer</option>
                </select>
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input" value={payoutForm.notes} onChange={e => setPayoutForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note…" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowPayoutModal(false)}>Cancel</button>
                <button onClick={savePayout} style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#d97706,#92400e)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  ✅ Confirm Payout {fmtKES(payoutForm.commission_kes)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commission Payout Receipt Modal */}
      {showReceiptModal && receiptPayout && (
        <div style={{ position: 'fixed', inset: 0, background: '#00000055', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setShowReceiptModal(false)}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px #0003' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: 0 }}>🧾 Commission Receipt</h2>
              <button onClick={() => setShowReceiptModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#9b6070" /></button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: '#fef5f7', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#9b6070' }}>{receiptPayout.expand?.staff_id?.name || '—'}</div>
                <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 26, fontWeight: 700, color: '#c8456a', margin: '6px 0' }}>{fmtKES(receiptPayout.commission_kes)}</div>
                <div style={{ fontSize: 11, color: '#9b6070' }}>{receiptPayout.period_from} → {receiptPayout.period_to}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5a3540' }}><span>Sales handled</span><span style={{ fontWeight: 700 }}>{fmtKES(receiptPayout.total_sales_kes || 0)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5a3540' }}><span>Payment method</span><span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{receiptPayout.payment_method}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5a3540' }}><span>Date paid</span><span style={{ fontWeight: 700 }}>{receiptPayout.paid_date || '—'}</span></div>
              <button onClick={() => sendPayoutWhatsApp(receiptPayout, receiptPayout.expand?.staff_id)} disabled={!receiptPayout.expand?.staff_id?.phone}
                style={{ marginTop: 8, width: '100%', padding: 10, borderRadius: 10, border: 'none', background: receiptPayout.expand?.staff_id?.phone ? 'linear-gradient(135deg,#25D366,#128C7E)' : '#e5e5e5', color: receiptPayout.expand?.staff_id?.phone ? '#fff' : '#9b6070', fontWeight: 700, fontSize: 13, cursor: receiptPayout.expand?.staff_id?.phone ? 'pointer' : 'not-allowed' }}>
                📲 {receiptPayout.expand?.staff_id?.phone ? 'Send via WhatsApp' : 'No phone on file'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}