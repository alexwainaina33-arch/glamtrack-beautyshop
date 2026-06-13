// api/mpesa/query.js
export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const { checkoutRequestId } = req.body

  const key    = process.env.DARAJA_CONSUMER_KEY
  const secret = process.env.DARAJA_CONSUMER_SECRET
  const creds  = Buffer.from(`${key}:${secret}`).toString('base64')

  const tokenRes = await fetch(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${creds}` } }
  )
  const { access_token } = await tokenRes.json()

  const shortCode = process.env.DARAJA_SHORTCODE || '174379'
  const passkey   = process.env.DARAJA_PASSKEY   || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const password  = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64')

  try {
    const r = await fetch(
      'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: shortCode,
          Password:          password,
          Timestamp:         timestamp,
          CheckoutRequestID: checkoutRequestId,
        }),
      }
    )
    const data = await r.json()
    // ResultCode 0 = success, 1032 = cancelled, others = pending/fail
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: 'Query failed' })
  }
}