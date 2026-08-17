import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C, PB_URL } from '../lib/pb'
import { fmtKES } from '../lib/utils'
import { Plus, Search, Upload, Edit2, Trash2, X, FileUp, Download, CheckCircle2, AlertCircle, ChevronRight, Copy, BarChart2 } from 'lucide-react'
import toast from 'react-hot-toast'

const EMPTY = { name:'', sku:'', barcode:'', category_id:'', description:'', unit:'piece', price_kes:'', cost_price_kes:'', compare_price_kes:'', stock_qty:'', reorder_point:5, track_inventory:true, is_service:false, is_taxable:true, brand:'', tags:'', status:'active' }

// ─── CSV TEMPLATE ─────────────────────────────────────────────────
const CSV_HEADERS = ['name','sku','barcode','category','price_kes','cost_price_kes','compare_price_kes','stock_qty','reorder_point','unit','brand','description','track_inventory','is_taxable','tags']

const CSV_SAMPLE_ROWS = [
  ['Keratin Hair Treatment','KHT-001','6001234567890','Haircare','3500','1200','4000','10','3','piece','Cantu','Professional keratin smoothing treatment','true','true','hair,keratin,treatment'],
  ['Aloe Vera Facial Cream','AVFC-002','6001234567891','Skincare','1200','450','1500','25','5','piece','Neutrogena','Soothing aloe vera moisturiser for all skin types','true','true','skincare,aloe,moisturiser'],
  ['Mink Lash Set 25mm','MLS-003','6001234567892','Wigs','850','280','','15','4','piece','Ardell','Dramatic 25mm mink lashes reusable up to 25 times','true','true','lashes,mink,dramatic'],
  ['Lavender Body Oil 200ml','LBO-004','6001234567893','Haircare','650','200','','30','8','ml','ORS','Moisturising lavender body and hair oil','true','true','oil,lavender,body'],
  ['Hair Braiding Service','HBS-005','','Haircare','2500','0','','0','0','service','','Full head braiding service — 2 to 3 hours','false','false','service,braiding'],
]

function downloadTemplate(categories) {
  const catNames = categories.map(c => c.name).join(' / ') || 'Haircare / Skincare / Wigs'
  const notes = [
    '# SALESTRACK BULK IMPORT TEMPLATE',
    '# ─────────────────────────────────────────────────────────────────',
    '# HOW TO USE THIS TEMPLATE:',
    '# 1. Fill in your products starting from Row 9 (after the sample rows)',
    '# 2. Delete the sample rows (rows 9-13) before importing',
    '# 3. Save as CSV (comma separated) and upload in the app',
    '#',
    '# FIELD GUIDE:',
    `# category       → Must match exactly: ${catNames}`,
    '# price_kes      → Selling price in KES (required)',
    '# cost_price_kes → Your buying/cost price (for profit calculation)',
    '# compare_price  → Original/crossed-out price (leave blank if none)',
    '# stock_qty      → Current stock on hand (0 if none)',
    '# reorder_point  → Alert when stock drops to this level (default 5)',
    '# unit           → piece / ml / g / kg / litre / box / set / dozen / service',
    '# track_inventory→ true = track stock levels, false = unlimited',
    '# is_taxable     → true = apply VAT, false = tax exempt',
    '# ─────────────────────────────────────────────────────────────────',
    '',
  ].join('\n')

  const header = CSV_HEADERS.join(',')
  const samples = CSV_SAMPLE_ROWS.map(r => r.map(v => v.includes(',') ? `"${v}"` : v).join(',')).join('\n')
  const content = notes + header + '\n' + samples + '\n'

  const blob = new Blob([content], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'salestrack_products_template.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  toast.success('Template downloaded! Open in Excel or Google Sheets.')
}

// ─── PARSE CSV (handles quoted fields with commas) ─────────────────
function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += ch }
  }
  result.push(current.trim())
  return result
}

function parseCsv(text) {
  const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g,'_'))
  const rows = lines.slice(1)
    .map(line => {
      const vals = parseCsvLine(line)
      const obj = {}
      headers.forEach((h, i) => { obj[h] = vals[i] || '' })
      return obj
    })
    // Only drop rows that are completely empty (every field blank) — a true blank line.
    // Rows with SOME data but a missing name must stay, so validateRow can flag them.
    .filter(r => Object.values(r).some(v => v && v.trim()))
  return { headers, rows }
}

// ─── VALIDATION ───────────────────────────────────────────────────
// Scans the whole parsed batch for duplicate SKU/barcode values across rows.
// Returns a map of rowIndex -> array of duplicate-warning strings for that row.
function findDuplicates(rows) {
  const dupes = {}
  const seenSku = {}
  const seenBarcode = {}
  rows.forEach((row, i) => {
    const sku = (row.sku || '').trim().toLowerCase()
    const barcode = (row.barcode || '').trim()
    if (sku) {
      if (seenSku[sku] !== undefined) {
        dupes[i] = [...(dupes[i]||[]), `SKU "${row.sku}" also used in row ${seenSku[sku]+1}`]
        dupes[seenSku[sku]] = [...(dupes[seenSku[sku]]||[]), `SKU "${row.sku}" also used in row ${i+1}`]
      } else { seenSku[sku] = i }
    }
    if (barcode) {
      if (seenBarcode[barcode] !== undefined) {
        dupes[i] = [...(dupes[i]||[]), `Barcode "${barcode}" also used in row ${seenBarcode[barcode]+1}`]
        dupes[seenBarcode[barcode]] = [...(dupes[seenBarcode[barcode]]||[]), `Barcode "${barcode}" also used in row ${i+1}`]
      } else { seenBarcode[barcode] = i }
    }
  })
  return dupes
}

function validateRow(row, categories, index) {
  const errors = []
  const name = row.name || row.product_name || ''
  if (!name.trim()) errors.push('Name is required')
  const price = parseFloat(row.price_kes || row.price || 0)
  if (!price || price <= 0) errors.push('Price must be > 0')
  if (row.category) {
    const found = categories.find(c => c.name.toLowerCase() === row.category.toLowerCase())
    if (!found) errors.push(`Category "${row.category}" not found — will be left blank`)
  }
  return errors
}

