// api/mpesa/callback.js
// Safaricom posts payment result here — log it, future: update PocketBase
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  console.log('M-Pesa callback:', JSON.stringify(req.body))
  // TODO Phase 4b: update bs_shops subscription_status here
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' })
}