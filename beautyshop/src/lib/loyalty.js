// Loyalty Engine — auto points on every sale, redeem at POS
// Rules: 1 point per KES 100 spent. 100 points = KES 50 discount
export const LOYALTY_EARN_RATE  = 100   // spend KES 100 → 1 point
export const LOYALTY_REDEEM_RATE = 2    // 1 point = KES 0.50 (100pts = KES 50)
export const LOYALTY_MIN_REDEEM  = 50   // min 50 points to redeem

export function calcPointsEarned(totalKes) {
  return Math.floor(totalKes / LOYALTY_EARN_RATE)
}

export function calcPointsValue(points) {
  return points * LOYALTY_REDEEM_RATE * 0.5
}

export function calcMaxRedeemable(points) {
  if (points < LOYALTY_MIN_REDEEM) return 0
  return calcPointsValue(points)
}

// Redemption cap: at most this % of the payable amount can be paid with points
export const LOYALTY_MAX_REDEEM_PCT = 50
export function calcRedeemForSale(points, payable) {
  if (points < LOYALTY_MIN_REDEEM || payable <= 0) return { points: 0, kes: 0 }
  const capKes = Math.floor(payable * LOYALTY_MAX_REDEEM_PCT / 100)
  const pts = Math.min(Math.floor(points), Math.floor(capKes / calcPointsValue(1)))
  return { points: pts, kes: calcPointsValue(pts) }
}
