// api/shops/public.js - public, read-only. Returns ONLY the fields the public pages need.
const PB_URL = process.env.PB_URL || 'https://fieldtrack-kenya.fly.dev'

const SHOP_FIELDS = ['id', 'collectionId', 'collectionName', 'name', 'slug', 'logo', 'cover_image', 'tagline', 'about_text', 'address', 'phone', 'email', 'website', 'instagram', 'business_type', 'business_hours', 'brand_color', 'currency', 'founded_year']
const RECEIPT_FIELDS = ['id', 'collectionId', 'collectionName', 'name', 'logo', 'address', 'phone', 'currency', 'tax_rate', 'receipt_header', 'receipt_footer', 'receipt_show_logo', 'receipt_show_tax']

const PRODUCT_FIELDS = ['id', 'collectionId', 'collectionName', 'shop_id', 'name', 'category_id', 'description', 'unit', 'price_kes', 'compare_price_kes', 'images', 'stock_qty', 'track_inventory', 'is_service', 'has_variants', 'is_taxable', 'status', 'brand', 'tags']
const CATEGORY_FIELDS = ['id', 'collectionId', 'collectionName', 'name', 'icon', 'sort_order']
const STAFF_FIELDS = ['id', 'collectionId', 'collectionName', 'shop_id', 'name', 'role']

let cached = { token: '', exp: 0 }

async function readJson(r) {
  const t = await r.text()
  if (!t) return {}
  try { return JSON.parse(t) } catch { return {} }
}

async function adminToken() {
  if (cached.token && Date.now() < cached.exp) return cached.token
  if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) throw new Error('PocketBase admin credentials are not configured.')
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD }),
  })
  const d = await readJson(r)
  if (!r.ok || !d.token) throw new Error('PocketBase admin authentication failed.')
  cached = { token: d.token, exp: Date.now() + 10 * 60 * 1000 }
  return d.token
}

async function pbGet(token, path) {
  const r = await fetch(`${PB_URL}${path}`, { headers: { Authorization: token } })
  if (r.status === 404) return {}
  const d = await readJson(r)
  if (!r.ok) throw new Error('PocketBase read failed.')
  return d
}

function pick(rec, fields) {
  const out = {}
  for (const k of fields) { if (rec[k] !== undefined) out[k] = rec[k] }
  return out
}

const DEMO_SHOP_ID = '4hqmw3q22yxetv2'
function toTime(v) { return new Date(String(v).replace(' ', 'T')).getTime() }
function isLocked(shop) {
  if (shop.id === DEMO_SHOP_ID) return false
  const now = Date.now()
  if (shop.subscription_ends_at) return now > toTime(shop.subscription_ends_at) + 2 * 86400000
  if (shop.trial_ends_at) return now > toTime(shop.trial_ends_at)
  return false
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  const q = req.query || {}
  const slug = String(q.slug || '').trim()
  const token = String(q.token || '').trim()
  try {
    const t = await adminToken()
    let shop = null
    let fields = SHOP_FIELDS
    if (slug) {
      if (!/^[A-Za-z0-9-]{1,120}$/.test(slug)) return res.status(404).json({ error: 'Not found' })
      const f = encodeURIComponent(`slug="${slug}"`)
      const d = await pbGet(t, `/api/collections/bs_shops/records?filter=${f}&perPage=1`)
      shop = d.items && d.items[0]
    } else if (token) {
      if (!/^[A-Za-z0-9_.-]{6,200}$/.test(token)) return res.status(404).json({ error: 'Not found' })
      fields = RECEIPT_FIELDS
      const f = encodeURIComponent(`share_token="${token}"`)
      const s = await pbGet(t, `/api/collections/bs_sales/records?filter=${f}&perPage=1&fields=shop_id`)
      const sale = s.items && s.items[0]
      if (sale && sale.shop_id) shop = await pbGet(t, `/api/collections/bs_shops/records/${encodeURIComponent(sale.shop_id)}`)
    } else {
      return res.status(400).json({ error: 'slug or token required' })
    }
    if (!shop || !shop.id) return res.status(404).json({ error: 'Not found' })
    if (slug && String(q.catalog || '') === '1') {
      const fp = encodeURIComponent('shop_id="' + shop.id + '" && status="active"')
      const fs = encodeURIComponent('shop_id="' + shop.id + '" && is_active=true')
      const p = await pbGet(t, '/api/collections/bs_products/records?filter=' + fp + '&perPage=200&sort=name&expand=category_id')
      const s = await pbGet(t, '/api/collections/bs_staff/records?filter=' + fs + '&perPage=100&sort=name')
      const products = (p.items || []).map(r => { const o = pick(r, PRODUCT_FIELDS); const c = r.expand && r.expand.category_id; if (c) o.expand = { category_id: pick(c, CATEGORY_FIELDS) }; return o })
      const staff = (s.items || []).map(r => pick(r, STAFF_FIELDS))
      res.setHeader('Cache-Control', 'public, s-maxage=30')
      return res.status(200).json({ products, staff })
    }
    res.setHeader('Cache-Control', 'public, s-maxage=30')
    const out = pick(shop, fields)
    out.locked = isLocked(shop)
    return res.status(200).json(out)
  } catch (e) {
    cached = { token: '', exp: 0 }
    return res.status(500).json({ error: 'Could not load shop.' })
  }
}