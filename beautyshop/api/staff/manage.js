// api/staff/manage.js  (NEW FILE - add / remove / change role of shop staff)
// Only an owner of THAT shop can use it. The owner role can never be given or changed here.

const PB_URL = process.env.PB_URL || 'https://fieldtrack-kenya.fly.dev'
const STAFF_ROLES = ['manager', 'cashier', 'viewer']

const j = (res, status, body) => res.status(status).json(body)
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max)
const idOk = (v) => (/^[a-zA-Z0-9]{1,30}$/.test(String(v || '')) ? String(v) : '')
const fail = (status, msg) => Object.assign(new Error(msg), { http: status })

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

async function getRecord(token, col, id) {
  try {
    return await pb(token, 'GET', `/api/collections/${col}/records/${encodeURIComponent(id)}`)
  } catch (e) {
    if (e.pbStatus === 404) throw fail(404, 'That staff member was not found.')
    throw e
  }
}

async function countLinks(token, adminId) {
  const f = encodeURIComponent(`admin_id="${adminId}"`)
  const r = await pb(token, 'GET', `/api/collections/bs_shop_admins/records?filter=${f}&perPage=1`)
  return Number(r.totalItems) || 0
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return j(res, 405, { error: 'Method not allowed' })

  const made = { admin: null, link: null }
  let token = null

  try {
    const q = req.body || {}
    const action = String(q.action || '')
    const shopId = idOk(q.shopId)
    if (!['add', 'remove', 'changeRole'].includes(action) || !shopId) {
      return j(res, 400, { error: 'Invalid request.' })
    }

    // ---- Who is calling, and do they own THIS shop? ----
    const caller = await whoIsCaller(req)
    if (!caller) return j(res, 401, { error: 'Your session expired. Please sign in again.' })
    if (caller.role !== 'owner' || caller.is_active === false) {
      return j(res, 403, { error: 'Only the shop owner can manage staff.' })
    }
    token = await adminToken()
    const mf = encodeURIComponent(`shop_id="${shopId}" && admin_id="${caller.id}" && role="owner"`)
    const mem = await pb(token, 'GET', `/api/collections/bs_shop_admins/records?filter=${mf}&perPage=1`)
    if (!Array.isArray(mem.items) || mem.items.length === 0) {
      return j(res, 403, { error: 'You are not the owner of this shop.' })
    }

    // ================= ADD =================
    if (action === 'add') {
      const name = clean(q.name, 80)
      const email = clean(q.email, 120).toLowerCase()
      const password = String(q.password == null ? '' : q.password)
      const phone = clean(q.phone, 30)
      const role = String(q.role || '')
      if (!name) return j(res, 400, { error: 'Name is required.' })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return j(res, 400, { error: 'Enter a valid email address.' })
      if (password.length < 8 || password.length > 100) return j(res, 400, { error: 'Password must be 8 to 100 characters.' })
      if (!STAFF_ROLES.includes(role)) return j(res, 400, { error: 'Choose manager, cashier or viewer.' })

      made.admin = await pb(token, 'POST', '/api/collections/bs_admins/records', {
        name, email, password, passwordConfirm: password, phone, role, is_active: true,
      })
      made.link = await pb(token, 'POST', '/api/collections/bs_shop_admins/records', {
        shop_id: shopId, admin_id: made.admin.id, role,
      })
      return j(res, 200, { ok: true, adminId: made.admin.id, linkId: made.link.id })
    }

    // ================= REMOVE / CHANGE ROLE (both start from a link in this shop) =================
    const linkId = idOk(q.linkId)
    if (!linkId) return j(res, 400, { error: 'Invalid request.' })
    const link = await getRecord(token, 'bs_shop_admins', linkId)
    if (link.shop_id !== shopId) return j(res, 403, { error: 'That person is not in your shop.' })
    if (link.role === 'owner') return j(res, 403, { error: 'An owner cannot be changed or removed here.' })
    if (link.admin_id === caller.id) return j(res, 403, { error: 'You cannot change or remove yourself.' })
    const target = await getRecord(token, 'bs_admins', link.admin_id)
    if (target.role === 'owner') return j(res, 403, { error: 'An owner cannot be changed or removed here.' })

    if (action === 'remove') {
      await pb(token, 'DELETE', `/api/collections/bs_shop_admins/records/${encodeURIComponent(linkId)}`)
      let deactivated = false
      if ((await countLinks(token, target.id)) === 0) {
        await pb(token, 'PATCH', `/api/collections/bs_admins/records/${encodeURIComponent(target.id)}`, { is_active: false })
        deactivated = true
      }
      return j(res, 200, { ok: true, deactivated })
    }

    // changeRole
    const role = String(q.role || '')
    if (!STAFF_ROLES.includes(role)) return j(res, 400, { error: 'Choose manager, cashier or viewer.' })
    if ((await countLinks(token, target.id)) !== 1) {
      return j(res, 409, { error: 'This person works in more than one shop, so their role cannot be changed here yet.' })
    }
    await pb(token, 'PATCH', `/api/collections/bs_shop_admins/records/${encodeURIComponent(linkId)}`, { role })
    await pb(token, 'PATCH', `/api/collections/bs_admins/records/${encodeURIComponent(target.id)}`, { role })
    return j(res, 200, { ok: true })
  } catch (e) {
    console.error('[staff/manage] failed:', e && e.message ? e.message : e)
    if (token) {
      const undo = [['bs_shop_admins', made.link], ['bs_admins', made.admin]]
      for (const [col, rec] of undo) {
        if (!rec || !rec.id) continue
        try { await pb(token, 'DELETE', `/api/collections/${col}/records/${encodeURIComponent(rec.id)}`) }
        catch (e2) { console.error('[staff/manage] rollback failed for', col, rec.id) }
      }
    }
    if (e && e.http) return j(res, e.http, { error: e.message })
    if (e && e.pbData && e.pbData.data && e.pbData.data.email) {
      return j(res, 409, { error: 'This email is already registered to another account.' })
    }
    return j(res, 500, { error: 'We could not complete that. Please try again.' })
  }
}