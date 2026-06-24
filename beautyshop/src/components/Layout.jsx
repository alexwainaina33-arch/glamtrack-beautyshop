import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ShoppingCart, Package, ArchiveX, TrendingUp,
  Receipt, BarChart3, Users, Settings, LogOut, Truck, Zap,
 Tag, DollarSign, Calendar, UserCheck, Menu, X, MoreHorizontal, Star
} from 'lucide-react'
import RenewalRegretCard from './RenewalRegretCard'

const NAV = (lapsedCount, reviewsPending, role) => {
  const all = [
    { section: 'SELL', roles: ['owner','manager','cashier','viewer'], items: [
      { to: '/app/dashboard',    icon: LayoutDashboard, label: 'Dashboard',           roles: ['owner','manager','viewer'] },
      { to: '/app/pos',          icon: ShoppingCart,    label: 'Point of Sale',        roles: ['owner','manager','cashier'] },
      { to: '/app/appointments', icon: Calendar,        label: 'Appointments',         roles: ['owner','manager','cashier','viewer'] },
      { to: '/app/sales',        icon: Receipt,         label: 'Sales History',        roles: ['owner','manager','cashier','viewer'] },
      { to: '/app/reconcile',    icon: DollarSign,      label: 'Cash Reconciliation',  roles: ['owner','manager'] },
    ]},
    { section: 'STOCK', roles: ['owner','manager','viewer'], items: [
      { to: '/app/products',  icon: Package,  label: 'Products',       roles: ['owner','manager','cashier','viewer'] },
      { to: '/app/inventory', icon: ArchiveX, label: 'Inventory',      roles: ['owner','manager','viewer'] },
      { to: '/app/labels',    icon: Tag,      label: 'Barcode Labels', roles: ['owner','manager'] },
      { to: '/app/suppliers', icon: Truck,    label: 'Suppliers',      roles: ['owner','manager'] },
    ]},
    { section: 'FINANCE', roles: ['owner','manager','viewer'], items: [
      { to: '/app/expenses',  icon: TrendingUp, label: 'Expenses',        roles: ['owner','manager'] },
      { to: '/app/reports',   icon: BarChart3,  label: 'Reports & P&L',   roles: ['owner','manager','viewer'] },
      { to: '/app/analytics', icon: Zap,        label: 'Smart Analytics', roles: ['owner','manager','viewer'] },
    ]},
    { section: 'PEOPLE', roles: ['owner','manager'], items: [
      { to: '/app/customers', icon: Users,     label: 'Customers',            roles: ['owner','manager','cashier','viewer'], badge: lapsedCount > 0 ? lapsedCount : null },
      { to: '/app/reviews',   icon: Star,      label: 'Reviews',               roles: ['owner','manager'], badge: reviewsPending > 0 ? reviewsPending : null },
      { to: '/app/staff',     icon: UserCheck, label: 'Staff & Commissions',  roles: ['owner','manager'] },
      { to: '/app/settings',  icon: Settings,  label: 'Settings',             roles: ['owner'] },
    ]},
  ]

  return all
    .map(section => ({
      ...section,
      items: section.items.filter(item => item.roles.includes(role))
    }))
    .filter(section => section.items.length > 0)
}

