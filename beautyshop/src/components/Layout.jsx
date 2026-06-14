import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, ShoppingCart, Package, ArchiveX, TrendingUp,
  Receipt, BarChart3, Users, Settings, LogOut, Truck, Zap,
  Tag, DollarSign, Calendar, UserCheck
} from 'lucide-react'

const NAV = (lapsedCount) => [
  { section: 'SELL', items: [
    { to: '/app/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/app/pos',          icon: ShoppingCart,    label: 'Point of Sale' },
    { to: '/app/appointments', icon: Calendar,        label: 'Appointments' },
    { to: '/app/sales',        icon: Receipt,         label: 'Sales History' },
    { to: '/app/reconcile',    icon: DollarSign,      label: 'Cash Reconciliation' },
  ]},
  { section: 'STOCK', items: [
    { to: '/app/products',  icon: Package,  label: 'Products' },
    { to: '/app/inventory', icon: ArchiveX, label: 'Inventory' },
    { to: '/app/labels',    icon: Tag,      label: 'Barcode Labels' },
    { to: '/app/suppliers', icon: Truck,    label: 'Suppliers' },
  ]},
  { section: 'FINANCE', items: [
    { to: '/app/expenses',  icon: TrendingUp, label: 'Expenses' },
    { to: '/app/reports',   icon: BarChart3,  label: 'Reports & P&L' },
    { to: '/app/analytics', icon: Zap,        label: 'Smart Analytics' },
  ]},
  { section: 'PEOPLE', items: [
    { to: '/app/customers', icon: Users,      label: 'Customers', badge: lapsedCount > 0 ? lapsedCount : null },
    { to: '/app/staff',     icon: UserCheck,  label: 'Staff & Commissions' },
    { to: '/app/settings',  icon: Settings,   label: 'Settings' },
  ]},
]

export default function Layout() {
  const { admin, shop, logout } = useAuth()
  const navigate = useNavigate()
  const [lapsedCount, setLapsedCount] = useState(0)

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

  const logoUrl = shop?.logo
    ? `${pb.baseURL}/api/files/${C.SHOPS}/${shop.id}/${shop.logo}?thumb=200x200`
    : null

  const brandColor = shop?.brand_color || '#c8456a'

  return (
    <div style={{ display:'flex', minHeight:'100vh', background:'#f8f6f2' }}>
      <aside className="sidebar" style={{ height:'100vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Logo / Brand */}
        <div style={{ padding:'18px 16px 12px', borderBottom:'1px solid #ffffff15' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: shop ? 10 : 0 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={shop?.name}
                style={{ width:38, height:38, borderRadius:10, objectFit:'contain', background:'rgba(255,255,255,0.9)', padding:2, flexShrink:0 }}
              />
            ) : (
              <div style={{ width:38, height:38, background:`linear-gradient(135deg,#e6b800,${brandColor})`, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <TrendingUp size={18} color="#fff" />
              </div>
            )}
            <div style={{ overflow:'hidden' }}>
              <div style={{ fontFamily:'Playfair Display,serif', color:'#fce8ed', fontWeight:700, fontSize:16, lineHeight:1.1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {shop?.name || 'SalesTrack'}
              </div>
              <div style={{ color:'#f7c5d066', fontSize:9, textTransform:'uppercase', letterSpacing:'0.1em' }}>
                {shop?.business_type || 'Business POS'}
              </div>
            </div>
          </div>
          {shop && (
            <div style={{ background:'#ffffff10', border:'1px solid #ffffff18', borderRadius:7, padding:'5px 10px', display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'#4ade80', flexShrink:0 }} />
              <div style={{ color:'#f7c5d077', fontSize:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {shop?.address || shop?.email || 'Active'}
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'8px 0', overflowY:'auto' }}>
          {NAV(lapsedCount).map(({ section, items }) => (
            <div key={section}>
              <div style={{ fontSize:8, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.12em', color:'#f7c5d033', padding:'10px 18px 4px' }}>
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
        <div style={{ padding:'12px 16px', borderTop:'1px solid #ffffff15' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
            <div style={{ width:30, height:30, borderRadius:'50%', background:`linear-gradient(135deg,${brandColor},#6b1e38)`, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontWeight:700, fontSize:12, flexShrink:0 }}>
              {admin?.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div style={{ overflow:'hidden', flex:1 }}>
              <div style={{ color:'#fce8ed', fontWeight:600, fontSize:12, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {admin?.name || 'Admin'}
              </div>
              <div style={{ color:'#f7c5d066', fontSize:9, textTransform:'capitalize' }}>
                {admin?.role || 'staff'} · {shop?.currency || 'KES'}
              </div>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="sidebar-link"
            style={{ width:'100%', margin:0, padding:'6px 10px', fontSize:11 }}
          >
            <LogOut size={13} className="icon" /> Sign out
          </button>
        </div>
      </aside>

      <main style={{ marginLeft:'var(--sidebar-w)', flex:1, minWidth:0, padding:'24px 28px', overflowY:'auto', minHeight:'100vh' }}>
        <Outlet />
      </main>
    </div>
  )
}