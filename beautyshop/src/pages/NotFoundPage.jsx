import { useNavigate } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight:'100vh',
      background:'linear-gradient(135deg,#1a0a0e 0%,#3d1020 50%,#6b1e38 100%)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:'24px', textAlign:'center'
    }}>
      <div style={{ position:'relative', zIndex:1 }}>
        <div style={{ width:64, height:64, background:'linear-gradient(135deg,#e6b800,#c8456a)', borderRadius:18, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:24 }}>
          <TrendingUp size={30} color="#fff" />
        </div>
        <div style={{ fontFamily:'Playfair Display,serif', color:'#fce8ed', fontSize:80, fontWeight:900, lineHeight:1, marginBottom:8 }}>404</div>
        <div style={{ fontFamily:'Playfair Display,serif', color:'#fce8ed', fontSize:24, marginBottom:12 }}>Page not found</div>
        <p style={{ color:'#f7c5d066', fontSize:15, marginBottom:32, maxWidth:360 }}>
          This page doesn't exist. Let's get you back on track.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={() => navigate('/app/dashboard')} style={{            padding:'12px 28px', borderRadius:12,
            background:'linear-gradient(135deg,#c8456a,#8b2550)',
            color:'#fff', border:'none', fontWeight:700, fontSize:15,
            cursor:'pointer', fontFamily:'Nunito,sans-serif',
            boxShadow:'0 6px 24px #c8456a55'
          }}>Go to Dashboard</button>
          <button onClick={() => navigate('/login')} style={{
            padding:'12px 28px', borderRadius:12,
            background:'rgba(255,255,255,0.08)',
            color:'#fce8ed', border:'1px solid rgba(255,255,255,0.15)',
            fontWeight:700, fontSize:15, cursor:'pointer',
            fontFamily:'Nunito,sans-serif'
          }}>Sign in</button>
        </div>
        <button onClick={() => window.location.href='/landing.html'} style={{
          marginTop:16, background:'none', border:'none',
          color:'#f7c5d044', fontSize:13, cursor:'pointer',
          fontFamily:'Nunito,sans-serif'
        }}>← Back to SalesTrack website</button>
      </div>
    </div>
  )
}