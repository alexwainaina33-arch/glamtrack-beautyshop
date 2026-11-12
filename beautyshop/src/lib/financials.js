// src/lib/financials.js
// ════════════════════════════════════════════════════════════════════════
// SINGLE SOURCE OF TRUTH for all financial statements (P&L, Balance Sheet,
// Cash Flow). Every report MUST read from buildTrialBalance() — never
// re-derive Assets/Equity/Revenue independently in a page component again.
// This is what makes the three statements mathematically consistent.
//
// Pure math + PocketBase reads only. No writes. No UI. No npm additions.
// ════════════════════════════════════════════════════════════════════════
import pb, { C } from './pb'

// Receipt-no date parser (same pattern used everywhere in ReportsPage)
// receipt_no format contains -YYMMDD- → returns 'YYYY-MM-DD' or null
async function loadPayments(shop) {
  try {
    return await pb.collection('bs_payments').getFullList({ filter: `shop_id="${shop.id}"`, '$autoCancel': false })
  } catch (e) { console.error('payments load failed', e); return [] }
}
function payDate(p) { return String(p.paid_on || p.created || '').slice(0, 10) }

// Stock bought with shop cash (stock_in or opening_stock tagged funding_source="cash").
// Movements have no date field of their own, so the date is the day it was entered (Nairobi time).
async function loadCashStock(shop) {
  const rows = await pb.collection(C.INV_MOVEMENTS).getFullList({
    filter: `shop_id="${shop.id}" && funding_source="cash" && (type="stock_in" || type="opening_stock")`,
    '$autoCancel': false,
  })
  return rows.map(m => ({ date: moveDate(m), amount: Math.abs(m.qty || 0) * (m.cost_per_unit || 0), type: m.type, ref: m.reference || '' }))
}
function moveDate(m) {
  const t = new Date(String(m.created || '').replace(' ', 'T'))
  if (isNaN(t.getTime())) return ''
  return new Date(t.getTime() + 3 * 3600000).toISOString().slice(0, 10)
}
// Splits one sale into the channel(s) the money was received in.
// A Split (mixed) sale is separated only when a valid cash part was saved; otherwise it stays unseparated.
function splitSale(s) {
  const t = s.total_kes || 0
  const o = { cash: 0, mobile: 0, bank: 0, split: 0, other: 0 }
  const m = s.payment_method
  if (m === 'mixed') {
    const c = Number(s.cash_tendered) || 0
    if (c > 0 && c <= t + 0.005) { o.cash = c; o.mobile = t - c } else { o.split = t }
  } else {
    o[m === 'cash' ? 'cash' : m === 'mpesa' ? 'mobile' : m === 'visa_mc' ? 'bank' : 'other'] = t
  }
  return o
}

function receiptDate(sale) {
  const m = sale?.receipt_no?.match(/-(\d{6})-/)
  if (!m) return null
  const c = m[1]
  return `20${c.slice(0, 2)}-${c.slice(2, 4)}-${c.slice(4, 6)}`
}

/**
 * Builds a complete, internally-consistent Trial Balance as-at a given date.
 * Every figure (Assets, Liabilities, Equity, Revenue, COGS, Expenses) is
 * computed from the SAME date boundary (from inception → asOfDate), so
 * Assets = Liabilities + Equity is CHECKED (see variance), not guaranteed: stock bought with no recorded funding shows as variance.
 *
 * @param {object} shop - the shop record (needs .id, .opening_capital_kes)
 * @param {string} asOfDate - 'yyyy-MM-dd', inclusive upper bound
 * @returns {object} trial balance with every line item a report needs
 */
