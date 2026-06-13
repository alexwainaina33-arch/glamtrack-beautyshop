// api/mpesa/stkpush.js
export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  const { phone, amount, planId, planName, period, shopId } = req.body

  // Get token
  const key    = process.env.DARAJA_CONSUMER_KEY
  const secret = process.env.DARAJA_CONSUMER_SECRET
  const creds  = Buffer.from(`${key}:${secret}`).toString('base64')

  const tokenRes = await fetch(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${creds}` } }
  )
  const { access_token } = await tokenRes.json()

  // Generate password
  const shortCode = process.env.DARAJA_SHORTCODE || '174379'
  const passkey   = process.env.DARAJA_PASSKEY   || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  const password  = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64')

  // Format phone: 07xx → 2547xx
  const fmt = (p) => {
    p = p.replace(/\s/g, '')
    if (p.startsWith('07') || p.startsWith('01')) return '254' + p.slice(1)
    if (p.startsWith('+254')) return p.slice(1)
    return p
  }

  const callbackUrl = `${process.env.VERCEL_URL
    ? 'https://' + process.env.VERCEL_URL
    : process.env.DARAJA_CALLBACK_BASE}/api/mpesa/callback`

  try {
    const r = await fetch(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
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
          TransactionType:   'CustomerPayBillOnline',
          Amount:            amount,
          PartyA:            fmt(phone),
          PartyB:            shortCode,
          PhoneNumber:       fmt(phone),
          CallBackURL:       callbackUrl,
          AccountReference:  `ST-${planId.toUpperCase()}`,
          TransactionDesc:   `SalesTrack ${planName} ${period}`,
        }),
      }
    )
    const data = await r.json()
    if (data.ResponseCode === '0') {
      res.status(200).json({ checkoutRequestId: data.CheckoutRequestID })
    } else {
      res.status(400).json({ error: data.errorMessage || data.ResponseDescription || 'STK push failed' })
    }
  } catch (e) {
    res.status(500).json({ error: 'M-Pesa request failed' })
  }
}