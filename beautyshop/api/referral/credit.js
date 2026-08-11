// Referral credit is issued only inside /api/payments/verify-paystack after
// server-side payment verification, shop authorization and idempotency checks.
module.exports = async function handler(req, res) {
  return res.status(410).json({ error: 'Referral credit requires a server-verified payment activation.' })
}