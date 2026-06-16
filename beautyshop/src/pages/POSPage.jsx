// Enhanced POS: Loyalty, Hold/Resume, Quick-add Customer, Split Payment
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, generateReceiptNo } from '../lib/utils'
import { calcPointsEarned, calcMaxRedeemable } from '../lib/loyalty'
import { Search, ScanLine, Plus, Minus, Trash2, CreditCard, Smartphone, Banknote, ShoppingBag, X, User, Tag, PauseCircle, PlayCircle, UserPlus, Split } from 'lucide-react'
import toast from 'react-hot-toast'
import { queueSale, getPendingSales, markSynced, cacheProducts, cacheCategories, getCachedProducts, getCachedCategories } from '../lib/offlineQueue'
import ReceiptModal from '../components/ReceiptModal'

export default function POSPage() {
  const { shop, admin, loading: authLoading } = useAuth()
  const [products, setProducts]     = useState([])
  const [categories, setCategories] = useState([])
  const [cart, setCart]             = useState([])
  const [search, setSearch]         = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [scanBuffer, setScanBuffer] = useState('')
  const [scanning, setScanning]     = useState(false)
  const [customer, setCustomer]     = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [discount, setDiscount]     = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [cashTendered, setCashTendered] = useState('')
  const [mpesaAmount, setMpesaAmount]   = useState('')
  const [redeemPoints, setRedeemPoints] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [completedSale, setCompletedSale] = useState(null)
  const [showReceipt, setShowReceipt]    = useState(false)
  const [heldSales, setHeldSales]        = useState([])
  const [showHeld, setShowHeld]          = useState(false)
  const [showQuickCust, setShowQuickCust] = useState(false)
  const [newCust, setNewCust]            = useState({ name: '', phone: '' })
  const [savingCust, setSavingCust]      = useState(false)
  const [bestSellerId, setBestSellerId]  = useState(null)
  const [isOnline, setIsOnline]          = useState(navigator.onLine)
  const [pendingCount, setPendingCount]  = useState(0)
  const [syncing, setSyncing]            = useState(false)
  const [mobileTab, setMobileTab]        = useState('products')

  useEffect(() => {
    if (shop && !authLoading) {
      const t = setTimeout(() => loadData(), 50)
      return () => clearTimeout(t)
    }
  }, [shop, authLoading])

  useEffect(() => {
    const goOnline = async () => {
      setIsOnline(true)
      // Re-read pending count first so banner shows correctly
      const pending = await getPendingSales()
      setPendingCount(pending.length)
      if (pending.length > 0) {
        toast.success('Back online! Syncing sales…', { icon: '🌐' })
        syncPendingSales()
      } else {
        toast.success('Back online!', { icon: '🌐' })
      }
    }
    const goOffline = () => {
      setIsOnline(false)
      toast('You are offline. Sales will be saved locally.', { icon: '📴', duration: 5000 })
    }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    // Check for pending sales on load
    getPendingSales().then(p => setPendingCount(p.length))
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  useEffect(() => {
    let timer
    const handleKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Enter' && scanBuffer.length > 2) { handleBarcodeScan(scanBuffer); setScanBuffer('') }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        clearTimeout(timer); timer = setTimeout(() => setScanBuffer(''), 300)
        setScanBuffer(p => p + e.key)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [scanBuffer, products])

  const loadData = async () => {
    try {
      const [prods, cats] = await Promise.all([
        pb.collection(C.PRODUCTS).getFullList({ filter: `shop_id="${shop.id}" && status="active"`, sort: 'name', '$autoCancel': false, '$cancelKey': 'pos-products' }),
        pb.collection(C.CATEGORIES).getFullList({ filter: `shop_id="${shop.id}"`, sort: 'sort_order', '$autoCancel': false, '$cancelKey': 'pos-cats' })
      ])
      setProducts(prods); setCategories(cats)
      // Cache locally for offline use
      cacheProducts(prods).catch(() => {})
      cacheCategories(cats).catch(() => {})

      // Best seller of the day
      try {
        const todayStart = new Date(); todayStart.setHours(0,0,0,0)
        const items = await pb.collection(C.SALE_ITEMS).getFullList({
          filter: `sale_id.shop_id="${shop.id}" && sale_id.created>="${todayStart.toISOString()}" && sale_id.status="completed"`
        })
        const tally = {}
        items.forEach(i => { tally[i.product_id] = (tally[i.product_id] || 0) + i.qty })
        const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
        setBestSellerId(top ? top[0] : null)
      } catch { setBestSellerId(null) }
    } catch {
      // Offline fallback — load from local cache
      if (shop) {
        const [cachedProds, cachedCats] = await Promise.all([
          getCachedProducts(shop.id),
          getCachedCategories(shop.id),
        ])
        if (cachedProds.length > 0) {
          setProducts(cachedProds)
          setCategories(cachedCats)
          toast('Loaded from local cache', { icon: '📦', duration: 3000 })
        } else {
          toast.error('No cached data — connect to internet first')
        }
      }
    }
  }

  const syncPendingSales = async () => {
    if (syncing) return
    setSyncing(true)
    try {
      const pending = await getPendingSales()
      if (pending.length === 0) { setSyncing(false); return }
      let synced = 0
      for (const s of pending) {
        try {
          const salePayload = {
            shop_id:          s.shop_id,
            receipt_no:       s.receipt_no,
            customer_id:      s.customer_id || null,
            subtotal_kes:     s.subtotal_kes,
            discount_kes:     s.discount_kes || 0,
            tax_amount_kes:   s.tax_amount_kes || 0,
            total_kes:        s.total_kes,
            payment_method:   s.payment_method,
            payment_status:   s.payment_status,
            status:           s.status,
            total_cost_kes:   s.total_cost_kes || 0,
            gross_profit_kes: s.gross_profit_kes || 0,
            served_by:        s.served_by || null,
            etims_status:     'pending',
          }
          const sale = await pb.collection(C.SALES).create(salePayload)
          const items = s.items || []
          await Promise.all(items.map((item, idx) =>
            pb.collection(C.SALE_ITEMS).create({
              sale_id: sale.id, product_id: item.id, product_name: item.name,
              qty: item.qty, unit_price_kes: item.unit_price, unit_cost_kes: item.cost_price_kes || 0,
              total_kes: item.unit_price * item.qty,
            }, { '$autoCancel': false, '$cancelKey': `sync-item-${s.id}-${idx}` })
          ))
          await markSynced(s.id)
          synced++
        } catch (err) {
          console.error('Sync failed for sale', s.id, err?.message)
        }
      }
      const remaining = await getPendingSales()
      setPendingCount(remaining.length)
      if (synced > 0) toast.success(`Synced ${synced} offline sale${synced > 1 ? 's' : ''}! ✅`)
      loadData()
    } catch (err) { console.error('Sync error:', err) }
    finally { setSyncing(false) }
  }

  const handleBarcodeScan = (barcode) => {
    const p = products.find(p => p.barcode === barcode || p.sku === barcode)
    if (p) { addToCart(p); toast.success(`Added: ${p.name}`, { icon: '📦' }) }
    else toast.error(`No product: ${barcode}`)
  }

  const addToCart = (product) => {
    if (product.track_inventory && product.stock_qty <= 0) return toast.error('Out of stock!')
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id)
      if (ex) {
        if (product.track_inventory && ex.qty >= product.stock_qty) return (toast.error('Insufficient stock!'), prev)
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { ...product, qty: 1, unit_price: product.price_kes }]
    })
  }

  const updateQty  = (id, delta) => setCart(p => p.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i))
  const removeItem = (id) => setCart(p => p.filter(i => i.id !== id))
  const clearCart  = () => { setCart([]); setCustomer(null); setDiscount(0); setCashTendered(''); setMpesaAmount(''); setRedeemPoints(false); setCustomerSearch('') }

  const searchCustomers = async (q) => {
    if (!q || q.length < 1) return setCustomerResults([])
    try {
      const all = await pb.collection(C.CUSTOMERS).getList(1, 200, {
        filter: `shop_id="${shop.id}"`,
        '$autoCancel': false,
        '$cancelKey': 'pos-customer-search'
      })
      const lower = q.toLowerCase()
      const matched = all.items
        .filter(c => !c.notes?.includes('__SUPPLIER__'))
        .filter(c =>
          c.name?.toLowerCase().includes(lower) ||
          c.phone?.includes(q)
        ).slice(0, 6)
      setCustomerResults(matched)
    } catch(e) { console.error('Customer search error:', e.message) }
  }

  const quickAddCustomer = async (e) => {
    e.preventDefault(); setSavingCust(true)
    try {
      const c = await pb.collection(C.CUSTOMERS).create({ shop_id: shop.id, name: newCust.name, phone: newCust.phone, loyalty_points: 0, total_spent_kes: 0, visit_count: 0 })
      setCustomer(c); setCustomerSearch(c.name); setShowQuickCust(false); setNewCust({ name: '', phone: '' })
      toast.success(`${c.name} added! ✅`)
    } catch { toast.error('Failed') } finally { setSavingCust(false) }
  }

  const holdSale = () => {
    if (!cart.length) return toast.error('Cart is empty')
    setHeldSales(p => [...p, { id: Date.now(), cart: [...cart], customer, discount, note: `Held ${new Date().toLocaleTimeString()}` }])
    clearCart(); toast.success('Sale held! Serve next customer.', { icon: '⏸️' })
  }

  const resumeHeld = (held) => {
    if (cart.length > 0 && !confirm('Replace current cart?')) return
    setCart(held.cart); setCustomer(held.customer); setDiscount(held.discount)
    setHeldSales(p => p.filter(h => h.id !== held.id)); setShowHeld(false)
    toast.success('Sale resumed!', { icon: '▶️' })
  }

  const subtotal        = cart.reduce((s, i) => s + i.unit_price * i.qty, 0)
  const discountAmt     = Number(discount) || 0
  const loyaltyDiscount = redeemPoints && customer ? Math.min(calcMaxRedeemable(customer.loyalty_points || 0), subtotal - discountAmt) : 0
  const afterDiscount   = Math.max(0, subtotal - discountAmt - loyaltyDiscount)
  const tax             = shop?.tax_rate ? afterDiscount * (shop.tax_rate / 100) : 0
  const total           = afterDiscount + tax
  const totalCost       = cart.reduce((s, i) => s + (i.cost_price_kes || 0) * i.qty, 0)
  const grossProfit     = total - totalCost
  const pointsEarned    = customer ? calcPointsEarned(total) : 0
  const mpesaAmt        = paymentMethod === 'mixed' ? (Number(mpesaAmount) || 0) : 0
  const cashAmt         = paymentMethod === 'mixed' ? Math.max(0, total - mpesaAmt) : 0
  const change          = paymentMethod === 'cash' && cashTendered ? Math.max(0, Number(cashTendered) - total) : 0

  const payLater = async () => {
    if (!cart.length) return toast.error('Cart is empty')
    if (!customer) return toast.error('Select a customer first — credit requires a name')
    if (!confirm(`Record KES ${total.toLocaleString('en-KE', { minimumFractionDigits: 2 })} as credit for ${customer.name}?`)) return
    setProcessing(true)
    try {
      const receiptNo = generateReceiptNo(shop.slug)
      const sale = await pb.collection(C.SALES).create({
        shop_id: shop.id, receipt_no: receiptNo,
        customer_id: customer.id,
        subtotal_kes: subtotal, discount_kes: discountAmt,
        tax_amount_kes: tax, total_kes: total,
        payment_method: 'credit', payment_status: 'pending',
        status: 'completed',
        total_cost_kes: totalCost, gross_profit_kes: grossProfit,
        served_by: admin?.id, etims_status: 'pending',
        notes: `CREDIT — awaiting payment`,
        share_token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)
      })
      await Promise.all(cart.map((item, idx) => pb.collection(C.SALE_ITEMS).create({
        sale_id: sale.id,
        product_id: item.id, product_name: item.name,
        qty: item.qty, unit_price_kes: item.unit_price, unit_cost_kes: item.cost_price_kes || 0,
        total_kes: item.unit_price * item.qty,
      }, { '$autoCancel': false, '$cancelKey': `pay-later-item-${idx}` })))
      // Deduct stock
      await Promise.all(cart.filter(i => i.track_inventory).map(async (item, idx) => {
        const nq = Math.max(0, (item.stock_qty || 0) - item.qty)
        await pb.collection(C.PRODUCTS).update(item.id, { stock_qty: nq }, { '$autoCancel': false, '$cancelKey': `pay-later-stock-${idx}` })
        await pb.collection(C.INV_MOVEMENTS).create({ shop_id: shop.id, product_id: item.id, type: 'sale', qty: -item.qty, before_qty: item.stock_qty, after_qty: nq, reference: receiptNo, created_by: admin?.id }, { '$autoCancel': false, '$cancelKey': `pay-later-inv-${idx}` })
      }))
      // Update customer total_spent and visit_count (credit still counts as a visit)
      await pb.collection(C.CUSTOMERS).update(customer.id, {
        visit_count: (customer.visit_count || 0) + 1,
      })
      clearCart(); loadData()
      toast.success(`💳 Credit recorded for ${customer.name} — KES ${total.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`, { duration: 5000 })
    } catch (err) { toast.error('Failed: ' + (err?.message || 'Unknown')) }
    finally { setProcessing(false) }
  }

  const processSale = async () => {
    if (!cart.length) return toast.error('Cart is empty')
    if (paymentMethod === 'cash' && cashTendered && Number(cashTendered) < total) return toast.error('Insufficient cash')

    // OFFLINE MODE — queue locally
    if (!isOnline) {
      const receiptNo = generateReceiptNo(shop.slug)
      await queueSale({
        shop_id: shop.id, receipt_no: receiptNo,
        customer_id: customer?.id || null,
        subtotal_kes: subtotal, discount_kes: discountAmt + loyaltyDiscount,
        tax_amount_kes: tax, total_kes: total,
        payment_method: paymentMethod, payment_status: 'paid',
        status: 'completed',
        total_cost_kes: totalCost, gross_profit_kes: grossProfit,
        served_by: admin?.id,
        items: cart,
        customer,
      })
      // Small delay to let Dexie finish writing before reading count
      await new Promise(r => setTimeout(r, 100))
      const pending = await getPendingSales()
      const newCount = pending.length
      setPendingCount(newCount)
      clearCart()
      toast.success(`Sale saved offline! Will sync when online. (${newCount} pending)`, { icon: '📴', duration: 5000 })
      return
    }

    setProcessing(true)
    try {
      const receiptNo = generateReceiptNo(shop.slug)
      const sale = await pb.collection(C.SALES).create({
        shop_id: shop.id, receipt_no: receiptNo,
        customer_id: customer?.id || null,
        subtotal_kes: subtotal, discount_kes: discountAmt + loyaltyDiscount,
        tax_amount_kes: tax, total_kes: total,
        payment_method: paymentMethod, payment_status: 'paid',
        cash_tendered: paymentMethod === 'cash' ? Number(cashTendered) || total : paymentMethod === 'mixed' ? cashAmt : null,
        change_given: change, status: 'completed',
        total_cost_kes: totalCost, gross_profit_kes: grossProfit,
        served_by: admin?.id, etims_status: 'pending',
        notes: redeemPoints ? `Loyalty redeemed: ${fmtKES(loyaltyDiscount)}` : '',
        share_token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)
      })
      await Promise.all(cart.map((item, idx) => pb.collection(C.SALE_ITEMS).create({
        sale_id: sale.id, product_id: item.id, product_name: item.name,
        qty: item.qty, unit_price_kes: item.unit_price, unit_cost_kes: item.cost_price_kes || 0,
        total_kes: item.unit_price * item.qty,
      }, { '$autoCancel': false, '$cancelKey': `sale-item-${idx}` })))
      await Promise.all(cart.filter(i => i.track_inventory).map(async (item, idx) => {
        const nq = Math.max(0, (item.stock_qty || 0) - item.qty)
        await pb.collection(C.PRODUCTS).update(item.id, { stock_qty: nq }, { '$autoCancel': false, '$cancelKey': `stock-update-${idx}` })
        await pb.collection(C.INV_MOVEMENTS).create({ shop_id: shop.id, product_id: item.id, type: 'sale', qty: -item.qty, before_qty: item.stock_qty, after_qty: nq, reference: receiptNo, created_by: admin?.id }, { '$autoCancel': false, '$cancelKey': `inv-move-${idx}` })
      }))
      if (customer) {
        const newPts = Math.max(0, (customer.loyalty_points || 0) - (redeemPoints ? customer.loyalty_points : 0)) + pointsEarned
        await pb.collection(C.CUSTOMERS).update(customer.id, { total_spent_kes: (customer.total_spent_kes || 0) + total, visit_count: (customer.visit_count || 0) + 1, loyalty_points: newPts })
      }
      setTimeout(async () => { try { await pb.collection(C.SALES).update(sale.id, { etims_ref: `ETM-${Date.now()}`, etims_status: 'success' }) } catch {} }, 2000)
      setCompletedSale({ ...sale, items: cart, customer, change, pointsEarned })
      setShowReceipt(true); clearCart(); loadData()
      toast.success(`Sale done! ${receiptNo}`, { icon: '🎉', duration: 4000 })

      // G8-A — Best Customer thank-you prompt on every 5th visit
      if (customer && shop?.phone) {
        const newVisitCount = (customer.visit_count || 0) + 1
        if (newVisitCount > 0 && newVisitCount % 5 === 0) {
          const vipMsg = encodeURIComponent(
            'Hi ' + customer.name + '! 🌟\n\n' +
            'You just made your *' + newVisitCount + 'th visit* to ' + shop.name + ' — you are officially one of our VIP customers! 💄✨\n\n' +
            'Thank you so much for your loyalty. It means the world to us. 🙏\n\n' +
            '_' + shop.name + ' · Powered by SalesTrack_'
          )
          const vipPhone = customer.phone?.replace(/[^0-9]/g, '')
          if (vipPhone) {
            setTimeout(() => {
              toast((t) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>🌟 {customer.name} just hit visit #{newVisitCount}!</div>
                  <div style={{ fontSize: 12, color: '#6b4050' }}>Send them a VIP thank-you on WhatsApp?</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { window.open('https://wa.me/' + vipPhone + '?text=' + vipMsg, '_blank', 'noopener,noreferrer'); toast.dismiss(t.id) }}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none', background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                      💝 Send Thank-You
                    </button>
                    <button onClick={() => toast.dismiss(t.id)}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #f0e4e8', background: '#fff', color: '#9b6070', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                      Skip
                    </button>
                  </div>
                </div>
              ), { duration: 12000, style: { maxWidth: 320 } })
            }, 2000)
          }
        }
      }
    } catch (err) { toast.error('Failed: ' + (err?.message || 'Unknown')) }
    finally { setProcessing(false) }
  }

  const filtered = products.filter(p => {
    const mc = activeCategory === 'all' || p.category_id === activeCategory
    const ms = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search) || p.sku?.includes(search)
    return mc && ms
  })

  return (
    <div>
      {/* Offline / Sync banner */}
      {!isOnline && (
        <div style={{ background: '#f59e0b', color: '#fff', padding: '8px 16px', borderRadius: 10, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
          📴 Offline mode — sales are saved locally and will sync automatically when you reconnect
          {pendingCount > 0 && <span style={{ background: '#fff', color: '#b45309', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 800 }}>{pendingCount} pending</span>}
        </div>
      )}
      {isOnline && pendingCount > 0 && (
        <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '8px 16px', borderRadius: 10, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <span>🌐 Online · {pendingCount} offline sale{pendingCount > 1 ? 's' : ''} pending sync</span>
          <button onClick={syncPendingSales} disabled={syncing} style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
        </div>
      )}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div className="page-title">Point of Sale 🛒</div><div className="page-subtitle">Scan, tap, sell · Barcode scanner always ready</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {heldSales.length > 0 && (
            <button className="btn-secondary" onClick={() => setShowHeld(true)} style={{ position: 'relative' }}>
              <PlayCircle size={15} /> Held Sales
              <span style={{ position: 'absolute', top: -6, right: -6, background: '#c8456a', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{heldSales.length}</span>
            </button>
          )}
          <button className="btn-secondary" onClick={holdSale} disabled={!cart.length}><PauseCircle size={15} /> Hold</button>
        </div>
      </div>

      {/* Mobile tab switcher — only visible on mobile */}
      <div className="pos-mobile-tabs">
        <button
          onClick={() => setMobileTab('products')}
          style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '10px 0 0 10px', background: mobileTab === 'products' ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fff', color: mobileTab === 'products' ? '#fff' : '#8b2550', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', borderRight: '1px solid #f0e4e8' }}
        >
          🛍️ Products {products.length > 0 && `(${filtered.length})`}
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          style={{ flex: 1, padding: '10px', border: 'none', borderRadius: '0 10px 10px 0', background: mobileTab === 'cart' ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fff', color: mobileTab === 'cart' ? '#fff' : '#8b2550', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Nunito,sans-serif', position: 'relative' }}
        >
          🛒 Cart {cart.length > 0 && <span style={{ background: mobileTab === 'cart' ? 'rgba(255,255,255,0.3)' : '#c8456a', color: '#fff', borderRadius: 20, fontSize: 11, padding: '1px 7px', marginLeft: 4, fontWeight: 800 }}>{cart.length}</span>}
        </button>
      </div>

      <div className="pos-grid">
        {/* LEFT */}
        <div className="pos-panel-products" data-mobile-hidden={mobileTab === 'cart'} style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
              <input className="input" style={{ paddingLeft: 38 }} placeholder="Search name, barcode, SKU…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <button className={`btn-secondary ${scanning ? 'scanning' : ''}`} onClick={() => setScanning(!scanning)}>
              <ScanLine size={15} /> {scanning ? '🟢' : 'Scan'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {[{ id: 'all', name: 'All', icon: '🛍️' }, ...categories].map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${activeCategory === cat.id ? '#c8456a' : '#f0e4e8'}`, background: activeCategory === cat.id ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fff', color: activeCategory === cat.id ? '#fff' : '#6b1e38', fontWeight: 600, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Nunito,sans-serif' }}>
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, alignContent: 'start' }}>
            {filtered.map(p => {
              const out = p.track_inventory && p.stock_qty <= 0
              const inCart = cart.find(i => i.id === p.id)
              return (
                <div key={p.id} className={`product-tile ${out ? 'out-of-stock' : ''}`} onClick={() => !out && addToCart(p)} style={{ outline: inCart ? '2px solid #c8456a' : 'none' }}>
                  {inCart && <div style={{ position: 'absolute', top: 6, right: 6, background: '#c8456a', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</div>}
                  {bestSellerId === p.id && !inCart && (
                    <div style={{ position: 'absolute', top: 6, left: 6, background: 'linear-gradient(135deg,#e6b800,#f59e0b)', color: '#fff', borderRadius: 6, fontSize: 9, fontWeight: 800, padding: '2px 5px', letterSpacing: '0.04em', lineHeight: 1.3 }}>🔥 TOP</div>
                  )}
                  <div style={{ fontSize: 26, textAlign: 'center' }}>{p.is_service ? '✂️' : '🧴'}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#c8456a' }}>{fmtKES(p.price_kes)}</div>
                  {p.track_inventory && <div style={{ fontSize: 10, color: p.stock_qty <= 5 ? '#dc2626' : '#9b6070' }}>{out ? '❌ Out' : `${p.stock_qty} left`}</div>}
                </div>
              )
            })}
            {filtered.length === 0 && <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: '#9b6070', fontSize: 14 }}>🔍 No products found</div>}
          </div>
        </div>

        {/* RIGHT: Cart */}
        <div className="pos-panel-cart" data-mobile-hidden={mobileTab === 'products'} style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, border: '1px solid #f0e4e8', overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', background: 'linear-gradient(90deg,#fce8ed,#fff5f7)', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ShoppingBag size={16} color="#c8456a" /><span style={{ fontFamily: 'Playfair Display,serif', fontWeight: 700, fontSize: 16, color: '#3d1020' }}>Cart ({cart.length})</span></div>
            {cart.length > 0 && <button className="btn-ghost" onClick={clearCart} style={{ color: '#dc2626', fontSize: 11, padding: '3px 8px' }}><X size={10} /> Clear</button>}
          </div>

          {/* Customer Search */}
          <div style={{ padding: '9px 13px', borderBottom: '1px solid #f5edf0' }}>
            <div style={{ position: 'relative' }}>
              <User size={12} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9b6070' }} />
              <input className="input" style={{ paddingLeft: 30, paddingRight: 34, fontSize: 12 }} placeholder="Search or add customer…"
                value={customer ? customer.name : customerSearch}
                onChange={e => {
                  const v = e.target.value
                  setCustomerSearch(v)
                  setCustomer(null)
                  setRedeemPoints(false)
                  setCustomerResults([])
                  if (v.length >= 1) searchCustomers(v)
                }} />
              <button onClick={() => setShowQuickCust(true)} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#c8456a' }}>
                <UserPlus size={13} />
              </button>
            </div>
            {customerResults.length > 0 && !customer && (
              <div style={{ background: '#fff', border: '1px solid #f0e4e8', borderRadius: 10, marginTop: 4, boxShadow: '0 4px 16px #0002', overflow: 'hidden', zIndex: 10, position: 'relative' }}>
                {customerResults.map(c => (
                  <div key={c.id} onClick={() => { setCustomer(c); setCustomerSearch(''); setCustomerResults([]) }} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}
                    onMouseOver={e => e.currentTarget.style.background = '#fce8ed'} onMouseOut={e => e.currentTarget.style.background = ''}>
                    <span><strong>{c.name}</strong> · {c.phone}</span>
                    <span style={{ color: '#d97706', fontWeight: 700 }}>⭐ {c.loyalty_points || 0}</span>
                  </div>
                ))}
              </div>
            )}
            {customer && (
              <div style={{ marginTop: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#059669' }}>✅ {customer.name} · ⭐ {customer.loyalty_points || 0} pts</span>
                {(customer.loyalty_points || 0) >= 50 && (
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#d97706', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input type="checkbox" checked={redeemPoints} onChange={e => setRedeemPoints(e.target.checked)} style={{ accentColor: '#d97706' }} />
                    Redeem ({fmtKES(calcMaxRedeemable(customer.loyalty_points))})
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 13px' }}>
            {!cart.length ? (
              <div style={{ textAlign: 'center', padding: '36px 0', color: '#b08090' }}>
                <ShoppingBag size={30} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.2 }} />
                <p style={{ fontSize: 13 }}>Cart empty · Click a product or scan</p>
              </div>
            ) : cart.map(item => (
              <div key={item.id} className="cart-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: 11, color: '#9b6070' }}>{fmtKES(item.unit_price)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button onClick={() => updateQty(item.id, -1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #e8d0d6', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={10} /></button>
                  <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                  <button onClick={() => updateQty(item.id, 1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid #e8d0d6', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={10} /></button>
                  <button onClick={() => removeItem(item.id)} style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: '#fee2e2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={10} color="#dc2626" /></button>
                </div>
                <div style={{ width: 58, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#c8456a' }}>{fmtKES(item.unit_price * item.qty)}</div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ padding: '9px 13px', borderTop: '1px solid #f5edf0' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
              <Tag size={12} style={{ color: '#9b6070', marginTop: 12, flexShrink: 0 }} />
              <input className="input" type="number" placeholder="Discount (KES)" value={discount || ''} onChange={e => setDiscount(e.target.value)} style={{ fontSize: 12 }} />
            </div>
            {[
              { label: 'Subtotal', value: subtotal },
              ...(discountAmt > 0 ? [{ label: '− Discount', value: -discountAmt, red: true }] : []),
              ...(loyaltyDiscount > 0 ? [{ label: '− Loyalty', value: -loyaltyDiscount, gold: true }] : []),
              ...(tax > 0 ? [{ label: `VAT ${shop?.tax_rate}%`, value: tax }] : []),
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: '#6b4050' }}>{r.label}</span>
                <span style={{ color: r.red ? '#dc2626' : r.gold ? '#d97706' : '#1a1a1f' }}>{fmtKES(Math.abs(r.value))}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, borderTop: '2px solid #f0e4e8', paddingTop: 5, marginTop: 3 }}>
              <span>Total</span><span style={{ color: '#c8456a' }}>{fmtKES(total)}</span>
            </div>
            {customer && cart.length > 0 && <div style={{ fontSize: 11, color: '#d97706', textAlign: 'right', marginTop: 1 }}>+{pointsEarned} pts earned</div>}
          </div>

          {/* Payment */}
          <div style={{ padding: '0 13px 12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5, marginBottom: 7 }}>
              {[
                { v: 'cash', icon: <Banknote size={13}/>, label: 'Cash' },
                { v: 'mpesa', icon: <Smartphone size={13}/>, label: 'M-Pesa' },
                { v: 'visa_mc', icon: <CreditCard size={13}/>, label: 'Card' },
                { v: 'mixed', icon: <Split size={13}/>, label: 'Split' },
              ].map(pm => (
                <button key={pm.v} onClick={() => setPaymentMethod(pm.v)} style={{ padding: '6px 2px', borderRadius: 8, border: `2px solid ${paymentMethod === pm.v ? '#c8456a' : '#f0e4e8'}`, background: paymentMethod === pm.v ? '#fce8ed' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: paymentMethod === pm.v ? '#c8456a' : '#6b4050', fontWeight: 600, fontSize: 10, fontFamily: 'Nunito,sans-serif' }}>
                  {pm.icon} {pm.label}
                </button>
              ))}
            </div>
            {paymentMethod === 'cash' && (
              <>
                <input className="input" type="number" placeholder="Cash tendered (KES)" value={cashTendered} onChange={e => setCashTendered(e.target.value)} style={{ marginBottom: 5, fontSize: 12 }} />
                {cashTendered && Number(cashTendered) >= total && <div style={{ background: '#f0fdf4', color: '#059669', borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700, marginBottom: 5 }}>💵 Change: {fmtKES(change)}</div>}
              </>
            )}
            {paymentMethod === 'mixed' && (
              <div style={{ marginBottom: 5 }}>
                <input className="input" type="number" placeholder="M-Pesa amount (KES)" value={mpesaAmount} onChange={e => setMpesaAmount(e.target.value)} style={{ marginBottom: 4, fontSize: 12 }} />
                {mpesaAmount && Number(mpesaAmount) < total && <div style={{ background: '#f0f9ff', color: '#0369a1', borderRadius: 8, padding: '5px 11px', fontSize: 12, fontWeight: 700 }}>💵 Cash balance: {fmtKES(cashAmt)}</div>}
              </div>
            )}
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14, borderRadius: 12 }} onClick={processSale} disabled={processing || !cart.length}>
              {processing ? <><div style={{ width: 15, height: 15, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Processing…</> : `✅ Complete · ${fmtKES(total)}`}
            </button>
            <button onClick={payLater} disabled={processing || !cart.length || !customer}
              style={{ width: '100%', marginTop: 6, padding: '9px', borderRadius: 12, border: '2px solid #f59e0b', background: !cart.length || !customer ? '#f5edf0' : '#fffbeb', color: !cart.length || !customer ? '#9b6070' : '#b45309', fontWeight: 700, fontSize: 13, cursor: !cart.length || !customer ? 'not-allowed' : 'pointer', fontFamily: 'Nunito,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              💳 Pay Later {!customer && cart.length > 0 ? '(select customer first)' : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Held Sales Modal */}
      {showHeld && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowHeld(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header"><span className="modal-title">⏸️ Held Sales</span><button onClick={() => setShowHeld(false)} className="btn-ghost" style={{ padding: 8 }}><X size={16} /></button></div>
            <div className="modal-body">
              {heldSales.map(h => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid #f5edf0' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{h.customer?.name || 'Walk-in'} · {h.cart.length} item{h.cart.length !== 1 ? 's' : ''}</div>
                    <div style={{ fontSize: 12, color: '#9b6070' }}>{h.note}</div>
                    <div style={{ fontSize: 13, color: '#c8456a', fontWeight: 700 }}>{fmtKES(h.cart.reduce((a, i) => a + i.unit_price * i.qty, 0))}</div>
                  </div>
                  <button className="btn-primary" onClick={() => resumeHeld(h)} style={{ fontSize: 12, padding: '6px 12px' }}><PlayCircle size={12} /> Resume</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Customer */}
      {showQuickCust && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowQuickCust(false)}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <div className="modal-header"><span className="modal-title">Quick Add Customer</span><button onClick={() => setShowQuickCust(false)} className="btn-ghost" style={{ padding: 8 }}><X size={16} /></button></div>
            <div className="modal-body">
              <form onSubmit={quickAddCustomer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><label className="label">Name *</label><input className="input" required autoFocus value={newCust.name} onChange={e => setNewCust(f => ({ ...f, name: e.target.value }))} /></div>
                <div><label className="label">Phone</label><input className="input" value={newCust.phone} onChange={e => setNewCust(f => ({ ...f, phone: e.target.value }))} placeholder="+254…" /></div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowQuickCust(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={savingCust}>{savingCust ? 'Adding…' : '✅ Add & Select'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showReceipt && completedSale && (
        <ReceiptModal sale={completedSale} shop={shop} onClose={() => { setShowReceipt(false); setCompletedSale(null) }} />
      )}
    </div>
  )
}