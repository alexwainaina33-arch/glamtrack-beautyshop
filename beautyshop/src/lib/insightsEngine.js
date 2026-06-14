/**
 * SalesTrack Insights Engine v2 — with Memory
 * Pure math on PocketBase data. Zero API calls. Free forever.
 * 
 * Memory model:
 *   - bs_insights stores every insight shown per shop
 *   - Never repeats same insight_type within 3 days
 *   - After 7 days: references shop's own patterns
 *   - After 30 days: full baseline comparison
 */

import pb, { C } from './pb'

// ─── BASELINE LOADER ────────────────────────────────────────────
// Call once on dashboard load. Returns shop's pattern memory.
export async function loadShopBaseline(shopId) {
  const cacheKey = `st_baseline_${shopId}_${new Date().toDateString()}`
  const cached = sessionStorage.getItem(cacheKey)
  if (cached) return JSON.parse(cached)

  try {
    const records = await pb.collection(C.INSIGHTS).getList(1, 90, {
      filter: `shop_id="${shopId}"`,
      sort: '-created',
      '$autoCancel': false,
      '$cancelKey': 'insights-baseline',
    })

    const history = records.items
    const shownTypes = {}
    const dataSnapshots = []

    history.forEach(r => {
      // Track when each insight_type was last shown
      if (!shownTypes[r.insight_type]) {
        shownTypes[r.insight_type] = r.created
      }
      // Collect data snapshots for baseline
      if (r.data_snapshot) {
        try { dataSnapshots.push(JSON.parse(r.data_snapshot)) } catch {}
      }
    })

    // Build baseline from snapshots
    const baseline = buildBaseline(dataSnapshots)
    const result = { shownTypes, baseline, daysOfData: history.length }

    sessionStorage.setItem(cacheKey, JSON.stringify(result))
    return result
  } catch {
    return { shownTypes: {}, baseline: null, daysOfData: 0 }
  }
}

function buildBaseline(snapshots) {
  if (!snapshots.length) return null
  const revenues = snapshots.map(s => s.revenue || 0).filter(v => v > 0)
  if (!revenues.length) return null

  const avgRevenue = revenues.reduce((a, b) => a + b, 0) / revenues.length
  const maxRevenue = Math.max(...revenues)
  const minRevenue = Math.min(...revenues)

  // Day-of-week patterns
  const byDay = {}
  snapshots.forEach(s => {
    if (!s.date || !s.revenue) return
    const day = new Date(s.date).getDay()
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(s.revenue)
  })
  const dayAvgs = {}
  Object.entries(byDay).forEach(([d, vals]) => {
    dayAvgs[d] = vals.reduce((a, b) => a + b, 0) / vals.length
  })

  const bestDay = Object.entries(dayAvgs).sort((a, b) => b[1] - a[1])[0]
  const worstDay = Object.entries(dayAvgs).sort((a, b) => a[1] - b[1])[0]
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

  return {
    avgRevenue,
    maxRevenue,
    minRevenue,
    bestDayName: bestDay ? dayNames[bestDay[0]] : null,
    bestDayAvg: bestDay ? bestDay[1] : null,
    worstDayName: worstDay ? dayNames[worstDay[0]] : null,
    worstDayAvg: worstDay ? worstDay[1] : null,
  }
}

// ─── RECORD INSIGHT SHOWN ────────────────────────────────────────
export async function recordInsightShown(shopId, insight, stats) {
  try {
    await pb.collection(C.INSIGHTS).create({
      shop_id: shopId,
      insight_type: insight.type_key || insight.type,
      shown_at: new Date().toISOString().replace('T', ' ').replace('Z', '.000Z'),
      dismissed: false,
      data_snapshot: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        revenue: stats?.revenue || 0,
        grossProfit: stats?.grossProfit || 0,
        salesCount: stats?.salesCount || 0,
        totalExpenses: stats?.totalExpenses || 0,
        lowStockCount: stats?.lowStockCount || 0,
      }),
    })
  } catch {
    // Silent — never crash the dashboard over insight logging
  }
}

