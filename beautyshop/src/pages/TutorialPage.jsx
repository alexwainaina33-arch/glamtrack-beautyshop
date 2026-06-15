import { useNavigate } from 'react-router-dom'
import { TrendingUp, ShoppingCart, Package, BarChart3, Users, ChevronRight, Calendar, DollarSign } from 'lucide-react'

const FEATURES = [
  { icon: ShoppingCart, label: 'Point of Sale',     desc: 'Tap to sell, barcode scanner, M-Pesa & cash' },
  { icon: Package,      label: 'Inventory',         desc: 'Real-time stock, auto reorder alerts' },
  { icon: BarChart3,    label: 'Smart Analytics',   desc: 'Fast movers, dead stock, AI insights' },
  { icon: Calendar,     label: 'Appointments',      desc: 'Booking calendar with WhatsApp reminders' },
  { icon: Users,        label: 'Customers & CRM',   desc: 'Loyalty points, birthday tracker' },
  { icon: DollarSign,   label: 'Reports & P&L',     desc: 'Daily profit, expenses, net profit' },
]

// ✏️ Replace with your actual YouTube video ID (the part after ?v= in your video URL)
// Example: https://youtube.com/watch?v=ABC123  →  YOUTUBE_ID = 'ABC123'
const YOUTUBE_ID = 'YOUR_VIDEO_ID_HERE'

export default function TutorialPage() {
  const navigate = useNavigate()
  const hasVideo = YOUTUBE_ID !== 'YOUR_VIDEO_ID_HERE'

  return (
    <div style={{
      minHeight:'100vh',
      background:'linear-gradient(135deg,#1a0a0e 0%,#3d1020 50%,#6b1e38 100%)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:'24px', position:'relative', overflow:'hidden'
    }}>
      {[...Array(3)].map((_,i) => (
        <div key={i} style={{
          position:'absolute', borderRadius:'50%',
          width:[250,180,300][i], height:[250,180,300][i],
          background:['#c8456a','#e6b800','#8b2550'][i],
          opacity:0.06,
          top:['5%','65%','30%'][i], left:['65%','5%','75%'][i],
          filter:'blur(60px)', pointerEvents:'none'
        }} />
      ))}

      <div style={{ width:'100%', maxWidth:600, position:'relative', zIndex:1 }}>

        {/* Back to website */}
        <div style={{ textAlign:'center', marginBottom:16 }}>
          <button onClick={() => window.location.href='/landing.html'} style={{
            background:'none', border:'none', color:'#f7c5d055',
            fontSize:13, cursor:'pointer', fontFamily:'Nunito,sans-serif'
          }}>← Back to SalesTrack website</button>
        </div>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{
            width:56, height:56,
            background:'linear-gradient(135deg,#e6b800,#c8456a)',
            borderRadius:16, display:'inline-flex',
            alignItems:'center', justifyContent:'center',
            boxShadow:'0 8px 28px #c8456a44', marginBottom:14
          }}>
            <TrendingUp size={26} color="#fff" />
          </div>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.12em', color:'#e6b800', marginBottom:8, textTransform:'uppercase' }}>
            Welcome to SalesTrack
          </div>
          <h1 style={{ fontFamily:'Playfair Display,serif', color:'#fce8ed', fontSize:28, fontWeight:700, margin:'0 0 8px' }}>
            You're almost ready! 🎉
          </h1>
          <p style={{ color:'#f7c5d077', fontSize:14 }}>
            See exactly what you get before you subscribe
          </p>
        </div>

        {/* Video OR feature grid */}
        {hasVideo ? (
          <div style={{ borderRadius:16, overflow:'hidden', marginBottom:24, border:'1px solid rgba(255,255,255,0.12)', boxShadow:'0 16px 48px rgba(0,0,0,0.5)' }}>
            <iframe
              width="100%" height="300"
              src={`https://www.youtube.com/embed/${YOUTUBE_ID}?rel=0&modestbranding=1`}
              title="SalesTrack Getting Started"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ display:'block' }}
            />
          </div>
        ) : (
          /* Show feature grid when no video yet */
          <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:16, padding:'20px', marginBottom:24 }}>
            <div style={{ textAlign:'center', marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.1em', color:'#e6b800', textTransform:'uppercase', marginBottom:4 }}>
                Everything in one system
              </div>
              <div style={{ color:'#f7c5d077', fontSize:13 }}>
                Built for retail shops, salons, restaurants and every business in Africa
              </div>
            </div>
            <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label} style={{
                  background:'rgba(255,255,255,0.06)',
                  border:'1px solid rgba(255,255,255,0.10)',
                  borderRadius:12, padding:'14px 16px',
                  display:'flex', alignItems:'flex-start', gap:12
                }}>
                  <div style={{
                    width:36, height:36, borderRadius:10,
                    background:'rgba(200,69,106,0.2)',
                    display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0
                  }}>
                    <Icon size={18} color="#c8456a" />
                  </div>
                  <div>
                    <div style={{ color:'#fce8ed', fontWeight:700, fontSize:13 }}>{label}</div>
                    <div style={{ color:'#f7c5d066', fontSize:11, marginTop:2, lineHeight:1.4 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trust badges */}
        <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap', marginBottom:24 }}>
          {['✅ 14-day free trial', '🔒 No credit card required', '❌ Cancel anytime', '📱 M-Pesa supported'].map(b => (
            <span key={b} style={{
              background:'rgba(255,255,255,0.06)',
              border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:20, padding:'5px 12px',
              fontSize:11, color:'#f7c5d0aa'
            }}>{b}</span>
          ))}
        </div>

        {/* CTA */}
        <button onClick={() => navigate('/pricing')} style={{
          width:'100%', padding:'15px', borderRadius:14,
          background:'linear-gradient(135deg,#c8456a,#8b2550)',
          color:'#fff', border:'none', fontWeight:700, fontSize:16,
          cursor:'pointer', fontFamily:'Nunito,sans-serif',
          boxShadow:'0 8px 28px #c8456a55',
          display:'flex', alignItems:'center', justifyContent:'center', gap:10
        }}>
          Choose your plan — from KES 2,500/mo <ChevronRight size={18} />
        </button>

        <div style={{ display:'flex', justifyContent:'center', gap:20, marginTop:14 }}>
          <button onClick={() => navigate('/pricing')} style={{
            background:'none', border:'none', color:'#f7c5d055',
            fontSize:13, cursor:'pointer', fontFamily:'Nunito,sans-serif'
          }}>
            Skip tutorial
          </button>
          <button onClick={() => navigate('/login')} style={{
            background:'none', border:'none', color:'#f7c5d055',
            fontSize:13, cursor:'pointer', fontFamily:'Nunito,sans-serif'
          }}>
            Already have an account? Sign in
          </button>
        </div>

      </div>
    </div>
  )
}