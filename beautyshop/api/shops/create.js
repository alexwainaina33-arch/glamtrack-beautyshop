// api/shops/create.js  (NEW FILE - creates the first shop for an owner who has none)
// Used by the Shop Setup Wizard. The browser cannot choose slug, trial dates or role.

const PB_URL = process.env.PB_URL || 'https://fieldtrack-kenya.fly.dev'

const j = (res, status, body) => res.status(status).json(body)
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max)

async function readBody(r) {
  const t = await r.text()
  if (!t) return {}
  try { return JSON.parse(t) } catch { return {} }
}

async function adminToken() {
  if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) throw new Error('PocketBase admin credentials are not configured.')
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: process.env.PB_ADMIN_EMAIL, password: process.env.PB_ADMIN_PASSWORD }),
  })
  const d = await readBody(r)
  if (!r.ok || !d.token) throw new Error(`PocketBase admin authentication failed (${r.status}).`)
  return d.token
}

async function pb(token, method, path, value) {
  const r = await fetch(`${PB_URL}${path}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: value ? JSON.stringify(value) : undefined,
  })
  const d = await readBody(r)
  if (!r.ok) {
    const e = new Error(`PocketBase ${method} failed (${r.status}).`)
    e.pbStatus = r.status
    e.pbData = d
    throw e
  }
  return d
}

// Ask PocketBase who the caller is, using the token the browser sent.
async function whoIsCaller(req) {
  const h = String((req.headers && req.headers.authorization) || '')
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (!m) return null
  const r = await fetch(`${PB_URL}/api/collections/bs_admins/auth-refresh`, {
    method: 'POST',
    headers: { Authorization: m[1].trim() },
  })
  const d = await readBody(r)
  if (!r.ok || !d.record || !d.record.id) return null
  return d.record
}

async function countLinks(token, adminId) {
  const f = encodeURIComponent(`admin_id="${adminId}"`)
  const r = await pb(token, 'GET', `/api/collections/bs_shop_admins/records?filter=${f}&perPage=1`)
  return Number(r.totalItems) || 0
}

async function makeUniqueReferralCode(token, bizName) {
  const initials = bizName.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'SHOP'
  for (let i = 0; i < 6; i++) {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X')
    const code = `${initials}${rand}`
    const f = encodeURIComponent(`referral_code="${code}"`)
    const r = await pb(token, 'GET', `/api/collections/bs_shops/records?filter=${f}&perPage=1`)
    if (!Array.isArray(r.items) || r.items.length === 0) return code
  }
  throw new Error('Could not generate a unique referral code.')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return j(res, 405, { error: 'Method not allowed' })

  const made = { shop: null, link: null }
  let token = null

  try {
    // ---- 1. Who is calling? ----
    const caller = await whoIsCaller(req)
    if (!caller) return j(res, 401, { error: 'Your session expired. Please sign in again.' })
    if (caller.role !== 'owner' || caller.is_active === false) {
      return j(res, 403, { error: 'Only a business owner can set up a shop.' })
    }

    // ---- 2. Clean the input (only these 6 fields are used) ----
    const q = req.body || {}
    const name = clean(q.name, 100)
    if (!name) return j(res, 400, { error: 'Shop name is required.' })
    const phone = clean(q.phone, 30)
    const address = clean(q.address, 200)
    const emailIn = clean(q.email, 120).toLowerCase()
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailIn) ? emailIn : clean(caller.email, 120).toLowerCase()
    const currency = /^[A-Z]{3}$/.test(String(q.currency || '')) ? String(q.currency) : 'KES'
    const taxNum = Number(q.tax_rate)
    const taxRate = Number.isFinite(taxNum) ? Math.min(100, Math.max(0, taxNum)) : 16

    // ---- 3. Only an owner with ZERO shops may create one ----
    token = await adminToken()
    if ((await countLinks(token, caller.id)) > 0) {
      return j(res, 409, { error: 'You already have a shop. Please refresh the page.' })
    }

    // ---- 4. Create the shop (slug, trial dates, referral code all set here) ----
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now()
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ')
    const referralCode = await makeUniqueReferralCode(token, name)
    made.shop = await pb(token, 'POST', '/api/collections/bs_shops/records', {
      name, slug, phone, address, email,
      currency, tax_rate: taxRate, is_active: true,
      referral_code: referralCode,
      subscription_status: 'trial', trial_ends_at: trialEnd,
      referral_code_used: '', signup_source: 'organic',
    })

    // ---- 5. Link the owner to the shop ----
    made.link = await pb(token, 'POST', '/api/collections/bs_shop_admins/records', {
      shop_id: made.shop.id, admin_id: caller.id, role: 'owner',
    })

    // ---- 6. Double-click guard: if two requests raced, undo this one ----
    if ((await countLinks(token, caller.id)) > 1) {
      throw Object.assign(new Error('race'), { race: true })
    }

    return j(res, 200, { ok: true, shop: made.shop })
  } catch (e) {
    console.error('[shops/create] failed:', e && e.message ? e.message : e)
    if (token) {
      const undo = [['bs_shop_admins', made.link], ['bs_shops', made.shop]]
      for (const [col, rec] of undo) {
        if (!rec || !rec.id) continue
        try { await pb(token, 'DELETE', `/api/collections/${col}/records/${encodeURIComponent(rec.id)}`) }
        catch (e2) { console.error('[shops/create] rollback failed for', col, rec.id) }
      }
    }
    if (e && e.race) return j(res, 409, { error: 'You already have a shop. Please refresh the page.' })
    return j(res, 500, { error: 'We could not create your shop. Please try again.' })
  }
}