// ─── MAIN INSIGHT GENERATOR ──────────────────────────────────────
export function generateInsight({ stats, hourData, shop, period, memory }) {
  const { shownTypes = {}, baseline = null, daysOfData = 0 } = memory || {}

  const wasRecentlyShown = (typeKey) => {
    if (!shownTypes[typeKey]) return false
    const daysSince = (Date.now() - new Date(shownTypes[typeKey]).getTime()) / 86400000
    return daysSince < 3
  }

  const candidates = []

  // ── ZERO SALES (highest urgency) ────────────────────────────────
  if (stats?.salesCount === 0 && !wasRecentlyShown('zero_sales')) {
    const hour = new Date().getHours()
    if (hour >= 9 && hour <= 17) {
      candidates.push({
        priority: 10,
        type_key: 'zero_sales',
        emoji: '📲',
        title: 'No sales yet today',
        body: `Send a quick WhatsApp to your top 3 customers with a small offer — even a 5% discount takes 2 minutes and often triggers a visit.`,
        type: 'tip',
      })
    }
  }

  // ── REVENUE TREND (with baseline memory) ────────────────────────
  if (stats?.revenue > 0 && stats?.prevRevenue > 0 && !wasRecentlyShown('revenue_trend')) {
    const pct = ((stats.revenue - stats.prevRevenue) / stats.prevRevenue) * 100
    if (pct >= 20) {
      candidates.push({
        priority: 10,
        type_key: 'revenue_trend',
        emoji: '🚀',
        title: 'Strong growth day',
        body: baseline && baseline.avgRevenue > 0
          ? `Revenue is up ${pct.toFixed(0)}% vs yesterday and ${((stats.revenue / baseline.avgRevenue - 1) * 100).toFixed(0)}% above your 30-day average. Your best performers are driving this — stock up before the week peaks.`
          : `Revenue is up ${pct.toFixed(0)}% vs yesterday. Your top performers are driving it — consider stocking up before the week peaks.`,
        type: 'positive',
      })
    } else if (pct <= -25) {
      candidates.push({
        priority: 9,
        type_key: 'revenue_trend',
        emoji: '⚠️',
        title: 'Slow day alert',
        body: `Revenue is down ${Math.abs(pct).toFixed(0)}% vs yesterday. A quick WhatsApp flash deal to your top 5 customers could recover KES ${Math.round(Math.abs(stats.prevRevenue - stats.revenue)).toLocaleString('en-KE')}.`,
        type: 'warning',
      })
    }
  }

  // ── DAY-OF-WEEK PATTERN (needs 7+ days of memory) ───────────────
  if (baseline && daysOfData >= 7 && !wasRecentlyShown('day_pattern')) {
    const today = new Date().getDay()
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    if (baseline.worstDayName === dayNames[today] && baseline.worstDayAvg < baseline.avgRevenue * 0.7) {
      candidates.push({
        priority: 8,
        type_key: 'day_pattern',
        emoji: '📅',
        title: `${dayNames[today]}s are historically slow for you`,
        body: `Your data shows ${dayNames[today]} averages KES ${Math.round(baseline.worstDayAvg).toLocaleString('en-KE')} vs your KES ${Math.round(baseline.avgRevenue).toLocaleString('en-KE')} daily average. Send a ${dayNames[today]}-only promo to flip this pattern.`,
        type: 'tip',
      })
    }
    if (baseline.bestDayName === dayNames[today]) {
      candidates.push({
        priority: 5,
        type_key: 'day_pattern',
        emoji: '🔥',
        title: `${dayNames[today]} is your best day`,
        body: `Your data shows ${dayNames[today]} is your strongest day — averaging KES ${Math.round(baseline.bestDayAvg).toLocaleString('en-KE')}. Make sure you're fully staffed and stocked right now.`,
        type: 'positive',
      })
    }
  }

  // ── BEST EVER (needs 30+ days) ───────────────────────────────────
  if (baseline && daysOfData >= 30 && stats?.revenue > 0 && !wasRecentlyShown('best_ever')) {
    if (stats.revenue > baseline.maxRevenue * 0.95) {
      candidates.push({
        priority: 10,
        type_key: 'best_ever',
        emoji: '🏆',
        title: 'On track for your best day ever',
        body: `Today's revenue is approaching your all-time record of KES ${Math.round(baseline.maxRevenue).toLocaleString('en-KE')}. Keep the momentum — avoid discounting your best sellers right now.`,
        type: 'positive',
      })
    }
  }

  // ── MARGIN ALERT ─────────────────────────────────────────────────
  if (stats?.revenue > 0 && !wasRecentlyShown('margin_alert')) {
    const margin = (stats.grossProfit / stats.revenue) * 100
    if (margin < 20 && stats.grossProfit >= 0) {
      candidates.push({
        priority: 8,
        type_key: 'margin_alert',
        emoji: '💡',
        title: 'Margin is below healthy range',
        body: `Your gross margin is ${margin.toFixed(0)}% — healthy shops run at 35–50%. Check if any products are priced below cost or heavily discounted today.`,
        type: 'warning',
      })
    } else if (margin >= 50 && !wasRecentlyShown('margin_excellent')) {
      candidates.push({
        priority: 6,
        type_key: 'margin_excellent',
        emoji: '📈',
        title: 'Excellent margins today',
        body: `${margin.toFixed(0)}% gross margin — top tier. Protect this by avoiding unnecessary discounts on your best sellers.`,
        type: 'positive',
      })
    }
  }

  // ── DEAD HOURS ───────────────────────────────────────────────────
  if (hourData?.length === 24 && !wasRecentlyShown('dead_hours')) {
    const max = Math.max(...hourData.map(h => h.count), 1)
    const deadHours = hourData.filter(h => h.count < max * 0.1 && h.hour >= 8 && h.hour <= 20)
    if (deadHours.length >= 2) {
      const deadStart = deadHours[0].hour
      candidates.push({
        priority: 7,
        type_key: 'dead_hours',
        emoji: '🕐',
        title: 'Dead hour opportunity',
        body: `Your shop goes quiet around ${String(deadStart).padStart(2,'0')}:00. Send a WhatsApp offer at ${String(Math.max(7, deadStart - 1)).padStart(2,'0')}:30 — even 2 extra sales fills that gap and covers the hour's rent.`,
        type: 'tip',
      })
    }
  }

  // ── LOW STOCK ────────────────────────────────────────────────────
  if (stats?.lowStockCount >= 3 && !wasRecentlyShown('low_stock_urgent')) {
    candidates.push({
      priority: 9,
      type_key: 'low_stock_urgent',
      emoji: '📦',
      title: 'Restock urgently — multiple items low',
      body: `${stats.lowStockCount} products are running low. Stockouts cost 2–3x the reorder cost in lost sales — call your supplier today.`,
      type: 'warning',
    })
  } else if ((stats?.lowStockCount === 1 || stats?.lowStockCount === 2) && !wasRecentlyShown('low_stock_reminder')) {
    candidates.push({
      priority: 5,
      type_key: 'low_stock_reminder',
      emoji: '📦',
      title: 'Low stock reminder',
      body: `${stats.lowStockCount} product${stats.lowStockCount > 1 ? 's are' : ' is'} approaching reorder point. Add to your next supplier order before it runs out mid-week.`,
      type: 'tip',
    })
  }

  // ── EXPENSE RATIO ────────────────────────────────────────────────
  if (stats?.revenue > 0 && stats?.totalExpenses > 0 && !wasRecentlyShown('expense_ratio')) {
    const expRatio = (stats.totalExpenses / stats.revenue) * 100
    if (expRatio > 60) {
      candidates.push({
        priority: 8,
        type_key: 'expense_ratio',
        emoji: '💸',
        title: 'Expenses are eating revenue',
        body: `Expenses are ${expRatio.toFixed(0)}% of today's revenue — target below 40%. Review your biggest expense category this week and look for one item to reduce or delay.`,
        type: 'warning',
      })
    }
  }

  // ── HIGH TRANSACTION COUNT ───────────────────────────────────────
  if (stats?.salesCount >= 20 && !wasRecentlyShown('busy_day')) {
    candidates.push({
      priority: 3,
      type_key: 'busy_day',
      emoji: '🎯',
      title: 'Busy day — protect your margins',
      body: `${stats.salesCount} transactions so far. On high-volume days, avoid ad-hoc discounts — your avg order of KES ${Math.round(stats.avgOrderValue || 0).toLocaleString('en-KE')} compounds fast.`,
      type: 'positive',
    })
  }

  // ── FALLBACK (always available) ──────────────────────────────────
  candidates.push({
    priority: 1,
    type_key: 'upsell_tip',
    emoji: '💡',
    title: "Today's growth tip",
    body: `The fastest way to grow revenue without new customers: increase average order value. Next time someone buys, suggest one complementary product — 1 in 5 will say yes.`,
    type: 'tip',
  })

  candidates.sort((a, b) => b.priority - a.priority)
  return candidates[0]
}