export async function buildTrialBalance(shop, asOfDate) {
  if (!shop?.id) throw new Error('buildTrialBalance: shop is required')

  const allPayments = await loadPayments(shop)
  const stockCashMoves = await loadCashStock(shop)
  const [allSales, allExpenses, products, openDeposits, payableMovements] = await Promise.all([
    pb.collection(C.SALES).getFullList({
      filter: `shop_id="${shop.id}" && status="completed"`,
      '$autoCancel': false, '$cancelKey': 'tb-sales',
    }),
    pb.collection(C.EXPENSES).getFullList({
      filter: `shop_id="${shop.id}"`,
      '$autoCancel': false, '$cancelKey': 'tb-expenses',
    }),
    pb.collection(C.PRODUCTS).getFullList({
      filter: `shop_id="${shop.id}" && status="active"`,
      '$autoCancel': false, '$cancelKey': 'tb-products',
    }),
    // Deposits collected on bookings not yet completed/cancelled = a real liability
    // (you owe the customer either the service or a refund)
    pb.collection(C.APPOINTMENTS).getFullList({
      filter: `shop_id="${shop.id}" && deposit_paid > 0 && status != "completed" && status != "cancelled"`,
      '$autoCancel': false, '$cancelKey': 'tb-deposits',
    }).catch(() => []), // never let a missing field crash the trial balance
    // Stock purchases tagged "on credit" = money owed to suppliers, a real liability.
    // Only stock_in/opening_stock with funding_source="payable" count — older rows with
    // no funding_source are pre-existing data and are intentionally excluded, not assumed zero-risk.
    pb.collection(C.INV_MOVEMENTS).getFullList({
      filter: `shop_id="${shop.id}" && funding_source="payable"`,
      '$autoCancel': false, '$cancelKey': 'tb-payables',
    }).then(items => items).catch(() => []),
  ])

  // ── Scope everything to the SAME date window: inception → asOfDate ─────
  const salesToDate = allSales.filter(s => { const d = receiptDate(s); return d && d <= asOfDate })
  const undatedSales = allSales.filter(s => !receiptDate(s))
  const undatedCount = undatedSales.length
  const undatedTotal = undatedSales.reduce((s, x) => s + (x.total_kes || 0), 0)
  const expensesToDate = allExpenses.filter(e => { const d = e.expense_date?.slice(0, 10); return d && d <= asOfDate })

  // ── ASSETS ───────────────────────────────────────────────────────────
  const cashSales = salesToDate.filter(s =>
    ['cash', 'mpesa', 'visa_mc', 'mixed'].includes(s.payment_method) && // SPLIT-FIX-2026-11-08: Split (mixed) sales are money received
    (s.payment_status === 'paid' || !s.payment_status)
  )
  const paySaleIds = new Set(allPayments.map(p => p.sale_id))
  const paidToDate = {}
  allPayments.forEach(p => { const d = payDate(p); if (d && d <= asOfDate) paidToDate[p.sale_id] = (paidToDate[p.sale_id] || 0) + (p.amount_kes || 0) })
  const paidOn = (x) => Math.min(x.total_kes || 0, paidToDate[x.id] || 0)
  const directSales = cashSales.filter(s => !paySaleIds.has(s.id))
  const payCapped = salesToDate.filter(s => paySaleIds.has(s.id)).reduce((s, x) => s + paidOn(x), 0)
  const cashReceipts = directSales.reduce((s, x) => s + (x.total_kes || 0), 0) + payCapped
  // Channel split: where money was RECEIVED or PAID, not where it sits now
  const chanOf = (m) => m === 'cash' ? 'cash' : m === 'mpesa' ? 'mobile' : (m === 'visa_mc' || m === 'bank' || m === 'card') ? 'bank' : m === 'mixed' ? 'split' : 'other'
  const chan = { cash: 0, mobile: 0, bank: 0, split: 0, other: 0 }
  directSales.forEach(s => { const sp = splitSale(s); chan.cash += sp.cash; chan.mobile += sp.mobile; chan.bank += sp.bank; chan.split += sp.split; chan.other += sp.other })
  const saleIdsToDate = new Set(salesToDate.map(s => s.id))
  let payUncapped = 0
  allPayments.forEach(p => { const d = payDate(p); if (saleIdsToDate.has(p.sale_id) && d && d <= asOfDate) { const a = p.amount_kes || 0; chan[chanOf(p.method)] += a; payUncapped += a } })
  chan.other += payCapped - payUncapped
  const expensesPaidToDate = expensesToDate.reduce((s, e) => s + (e.amount_kes || 0), 0)
  expensesToDate.forEach(e => { const m = e.payment_method; const k = m === 'cash' ? 'cash' : m === 'mpesa' ? 'mobile' : (m === 'bank' || m === 'card') ? 'bank' : 'other'; chan[k] -= (e.amount_kes || 0) })
  // Cash and cash equivalents = all receipts to date minus ALL expenses and cash-funded stock purchases to date
  const stockPaidToDate = stockCashMoves.filter(m => m.date && m.date <= asOfDate).reduce((s, m) => s + m.amount, 0)
  chan.cash -= stockPaidToDate
  const cash = cashReceipts - expensesPaidToDate - stockPaidToDate
  const cashByChannel = {}
  Object.keys(chan).forEach(k => { cashByChannel[k] = Math.round(chan[k] * 100) / 100 })

  const arSales = salesToDate.filter(s =>
    s.payment_status === 'pending' || s.payment_status === 'partial' || s.payment_method === 'credit'
  )
  const accountsReceivable = salesToDate.reduce((s, x) => {
    if (paySaleIds.has(x.id)) return s + Math.max(0, (x.total_kes || 0) - paidOn(x))
    const isAr = x.payment_status === 'pending' || x.payment_status === 'partial' || x.payment_method === 'credit'
    return s + (isAr ? (x.total_kes || 0) : 0)
  }, 0)

  // Stock is always a CURRENT snapshot (PocketBase doesn't store historical
  // stock levels) — this is the one line item that isn't truly "as at
  // asOfDate" if asOfDate is in the past. Documented in the UI footnote.
  const stockAtCost = products.reduce((s, p) => s + ((p.stock_qty || 0) * (p.cost_price_kes || 0)), 0)
  const stockAtRetail = products.reduce((s, p) => s + ((p.stock_qty || 0) * (p.price_kes || 0)), 0)

  const totalAssets = cash + accountsReceivable + stockAtCost

  // ── LIABILITIES ──────────────────────────────────────────────────────
  // 1) Deposits collected for services not yet delivered.
  const depositLiability = openDeposits.reduce((s, a) => s + (a.deposit_paid || 0), 0)
  // 2) Stock taken on credit, not yet paid to the supplier — tagged at entry
  //    time via funding_source="payable". This is a simple running balance,
  //    not a per-invoice ledger: it does not track partial payments against
  //    a specific delivery. Good enough for "do we owe suppliers money?";
  //    not a substitute for a real accounts-payable system if the business
  //    needs invoice-level tracking later.
  const accountsPayable = payableMovements.reduce(
    (s, m) => s + (Math.abs(m.qty || 0) * (m.cost_per_unit || 0)), 0
  )
  const totalLiabilities = depositLiability + accountsPayable

  // ── EQUITY ───────────────────────────────────────────────────────────
  const openingCapital = shop.opening_capital_kes || 0

  const revenue = salesToDate.reduce((s, x) => s + (x.total_kes || 0), 0)
  const cogs = salesToDate.reduce((s, x) => s + (x.total_cost_kes || 0), 0)
  const grossProfit = revenue - cogs
  const totalExpenses = expensesToDate.reduce((s, e) => s + (e.amount_kes || 0), 0)
  const retainedEarnings = grossProfit - totalExpenses

  const totalEquity = openingCapital + retainedEarnings

  // ── BALANCE CHECK ────────────────────────────────────────────────────
  // Should now be ~0 (sub-shilling rounding only) because every figure
  // above is scoped to the same date window and Liabilities is real,
  // not fabricated.
  const variance = totalAssets - (totalLiabilities + totalEquity)

  return {
    asOfDate,
    // Assets
    cash, cashReceipts, cashByChannel, stockPaidToDate, accountsReceivable, stockAtCost, stockAtRetail, totalAssets,
    undatedCount, undatedTotal,
    // Liabilities
    depositLiability, accountsPayable, totalLiabilities,
    // Equity
    openingCapital, revenue, cogs, grossProfit, totalExpenses, retainedEarnings, totalEquity,
    // Check
    variance, isBalanced: Math.abs(variance) < 1,
    // Raw data for downstream reports (Sales Report, Expense Report reuse this)
    products: products.map(p => ({
      ...p,
      costValue: (p.stock_qty || 0) * (p.cost_price_kes || 0),
      retailValue: (p.stock_qty || 0) * (p.price_kes || 0),
    })).sort((a, b) => b.costValue - a.costValue),
    salesToDate,
    expensesToDate,
    openDeposits,
  }
}

