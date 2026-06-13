module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  console.log('M-Pesa callback:', JSON.stringify(req.body))
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' })
}