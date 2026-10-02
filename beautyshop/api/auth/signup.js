// api/auth/signup.js  (NEW FILE - creates new records only, never edits existing shops)
// Replaces browser steps 1-4 of signup: create owner, create shop, link them.
// The browser can no longer choose the role, the trial dates or the referral validity.

const PB_URL = process.env.PB_URL || 'https://fieldtrack-kenya.fly.dev'
const MAX_SIGNUPS_PER_HOUR = 30 // simple global brake against spam (UNVERIFIED approach)

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

  const made = { admin: null, shop: null, link: null }
  let token = null

  try {
    const q = req.body || {}

    // ---- 1. Clean and check the input (nothing here trusts the browser) ----
    const name = clean(q.name, 80)
    const email = clean(q.email, 120).toLowerCase()
    const password = String(q.password == null ? '' : q.password)
    const bizName = clean(q.bizName, 100)
    if (!name || !bizName) return j(res, 400, { error: 'Your name and business name are required.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return j(res, 400, { error: 'Enter a valid email address.' })
    if (password.length < 8 || password.length > 100) return j(res, 400, { error: 'Password must be 8 to 100 characters.' })

    const bizType = clean(q.bizType, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'other'
    const bizTypeLabel = clean(q.bizTypeLabel, 80) || bizType
    const phone = clean(q.phone, 30)
    const address = clean(q.address, 200)
    const bizEmail = clean(q.bizEmail, 120).toLowerCase()
    const currency = /^[A-Z]{3}$/.test(String(q.currency || '')) ? String(q.currency) : 'KES'
    const taxNum = Number(q.taxRate)
    const taxRate = Number.isFinite(taxNum) ? Math.min(100, Math.max(0, taxNum)) : 16
    const brandColor = /^#[0-9a-fA-F]{6}$/.test(String(q.brandColor || '')) ? String(q.brandColor) : '#c8456a'
    const receiptFooter = clean(q.receiptFooter, 200) || `Thank you for visiting ${bizName}!`
    const referralUsed = String(q.referralCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    const signupSource = clean(q.utmSource, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'organic'

    // ---- 2. Log in to PocketBase as superuser (same pattern as verify-paystack.js) ----
    token = await adminToken()

    // ---- 3. Spam brake: too many new shops in the last hour? ----
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ')
    const recent = await pb(token, 'GET', `/api/collections/bs_shops/records?filter=${encodeURIComponent(`created >= "${since}"`)}&perPage=1`)
    if (Number(recent.totalItems) >= MAX_SIGNUPS_PER_HOUR) {
      return j(res, 429, { error: 'We are receiving many sign-ups right now. Please try again in a little while.' })
    }

    // ---- 4. Create the owner account (role is forced to owner here) ----
    made.admin = await pb(token, 'POST', '/api/collections/bs_admins/records', {
      name, email, password, passwordConfirm: password,
      role: 'owner', is_active: true, business_type: bizType,
    })

    // ---- 5. Create the shop (trial dates come from the SERVER clock) ----
    const slug = bizName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + Date.now()
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ')
    const referralCode = await makeUniqueReferralCode(token, bizName)
    made.shop = await pb(token, 'POST', '/api/collections/bs_shops/records', {
      name: bizName, slug, phone, address,
      email: bizEmail || email,
      currency, tax_rate: taxRate, is_active: true,
      business_type: bizTypeLabel, brand_color: brandColor,
      receipt_footer: receiptFooter, receipt_show_logo: true, receipt_show_tax: true,
      referral_code: referralCode,
      subscription_status: 'trial', trial_ends_at: trialEnd,
      referral_code_used: referralUsed, signup_source: signupSource,
    })

    // ---- 6. Link owner to shop ----
    made.link = await pb(token, 'POST', '/api/collections/bs_shop_admins/records', {
      shop_id: made.shop.id, admin_id: made.admin.id, role: 'owner',
    })

    return j(res, 200, { ok: true, shopId: made.shop.id, adminId: made.admin.id })
  } catch (e) {
    console.error('[signup] failed:', e && e.message ? e.message : e)

    // ---- Undo anything we created, newest first, so no orphan accounts are left ----
    if (token) {
      const undo = [
        ['bs_shop_admins', made.link],
        ['bs_shops', made.shop],
        ['bs_admins', made.admin],
      ]
      for (const [col, rec] of undo) {
        if (!rec || !rec.id) continue
        try { await pb(token, 'DELETE', `/api/collections/${col}/records/${encodeURIComponent(rec.id)}`) }
        catch (e2) { console.error('[signup] rollback failed for', col, rec.id) }
      }
    }

    if (e && e.pbData && e.pbData.data && e.pbData.data.email) {
      return j(res, 409, { error: 'This email is already registered. Try logging in instead.' })
    }
    return j(res, 500, { error: 'We could not create your account. Please try again.' })
  }
}
