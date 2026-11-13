// Loyalty Engine — auto points on every sale, redeem at POS
// Rules: 1 point per KES 100 spent. default 1 point = KES 1 off; owners can change the rules in Settings
export const LOYALTY_EARN_RATE  = 100   // spend KES 100 → 1 point
export const LOYALTY_REDEEM_RATE = 2    // 1 point = KES 1 (points x 2 x 0.5)
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
// R2: owner-set loyalty rules. A shop field that is empty or 0 means use the default.
export const LOYALTY_HARD_MAX_PCT = 90
export function getLoyaltyConfig(shop) {
  const pos = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d }
  const s = shop || {}
  return {
    enabled: !s.loyalty_off,
    capPct: Math.min(pos(s.loyalty_cap_pct, LOYALTY_MAX_REDEEM_PCT), LOYALTY_HARD_MAX_PCT),
    minPoints: pos(s.loyalty_min_points, LOYALTY_MIN_REDEEM),
    pointValue: pos(s.loyalty_point_value_kes, 1),
  }
}
export function calcRedeemWithConfig(points, payable, cfg) {
  if (!cfg.enabled || points < cfg.minPoints || payable <= 0) return { points: 0, kes: 0 }
  const capKes = Math.floor(payable * cfg.capPct / 100)
  const pts = Math.max(0, Math.min(Math.floor(points), Math.floor(capKes / cfg.pointValue + 1e-9)))
  return { points: pts, kes: Math.round(pts * cfg.pointValue * 100) / 100 }
}

export function calcRedeemForSale(points, payable) {
  if (points < LOYALTY_MIN_REDEEM || payable <= 0) return { points: 0, kes: 0 }
  const capKes = Math.floor(payable * LOYALTY_MAX_REDEEM_PCT / 100)
  const pts = Math.min(Math.floor(points), Math.floor(capKes / calcPointsValue(1)))
  return { points: pts, kes: calcPointsValue(pts) }
}
