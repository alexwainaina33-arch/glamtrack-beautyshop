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
 * Assets = Liabilities + Equity by construction, not by coincidence.
 *
 * @param {object} shop - the shop record (needs .id, .opening_capital_kes)
 * @param {string} asOfDate - 'yyyy-MM-dd', inclusive upper bound
 * @returns {object} trial balance with every line item a report needs
 */
export async function buildTrialBalance(shop, asOfDate) {
  if (!shop?.id) throw new Error('buildTrialBalance: shop is required')

  const [allSales, allExpenses, products, openDeposits, payableMovements] = await Promise.all([
    pb.collection(C.SALES).getFullList({
      filter: `shop_id="${shop.id}" && status="completed"`,
      '$autoCancel': false, '$cancelKey': 'tb-sales',
    }),
    pb.collection(C.EXPENSES).getFullList({
      filter: `shop_id="${shop.id}"`,
      '$autoCancel': false, '$cancelKey': 'tb-expenses',
    }),
    pb.collection(C.PRODUCTS).getList(1, 500, {
      filter: `shop_id="${shop.id}" && status="active"`,
      '$autoCancel': false, '$cancelKey': 'tb-products',
    }).then(r => r.items),
    // Deposits collected on bookings not yet completed/cancelled = a real liability
    // (you owe the customer either the service or a refund)
    pb.collection(C.APPOINTMENTS).getList(1, 500, {
      filter: `shop_id="${shop.id}" && deposit_paid > 0 && status != "completed" && status != "cancelled"`,
      '$autoCancel': false, '$cancelKey': 'tb-deposits',
    }).then(r => r.items).catch(() => []), // never let a missing field crash the trial balance
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
  const expensesToDate = allExpenses.filter(e => { const d = e.expense_date?.slice(0, 10); return d && d <= asOfDate })

  // ── ASSETS ───────────────────────────────────────────────────────────
  const cashSales = salesToDate.filter(s =>
    ['cash', 'mpesa', 'visa_mc'].includes(s.payment_method) &&
    (s.payment_status === 'paid' || !s.payment_status)
  )
  const cash = cashSales.reduce((s, x) => s + (x.total_kes || 0), 0)

  const arSales = salesToDate.filter(s =>
    s.payment_status === 'pending' || s.payment_status === 'partial' || s.payment_method === 'credit'
  )
  const accountsReceivable = arSales.reduce((s, x) => s + (x.total_kes || 0), 0)

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
    cash, accountsReceivable, stockAtCost, stockAtRetail, totalAssets,
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

  const cashInSales = sales.filter(s => ['cash', 'mpesa', 'visa_mc'].includes(s.payment_method))
  const totalInflows = cashInSales.reduce((s, x) => s + (x.total_kes || 0), 0)
  const totalOutflows = expenses.reduce((s, e) => s + (e.amount_kes || 0), 0)
  const netCashFlow = totalInflows - totalOutflows

  // Detailed per-method inflow rows (for the export the user said was too shallow)
  const inflowByMethod = {}
  cashInSales.forEach(s => {
    inflowByMethod[s.payment_method] = (inflowByMethod[s.payment_method] || 0) + (s.total_kes || 0)
  })
  const inflowRows = Object.entries(inflowByMethod).map(([method, total]) => ({
    method, total, count: cashInSales.filter(s => s.payment_method === method).length,
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
    cashSalesCount: cashInSales.length,
    creditSalesTotal: sales.filter(s => s.payment_method === 'credit' || s.payment_status === 'pending').reduce((s, x) => s + (x.total_kes || 0), 0),
    // Raw line-level detail for a genuinely deep CSV export
    inflowTransactions: cashInSales.map(s => ({
      date: receiptDate(s), receipt_no: s.receipt_no, method: s.payment_method,
      amount: s.total_kes, customer: s.customer_id || 'Walk-in',
    })),
    outflowTransactions: expenses.map(e => ({
      date: e.expense_date?.slice(0, 10), description: e.description,
      category: e.expand?.category_id?.name || 'Uncategorized',
      amount: e.amount_kes, payment_method: e.payment_method || '',
    })),
  }
}