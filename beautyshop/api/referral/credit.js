// api/referral/credit.js
const PB_URL = 'https://fieldtrack-kenya.fly.dev'

async function pbAdminToken() {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: process.env.PB_ADMIN_EMAIL,
      password: process.env.PB_ADMIN_PASSWORD,
    }),
  })
  if (!r.ok) {
    const txt = await r.text()
    throw new Error(`PocketBase auth failed: ${r.status} ${txt}`)
  }
  const data = await r.json()
  return data.token
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { referralCodeUsed } = req.body
  if (!referralCodeUsed?.trim()) {
    return res.status(200).json({ skipped: true })
  }

  try {
    const token = await pbAdminToken()
    const code  = referralCodeUsed.trim().toUpperCase()

    const searchUrl = `${PB_URL}/api/collections/bs_shops/records?filter=${encodeURIComponent(`referral_code="${code}"`)}&perPage=1`
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: token },
    })
    if (!searchRes.ok) {
      const txt = await searchRes.text()
      throw new Error(`Search failed: ${searchRes.status} ${txt}`)
    }
    const searchData = await searchRes.json()

    if (!searchData.items?.length) {
      return res.status(200).json({ found: false })
    }

    const referrer = searchData.items[0]
    const now      = new Date()
    const existing = referrer.subscription_ends_at ? new Date(referrer.subscription_ends_at) : null
    const base     = existing && existing > now ? existing : now
    const newEnd   = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)

    const updateRes = await fetch(`${PB_URL}/api/collections/bs_shops/records/${referrer.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
      },
      body: JSON.stringify({
        subscription_ends_at: newEnd.toISOString().replace('T', ' ').replace('Z', '.000Z'),
        subscription_status: 'active',
      }),
    })
    if (!updateRes.ok) {
      const txt = await updateRes.text()
      throw new Error(`Update failed: ${updateRes.status} ${txt}`)
    }

    return res.status(200).json({
      found: true,
      referrer: referrer.name,
      newEnd: newEnd.toISOString(),
    })
  } catch (err) {
    console.error('[referral] FAILED:', err.message)
    return res.status(200).json({ error: err.message }) // 200 so it never blocks payment UI
  }
}