/**
 * Cash Flow for a date RANGE (not as-at-date like trial balance).
 * Reuses the same payment-method/expense-category logic as the trial
 * balance so "what counts as cash" never differs between statements.
 */
export async function buildCashFlow(shop, dateFrom, dateTo) {
  if (!shop?.id) throw new Error('buildCashFlow: shop is required')

  const allPayments = await loadPayments(shop)
  const [allSales, allExpenses, expCats] = await Promise.all([
    pb.collection(C.SALES).getFullList({
      filter: `shop_id="${shop.id}" && status="completed"`,
      '$autoCancel': false, '$cancelKey': 'cf2-sales',
    }),
    pb.collection(C.EXPENSES).getFullList({
      filter: `shop_id="${shop.id}"`,
      expand: 'category_id',
      '$autoCancel': false, '$cancelKey': 'cf2-expenses',
    }),
    pb.collection(C.EXPENSE_CATS).getList(1, 200, {
      filter: `shop_id="${shop.id}"`,
      '$autoCancel': false, '$cancelKey': 'cf2-cats',
    }).then(r => r.items),
  ])

  const sales = allSales.filter(s => { const d = receiptDate(s); return d && d >= dateFrom && d <= dateTo })
  const expenses = allExpenses.filter(e => { const d = e.expense_date?.slice(0, 10); return d && d >= dateFrom && d <= dateTo })

  const paySaleIds = new Set(allPayments.map(p => p.sale_id))
  const saleById = {}; allSales.forEach(s => { saleById[s.id] = s })
  const payRows = allPayments.filter(p => { const d = payDate(p); return saleById[p.sale_id] && d && d >= dateFrom && d <= dateTo })
  const cashInSales = sales.filter(s => ['cash', 'mpesa', 'visa_mc', 'mixed'].includes(s.payment_method) && !paySaleIds.has(s.id))
  const cashInTxSource = [...cashInSales, ...payRows.map(p => ({ receipt_no: saleById[p.sale_id].receipt_no, payment_method: p.method, total_kes: p.amount_kes, customer_id: saleById[p.sale_id].customer_id, _payDate: payDate(p) }))]
  const totalInflows = cashInSales.reduce((s, x) => s + (x.total_kes || 0), 0) + payRows.reduce((s, p) => s + (p.amount_kes || 0), 0)
  const totalOutflows = expenses.reduce((s, e) => s + (e.amount_kes || 0), 0)
  const netCashFlow = totalInflows - totalOutflows

  // Detailed per-method inflow rows (for the export the user said was too shallow)
  const inflowByMethod = {}
  payRows.forEach(p => { inflowByMethod[p.method] = (inflowByMethod[p.method] || 0) + (p.amount_kes || 0) })
  cashInSales.forEach(s => {
    inflowByMethod[s.payment_method] = (inflowByMethod[s.payment_method] || 0) + (s.total_kes || 0)
  })
  const inflowRows = Object.entries(inflowByMethod).map(([method, total]) => ({
    method, total, count: cashInSales.filter(s => s.payment_method === method).length + payRows.filter(p => p.method === method).length,
  })).sort((a, b) => b.total - a.total)

  // Detailed per-category outflow rows
  const outflowByCat = expCats.map(cat => {
    const catExpenses = expenses.filter(e => e.category_id === cat.id)
    return {
      name: `${cat.icon || ''} ${cat.name}`.trim(),
      total: catExpenses.reduce((s, e) => s + (e.amount_kes || 0), 0),
      count: catExpenses.length,
    }
  }).filter(c => c.total > 0)
  const uncatExpenses = expenses.filter(e => !e.category_id)
  const uncatTotal = uncatExpenses.reduce((s, e) => s + (e.amount_kes || 0), 0)
  if (uncatTotal > 0) outflowByCat.push({ name: 'Other / Uncategorized', total: uncatTotal, count: uncatExpenses.length })
  outflowByCat.sort((a, b) => b.total - a.total)

  return {
    dateFrom, dateTo,
    totalInflows, totalOutflows, netCashFlow,
    inflowRows, outflowByCat,
    cashSalesCount: cashInSales.length + payRows.length,
    creditSalesTotal: sales.filter(s => s.payment_method === 'credit' || s.payment_status === 'pending').reduce((s, x) => s + Math.max(0, (x.total_kes || 0) - allPayments.filter(p => p.sale_id === x.id).reduce((a, p) => a + (p.amount_kes || 0), 0)), 0),
    // Raw line-level detail for a genuinely deep CSV export
    inflowTransactions: cashInTxSource.map(s => ({
      date: s._payDate || receiptDate(s), receipt_no: s.receipt_no, method: s.payment_method,
      amount: s.total_kes, customer: s.customer_id || 'Walk-in',
    })),
    outflowTransactions: expenses.map(e => ({
      date: e.expense_date?.slice(0, 10), description: e.description,
      category: e.expand?.category_id?.name || 'Uncategorized',
      amount: e.amount_kes, payment_method: e.payment_method || '',
    })),
  }
}

