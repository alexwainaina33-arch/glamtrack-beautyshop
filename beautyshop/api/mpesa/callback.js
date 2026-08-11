module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const callback = req.body?.Body?.stkCallback
  console.log('M-Pesa callback received', {
    checkoutRequestId: callback?.CheckoutRequestID || null,
    resultCode: callback?.ResultCode ?? null,
  })
  return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' })
}