export default function Layout() {
  const { admin, shop, role, logout, isLocked } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
 const [lapsedCount, setLapsedCount] = useState(0)
  const [reviewsPending, setReviewsPending] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [renewalStats, setRenewalStats] = useState(null)

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    if (!shop) return
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000)
      .toISOString().replace('T', ' ').replace('Z', '.000Z')
   pb.collection(C.CUSTOMERS).getList(1, 500, {
      filter: `shop_id="${shop.id}" && updated < "${fourteenDaysAgo}"`,
      '$autoCancel': false, '$cancelKey': 'layout-lapsed',
    }).then(r => {
      const count = r.items.filter(c => c.total_spent_kes > 0).length
      setLapsedCount(count)
    }).catch(() => {})
  }, [shop])

  useEffect(() => {
    if (!shop) return
    pb.collection('bs_reviews').getList(1, 1, {
      filter: `shop_id="${shop.id}" && is_approved=false`,
      '$autoCancel': false, '$cancelKey': 'layout-reviews-pending',
    }).then(r => setReviewsPending(r.totalItems)).catch(() => {})
  }, [shop])

  // Renewal banner — only fetch 30-day revenue if shop is within 72h of expiry
  useEffect(() => {
    if (!shop) return
    const expiryDate = shop.subscription_ends_at
      ? new Date(shop.subscription_ends_at)
      : shop.trial_ends_at
      ? new Date(shop.trial_ends_at)
      : null
    if (!expiryDate) return
    const hoursLeft = (expiryDate - new Date()) / 3600000
    if (hoursLeft > 72 || hoursLeft < 0) return // skip query for shops not near expiry

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
      .toISOString().replace('T', ' ').replace('Z', '.000Z')
    pb.collection(C.SALES).getList(1, 500, {
      filter: `shop_id="${shop.id}" && status="completed" && created >= "${thirtyDaysAgo}"`,
      '$autoCancel': false, '$cancelKey': 'layout-renewal-stats',
    }).then(r => {
      const revenue = r.items.reduce((s, x) => s + (x.total_kes || 0), 0)
      setRenewalStats({ revenue })
    }).catch(() => {})
  }, [shop, location.pathname])

  const logoUrl = shop?.logo
    ? `${pb.baseURL}/api/files/${C.SHOPS}/${shop.id}/${shop.logo}?thumb=200x200`
    : null

  const brandColor = shop?.brand_color || '#c8456a'

  // Bottom nav items — role-aware
  const bottomNavItems = [
    { to: '/app/dashboard',    icon: LayoutDashboard, label: 'Home',     roles: ['owner','manager','viewer'] },
    { to: '/app/pos',          icon: ShoppingCart,    label: 'POS',      roles: ['owner','manager','cashier'] },
    { to: '/app/sales',        icon: Receipt,         label: 'Sales',    roles: ['owner','manager','cashier','viewer'] },
    { to: '/app/customers',    icon: Users,           label: 'Customers',roles: ['owner','manager','cashier','viewer'] },
    { to: '/app/appointments', icon: Calendar,        label: 'Bookings', roles: ['owner','manager','cashier','viewer'] },
  ].filter(item => item.roles.includes(role))

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f6f2' }}>

      {/* ── Mobile top header ── */}
      <div className="mobile-header">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          style={{
            background: 'none', border: 'none', color: '#fce8ed',
            cursor: 'pointer', padding: 8, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 40, minHeight: 40, flexShrink: 0
          }}
        >
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {logoUrl ? (
          <img src={logoUrl} alt={shop?.name} style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'contain', background: 'rgba(255,255,255,0.9)', padding: 2, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 30, height: 30, background: `linear-gradient(135deg,#e6b800,${brandColor})`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingUp size={14} color="#fff" />
          </div>
        )}

        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shop?.name || 'SalesTrack'}
          </div>
        </div>

        <button
          onClick={() => navigate('/app/profile')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
        >
          {admin?.avatar ? (
            <img
              src={`${pb.baseURL}/api/files/${C.ADMINS}/${admin.id}/${admin.avatar}?thumb=200x200`}
              alt={admin?.name}
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }}
            />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${brandColor},#6b1e38)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>
              {admin?.name?.[0]?.toUpperCase() || 'A'}
            </div>
          )}
        </button>
        <button
          onClick={() => { logout(); navigate('/login') }}
          style={{ background: 'rgba(220,38,38,0.85)', border: '1.5px solid rgba(255,100,100,0.4)', cursor: 'pointer', padding: '6px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, minHeight: 40, flexShrink: 0 }}
          title="Sign out"
        >
          <LogOut size={18} color="#fff" />
        </button>
      </div>

      {/* ── Sidebar overlay — only rendered when open ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 199,
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`sidebar${sidebarOpen ? ' open' : ''}`}
        style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Logo / Brand */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #ffffff15' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: shop ? 10 : 0 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={shop?.name}
                style={{ width: 38, height: 38, borderRadius: 10, objectFit: 'contain', background: 'rgba(255,255,255,0.9)', padding: 2, flexShrink: 0 }}
              />
            ) : (
              <div style={{ width: 38, height: 38, background: `linear-gradient(135deg,#e6b800,${brandColor})`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TrendingUp size={18} color="#fff" />
              </div>
            )}
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontWeight: 700, fontSize: 16, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shop?.name || 'SalesTrack'}
              </div>
              <div style={{ color: '#f7c5d066', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {shop?.business_type || 'Business POS'}
              </div>
            </div>
          </div>
          {shop && (
            <div style={{ background: '#ffffff10', border: '1px solid #ffffff18', borderRadius: 7, padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
              <div style={{ color: '#f7c5d077', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {shop?.address || shop?.email || 'Active'}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {NAV(lapsedCount, reviewsPending, role).map(({ section, items }) => (
            <div key={section}>
              <div style={{ fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#f7c5d033', padding: '10px 18px 4px' }}>
                {section}
              </div>
              {items.map(({ to, icon: Icon, label, badge }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                >
                  <Icon size={15} className="icon" />
                  <span style={{ flex: 1 }}>{label}</span>
                  {badge && (
                    <span style={{ background: '#dc2626', color: '#fff', borderRadius: '50%', fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                      {badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #ffffff15' }}>
          <div
            onClick={() => navigate('/app/profile')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer', borderRadius: 10, padding: '6px 8px', margin: '0 -8px 8px', transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {admin?.avatar ? (
              <img
                src={`${pb.baseURL}/api/files/${C.ADMINS}/${admin.id}/${admin.avatar}?thumb=200x200`}
                alt={admin?.name}
                style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid rgba(255,255,255,0.2)' }}
              />
            ) : (
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${brandColor},#6b1e38)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                {admin?.name?.[0]?.toUpperCase() || 'A'}
              </div>
            )}
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ color: '#fce8ed', fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {admin?.name || 'Admin'}
              </div>
              <div style={{ color: '#f7c5d066', fontSize: 9, textTransform: 'capitalize' }}>
                {role || 'staff'} · {shop?.currency || 'KES'}
              </div>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="sidebar-link"
            style={{ width: '100%', margin: 0, padding: '6px 10px', fontSize: 11 }}
          >
            <LogOut size={13} className="icon" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main
        className="main-content"
        style={{ marginLeft: 'var(--sidebar-w)', flex: 1, minWidth: 0, padding: '24px 28px', overflowY: 'auto', minHeight: '100vh' }}
      >
        {/* Pushes content below fixed mobile header */}
        <div className="mobile-spacer" />
        <RenewalRegretCard
          shop={shop}
          stats={renewalStats}
          onClick={() => navigate('/pricing')}
        />
        {isLocked && (
          <div
            onClick={() => navigate('/pricing')}
            style={{
              background: 'linear-gradient(135deg,#3d1020,#6b1e38)',
              color: '#fff', borderRadius: 14, padding: '14px 18px',
              marginBottom: 16, display: 'flex', alignItems: 'center',
              gap: 12, cursor: 'pointer', boxShadow: '0 4px 16px #0002'
            }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>🔒</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Account Locked — Renew to Continue</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                Your trial or subscription has expired. You can still view your data, but new sales, expenses, and bookings are paused until you renew.
              </div>
            </div>
            <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}>Renew →</span>
          </div>
        )}
        <Outlet />
      </main>

      {/* ── Bottom navigation (mobile only) ── */}
      <nav className="bottom-nav">
        {bottomNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          className="bottom-nav-item"
          onClick={() => setSidebarOpen(v => !v)}
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>

    </div>
  )
}