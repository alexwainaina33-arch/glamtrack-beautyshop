import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDateTime, r2 } from '../lib/utils'
import { Plus, AlertTriangle, ArrowUp, ArrowDown, RefreshCw, X, Filter, Upload, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

// Search-as-you-type picker used for the product and supplier boxes (list stays in the page flow).
function SearchPick({ items, value, onText, onPick, placeholder, required, emptyText, autoFocus }) {
  const [open, setOpen] = useState(false)
  const q = String(value || '').trim().toLowerCase()
  const shown = items.filter(it => !q || it.search.indexOf(q) !== -1).slice(0, 40)
  const exact = q ? items.find(it => it.exact && it.exact.indexOf(q) !== -1) : null
  const choose = it => { onPick(it); setOpen(false) }
  return (
    <div>
      <input className="input" value={value} placeholder={placeholder} required={required} autoFocus={autoFocus} autoComplete="off"
        onChange={e => { onText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => {
          if (e.key !== 'Enter' || !open || !q) return
          const hit = exact || (shown.length === 1 ? shown[0] : null)
          if (hit) { e.preventDefault(); choose(hit) }
        }} />
      {open && shown.length > 0 && (
        <div style={{ marginTop: 4, maxHeight: 200, overflowY: 'auto', border: '1px solid #f0e4e8', borderRadius: 10, background: '#fff' }}>
          {shown.map(it => (
            <div key={it.key} onMouseDown={e => { e.preventDefault(); choose(it) }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5edf0', fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{it.label}</div>
              {it.sub && <div style={{ fontSize: 11, color: '#9b6070' }}>{it.sub}</div>}
            </div>
          ))}
        </div>
      )}
      {open && shown.length === 0 && q && emptyText && <div style={{ marginTop: 4, fontSize: 12, color: '#9b6070' }}>{emptyText}</div>}
    </div>
  )
}

export default function InventoryPage() {
  const { shop, loading: authLoading, isLocked, role } = useAuth()
  const canWriteOff = role === 'owner' || role === 'manager'
  const canReceive = role !== 'viewer'
  const [products, setProducts] = useState([])
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('stock') // stock | movements
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState(null)
  const [adjustType, setAdjustType] = useState('stock_in')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustCost, setAdjustCost] = useState('')
  const [adjustExtraCost, setAdjustExtraCost] = useState('')
  const [adjustSupplier, setAdjustSupplier] = useState('')
  const [adjustFunding, setAdjustFunding] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [filterAlert, setFilterAlert] = useState(false)
  const [valFrom, setValFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10)
  })
  const [valTo, setValTo] = useState(() => new Date().toISOString().slice(0,10))
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [importData, setImportData] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()
  const [selectedProducts, setSelectedProducts] = useState(new Set())
  const [countVals, setCountVals] = useState({})
  const [countNote, setCountNote] = useState('')
  const [countSaving, setCountSaving] = useState(false)
  const [lossFrom, setLossFrom] = useState(() => new Date(Date.now() + 10800000).toISOString().slice(0, 8) + '01')
  const [lossTo, setLossTo] = useState(() => new Date(Date.now() + 10800000).toISOString().slice(0, 10))
  const [lossRows, setLossRows] = useState([])
  const [lossLoading, setLossLoading] = useState(false)
  const [lossTick, setLossTick] = useState(0)
  const [repMovs, setRepMovs] = useState(null)
  const [repFor, setRepFor] = useState('')
  const [repLoading, setRepLoading] = useState(false)
  const [repError, setRepError] = useState(false)
  const [repTick, setRepTick] = useState(0)
  const [importFunding, setImportFunding] = useState('owner_capital')
  const [importSupplier, setImportSupplier] = useState('')
  const [importErrors, setImportErrors] = useState([])
  const [supplierNames, setSupplierNames] = useState(null)
  const [prodQuery, setProdQuery] = useState('')
  const [adjustPicked, setAdjustPicked] = useState(false)

  useEffect(() => {
    if (tab !== 'valuation' || !shop || !valFrom) return
    const x = new Date(valFrom + 'T00:00:00+03:00')
    if (isNaN(x.getTime())) return
    const start = x.toISOString().replace('T', ' ')
    let cancelled = false
    setRepLoading(true)
    setRepError(false)
    pb.collection(C.INV_MOVEMENTS).getFullList({
      filter: 'shop_id="' + shop.id + '" && created>="' + start + '"',
      fields: 'id,product_id,type,qty,created',
      sort: 'created'
    })
      .then(rows => { if (!cancelled) { setRepMovs(rows); setRepFor(start) } })
      .catch(() => { if (!cancelled) { setRepError(true); toast.error('Could not load the stock report') } })
      .finally(() => { if (!cancelled) setRepLoading(false) })
    return () => { cancelled = true }
  }, [tab, valFrom, shop, repTick])

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, authLoading])

  useEffect(() => {
    if (!shop || authLoading) return
    let cancelled = false
    pb.collection(C.CUSTOMERS).getList(1, 500, { filter: 'shop_id="' + shop.id + '" && notes~"__SUPPLIER__"', sort: 'name', fields: 'id,name', requestKey: null })
      .then(r => { if (!cancelled) setSupplierNames(r.items.map(x => x.name).filter(Boolean)) })
      .catch(() => { if (!cancelled) setSupplierNames(null) })
    return () => { cancelled = true }
  }, [shop, authLoading])

  useEffect(() => {
    if (tab !== 'loss' || !shop || !canWriteOff || !lossFrom || !lossTo) return
    let cancelled = false
    setLossLoading(true)
    const start = new Date(lossFrom + 'T00:00:00+03:00').toISOString().replace('T', ' ')
    const end = new Date(lossTo + 'T23:59:59.999+03:00').toISOString().replace('T', ' ')
    pb.collection(C.INV_MOVEMENTS).getFullList({
      filter: 'shop_id="' + shop.id + '" && (type="adjustment" || type="damage" || type="stock_out") && created>="' + start + '" && created<="' + end + '"',
      sort: '-created',
      expand: 'product_id,created_by'
    })
      .then(rows => { if (!cancelled) setLossRows(rows) })
      .catch(() => { if (!cancelled) { setLossRows([]); toast.error('Could not load the loss report') } })
      .finally(() => { if (!cancelled) setLossLoading(false) })
    return () => { cancelled = true }
  }, [tab, lossFrom, lossTo, shop, canWriteOff, lossTick])

  useEffect(() => {
    // Auto-alert on low stock items
    if (products.length > 0) {
      const lowItems = products.filter(p => p.stock_qty <= (p.reorder_point || 5))
      const outItems = lowItems.filter(p => p.stock_qty <= 0)
      if (outItems.length > 0) {
        setTimeout(() => {
          toast.error(`❌ ${outItems.length} item(s) out of stock!`, { icon: '🚨', duration: 6000 })
        }, 1500)
      }
    }
  }, [products])

  const loadData = async () => {
    setLoading(true)
    try {
      const [prods, movs] = await Promise.all([
        pb.collection(C.PRODUCTS).getList(1, 500, { filter: `shop_id="${shop.id}" && track_inventory=true && status="active"`, sort: 'name' }).then(r => r.items),
        pb.collection(C.INV_MOVEMENTS).getList(1, 100, { filter: `shop_id="${shop.id}"`, sort: '-created', expand: 'product_id,created_by' })
      ])
      setProducts(prods)
      setMovements(movs.items)
      setRepTick(t => t + 1)
    } finally { setLoading(false) }
  }

  const normName = t => String(t || '').trim().toLowerCase()
  // Stock bought on credit must name the supplier, so the debt can be paid from a supplier card.
  const checkSupplier = (raw) => {
    const name = String(raw || '').trim()
    if (!name) { toast.error('Enter the supplier name. Stock bought on credit must say who you owe.'); return null }
    if (supplierNames) {
      const hit = supplierNames.find(x => normName(x) === normName(name))
      if (hit) return hit
      if (!window.confirm('There is no supplier card named "' + name + '". This debt will show as unassigned in Suppliers until a card with exactly this name is added. Save anyway?')) return null
    }
    return name
  }

  const openAdjust = (product, type = 'stock_in') => {
    setAdjustProduct(product)
    setAdjustType(type)
    setAdjustQty('')
    setAdjustNote('')
    setAdjustCost(product?.cost_price_kes || '')
    setAdjustExtraCost('')
    setAdjustSupplier('')
    setAdjustFunding('cash')
    setProdQuery('')
    setAdjustPicked(false)
    setShowAdjust(true)
  }

  const handleAdjust = async (e) => {
    e.preventDefault()
    if (isLocked) return toast.error('🔒 Account locked — renew your subscription to adjust stock', { duration: 6000 })
    if (!canReceive) return toast.error('Viewers cannot change stock')
    if (['stock_out', 'damage', 'adjustment'].includes(adjustType) && !canWriteOff) return toast.error('Only the owner or a manager can record stock out, damage or adjustments')
    if (['stock_out', 'damage', 'adjustment'].includes(adjustType) && !adjustNote.trim()) return toast.error('Add a reason in Notes / Reference')
    if (!adjustQty || isNaN(adjustQty) || Number(adjustQty) <= 0) return toast.error('Enter valid quantity')
    let supplierToSave = adjustSupplier.trim()
    if (['stock_in', 'opening_stock'].includes(adjustType) && adjustFunding === 'payable') {
      const chosen = checkSupplier(adjustSupplier)
      if (!chosen) return
      supplierToSave = chosen
    }
    setSaving(true)
    try {
      if (!adjustProduct) return toast.error('Select a product')

      const qty = Number(adjustQty)
      const currentQty = Number(adjustProduct.stock_qty || 0)
      const currentCost = Number(adjustProduct.cost_price_kes || 0)
      const isInbound = ['stock_in', 'return', 'opening_stock'].includes(adjustType)
      const isPurchase = ['stock_in', 'opening_stock'].includes(adjustType)
      const deltaQty = isInbound ? qty : -qty
      if (!isInbound && qty > currentQty) return toast.error('Only ' + r2(currentQty) + ' on hand. Use Stock Count if the shelf has less.')
      const newQty = r2(Math.max(0, currentQty + deltaQty))

      const supplierUnitCost = Number(adjustCost) || 0
      const extraProcurementCost = isPurchase ? Number(adjustExtraCost) || 0 : 0
      const landedUnitCost = isPurchase && qty > 0
        ? ((supplierUnitCost * qty) + extraProcurementCost) / qty
        : supplierUnitCost

      // Moving weighted average keeps Martin's existing stock and new stock
      // economically correct when purchase costs change between batches.
      const weightedAverageCost = isPurchase && newQty > 0
        ? (adjustType === 'opening_stock' || currentQty <= 0
          ? landedUnitCost
          : ((currentQty * currentCost) + (qty * landedUnitCost)) / newQty)
        : currentCost

      const productUpdate = { stock_qty: newQty }
      if (isPurchase) productUpdate.cost_price_kes = Number(weightedAverageCost.toFixed(4))
      await pb.collection(C.PRODUCTS).update(adjustProduct.id, productUpdate)

      const procurementNote = isPurchase && extraProcurementCost > 0
        ? `Additional procurement cost KES ${extraProcurementCost.toFixed(2)}; landed cost KES ${landedUnitCost.toFixed(2)}/${adjustProduct.unit || 'unit'}`
        : ''
      const movementNote = [adjustNote, procurementNote].filter(Boolean).join(' | ')

      await pb.collection(C.INV_MOVEMENTS).create({
        shop_id: shop.id,
        product_id: adjustProduct.id,
        type: adjustType,
        qty: isInbound ? qty : -qty,
        before_qty: currentQty,
        after_qty: newQty,
        cost_per_unit: isInbound ? landedUnitCost : null,
        funding_source: isPurchase ? adjustFunding : null,
        supplier_name: isPurchase ? (supplierToSave || null) : null,
        notes: movementNote,
        reference: adjustNote,
        created_by: pb.authStore.model?.id
      })

      toast.success(
        adjustType === 'opening_stock' ? '✅ Opening stock recorded!' :
        adjustType === 'damage' ? '📋 Damage recorded' :
        adjustType === 'stock_in' ? '📦 Stock received!' : '✅ Adjustment saved'
      )
      setShowAdjust(false)
      loadData()
    } catch (err) { toast.error(err?.message || 'Failed') }
    finally { setSaving(false) }
  }

  const signedKES = v => (v < 0 ? '-' : v > 0 ? '+' : '') + fmtKES(Math.abs(v))

  const saveCount = async () => {
    if (isLocked) return toast.error('Account locked. Renew your subscription to record a count.')
    if (!canWriteOff) return toast.error('Only the owner or a manager can record a stock count')
    const entries = products.filter(p => !p.has_variants && countVals[p.id] !== undefined && countVals[p.id] !== '')
    if (entries.length === 0) return toast.error('Type at least one counted quantity')
    for (const p of entries) {
      const c = Number(countVals[p.id])
      if (isNaN(c) || c < 0) return toast.error('Check the count for ' + p.name + ': it must be 0 or more')
    }
    if (!window.confirm('Save this stock count? Stock levels will be set to the quantities you counted.')) return
    setCountSaving(true)
    let saved = 0
    let same = 0
    const failed = []
    for (const p of entries) {
      try {
        const counted = r2(Number(countVals[p.id]))
        const fresh = await pb.collection(C.PRODUCTS).getOne(p.id)
        const before = Number(fresh.stock_qty || 0)
        const delta = r2(counted - before)
        if (delta === 0) { same++; continue }
        await pb.collection(C.PRODUCTS).update(p.id, { stock_qty: counted })
        await pb.collection(C.INV_MOVEMENTS).create({
          shop_id: shop.id,
          product_id: p.id,
          type: 'adjustment',
          qty: delta,
          before_qty: before,
          after_qty: counted,
          reference: 'Stock count',
          notes: countNote ? 'Stock count: ' + countNote : 'Stock count',
          created_by: pb.authStore.model?.id
        })
        saved++
      } catch (err) { failed.push(p.name) }
    }
    setCountSaving(false)
    if (failed.length > 0) {
      toast.error('Not finished: ' + failed.join(', ') + ' not saved. Check Movements, then save again.', { duration: 8000 })
    } else {
      toast.success('Stock count saved: ' + saved + ' changed, ' + same + ' matched')
      setCountVals({})
      setCountNote('')
    }
    await loadData()
    setLossTick(t => t + 1)
  }

  const filteredProducts = filterAlert
    ? products.filter(p => p.stock_qty <= (p.reorder_point || 5))
    : products

  const handleBulkImportCSV = async () => {
    if (isLocked) return toast.error('Account locked. Renew your subscription to import stock.')
    if (!canWriteOff) return toast.error('Only the owner or a manager can import stock')
    if (!importData.trim()) return toast.error('Paste CSV data first')
    let importSupplierName = importSupplier.trim()
    if (importFunding === 'payable') {
      const chosen = checkSupplier(importSupplier)
      if (!chosen) return
      importSupplierName = chosen
    }
    setImporting(true)
    setImportErrors([])
    try {
      const lines = importData.trim().split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) return toast.error('Add a header row and at least one stock row')
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      if (!headers.some(h => h === 'name' || h === 'product_name')) return toast.error('The first row must have a name column')

      let success = 0
      const errors = []
      const failedLines = []
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim())
        const row = {}
        headers.forEach((h, j) => { row[h] = vals[j] || '' })
        const productName = row.name || row.product_name
        const label = 'Row ' + (i + 1) + (productName ? ' (' + productName + ')' : '')
        const fail = msg => { errors.push(label + ': ' + msg); failedLines.push(lines[i]) }
        if (!productName) { fail('name is empty'); continue }
        const qty = Number(row.qty || row.quantity)
        const costText = row.cost !== undefined && row.cost !== '' ? row.cost : (row.cost_price || '')
        const cost = Number(costText)
        const notes = row.notes || row.reference || ''
        if (!qty || isNaN(qty) || qty <= 0) { fail('quantity must be more than 0'); continue }
        if (costText === '' || isNaN(cost) || cost < 0) { fail('cost is missing or not a number'); continue }
        const matches = products.filter(p => p.name.toLowerCase().trim() === productName.toLowerCase().trim())
        if (matches.length === 0) { fail('no tracked product with this name'); continue }
        if (matches.length > 1) { fail('more than one product has this name'); continue }
        const prod = matches[0]
        if (prod.has_variants) { fail('products with variants are not imported here'); continue }
        try {
          const fresh = await pb.collection(C.PRODUCTS).getOne(prod.id)
          const curQty = Number(fresh.stock_qty || 0)
          const curCost = Number(fresh.cost_price_kes || 0)
          const newQty = r2(curQty + qty)
          const newCost = curQty <= 0 ? cost : ((curQty * curCost) + (qty * cost)) / newQty
          await pb.collection(C.PRODUCTS).update(prod.id, { stock_qty: newQty, cost_price_kes: Number(newCost.toFixed(4)) })
          try {
            await pb.collection(C.INV_MOVEMENTS).create({
              shop_id: shop.id,
              product_id: prod.id,
              type: 'stock_in',
              qty: qty,
              before_qty: curQty,
              after_qty: newQty,
              cost_per_unit: cost,
              funding_source: importFunding,
              supplier_name: importSupplierName || null,
              reference: 'Bulk import',
              notes: notes ? 'Bulk import: ' + notes : 'Bulk import',
              created_by: pb.authStore.model?.id
            })
          } catch (e2) {
            await pb.collection(C.PRODUCTS).update(prod.id, { stock_qty: curQty, cost_price_kes: curCost }).catch(() => {})
            throw e2
          }
          success++
        } catch (e) { fail('not saved (' + (e && e.message ? e.message : 'error') + ')') }
      }
      setImportErrors(errors)
      if (errors.length === 0) {
        setShowBulkImport(false)
        setImportData('')
      } else {
        setImportData([lines[0]].concat(failedLines).join('\n'))
      }
      if (success > 0) toast.success('Imported ' + success + ' row(s)' + (errors.length > 0 ? ', ' + errors.length + ' not saved. See the list.' : ''), { duration: 6000 })
      else toast.error('Nothing was imported. See the list.')
      if (success > 0) await loadData()
    } finally { setImporting(false) }
  }

  const toggleProductSelection = (prodId) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(prodId)) {
      newSelected.delete(prodId)
    } else {
      newSelected.add(prodId)
    }
    setSelectedProducts(newSelected)
  }

  const calcStockForecast = (product) => {
    // Estimate days of stock remaining based on recent sales
    const recentSales = movements.filter(m => m.product_id === product.id && m.type === 'sale').slice(0, 7)
    if (recentSales.length === 0) return null
    const avgDaily = recentSales.reduce((s, m) => s + Math.abs(m.qty || 0), 0) / 7
    if (avgDaily === 0) return null
    return Math.ceil((product.stock_qty || 0) / avgDaily)
  }

  const productItems = products.map(p => ({
    key: p.id,
    label: p.name,
    sub: r2(p.stock_qty || 0) + ' ' + (p.unit || 'pcs') + ' in stock' + ((p.barcode || p.sku) ? ' - ' + (p.barcode || p.sku) : ''),
    search: [p.name, p.sku, p.barcode, p.brand].filter(Boolean).join(' ').toLowerCase(),
    exact: [p.barcode, p.sku].filter(Boolean).map(x => String(x).toLowerCase())
  }))
  const supplierItems = (supplierNames || []).map(nm => ({ key: nm, label: nm, sub: '', search: nm.toLowerCase() }))
  const totalStockValue = products.reduce((s, p) => s + ((p.stock_qty || 0) * (p.cost_price_kes || 0)), 0)
  const totalRetailValue = products.reduce((s, p) => s + ((p.stock_qty || 0) * (p.price_kes || 0)), 0)
  const lowCount = products.filter(p => p.stock_qty <= (p.reorder_point || 5)).length
  const outCount = products.filter(p => p.stock_qty <= 0).length

  // Stock Valuation Report — computed from movements in date range
  const toUtc = (d, t) => { const x = new Date(d + t); return isNaN(x.getTime()) ? '' : x.toISOString().replace('T', ' ') }
  const repStart = toUtc(valFrom, 'T00:00:00+03:00')
  const repEnd = toUtc(valTo, 'T23:59:59.999+03:00')
  const repReady = repMovs !== null && repFor === repStart && !repLoading && !repError && !!repStart && !!repEnd && repStart <= repEnd

  // Stock Report is rebuilt from REAL stock: closing = stock today minus movements after the period end;
  // opening = closing minus the movements inside the period.
  const valReport = repReady ? products.map(p => {
    let after = 0, recv = 0, sold = 0, out = 0, adj = 0
    repMovs.forEach(m => {
      if (m.product_id !== p.id) return
      const q = Number(m.qty || 0)
      if (m.created > repEnd) { after += q; return }
      if (m.type === 'sale') sold -= q
      else if (m.type === 'stock_out' || m.type === 'damage') out -= q
      else if (m.type === 'adjustment') adj += q
      else recv += q
    })
    const closing = r2(Number(p.stock_qty || 0) - after)
    const opening = r2(closing - (recv - sold - out + adj))
    return { ...p, opening, recv: r2(recv), sold: r2(sold), out: r2(out), adj: r2(adj), closing, closingValue: closing * Number(p.cost_price_kes || 0) }
  }).filter(p => p.opening !== 0 || p.recv !== 0 || p.sold !== 0 || p.out !== 0 || p.adj !== 0 || p.closing !== 0) : []

  const valTotals = valReport.reduce((t, p) => ({
    opening: r2(t.opening + p.opening),
    recv: r2(t.recv + p.recv),
    sold: r2(t.sold + p.sold),
    out: r2(t.out + p.out),
    adj: r2(t.adj + p.adj),
    closing: r2(t.closing + p.closing),
    closingValue: t.closingValue + p.closingValue,
  }), { opening: 0, recv: 0, sold: 0, out: 0, adj: 0, closing: 0, closingValue: 0 })

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Inventory 📦</div>
          <div className="page-subtitle">{products.length} tracked products</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setShowBulkImport(true)} disabled={isLocked || !canWriteOff}><Upload size={14} /> Bulk Import</button>
          <button className="btn-primary" onClick={() => openAdjust(null, 'stock_in')} disabled={isLocked || !canReceive} title={isLocked ? 'Account locked — renew to adjust stock' : ''}>
            {isLocked ? '🔒 Locked' : <><Plus size={16} /> Receive Stock</>}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Stock Value (Cost)', value: fmtKES(totalStockValue), icon: '💰', cls: 'rose' },
          { label: 'Retail Value', value: fmtKES(totalRetailValue), icon: '🏷️', cls: 'gold' },
          { label: 'Low Stock Items', value: lowCount, icon: '⚠️', cls: lowCount > 0 ? 'rose' : 'green' },
          { label: 'Out of Stock', value: outCount, icon: '❌', cls: outCount > 0 ? 'rose' : 'green' },
        ].map((s, i) => (
          <div key={i} className={`stat-card ${s.cls}`}>
            <div style={{ fontSize: 26, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Playfair Display,serif' }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#9b6070', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#fce8ed', borderRadius: 12, padding: 4, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' }}>
        {[['stock', '📊 Stock Levels'], ['movements', '🔄 Movements'], ['valuation', '📋 Stock Report']].concat(canWriteOff ? [['count', '\uD83D\uDD22 Stock Count'], ['loss', '\uD83D\uDCC9 Loss Report']] : []).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} style={{ padding: '7px 20px', borderRadius: 8, border: 'none', background: tab === v ? 'linear-gradient(135deg,#c8456a,#8b2550)' : 'transparent', color: tab === v ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'stock' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontWeight: 600, color: '#3d1020', fontSize: 14 }}>Stock Levels</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {lowCount > 0 && (
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, color: '#25d366', fontWeight: 700, minHeight: 36 }}
                  onClick={() => {
                    const lowItems = products.filter(p => p.stock_qty <= (p.reorder_point || 5))
                    const lines = lowItems.map((p, i) =>
                      `${i + 1}. *${p.name}*\n    Stock: ${r2(p.stock_qty ?? 0)} ${p.unit || 'pcs'} (reorder at ${p.reorder_point || 5})`
                    ).join('\n\n')
                    const outItems = lowItems.filter(p => p.stock_qty <= 0)
                    const msg = `⚠️ *Low Stock Report — ${shop.name}*\n\n${outItems.length > 0 ? `❌ *${outItems.length} item(s) completely out of stock*\n` : ''}📦 *${lowItems.length} product(s) need restocking:*\n\n${lines}\n\n_Please reorder to avoid losing sales._\n\n_${shop.name} · SalesTrack_`
                    const phone = shop.phone ? shop.phone.replace(/\D/g, '').replace(/^0/, '254') : ''
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
                  }}
                >
                  📲 Alert All ({lowCount})
                </button>
              )}
              <button onClick={() => setFilterAlert(!filterAlert)} className={`btn-ghost ${filterAlert ? 'text-red-600' : ''}`} style={{ fontSize: 12, minHeight: 36 }}>
                <Filter size={14} /> {filterAlert ? 'Show All' : 'Low Stock Only'}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Barcode</th>
                  <th>On Hand</th>
                  <th>Reorder At</th>
                  <th>Days Left</th>
                  <th>Cost Value</th>
                  <th>Retail Value</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => {
                  const isLow = p.stock_qty <= (p.reorder_point || 5)
                  const isOut = p.stock_qty <= 0
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        {p.brand && <div style={{ fontSize: 11, color: '#9b6070' }}>{p.brand}</div>}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.barcode || p.sku || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 16, color: isOut ? '#dc2626' : isLow ? '#d97706' : '#059669' }}>
                          {r2(p.stock_qty ?? 0)}
                        </span>
                        <span style={{ color: '#9b6070', fontSize: 12, marginLeft: 4 }}>{p.unit || 'pcs'}</span>
                      </td>
                      <td style={{ color: '#9b6070', fontSize: 13 }}>{p.reorder_point || 5}</td>
                      <td>
                        {(() => {
                          const forecast = calcStockForecast(p)
                          return forecast ? (
                            <span style={{ fontWeight: 700, color: forecast < 7 ? '#dc2626' : '#3b82f6' }}>
                              {forecast} {forecast === 1 ? 'day' : 'days'}
                            </span>
                          ) : <span style={{ color: '#9b6070' }}>—</span>
                        })()}
                      </td>
                      <td>{fmtKES((p.stock_qty || 0) * (p.cost_price_kes || 0))}</td>
                      <td>{fmtKES((p.stock_qty || 0) * (p.price_kes || 0))}</td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isOut ? '#fee2e2' : isLow ? '#fefce8' : '#f0fdf4', color: isOut ? '#dc2626' : isLow ? '#d97706' : '#059669' }}>
                          {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {canReceive && <button className="btn-ghost" onClick={() => openAdjust(p, 'stock_in')} title="Stock In" style={{ padding: '5px 10px', color: '#059669', minHeight: 44 }}><ArrowUp size={14} /></button>}
                          {canWriteOff && <button className="btn-ghost" onClick={() => openAdjust(p, 'stock_out')} title="Stock Out / Damage" style={{ padding: '5px 10px', color: '#dc2626', minHeight: 44 }}><ArrowDown size={14} /></button>}
                          {canWriteOff && <button className="btn-ghost" onClick={() => openAdjust(p, 'adjustment')} title="Adjust" style={{ padding: '5px 10px', minHeight: 44 }}><RefreshCw size={14} /></button>}
                          {(isLow || isOut) && (
                            <button
                              className="btn-ghost"
                              title="Send low stock alert to yourself via WhatsApp"
                              style={{ padding: '5px 10px', color: '#25d366', minHeight: 44, fontWeight: 700, fontSize: 12 }}
                              onClick={() => {
                                const msg = `⚠️ *Low Stock Alert — ${shop.name}*\n\n*Product:*\n${p.name}${p.brand ? ' (' + p.brand + ')' : ''}\n\n*Current Stock:*\n${r2(p.stock_qty ?? 0)} ${p.unit || 'pcs'}\n\n*Reorder Level:*\n${p.reorder_point || 5} ${p.unit || 'pcs'}\n\n*Retail Price:*\n${fmtKES(p.price_kes)}\n\n📦 Restock this product to avoid losing sales.\n\n_${shop.name} · SalesTrack_`
                                const phone = shop.phone ? shop.phone.replace(/\D/g, '').replace(/^0/, '254') : ''
                                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
                              }}
                            >
                              📲
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'valuation' && (
        <div>
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e' }}>
            Closing stock is the real stock you hold today, rolled back by the movements recorded after the period end, so it matches Stock Levels. Opening is worked out the same way, so any stock change that was never recorded sits inside Opening. Values use the CURRENT cost price.
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label className="label">Period From</label>
                <input className="input" type="date" value={valFrom} onChange={e => setValFrom(e.target.value)} style={{ maxWidth: 160 }} />
              </div>
              <div>
                <label className="label">Period To</label>
                <input className="input" type="date" value={valTo} onChange={e => setValTo(e.target.value)} style={{ maxWidth: 160 }} />
              </div>
              <button className="btn-primary" style={{ marginBottom: 2 }} disabled={!repReady || valReport.length === 0} onClick={() => {
                const lines = valReport.map(p => '*' + p.name + '*\nOpen: ' + p.opening + ' | Received: ' + p.recv + ' | Sold: ' + p.sold + ' | Written off: ' + p.out + ' | Counts: ' + (p.adj > 0 ? '+' : '') + p.adj + ' | Closing: ' + p.closing + ' @ ' + fmtKES(p.cost_price_kes || 0) + ' = *' + fmtKES(p.closingValue) + '*').join('\n\n')
                const msg = '\uD83D\uDCCB *Stock Report*\n*' + shop.name + '*\nPeriod: ' + valFrom + ' to ' + valTo + '\n\n' + lines + '\n\n----------------\n*TOTAL CLOSING STOCK VALUE*\n*' + fmtKES(valTotals.closingValue) + '*\n\n_Valued at current cost price - SalesTrack_'
                const phone = shop.phone ? shop.phone.replace(/\D/g, '').replace(/^0/, '254') : ''
                window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(msg), '_blank')
              }}>
                {'\uD83D\uDCF2'} Share Report
              </button>
            </div>
          </div>

          <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Opening Stock', value: valTotals.opening + ' units', color: '#3b82f6', icon: '\uD83D\uDCC2' },
              { label: 'Stock Received', value: '+' + valTotals.recv + ' units', color: '#059669', icon: '\uD83D\uDCE6' },
              { label: 'Sold / Written off', value: '-' + r2(valTotals.sold + valTotals.out) + ' units', color: '#dc2626', icon: '\uD83D\uDCE4' },
              { label: 'Closing Value (Cost)', value: fmtKES(valTotals.closingValue), color: '#c8456a', icon: '\uD83D\uDCB0' },
            ].map((s, i) => (
              <div key={i} className="stat-card">
                <div style={{ fontSize: 24 }}>{s.icon}</div>
                <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f5edf0' }}>
              <div style={{ fontWeight: 700, color: '#3d1020', fontSize: 14 }}>Stock Movement Statement (valued at current cost)</div>
              <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Opening + Received - Sold - Written off + Counts = Closing</div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Opening</th>
                    <th style={{ textAlign: 'right', color: '#059669' }}>+Received</th>
                    <th style={{ textAlign: 'right', color: '#c8456a' }}>-Sold</th>
                    <th style={{ textAlign: 'right', color: '#ef4444' }}>-Written off</th>
                    <th style={{ textAlign: 'right', color: '#8b5cf6' }}>Counts</th>
                    <th style={{ textAlign: 'right' }}>Closing Qty</th>
                    <th style={{ textAlign: 'right' }}>Cost/Unit</th>
                    <th style={{ textAlign: 'right', fontWeight: 800 }}>Closing Value</th>
                  </tr>
                </thead>
                <tbody>
                  {!repReady ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#9b6070' }}>
                      {repError ? 'The report could not be loaded. Switch tabs and come back.' : (repStart && repEnd && repStart > repEnd ? 'Period From must be on or before Period To.' : 'Loading...')}
                    </td></tr>
                  ) : valReport.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#9b6070' }}>No stock or stock movements in this period.</td></tr>
                  ) : valReport.map(p => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        {p.brand && <div style={{ fontSize: 11, color: '#9b6070' }}>{p.brand}</div>}
                      </td>
                      <td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>{p.opening}</td>
                      <td style={{ textAlign: 'right', color: '#059669', fontWeight: 600 }}>{p.recv > 0 ? '+' + p.recv : '-'}</td>
                      <td style={{ textAlign: 'right', color: '#c8456a', fontWeight: 600 }}>{p.sold > 0 ? '-' + p.sold : '-'}</td>
                      <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{p.out > 0 ? '-' + p.out : '-'}</td>
                      <td style={{ textAlign: 'right', color: '#8b5cf6', fontWeight: 600 }}>{p.adj === 0 ? '-' : (p.adj > 0 ? '+' : '') + p.adj}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15 }}>{p.closing}</td>
                      <td style={{ textAlign: 'right', color: '#9b6070', fontSize: 12 }}>{fmtKES(p.cost_price_kes || 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#3d1020', fontSize: 14 }}>{fmtKES(p.closingValue)}</td>
                    </tr>
                  ))}
                  {repReady && valReport.length > 0 && (
                    <tr style={{ background: 'linear-gradient(135deg,#fce8ed,#fdf5f7)', borderTop: '2px solid #f0e4e8' }}>
                      <td style={{ fontWeight: 800, color: '#3d1020' }}>TOTAL</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#3b82f6' }}>{valTotals.opening}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669' }}>{valTotals.recv > 0 ? '+' + valTotals.recv : '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#c8456a' }}>{valTotals.sold > 0 ? '-' + valTotals.sold : '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{valTotals.out > 0 ? '-' + valTotals.out : '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#8b5cf6' }}>{valTotals.adj === 0 ? '-' : (valTotals.adj > 0 ? '+' : '') + valTotals.adj}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16 }}>{valTotals.closing}</td>
                      <td></td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#c8456a' }}>{fmtKES(valTotals.closingValue)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'count' && canWriteOff && (() => {
        const rows = products.filter(p => !p.has_variants)
        const lines = rows.map(p => {
          const raw = countVals[p.id]
          const entered = raw !== undefined && raw !== ''
          const counted = entered ? Number(raw) : null
          const system = Number(p.stock_qty || 0)
          const bad = entered && (isNaN(counted) || counted < 0)
          const diff = entered && !bad ? r2(counted - system) : 0
          const value = r2(diff * Number(p.cost_price_kes || 0))
          return { p, entered, system, bad, diff, value }
        })
        const changed = lines.filter(l => l.entered && !l.bad && l.diff !== 0)
        const hasBad = lines.some(l => l.bad)
        const shortage = r2(changed.filter(l => l.value < 0).reduce((s, l) => s + l.value, 0))
        const surplus = r2(changed.filter(l => l.value > 0).reduce((s, l) => s + l.value, 0))
        const skipped = products.length - rows.length
        return (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: '#3d1020', fontSize: 14 }}>Stock Count</div>
              <div style={{ fontSize: 12, color: '#9b6070', marginTop: 4 }}>Count the shelf and type what you counted. Leave an item blank to skip it. Pause sales while you count. Differences are valued at the current cost price.</div>
              {skipped > 0 && <div style={{ fontSize: 12, color: '#92400e', marginTop: 6 }}>{skipped} item(s) with variants are not counted here.</div>}
              <div style={{ marginTop: 12 }}>
                <label className="label">Note (optional)</label>
                <input className="input" value={countNote} onChange={e => setCountNote(e.target.value)} placeholder="e.g. Monthly count" />
              </div>
            </div>
            <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
              <div className="stat-card"><div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700 }}>{changed.length}</div><div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Items to change</div></div>
              <div className="stat-card"><div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{signedKES(shortage)}</div><div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Shortage at cost</div></div>
              <div className="stat-card"><div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#059669' }}>{signedKES(surplus)}</div><div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Surplus at cost</div></div>
              <div className="stat-card"><div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700 }}>{signedKES(r2(shortage + surplus))}</div><div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Net difference</div></div>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Product</th><th style={{ textAlign: 'right' }}>System</th><th>Counted</th><th style={{ textAlign: 'right' }}>Difference</th><th style={{ textAlign: 'right' }}>Value at cost</th></tr>
                  </thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.p.id}>
                        <td><div style={{ fontWeight: 600 }}>{l.p.name}</div></td>
                        <td style={{ textAlign: 'right' }}>{r2(l.system)} <span style={{ color: '#9b6070', fontSize: 12 }}>{l.p.unit || 'pcs'}</span></td>
                        <td>
                          <input className="input" type="number" min={0} step="0.01" inputMode="decimal" style={{ maxWidth: 110 }} value={countVals[l.p.id] === undefined ? '' : countVals[l.p.id]} onChange={e => setCountVals({ ...countVals, [l.p.id]: e.target.value })} placeholder="Counted" />
                          {l.bad && <div style={{ fontSize: 11, color: '#dc2626' }}>Enter 0 or more</div>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: l.diff < 0 ? '#dc2626' : l.diff > 0 ? '#059669' : '#9b6070' }}>{l.entered && !l.bad ? (l.diff > 0 ? '+' : '') + l.diff : '-'}</td>
                        <td style={{ textAlign: 'right', color: l.value < 0 ? '#dc2626' : l.value > 0 ? '#059669' : '#9b6070' }}>{l.entered && !l.bad && l.diff !== 0 ? signedKES(l.value) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => { setCountVals({}); setCountNote('') }} disabled={countSaving}>Clear</button>
              <button className="btn-primary" onClick={saveCount} disabled={countSaving || hasBad || changed.length === 0 || isLocked}>{countSaving ? 'Saving...' : 'Save count (' + changed.length + ' to change)'}</button>
            </div>
          </div>
        )
      })()}

      {tab === 'loss' && canWriteOff && (() => {
        const rows = lossRows.map(m => {
          const prod = m.expand && m.expand.product_id
          const who = m.expand && m.expand.created_by
          return { m, name: prod ? prod.name : 'Deleted product', value: r2(Number(m.qty || 0) * Number(prod ? prod.cost_price_kes || 0 : 0)), who: who ? (who.name || who.email || 'Unknown') : 'Unknown' }
        })
        const lossTotal = r2(rows.filter(r => r.value < 0).reduce((s, r) => s + r.value, 0))
        const gainTotal = r2(rows.filter(r => r.value > 0).reduce((s, r) => s + r.value, 0))
        const byPerson = {}
        rows.forEach(r => {
          if (!byPerson[r.who]) byPerson[r.who] = { who: r.who, entries: 0, value: 0 }
          byPerson[r.who].entries += 1
          byPerson[r.who].value = r2(byPerson[r.who].value + r.value)
        })
        const people = Object.values(byPerson).sort((a, b) => a.value - b.value)
        const typeColors = { stock_out: '#dc2626', damage: '#ef4444', adjustment: '#8b5cf6' }
        return (
          <div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label className="label">From</label>
                  <input className="input" type="date" value={lossFrom} onChange={e => setLossFrom(e.target.value)} style={{ maxWidth: 160 }} />
                </div>
                <div>
                  <label className="label">To</label>
                  <input className="input" type="date" value={lossTo} onChange={e => setLossTo(e.target.value)} style={{ maxWidth: 160 }} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9b6070', marginTop: 10 }}>Stock that left the shelf without a sale: stock out, damage and adjustments, including stock counts. Values use the CURRENT cost price. It shows only what was recorded or counted; unrecorded theft appears only when someone does a stock count.</div>
            </div>
            <div className="stat-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
              <div className="stat-card"><div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#dc2626' }}>{signedKES(lossTotal)}</div><div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Losses recorded</div></div>
              <div className="stat-card"><div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700, color: '#059669' }}>{signedKES(gainTotal)}</div><div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Surpluses recorded</div></div>
              <div className="stat-card"><div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700 }}>{signedKES(r2(lossTotal + gainTotal))}</div><div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Net</div></div>
              <div className="stat-card"><div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, fontWeight: 700 }}>{rows.length}</div><div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Entries</div></div>
            </div>
            {people.length > 0 && (
              <div className="card" style={{ padding: 0, marginBottom: 16 }}>
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #f5edf0', fontWeight: 700, color: '#3d1020', fontSize: 14 }}>By person</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Recorded by</th><th style={{ textAlign: 'right' }}>Entries</th><th style={{ textAlign: 'right' }}>Net value at cost</th></tr></thead>
                    <tbody>
                      {people.map(pp => (
                        <tr key={pp.who}>
                          <td style={{ fontWeight: 600 }}>{pp.who}</td>
                          <td style={{ textAlign: 'right' }}>{pp.entries}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: pp.value < 0 ? '#dc2626' : pp.value > 0 ? '#059669' : '#9b6070' }}>{signedKES(pp.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Product</th><th>Type</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Value at cost</th><th>Reason</th><th>Recorded by</th></tr></thead>
                  <tbody>
                    {lossLoading ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#9b6070' }}>Loading...</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#9b6070' }}>No stock out, damage or adjustments recorded in this period.</td></tr>
                    ) : rows.map(r => (
                      <tr key={r.m.id}>
                        <td style={{ fontSize: 12, color: '#9b6070', whiteSpace: 'nowrap' }}>{fmtDateTime(r.m.created)}</td>
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td><span style={{ background: (typeColors[r.m.type] || '#6b7280') + '20', color: typeColors[r.m.type] || '#6b7280', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{r.m.type}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: r.m.qty > 0 ? '#059669' : '#dc2626' }}>{r.m.qty > 0 ? '+' : ''}{r.m.qty}</td>
                        <td style={{ textAlign: 'right', color: r.value < 0 ? '#dc2626' : r.value > 0 ? '#059669' : '#9b6070' }}>{signedKES(r.value)}</td>
                        <td style={{ fontSize: 12, color: '#9b6070' }}>{r.m.reference || r.m.notes || '-'}</td>
                        <td style={{ fontSize: 12 }}>{r.who}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {tab === 'movements' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Before</th><th>After</th><th>Reference</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {movements.map(m => {
                  const typeColors = { stock_in: '#059669', stock_out: '#dc2626', sale: '#c8456a', return: '#3b82f6', damage: '#ef4444', adjustment: '#8b5cf6' }
                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12, color: '#9b6070', whiteSpace: 'nowrap' }}>{fmtDateTime(m.created)}</td>
                      <td style={{ fontWeight: 600 }}>{m.expand?.product_id?.name || m.product_id}</td>
                      <td><span style={{ background: typeColors[m.type] + '20', color: typeColors[m.type], padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{m.type}</span></td>
                      <td style={{ fontWeight: 700, color: m.qty > 0 ? '#059669' : '#dc2626' }}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
                      <td style={{ color: '#9b6070' }}>{r2(m.before_qty)}</td>
                      <td style={{ fontWeight: 600 }}>{r2(m.after_qty)}</td>
                      <td style={{ fontSize: 12, fontFamily: 'monospace' }}>{m.reference || '—'}</td>
                      <td style={{ fontSize: 12, color: '#9b6070' }}>{m.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {showAdjust && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdjust(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">{adjustType === 'stock_in' ? 'Receive Stock' : 'Stock Adjustment'}</span>
              <button onClick={() => setShowAdjust(false)} className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleAdjust} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {!adjustProduct && (
                  <div>
                    <label className="label">Product *</label>
                    <SearchPick autoFocus items={productItems} value={prodQuery} onText={setProdQuery} placeholder="Type a name, SKU or barcode" emptyText="No product matches"
                      onPick={it => { const p = products.find(x => x.id === it.key); if (p) { setAdjustProduct(p); setAdjustPicked(true); setAdjustCost(p.cost_price_kes || '') } }} />
                  </div>
                )}
                {adjustProduct && <div style={{ background: '#fce8ed', borderRadius: 10, padding: '10px 14px', fontSize: 14 }}>
                  {adjustPicked && <button type="button" className="btn-ghost" style={{ float: 'right', fontSize: 12, padding: '2px 8px' }} onClick={() => { setAdjustProduct(null); setAdjustPicked(false); setProdQuery('') }}>Change</button>}
                  <strong>{adjustProduct.name}</strong> · Current stock: <strong>{r2(adjustProduct.stock_qty || 0)} {adjustProduct.unit || 'pcs'}</strong>
                </div>}
                <div>
                  <label className="label">Movement Type</label>
                  <select className="input" value={adjustType} onChange={e => setAdjustType(e.target.value)}>
                    <option value="opening_stock">🏁 Opening Stock (Day 1 entry)</option>
                    <option value="stock_in">📦 Stock Received (GRN)</option>
                    <option value="stock_out">📤 Stock Out (Removed)</option>
                    <option value="return">🔄 Customer Return</option>
                    <option value="damage">💔 Damaged / Written Off</option>
                    <option value="adjustment">✏️ Manual Adjustment</option>
                  </select>
                </div>
                <div>
                  <label className="label">Quantity {adjustProduct ? `(${adjustProduct.unit || 'pcs'})` : ''} *</label>
                  <input className="input" type="number" min={0.01} step="0.01" inputMode="decimal" required value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="Enter quantity" />
                </div>
                {['stock_in', 'opening_stock'].includes(adjustType) && (
                  <>
                    <div>
                      <label className="label">Supplier Cost per {adjustProduct?.unit || 'unit'} (KES) *</label>
                      <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={adjustCost} onChange={e => setAdjustCost(e.target.value)} placeholder="e.g. 145" />
                    </div>
                    <div>
                      <label className="label">Transport / Other Procurement Cost (KES)</label>
                      <input className="input" type="number" min={0} step="0.01" inputMode="decimal" value={adjustExtraCost} onChange={e => setAdjustExtraCost(e.target.value)} placeholder="e.g. 300 transport for this batch" />
                      <div style={{ fontSize: 11, color: '#9b6070', marginTop: 5 }}>Optional. SalesTrack spreads this cost across the quantity received.</div>
                    </div>
                    {Number(adjustQty) > 0 && Number(adjustCost) >= 0 && (
                      <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 12px', color: '#166534', fontSize: 12 }}>
                        <strong>Landed cost:</strong> {fmtKES(((Number(adjustCost) || 0) * Number(adjustQty) + (Number(adjustExtraCost) || 0)) / Number(adjustQty))} / {adjustProduct?.unit || 'unit'}
                        <div style={{ marginTop: 3, color: '#4b7a5b' }}>Used as the inventory cost for profit calculations.</div>
                        {adjustProduct && Number(adjustProduct.cost_price_kes) > 0 && Number(adjustCost) > 0 && (() => {
                          const curCost = Number(adjustProduct.cost_price_kes)
                          const landed = ((Number(adjustCost) || 0) * Number(adjustQty) + (Number(adjustExtraCost) || 0)) / Number(adjustQty)
                          const pct = (landed - curCost) / curCost * 100
                          if (Math.abs(pct) <= 20) return null
                          return <div style={{ marginTop: 8, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', color: '#92400e', fontWeight: 700 }}>Check the cost: the current cost is {fmtKES(curCost)}, this batch is {Math.abs(Math.round(pct))}% {pct > 0 ? 'higher' : 'lower'}.</div>
                        })()}
                      </div>
                    )}
                    <div>
                      <label className="label">How did you pay for this stock? *</label>
                      <select className="input" value={adjustFunding} onChange={e => setAdjustFunding(e.target.value)}>
                        <option value="cash">💵 Cash / M-Pesa — paid now</option>
                        <option value="payable">🧾 On Credit — supplier not yet paid</option>
                        <option value="owner_capital">💼 From my own capital (new investment)</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Supplier Name</label>
                      <SearchPick items={supplierItems} value={adjustSupplier} onText={setAdjustSupplier} onPick={it => setAdjustSupplier(it.label)} required={adjustFunding === 'payable'} placeholder="Type to find a supplier card, or a new name" />
                    </div>
                  </>
                )}
                <div>
                  <label className="label">Notes / Reference</label>
                  <input className="input" value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="e.g. Supplier invoice #123, LPO reference…" />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowAdjust(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : (adjustType === 'stock_in' ? 'Receive Stock' : 'Save Adjustment')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowBulkImport(false); setImportErrors([]) } }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header"><span className="modal-title">{'\uD83D\uDCCB Bulk Stock Import'}</span><button onClick={() => { setShowBulkImport(false); setImportErrors([]) }} className="btn-ghost" style={{ padding: 8 }}><X size={16} /></button></div>
            <div className="modal-body">
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 12, color: '#166534' }}>
                <strong>Format:</strong> Paste CSV with columns: name, qty, cost, notes
                <div style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 11 }}>
                  <div>Product Name,Qty,Cost,Notes</div>
                  <div>Hair Shampoo 500ml,10,350,Supplier Invoice #123</div>
                  <div>Nail Polish,25,150,Opening stock</div>
                </div>
                <div style={{ marginTop: 8 }}>Products must already exist in Inventory (matched by name). Qty must be more than 0 and every row needs a cost. Do not use commas inside names or notes.</div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="label">How was this stock paid for? *</label>
                <select className="input" value={importFunding} onChange={e => setImportFunding(e.target.value)}>
                  <option value="owner_capital">{'\uD83D\uDCBC'} From my own capital (setup or new investment)</option>
                  <option value="cash">{'\uD83D\uDCB5'} Cash / M-Pesa, paid now (counts as a cash purchase)</option>
                  <option value="payable">{'\uD83E\uDDFE'} On credit, supplier not yet paid</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label className="label">Supplier Name</label>
                <SearchPick items={supplierItems} value={importSupplier} onText={setImportSupplier} onPick={it => setImportSupplier(it.label)} placeholder={importFunding === 'payable' ? 'Required when on credit' : 'Optional'} />
              </div>

              <textarea style={{
                width: '100%', height: 180, padding: 12, border: '1px solid #f0e4e8', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, marginBottom: 12, resize: 'vertical'
              }} placeholder="Paste CSV data here..." value={importData} onChange={e => setImportData(e.target.value)} />

              {importErrors.length > 0 && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: '#991b1b', maxHeight: 140, overflowY: 'auto' }}>
                  <strong>Not imported. Fix these rows (they are left in the box above):</strong>
                  {importErrors.map((er, i) => <div key={i} style={{ marginTop: 4 }}>{er}</div>)}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-secondary" onClick={() => { setShowBulkImport(false); setImportErrors([]) }} disabled={importing}>Cancel</button>
                <button className="btn-primary" onClick={handleBulkImportCSV} disabled={importing || !importData.trim()}>
                  {importing ? <><div style={{ width: 14, height: 14, border: '2px solid #fff4', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block', marginRight: 6 }} /> Importing...</> : <><Zap size={14} /> Import {Math.max(0, importData.split('\n').filter(l => l.trim()).length - 1)} items</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}