// src/lib/planAccess.js
// SINGLE SOURCE OF TRUTH for plan-tier feature gating — pure logic, no UI, no PocketBase writes.
// Used by: PlanGuard.jsx (route-level gates), ReportsPage.jsx (Lender Pack tab),
// DashboardPage.jsx (Insights tab). Never duplicate this ranking object or the
// demo/trial bypass logic anywhere else — import from here, same pattern as financials.js.

// Demo Beauty Hub — the one permanent sales-demo shop. Confirmed from live
// PocketBase this session (bs_shops record). Bypasses every plan gate forever,
// regardless of its `plan` or `subscription_status` field values.
// NEVER match this by email or name — only by this exact immutable id.
export const DEMO_SHOP_ID = '4hqmw3q22yxetv2'

// Tier order — higher number = more access. Add new tiers here only.
export const PLAN_RANK = {
  starter: 0,
  growth: 1,
  enterprise: 2,
}

// Monthly plan prices in KES -- single source of truth, must match PricingPage.jsx's
// PLANS.monthly prices exactly. NOTE: shops have no stored billing `period` field yet
// (monthly vs yearly), so anything using this (e.g. SubscriptionPaybackDay) assumes
// monthly billing. This under-estimates true cost for yearly subscribers, which is the
// safe direction (shows payback sooner, never later) until a billing_period field exists.
export const PLAN_PRICES = {
  starter: 2999,
  growth: 4999,
  enterprise: 6999,
}

/**
 * hasRequiredPlan(shop, requiredPlan)
 *
 * Returns true if this shop should see a feature gated at `requiredPlan` or above.
 *
 * Rules, in order:
 *   1. Demo shop (by id) → always true. Sales tool — must show everything.
 *   2. Not on an active paid subscription (trial, expired, cancelled, or no
 *      subscription_status at all) → always true. Trials get full access for
 *      the full 7 days so prospects experience the complete product before
 *      choosing a tier. This is a deliberate decision — see DECISIONS LOG.
 *   3. Active paid subscription → gate by comparing shop.plan against
 *      requiredPlan using PLAN_RANK. A shop with no `plan` value set while
 *      active is treated as Starter (rank 0) — the safest default, since it
 *      under-grants rather than over-grants access.
 *
 * @param {object} shop - the current shop record (from useAuth().shop)
 * @param {'starter'|'growth'|'enterprise'} requiredPlan - minimum tier needed
 * @returns {boolean}
 */
export function hasRequiredPlan(shop, requiredPlan) {
  if (!shop) return false // no shop loaded yet — fail closed, PlanGuard should show nothing/loading instead

  if (shop.id === DEMO_SHOP_ID) return true

  if (shop.subscription_status !== 'active') return true // trial / expired / cancelled / unset — full access

  const shopRank = PLAN_RANK[shop.plan] ?? PLAN_RANK.starter
  const neededRank = PLAN_RANK[requiredPlan] ?? PLAN_RANK.starter

  return shopRank >= neededRank
}