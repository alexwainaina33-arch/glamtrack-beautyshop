import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { ShieldX } from 'lucide-react'

/**
 * RoleGuard — wraps any page/section that requires specific roles.
 * Usage: <RoleGuard allow={['owner','manager']}><ExpensesPage /></RoleGuard>
 * redirectTo: optional — if set, redirects instead of showing denied screen
 */
export default function RoleGuard({ allow, children, redirectTo }) {
  const { role, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) return null

  if (!allow.includes(role)) {
    if (redirectTo) {
      navigate(redirectTo, { replace: true })
      return null
    }
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', textAlign:'center', padding:40 }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
          <ShieldX size={28} color="#dc2626" />
        </div>
        <div style={{ fontFamily:'Playfair Display,serif', fontSize:22, fontWeight:700, color:'#3d1020', marginBottom:8 }}>
          Access Restricted
        </div>
        <div style={{ fontSize:14, color:'#9b6070', maxWidth:320, lineHeight:1.6, marginBottom:24 }}>
          Your current role <strong style={{ color:'#8b2550', textTransform:'capitalize' }}>{role}</strong> does not have permission to view this page. Contact your shop owner to request access.
        </div>
        <button
          className="btn-secondary"
          onClick={() => navigate(role === 'cashier' ? '/app/pos' : '/app/dashboard')}
        >
          {role === 'cashier' ? '← Back to POS' : '← Back to Dashboard'}
        </button>
      </div>
    )
  }

  return children
}