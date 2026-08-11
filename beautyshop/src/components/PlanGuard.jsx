import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { hasRequiredPlan } from '../lib/planAccess'

const PLAN_LABEL = { starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' }
const PLAN_PRICE = { starter: 'KES 2,499/mo', growth: 'KES 4,499/mo', enterprise: 'KES 6,499/mo' }

/**
 * PlanGuard — wraps any page/section that requires a minimum plan tier.
 * Usage: <PlanGuard requiredPlan="growth"><StaffPage /></PlanGuard>
 *
 * Unlike RoleGuard, this never silently redirects — a locked feature always
 * shows a soft "Upgrade to X" screen with a link to /pricing, never a 404
 * or unexplained bounce. See DECISIONS LOG: soft block, not hard block.
 *
 * Demo shop and any non-active (trial/expired/cancelled) shop always pass —
 * see hasRequiredPlan() in src/lib/planAccess.js for the full rule set.
 */
export default function PlanGuard({ requiredPlan, children }) {
  const { shop, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) return null

  if (hasRequiredPlan(shop, requiredPlan)) return children

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', textAlign:'center', padding:40 }}>
      <div style={{ width:64, height:64, borderRadius:'50%', background:'#fce8ed', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
        <Sparkles size={28} color="#c8456a" />
      </div>
      <div style={{ fontFamily:'Playfair Display,serif', fontSize:22, fontWeight:700, color:'#3d1020', marginBottom:8 }}>
        This is a {PLAN_LABEL[requiredPlan] || requiredPlan} feature
      </div>
      <div style={{ fontSize:14, color:'#9b6070', maxWidth:360, lineHeight:1.6, marginBottom:8 }}>
        Upgrade to <strong style={{ color:'#8b2550' }}>{PLAN_LABEL[requiredPlan] || requiredPlan}</strong> to unlock this and more.
      </div>
      <div style={{ fontSize:13, color:'#c8456a', fontWeight:700, marginBottom:24 }}>
        {PLAN_PRICE[requiredPlan] || ''}
      </div>
      <button
        className="btn-primary"
        onClick={() => navigate(`/pricing?plan=${requiredPlan}`)}
      >
        ✨ See {PLAN_LABEL[requiredPlan] || requiredPlan} plan →
      </button>
    </div>
  )
}