export default function ProductsPage() {
  const { shop, loading: authLoading, isLocked } = useAuth()
  const [products, setProducts]     = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterCat, setFilterCat]   = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState(null)
  const [form, setForm]             = useState(EMPTY)
  const [saving, setSaving]         = useState(false)
  const [imageFiles, setImageFiles] = useState([])
  const [imagePreview, setImagePreview] = useState([])
  const [existingImages, setExistingImages] = useState([]) // filenames already on the product
  const [removedImages, setRemovedImages] = useState([])   // filenames marked for deletion this edit

  // Variant state — list of variant rows for the product currently open in the modal
  const [variants, setVariants] = useState([])         // [{ id?, name, sku, barcode, price_kes, cost_price_kes, stock_qty, reorder_point, sort_order }]
  const [deletedVariantIds, setDeletedVariantIds] = useState([]) // existing variant ids removed this edit
  const [variantsLoading, setVariantsLoading] = useState(false)

  // Bulk import state
  const [showBulk, setShowBulk]         = useState(false)
  const [bulkStep, setBulkStep]         = useState(1)
  const [bulkFile, setBulkFile]         = useState(null)
  const [bulkRows, setBulkRows]         = useState([])
  const [bulkValidation, setBulkValidation] = useState([])
  const [bulkImporting, setBulkImporting]   = useState(false)
  const [bulkResult, setBulkResult]     = useState(null)

  const [view, setView] = useState('table') // 'table' | 'margin'

  const fileInputRef = useRef()
  const csvInputRef  = useRef()

  useEffect(() => {
    if (shop?.id && !authLoading) loadData()
  }, [shop?.id, authLoading])

  const loadData = async () => {
    if (!shop?.id) return
    setLoading(true)
    try {
      const [prods, cats] = await Promise.all([
        pb.collection(C.PRODUCTS).getList(1, 500, { filter:`shop_id="${shop.id}"`, '$autoCancel':false }).then(r=>r.items).catch(()=>[]),
        pb.collection(C.CATEGORIES).getList(1, 200, { filter:`shop_id="${shop.id}"`, '$autoCancel':false }).then(r=>r.items).catch(()=>[]),
      ])
      setProducts(prods)
      setCategories(cats)
    } finally { setLoading(false) }
  }

  const openNew  = () => {
    setEditing(null); setForm(EMPTY); setImageFiles([]); setImagePreview([]); setExistingImages([]); setRemovedImages([])
    setVariants([]); setDeletedVariantIds([])
    setShowModal(true)
  }
  const openEdit = async (p) => {
    setEditing(p); setForm({...p}); setImageFiles([]); setImagePreview([]); setExistingImages(p.images || []); setRemovedImages([])
    setDeletedVariantIds([])
    setShowModal(true)
    if (p.has_variants) {
      setVariantsLoading(true)
      try {
        const res = await pb.collection(C.PRODUCT_VARIANTS).getList(1, 100, {
          filter: `product_id="${p.id}"`,
          sort: 'sort_order',
          '$autoCancel': false,
          '$cancelKey': `variants-${p.id}`,
        })
        setVariants(res.items.map(v => ({ ...v, _existing: true })))
      } catch {
        setVariants([])
      } finally {
        setVariantsLoading(false)
      }
    } else {
      setVariants([])
    }
  }

  const removeExistingImage = (filename) => {
    setExistingImages(prev => prev.filter(f => f !== filename))
    setRemovedImages(prev => [...prev, filename])
  }

  // ── Variant row management ──
  const addVariantRow = () => {
    setVariants(prev => [...prev, {
      _tempId: `tmp_${Date.now()}_${prev.length}`,
      name: '', sku: '', barcode: '', price_kes: '', cost_price_kes: '', stock_qty: '', reorder_point: '',
      sort_order: prev.length,
    }])
  }
  const updateVariantRow = (key, field, value) => {
    setVariants(prev => prev.map(v => (v.id || v._tempId) === key ? { ...v, [field]: value } : v))
  }
  const removeVariantRow = (v) => {
    if (v._existing && v.id) setDeletedVariantIds(prev => [...prev, v.id])
    setVariants(prev => prev.filter(x => (x.id || x._tempId) !== (v.id || v._tempId)))
  }
  const toggleHasVariants = (checked) => {
    setForm(f => ({ ...f, has_variants: checked }))
    if (checked && variants.length === 0) addVariantRow()
  }

  const handleImages = (e) => {
    const files = Array.from(e.target.files)
    setImageFiles(files)
    setImagePreview(files.map(f => URL.createObjectURL(f)))
  }

  const handleSave = async (e) => {
    e.preventDefault()

    // Validate variants before anything is saved
    if (form.has_variants) {
      if (variants.length === 0) { toast.error('Add at least one variant, or turn off "Has Variants"'); return }
      const bad = variants.find(v => !v.name?.trim() || !v.price_kes || Number(v.price_kes) <= 0)
      if (bad) { toast.error('Every variant needs a name and a price greater than 0'); return }
    }

    setSaving(true)
    try {
      // When variants are on, the product's own price/stock become computed fallbacks —
      // never shown to the user, just kept valid for required fields & shop-page display
      const formToSave = { ...form }
      if (form.has_variants) {
        const prices = variants.map(v => Number(v.price_kes) || 0).filter(p => p > 0)
        formToSave.price_kes = prices.length ? Math.min(...prices) : 0
        formToSave.stock_qty = variants.reduce((sum, v) => sum + (Number(v.stock_qty) || 0), 0)
      }

      const data = new FormData()
      Object.entries(formToSave).forEach(([k,v]) => { if (k !== 'images' && v !== undefined && v !== null && v !== '') data.append(k, v) })
      data.append('shop_id', shop.id)
      imageFiles.forEach(f => data.append('images', f))
      removedImages.forEach(filename => data.append('images-', filename))

      let productId = editing?.id
      if (editing) {
        await pb.collection(C.PRODUCTS).update(editing.id, data)
      } else {
        const created = await pb.collection(C.PRODUCTS).create(data)
        productId = created.id
      }

      // Sync variant rows: delete removed, update existing, create new
      if (form.has_variants) {
        for (const delId of deletedVariantIds) {
          try { await pb.collection(C.PRODUCT_VARIANTS).delete(delId) } catch {}
        }
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i]
          const payload = {
            product_id: productId,
            name: v.name.trim(),
            sku: v.sku || '',
            barcode: v.barcode || '',
            price_kes: Number(v.price_kes) || 0,
            cost_price_kes: Number(v.cost_price_kes) || 0,
            stock_qty: Number(v.stock_qty) || 0,
            reorder_point: Number(v.reorder_point) || 0,
            sort_order: i,
          }
          if (v._existing && v.id) {
            await pb.collection(C.PRODUCT_VARIANTS).update(v.id, payload)
          } else {
            await pb.collection(C.PRODUCT_VARIANTS).create(payload)
          }
        }
      } else if (editing) {
        // has_variants was switched off — clean up any leftover variant rows for this product
        try {
          const leftover = await pb.collection(C.PRODUCT_VARIANTS).getList(1, 100, { filter:`product_id="${productId}"`, '$autoCancel': false })
          for (const v of leftover.items) await pb.collection(C.PRODUCT_VARIANTS).delete(v.id)
        } catch {}
      }

      toast.success(editing ? 'Product updated!' : 'Product created!')
      setShowModal(false)
      loadData()
    } catch (err) { toast.error(err?.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return
    try { await pb.collection(C.PRODUCTS).delete(id); toast.success('Deleted'); loadData() }
    catch { toast.error('Delete failed') }
  }

  const duplicateProduct = async (p) => {
    try {
      const { id, created, updated, collectionId, collectionName, expand, images, ...rest } = p
      await pb.collection(C.PRODUCTS).create({
        ...rest,
        name: `Copy of ${p.name}`,
        sku: p.sku ? `${p.sku}-COPY` : '',
        barcode: '',
        stock_qty: 0,
        shop_id: shop.id,
      })
      toast.success(`"${p.name}" duplicated! Edit the copy to update price/size.`)
      loadData()
    } catch { toast.error('Duplicate failed') }
  }

  // ── Bulk import CSV upload ──
  const handleCsvUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setBulkFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const { rows } = parseCsv(ev.target.result)
      setBulkRows(rows)
      const dupes = findDuplicates(rows)
      const validation = rows.map((row, i) => ({
        row: i + 1,
        name: row.name || row.product_name || 'Unnamed',
        errors: [...validateRow(row, categories, i), ...(dupes[i] || [])],
        warnings: [],
      }))
      setBulkValidation(validation)
      setBulkStep(2)
    }
    reader.readAsText(file)
  }

  const handleBulkImport = async () => {
    if (!bulkRows.length) return
    setBulkImporting(true)
    let success = 0, failed = 0, failedNames = []
    for (const row of bulkRows) {
      try {
        // Resolve category — create new one if it doesn't exist
        let catId = ''
        if (row.category) {
          const existing = categories.find(c => c.name.toLowerCase() === row.category.toLowerCase())
          if (existing) {
            catId = existing.id
          } else {
            // Auto-create the new category
            const newCat = await pb.collection(C.CATEGORIES).create({
              shop_id: shop.id,
              name: row.category,
              sort_order: categories.length,
            })
            catId = newCat.id
            // Add to local categories array so next rows can find it
            categories.push(newCat)
            setCategories(prev => [...prev, newCat])
          }
        }
        await pb.collection(C.PRODUCTS).create({
          shop_id: shop.id,
          name: row.name || row.product_name || 'Unnamed',
          sku: row.sku || '',
          barcode: row.barcode || '',
          category_id: catId,
          price_kes: parseFloat(row.price_kes || row.price || 0),
          cost_price_kes: parseFloat(row.cost_price_kes || row.cost || 0),
          compare_price_kes: parseFloat(row.compare_price_kes || 0) || 0,
         stock_qty: parseFloat(row.stock_qty || row.stock || 0),
          reorder_point: parseFloat(row.reorder_point || 5),
          brand: row.brand || '',
          unit: row.unit || 'piece',
          description: row.description || '',
          tags: row.tags || '',
          status: 'active',
          track_inventory: row.track_inventory !== 'false',
          is_taxable: row.is_taxable !== 'false',
        })
        success++
      } catch (err) {
        failed++
        failedNames.push(row.name || row.product_name || 'Unknown')
      }
    }
    setBulkResult({ success, failed, failedNames })
    setBulkStep(3)
    setBulkImporting(false)
    loadData()
  }

  const resetBulk = () => {
    setShowBulk(false)
    setBulkStep(1)
    setBulkFile(null)
    setBulkRows([])
    setBulkValidation([])
    setBulkResult(null)
  }

  const errorCount   = bulkValidation.filter(v => v.errors.some(e => !e.includes('not found'))).length
  const warningCount = [...new Set(bulkRows.filter((_,i) => bulkValidation[i]?.errors.some(e=>e.includes('not found'))).map(r=>r.category))].length

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.barcode?.includes(search) || p.sku?.includes(search) || p.brand?.toLowerCase().includes(search.toLowerCase())
    const matchCat = !filterCat || p.category_id === filterCat
    return matchSearch && matchCat
  })

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
        <div>
          <div className="page-title">Products 📦</div>
          <div className="page-subtitle">{products.length} products · {categories.length} categories</div>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button className="btn-secondary" onClick={() => { setShowBulk(true); setBulkStep(1) }}><Upload size={15}/> Bulk Import</button>
          <button className="btn-secondary" onClick={() => {
            if (isLocked) { toast.error('🔒 Renew your subscription to share the pricelist'); return }
            if (!filtered.length) { toast.error('No products to share'); return }
            const el = document.getElementById('pricelist-capture')
            if (!el) return
            el.style.display = 'block'
            el.style.position = 'fixed'
            el.style.top = '-9999px'
            el.style.left = '-9999px'
            toast.loading('Generating pricelist…', { id: 'pricelist' })
            setTimeout(async () => {
              try {
                const { default: html2canvas } = await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.esm.js')
                const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
                el.style.display = 'none'
                toast.dismiss('pricelist')
                canvas.toBlob((blob) => {
                  if (!blob) { toast.error('Could not generate image'); return }
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'pricelist.png'
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                  toast.success('Pricelist saved! Open your Downloads and share to WhatsApp 📲', { duration: 6000 })
                }, 'image/png')
              } catch (err) {
                el.style.display = 'none'
                toast.dismiss('pricelist')
                toast.error('Could not generate pricelist image')
              }
            }, 100)
          }}>📋 Share Pricelist</button>
          <button
            className={view === 'margin' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setView(v => v === 'table' ? 'margin' : 'table')}
          ><BarChart2 size={15}/> {view === 'margin' ? 'Back to Table' : 'Margin Health'}</button>
          <button className="btn-primary" onClick={openNew}><Plus size={15}/> Add Product</button>
        </div>

        {/* Hidden pricelist card for html2canvas capture */}
        <div id="pricelist-capture" style={{ display:'none', position:'fixed', top:'-9999px', left:'-9999px', width:600, background:'#fff', padding:32, fontFamily:'Nunito,sans-serif', zIndex:-1 }}>
          <div style={{ background:'linear-gradient(135deg,#c8456a,#8b2550)', borderRadius:16, padding:'24px 28px', marginBottom:20, textAlign:'center' }}>
            <div style={{ color:'#fff', fontSize:26, fontWeight:800 }}>{shop?.name || 'Our Shop'}</div>
            <div style={{ color:'rgba(255,255,255,0.8)', fontSize:13, marginTop:4 }}>📋 Pricelist · {new Date().toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' })}</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.slice(0, 20).map(p => (
              <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', background:'#fdf5f7', borderRadius:10, border:'1px solid #f0e4e8' }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:'#1a1a1f' }}>{p.name}</div>
                  {p.brand && <div style={{ fontSize:11, color:'#9b6070' }}>{p.brand}</div>}
                </div>
                <div style={{ fontWeight:800, fontSize:15, color:'#c8456a' }}>KES {Number(p.price_kes).toLocaleString('en-KE')}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign:'center', marginTop:20, fontSize:11, color:'#c8b0b8' }}>Powered by SalesTrack · Run your business from your phone</div>
        </div>
      </div>

      {/* Search + filter */}
      <div className="card" style={{ marginBottom:20, display:'flex', gap:12, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1 }}>
          <Search size={15} style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'#9b6070' }} />
          <input className="input" style={{ paddingLeft:40 }} placeholder="Search by name, barcode, SKU or brand…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ width:180 }} value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Margin Health View */}
      {view === 'margin' && !loading && (
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', fontWeight: 700, marginBottom: 4 }}>Margin Health Dashboard</div>
            <div style={{ fontSize: 13, color: '#9b6070' }}>Products sorted by margin — lowest first. Red = losing money or very low margin. Fix these first.</div>
          </div>
          {(() => {
            const withMargin = filtered
              .filter(p => p.price_kes > 0 && p.cost_price_kes > 0)
              .map(p => ({ ...p, margin: ((p.price_kes - p.cost_price_kes) / p.price_kes) * 100 }))
              .sort((a, b) => a.margin - b.margin)
            const noMargin = filtered.filter(p => !p.cost_price_kes || p.cost_price_kes === 0)
            if (withMargin.length === 0 && noMargin.length === 0) return (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#9b6070' }}>No products with cost prices set. Add cost prices to see margin health.</div>
            )
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {withMargin.map(p => {
                  const pct = Math.round(p.margin)
                  const barColor = pct <= 0 ? '#dc2626' : pct <= 20 ? '#d97706' : pct <= 40 ? '#ca8a04' : '#059669'
                  const bgColor  = pct <= 0 ? '#fee2e2' : pct <= 20 ? '#fef3c7' : pct <= 40 ? '#fefce8' : '#f0fdf4'
                  const cat = categories.find(c => c.id === p.category_id)
                  return (
                    <div key={p.id} style={{ background: bgColor, borderRadius: 12, padding: '14px 16px', border: `1px solid ${barColor}22` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>{cat?.name || '—'} · {fmtKES(p.price_kes)} sell · {fmtKES(p.cost_price_kes)} cost</div>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: 18, color: barColor, marginLeft: 16, flexShrink: 0 }}>{pct}%</div>
                      </div>
                      <div style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, height: '100%', background: barColor, borderRadius: 6, transition: 'width 0.4s ease' }} />
                      </div>
                      {pct <= 0 && <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 6 }}>⚠️ Selling below cost — you lose money on every sale of this item</div>}
                      {pct > 0 && pct <= 20 && <div style={{ fontSize: 11, color: '#d97706', fontWeight: 600, marginTop: 6 }}>Low margin — consider raising price or negotiating cost with supplier</div>}
                    </div>
                  )
                })}
                {noMargin.length > 0 && (
                  <div style={{ background: '#f8f6f2', borderRadius: 12, padding: '14px 16px', border: '1px solid #e5e2db' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#6b7280', marginBottom: 4 }}>📝 {noMargin.length} product{noMargin.length > 1 ? 's' : ''} with no cost price set</div>
                    <div style={{ fontSize: 12, color: '#9b6070' }}>{noMargin.map(p => p.name).join(', ')}</div>
                    <div style={{ fontSize: 11, color: '#9b6070', marginTop: 6 }}>Add cost prices to these products to track their margin.</div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Table */}
      <div className="card" style={{ padding:0, display: view === 'margin' ? 'none' : 'block' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:48 }}><div className="spinner" style={{ margin:'0 auto' }} /></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th><th>Category</th><th>Barcode / SKU</th>
                  <th>Price</th><th>Cost</th><th>Margin</th><th>Stock</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const cat    = categories.find(c => c.id === p.category_id)
                  const margin = p.price_kes && p.cost_price_kes ? (((p.price_kes - p.cost_price_kes) / p.price_kes) * 100).toFixed(0) : null
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight:600, color:'#1a1a1f' }}>{p.name}</div>
                        {p.brand && <div style={{ fontSize:11, color:'#9b6070' }}>{p.brand}</div>}
                      </td>
                      <td><span style={{ fontSize:12, color:'#9b6070' }}>{cat?.name || '—'}</span></td>
                      <td>
                        {p.barcode && <div style={{ fontFamily:'monospace', fontSize:11, background:'#f5edf0', padding:'2px 7px', borderRadius:5, display:'inline-block' }}>{p.barcode}</div>}
                        {p.sku && <div style={{ fontSize:11, color:'#9b6070', marginTop:2 }}>SKU: {p.sku}</div>}
                      </td>
                      <td style={{ fontWeight:600 }}>
                        {p.has_variants ? <>from {fmtKES(p.price_kes)}</> : fmtKES(p.price_kes)}
                      </td>
                      <td style={{ color:'#9b6070' }}>{fmtKES(p.cost_price_kes)}</td>
                      <td>
                        {margin !== null
                          ? <span style={{ background: margin>50?'#f0fdf4':margin>20?'#fefce8':'#fee2e2', color: margin>50?'#059669':margin>20?'#d97706':'#dc2626', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{margin}%</span>
                          : '—'}
                      </td>
                      <td>
                        {p.track_inventory
                          ? <span style={{ fontWeight:700, color: p.stock_qty<=0?'#dc2626':p.stock_qty<=(p.reorder_point||5)?'#d97706':'#059669' }}>{p.stock_qty??0}</span>
                          : <span style={{ color:'#9b6070', fontSize:12 }}>∞</span>}
                      </td>
                      <td>
                        <span style={{ background: p.status==='active'?'#f0fdf4':p.status==='draft'?'#fefce8':'#f5f5f5', color: p.status==='active'?'#059669':p.status==='draft'?'#d97706':'#6b7280', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, textTransform:'capitalize' }}>
                          {p.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <button className="btn-ghost" style={{ padding:'4px 8px' }} title="Edit" onClick={()=>openEdit(p)}><Edit2 size={13}/></button>
                          <button className="btn-ghost" style={{ padding:'4px 8px', color:'#3b82f6' }} title="Duplicate" onClick={()=>duplicateProduct(p)}><Copy size={13}/></button>
                          <button className="btn-ghost" style={{ padding:'4px 8px', color:'#dc2626' }} title="Delete" onClick={()=>handleDelete(p.id)}><Trash2 size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign:'center', padding:'48px 0', color:'#9b6070' }}>
                    {products.length === 0 ? 'No products yet — add your first product or bulk import from CSV' : 'No products match your search'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════ PRODUCT MODAL ═══════════ */}
      {showModal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal" style={{ maxWidth:680 }}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Product' : 'New Product'}</span>
              <button onClick={()=>setShowModal(false)} className="btn-ghost" style={{ padding:8 }}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave}>
                <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="label">Product Name *</label>
                    <input className="input" required value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Cantu Shea Butter Leave-In" />
                  </div>
                  <div>
                    <label className="label">Barcode</label>
                    <input className="input" value={form.barcode} onChange={e=>setForm(f=>({...f,barcode:e.target.value}))} placeholder="Scan or type barcode" />
                  </div>
                  <div>
                    <label className="label">SKU</label>
                    <input className="input" value={form.sku} onChange={e=>setForm(f=>({...f,sku:e.target.value}))} placeholder="Internal code" />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select className="input" value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))}>
                      <option value="">Select category</option>
                      {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Unit</label>
                    <select className="input" value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}>
                      {['piece','ml','g','kg','litre','box','set','dozen','service'].map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  {!form.has_variants && (
                    <div>
                      <label className="label">Selling Price (KES) *</label>
                      <input className="input" type="number" required min={0} step="0.01" value={form.price_kes} onChange={e=>setForm(f=>({...f,price_kes:e.target.value}))} />
                    </div>
                  )}
                  {!form.has_variants && (
                    <div>
                      <label className="label">Cost Price (KES)</label>
                      <input className="input" type="number" min={0} step="0.01" value={form.cost_price_kes} onChange={e=>setForm(f=>({...f,cost_price_kes:e.target.value}))} />
                      {form.price_kes && form.cost_price_kes && (
                        <div style={{ fontSize:11, color:'#059669', marginTop:3 }}>
                          Margin: {(((form.price_kes - form.cost_price_kes) / form.price_kes) * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  )}
                  {!form.has_variants && (
                    <div>
                      <label className="label">Compare Price (KES)</label>
                      <input className="input" type="number" min={0} step="0.01" value={form.compare_price_kes} onChange={e=>setForm(f=>({...f,compare_price_kes:e.target.value}))} placeholder="Crossed-out original price" />
                    </div>
                  )}
                  <div>
                    <label className="label">Brand</label>
                    <input className="input" value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} placeholder="e.g. Cantu, ORS" />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select className="input" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  {!form.has_variants && (
                    <div>
                      <label className="label">Stock Quantity</label>
                      <input className="input" type="number" min={0} step="0.01" value={form.stock_qty} onChange={e=>setForm(f=>({...f,stock_qty:e.target.value}))} />
                    </div>
                  )}
                  {!form.has_variants && (
                    <div>
                      <label className="label">Reorder Point</label>
                      <input className="input" type="number" min={0} step="0.01" value={form.reorder_point} onChange={e=>setForm(f=>({...f,reorder_point:e.target.value}))} />                      <div style={{ fontSize:11, color:'#9b6070', marginTop:3 }}>Alert when stock drops to this level</div>
                    </div>
                  )}
                  <div style={{ gridColumn:'1/-1', display:'flex', gap:20, flexWrap:'wrap' }}>
                    {[{key:'track_inventory',label:'Track Inventory'},{key:'is_service',label:'Is a Service'},{key:'is_taxable',label:'Taxable (VAT)'}].map(({key,label})=>(
                      <label key={key} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, fontWeight:500 }}>
                        <input type="checkbox" checked={!!form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.checked}))} style={{ accentColor:'#c8456a', width:15, height:15 }} />
                        {label}
                      </label>
                    ))}
                    <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, fontWeight:500 }}>
                      <input type="checkbox" checked={!!form.has_variants} onChange={e=>toggleHasVariants(e.target.checked)} style={{ accentColor:'#c8456a', width:15, height:15 }} />
                      Has Variants (size, colour, storage…)
                    </label>
                  </div>

                  {form.has_variants && (
                    <div style={{ gridColumn:'1/-1' }}>
                      <label className="label">Variants *</label>
                      <div style={{ fontSize:11, color:'#9b6070', marginBottom:10 }}>Each variant needs its own name and price. Stock and reorder point are optional.</div>
                      {variantsLoading ? (
                        <div style={{ textAlign:'center', padding:16 }}><div className="spinner" style={{ margin:'0 auto' }} /></div>
                      ) : (
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {variants.map(v => {
                            const key = v.id || v._tempId
                            return (
                              <div key={key} style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr 0.8fr 30px', gap:6, alignItems:'center', background:'#fdf5f7', border:'1px solid #f0e4e8', borderRadius:8, padding:8 }}>
                                <input className="input" style={{ fontSize:12, padding:'6px 8px' }} placeholder="Name (e.g. 128GB / Black)" value={v.name} onChange={e=>updateVariantRow(key,'name',e.target.value)} />
                                <input className="input" style={{ fontSize:12, padding:'6px 8px' }} type="number" min={0} step="0.01" placeholder="Price KES" value={v.price_kes} onChange={e=>updateVariantRow(key,'price_kes',e.target.value)} />
                                <input className="input" style={{ fontSize:12, padding:'6px 8px' }} type="number" min={0} step="0.01" placeholder="Cost KES" value={v.cost_price_kes} onChange={e=>updateVariantRow(key,'cost_price_kes',e.target.value)} />
                                <input className="input" style={{ fontSize:12, padding:'6px 8px' }} type="number" min={0} step="0.01" placeholder="Stock" value={v.stock_qty} onChange={e=>updateVariantRow(key,'stock_qty',e.target.value)} />
                                <button type="button" onClick={()=>removeVariantRow(v)} className="btn-ghost" style={{ padding:4, color:'#dc2626' }} title="Remove variant"><Trash2 size={13}/></button>
                              </div>
                            )
                          })}
                          <button type="button" onClick={addVariantRow} className="btn-secondary" style={{ alignSelf:'flex-start', fontSize:12, padding:'6px 12px' }}>
                            <Plus size={13}/> Add Variant
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="label">Product Images (up to 8)</label>

                    {existingImages.length > 0 && (
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                        {existingImages.map(filename => {
                          const url = `${PB_URL}/api/files/${editing.collectionId}/${editing.id}/${filename}?thumb=200x200`
                          return (
                            <div key={filename} style={{ position:'relative', width:60, height:60 }}>
                              <img src={url} alt="" style={{ width:60, height:60, objectFit:'cover', borderRadius:7, border:'1.5px solid #f0e4e8' }} />
                              <button type="button" onClick={()=>removeExistingImage(filename)}
                                style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:'#dc2626', border:'2px solid #fff', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0 }}>
                                <X size={11}/>
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div onClick={()=>fileInputRef.current?.click()} style={{ border:'2px dashed #e8c0cc', borderRadius:10, padding:'18px', textAlign:'center', cursor:'pointer', background:'#fff5f7' }}>
                      {imagePreview.length > 0
                        ? <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>{imagePreview.map((src,i)=><img key={i} src={src} style={{ width:60, height:60, objectFit:'cover', borderRadius:7 }}/>)}</div>
                        : <div style={{ color:'#9b6070' }}><Upload size={22} style={{ margin:'0 auto 6px', display:'block' }} /><div style={{ fontSize:12 }}>{existingImages.length > 0 ? 'Click to add more images' : 'Click to upload images'} · JPG, PNG, WebP · Max 10MB</div></div>
                      }
                    </div>
                    <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={handleImages} />
                    {existingImages.length + imageFiles.length >= 8 && (
                      <div style={{ fontSize:11, color:'#d97706', marginTop:4 }}>Maximum 8 images reached — remove one to add another.</div>
                    )}
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="label">Tags (comma separated)</label>
                    <input className="input" value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="hair care, moisturizer, leave-in" />
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label className="label">Description</label>
                    <textarea className="input" rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Product description…" style={{ resize:'vertical' }} />
                  </div>
                </div>
                <div style={{ display:'flex', gap:10, marginTop:18, justifyContent:'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={()=>setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>{saving?'Saving…':editing?'💾 Update Product':'✨ Create Product'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ BULK IMPORT MODAL ═══════════ */}
      {showBulk && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&resetBulk()}>
          <div className="modal" style={{ maxWidth:740 }}>
            <div className="modal-header">
              <span className="modal-title">Bulk Import Products</span>
              <button onClick={resetBulk} className="btn-ghost" style={{ padding:8 }}><X size={18}/></button>
            </div>
            <div className="modal-body">

              {/* Step indicator */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, marginBottom:24 }}>
                {['Download Template','Upload & Validate','Import'].map((label, i) => {
                  const s = i + 1
                  const done = bulkStep > s
                  const active = bulkStep === s
                  return (
                    <div key={s} style={{ display:'flex', alignItems:'center' }}>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', background: done?'#059669':active?'linear-gradient(135deg,#c8456a,#8b2550)':'#f0e4e8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color: done||active?'#fff':'#9b6070' }}>
                          {done ? <CheckCircle2 size={14}/> : s}
                        </div>
                        <div style={{ fontSize:10, color: active?'#3d1020':'#9b6070', fontWeight: active?700:400, whiteSpace:'nowrap' }}>{label}</div>
                      </div>
                      {i < 2 && <div style={{ width:60, height:2, background: done?'#059669':'#f0e4e8', margin:'0 6px', marginBottom:16 }} />}
                    </div>
                  )
                })}
              </div>

              {/* ── STEP 1: Download template ── */}
              {bulkStep === 1 && (
                <div>
                  <div style={{ background:'linear-gradient(135deg,#fdf5f7,#fff)', border:'1.5px solid #f0e4e8', borderRadius:14, padding:'20px 24px', marginBottom:18 }}>
                    <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:17, color:'#3d1020', margin:'0 0 8px' }}>Before you start</h3>
                    <p style={{ fontSize:13, color:'#6b4050', lineHeight:1.7, margin:0 }}>
                      Download the template below, fill in your products, then upload. The template includes sample data and instructions to guide you.
                    </p>
                  </div>

                  {/* Steps guide */}
                  <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
                    {[
                      { num:1, title:'Download the template', desc:'Click the button below to get a pre-filled CSV template with instructions and sample rows.' },
                      { num:2, title:'Open in Excel or Google Sheets', desc:'Fill in your product details. Each row = one product. Delete the sample rows before importing.' },
                      { num:3, title:'Match your categories exactly', desc:`Your current categories: ${categories.map(c=>c.name).join(', ') || 'None yet — add categories in Settings first'}` },
                      { num:4, title:'Save as CSV and upload', desc:'File → Save As → CSV (Comma Separated Values). Then come back and upload here.' },
                    ].map(s => (
                      <div key={s.num} style={{ display:'flex', gap:12, padding:'12px 14px', background:'#fdf5f7', borderRadius:10, border:'1px solid #f0e4e8' }}>
                        <div style={{ width:26, height:26, borderRadius:'50%', background:'linear-gradient(135deg,#c8456a,#8b2550)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>{s.num}</div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'#3d1020', marginBottom:2 }}>{s.title}</div>
                          <div style={{ fontSize:12, color:'#9b6070', lineHeight:1.5 }}>{s.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CSV columns reference */}
                  <div style={{ background:'#f8f6f2', borderRadius:10, padding:'14px 16px', marginBottom:20 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'#8b2550', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>CSV Column Reference</div>
                    <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                      {[
                        {col:'name', req:true, desc:'Product name (required)'},
                        {col:'price_kes', req:true, desc:'Selling price in KES (required)'},
                        {col:'cost_price_kes', req:false, desc:'Your buying price (for profit)'},
                        {col:'category', req:false, desc:'Must match your category names'},
                        {col:'stock_qty', req:false, desc:'Current stock on hand'},
                        {col:'reorder_point', req:false, desc:'Alert level (default: 5)'},
                        {col:'barcode', req:false, desc:'Product barcode number'},
                        {col:'sku', req:false, desc:'Your internal product code'},
                        {col:'brand', req:false, desc:'Brand or manufacturer name'},
                        {col:'unit', req:false, desc:'piece/ml/g/kg/litre/box/set'},
                        {col:'compare_price_kes', req:false, desc:'Original crossed-out price'},
                        {col:'description', req:false, desc:'Product description'},
                        {col:'track_inventory', req:false, desc:'true or false'},
                        {col:'is_taxable', req:false, desc:'true or false (VAT)'},
                        {col:'tags', req:false, desc:'Comma-separated tags'},
                      ].map(({col,req,desc}) => (
                        <div key={col} style={{ display:'flex', alignItems:'flex-start', gap:6, fontSize:12 }}>
                          <code style={{ background: req?'#fce8ed':'#f0e4e8', color: req?'#8b2550':'#6b4050', padding:'1px 6px', borderRadius:4, fontSize:11, flexShrink:0 }}>{col}</code>
                          <span style={{ color:'#9b6070' }}>{req && <span style={{ color:'#dc2626', fontWeight:700 }}>* </span>}{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={()=>downloadTemplate(categories)} className="btn-primary" style={{ flex:1, justifyContent:'center' }}>
                      <Download size={15}/> Download Template (CSV)
                    </button>
                    <button onClick={()=>{ csvInputRef.current?.click() }} className="btn-secondary" style={{ flex:1, justifyContent:'center' }}>
                      <Upload size={15}/> Skip — Upload My Own CSV
                    </button>
                  </div>
                  <input ref={csvInputRef} type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={handleCsvUpload} />
                  
                  {/* Paste from Excel / Google Sheets */}
                  <div style={{ marginTop:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <div style={{ flex:1, height:1, background:'#f0e4e8' }} />
                      <span style={{ fontSize:12, color:'#9b6070', fontWeight:600 }}>OR PASTE FROM EXCEL / GOOGLE SHEETS</span>
                      <div style={{ flex:1, height:1, background:'#f0e4e8' }} />
                    </div>
                    <textarea
                      placeholder={`Paste your data here directly from Excel or Google Sheets.\n\nFirst row must be headers:\nname, category, price_kes, cost_price_kes, stock_qty, reorder_point, barcode, sku, brand, unit, description\n\nThen paste your product rows below the headers.`}
                      style={{
                        width:'100%', minHeight:140, padding:'12px 14px',
                        border:'1.5px solid #f0e4e8', borderRadius:10,
                        fontSize:12, fontFamily:'monospace', color:'#3d1020',
                        background:'#fdf5f7', resize:'vertical', outline:'none',
                        boxSizing:'border-box', lineHeight:1.6,
                      }}
                      onChange={e => {
                        const text = e.target.value.trim()
                        if (!text) return
                        // Convert tab-separated (Excel paste) to comma-separated
                        const normalized = text.split('\n').map(line => {
                          // If line has tabs, it's from Excel — convert to CSV
                          if (line.includes('\t')) {
                            return line.split('\t').map(cell => {
                              const c = cell.trim()
                              return c.includes(',') ? `"${c}"` : c
                            }).join(',')
                          }
                          return line
                        }).join('\n')
                        const { rows } = parseCsv(normalized)
                        if (rows.length > 0) {
                          setBulkRows(rows)
                          const dupes = findDuplicates(rows)
                          const validation = rows.map((row, i) => ({
                            row: i + 1,
                            name: row.name || row.product_name || 'Unnamed',
                            errors: [...validateRow(row, categories, i), ...(dupes[i] || [])],
                            warnings: [],
                          }))
                          setBulkValidation(validation)
                          setBulkFile({ name: 'Pasted data' })
                          setBulkStep(2)
                        }
                      }}
                    />
                    <p style={{ fontSize:11, color:'#9b6070', marginTop:4 }}>
                      Supports paste from Excel, Google Sheets or any spreadsheet. Tab-separated and comma-separated both work.
                    </p>
                  </div>
                </div>
              )}

              {/* ── STEP 2: Validate ── */}
              {bulkStep === 2 && (
                <div>
                  {/* Summary */}
                  <div className="stat-grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:18 }}>
                    <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                      <div style={{ fontSize:24, fontWeight:700, color:'#059669' }}>{bulkRows.length}</div>
                      <div style={{ fontSize:12, color:'#059669' }}>Products ready</div>
                    </div>
                    <div style={{ background: errorCount>0?'#fee2e2':'#f0fdf4', border:`1px solid ${errorCount>0?'#fca5a5':'#bbf7d0'}`, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                      <div style={{ fontSize:24, fontWeight:700, color: errorCount>0?'#dc2626':'#059669' }}>{errorCount}</div>
                      <div style={{ fontSize:12, color: errorCount>0?'#dc2626':'#059669' }}>Errors</div>
                    </div>
                    <div style={{ background: warningCount>0?'#fefce8':'#f0fdf4', border:`1px solid ${warningCount>0?'#fde68a':'#bbf7d0'}`, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                      <div style={{ fontSize:24, fontWeight:700, color: warningCount>0?'#d97706':'#059669' }}>{warningCount}</div>
                      <div style={{ fontSize:12, color: warningCount>0?'#d97706':'#059669' }}>Warnings</div>
                    </div>
                  </div>

                  {errorCount > 0 && (
                    <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'12px 14px', marginBottom:14, fontSize:13, color:'#991b1b' }}>
                      <strong>⚠️ {errorCount} row{errorCount>1?'s':''} have errors</strong> and will be skipped. Fix them in your CSV and re-upload, or proceed to import the valid rows only.
                    </div>
                  )}
                  {warningCount > 0 && (
                    <div style={{ background:'#fefce8', border:'1px solid #fde68a', borderRadius:10, padding:'12px 14px', marginBottom:14, fontSize:13, color:'#92400e' }}>
                      <strong>✨ {warningCount} new categor{warningCount>1?'ies':'y'} will be created automatically</strong> — these categories don't exist yet but will be added to your system during import.
                      <div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:5 }}>
                        {[...new Set(bulkRows.filter((_,i) => bulkValidation[i]?.errors.some(e=>e.includes('not found'))).map(r=>r.category))].map(cat => (
                          <span key={cat} style={{ background:'#fde68a', color:'#92400e', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>
                            + {cat}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Preview table */}
                  <div style={{ fontSize:12, fontWeight:700, color:'#3d1020', marginBottom:8 }}>
                    Preview — {bulkRows.length} products from {bulkFile?.name}
                  </div>
                  <div className="table-wrap" style={{ maxHeight:260, overflowY:'auto', marginBottom:16, borderRadius:10, border:'1px solid #f0e4e8' }}>
                    <table>
                      <thead>
                        <tr><th></th><th>Name</th><th>Category</th><th>Price</th><th>Cost</th><th>Stock</th><th>Barcode</th></tr>
                      </thead>
                      <tbody>
                        {bulkValidation.map((v, i) => {
                          const hasError = v.errors.some(e => !e.includes('not found'))
                          const hasWarning = v.errors.some(e => e.includes('not found'))
                          const row = bulkRows[i]
                          return (
                            <tr key={i} style={{ background: hasError?'#fff5f5':hasWarning?'#fffbeb':'#fff' }}>
                              <td style={{ width:28 }}>
                                {hasError
                                  ? <AlertCircle size={14} color="#dc2626"/>
                                  : hasWarning
                                    ? <AlertCircle size={14} color="#d97706"/>
                                    : <CheckCircle2 size={14} color="#059669"/>
                                }
                              </td>
                              <td>
                                <div style={{ fontSize:12, fontWeight:600 }}>{v.name}</div>
                                {v.errors.length > 0 && <div style={{ fontSize:10, color: hasError?'#dc2626':'#d97706', marginTop:1 }}>{v.errors.join(' · ')}</div>}
                              </td>
                              <td style={{ fontSize:12 }}>
                                {row.category
                                  ? categories.find(c=>c.name.toLowerCase()===row.category.toLowerCase())
                                    ? row.category
                                    : <span>{row.category} <span style={{ fontSize:9, fontWeight:700, color:'#d97706', background:'#fef3c7', padding:'1px 5px', borderRadius:8 }}>NEW</span></span>
                                  : '—'}
                              </td>
                              <td style={{ fontSize:12 }}>KES {row.price_kes||row.price||'0'}</td>
                              <td style={{ fontSize:12, color:'#9b6070' }}>KES {row.cost_price_kes||row.cost||'0'}</td>
                              <td style={{ fontSize:12 }}>{row.stock_qty||row.stock||'0'}</td>
                              <td style={{ fontSize:11, fontFamily:'monospace', color:'#9b6070' }}>{row.barcode||'—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display:'flex', gap:10 }}>
                    <button onClick={()=>{ setBulkStep(1); setBulkFile(null); setBulkRows([]); setBulkValidation([]) }} className="btn-secondary" style={{ flex:1, justifyContent:'center' }}>
                      ← Re-upload CSV
                    </button>
                    <button
                      onClick={handleBulkImport}
                      disabled={bulkImporting || bulkRows.filter((_,i) => !bulkValidation[i]?.errors.some(e=>!e.includes('not found'))).length === 0}
                      className="btn-primary"
                      style={{ flex:2, justifyContent:'center' }}
                    >
                      {bulkImporting
                        ? <><div style={{ width:14,height:14,border:'2px solid rgba(255,255,255,0.3)',borderTop:'2px solid #fff',borderRadius:'50%',animation:'spin 0.7s linear infinite' }}/> Importing…</>
                        : `🚀 Import ${bulkRows.length - errorCount} Products`
                      }
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Result ── */}
              {bulkStep === 3 && bulkResult && (
                <div style={{ textAlign:'center', padding:'20px 0' }}>
                  <div style={{ fontSize:56, marginBottom:12 }}>{bulkResult.failed === 0 ? '🎉' : '✅'}</div>
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:22, color:'#3d1020', margin:'0 0 8px' }}>
                    Import complete!
                  </h3>
                  <div style={{ display:'flex', gap:14, justifyContent:'center', margin:'20px 0' }}>
                    <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'16px 24px', textAlign:'center' }}>
                      <div style={{ fontSize:32, fontWeight:700, color:'#059669' }}>{bulkResult.success}</div>
                      <div style={{ fontSize:13, color:'#059669', fontWeight:600 }}>Products imported</div>
                    </div>
                    {bulkResult.failed > 0 && (
                      <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:12, padding:'16px 24px', textAlign:'center' }}>
                        <div style={{ fontSize:32, fontWeight:700, color:'#dc2626' }}>{bulkResult.failed}</div>
                        <div style={{ fontSize:13, color:'#dc2626', fontWeight:600 }}>Failed</div>
                      </div>
                    )}
                  </div>
                  {bulkResult.failed > 0 && (
                    <div style={{ background:'#fef2f2', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:12, color:'#991b1b', textAlign:'left' }}>
                      <strong>Failed products:</strong> {bulkResult.failedNames.join(', ')}
                    </div>
                  )}
                  <p style={{ fontSize:13, color:'#9b6070', marginBottom:20 }}>
                    Your products are now live in the system. You can find them in the Products list and they're ready to sell on the POS.
                  </p>
                  <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                    <button onClick={resetBulk} className="btn-primary">
                      View Products <ChevronRight size={14}/>
                    </button>
                    {bulkResult.failed > 0 && (
                      <button onClick={()=>{ setBulkStep(1); setBulkFile(null); setBulkRows([]); setBulkValidation([]); setBulkResult(null) }} className="btn-secondary">
                        Import more
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}