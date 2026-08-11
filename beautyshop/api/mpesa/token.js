// Daraja OAuth tokens are server credentials and must never be returned to browsers.
module.exports = async function handler(req, res) {
  return res.status(410).json({ error: 'This endpoint is disabled. M-Pesa credentials are server-only.' })
}