import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns'

// Format currency KES
export const fmtKES = (amount) => {
  if (!amount && amount !== 0) return 'KES —'
  return `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Format date
export const fmtDate = (date) => date ? format(new Date(date), 'dd MMM yyyy') : '—'
export const fmtDateTime = (date) => date ? format(new Date(date), 'dd MMM yyyy, HH:mm') : '—'
export const fmtTime = (date) => date ? format(new Date(date), 'HH:mm') : '—'

// Date ranges
export const dateRanges = {
  today: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
  thisMonth: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  thisYear: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }),
}

// Generate receipt number
export const generateReceiptNo = (shopSlug) => {
  const d = new Date()
  const y = d.getFullYear().toString().slice(-2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${shopSlug?.toUpperCase() || 'BS'}-${y}${m}${day}-${rand}`
}

// PocketBase image URL
export const imgUrl = (record, filename, thumb = '') => {
  if (!record || !filename) return null
  const col = record.collectionId || record.collectionName
  const base = `https://fieldtrack-kenya.fly.dev/api/files/${col}/${record.id}/${filename}`
  return thumb ? `${base}?thumb=${thumb}` : base
}

// Percent change
export const pctChange = (current, previous) => {
  if (!previous) return 0
  return (((current - previous) / previous) * 100).toFixed(1)
}

// Status color classes
export const statusColor = (status) => {
  const map = {
    active: 'text-emerald-600 bg-emerald-50',
    draft: 'text-amber-600 bg-amber-50',
    archived: 'text-gray-500 bg-gray-100',
    completed: 'text-emerald-600 bg-emerald-50',
    paid: 'text-emerald-600 bg-emerald-50',
    pending: 'text-amber-600 bg-amber-50',
    voided: 'text-red-600 bg-red-50',
    failed: 'text-red-600 bg-red-50',
  }
  return map[status] || 'text-gray-600 bg-gray-100'
}

// Payment method labels
export const paymentLabel = (method) => {
  const map = { cash: '💵 Cash', mpesa: '📱 M-Pesa', visa_mc: '💳 Card', mixed: '🔀 Mixed' }
  return map[method] || method
}

// Debounce
export const debounce = (fn, ms = 300) => {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}
