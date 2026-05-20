import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, ShoppingCart, Package, ArchiveX, TrendingUp, Receipt, BarChart3, Users, Settings, LogOut, Sparkles, ChevronDown, Truck, Zap, Tag, DollarSign, Calendar, UserCheck } from 'lucide-react'
import { useState } from 'react'

const NAV = [
  { section: 'SELL',     items: [
    { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/pos',          icon: ShoppingCart,    label: 'Point of Sale' },
    { to: '/appointments', icon: Calendar,        label: 'Appointments' },
    { to: '/sales',        icon: Receipt,         label: 'Sales History' },
    { to: '/reconcile',    icon: DollarSign,      label: 'Cash Reconciliation' },
  ]},
  { section: 'STOCK',    items: [
    { to: '/products',  icon: Package,   label: 'Products' },
    { to: '/inventory', icon: ArchiveX,  label: 'Inventory' },
    { to: '/labels',    icon: Tag,       label: 'Barcode Labels' },
    { to: '/suppliers', icon: Truck,     label: 'Suppliers' },
  ]},
  { section: 'FINANCE',  items: [
    { to: '/expenses',  icon: TrendingUp, label: 'Expenses' },
    { to: '/reports',   icon: BarChart3,  label: 'Reports & P&L' },
    { to: '/analytics', icon: Zap,        label: 'Smart Analytics' },
  ]},
  { section: 'PEOPLE',   items: [
    { to: '/customers', icon: Users,       label: 'Customers' },
    { to: '/staff',     icon: UserCheck,   label: 'Staff & Commissions' },
    { to: '/settings',  icon: Settings,    label: 'Settings' },
  ]},
]

export default function Layout() {
  const { admin, shop, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f4f5' }}>
      <aside className="sidebar" style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Logo */}
        <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid #ffffff15' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg,#e6b800,#c8456a)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontWeight: 700, fontSize: 17, lineHeight: 1.1 }}>GlamTrack</div>
              <div style={{ color: '#f7c5d066', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Beauty POS</div>
            </div>
          </div>
          {shop && (
            <div style={{ marginTop: 10, background: '#ffffff12', border: '1px solid #ffffff20', borderRadius: 8, padding: '7px 11px', color: '#fce8ed', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🏪 {shop.name}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#f7c5d033', padding: '10px 20px 4px' }}>{section}</div>
              {items.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                  <Icon size={16} className="icon" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '14px 18px', borderTop: '1px solid #ffffff15' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#c8456a,#6b1e38)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {admin?.name?.[0]?.toUpperCase() || 'A'}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ color: '#fce8ed', fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{admin?.name || 'Admin'}</div>
              <div style={{ color: '#f7c5d066', fontSize: 10, textTransform: 'capitalize' }}>{admin?.role || 'staff'}</div>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login') }} className="sidebar-link" style={{ width: '100%', margin: 0, padding: '7px 11px', fontSize: 12 }}>
            <LogOut size={14} className="icon" /> Sign out
          </button>
        </div>
      </aside>

      <main style={{ marginLeft: 'var(--sidebar-w)', flex: 1, minWidth: 0, padding: '26px 30px', overflowY: 'auto', minHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  )
}
