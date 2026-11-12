import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate } from '../lib/utils'
import { Plus, X, Edit2, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { format, startOfMonth, endOfMonth, startOfWeek, subMonths, subDays, differenceInCalendarDays, parseISO, isValid, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns'

const EMPTY = { description: '', category_id: '', amount_kes: '', expense_date: format(new Date(), 'yyyy-MM-dd'), payment_method: 'cash', reference: '', notes: '' }

export default function ExpensesPage() {
  const { shop, loading: authLoading, isLocked } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [receiptFile, setReceiptFile] = useState(null)
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('💼')
  const fileRef = useRef()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [minAmt, setMinAmt] = useState('')
  const [maxAmt, setMaxAmt] = useState('')
  const [receiptFilter, setReceiptFilter] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')
  const [prevTotal, setPrevTotal] = useState(null)
  const [activePreset, setActivePreset] = useState('month')
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 640px)').matches : false)

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, dateFrom, dateTo])

  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia('(max-width: 640px)')
    const on = () => setIsMobile(mq.matches)
    on()
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener(on)
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else mq.removeListener(on) }
  }, [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { setShowModal(false); setShowCatModal(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const loadSeq = useRef(0)
  const catBusyRef = useRef(false)

  const loadAllExpenses = async () => {
    const perPage = 200
    let all = []
    const day = e => String(e.expense_date || '').slice(0, 10)
    const a = parseISO(dateFrom)
    const b = parseISO(dateTo)
    
    for (let page = 1; page <= 50; page++) {
      const r = await pb.collection(C.EXPENSES).getList(page, perPage, { filter: `shop_id="${shop.id}"`, sort: '-expense_date', expand: 'category_id,created_by' })
      all = all.concat(r.items)
      
      if (r.items.length < perPage) break
    }
    
    const rows = all.filter(e => day(e) >= dateFrom && day(e) <= dateTo)
    
    
    let prevTotal = null
    if (isValid(a) && isValid(b) && b >= a) {
      const days = differenceInCalendarDays(b, a) + 1
      const pTo = format(subDays(a, 1), 'yyyy-MM-dd')
      const pFrom = format(subDays(a, days), 'yyyy-MM-dd')
      prevTotal = all.filter(e => day(e) >= pFrom && day(e) <= pTo).reduce((s, e) => s + (Number(e.amount_kes) || 0), 0)
    }
    return { rows, prevTotal }
  }

  const loadData = async () => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const [loaded, cats] = await Promise.all([
        loadAllExpenses(),
        pb.collection(C.EXPENSE_CATS).getList(1, 200, { filter: `shop_id="${shop.id}"`, sort: 'name' }).then(r => r.items)
      ])
      if (seq !== loadSeq.current) return
      setExpenses(loaded.rows)
      setPrevTotal(loaded.prevTotal)
      setCategories(cats)
    } catch (err) {
      if (seq === loadSeq.current) toast.error('Could not load expenses. Check your connection and try again.')
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }

  const openNew = () => { setEditing(null); setForm(EMPTY); setReceiptFile(null); setShowModal(true) }
  const openRepeat = (exp) => {
    if (isLocked) return toast.error('Account locked - renew your subscription to record new expenses', { duration: 6000 })
    setEditing(null)
    setForm({
      description: exp.description || '',
      category_id: exp.category_id || '',
      amount_kes: exp.amount_kes ?? '',
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      payment_method: exp.payment_method || 'cash',
      reference: '',
      notes: ''
    })
    setReceiptFile(null)
    setShowModal(true)
  }
  const openEdit = (exp) => {
    setEditing(exp)
    setForm({
      description: exp.description || '',
      category_id: exp.category_id || '',
      amount_kes: exp.amount_kes ?? '',
      expense_date: String(exp.expense_date || '').slice(0, 10) || format(new Date(), 'yyyy-MM-dd'),
      payment_method: exp.payment_method || 'cash',
      reference: exp.reference || '',
      notes: exp.notes || ''
    })
    setReceiptFile(null)
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!editing && isLocked) return toast.error('🔒 Account locked — renew your subscription to record new expenses', { duration: 6000 })
    setSaving(true)
    try {
      const data = new FormData()
      const FIELDS = ['description', 'category_id', 'amount_kes', 'expense_date', 'payment_method', 'reference', 'notes']
      FIELDS.forEach(k => {
        const v = form[k]
        if (v === undefined || v === null) return
        if (v === '' && !editing) return
        data.append(k, v)
      })
      if (!editing) {
        data.append('shop_id', shop.id)
        data.append('created_by', pb.authStore.model?.id)
      }
      if (receiptFile) data.append('receipt_file', receiptFile)

      if (editing) {
        await pb.collection(C.EXPENSES).update(editing.id, data)
        toast.success('Expense updated')
      } else {
        await pb.collection(C.EXPENSES).create(data)
        toast.success('Expense recorded')
      }
      setShowModal(false)
      loadData()
    } catch (err) { toast.error(err?.message || 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this expense?')) return
    try { await pb.collection(C.EXPENSES).delete(id); toast.success('Deleted'); loadData() }
    catch { toast.error('Delete failed') }
  }

  const handleAddCategory = async () => {
    if (!newCatName.trim() || catBusyRef.current) return
    catBusyRef.current = true
    try {
      await pb.collection(C.EXPENSE_CATS).create({ shop_id: shop.id, name: newCatName.trim(), icon: newCatIcon })
      setNewCatName('')
      toast.success('Category added')
      loadData()
      setShowCatModal(false)
    } catch (err) { toast.error(err?.message ? 'Could not add category: ' + err.message : 'Could not add category') } finally { catBusyRef.current = false }
  }

  const handleSaveBudget = async (cat, el) => {
    const raw = String(el.value).trim()
    const before = Number(cat.monthly_budget_kes) || 0
    const n = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(n) || n < 0) { toast.error('Budget must be a number, 0 or more'); el.value = before || ''; return }
    if (n === before) return
    try {
      const rec = await pb.collection(C.EXPENSE_CATS).update(cat.id, { monthly_budget_kes: n })
      setCategories(cs => cs.map(c => c.id === cat.id ? { ...c, monthly_budget_kes: rec.monthly_budget_kes } : c))
      toast.success(n > 0 ? 'Budget saved' : 'Budget removed')
    } catch { toast.error('Could not save budget. Try again.'); el.value = before || '' }
  }

  const handleDeleteCategory = async (cat) => {
    if (!confirm(`Delete category "${cat.name}"?`)) return
    try { await pb.collection(C.EXPENSE_CATS).delete(cat.id); toast.success('Category deleted'); loadData() }
    catch { toast.error('Could not delete. The category may still be used by expenses.') }
  }

  // Group by category for summary
  const catSummaryOf = (list) => categories.map(cat => ({
    ...cat,
    total: list.filter(e => e.category_id === cat.id).reduce((s, e) => s + (Number(e.amount_kes) || 0), 0)
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  const periodTotal = expenses.reduce((s, e) => s + (Number(e.amount_kes) || 0), 0)

  const byMethodOf = (list) => list.reduce((m, e) => { const k = e.payment_method || 'other'; m[k] = (m[k] || 0) + (Number(e.amount_kes) || 0); return m }, {})
  const q = search.trim().toLowerCase()
  const minN = minAmt !== '' && Number.isFinite(Number(minAmt)) ? Number(minAmt) : null
  const maxN = maxAmt !== '' && Number.isFinite(Number(maxAmt)) ? Number(maxAmt) : null
  const filteredRows = expenses.filter(e =>
    (!catFilter || (catFilter === 'none' ? !e.category_id : e.category_id === catFilter)) &&
    (!q || `${e.description || ''} ${e.reference || ''} ${e.notes || ''}`.toLowerCase().includes(q)) &&
    (!methodFilter || (e.payment_method || 'other') === methodFilter) &&
    (minN === null || (Number(e.amount_kes) || 0) >= minN) &&
    (maxN === null || (Number(e.amount_kes) || 0) <= maxN) &&
    (!receiptFilter || (receiptFilter === 'with' ? !!e.receipt_file : !e.receipt_file)))
  const sortRows = (rows) => {
    const r = rows.slice()
    const d = e => String(e.expense_date || '').slice(0, 10)
    const a = e => Number(e.amount_kes) || 0
    if (sortBy === 'date_asc') r.sort((x, y) => d(x).localeCompare(d(y)))
    else if (sortBy === 'amount_desc') r.sort((x, y) => a(y) - a(x))
    else if (sortBy === 'amount_asc') r.sort((x, y) => a(x) - a(y))
    else if (sortBy === 'category') r.sort((x, y) => String(x.expand?.category_id?.name || 'zzz').localeCompare(String(y.expand?.category_id?.name || 'zzz')))
    return r
  }
  const visible = sortRows(filteredRows)
  const totalExpenses = visible.reduce((s, e) => s + (Number(e.amount_kes) || 0), 0)
  const catSummary = catSummaryOf(visible)
  const byMethod = byMethodOf(visible)
  const filtersOn = !!(q || catFilter || methodFilter || minN !== null || maxN !== null || receiptFilter)
  const changePct = prevTotal > 0 ? ((periodTotal - prevTotal) / prevTotal) * 100 : null
  const visibleTotal = visible.reduce((s, e) => s + (Number(e.amount_kes) || 0), 0)
  const emptyMsg = loading ? 'Loading...' : expenses.length > 0 ? 'No expenses match your filters' : 'No expenses recorded in this period'

  const setPreset = (p) => {
    setActivePreset(p)
    const now = new Date()
    const f = d => format(d, 'yyyy-MM-dd')
    if (p === 'today') { setDateFrom(f(now)); setDateTo(f(now)) }
    else if (p === 'week') { setDateFrom(f(startOfWeek(now, { weekStartsOn: 1 }))); setDateTo(f(now)) }
    else if (p === 'month') { setDateFrom(f(startOfMonth(now))); setDateTo(f(endOfMonth(now))) }
    else if (p === 'last') { const l = subMonths(now, 1); setDateFrom(f(startOfMonth(l))); setDateTo(f(endOfMonth(l))) }
    else if (p === '7d') { setDateFrom(f(subDays(now, 6))); setDateTo(f(now)) }
    else if (p === '30d') { setDateFrom(f(subDays(now, 29))); setDateTo(f(now)) }
    else if (p === 'quarter') { setDateFrom(f(startOfQuarter(now))); setDateTo(f(endOfQuarter(now))) }
    else if (p === 'year') { setDateFrom(f(startOfYear(now))); setDateTo(f(endOfYear(now))) }
  }

  const receiptUrl = (exp) => {
    try { return pb.files?.getUrl ? pb.files.getUrl(exp, exp.receipt_file) : pb.getFileUrl(exp, exp.receipt_file) }
    catch { return '#' }
  }

  const exportCsv = () => {
    const esc = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' }
    const head = ['Date', 'Description', 'Category', 'Payment', 'Amount (KES)', 'Reference', 'Notes']
    const lines = [head.map(esc).join(',')].concat(visible.map(e => [
      String(e.expense_date || '').slice(0, 10), e.description, e.expand?.category_id?.name || 'Uncategorized',
      e.payment_method, e.amount_kes, e.reference, e.notes
    ].map(esc).join(',')))
    const bRows = budgetExportRows()
    const num = v => '"' + v + '"'
    if (bRows.length) {
      lines.push('', esc('Budget vs Actual (all expenses in period)'), ['Category', 'Budget (KES)', 'Actual (KES)', 'Remaining (KES)', 'Used %'].map(esc).join(','))
      bRows.forEach(b => lines.push([esc(b.name), num(b.budget), num(b.actual), num(b.diff), num(b.pct)].join(',')))
    }
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses_${dateFrom}_to_${dateTo}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  const exportRows = () => visible.map(e => ({
    date: String(e.expense_date || '').slice(0, 10),
    description: e.description || '',
    category: e.expand?.category_id?.name || 'Uncategorized',
    payment: e.payment_method || '',
    amount: Number(e.amount_kes) || 0,
    reference: e.reference || '',
    notes: e.notes || ''
  }))
  const htmlEsc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const safeText = v => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) ? "'" + s : s }

  const exportExcel = () => {
    const rows = exportRows()
    if (!rows.length) return
    const th = ['Date', 'Description', 'Category', 'Payment', 'Amount (KES)', 'Reference', 'Notes'].map(h => '<th>' + htmlEsc(h) + '</th>').join('')
    const tr = rows.map(r => '<tr><td>' + htmlEsc(r.date) + '</td><td>' + htmlEsc(safeText(r.description)) + '</td><td>' + htmlEsc(safeText(r.category)) + '</td><td>' + htmlEsc(r.payment) + '</td><td>' + r.amount + '</td><td>' + htmlEsc(safeText(r.reference)) + '</td><td>' + htmlEsc(safeText(r.notes)) + '</td></tr>').join('')
    const total = '<tr><td></td><td><b>Total</b></td><td></td><td></td><td><b>' + visibleTotal + '</b></td><td></td><td></td></tr>'
    const bRows = budgetExportRows()
    const bHtml = bRows.length ? '<br><table border="1"><thead><tr><th>Category</th><th>Budget (KES)</th><th>Actual (KES)</th><th>Remaining (KES)</th><th>Used %</th></tr></thead><tbody>' + bRows.map(b => '<tr><td>' + htmlEsc(safeText(b.name)) + '</td><td>' + b.budget + '</td><td>' + b.actual + '</td><td>' + b.diff + '</td><td>' + b.pct + '</td></tr>').join('') + '</tbody></table>' : ''
    const html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><thead><tr>' + th + '</tr></thead><tbody>' + tr + total + '</tbody></table>' + bHtml + '</body></html>'
    const blob = new Blob(['\uFEFF' + html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses_${dateFrom}_to_${dateTo}.xls`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    const rows = exportRows()
    if (!rows.length) return
    const w = window.open('', '_blank')
    if (!w) { toast.error('Allow pop-ups for this site to export PDF, then try again'); return }
    const tr = rows.map(r => '<tr><td>' + htmlEsc(r.date) + '</td><td>' + htmlEsc(r.description) + '</td><td>' + htmlEsc(r.category) + '</td><td>' + htmlEsc(r.payment) + '</td><td class="num">' + htmlEsc(fmtKES(r.amount)) + '</td><td>' + htmlEsc(r.reference) + '</td></tr>').join('')
    const filterNote = visible.length !== expenses.length ? '<p>Filtered: ' + visible.length + ' of ' + expenses.length + ' entries</p>' : ''
    const bRows = budgetExportRows()
    const bPdf = bRows.length ? '<h2 style="font-size:14px;margin:18px 0 6px">Budget vs Actual (all expenses in period)</h2><table><thead><tr><th>Category</th><th>Budget</th><th>Actual</th><th>Remaining</th><th>Used</th></tr></thead><tbody>' + bRows.map(b => '<tr><td>' + htmlEsc(b.name) + '</td><td class="num">' + htmlEsc(fmtKES(b.budget)) + '</td><td class="num">' + htmlEsc(fmtKES(b.actual)) + '</td><td class="num">' + htmlEsc(fmtKES(b.diff)) + '</td><td class="num">' + b.pct + '%</td></tr>').join('') + '</tbody></table>' : ''
    const css = 'body{font-family:Arial,sans-serif;padding:24px;color:#222}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 10px;font-size:12px;color:#555}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f3e6ea}td.num{text-align:right}tfoot td{font-weight:bold}'
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Expenses</title><style>' + css + '</style></head><body><h1>' + htmlEsc(shop?.name || '') + ' - Expenses</h1><p>Period: ' + htmlEsc(dateFrom) + ' to ' + htmlEsc(dateTo) + '</p>' + filterNote + '<table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Payment</th><th>Amount</th><th>Reference</th></tr></thead><tbody>' + tr + '</tbody><tfoot><tr><td colspan="4">Total</td><td class="num">' + htmlEsc(fmtKES(visibleTotal)) + '</td><td></td></tr></tfoot></table>' + bPdf + '</body></html>')
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 300)
  }
  const uncategorized = visible.filter(e => !e.category_id).reduce((s, e) => s + e.amount_kes, 0)

  const budgetsActive = isValid(parseISO(dateFrom)) && isValid(parseISO(dateTo)) && dateFrom <= dateTo && String(dateFrom).slice(0, 7) === String(dateTo).slice(0, 7)
  const fullMonth = budgetsActive && dateFrom === format(startOfMonth(parseISO(dateFrom)), 'yyyy-MM-dd') && dateTo === format(endOfMonth(parseISO(dateFrom)), 'yyyy-MM-dd')
  const wholeMonths = isValid(parseISO(dateFrom)) && isValid(parseISO(dateTo)) && dateFrom <= dateTo && dateFrom === format(startOfMonth(parseISO(dateFrom)), 'yyyy-MM-dd') && dateTo === format(endOfMonth(parseISO(dateTo)), 'yyyy-MM-dd')
  const budgetMonths = wholeMonths ? (parseISO(dateTo).getFullYear() - parseISO(dateFrom).getFullYear()) * 12 + parseISO(dateTo).getMonth() - parseISO(dateFrom).getMonth() + 1 : 0
  const budgetsShown = budgetsActive || wholeMonths
  const anyBudget = categories.some(c => Number(c.monthly_budget_kes) > 0)
  const budgetInfo = (cat) => {
    const budget = (Number(cat.monthly_budget_kes) || 0) * (budgetMonths > 1 ? budgetMonths : 1)
    if (!budgetsShown || budget <= 0 || filtersOn) return null
    const pct = (cat.total / budget) * 100
    const now = new Date()
    const inThisMonth = fullMonth && dateFrom.slice(0, 7) === format(now, 'yyyy-MM')
    const projected = inThisMonth && now.getDate() >= 5 ? (cat.total / now.getDate()) * endOfMonth(now).getDate() : null
    return { budget, pct, projected, color: pct > 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#059669', bar: pct > 100 ? '#dc2626' : pct >= 80 ? '#d97706' : 'linear-gradient(90deg,#c8456a,#8b2550)' }
  }

  const budgetExportRows = () => {
    if (!wholeMonths) return []
    const m = budgetMonths > 0 ? budgetMonths : 1
    return categories.filter(c => Number(c.monthly_budget_kes) > 0).map(c => {
      const budget = Number(c.monthly_budget_kes) * m
      const actual = expenses.filter(e => e.category_id === c.id).reduce((s, e) => s + (Number(e.amount_kes) || 0), 0)
      return { name: c.name, budget, actual, diff: budget - actual, pct: Math.round((actual / budget) * 100) }
    })
  }

  const DEFAULT_CATS = [
    { icon: '👤', name: 'Salaries & Wages' }, { icon: '💡', name: 'Electricity' },
    { icon: '💧', name: 'Water' }, { icon: '🚗', name: 'Transport' },
    { icon: '🏠', name: 'Rent' }, { icon: '📦', name: 'Packaging' },
    { icon: '📱', name: 'Airtime & Data' }, { icon: '🛠️', name: 'Repairs & Maintenance' },
    { icon: '📢', name: 'Marketing & Ads' }, { icon: '🧹', name: 'Cleaning' },
    { icon: '🏥', name: 'Medical' }, { icon: '📚', name: 'Training' },
  ]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Expenses 💸</div>
          <div className="page-subtitle">{visible.length} {visible.length === 1 ? 'entry' : 'entries'} · {fmtKES(totalExpenses)} total{filtersOn ? ' (filtered)' : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => setShowCatModal(true)}>⚙️ Categories</button>
          <button className="btn-primary" onClick={openNew} disabled={isLocked} title={isLocked ? 'Account locked — renew to add expenses' : ''}>
            {isLocked ? '🔒 Locked' : <><Plus size={16} /> Add Expense</>}
          </button>
        </div>
      </div>

      {/* Date filter */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="expenses-filter-grid" style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <div>
            <label className="label" htmlFor="exp-from">From</label>
            <input id="exp-from" className="input" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setActivePreset('') }} />
          </div>
          <div>
            <label className="label" htmlFor="exp-to">To</label>
            <input id="exp-to" className="input" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setActivePreset('') }} />
          </div>
          <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 24, fontWeight: 700, color: '#dc2626', marginLeft: 'auto', alignSelf: 'center' }}>
            Total: {fmtKES(totalExpenses)}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['last', 'Last month'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['quarter', 'This quarter'], ['year', 'This year']].map(([k, l]) => (
            <button key={k} type="button" className="btn-secondary" aria-pressed={activePreset === k} style={{ padding: '5px 12px', fontSize: 12, ...(activePreset === k ? { background: 'linear-gradient(135deg,#c8456a,#8b2550)', color: '#fff', borderColor: 'transparent' } : {}) }} onClick={() => setPreset(k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#3d1020', marginBottom: 8 }}>
          {Object.entries(byMethod).map(([m, v]) => (
            <span key={m}><strong style={{ textTransform: 'capitalize' }}>{m}</strong>: {fmtKES(v)}</span>
          ))}
        </div>
        {byMethod.cash > 0 && (
          <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 8 }}>
            Cash expenses of {fmtKES(byMethod.cash)} reduce Expected Cash on the Cash Reconciliation page for the days they were paid.
          </div>
        )}
        {prevTotal !== null && (
          <div style={{ fontSize: 13, color: '#3d1020', marginBottom: 12 }}>
            Previous period (same length, all expenses): {fmtKES(prevTotal)}
            {changePct !== null && <span style={{ fontWeight: 700, color: changePct > 0 ? '#dc2626' : '#059669' }}> ({changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%)</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Search description, reference or notes" aria-label="Search expenses" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="input" style={{ width: 'auto' }} aria-label="Filter by category" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">All categories</option>
            <option value="none">Uncategorized</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <button type="button" className="btn-secondary" onClick={exportCsv} disabled={visible.length === 0}>Export CSV</button>
          <button type="button" className="btn-secondary" onClick={exportExcel} disabled={visible.length === 0}>Export Excel</button>
          <button type="button" className="btn-secondary" onClick={exportPdf} disabled={visible.length === 0}>Export PDF</button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginTop: 12 }}>
          <div>
            <label className="label" htmlFor="exp-f-method">Payment</label>
            <select id="exp-f-method" className="input" style={{ width: 'auto' }} value={methodFilter} onChange={e => setMethodFilter(e.target.value)}>
              <option value="">All methods</option>
              <option value="cash">Cash</option>
              <option value="mpesa">M-Pesa</option>
              <option value="bank">Bank</option>
              <option value="card">Card</option>
              <option value="other">Not set</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="exp-f-min">Min KES</label>
            <input id="exp-f-min" className="input" type="number" min="0" style={{ width: 100 }} value={minAmt} onChange={e => setMinAmt(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="exp-f-max">Max KES</label>
            <input id="exp-f-max" className="input" type="number" min="0" style={{ width: 100 }} value={maxAmt} onChange={e => setMaxAmt(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="exp-f-rcpt">Receipt</label>
            <select id="exp-f-rcpt" className="input" style={{ width: 'auto' }} value={receiptFilter} onChange={e => setReceiptFilter(e.target.value)}>
              <option value="">Any</option>
              <option value="with">With receipt</option>
              <option value="without">No receipt</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="exp-f-sort">Sort by</label>
            <select id="exp-f-sort" className="input" style={{ width: 'auto' }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="amount_desc">Amount, high to low</option>
              <option value="amount_asc">Amount, low to high</option>
              <option value="category">Category</option>
            </select>
          </div>
          {(filtersOn || sortBy !== 'date_desc') && (
            <button type="button" className="btn-secondary" onClick={() => { setSearch(''); setCatFilter(''); setMethodFilter(''); setMinAmt(''); setMaxAmt(''); setReceiptFilter(''); setSortBy('date_desc') }}>Clear filters</button>
          )}
        </div>
        {visible.length !== expenses.length && (
          <div style={{ fontSize: 12, color: '#9b6070', marginTop: 8 }}>Showing {visible.length} of {expenses.length} entries - filtered total {fmtKES(visibleTotal)}</div>
        )}
      </div>

      <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Expenses table */}
        <div className="card" style={{ padding: 0, minWidth: 0 }}>
          {isMobile && (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map(exp => (
                <div key={exp.id} style={{ border: '1px solid #f0e4e8', borderRadius: 12, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{exp.description}</div>
                    <div style={{ fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>{fmtKES(exp.amount_kes)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#9b6070', marginTop: 4 }}>
                    {fmtDate(exp.expense_date)} | {exp.expand?.category_id ? `${exp.expand.category_id.icon} ${exp.expand.category_id.name}` : 'Uncategorized'} | {exp.payment_method}
                  </div>
                  {exp.reference && <div style={{ fontSize: 11, color: '#9b6070', marginTop: 2 }}>Ref: {exp.reference}</div>}
                  {exp.receipt_file && <a href={receiptUrl(exp)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#3b82f6', display: 'inline-block', marginTop: 4 }}>Receipt attached</a>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => openRepeat(exp)}>Repeat</button>
                    <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => openEdit(exp)}>Edit</button>
                    <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12, color: '#dc2626' }} onClick={() => handleDelete(exp.id)}>Delete</button>
                  </div>
                </div>
              ))}
              {visible.length === 0 && <div style={{ textAlign: 'center', padding: '32px 0', color: '#9b6070' }}>{emptyMsg}</div>}
            </div>
          )}
          <div className="table-wrap" style={{ display: isMobile ? 'none' : undefined }}>
            <table style={{ minWidth: 640 }}>
              <thead>
                <tr><th>Date</th><th>Description</th><th>Category</th><th>Payment</th><th>Amount</th><th>Receipt</th><th></th></tr>
              </thead>
              <tbody>
                {visible.map(exp => (
                  <tr key={exp.id}>
                    <td style={{ fontSize: 12, color: '#9b6070', whiteSpace: 'nowrap' }}>{fmtDate(exp.expense_date)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{exp.description}</div>
                      {exp.reference && <div style={{ fontSize: 11, color: '#9b6070' }}>Ref: {exp.reference}</div>}
                    </td>
                    <td>
                      {exp.expand?.category_id
                        ? <span style={{ fontSize: 12, background: '#fce8ed', color: '#8b2550', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>{exp.expand.category_id.icon} {exp.expand.category_id.name}</span>
                        : <span style={{ color: '#9b6070', fontSize: 12 }}>Uncategorized</span>}
                    </td>
                    <td>
                      <span style={{ fontSize: 12, background: '#f5edf0', padding: '2px 8px', borderRadius: 20 }}>{exp.payment_method}</span>
                    </td>
                    <td style={{ fontWeight: 700, color: '#dc2626', fontSize: 15 }}>{fmtKES(exp.amount_kes)}</td>
                    <td>{exp.receipt_file ? <a href={receiptUrl(exp)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#3b82f6' }}>📎 Attached</a> : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => openRepeat(exp)} aria-label={`Repeat ${exp.description}`} title="Record this expense again for today">Repeat</button>
                        <button className="btn-ghost" style={{ padding: '5px 10px' }} onClick={() => openEdit(exp)} aria-label={`Edit ${exp.description}`}><Edit2 size={13} /></button>
                        <button className="btn-ghost" style={{ padding: '5px 10px', color: '#dc2626' }} onClick={() => handleDelete(exp.id)} aria-label={`Delete ${exp.description}`}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px 0', color: '#9b6070' }}>{loading ? 'Loading...' : expenses.length > 0 ? 'No expenses match your filters' : 'No expenses recorded in this period'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* By category */}
        <div className="card">
          <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px' }}>By Category</h3>
          {anyBudget && budgetsShown && filtersOn && (
            <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 12 }}>Budgets are hidden while filters are on, so they are not compared with part of the spending.</div>
          )}
          {anyBudget && !budgetsShown && (
            <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 12 }}>Budgets show for one month, or for whole months together (for example a quarter).</div>
          )}
          {anyBudget && budgetsActive && !fullMonth && (
            <div style={{ fontSize: 12, color: '#9b6070', marginBottom: 12 }}>This range is part of a month. Each budget is for the whole month.</div>
          )}
          {catSummary.map(cat => (
            <div key={cat.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                <span>{cat.icon} {cat.name}</span>
                <span style={{ fontWeight: 700, color: '#dc2626' }}>{fmtKES(cat.total)}</span>
              </div>
              <div style={{ background: '#f5edf0', borderRadius: 4, height: 6 }}>
                <div style={{ background: budgetInfo(cat) ? budgetInfo(cat).bar : 'linear-gradient(90deg,#c8456a,#8b2550)', height: 6, borderRadius: 4, width: `${budgetInfo(cat) ? Math.min(100, budgetInfo(cat).pct) : Math.min(100, (cat.total / totalExpenses) * 100)}%` }} />
              </div>
              <div style={{ fontSize: 11, color: '#9b6070', textAlign: 'right' }}>
                {((cat.total / totalExpenses) * 100).toFixed(1)}% of spending
                {budgetInfo(cat) && (
                  <div style={{ fontWeight: 700, color: budgetInfo(cat).color, marginTop: 2 }}>
                    {budgetInfo(cat).pct > 100 ? `Over budget by ${fmtKES(cat.total - budgetInfo(cat).budget)}` : `${fmtKES(cat.total)} of ${fmtKES(budgetInfo(cat).budget)} budget (${Math.round(budgetInfo(cat).pct)}%)`}
                    {budgetInfo(cat).projected !== null && budgetInfo(cat).pct <= 100 && budgetInfo(cat).projected > budgetInfo(cat).budget && (
                      <span style={{ display: 'block', fontWeight: 400, color: '#d97706' }}>At this pace: {fmtKES(Math.round(budgetInfo(cat).projected))} by month end</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {uncategorized > 0 && (
            <div style={{ paddingTop: 10, borderTop: '1px solid #f5edf0', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9b6070' }}>
              <span>Uncategorized</span><span>{fmtKES(uncategorized)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expense Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Edit Expense' : 'Record Expense'}</span>
              <button onClick={() => setShowModal(false)} aria-label="Close" className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="label" htmlFor="exp-desc">Description *</label>
                  <input id="exp-desc" className="input" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Electricity bill August 2025" />
                </div>
                <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label className="label" htmlFor="exp-amt">Amount (KES) *</label>
                    <input id="exp-amt" className="input" type="number" required min={0} step="0.01" value={form.amount_kes} onChange={e => setForm(f => ({ ...f, amount_kes: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label" htmlFor="exp-date">Date *</label>
                    <input id="exp-date" className="input" type="date" required value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label" htmlFor="exp-cat">Category</label>
                    <select id="exp-cat" className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                      <option value="">Select category</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="exp-pay">Payment Method</label>
                    <select id="exp-pay" className="input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                      <option value="cash">💵 Cash</option>
                      <option value="mpesa">📱 M-Pesa</option>
                      <option value="bank">🏦 Bank Transfer</option>
                      <option value="card">💳 Card</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="exp-ref">Reference / Receipt No</label>
                  <input id="exp-ref" className="input" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Invoice or receipt number" />
                </div>
                <div>
                  <label className="label">Receipt Upload</label>
                  <div onClick={() => fileRef.current?.click()} style={{ border: '2px dashed #e8c0cc', borderRadius: 10, padding: '14px', textAlign: 'center', cursor: 'pointer', background: '#fff5f7', fontSize: 13, color: '#9b6070' }}>
                    <Upload size={18} style={{ margin: '0 auto 4px', display: 'block', color: '#c8456a' }} />
                    {receiptFile
                      ? <span style={{ color: '#059669', fontWeight: 700 }}>✅ {receiptFile.name}</span>
                      : <><div>📷 Snap receipt photo or upload PDF</div><div style={{ fontSize: 11, marginTop: 3, color: '#c8b0b8' }}>On mobile — choose camera, gallery or PDF</div></>
                    }
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setReceiptFile(e.target.files[0])} />
                </div>
                <div>
                  <label className="label" htmlFor="exp-notes">Notes</label>
                  <textarea id="exp-notes" className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : editing ? '💾 Update' : '✅ Record Expense'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCatModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <span className="modal-title">Expense Categories</span>
              <button onClick={() => setShowCatModal(false)} aria-label="Close" className="btn-ghost" style={{ padding: 8 }}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <input className="input" style={{ width: 50 }} value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)} placeholder="🏷️" />
                <input className="input" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category name" style={{ flex: 1 }} />
                <button className="btn-primary" onClick={handleAddCategory}><Plus size={16} /></button>
              </div>
              {categories.length === 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: '#9b6070', marginBottom: 8 }}>Quick add common categories:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {DEFAULT_CATS.map(cat => (
                      <button key={cat.name} className="btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }}
                        onClick={async () => {
                          try { await pb.collection(C.EXPENSE_CATS).create({ shop_id: shop.id, name: cat.name, icon: cat.icon }) } catch { toast.error('Could not add category. Try again.'); return }
                          loadData()
                        }}>
                        {cat.icon} {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {categories.map(cat => (
                  <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fff5f7', borderRadius: 8 }}>
                    <span>{cat.icon} {cat.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input className="input" type="number" min="0" step="1" aria-label={`Monthly budget for ${cat.name}`} placeholder="KES / month" defaultValue={Number(cat.monthly_budget_kes) > 0 ? cat.monthly_budget_kes : ''} onBlur={e => handleSaveBudget(cat, e.target)} onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }} style={{ width: 110, padding: '4px 8px', fontSize: 12 }} />
                      <button className="btn-ghost" style={{ padding: '4px 8px', color: '#dc2626' }} onClick={() => handleDeleteCategory(cat)} aria-label={`Delete category ${cat.name}`}><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}