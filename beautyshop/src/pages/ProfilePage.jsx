import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C, PB_URL } from '../lib/pb'
import toast from 'react-hot-toast'
import { Save, Upload, X, Eye, EyeOff, Lock, User, Phone, Mail } from 'lucide-react'

export default function ProfilePage() {
  const { admin, role, shop } = useAuth()
  const avatarRef = useRef(null)

  const [form, setForm] = useState({ name: '', phone: '' })
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const [pwForm, setPwForm] = useState({ oldPassword: '', password: '', passwordConfirm: '' })
  const [savingPw, setSavingPw] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const avatarUrl = admin?.avatar
    ? `${PB_URL}/api/files/${C.ADMINS}/${admin.id}/${admin.avatar}?thumb=200x200`
    : null

  const currentAvatar = avatarPreview || avatarUrl

  const roleColors = {
    owner:   { bg: '#fce8ed', color: '#8b2550' },
    manager: { bg: '#eff6ff', color: '#1d4ed8' },
    cashier: { bg: '#f0fdf4', color: '#059669' },
    viewer:  { bg: '#fefce8', color: '#92400e' },
  }
  const roleStyle = roleColors[role] || roleColors.viewer

  useEffect(() => {
    if (admin) {
      setForm({ name: admin.name || '', phone: admin.phone || '' })
    }
  }, [admin])

  const handleAvatarFile = (file) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('JPG, PNG or WebP only')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Max 5MB')
      return
    }
    setAvatarFile(file)
    const r = new FileReader()
    r.onload = e => setAvatarPreview(e.target.result)
    r.readAsDataURL(file)
  }

  const saveProfile = async (e) => {
    e?.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name.trim())
      fd.append('phone', form.phone.trim())
      if (avatarFile) fd.append('avatar', avatarFile)
      await pb.collection(C.ADMINS).update(admin.id, fd)
      // Re-authenticate to get fresh model with avatar
      const refreshed = await pb.collection(C.ADMINS).authRefresh()
      pb.authStore.save(refreshed.token, refreshed.record)
      setAvatarFile(null)
      setAvatarPreview(null)
      toast.success('Profile updated! ✅')
    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const savePassword = async (e) => {
    e?.preventDefault()
    if (!pwForm.oldPassword) { toast.error('Enter your current password'); return }
    if (pwForm.password.length < 8) { toast.error('New password must be at least 8 characters'); return }
    if (pwForm.password !== pwForm.passwordConfirm) { toast.error('Passwords do not match'); return }
    setSavingPw(true)
    try {
      await pb.collection(C.ADMINS).update(admin.id, {
        oldPassword: pwForm.oldPassword,
        password: pwForm.password,
        passwordConfirm: pwForm.passwordConfirm,
      })
      setPwForm({ oldPassword: '', password: '', passwordConfirm: '' })
      toast.success('Password changed! You may need to log in again.')
    } catch (err) {
      toast.error(err?.data?.message || err?.message || 'Failed to change password — check your current password')
    } finally {
      setSavingPw(false)
    }
  }

  const pwStrength = (pw) => {
    if (!pw) return null
    let score = 0
    if (pw.length >= 8) score++
    if (pw.length >= 12) score++
    if (/[A-Z]/.test(pw)) score++
    if (/[0-9]/.test(pw)) score++
    if (/[^A-Za-z0-9]/.test(pw)) score++
    if (score <= 1) return { label: 'Weak', color: '#dc2626', width: '25%' }
    if (score <= 2) return { label: 'Fair', color: '#f59e0b', width: '50%' }
    if (score <= 3) return { label: 'Good', color: '#0284c7', width: '75%' }
    return { label: 'Strong', color: '#059669', width: '100%' }
  }

  const strength = pwStrength(pwForm.password)

  return (
    <div>
      <div className="page-header">
        <div className="page-title">My Profile 👤</div>
        <div className="page-subtitle">Update your personal details and password</div>
      </div>

      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 860 }}>

        {/* Left — Avatar + basic info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Avatar card */}
          <div className="card">
            <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', margin: '0 0 16px' }}>Profile Photo</h3>

            {/* Current avatar display */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {currentAvatar ? (
                  <img
                    src={currentAvatar}
                    alt={admin?.name}
                    style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid #f0e4e8' }}
                  />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#c8456a,#6b1e38)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 28, border: '3px solid #f0e4e8' }}>
                    {admin?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                )}
                {avatarPreview && (
                  <button
                    onClick={() => { setAvatarFile(null); setAvatarPreview(null) }}
                    style={{ position: 'absolute', top: -4, right: -4, width: 22, height: 22, borderRadius: '50%', background: '#dc2626', border: '2px solid #fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1f' }}>{admin?.name}</div>
                <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{admin?.email}</div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ background: roleStyle.bg, color: roleStyle.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize' }}>
                    {role}
                  </span>
                </div>
              </div>
            </div>

            {/* Upload area */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleAvatarFile(e.dataTransfer.files[0]) }}
              onClick={() => avatarRef.current?.click()}
              style={{ border: `2px dashed ${dragOver ? '#c8456a' : '#f0e4e8'}`, borderRadius: 12, padding: '18px', textAlign: 'center', cursor: 'pointer', background: dragOver ? '#fce8ed' : '#fdf5f7', transition: 'all 0.2s' }}
            >
              <Upload size={24} color={dragOver ? '#c8456a' : '#d4a0b0'} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 13, color: '#9b6070', fontWeight: 600 }}>
                {avatarFile ? avatarFile.name : 'Drop photo or click to upload'}
              </div>
              <div style={{ fontSize: 11, color: '#c8b0b8', marginTop: 3 }}>JPG · PNG · WebP · Max 5MB</div>
            </div>
            <input ref={avatarRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => handleAvatarFile(e.target.files[0])} />
          </div>

          {/* Shop info — read only context */}
          <div className="card">
            <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', margin: '0 0 14px' }}>Your Shop</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,#c8456a,#8b2550)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>🏪</span>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1f' }}>{shop?.name}</div>
                <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{shop?.address || 'No address set'}</div>
                <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>{shop?.phone || ''}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right — Name/phone form + password */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Personal details */}
          <div className="card">
            <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', margin: '0 0 20px' }}>Personal Details</h3>
            <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Full Name *</label>
                <div style={{ position: 'relative' }}>
                  <User size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
                  <input
                    className="input"
                    style={{ paddingLeft: 36 }}
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Your full name"
                  />
                </div>
              </div>
              <div>
                <label className="label">Phone Number</label>
                <div style={{ position: 'relative' }}>
                  <Phone size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
                  <input
                    className="input"
                    style={{ paddingLeft: 36 }}
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+254 7xx xxx xxx"
                  />
                </div>
              </div>
              <div>
                <label className="label">Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
                  <input
                    className="input"
                    style={{ paddingLeft: 36, background: '#fdf5f7', color: '#9b6070', cursor: 'not-allowed' }}
                    value={admin?.email || ''}
                    disabled
                    title="Email cannot be changed here"
                  />
                </div>
                <div style={{ fontSize: 11, color: '#9b6070', marginTop: 4 }}>Email cannot be changed — contact your shop owner</div>
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save size={14} />{saving ? 'Saving…' : 'Save Profile'}
              </button>
            </form>
          </div>

          {/* Change password */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fce8ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Lock size={16} color="#c8456a" />
              </div>
              <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 17, color: '#3d1020', margin: 0 }}>Change Password</h3>
            </div>
            <form onSubmit={savePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Current Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showOld ? 'text' : 'password'}
                    style={{ paddingRight: 40 }}
                    required
                    value={pwForm.oldPassword}
                    onChange={e => setPwForm(f => ({ ...f, oldPassword: e.target.value }))}
                    placeholder="Your current password"
                  />
                  <button type="button" onClick={() => setShowOld(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9b6070', padding: 0 }}>
                    {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">New Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showNew ? 'text' : 'password'}
                    style={{ paddingRight: 40 }}
                    required
                    minLength={8}
                    value={pwForm.password}
                    onChange={e => setPwForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 8 characters"
                  />
                  <button type="button" onClick={() => setShowNew(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9b6070', padding: 0 }}>
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {strength && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 4, background: '#f5edf0', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: strength.width, background: strength.color, borderRadius: 4, transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: strength.color, fontWeight: 700, marginTop: 3 }}>{strength.label}</div>
                  </div>
                )}
              </div>
              <div>
                <label className="label">Confirm New Password *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showConfirm ? 'text' : 'password'}
                    style={{ paddingRight: 40, borderColor: pwForm.passwordConfirm && pwForm.password !== pwForm.passwordConfirm ? '#dc2626' : undefined }}
                    required
                    value={pwForm.passwordConfirm}
                    onChange={e => setPwForm(f => ({ ...f, passwordConfirm: e.target.value }))}
                    placeholder="Repeat new password"
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9b6070', padding: 0 }}>
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {pwForm.passwordConfirm && pwForm.password !== pwForm.passwordConfirm && (
                  <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3, fontWeight: 600 }}>Passwords do not match</div>
                )}
              </div>
              <button type="submit" className="btn-primary" disabled={savingPw}>
                <Lock size={14} />{savingPw ? 'Changing…' : 'Change Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}