// ─── SALES ASSISTANT DATA ────────────────────────────────────────
// Returns actionable customer and product intelligence
export async function loadSalesAssistant(shopId, shop) {
  const cacheKey = `st_assistant_${shopId}_${new Date().toDateString()}`
  const cached = sessionStorage.getItem(cacheKey)
  if (cached) return JSON.parse(cached)

  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000)
      .toISOString().replace('T', ' ').replace('Z', '.000Z')

    const [lapsedRes, topCustomers] = await Promise.all([
      // Customers with no recent purchase
      pb.collection(C.CUSTOMERS).getList(1, 500, {
        filter: `shop_id="${shopId}" && updated < "${fourteenDaysAgo}"`,
        sort: '-total_spent_kes',
        '$autoCancel': false,
        '$cancelKey': 'assistant-lapsed',
      }),
      pb.collection(C.CUSTOMERS).getList(1, 5, {
        filter: `shop_id="${shopId}"`,
        sort: '-total_spent_kes',
        '$autoCancel': false,
        '$cancelKey': 'assistant-top',
      }),
    ])

    const lapsed = lapsedRes.items.filter(c => c.total_spent_kes > 0).slice(0, 5)
    const result = {
      lapsedCustomers: lapsed.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        totalSpent: c.total_spent_kes,
        daysSince: c.updated ? Math.floor((Date.now() - new Date(c.updated).getTime()) / 86400000) : null,
      })),
      topCustomers: topCustomers.items.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        totalSpent: c.total_spent_kes,
      })),
    }

    sessionStorage.setItem(cacheKey, JSON.stringify(result))
    return result
  } catch {
    return { lapsedCustomers: [], topCustomers: [] }
  }
}

// ─── DAILY SHARE CARD DATA ───────────────────────────────────────
export function buildShareCardData({ stats, shop, period }) {
  const periodLabel = period === 'today' ? 'Today' : period === '7d' ? 'Last 7 Days' : 'This Month'
  const margin = stats?.revenue > 0 ? ((stats.grossProfit / stats.revenue) * 100).toFixed(0) : '0'
  return {
    shopName: shop?.name || 'My Shop',
    periodLabel,
    revenue: stats?.revenue || 0,
    grossProfit: stats?.grossProfit || 0,
    netProfit: stats?.netProfit || 0,
    transactions: stats?.salesCount || 0,
    margin,
    netPositive: (stats?.netProfit || 0) >= 0,
    currency: shop?.currency || 'KES',
    date: new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  }
}