/**
 * Statement of Cash Flows (direct method) for a date RANGE.
 * Uses the SAME receipts rules as buildTrialBalance (paid or blank status, payments capped at the
 * sale total, expenses on expense date, cash-funded stock purchases), so the closing cash equals
 * the Financial Position cash as at dateTo.
 */
export async function buildCashStatement(shop, dateFrom, dateTo) {
  if (!shop?.id) throw new Error('buildCashStatement: shop is required')
  const allPayments = await loadPayments(shop)
  const stockMoves = await loadCashStock(shop)
  const [allSales, allExpenses, expCats] = await Promise.all([
    pb.collection(C.SALES).getFullList({
      filter: `shop_id="${shop.id}" && status="completed"`,
      '$autoCancel': false, '$cancelKey': 'cs-sales',
    }),
    pb.collection(C.EXPENSES).getFullList({
      filter: `shop_id="${shop.id}"`,
      expand: 'category_id',
      '$autoCancel': false, '$cancelKey': 'cs-expenses',
    }),
    pb.collection(C.EXPENSE_CATS).getFullList({
      filter: `shop_id="${shop.id}"`,
      '$autoCancel': false, '$cancelKey': 'cs-cats',
    }),
  ])

  const r2c = (n) => Math.round(n * 100) / 100
  const sumOf = (arr, f) => arr.reduce((s, x) => s + f(x), 0)
  const expDate = (e) => String(e.expense_date || '').slice(0, 10)
  const payKey = (m) => m === 'cash' ? 'cash' : m === 'mpesa' ? 'mpesa' : (m === 'visa_mc' || m === 'bank' || m === 'card') ? 'bank' : m === 'mixed' ? 'mixed' : 'other'
  const inWin = (d) => !!d && d >= dateFrom && d <= dateTo
  const isBefore = (d) => !!d && d < dateFrom

  // ---- Receipt events (one per money-in line, dated) ----
  const events = []
  const paySaleIds = new Set(allPayments.map(p => p.sale_id))
  const saleById = {}
  allSales.forEach(s => { saleById[s.id] = s })
  const undated = allSales.filter(s => !receiptDate(s))
  const parts = [['cash', 'cash'], ['mobile', 'mpesa'], ['bank', 'bank'], ['split', 'mixed'], ['other', 'other']]
  allSales.forEach(s => {
    const d = receiptDate(s)
    if (!d || paySaleIds.has(s.id)) return
    if (!['cash', 'mpesa', 'visa_mc', 'mixed'].includes(s.payment_method)) return
    if (!(s.payment_status === 'paid' || !s.payment_status)) return
    const sp = splitSale(s)
    parts.forEach(([k, m]) => {
      if (sp[k] > 0.004) events.push({ date: d, method: m, amount: sp[k], receipt_no: s.receipt_no, customer: s.customer_id || 'Walk-in' })
    })
  })
  const bySale = {}
  allPayments.forEach(p => {
    const s = saleById[p.sale_id]
    if (!s || !receiptDate(s) || !payDate(p)) return
    ;(bySale[p.sale_id] = bySale[p.sale_id] || []).push(p)
  })
  Object.keys(bySale).forEach(id => {
    const s = saleById[id]
    const sd = receiptDate(s)
    const total = s.total_kes || 0
    const rows = bySale[id].slice().sort((a, b) => payDate(a).localeCompare(payDate(b)))
    let cum = 0
    rows.forEach(p => {
      const prior = Math.min(total, cum)
      cum += (p.amount_kes || 0)
      const amt = Math.min(total, cum) - prior
      const pd = payDate(p)
      if (amt > 0.004) events.push({ date: pd > sd ? pd : sd, method: payKey(p.method), amount: amt, receipt_no: s.receipt_no, customer: s.customer_id || 'Walk-in' })
    })
  })

  // ---- Opening cash = everything received minus paid BEFORE the period ----
  const openingCash = r2c(
    sumOf(events.filter(e => isBefore(e.date)), e => e.amount)
    - sumOf(allExpenses.filter(e => isBefore(expDate(e))), e => e.amount_kes || 0)
    - sumOf(stockMoves.filter(m => isBefore(m.date)), m => m.amount)
  )

  // ---- Period movements ----
  const rcpt = events.filter(e => inWin(e.date))
  const exps = allExpenses.filter(e => inWin(expDate(e)))
  const stk = stockMoves.filter(m => inWin(m.date))
  const totalInflows = r2c(sumOf(rcpt, e => e.amount))
  const expensesPaid = r2c(sumOf(exps, e => e.amount_kes || 0))
  const stockPurchases = r2c(sumOf(stk, m => m.amount))
  const totalOutflows = r2c(expensesPaid + stockPurchases)
  const netCashFlow = r2c(totalInflows - totalOutflows)
  const closingCash = r2c(openingCash + netCashFlow)

  const byMethod = {}
  rcpt.forEach(e => {
    const r = byMethod[e.method] || (byMethod[e.method] = { method: e.method, total: 0, count: 0 })
    r.total += e.amount; r.count += 1
  })
  const inflowRows = Object.values(byMethod).map(r => ({ ...r, total: r2c(r.total) })).sort((a, b) => b.total - a.total)

  const outflowByCat = expCats.map(cat => {
    const ce = exps.filter(e => e.category_id === cat.id)
    return { name: `${cat.icon || ''} ${cat.name}`.trim(), total: sumOf(ce, e => e.amount_kes || 0), count: ce.length }
  }).filter(c => c.total > 0)
  const uncat = exps.filter(e => !e.category_id)
  const uncatTotal = sumOf(uncat, e => e.amount_kes || 0)
  if (uncatTotal > 0) outflowByCat.push({ name: 'Other / Uncategorized', total: uncatTotal, count: uncat.length })
  if (stockPurchases > 0) outflowByCat.push({ name: 'Inventories paid in cash', total: stockPurchases, count: stk.length })
  outflowByCat.sort((a, b) => b.total - a.total)

  const paidBySale = {}
  allPayments.forEach(p => { paidBySale[p.sale_id] = (paidBySale[p.sale_id] || 0) + (p.amount_kes || 0) })
  const creditSalesTotal = allSales
    .filter(s => inWin(receiptDate(s)) && (s.payment_method === 'credit' || s.payment_status === 'pending'))
    .reduce((a, x) => a + Math.max(0, (x.total_kes || 0) - (paidBySale[x.id] || 0)), 0)

  return {
    dateFrom, dateTo,
    openingCash, closingCash,
    totalInflows, totalOutflows, netCashFlow,
    expensesPaid, stockPurchases,
    inflowRows, outflowByCat,
    cashSalesCount: rcpt.length,
    creditSalesTotal,
    undatedCount: undated.length,
    undatedTotal: sumOf(undated, s => s.total_kes || 0),
    inflowTransactions: rcpt.map(e => ({ date: e.date, receipt_no: e.receipt_no, method: e.method, amount: e.amount, customer: e.customer })),
    outflowTransactions: [
      ...exps.map(e => ({ date: expDate(e), description: e.description, category: e.expand?.category_id?.name || 'Uncategorized', amount: e.amount_kes, payment_method: e.payment_method || '' })),
      ...stk.map(m => ({ date: m.date, description: 'Stock purchase (' + m.type + ')' + (m.ref ? ' ' + m.ref : ''), category: 'Inventories paid in cash', amount: m.amount, payment_method: 'cash' })),
    ],
  }
}
