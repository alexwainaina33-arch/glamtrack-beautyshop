import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Sparkles, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
      toast.success('Welcome back!')
    } catch (err) {
      toast.error(err?.data?.message || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a0a0e 0%, #3d1020 50%, #6b1e38 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', position: 'relative', overflow: 'hidden'
    }}>
      {/* Decorative orbs */}
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: [300, 200, 150, 400][i],
          height: [300, 200, 150, 400][i],
          borderRadius: '50%',
          background: ['#c8456a', '#e6b800', '#8b2550', '#c8456a'][i],
          opacity: [0.08, 0.05, 0.06, 0.04][i],
          top: ['10%', '60%', '80%', '-10%'][i],
          left: ['70%', '10%', '80%', '20%'][i],
          filter: 'blur(60px)',
          pointerEvents: 'none'
        }} />
      ))}

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64,
            background: 'linear-gradient(135deg, #e6b800, #c8456a)',
            borderRadius: 18, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px #c8456a55', marginBottom: 16
          }}>
            <Sparkles size={30} color="#fff" />
          </div>
          <h1 style={{
            fontFamily: 'Playfair Display,serif', color: '#fce8ed',
            fontSize: 36, fontWeight: 700, margin: 0, lineHeight: 1.1
          }}>GlamTrack</h1>
          <p style={{ color: '#f7c5d088', fontSize: 14, marginTop: 6 }}>
            Beauty Shop Management System
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 24, padding: '36px 40px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)'
        }}>
          <h2 style={{ fontFamily: 'Playfair Display,serif', color: '#fce8ed', fontSize: 22, margin: '0 0 24px', textAlign: 'center' }}>
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={{ ...labelStyle }}>Email address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#f7c5d066' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="admin@yourshop.com"
                  style={{ ...inputStyle, paddingLeft: 42 }}
                />
              </div>
            </div>

            <div>
              <label style={{ ...labelStyle }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#f7c5d066' }} />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{ ...inputStyle, paddingLeft: 42, paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#f7c5d066', display: 'flex' }}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 6,
                padding: '13px',
                borderRadius: 12,
                background: loading ? '#6b1e38' : 'linear-gradient(135deg,#c8456a,#8b2550)',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                fontSize: 15,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'Nunito,sans-serif',
                boxShadow: '0 6px 24px #c8456a55',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}>
              {loading ? <><div style={{ width: 18, height: 18, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Signing in…</> : '✨ Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#f7c5d044', fontSize: 12, marginTop: 24 }}>
          Powered by GlamTrack v1.0 · Multi-tenant POS
        </p>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  color: '#f7c5d0aa', marginBottom: 8
}
const inputStyle = {
  width: '100%', padding: '11px 14px',
  borderRadius: 10, border: '1.5px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.08)', color: '#fce8ed',
  fontSize: 14, fontFamily: 'Nunito,sans-serif',
  outline: 'none', boxSizing: 'border-box'
}
