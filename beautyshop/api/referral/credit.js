const PocketBase = require('pocketbase/cjs')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const { referralCodeUsed } = req.body
  if (!referralCodeUsed?.trim()) return res.status(200).json({ skipped: true })

  try {
    const pb = new PocketBase(process.env.VITE_PB_URL || 'https://fieldtrack-kenya.fly.dev')
    await pb.admins.authWithPassword(
      process.env.PB_ADMIN_EMAIL,
      process.env.PB_ADMIN_PASSWORD
    )

    const code = referralCodeUsed.trim().toUpperCase()
    const res2 = await pb.collection('bs_shops').getList(1, 1, {
      filter: `referral_code="${code}"`,
    })
    if (!res2.items.length) return res.status(200).json({ found: false })

    const referrer = res2.items[0]
    const now = new Date()
    const existing = referrer.subscription_ends_at ? new Date(referrer.subscription_ends_at) : null
    const base = existing && existing > now ? existing : now
    const newEnd = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000)

    await pb.collection('bs_shops').update(referrer.id, {
      subscription_ends_at: newEnd.toISOString().replace('T', ' ').replace('Z', '.000Z'),
      subscription_status: 'active',
    })

    res.status(200).json({ found: true, referrer: referrer.name, newEnd: newEnd.toISOString() })
  } catch (e) {
    console.error('Referral credit failed:', e?.message || e)
    res.status(200).json({ error: e?.message || 'failed' }) // 200 so it never blocks payment UI
  }
}