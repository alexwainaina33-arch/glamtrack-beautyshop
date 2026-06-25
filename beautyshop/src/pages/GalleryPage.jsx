import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import pb from '../lib/pb'
import { Trash2, Plus, Star, StarOff, Edit3, X, Upload, Image } from 'lucide-react'

const PB_URL = import.meta.env.VITE_PB_URL || 'https://fieldtrack-kenya.fly.dev'

export default function GalleryPage() {
  const { shop } = useAuth()
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]   = useState(null) // null = new, object = existing
  const [saving, setSaving]     = useState(false)
  const [tab, setTab]           = useState('all') // all | featured

  // Form state
  const [form, setForm] = useState({
    caption: '', category: '', service_name: '', is_featured: false, sort_order: 0,
  })
  const [imageFiles, setImageFiles]     = useState([])   // new after[] files
  const [beforeFile, setBeforeFile]     = useState(null) // new before file
  const [imagePreviews, setImagePreviews] = useState([])
  const [beforePreview, setBeforePreview] = useState(null)

  const afterInputRef  = useRef(null)
  const beforeInputRef = useRef(null)

  useEffect(() => { if (shop) loadData() }, [shop])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await pb.collection('bs_gallery').getList(1, 500, {
        filter: `shop_id="${shop.id}"`,
        sort: 'sort_order,created',
      })
      setItems(res.items)
    } catch {
      toast.error('Could not load gallery')
    } finally {
      setLoading(false)
    }
  }

  // ── Open modal for new upload ──────────────────────────────────────────
  const openNew = () => {
    setEditing(null)
    setForm({ caption: '', category: '', service_name: '', is_featured: false, sort_order: items.length })
    setImageFiles([])
    setBeforeFile(null)
    setImagePreviews([])
    setBeforePreview(null)
    setModalOpen(true)
  }

  // ── Open modal to edit existing item ──────────────────────────────────
  const openEdit = (item) => {
    setEditing(item)
    setForm({
      caption:      item.caption      || '',
      category:     item.category     || '',
      service_name: item.service_name || '',
      is_featured:  item.is_featured  || false,
      sort_order:   item.sort_order   || 0,
    })
    setImageFiles([])
    setBeforeFile(null)
    setImagePreviews([])
    setBeforePreview(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditing(null)
    setImageFiles([])
    setBeforeFile(null)
    setImagePreviews([])
    setBeforePreview(null)
  }

  // ── File picker handlers ───────────────────────────────────────────────
  const handleAfterFiles = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setImageFiles(files)
    const previews = files.map(f => URL.createObjectURL(f))
    setImagePreviews(previews)
  }

  const handleBeforeFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBeforeFile(file)
    setBeforePreview(URL.createObjectURL(file))
  }

  // ── Save (create or update) ────────────────────────────────────────────
  const save = async () => {
    if (!editing && imageFiles.length === 0) {
      toast.error('Please select at least one after photo')
      return
    }
    setSaving(true)
    try {
      const data = new FormData()
      data.append('shop_id',      shop.id)
      data.append('caption',      form.caption)
      data.append('category',     form.category)
      data.append('service_name', form.service_name)
      data.append('is_featured',  form.is_featured ? 'true' : 'false')
      data.append('sort_order',   String(form.sort_order || 0))

      // Append new after images
      imageFiles.forEach(f => data.append('images', f))

      // Append before image if selected
      if (beforeFile) data.append('before_image', beforeFile)

      if (editing) {
        const updated = await pb.collection('bs_gallery').update(editing.id, data)
        setItems(prev => prev.map(i => i.id === editing.id ? updated : i))
        toast.success('Gallery item updated')
      } else {
        const created = await pb.collection('bs_gallery').create(data)
        setItems(prev => [...prev, created])
        toast.success('Photos uploaded to gallery 🖼️')
      }
      closeModal()
    } catch (err) {
      toast.error(err?.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle featured ────────────────────────────────────────────────────
  const toggleFeatured = async (item) => {
    try {
      const updated = await pb.collection('bs_gallery').update(item.id, {
        is_featured: !item.is_featured,
      })
      setItems(prev => prev.map(i => i.id === item.id ? updated : i))
      toast.success(updated.is_featured ? '⭐ Set as featured' : 'Removed from featured')
    } catch (err) {
      toast.error(err?.message || 'Could not update')
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  const remove = async (item) => {
    if (!window.confirm('Delete this gallery item permanently? This cannot be undone.')) return
    try {
      await pb.collection('bs_gallery').delete(item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success('Gallery item deleted')
    } catch (err) {
      toast.error(err?.message || 'Could not delete')
    }
  }

  // ── Derived lists ──────────────────────────────────────────────────────
  const featured = items.filter(i => i.is_featured)
  const list     = tab === 'featured' ? featured : items

  // ── Thumb URL helper ───────────────────────────────────────────────────
  const thumb = (item, filename) =>
    `${PB_URL}/api/files/${item.collectionId}/${item.id}/${filename}?thumb=400x400`

  const beforeThumb = (item) =>
    item.before_image
      ? `${PB_URL}/api/files/${item.collectionId}/${item.id}/${item.before_image}?thumb=400x400`
      : null

  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <div className="page-title">Gallery 🖼️</div>
          <div className="page-subtitle">
            {items.length} photo{items.length !== 1 ? 's' : ''} · {featured.length} featured · visible on your public shop page
          </div>
        </div>
        <button className="btn-primary" onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Upload Photos
        </button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('all')} className={tab === 'all' ? 'btn-primary' : 'btn-secondary'}>
          All ({items.length})
        </button>
        <button onClick={() => setTab('featured')} className={tab === 'featured' ? 'btn-primary' : 'btn-secondary'}>
          ⭐ Featured {featured.length > 0 && `(${featured.length})`}
        </button>
      </div>

      {/* ── Info banner ── */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, background: '#fdf5f7', border: '1.5px solid #f0e4e8', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
        <div style={{ fontSize: 13, color: '#6b4050', lineHeight: 1.6 }}>
          <strong>How the gallery works:</strong> Upload your best work photos here. Set a <strong>before image</strong> on any item to enable the drag slider on your shop page. Link a <strong>service name</strong> so customers can tap "Request This Look" and WhatsApp you directly. Mark one photo as <strong>Featured</strong> to pin it as the hero at the top of the gallery.
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>Loading…</div>
      ) : list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🖼️</div>
          <p style={{ color: '#9b6070', margin: '0 0 16px' }}>
            {tab === 'featured'
              ? 'No featured photos yet. Star any photo to feature it.'
              : 'No photos yet. Upload your first gallery item.'}
          </p>
          {tab === 'all' && (
            <button className="btn-primary" onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> Upload Photos
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {list.map(item => {
            const firstImg   = item.images?.[0]
            const imgUrl     = firstImg ? thumb(item, firstImg) : null
            const beforeUrl  = beforeThumb(item)
            const imgCount   = item.images?.length || 0

            return (
              <div key={item.id} className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>

                {/* Photo */}
                <div style={{ position: 'relative', height: 200, background: imgUrl ? `url(${imgUrl}) center/cover no-repeat` : '#fdf5f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {!imgUrl && <Image size={40} color="#d4a0b0" />}

                  {/* Featured badge */}
                  {item.is_featured && (
                    <div style={{ position: 'absolute', top: 10, left: 10, background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 12 }}>
                      ⭐ Featured
                    </div>
                  )}

                  {/* Before/after badge */}
                  {beforeUrl && (
                    <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 12 }}>
                      ⟺ Before/After
                    </div>
                  )}

                  {/* Multiple images count */}
                  {imgCount > 1 && (
                    <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10 }}>
                      +{imgCount - 1} more
                    </div>
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '12px 14px' }}>
                  {item.caption && (
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1f', marginBottom: 4 }}>{item.caption}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {item.category && (
                      <span style={{ fontSize: 11, background: '#f0e4e8', color: '#6b4050', fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                        {item.category}
                      </span>
                    )}
                    {item.service_name && (
                      <span style={{ fontSize: 11, background: '#fdf5f7', color: '#c8456a', fontWeight: 700, padding: '2px 8px', borderRadius: 10, border: '1px solid #f0e4e8' }}>
                        💅 {item.service_name}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => toggleFeatured(item)}
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                      title={item.is_featured ? 'Remove from featured' : 'Set as featured'}
                    >
                      {item.is_featured ? <StarOff size={13} /> : <Star size={13} />}
                      {item.is_featured ? 'Unfeature' : 'Feature'}
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <Edit3 size={13} /> Edit
                    </button>
                    <button
                      onClick={() => remove(item)}
                      className="btn-ghost"
                      style={{ fontSize: 12, padding: '6px 12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══ UPLOAD / EDIT MODAL ══════════════════════════════════════════ */}
      {modalOpen && (
        <div
          onClick={e => e.target === e.currentTarget && !saving && closeModal()}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>

            {/* Modal header */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #f0e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#3d1020' }}>
                {editing ? 'Edit Gallery Item' : 'Upload Photos'}
              </div>
              <button onClick={closeModal} disabled={saving}
                style={{ background: '#f5edf0', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* After photos (the main photos) */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#6b4050', display: 'block', marginBottom: 6 }}>
                    {editing ? 'Add More After Photos (optional)' : 'After Photos *'} <span style={{ fontWeight: 400, color: '#9b6070' }}>— up to 10, max 10MB each</span>
                  </label>

                  {/* Existing photos preview when editing */}
                  {editing && editing.images?.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      {editing.images.map(filename => (
                        <div key={filename} style={{ position: 'relative' }}>
                          <img src={thumb(editing, filename)} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', border: '2px solid #f0e4e8' }} />
                        </div>
                      ))}
                      <div style={{ fontSize: 11, color: '#9b6070', alignSelf: 'center' }}>Current photos</div>
                    </div>
                  )}

                  {/* New file previews */}
                  {imagePreviews.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      {imagePreviews.map((src, i) => (
                        <img key={i} src={src} alt="" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', border: '2px solid #c8456a' }} />
                      ))}
                    </div>
                  )}

                  <input
                    ref={afterInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleAfterFiles}
                  />
                  <button
                    type="button"
                    onClick={() => afterInputRef.current?.click()}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                  >
                    <Upload size={15} />
                    {imagePreviews.length > 0
                      ? `${imagePreviews.length} photo${imagePreviews.length !== 1 ? 's' : ''} selected — tap to change`
                      : 'Choose After Photos'}
                  </button>
                </div>

                {/* Before photo (optional — enables drag slider) */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#6b4050', display: 'block', marginBottom: 4 }}>
                    Before Photo <span style={{ fontWeight: 400, color: '#9b6070' }}>— optional, enables the before/after drag slider</span>
                  </label>

                  {/* Existing before photo when editing */}
                  {editing?.before_image && !beforePreview && (
                    <div style={{ marginBottom: 8 }}>
                      <img src={beforeThumb(editing)} alt="Before" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', border: '2px solid #f0e4e8' }} />
                      <div style={{ fontSize: 11, color: '#9b6070', marginTop: 4 }}>Current before photo</div>
                    </div>
                  )}

                  {beforePreview && (
                    <div style={{ marginBottom: 8 }}>
                      <img src={beforePreview} alt="Before preview" style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', border: '2px solid #c8456a' }} />
                    </div>
                  )}

                  <input
                    ref={beforeInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={handleBeforeFile}
                  />
                  <button
                    type="button"
                    onClick={() => beforeInputRef.current?.click()}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                  >
                    <Upload size={15} />
                    {beforePreview
                      ? 'Before photo selected — tap to change'
                      : editing?.before_image
                      ? 'Replace Before Photo'
                      : 'Choose Before Photo'}
                  </button>
                </div>

                {/* Caption */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#6b4050', display: 'block', marginBottom: 6 }}>Caption</label>
                  <input
                    value={form.caption}
                    onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
                    placeholder="e.g. Knotless Box Braids with highlights"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #f0e4e8', fontSize: 14, fontFamily: 'Nunito,sans-serif', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>

                {/* Category */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#6b4050', display: 'block', marginBottom: 6 }}>
                    Category <span style={{ fontWeight: 400, color: '#9b6070' }}>— used for filter pills on your shop page</span>
                  </label>
                  <input
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="e.g. Braids, Nails, Skin, Makeup"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #f0e4e8', fontSize: 14, fontFamily: 'Nunito,sans-serif', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>

                {/* Service name */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#6b4050', display: 'block', marginBottom: 6 }}>
                    Linked Service <span style={{ fontWeight: 400, color: '#9b6070' }}>— enables "Request This Look" WhatsApp button</span>
                  </label>
                  <input
                    value={form.service_name}
                    onChange={e => setForm(f => ({ ...f, service_name: e.target.value }))}
                    placeholder="e.g. Knotless Box Braids"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #f0e4e8', fontSize: 14, fontFamily: 'Nunito,sans-serif', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>

                {/* Sort order */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#6b4050', display: 'block', marginBottom: 6 }}>
                    Sort Order <span style={{ fontWeight: 400, color: '#9b6070' }}>— lower number appears first (0 = first)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #f0e4e8', fontSize: 14, fontFamily: 'Nunito,sans-serif', boxSizing: 'border-box', outline: 'none' }}
                  />
                </div>

                {/* Featured toggle */}
                <div
                  onClick={() => setForm(f => ({ ...f, is_featured: !f.is_featured }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${form.is_featured ? '#f59e0b' : '#f0e4e8'}`, background: form.is_featured ? '#fffbeb' : '#fdf5f7', cursor: 'pointer', userSelect: 'none' }}
                >
                  <div style={{ width: 40, height: 22, borderRadius: 11, background: form.is_featured ? '#f59e0b' : '#d4a0b0', position: 'relative', transition: 'background .2s', flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: form.is_featured ? 20 : 2, transition: 'left .2s', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1a1a1f' }}>⭐ Set as Featured</div>
                    <div style={{ fontSize: 11, color: '#9b6070' }}>Pins this photo as the hero at the top of your gallery</div>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #f0e4e8', flexShrink: 0, display: 'flex', gap: 10 }}>
              <button onClick={closeModal} disabled={saving} className="btn-secondary" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : '📤 Upload to Gallery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}