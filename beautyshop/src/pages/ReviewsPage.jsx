import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import pb from '../lib/pb'
import { fmtDate } from '../lib/utils'
import { Check, Trash2 } from 'lucide-react'

export default function ReviewsPage() {
  const { shop, loading: authLoading } = useAuth()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending') // pending | approved

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, authLoading])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await pb.collection('bs_reviews').getList(1, 200, {
        filter: `shop_id="${shop.id}"`,
        sort: '-created',
      })
      setReviews(res.items)
    } catch {
      toast.error('Could not load reviews')
    } finally {
      setLoading(false)
    }
  }

  const approve = async (review) => {
    try {
      await pb.collection('bs_reviews').update(review.id, { is_approved: true })
      toast.success('Review approved — now visible on your shop page')
      setReviews(prev => prev.map(r => r.id === review.id ? { ...r, is_approved: true } : r))
    } catch (err) {
      toast.error(err?.message || 'Could not approve review')
    }
  }

  const unapprove = async (review) => {
    try {
      await pb.collection('bs_reviews').update(review.id, { is_approved: false })
      toast.success('Review hidden from your shop page')
      setReviews(prev => prev.map(r => r.id === review.id ? { ...r, is_approved: false } : r))
    } catch (err) {
      toast.error(err?.message || 'Could not update review')
    }
  }

  const remove = async (review) => {
    if (!window.confirm('Delete this review permanently? This cannot be undone.')) return
    try {
      await pb.collection('bs_reviews').delete(review.id)
      toast.success('Review deleted')
      setReviews(prev => prev.filter(r => r.id !== review.id))
    } catch (err) {
      toast.error(err?.message || 'Could not delete review')
    }
  }

  const pending  = reviews.filter(r => !r.is_approved)
  const approved = reviews.filter(r => r.is_approved)
  const list = tab === 'pending' ? pending : approved

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Customer Reviews ⭐</div>
          <div className="page-subtitle">{pending.length} pending approval · {approved.length} live on your shop page</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('pending')} className={tab === 'pending' ? 'btn-primary' : 'btn-secondary'}>
          Pending {pending.length > 0 && `(${pending.length})`}
        </button>
        <button onClick={() => setTab('approved')} className={tab === 'approved' ? 'btn-primary' : 'btn-secondary'}>
          Approved ({approved.length})
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>Loading…</div>
      ) : list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>⭐</div>
          <p style={{ color: '#9b6070', margin: 0 }}>
            {tab === 'pending' ? 'No reviews waiting for approval.' : 'No approved reviews yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(r => (
            <div key={r.id} className="card" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1f' }}>{r.customer_name}</div>
                  <div style={{ fontSize: 12, color: '#d97706', marginTop: 2 }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                </div>
                <div style={{ fontSize: 11, color: '#9b6070', whiteSpace: 'nowrap' }}>{fmtDate(r.created)}</div>
              </div>
              <p style={{ fontSize: 13, color: '#3d1020', lineHeight: 1.6, margin: '0 0 12px' }}>{r.review_text}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {!r.is_approved ? (
                  <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => approve(r)}>
                    <Check size={14} /> Approve
                  </button>
                ) : (
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => unapprove(r)}>
                    Hide from shop page
                  </button>
                )}
                <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px', color: '#dc2626' }} onClick={() => remove(r)}>
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}