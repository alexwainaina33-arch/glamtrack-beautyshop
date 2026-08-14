// Enhanced POS: Loyalty, Hold/Resume, Quick-add Customer, Split Payment
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C, PB_URL } from '../lib/pb'
import { fmtKES, generateReceiptNo } from '../lib/utils'
import { calcPointsEarned, calcMaxRedeemable } from '../lib/loyalty'
import { Search, ScanLine, Plus, Minus, Trash2, CreditCard, Smartphone, Banknote, ShoppingBag, X, User, Tag, PauseCircle, PlayCircle, UserPlus, Split } from 'lucide-react'
import toast from 'react-hot-toast'
import { queueSale, getPendingSales, markSynced, cacheProducts, cacheCategories, getCachedProducts, getCachedCategories } from '../lib/offlineQueue'
import ReceiptModal from '../components/ReceiptModal'

export default function POSPage() {
  const { shop, admin, loading: authLoading, isLocked } = useAuth()
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
  const [recentCustomers, setRecentCustomers] = useState([])
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false)
  const [qtyInput, setQtyInput]          = useState('')
  const [qtyTargetId, setQtyTargetId]    = useState(null)
  const [customerHistory, setCustomerHistory] = useState(null)
  const [variantsByProduct, setVariantsByProduct] = useState({}) // { [product_id]: [variant, ...] }
  const [variantPopupProduct, setVariantPopupProduct] = useState(null)
  const audioRef = useRef(null)

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
      
      // Global shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (tag === 'INPUT' && e.target.type === 'number' && e.target.placeholder.includes('quantity')) return
        if (tag === 'INPUT' && e.target.placeholder.includes('Qty')) return
      }
      
      // Ctrl+P: Pay
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); if (cart.length) setShowPaymentConfirm(true) }
      // Ctrl+C: Clear cart
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); if (cart.length) clearCart() }
      // Ctrl+H: Hold sale
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') { e.preventDefault(); holdSale() }
      // Escape: cancel qty input or close modals
      if (e.key === 'Escape') { setQtyInput(''); setQtyTargetId(null); setShowPaymentConfirm(false) }
      
      // Number keys for quick qty when focused on quantity input
      if (tag === 'INPUT' && (e.currentTarget.placeholder?.includes('quantity') || e.currentTarget.placeholder?.includes('Qty'))) return
      
      // Barcode scanning
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Enter' && scanBuffer.length > 2) { handleBarcodeScan(scanBuffer); setScanBuffer('') }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        clearTimeout(timer); timer = setTimeout(() => setScanBuffer(''), 300)
        setScanBuffer(p => p + e.key)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [scanBuffer, products, cart])

  const loadData = async () => {
    try {
      const [prods, cats] = await Promise.all([
        pb.collection(C.PRODUCTS).getFullList({ filter: `shop_id="${shop.id}" && status="active"`, sort: 'name', '$autoCancel': false, '$cancelKey': 'pos-products' }),
        pb.collection(C.CATEGORIES).getFullList({ filter: `shop_id="${shop.id}"`, sort: 'sort_order', '$autoCancel': false, '$cancelKey': 'pos-cats' })
      ])
      setProducts(prods); setCategories(cats)

      // Load variants for any product that has them — one query, grouped by product_id
      const variantProductIds = prods.filter(p => p.has_variants).map(p => p.id)
      if (variantProductIds.length > 0) {
        try {
          const filterStr = variantProductIds.map(id => `product_id="${id}"`).join(' || ')
          const allVariants = await pb.collection(C.PRODUCT_VARIANTS).getFullList({
            filter: filterStr, sort: 'sort_order', '$autoCancel': false, '$cancelKey': 'pos-variants',
          })
          const grouped = {}
          allVariants.forEach(v => { (grouped[v.product_id] = grouped[v.product_id] || []).push(v) })
          setVariantsByProduct(grouped)
        } catch { setVariantsByProduct({}) }
      } else {
        setVariantsByProduct({})
      }
      // Cache locally for offline use
      cacheProducts(prods).catch(() => {})
      cacheCategories(cats).catch(() => {})
      // Load recent customers
      loadRecentCustomers()

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
          loadRecentCustomers()
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
      let failed = 0
      let lastError = ''
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
          for (const item of items) {
            if (!item.track_inventory) continue
            try {
              if (item.variant_id) {
                const currentVariant = await pb.collection(C.PRODUCT_VARIANTS).getOne(item.variant_id, { '$autoCancel': false, '$cancelKey': `sync-variant-fetch-${item.variant_id}` })
                const nq = Math.max(0, (currentVariant.stock_qty || 0) - item.qty)
                await pb.collection(C.PRODUCT_VARIANTS).update(item.variant_id, { stock_qty: nq }, { '$autoCancel': false, '$cancelKey': `sync-variant-stock-${item.variant_id}` })
                const siblings = await pb.collection(C.PRODUCT_VARIANTS).getFullList({ filter: `product_id="${item.id}"`, '$autoCancel': false, '$cancelKey': `sync-siblings-${item.id}` })
                const total = siblings.reduce((sum, v) => sum + (v.id === item.variant_id ? nq : (v.stock_qty || 0)), 0)
                await pb.collection(C.PRODUCTS).update(item.id, { stock_qty: total }, { '$autoCancel': false, '$cancelKey': `sync-parent-stock-${item.id}` })
                await pb.collection(C.INV_MOVEMENTS).create({ shop_id: s.shop_id, product_id: item.id, type: 'sale', qty: -item.qty, before_qty: currentVariant.stock_qty, after_qty: nq, reference: s.receipt_no, created_by: s.served_by || null }, { '$autoCancel': false, '$cancelKey': `sync-inv-${item.variant_id}-${Date.now()}` })
              } else {
                const currentProduct = await pb.collection(C.PRODUCTS).getOne(item.id, { '$autoCancel': false, '$cancelKey': `sync-product-fetch-${item.id}` })
                const nq = Math.max(0, (currentProduct.stock_qty || 0) - item.qty)
                await pb.collection(C.PRODUCTS).update(item.id, { stock_qty: nq }, { '$autoCancel': false, '$cancelKey': `sync-stock-${item.id}` })
                await pb.collection(C.INV_MOVEMENTS).create({ shop_id: s.shop_id, product_id: item.id, type: 'sale', qty: -item.qty, before_qty: currentProduct.stock_qty, after_qty: nq, reference: s.receipt_no, created_by: s.served_by || null }, { '$autoCancel': false, '$cancelKey': `sync-inv-${item.id}-${Date.now()}` })
              }
            } catch (stockErr) {
              console.error('Stock deduction failed during sync for item', item.id, stockErr?.message)
            }
          }
          await markSynced(s.id)
          synced++
        } catch (err) {
          const fieldErrors = err?.data?.data || {}
          
          if (fieldErrors?.receipt_no?.code === 'validation_not_unique') {
            await markSynced(s.id)
            synced++
            console.log('Sale already synced, clearing:', s.receipt_no)
          } else {
            console.error('Sync failed for sale', s.id, err?.message)
            failed++
            const errMsg = err?.data?.data ? JSON.stringify(err.data.data) : ''
            lastError = errMsg || err?.data?.message || err?.message || 'Unknown error'
            console.error('Full sync error:', JSON.stringify(err?.data || err))
          }
        }
      }
      const remaining = await getPendingSales()
      setPendingCount(remaining.length)
      if (synced > 0) toast.success(`Synced ${synced} offline sale${synced > 1 ? 's' : ''}! ✅`)
      if (failed > 0) toast.error(`${failed} sale${failed > 1 ? 's' : ''} failed to sync: ${lastError}`, { duration: 8000 })
      loadData()
    } catch (err) { toast.error('Sync error: ' + (err?.message || 'Unknown')) }
    finally { setSyncing(false) }
  }

  const handleBarcodeScan = (barcode) => {
    const p = products.find(p => p.barcode === barcode || p.sku === barcode)
    if (p) { 
      addToCart(p)
      playSound('success')
      toast.success(`Added: ${p.name}`, { icon: '📦' }) 
    } else {
      playSound('error')
      toast.error(`No product: ${barcode}`)
    }
  }

  const playSound = (type = 'success') => {
    if (typeof window !== 'undefined' && window.AudioContext) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        
        if (type === 'success') {
          osc.frequency.value = 800
          osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1)
        } else if (type === 'error') {
          osc.frequency.value = 400
          osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.2)
        }
        
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (type === 'success' ? 0.1 : 0.2))
        
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + (type === 'success' ? 0.1 : 0.2))
      } catch (e) { }
    }
  }

  const addToCart = (product, variant = null) => {
    const stockSource = variant || product
    if (product.track_inventory && stockSource.stock_qty <= 0) return toast.error('Out of stock!')
    const cartKey = variant ? `${product.id}__${variant.id}` : product.id
    setCart(prev => {
      const ex = prev.find(i => i.cartKey === cartKey)
      if (ex) {
        return prev
      }
      playSound('success')
      const name = variant ? `${product.name} — ${variant.name}` : product.name
      return [...prev, {
        ...product,
        cartKey,
        name,
        variant_id: variant?.id || null,
        variant_name: variant?.name || null,
        stock_qty: stockSource.stock_qty,           // the relevant stock to check against (variant's or product's own)
        cost_price_kes: variant ? variant.cost_price_kes : product.cost_price_kes,
        qty: 1,
        unit_price: variant ? variant.price_kes : product.price_kes,
      }]
    })
    setVariantPopupProduct(null)
  }

  const updateCartQuantity = (cartKey, rawValue) => {
    // Allow a completely blank field while the cashier replaces the quantity.
    if (rawValue === '') {
      setCart(prev => prev.map(item =>
        item.cartKey === cartKey ? { ...item, qty: '' } : item
      ))
      return
    }

    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed) || parsed <= 0) return

    setCart(prev => prev.map(item => {
      if (item.cartKey !== cartKey) return item

      // S3.31A deliberately keeps whole quantities because the current
      // PocketBase stock schema is integer-only. Decimal quantity support
      // will be a separate schema-safe migration after local acceptance.
      const nextQty = Math.max(1, Math.floor(parsed))

      if (item.track_inventory && nextQty > Number(item.stock_qty || 0)) {
        toast.error(`Only ${item.stock_qty || 0} ${item.unit || 'pcs'} available`)
        return item
      }

      return { ...item, qty: nextQty }
    }))
  }

  const updateCartUnitPrice = (cartKey, rawValue) => {
    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed) || parsed < 0) return

    setCart(prev => prev.map(item =>
      item.cartKey === cartKey ? { ...item, unit_price: parsed } : item
    ))
  }

  const removeItem = (cartKey) => setCart(p => p.filter(i => i.cartKey !== cartKey))
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

  const selectCustomer = async (c) => {
    setCustomer(c)
    setCustomerSearch('')
    setCustomerResults([])
    playSound('success')
    // Store as recent customer
    const stored = JSON.parse(localStorage.getItem(`recent_customers_${shop.id}`) || '[]')
    const filtered = stored.filter(id => id !== c.id)
    localStorage.setItem(`recent_customers_${shop.id}`, JSON.stringify([c.id, ...filtered].slice(0, 5)))
    // Fetch customer history
    try {
      const history = await pb.collection(C.SALES).getList(1, 5, {
        filter: `shop_id="${shop.id}" && customer_id="${c.id}" && status="completed"`,
        sort: '-created',
        '$autoCancel': false,
        '$cancelKey': 'customer-history'
      })
      if (history.items.length > 0) {
        setCustomerHistory({
          totalSpent: c.total_spent_kes || 0,
          visitCount: c.visit_count || 0,
          lastVisit: history.items[0]?.created || null,
          lastAmount: history.items[0]?.total_kes || 0,
          avgSpend: c.total_spent_kes && c.visit_count ? c.total_spent_kes / c.visit_count : 0
        })
      }
    } catch (e) { console.error('Customer history error:', e.message) }
  }

  const loadRecentCustomers = async () => {
    const stored = JSON.parse(localStorage.getItem(`recent_customers_${shop.id}`) || '[]')
    if (stored.length === 0) return
    try {
      const recents = await Promise.all(stored.map(id => pb.collection(C.CUSTOMERS).getOne(id).catch(() => null)))
      setRecentCustomers(recents.filter(c => c !== null))
    } catch (e) { console.error('Recent customers error:', e.message) }
  }

  const quickAddCustomer = async (e) => {
    e.preventDefault(); setSavingCust(true)
    try {
      const c = await pb.collection(C.CUSTOMERS).create({ shop_id: shop.id, name: newCust.name, phone: newCust.phone, loyalty_points: 0, total_spent_kes: 0, visit_count: 0 })
      selectCustomer(c)
      setShowQuickCust(false); setNewCust({ name: '', phone: '' })
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
    if (isLocked) return toast.error('🔒 Account locked — renew your subscription to record sales', { duration: 6000 })
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
        if (item.variant_id) {
          await pb.collection(C.PRODUCT_VARIANTS).update(item.variant_id, { stock_qty: nq }, { '$autoCancel': false, '$cancelKey': `pay-later-variant-stock-${idx}` })
          try {
            const siblings = await pb.collection(C.PRODUCT_VARIANTS).getFullList({ filter: `product_id="${item.id}"`, '$autoCancel': false, '$cancelKey': `pay-later-siblings-${idx}` })
            const total = siblings.reduce((s, v) => s + (v.id === item.variant_id ? nq : (v.stock_qty || 0)), 0)
            await pb.collection(C.PRODUCTS).update(item.id, { stock_qty: total }, { '$autoCancel': false, '$cancelKey': `pay-later-parent-stock-${idx}` })
          } catch {}
        } else {
          await pb.collection(C.PRODUCTS).update(item.id, { stock_qty: nq }, { '$autoCancel': false, '$cancelKey': `pay-later-stock-${idx}` })
        }
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
    if (isLocked) return toast.error('🔒 Account locked — renew your subscription to make sales', { duration: 6000 })
    if (!cart.length) return toast.error('Cart is empty')
    if (paymentMethod === 'cash' && cashTendered && Number(cashTendered) < total) return toast.error('Insufficient cash')

    const invalidQtyItem = cart.find(item =>
      item.qty === '' ||
      !Number.isFinite(Number(item.qty)) ||
      Number(item.qty) <= 0
    )
    if (invalidQtyItem) {
      return toast.error(`Enter a valid quantity for ${invalidQtyItem.name}`)
    }

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
        sale_id: sale.id, product_id: item.id,
        product_name: item.variant_name ? `${item.name}` : item.name,
        qty: item.qty, unit_price_kes: item.unit_price, unit_cost_kes: item.cost_price_kes || 0,
        total_kes: item.unit_price * item.qty,
      }, { '$autoCancel': false, '$cancelKey': `sale-item-${idx}` })))
      await Promise.all(cart.filter(i => i.track_inventory).map(async (item, idx) => {
        const nq = Math.max(0, (item.stock_qty || 0) - item.qty)
        if (item.variant_id) {
          await pb.collection(C.PRODUCT_VARIANTS).update(item.variant_id, { stock_qty: nq }, { '$autoCancel': false, '$cancelKey': `variant-stock-${idx}` })
          try {
            const siblings = await pb.collection(C.PRODUCT_VARIANTS).getFullList({ filter: `product_id="${item.id}"`, '$autoCancel': false, '$cancelKey': `siblings-${idx}` })
            const total = siblings.reduce((s, v) => s + (v.id === item.variant_id ? nq : (v.stock_qty || 0)), 0)
            await pb.collection(C.PRODUCTS).update(item.id, { stock_qty: total }, { '$autoCancel': false, '$cancelKey': `parent-stock-${idx}` })
          } catch {}
        } else {
          await pb.collection(C.PRODUCTS).update(item.id, { stock_qty: nq }, { '$autoCancel': false, '$cancelKey': `stock-update-${idx}` })
        }
        await pb.collection(C.INV_MOVEMENTS).create({ shop_id: shop.id, product_id: item.id, type: 'sale', qty: -item.qty, before_qty: item.stock_qty, after_qty: nq, reference: receiptNo, created_by: admin?.id }, { '$autoCancel': false, '$cancelKey': `inv-move-${idx}` })
      }))
      if (customer) {
        const newPts = Math.max(0, (customer.loyalty_points || 0) - (redeemPoints ? customer.loyalty_points : 0)) + pointsEarned
        await pb.collection(C.CUSTOMERS).update(customer.id, { total_spent_kes: (customer.total_spent_kes || 0) + total, visit_count: (customer.visit_count || 0) + 1, loyalty_points: newPts })
      }

      setCompletedSale({ ...sale, items: cart, customer, change, pointsEarned })
      setShowReceipt(true); clearCart(); loadData()
      toast.success(`Sale done! ${receiptNo}`, { icon: '🎉', duration: 4000 })

      // #3 First Sale of the Day — celebrate the first completed sale each calendar day
      try {
        const todayKey = `st_first_sale_${shop.id}_${new Date().toDateString()}`
        if (!sessionStorage.getItem(todayKey)) {
          const dayStart = new Date(); dayStart.setHours(0,0,0,0)
          const dayStartStr = dayStart.toISOString().replace('T',' ').replace('Z','.000Z')
          const todaySales = await pb.collection(C.SALES).getList(1, 2, {
            filter: `shop_id="${shop.id}" && status="completed" && created>="${dayStartStr}"`,
            '$autoCancel': false,
            '$cancelKey': 'pos-first-sale-check'
          })
          if (todaySales.totalItems === 1) {
            sessionStorage.setItem(todayKey, '1')
            setTimeout(() => {
              toast.success(
                `🎉 First sale of the day — ${fmtKES(total)}! Great start.`,
                { duration: 6000, icon: '☀️' }
              )
            }, 1200)
          }
        }
      } catch {}

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

  const activeCategoryName = categories.find(c => c.id === activeCategory)?.name?.toLowerCase() || null

  const filtered = products.filter(p => {
    const pCatName = categories.find(c => c.id === p.category_id)?.name?.toLowerCase() || null
    const mc = activeCategory === 'all'
      || (activeCategory === '__services__' && p.is_service)
      || (activeCategory !== '__services__' && activeCategory !== 'all' && pCatName !== null && pCatName === activeCategoryName)
    const ms = !search || (p.name || '').toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search) || p.sku?.includes(search)
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
        <div className="pos-panel-products" data-mobile-hidden={mobileTab === 'cart'} style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden', minHeight: 0 }}>
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
            {[{ id: 'all', name: 'All', icon: '🛍️' }, { id: '__services__', name: 'Services', icon: '✂️' }, ...categories].map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${activeCategory === cat.id ? '#c8456a' : '#f0e4e8'}`, background: activeCategory === cat.id ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fff', color: activeCategory === cat.id ? '#fff' : '#6b1e38', fontWeight: 600, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Nunito,sans-serif' }}>
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, alignContent: 'start', minHeight: 0 }}>
            {filtered.map(p => {
              const variants = variantsByProduct[p.id] || []
              const out = p.has_variants
                ? variants.every(v => v.stock_qty <= 0) && variants.length > 0
                : p.track_inventory && p.stock_qty <= 0
              const inCartQty = cart.filter(i => i.id === p.id).reduce((s, i) => s + i.qty, 0)
              const inCart = inCartQty > 0 ? { qty: inCartQty } : null
              const handleTileClick = () => {
                if (out) return
                if (p.has_variants) { setVariantPopupProduct(p); return }
                addToCart(p)
              }
              return (
                <div key={p.id} className={`product-tile ${out ? 'out-of-stock' : ''}`} onClick={handleTileClick} style={{ outline: inCart ? '2px solid #c8456a' : 'none' }}>
                  {inCart && <div style={{ position: 'absolute', top: 6, right: 6, background: '#c8456a', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</div>}
                  {bestSellerId === p.id && !inCart && (
                    <div style={{ position: 'absolute', top: 6, left: 6, background: 'linear-gradient(135deg,#e6b800,#f59e0b)', color: '#fff', borderRadius: 6, fontSize: 9, fontWeight: 800, padding: '2px 5px', letterSpacing: '0.04em', lineHeight: 1.3 }}>🔥 TOP</div>
                  )}
                  {p.images && p.images.length > 0
  ? <img src={`${PB_URL}/api/files/${C.PRODUCTS}/${p.id}/${p.images[0]}?thumb=80x80`} alt={p.name} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, display: 'block', margin: '0 auto' }} onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='block' }} />
  : null
}
<div style={{ fontSize: 26, textAlign: 'center', display: p.images && p.images.length > 0 ? 'none' : 'block' }}>
  {p.is_service ? '✂️' : categories.find(c => c.id === p.category_id)?.icon || '📦'}
</div>
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{p.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#c8456a' }}>{p.has_variants ? `from ${fmtKES(p.price_kes)}` : `${fmtKES(p.price_kes)} / ${p.unit || 'piece'}`}</div>
                  {p.has_variants
                    ? <div style={{ fontSize: 10, color: '#9b6070' }}>{out ? '❌ Out' : `${variants.length} option${variants.length !== 1 ? 's' : ''}`}</div>
                    : (p.track_inventory && <div style={{ fontSize: 10, color: p.stock_qty <= 5 ? '#dc2626' : '#9b6070' }}>{out ? '❌ Out' : `${p.stock_qty} ${p.unit || 'pcs'} available`}</div>)
                  }
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
                  <div key={c.id} onClick={() => selectCustomer(c)} style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}
                    onMouseOver={e => e.currentTarget.style.background = '#fce8ed'} onMouseOut={e => e.currentTarget.style.background = ''}>
                    <span><strong>{c.name}</strong> · {c.phone}</span>
                    <span style={{ color: '#d97706', fontWeight: 700 }}>⭐ {c.loyalty_points || 0}</span>
                  </div>
                ))}
              </div>
            )}
            {!customerSearch && !customer && recentCustomers.length > 0 && (
              <div style={{ marginTop: 5 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9b6070', textTransform: 'uppercase', marginBottom: 3 }}>⏱️ Recent</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {recentCustomers.map(c => (
                    <button key={c.id} onClick={() => selectCustomer(c)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '1px solid #f0e4e8', background: '#fff', cursor: 'pointer', color: '#6b1e38', fontWeight: 600, fontFamily: 'Nunito,sans-serif' }}>
                      {c.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {customer && (
              <div style={{ marginTop: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#059669' }}>✅ {customer.name} · ⭐ {customer.loyalty_points || 0} pts</span>
                  <button className="btn-ghost" onClick={() => { setCustomer(null); setCustomerSearch(''); setCustomerHistory(null) }} style={{ color: '#9b6070', fontSize: 9, padding: '2px 5px' }}>✕</button>
                </div>
                {customerHistory && (
                  <div style={{ fontSize: 10, color: '#6b4050', marginTop: 3, paddingTop: 3, borderTop: '1px solid #f0e4e8', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                    <div>💰 Spent: {fmtKES(customerHistory.totalSpent)}</div>
                    <div>📊 Visits: {customerHistory.visitCount}</div>
                    <div>📈 Avg: {fmtKES(customerHistory.avgSpend)}</div>
                    <div>⏱️ Last: {customerHistory.lastAmount ? fmtKES(customerHistory.lastAmount) : 'N/A'}</div>
                  </div>
                )}
                {(customer.loyalty_points || 0) >= 50 && (
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#d97706', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
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
              <div key={item.cartKey} className="cart-item">
                <div style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: 10, color: '#9b6070', marginTop: 2 }}>
                    {item.track_inventory ? `${item.stock_qty || 0} ${item.unit || 'pcs'} available` : (item.unit || 'service')}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '52px 62px 22px', alignItems: 'end', gap: 5 }}>
                  <label style={{ fontSize: 9, color: '#9b6070', fontWeight: 700 }}>
                    QTY ({item.unit || 'pcs'})
                    <input
                      className="input"
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      placeholder="Qty"
                      value={item.qty}
                      onChange={e => updateCartQuantity(item.cartKey, e.target.value)}
                      onFocus={e => e.target.select()}
                      style={{ marginTop: 2, width: '100%', height: 28, padding: '3px 5px', fontSize: 12, fontWeight: 700, minWidth: 0 }}
                    />
                  </label>
                  <label style={{ fontSize: 9, color: '#9b6070', fontWeight: 700 }}>
                    PRICE / {item.unit || 'unit'}
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={item.unit_price}
                      onChange={e => updateCartUnitPrice(item.cartKey, e.target.value)}
                      onFocus={e => e.target.select()}
                      style={{ marginTop: 2, width: '100%', height: 28, padding: '3px 5px', fontSize: 11, fontWeight: 700, minWidth: 0 }}
                    />
                  </label>
                  <button onClick={() => removeItem(item.cartKey)} title="Remove" style={{ width: 22, height: 28, borderRadius: 6, border: 'none', background: '#fee2e2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={11} color="#dc2626" /></button>
                </div>
                <div style={{ width: 72, minWidth: 72, flexShrink: 0, textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#c8456a', whiteSpace: 'nowrap' }}>{fmtKES(item.unit_price * item.qty)}</div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div style={{ padding: '9px 13px', borderTop: '1px solid #f5edf0' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
              <Tag size={12} style={{ color: '#9b6070', marginTop: 12, flexShrink: 0 }} />
              <input className="input" type="number" placeholder="Discount (KES)" value={discount || ''} onChange={e => setDiscount(e.target.value)} style={{ fontSize: 12 }} />
            </div>
            {/* Quick discount buttons */}
            {cart.length > 0 && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 7, flexWrap: 'wrap' }}>
                {[10, 15, 20].map(pct => (
                  <button key={pct} onClick={() => setDiscount(Math.round(subtotal * pct / 100))} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, border: '1px solid #e8d0d6', background: '#fce8ed', color: '#9b6070', fontWeight: 600, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                    {pct}%
                  </button>
                ))}
                <button onClick={() => setDiscount(0)} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, border: '1px solid #e8d0d6', background: '#fff', color: '#9b6070', fontWeight: 600, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
                  Clear
                </button>
              </div>
            )}
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
            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: 14, borderRadius: 12 }} onClick={() => setShowPaymentConfirm(true)} disabled={processing || !cart.length || isLocked}>
              {processing ? <><div style={{ width: 15, height: 15, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Processing…</> : isLocked ? '🔒 Account Locked' : `✅ Complete · ${fmtKES(total)}`}
            </button>
            <button onClick={payLater} disabled={processing || !cart.length || !customer || isLocked}
              style={{ width: '100%', marginTop: 6, padding: '9px', borderRadius: 12, border: '2px solid #f59e0b', background: !cart.length || !customer || isLocked ? '#f5edf0' : '#fffbeb', color: !cart.length || !customer || isLocked ? '#9b6070' : '#b45309', fontWeight: 700, fontSize: 13, cursor: !cart.length || !customer || isLocked ? 'not-allowed' : 'pointer', fontFamily: 'Nunito,sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              💳 Pay Later {!customer && cart.length > 0 && !isLocked ? '(select customer first)' : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Variant Picker Popup */}
      {variantPopupProduct && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setVariantPopupProduct(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <span className="modal-title">{variantPopupProduct.name}</span>
              <button onClick={() => setVariantPopupProduct(null)} className="btn-ghost" style={{ padding: 8 }}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 10 }}>Choose an option</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(variantsByProduct[variantPopupProduct.id] || []).map(v => {
                  const vOut = variantPopupProduct.track_inventory && v.stock_qty <= 0
                  const low = variantPopupProduct.track_inventory && v.stock_qty > 0 && v.stock_qty <= (v.reorder_point || 5)
                  return (
                    <button
                      key={v.id}
                      disabled={vOut}
                      onClick={() => addToCart(variantPopupProduct, v)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px 14px', borderRadius: 10,
                        border: `1.5px solid ${vOut ? '#f0e4e8' : '#e8c0cc'}`,
                        background: vOut ? '#f9f3f5' : '#fff5f7',
                        cursor: vOut ? 'not-allowed' : 'pointer', textAlign: 'left',
                        opacity: vOut ? 0.55 : 1,
                      }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: '#3d1020' }}>{v.name}</span>
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#c8456a' }}>{fmtKES(v.price_kes)}</span>
                        {variantPopupProduct.track_inventory && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: vOut ? '#dc2626' : low ? '#d97706' : '#059669' }}>
                            {vOut ? 'Out of stock' : `${v.stock_qty} left`}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
                {(variantsByProduct[variantPopupProduct.id] || []).length === 0 && (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9b6070', fontSize: 13 }}>No variants set up for this product yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* Payment Confirmation Modal */}
      {showPaymentConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPaymentConfirm(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header"><span className="modal-title">💳 Confirm Payment</span><button onClick={() => setShowPaymentConfirm(false)} className="btn-ghost" style={{ padding: 8 }}><X size={16} /></button></div>
            <div className="modal-body">
              <div style={{ background: '#f9f3f5', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13, marginBottom: 10 }}>
                  <div>
                    <div style={{ color: '#9b6070', fontSize: 11 }}>Items</div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#3d1020' }}>{cart.length}</div>
                  </div>
                  <div>
                    <div style={{ color: '#9b6070', fontSize: 11 }}>Subtotal</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#3d1020' }}>{fmtKES(subtotal)}</div>
                  </div>
                  {discountAmt > 0 && (
                    <div>
                      <div style={{ color: '#9b6070', fontSize: 11 }}>Discount</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#dc2626' }}>-{fmtKES(discountAmt)}</div>
                    </div>
                  )}
                  {loyaltyDiscount > 0 && (
                    <div>
                      <div style={{ color: '#9b6070', fontSize: 11 }}>Loyalty</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#d97706' }}>-{fmtKES(loyaltyDiscount)}</div>
                    </div>
                  )}
                  {tax > 0 && (
                    <div>
                      <div style={{ color: '#9b6070', fontSize: 11 }}>Tax</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#3d1020' }}>{fmtKES(tax)}</div>
                    </div>
                  )}
                </div>
                <div style={{ borderTop: '2px solid #f0e4e8', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#6b4050' }}>Total Amount</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#c8456a' }}>{fmtKES(total)}</span>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b4050', marginBottom: 4 }}>Payment Method: <span style={{ color: '#c8456a' }}>{paymentMethod === 'visa_mc' ? 'Card' : paymentMethod === 'mpesa' ? 'M-Pesa' : paymentMethod === 'mixed' ? 'Cash + M-Pesa' : 'Cash'}</span></div>
                {customer && <div style={{ fontSize: 12, fontWeight: 600, color: '#6b4050' }}>Customer: <span style={{ color: '#059669' }}>{customer.name}</span></div>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-secondary" onClick={() => setShowPaymentConfirm(false)} style={{ flex: 1 }}>Cancel</button>
                <button className="btn-primary" onClick={() => { processSale(); setShowPaymentConfirm(false) }} style={{ flex: 1 }}>
                  ✅ Confirm Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
