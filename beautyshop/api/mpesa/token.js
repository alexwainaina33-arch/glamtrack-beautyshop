module.exports = async function handler(req, res) {
  const key    = process.env.DARAJA_CONSUMER_KEY
  const secret = process.env.DARAJA_CONSUMER_SECRET
  const creds  = Buffer.from(`${key}:${secret}`).toString('base64')

  try {
    const r = await fetch(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${creds}` } }
    )
    const data = await r.json()
    res.status(200).json({ token: data.access_token })
  } catch (e) {
    res.status(500).json({ error: 'Failed to get M-Pesa token' })
  }
}