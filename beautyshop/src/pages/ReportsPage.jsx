import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDate, r2 } from '../lib/utils'
import { buildTrialBalance, buildCashStatement } from '../lib/financials'
import { hasRequiredPlan } from '../lib/planAccess'
import PlanGuard from '../components/PlanGuard'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, eachMonthOfInterval } from 'date-fns'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Download, Printer, TrendingUp, TrendingDown } from 'lucide-react'
import toast from 'react-hot-toast'

const TABS = ['Profit or Loss', 'Financial Position', 'Statement of Cash Flows', 'Sales Report', 'Expense Report', 'Stock Valuation', '🏦 Lender Pack']

// ── Shared period picker component ─────────────────────────────────────────
function PeriodPicker({ dateFrom, dateTo, setDateFrom, setDateTo, style, initial = 'month' }) {
  const [period, setPeriod] = useState(initial); useEffect(() => { apply(initial) }, [])
  const apply = (v) => {
    setPeriod(v)
    if (v === 'month') {
      setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
      setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
    } else if (v === 'last_month') {
      const lm = subMonths(new Date(), 1)
      setDateFrom(format(startOfMonth(lm), 'yyyy-MM-dd'))
      setDateTo(format(endOfMonth(lm), 'yyyy-MM-dd'))
    } else if (v === 'year') {
      setDateFrom(format(startOfYear(new Date()), 'yyyy-MM-dd'))
      setDateTo(format(endOfYear(new Date()), 'yyyy-MM-dd'))
    } else if (v === 'last6') {
      setDateFrom(format(startOfMonth(subMonths(new Date(), 5)), 'yyyy-MM-dd'))
      setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
    }
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', ...style }}>
      {[['month','This Month'],['last_month','Last Month'],['last6','Last 6 Months'],['year','This Year'],['custom','Custom']].map(([v,l]) => (
        <button key={v} onClick={() => apply(v)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: period===v ? 'linear-gradient(135deg,#c8456a,#8b2550)' : '#fce8ed', color: period===v ? '#fff' : '#8b2550', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Nunito,sans-serif' }}>{l}</button>
      ))}
      {period === 'custom' && (
        <>
          <input className="input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ color: '#9b6070', fontSize: 12 }}>→</span>
          <input className="input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 140 }} />
        </>
      )}
    </div>
  )
}

export default function ReportsPage() {
  const { shop } = useAuth()
  const [tab, setTab] = useState(0)
  const canSeeLenderPack = hasRequiredPlan(shop, 'growth')
  const printRef = useRef()
  const plSeq = useRef(0)
  const erSeq = useRef(0)

  // ── Per-tab date state ─────────────────────────────────────────────────
  const [plFrom,   setPlFrom]   = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [plTo,     setPlTo]     = useState(format(endOfMonth(new Date()),   'yyyy-MM-dd'))
  const [bsDate,   setBsDate]   = useState(format(new Date(), 'yyyy-MM-dd'))
  const [cfFrom,   setCfFrom]   = useState(format(startOfMonth(subMonths(new Date(),5)), 'yyyy-MM-dd'))
  const [cfTo,     setCfTo]     = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [srFrom,   setSrFrom]   = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [srTo,     setSrTo]     = useState(format(endOfMonth(new Date()),   'yyyy-MM-dd'))
  const [erFrom,   setErFrom]   = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [erTo,     setErTo]     = useState(format(endOfMonth(new Date()),   'yyyy-MM-dd'))

  // ── Per-tab data state ─────────────────────────────────────────────────
  const [plData,   setPlData]   = useState(null)
  const [plLoad,   setPlLoad]   = useState(false)
  const [bsData,   setBsData]   = useState(null)
  const [bsLoad,   setBsLoad]   = useState(false)
  const [cfData,   setCfData]   = useState(null)
  const [cfLoad,   setCfLoad]   = useState(false)
  const [srData,   setSrData]   = useState(null)
  const [srLoad,   setSrLoad]   = useState(false)
  const [erData,   setErData]   = useState(null)
  const [erLoad,   setErLoad]   = useState(false)
  const [svData,   setSvData]   = useState(null)
  const [svLoad,   setSvLoad]   = useState(false)

  // ── Lender Pack state (unchanged) ──────────────────────────────────────
  const [lenderData,    setLenderData]    = useState(null)
  const [lenderLoading, setLenderLoading] = useState(false)
  const [dscrLoan,      setDscrLoan]      = useState('')
  const [dscrTerm,      setDscrTerm]      = useState('12')
  const [dscrRate,      setDscrRate]      = useState('14')

  // ── Receipt-no date parser (shared) ───────────────────────────────────
  const rDate = (s) => {
    const m = s?.receipt_no?.match(/-(\d{6})-/)
    if (!m) return null
    const c = m[1]
    return `20${c.slice(0,2)}-${c.slice(2,4)}-${c.slice(4,6)}`
  }

  // ── Load triggers ──────────────────────────────────────────────────────
  useEffect(() => { if (shop && tab === 0) loadPL() },   [shop, plFrom, plTo, tab])
  useEffect(() => { if (shop && tab === 1) loadBS() },   [shop, bsDate, tab])
  useEffect(() => { if (shop && tab === 2) loadCF() },   [shop, cfFrom, cfTo, tab])
  useEffect(() => { if (shop && tab === 3) loadSR() },   [shop, srFrom, srTo, tab])
  useEffect(() => { if (shop && tab === 4) loadER() },   [shop, erFrom, erTo, tab])
  useEffect(() => { if (shop && tab === 5) loadSV() },   [shop, tab])
  useEffect(() => { if (shop && tab === 6 && !lenderData) loadLenderData() }, [shop, tab])

  // ── exportCSV helper ───────────────────────────────────────────────────
  const loadAllExpenses = async () => {
    const perPage = 200
    let all = []
    for (let page = 1; page <= 50; page++) {
      const r = await pb.collection(C.EXPENSES).getList(page, perPage, { filter: `shop_id="${shop.id}"`, sort: '-expense_date', expand: 'category_id', '$autoCancel': false })
      all = all.concat(r.items)
      if (r.items.length < perPage) break
    }
    return all
  }
  const inRange = (e, f, t) => { const d = String(e.expense_date || '').slice(0, 10); return !!d && d >= f && d <= t }

  const loadPayMap = async () => {
    try {
      const rows = await pb.collection('bs_payments').getFullList({ filter: `shop_id="${shop.id}"`, '$autoCancel': false })
      const m = {}
      rows.forEach(p => { m[p.sale_id] = (m[p.sale_id] || 0) + (p.amount_kes || 0) })
      return m
    } catch (e) { console.error('payments load failed', e); return {} }
  }
  const owed = (s, m) => Math.max(0, (s.total_kes || 0) - ((m && m[s.id]) || 0))

  const exportCSV = (rows, filename) => {
    if (!rows?.length) return toast.error('No data to export')
    const headers = Object.keys(rows[0])
    const esc = v => { let s = String(typeof v === 'number' ? Math.round(v * 100) / 100 : (v ?? '')); if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"' }
    const csv = [headers.map(esc).join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const PIE_COLORS = ['#c8456a','#e6b800','#8b2550','#059669','#3b82f6','#8b5cf6','#f59e0b','#ec4899']

  // ══════════════════════════════════════════════════════════════════════
  // TAB 0 — P&L
  // ══════════════════════════════════════════════════════════════════════
  const loadPL = async () => {
    const seq = ++plSeq.current
    setPlLoad(true)
    try {
      let allCompleted = []; const payMap = await loadPayMap(); const allExpP = loadAllExpenses(); const [salesAll, expenses, expCats] = await Promise.all([
        pb.collection(C.SALES).getFullList({ filter: `shop_id="${shop.id}" && status="completed"`, '$autoCancel': false, '$cancelKey': 'pl-sales' }).then(all => { allCompleted = all; return { items: all } }).then(r => r.items.filter(x => { const d = rDate(x); return d && d >= plFrom && d <= plTo })),
        allExpP.then(all => all.filter(e => inRange(e, plFrom, plTo))),
        pb.collection(C.EXPENSE_CATS).getList(1, 200, { filter: `shop_id="${shop.id}"`, '$autoCancel': false, '$cancelKey': 'pl-expcats' }).then(r => r.items),
      ])
      const revenue      = salesAll.reduce((s,x) => s+(x.total_kes||0), 0)
      const costOfSales  = salesAll.reduce((s,x) => s+(x.total_cost_kes||0), 0)
      const grossProfit  = revenue - costOfSales
      const grossMargin  = revenue ? (grossProfit/revenue)*100 : 0
      const totalExpenses= expenses.reduce((s,x) => s+(x.amount_kes||0), 0)
      const netProfit    = grossProfit - totalExpenses
      const netMargin    = revenue ? (netProfit/revenue)*100 : 0

      const expByCat = expCats.map(cat => ({
        name: `${cat.icon||''} ${cat.name}`,
        total: expenses.filter(e => e.category_id===cat.id).reduce((s,e) => s+e.amount_kes, 0)
      })).filter(c => c.total > 0)
      const uncatExp = expenses.filter(e => !e.category_id).reduce((s,e) => s+e.amount_kes, 0)
      if (uncatExp > 0) expByCat.push({ name: 'Other', total: uncatExp })

      const payMethods = {}
      salesAll.forEach(s => { payMethods[s.payment_method] = (payMethods[s.payment_method]||0) + s.total_kes })
      const payBreakdown = Object.entries(payMethods).map(([method,total]) => ({ method,total })).sort((a,b)=>b.total-a.total)

      const customerSales = {}
      salesAll.forEach(s => {
        if (s.customer_id) {
          if (!customerSales[s.customer_id]) customerSales[s.customer_id] = { count:0, total:0 }
          customerSales[s.customer_id].count++
          customerSales[s.customer_id].total += s.total_kes
        }
      })

      const last6Months = eachMonthOfInterval({ start: subMonths(new Date(),5), end: new Date() })
      const monthlyTrend = await Promise.all(last6Months.map(async month => {
        const mKey = format(month,'yyyy-MM')
        const mF = format(startOfMonth(month),'yyyy-MM-dd')
        const mT = format(endOfMonth(month),'yyyy-MM-dd')
        const mS = allCompleted.filter(x=>{const d=rDate(x);return d&&d>=mF&&d<=mT})
        const mE = (await allExpP).filter(e => inRange(e, mF, mT))
        const rev=mS.reduce((s,x)=>s+x.total_kes,0)
        const cost=mS.reduce((s,x)=>s+(x.total_cost_kes||0),0)
        const exp=mE.reduce((s,x)=>s+x.amount_kes,0)
        return { label:format(month,'MMM yy'), revenue:rev, grossProfit:rev-cost, netProfit:rev-cost-exp, expenses:exp }
      }))

      if (seq !== plSeq.current) return
      setPlData({
        revenue, costOfSales, grossProfit, grossMargin,
        totalExpenses, netProfit, netMargin,
        expByCat, payBreakdown, monthlyTrend,
        salesCount: salesAll.length, undatedCount: allCompleted.filter(x => !rDate(x)).length,
        returningCount: Object.keys(customerSales).length,
        walkInCount: salesAll.filter(s=>!s.customer_id).length,
        avgCustomerValue: Object.keys(customerSales).length ? Object.values(customerSales).reduce((s,c)=>s+c.total,0)/Object.keys(customerSales).length : 0,
        creditOutstanding: salesAll.filter(s=>s.payment_status==='pending').reduce((s,x)=>s+owed(x,payMap),0),
      })
    } catch(err) { console.error(err); if (seq === plSeq.current) toast.error('Failed to load P&L') }
    finally { if (seq === plSeq.current) setPlLoad(false) }
  }

  const sharePLWhatsApp = () => {
    if (!plData) return
    const lines = [
      `📊 *Statement of Profit or Loss*`,`*${shop?.name||''}*`,
      `Period: ${fmtDate(new Date(plFrom))} – ${fmtDate(new Date(plTo))}`,``,
      `Revenue`,`*${fmtKES(plData.revenue)}*`,``,
      `Cost of sales`,`*(${fmtKES(plData.costOfSales)})*`,``,
      `Gross Profit`,`*${fmtKES(plData.grossProfit)} (${plData.grossMargin.toFixed(1)}% margin)*`,``,
      `Operating Expenses`,`*(${fmtKES(plData.totalExpenses)})*`,``,
      `Profit/(loss) for the period`,`*${fmtKES(plData.netProfit)} (${plData.netMargin.toFixed(1)}% margin)*`,``,
      `Transactions: ${plData.salesCount}`,``,
      `_Generated from SalesTrack business records · SalesTrack_`,
      `_${shop?.name||''} · Powered by SalesTrack_`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank')
  }

  // ══════════════════════════════════════════════════════════════════════
  // TAB 1 — BALANCE SHEET (fully automated, mathematically correct)
  // ══════════════════════════════════════════════════════════════════════
  const loadBS = async () => {
    setBsLoad(true)
    try {
      const tb = await buildTrialBalance(shop, bsDate)

      setBsData({
        // Assets
        cashReceived: tb.cash, cashReceipts: tb.cashReceipts, stockPaid: tb.stockPaidToDate, cashByChannel: tb.cashByChannel, undatedCount: tb.undatedCount, undatedTotal: tb.undatedTotal,
        accountsReceivable: tb.accountsReceivable,
        stockAtCost: tb.stockAtCost,
        stockAtRetail: tb.stockAtRetail,
        totalAssets: tb.totalAssets,
        // Liabilities
        depositLiability: tb.depositLiability,
        accountsPayable: tb.accountsPayable,
        totalLiabilities: tb.totalLiabilities,
        openDepositsCount: tb.openDeposits?.length || 0,
        // Equity
        openingCapital: tb.openingCapital,
        retainedEarnings: tb.retainedEarnings,
        balancingFigure: tb.isBalanced ? 0 : tb.variance,
        totalEquity: tb.totalEquity,
        lifetimeRevenue: tb.revenue,
        lifetimeCOGS: tb.cogs,
        lifetimeGP: tb.grossProfit,
        totalExpensesPaid: tb.totalExpenses,
        // Check
        variance: tb.variance,
        isBalanced: tb.isBalanced,
        // Stock table
        products: tb.products,
        asOf: bsDate,
      })
    } catch(err) { console.error(err); toast.error('Failed to load Balance Sheet') }
    finally { setBsLoad(false) }
  }

  const shareBSWhatsApp = () => {
    if (!bsData) return
    const d = bsData
    const lines = [
      `📋 *Statement of Financial Position*`,`*${shop?.name||''}*`,
      `As at: ${fmtDate(new Date(d.asOf))}`,``,
      `ASSETS`,``,
      `Cash and cash equivalents`,`*${fmtKES(d.cashReceived)}*`,
      `Trade receivables`,`*${fmtKES(d.accountsReceivable)}*`,
      `Inventories`,`*${fmtKES(d.stockAtCost)}*`,
      `Total Assets`,`*${fmtKES(d.totalAssets)}*`,``,
      `LIABILITIES`,``,
      `Customer deposits (contract liabilities)`,`*${fmtKES(d.depositLiability)}*`,
      `Trade payables`,`*${fmtKES(d.accountsPayable)}*`,
      `Total Liabilities`,`*${fmtKES(d.totalLiabilities)}*`,``,
      `EQUITY`,``,
      `Owner's capital`,`*${fmtKES(d.openingCapital)}*`,
      `Retained Earnings`,`*${fmtKES(d.retainedEarnings)}*`,
      
      `Total Equity`,`*${fmtKES(d.totalEquity)}*`,
      ...(d.balancingFigure?[``,`Unreconciled difference (stock without recorded funding)`,`*${fmtKES(d.balancingFigure)}*`]:[]),``,
      `Balance Check`,`*${d.isBalanced ? '✅ Balanced' : `⚠️ Variance: ${fmtKES(Math.abs(d.variance))}`}*`,``,
      `_Generated from SalesTrack business records · SalesTrack_`,
      `_${shop?.name||''} · Powered by SalesTrack_`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank')
  }

  // ══════════════════════════════════════════════════════════════════════
  // TAB 2 — CASH FLOW STATEMENT (backed by buildCashStatement — deep export data)
  // ══════════════════════════════════════════════════════════════════════
  const loadCF = async () => {
    setCfLoad(true)
    try {
      const cf = await buildCashStatement(shop, cfFrom, cfTo)

      // Month-by-month breakdown (still computed here — buildCashStatement gives
      // range totals + transaction-level detail, monthly bucketing is a
      // page-level concern since it's only used for the chart/table)
      const months = eachMonthOfInterval({
        start: new Date(cfFrom + 'T12:00:00'),
        end:   new Date(cfTo   + 'T12:00:00'),
      })
      let runningBalance = cf.openingCash
      const monthlyFlow = months.map(month => {
        const mF = format(startOfMonth(month),'yyyy-MM-dd')
        const mT = format(endOfMonth(month),'yyyy-MM-dd')
        const mIn  = cf.inflowTransactions.filter(t => t.date && t.date >= mF && t.date <= mT).reduce((s,t)=>s+(t.amount||0),0)
        const mOut = cf.outflowTransactions.filter(t => t.date && t.date >= mF && t.date <= mT).reduce((s,t)=>s+(t.amount||0),0)
        const net  = mIn - mOut
        runningBalance += net
        return { label: format(month,'MMM yy'), inflows: mIn, outflows: mOut, net, running: runningBalance }
      })

      // inflowByMethod kept in the shape the existing render code expects
      const inflowByMethod = {}
      cf.inflowRows.forEach(r => { inflowByMethod[r.method] = r.total })

      setCfData({
        openingCash: cf.openingCash, closingCash: cf.closingCash, stockPurchases: cf.stockPurchases, expensesPaid: cf.expensesPaid, undatedCount: cf.undatedCount, undatedTotal: cf.undatedTotal,
        totalInflows: cf.totalInflows,
        totalOutflows: cf.totalOutflows,
        netCashFlow: cf.netCashFlow,
        monthlyFlow,
        inflowByMethod,
        outflowByCat: cf.outflowByCat,
        cashSalesCount: cf.cashSalesCount,
        creditSalesTotal: cf.creditSalesTotal,
        // kept for the deep CSV export (Edit E below)
        inflowTransactions: cf.inflowTransactions,
        outflowTransactions: cf.outflowTransactions,
      })
    } catch(err) { console.error(err); toast.error('Failed to load Cash Flow') }
    finally { setCfLoad(false) }
  }

  const shareCFWhatsApp = () => {
    if (!cfData) return
    const d = cfData
    const lines = [
      `💸 *Statement of Cash Flows*`,`*${shop?.name||''}*`,
      `Period: ${fmtDate(new Date(cfFrom))} – ${fmtDate(new Date(cfTo))}`,``,
      `Receipts from customers`,`*${fmtKES(d.totalInflows)}*`,``,
      `Payments (expenses and stock)`,`*(${fmtKES(d.totalOutflows)})*`,``,
      `Net cash from operating activities`,`*${fmtKES(d.netCashFlow)}*`,``,
      `Opening cash and cash equivalents`,`*${fmtKES(d.openingCash)}*`,``,`Closing cash and cash equivalents`,`*${fmtKES(d.closingCash)}*`,``, ...d.monthlyFlow.map(m => [`${m.label}`,`*In: ${fmtKES(m.inflows)} | Out: (${fmtKES(m.outflows)}) | Net: ${fmtKES(m.net)}*`]).flat(),
      ``,`_${shop?.name||''} · Powered by SalesTrack_`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank')
  }

  // ══════════════════════════════════════════════════════════════════════
  // TAB 3 — SALES REPORT
  // ══════════════════════════════════════════════════════════════════════
  const loadSR = async () => {
    setSrLoad(true)
    try {
      const payMap = await loadPayMap(); const [salesAll, saleItems] = await Promise.all([
        pb.collection(C.SALES).getFullList({ filter:`shop_id="${shop.id}" && status="completed"`, '$autoCancel':false, '$cancelKey':'sr-sales' }).then(r=>r.filter(x=>{const d=rDate(x);return d&&d>=srFrom&&d<=srTo})),
        Promise.resolve([]),
      ])
      const salesByDay = {}; const saleIds = new Set(salesAll.map(s => s.id))
      salesAll.forEach(s => {
        const mm=s.receipt_no?.match(/-(\d{6})-/)
        if(!mm) return
        const cc=mm[1]
        const day=format(new Date(`20${cc.slice(0,2)}-${cc.slice(2,4)}-${cc.slice(4,6)}`),'dd MMM')
        salesByDay[day]=(salesByDay[day]||0)+s.total_kes
      })
      const salesChart=Object.entries(salesByDay).map(([label,revenue])=>({label,revenue})).slice(-30)
      const idList = salesAll.map(s => s.id); const idChunks = []; for (let i = 0; i < idList.length; i += 40) idChunks.push(idList.slice(i, i + 40))
      const itemsAll = (await Promise.all(idChunks.map((ch, ci) => pb.collection(C.SALE_ITEMS).getFullList({ filter: ch.map(id => `sale_id="${id}"`).join(' || '), expand: 'product_id', '$autoCancel': false, '$cancelKey': 'sr-items-' + ci })))).flat()
      const prodSales={}
      itemsAll.forEach(item=>{
        const name=item.product_name||item.expand?.product_id?.name||item.product_id
        if(!prodSales[name]) prodSales[name]={revenue:0,qty:0,profit:0}
        prodSales[name].revenue+=item.total_kes
        prodSales[name].qty+=item.qty
        prodSales[name].profit+=(item.unit_price_kes-(item.unit_cost_kes||0))*item.qty
      })
      const topProducts=Object.entries(prodSales).map(([name,v])=>({name,...v})).sort((a,b)=>b.revenue-a.revenue).slice(0,10)
      const hourTally=Array(24).fill(0)
      salesAll.forEach(s=>{
        if(!s.created) return
        const h=new Date(s.created.replace(' ','T')).getHours()
        if(!isNaN(h)) hourTally[h]+=s.total_kes
      })
      const peakHours=Array.from({length:12},(_,i)=>{const h=i*2;return{label:`${String(h).padStart(2,'0')}:00`,revenue:hourTally[h]+hourTally[h+1]}})
      const payMethods={}
      salesAll.forEach(s=>{payMethods[s.payment_method]=(payMethods[s.payment_method]||0)+s.total_kes})
      const payBreakdown=Object.entries(payMethods).map(([method,total])=>({method,total})).sort((a,b)=>b.total-a.total)
      const revenue=salesAll.reduce((s,x)=>s+(x.total_kes||0),0)
      const customerSales={}
      salesAll.forEach(s=>{if(s.customer_id){if(!customerSales[s.customer_id])customerSales[s.customer_id]={count:0,total:0};customerSales[s.customer_id].count++;customerSales[s.customer_id].total+=s.total_kes}})
      setSrData({
        salesChart,topProducts,peakHours,payBreakdown,revenue,
        salesCount:salesAll.length,
        returningCount:Object.keys(customerSales).length,
        walkInCount:salesAll.filter(s=>!s.customer_id).length,
        avgCustomerValue:Object.keys(customerSales).length?Object.values(customerSales).reduce((s,c)=>s+c.total,0)/Object.keys(customerSales).length:0,
        creditOutstanding:salesAll.filter(s=>s.payment_status==='pending').reduce((s,x)=>s+owed(x,payMap),0),
      })
    } catch(err){console.error(err);toast.error('Failed to load Sales Report')}
    finally{setSrLoad(false)}
  }

  // ══════════════════════════════════════════════════════════════════════
  // TAB 4 — EXPENSE REPORT
  // ══════════════════════════════════════════════════════════════════════
  const loadER = async () => {
    const seq = ++erSeq.current
    setErLoad(true)
    try {
      const [expenses, expCats] = await Promise.all([
        loadAllExpenses().then(all => all.filter(e => inRange(e, erFrom, erTo))),
        pb.collection(C.EXPENSE_CATS).getList(1,200,{ filter:`shop_id="${shop.id}"`, '$cancelKey':'er-cats' }).then(r=>r.items),
      ])
      const expByCat=expCats.map(cat=>({name:`${cat.icon||''} ${cat.name}`,total:expenses.filter(e=>e.category_id===cat.id).reduce((s,e)=>s+e.amount_kes,0)})).filter(c=>c.total>0)
      const uncatExp=expenses.filter(e=>!e.category_id).reduce((s,e)=>s+e.amount_kes,0)
      if(uncatExp>0) expByCat.push({name:'Other',total:uncatExp})
      if (seq !== erSeq.current) return
      setErData({ expensesRaw:expenses, expByCat, totalExpenses:expenses.reduce((s,e)=>s+(e.amount_kes||0),0) })
    } catch(err){console.error(err);if(seq===erSeq.current)toast.error('Failed to load Expense Report')}
    finally{if(seq===erSeq.current)setErLoad(false)}
  }

  // ══════════════════════════════════════════════════════════════════════
  // TAB 5 — STOCK VALUATION
  // ══════════════════════════════════════════════════════════════════════
  const loadSV = async () => {
    setSvLoad(true)
    try {
      const products = await pb.collection(C.PRODUCTS).getFullList({ filter:`shop_id="${shop.id}" && status="active"`, '$autoCancel':false })
      const stockVal = products.map(p=>({...p, costValue:(p.stock_qty||0)*(p.cost_price_kes||0), retailValue:(p.stock_qty||0)*(p.price_kes||0)})).sort((a,b)=>b.retailValue-a.retailValue)
      setSvData({ stockVal, totalStockCost:stockVal.reduce((s,p)=>s+p.costValue,0), totalStockRetail:stockVal.reduce((s,p)=>s+p.retailValue,0) })
    } catch(err){console.error(err);toast.error('Failed to load Stock Valuation')}
    finally{setSvLoad(false)}
  }

  // ══════════════════════════════════════════════════════════════════════
  // TAB 6 — LENDER PACK (unchanged from original)
  // ══════════════════════════════════════════════════════════════════════
  const loadLenderData = async () => {
    setLenderLoading(true)
    try {
      const lifetimeSales = await pb.collection(C.SALES).getFullList({
        filter: `shop_id="${shop.id}" && status="completed"`,
        '$autoCancel': false, '$cancelKey': 'lender-lifetime',
      })
      const lenderPay = await loadPayMap(); const lenderExp = loadAllExpenses(); const shopCreated = shop.created ? new Date(shop.created) : new Date()
      const monthsActive = Math.max(1, Math.round((new Date() - shopCreated) / (1000*60*60*24*30.44)))
      const lifetimeRevenue = lifetimeSales.reduce((s,x) => s+(x.total_kes||0), 0)
      const avgMonthlyRevenue = lifetimeRevenue / monthsActive
      const pendingSales = lifetimeSales.filter(s => s.payment_status==='pending'||s.payment_status==='partial').filter(s => owed(s,lenderPay)>0)
      const today = new Date()
      const arBuckets = { current:{count:0,total:0}, d30:{count:0,total:0}, d60:{count:0,total:0}, d90:{count:0,total:0} }
      pendingSales.forEach(s => {
        const d=rDate(s); if(!d) return
        const age=Math.floor((today-new Date(d))/86400000)
        const amt=owed(s,lenderPay)
        if(age<=30){arBuckets.current.count++;arBuckets.current.total+=amt}
        else if(age<=60){arBuckets.d30.count++;arBuckets.d30.total+=amt}
        else if(age<=90){arBuckets.d60.count++;arBuckets.d60.total+=amt}
        else{arBuckets.d90.count++;arBuckets.d90.total+=amt}
      })
      const totalAR = Object.values(arBuckets).reduce((s,b)=>s+b.total,0)
      const last6 = eachMonthOfInterval({ start:subMonths(new Date(),5), end:new Date() })
      const monthlyPL = await Promise.all(last6.map(async month => {
        const mKey=format(month,'yyyy-MM')
        const mFrom=format(startOfMonth(month),'yyyy-MM-dd')
        const mTo=format(endOfMonth(month),'yyyy-MM-dd')
        const mSales=lifetimeSales.filter(x=>{const d=rDate(x);return d&&d>=mFrom&&d<=mTo})
        const mExp=(await lenderExp).filter(e=>inRange(e,mFrom,mTo))
        const revenue=mSales.reduce((s,x)=>s+(x.total_kes||0),0)
        const cogs=mSales.reduce((s,x)=>s+(x.total_cost_kes||0),0)
        const grossProfit=revenue-cogs
        const expenses=mExp.reduce((s,x)=>s+(x.amount_kes||0),0)
        const netProfit=grossProfit-expenses
        return { label:format(month,'MMMM yyyy'), short:format(month,'MMM yy'), revenue, cogs, grossProfit, expenses, netProfit, txCount:mSales.length, netMargin:revenue?((netProfit/revenue)*100).toFixed(1):'0.0' }
      }))
      const totalRevenue6m=monthlyPL.reduce((s,m)=>s+m.revenue,0)
      const totalNetProfit6m=monthlyPL.reduce((s,m)=>s+m.netProfit,0)
      const firstActiveIdx = monthlyPL.findIndex(m=>m.revenue>0)
      const spanPL = firstActiveIdx < 0 ? monthlyPL.slice(-1) : monthlyPL.slice(firstActiveIdx)
      const spanMonths = spanPL.length
      const avgMonthlyNet = spanPL.reduce((s,m)=>s+m.netProfit,0)/spanMonths
      const profitableMonths=spanPL.filter(m=>m.netProfit>0).length
      const consistencyScore=Math.round((profitableMonths/spanMonths)*100)
      const firstMonthRev=monthlyPL[0]?.revenue||0
      const lastMonthRev=monthlyPL[5]?.revenue||0
      const growthRate=firstMonthRev>0?(((lastMonthRev-firstMonthRev)/firstMonthRev)*100).toFixed(0):null
      setLenderData({
        lifetimeRevenue, lifetimeTx:lifetimeSales.length,
        monthsActive, avgMonthlyRevenue, avgMonthlyNet, spanMonths,
        monthlyPL, totalRevenue6m, totalNetProfit6m,
        activeMonths:monthlyPL.filter(m=>m.revenue>0).length,
        profitableMonths, consistencyScore, growthRate,
        arBuckets, totalAR,
        generatedAt: new Date().toLocaleString('en-KE',{timeZone:'Africa/Nairobi'}),
        reportId: `${shop.id.slice(0,8).toUpperCase()}-${format(new Date(),'yyyyMMdd')}`,
      })
    } catch(err){console.error(err);toast.error('Failed to load lender data')}
    finally{setLenderLoading(false)}
  }

  const calcDSCR = () => {
    if(!lenderData||!dscrLoan||!dscrTerm||!dscrRate) return null
    const principal=parseFloat(dscrLoan), months=parseInt(dscrTerm), annualRate=parseFloat(dscrRate)
    if(!principal||!months||!annualRate) return null
    const r=annualRate/100/12
    const monthlyPmt=r===0?principal/months:(principal*r*Math.pow(1+r,months))/(Math.pow(1+r,months)-1)
    const dscr=lenderData.avgMonthlyNet>0?lenderData.avgMonthlyNet/monthlyPmt:0
    return{monthlyPmt,dscr}
  }

  const shareLenderWhatsApp = () => {
    if(!lenderData) return
    // Owner-visible share log — never blocks the share, never hidden from the owner
    pb.collection(C.REPORT_SHARES).create({
      shop_id: shop.id, report_type: 'lender_pack', shared_at: new Date().toISOString().replace('T',' ').replace('Z','.000Z'),
    }).catch(() => {}) // silent fail — this is a nice-to-have log, never block the actual share
    const d=lenderData, calc=calcDSCR()
    const lines=[
      `🏦 *Business Credit Summary*`,`*${shop?.name||''}*`,``,
      `Business Active`,`*${d.monthsActive} months*`,``,
      `6-Month Total Revenue`,`*${fmtKES(d.totalRevenue6m)}*`,``,
      `Average Monthly Revenue`,`*${fmtKES(d.avgMonthlyRevenue)}*`,``,
      `Average Monthly Net Profit`,`*${fmtKES(d.avgMonthlyNet)}*`,``,
      `Revenue Consistency`,`*${d.profitableMonths}/${d.spanMonths} months profitable (${d.consistencyScore}%)*`,
      ...(d.growthRate!==null?[``,`Revenue Growth (6 months)`,`*${d.growthRate>0?'+':''}${d.growthRate}%*`]:[]),
      ...(calc?[``,`Debt Service Coverage Ratio`,`*${calc.dscr.toFixed(2)}x* ${calc.dscr>=1.25?'✅ Bankable':calc.dscr>=1.0?'⚠️ Borderline':'❌ High Risk'}`]:[]),
      ``,`_Figures are generated from SalesTrack records. Please confirm key figures against M-Pesa or bank statements._`,
      `_Entries are timestamped. Authorised shop users can correct records._`,
      `_Report ID: ${d.reportId}_`,`_${shop?.name} · Powered by SalesTrack_`,
    ].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`,'_blank')
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <div ref={printRef}>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
        <div>
          <div className="page-title">Reports & Analytics 📊</div>
          <div className="page-subtitle">{shop?.name}</div>
        </div>
        <button className="btn-secondary" onClick={() => window.print()}><Printer size={16}/> Print</button>
      </div>

      {/* Tab Nav */}
      <div className="tab-nav" style={{ display:'flex', gap:4, marginBottom:20 }}>
        {TABS.map((t,i) => (
          <button key={i} onClick={() => setTab(i)} style={{ padding:'9px 18px', borderRadius:10, border:tab!==i?'1px solid #f0e4e8':'none', background:tab===i?'linear-gradient(135deg,#c8456a,#8b2550)':'#fff', color:tab===i?'#fff':'#8b2550', fontWeight:600, fontSize:13, cursor:'pointer', whiteSpace:'nowrap', boxShadow:tab===i?'0 4px 14px #c8456a44':'0 1px 4px #0001', fontFamily:'Nunito,sans-serif' }}>{t}</button>
        ))}
      </div>

      {/* ══ TAB 0: P&L ══════════════════════════════════════════════════ */}
      {tab === 0 && (
        <div>
          <div className="card" style={{ marginBottom:20 }}>
            <PeriodPicker dateFrom={plFrom} dateTo={plTo} setDateFrom={setPlFrom} setDateTo={setPlTo} />
          </div>
          {plLoad ? <Spinner/> : plData ? (
            <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div className="card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
                  <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:22, color:'#3d1020', margin:0 }}>Statement of Profit or Loss</h2>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={sharePLWhatsApp} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'none', background:'#25D366', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>📲 Share</button>
                    <button className="btn-secondary" style={{ fontSize:12 }} onClick={() => exportCSV([
                      {Item:'Revenue',Amount_KES:plData.revenue},
                      {Item:'Cost of sales',Amount_KES:-plData.costOfSales},
                      {Item:'Gross Profit',Amount_KES:plData.grossProfit},
                      {Item:'Total Expenses',Amount_KES:-plData.totalExpenses},
                      {Item:'Profit/(loss) for the period',Amount_KES:plData.netProfit},
                    ],'pl-statement.csv')}><Download size={14}/> Export</button>
                  </div>
                </div>
                <div style={{ fontSize:12, color:'#9b6070', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700, marginBottom:12 }}>
                  Period: {fmtDate(new Date(plFrom))} – {fmtDate(new Date(plTo))}
                </div>
                {plData.undatedCount > 0 && <div style={{ fontSize:11, color:'#92400e', background:'#fef3c7', borderRadius:8, padding:'6px 10px', marginBottom:8 }}>{plData.undatedCount} completed sale(s) have no date in the receipt number, so they are not included in any period.</div>}
                <PLSection title="REVENUE" color="#059669">
                  <PLRow label="Revenue" value={plData.revenue} bold/>
                  <PLRow label="No. of Transactions" value={plData.salesCount} isCurrency={false} color="#3b82f6"/>
                </PLSection>
                <PLSection title="COST OF SALES" color="#dc2626">
                  <PLRow label="Cost of sales" value={plData.costOfSales} negative/>
                </PLSection>
                <PLRow label="GROSS PROFIT" value={plData.grossProfit} bold big border sub={`Margin: ${plData.grossMargin.toFixed(1)}%`} color={plData.grossProfit>=0?'#059669':'#dc2626'}/>
                <PLSection title="OPERATING EXPENSES" color="#dc2626" style={{ marginTop:12 }}>
                  {plData.expByCat.map((cat,i) => <PLRow key={i} label={cat.name} value={cat.total} negative indent/>)}
                  <PLRow label="Total Expenses" value={plData.totalExpenses} negative bold border/>
                  {plData.totalExpenses===0 && <div style={{ fontSize:11, color:'#92400e', background:'#fef3c7', borderRadius:8, padding:'6px 10px', marginTop:6 }}>No expenses recorded for this period, so Net Profit equals Gross Profit. Record rent, wages and other costs under Expenses to see your true profit.</div>}
                </PLSection>
                <div style={{ height:8 }}/>
                <PLRow label="PROFIT / (LOSS) FOR THE PERIOD" value={plData.netProfit} bold big border sub={`Net Margin: ${plData.netMargin.toFixed(1)}%`} color={plData.netProfit>=0?'#059669':'#dc2626'}/>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                <div className="stat-grid-4" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  {[
                    {label:'Revenue',value:fmtKES(plData.revenue),color:'#c8456a',icon:'💰'},
                    {label:'Gross Profit',value:fmtKES(plData.grossProfit),color:'#059669',icon:'📈'},
                    {label:'Total Expenses',value:fmtKES(plData.totalExpenses),color:'#dc2626',icon:'💸'},
                    {label:'Net Profit',value:fmtKES(plData.netProfit),color:plData.netProfit>=0?'#059669':'#dc2626',icon:plData.netProfit>=0?'🎯':'⚠️'},
                  ].map((kpi,i) => (
                    <div key={i} className="card" style={{ padding:'16px', textAlign:'center' }}>
                      <div style={{ fontSize:24 }}>{kpi.icon}</div>
                      <div style={{ fontFamily:'Playfair Display,serif', fontSize:18, fontWeight:700, color:kpi.color }}>{kpi.value}</div>
                      <div style={{ fontSize:11, color:'#9b6070', marginTop:2 }}>{kpi.label}</div>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:'0 0 16px' }}>6-Month Trend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={plData.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fontSize:11, fill:'#9b6070' }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:11, fill:'#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={v=>fmtKES(v)} contentStyle={{ borderRadius:10, fontFamily:'Nunito,sans-serif', fontSize:12 }}/>
                      <Legend wrapperStyle={{ fontSize:12, fontFamily:'Nunito,sans-serif' }}/>
                      <Line type="monotone" dataKey="revenue" stroke="#c8456a" strokeWidth={2} dot={false} name="Revenue"/>
                      <Line type="monotone" dataKey="grossProfit" stroke="#059669" strokeWidth={2} dot={false} name="Gross Profit"/>
                      <Line type="monotone" dataKey="netProfit" stroke="#3b82f6" strokeWidth={2} dot={false} name="Net Profit" strokeDasharray="4 4"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {plData.expByCat.length>0 && (
                  <div className="card">
                    <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:'0 0 12px' }}>Expense Breakdown</h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={plData.expByCat} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name,percent})=>`${name.split(' ').slice(-1)[0]} ${(percent*100).toFixed(0)}%`} labelLine={false} style={{ fontSize:10 }}>
                          {plData.expByCat.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                        </Pie>
                        <Tooltip formatter={v=>fmtKES(v)} contentStyle={{ borderRadius:10, fontFamily:'Nunito,sans-serif', fontSize:12 }}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {plData.payBreakdown.length>0 && (
                  <div className="card">
                    <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:'0 0 12px' }}>💳 Payment Methods</h3>
                    {plData.payBreakdown.map((pm,i) => (
                      <div key={i} style={{ marginBottom:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                          <span style={{ fontWeight:600 }}>{pm.method==='cash'?'💵 Cash':pm.method==='mpesa'?'📱 M-Pesa':pm.method==='credit'?'💳 Credit':pm.method==='mixed'?'🔀 Split':pm.method==='visa_mc'?'Card':pm.method}</span>
                          <span style={{ color:'#c8456a', fontWeight:700 }}>{fmtKES(pm.total)}</span>
                        </div>
                        <div style={{ background:'#f5edf0', borderRadius:4, height:6 }}>
                          <div style={{ background:'linear-gradient(90deg,#c8456a,#8b2550)', height:6, borderRadius:4, width:`${Math.min(100,(pm.total/plData.revenue)*100)}%` }}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="card">
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:'0 0 12px' }}>👥 Customer Insights</h3>
                  {[
                    {label:'Repeat Customers',value:plData.returningCount,icon:'🔄',color:'#059669'},
                    {label:'Walk-in (No Name)',value:plData.walkInCount,icon:'🚶',color:'#9b6070'},
                    {label:'Avg Spend / Customer',value:fmtKES(plData.avgCustomerValue),icon:'💰',color:'#c8456a'},
                    {label:'Unpaid Credit',value:fmtKES(plData.creditOutstanding),icon:'⚠️',color:plData.creditOutstanding>0?'#dc2626':'#059669'},
                  ].map((kpi,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f5edf0' }}>
                      <span style={{ fontSize:13, color:'#6b4050' }}>{kpi.icon} {kpi.label}</span>
                      <span style={{ fontSize:14, fontWeight:700, color:kpi.color }}>{kpi.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ══ TAB 1: BALANCE SHEET ════════════════════════════════════════ */}
      {tab === 1 && (
        <div>
          <div className="card" style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <label className="label" style={{ margin:0 }}>As at date:</label>
              <input className="input" type="date" value={bsDate} onChange={e=>setBsDate(e.target.value)} style={{ width:160 }}/>
              {!shop?.opening_capital_kes && (
                <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:8, padding:'7px 12px', fontSize:12, color:'#92400e', fontWeight:600 }}>
                  ⚠️ Opening capital not set — go to Settings → Business to add your initial investment for a fully balanced sheet.
                </div>
              )}
            </div>
          </div>
          {bsLoad ? <Spinner/> : bsData ? (
            <div>
              {bsData.cashReceived < 0 && <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:10, padding:'8px 12px', marginBottom:14, fontSize:12, color:'#991b1b' }}>Cash and cash equivalents is negative: recorded expenses and cash-funded stock purchases are more than the money received from sales and repayments. Check that all sales are recorded, or record opening capital in Settings &gt; Business.</div>}
              {bsData.undatedCount > 0 && <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:10, padding:'8px 12px', marginBottom:14, fontSize:12, color:'#92400e' }}>{bsData.undatedCount} completed sale(s) worth {fmtKES(bsData.undatedTotal)} have no date in the receipt number and are left out of this statement.</div>}
              {/* Summary hero */}
              <div className="stat-grid-4" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
                {[
                  {label:'Total Assets',value:fmtKES(bsData.totalAssets),color:'#059669',icon:'🏦'},
                  {label:"Owner's capital",value:fmtKES(bsData.openingCapital),color:'#3b82f6',icon:'💼'},
                  {label:'Retained Earnings',value:(bsData.retainedEarnings<0?'(':'')+fmtKES(Math.abs(bsData.retainedEarnings))+(bsData.retainedEarnings<0?')':''),color:bsData.retainedEarnings>=0?'#059669':'#dc2626',icon:'📈'},
                  {label:'Total Equity',value:(bsData.totalEquity<0?'(':'')+fmtKES(Math.abs(bsData.totalEquity))+(bsData.totalEquity<0?')':''),color:bsData.totalEquity>=0?'#059669':'#dc2626',icon:'⚖️'},
                ].map((kpi,i) => (
                  <div key={i} className="stat-card">
                    <div style={{ fontSize:28 }}>{kpi.icon}</div>
                    <div style={{ fontFamily:'Playfair Display,serif', fontSize:20, fontWeight:700, color:kpi.color }}>{kpi.value}</div>
                    <div style={{ fontSize:12, color:'#9b6070', marginTop:2 }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                {/* Left: formal balance sheet */}
                <div className="card">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10 }}>
                    <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:22, color:'#3d1020', margin:0 }}>Statement of Financial Position</h2>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={shareBSWhatsApp} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#25D366', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>📲 Share</button>
                      <button className="btn-secondary" style={{ fontSize:12 }} onClick={() => exportCSV([
                        {Section:'ASSETS',Item:'Cash and cash equivalents',Amount_KES:bsData.cashReceived},
                        {Section:'ASSETS',Item:'of which: cash received to date',Amount_KES:bsData.cashReceipts},
                        {Section:'ASSETS',Item:'of which: less all expenses paid to date',Amount_KES:-bsData.totalExpensesPaid},{Section:'ASSETS',Item:'of which: less cash-funded stock purchases to date',Amount_KES:-bsData.stockPaid},
                        {Section:'ASSETS',Item:'Channel: Cash on hand',Amount_KES:bsData.cashByChannel.cash},
                        {Section:'ASSETS',Item:'Channel: Mobile money (M-Pesa)',Amount_KES:bsData.cashByChannel.mobile},
                        {Section:'ASSETS',Item:'Channel: Bank and card settlements',Amount_KES:bsData.cashByChannel.bank},
                        {Section:'ASSETS',Item:'Channel: Split sales (cash and M-Pesa not separated)',Amount_KES:bsData.cashByChannel.split},
                        {Section:'ASSETS',Item:'Channel: Other',Amount_KES:bsData.cashByChannel.other},
                        {Section:'ASSETS',Item:'Trade receivables (unpaid sales)',Amount_KES:bsData.accountsReceivable},
                        {Section:'ASSETS',Item:'Inventories (at cost)',Amount_KES:bsData.stockAtCost},
                        {Section:'ASSETS',Item:'TOTAL ASSETS',Amount_KES:bsData.totalAssets},
                        {Section:'LIABILITIES',Item:'Customer deposits (contract liabilities)',Amount_KES:bsData.depositLiability},
                        {Section:'LIABILITIES',Item:'Trade payables',Amount_KES:bsData.accountsPayable},
                        {Section:'LIABILITIES',Item:'TOTAL LIABILITIES',Amount_KES:bsData.totalLiabilities},
                        {Section:'EQUITY',Item:"Owner's capital",Amount_KES:bsData.openingCapital},
                        {Section:'EQUITY',Item:'Retained Earnings (cumulative net profit)',Amount_KES:bsData.retainedEarnings},
                        
                        {Section:'EQUITY',Item:'TOTAL EQUITY',Amount_KES:bsData.totalEquity},
                        {Section:'RECONCILIATION',Item:'Unreconciled difference (stock without recorded funding)',Amount_KES:bsData.balancingFigure},
                        {Section:'CHECK',Item:'Balanced?',Amount_KES:bsData.isBalanced?'YES':`NO - variance ${bsData.variance.toFixed(2)}`},
                      ],'balance-sheet.csv')}><Download size={14}/> Export</button>
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:'#9b6070', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:700, marginBottom:16 }}>As at {fmtDate(new Date(bsData.asOf))}</div>

                  {/* ASSETS */}
                  <PLSection title="ASSETS" color="#059669">
                    <PLRow label="Cash and cash equivalents" value={bsData.cashReceived} indent bold/>
                    {[['cash','Cash on hand'],['mobile','Mobile money (M-Pesa)'],['bank','Bank and card settlements'],['split','Split sales (cash and M-Pesa not separated)'],['other','Other']].filter(([k]) => k !== 'other' || Math.abs(bsData.cashByChannel[k]) >= 0.01).map(([k,l]) => <PLRow key={k} label={'- ' + l} value={bsData.cashByChannel[k]} indent color="#6b4050"/>)}
                    <div style={{ fontSize:11, color:'#9b6070', lineHeight:1.5, margin:'2px 0 8px 12px' }}>Cash received to date {fmtKES(bsData.cashReceipts)} less all expenses paid {fmtKES(bsData.totalExpensesPaid)} and cash-funded stock purchases {fmtKES(bsData.stockPaid)}. Expenses are assumed paid on the expense date; expenses the owner paid personally are a capital contribution and cannot be told apart here. The channel lines show where money was received or paid, not where it is held now, because no bank deposits or transfers are recorded: rely on the total. This differs from Cash Reconciliation by design, which counts one day at the till.</div>
                    <PLRow label="Trade receivables" value={bsData.accountsReceivable} indent color="#d97706"/>
                    <PLRow label="Inventories (at cost)" value={bsData.stockAtCost} indent/>
                    <PLRow label="TOTAL ASSETS" value={bsData.totalAssets} bold big border color="#059669"/>
                  </PLSection>

                  <div style={{ height:16 }}/>

                  {/* LIABILITIES */}
                  <PLSection title="LIABILITIES" color="#dc2626">
                    <PLRow label="Customer deposits (contract liabilities)" value={bsData.depositLiability} indent color="#dc2626" sub={bsData.openDepositsCount ? `${bsData.openDepositsCount} unfulfilled booking${bsData.openDepositsCount===1?'':'s'}` : 'No open deposits'}/>
                    <PLRow label="Trade payables" value={bsData.accountsPayable} indent color="#dc2626" sub="Stock taken on credit, not yet paid"/>
                    <PLRow label="TOTAL LIABILITIES" value={bsData.totalLiabilities} bold border color="#dc2626"/>
                  </PLSection>

                  <div style={{ height:16 }}/>

                  {/* EQUITY */}
                  <PLSection title="EQUITY" color="#3b82f6">
                    <PLRow label="Owner's capital" value={bsData.openingCapital} indent color="#3b82f6"/>
                    <PLRow label="Retained Earnings" value={bsData.retainedEarnings} indent color={bsData.retainedEarnings>=0?'#059669':'#dc2626'}/>
                    
                    <PLRow label="TOTAL EQUITY" value={bsData.totalEquity} bold big border color={bsData.totalEquity>=0?'#059669':'#dc2626'}/>
                    {bsData.balancingFigure !== 0 && <div style={{ marginTop:10, padding:'10px 12px', background:'#fef3c7', border:'1px solid #fde68a', borderRadius:10 }}><PLRow label={bsData.balancingFigure>0?'Unreconciled difference (stock without recorded funding)':'Unreconciled difference (possible withdrawals or losses)'} value={Math.abs(bsData.balancingFigure)} negative={bsData.balancingFigure<0} bold color="#d97706" sub={bsData.balancingFigure>0?'Assets exceed liabilities plus equity. This is not owner equity. Enter Opening Capital in Settings > Business to reduce it. Stock is valued at today levels, so past dates may show a small gap. For audited accounts, consult your accountant.':'Liabilities plus equity exceed assets.'}/></div>}
                  </PLSection>

                  <div style={{ height:16 }}/>

                  {/* Variance / balance check */}
                  <div style={{ display: bsData.isBalanced ? 'block' : 'none', background: bsData.isBalanced ? '#f0fdf4' : '#fefce8', border:`1px solid ${bsData.isBalanced?'#bbf7d0':'#fde68a'}`, borderRadius:10, padding:'12px 14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontWeight:700, fontSize:13, color:'#1a1a1f' }}>Assets = Liabilities + Equity</span>
                      <span style={{ fontFamily:'Playfair Display,serif', fontWeight:700, fontSize:16, color:bsData.isBalanced?'#059669':'#d97706' }}>
                        {bsData.isBalanced ? '✅ Balanced' : `Difference: ${fmtKES(Math.abs(bsData.variance))}`}
                      </span>
                    </div>
                    <div style={{ fontSize:11, color:'#9b6070', marginTop:6, lineHeight:1.5 }}>
                      Liabilities = customer deposits not yet delivered, plus stock taken on credit and tagged as such in Inventory. Stock recorded before this feature was added — or not tagged with a funding source — isn't included here, so older stock can show as a difference rather than a true error. Stock is valued at today's levels (PocketBase does not retain historical snapshots), so past dates may also show a small gap. For audited accounts, consult your accountant.
                    </div>
                  </div>

                  <div style={{ height:16 }}/>

                  {/* Retained earnings breakdown */}
                  <PLSection title="RETAINED EARNINGS BREAKDOWN" color="#8b5cf6">
                    <PLRow label="Lifetime Revenue" value={bsData.lifetimeRevenue} indent/>
                    <PLRow label="Lifetime cost of sales" value={bsData.lifetimeCOGS} negative indent/>
                    <PLRow label="Lifetime Gross Profit" value={bsData.lifetimeGP} indent bold/>
                    <PLRow label="Total Expenses Paid" value={bsData.totalExpensesPaid} negative indent/>
                    <PLRow label="Retained Earnings" value={bsData.retainedEarnings} bold border color={bsData.retainedEarnings>=0?'#059669':'#dc2626'}/>
                  </PLSection>
                </div>

                {/* Right: stock breakdown + AR */}
                <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                  <div className="card">
                    <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:'0 0 12px' }}>📦 Stock Asset Breakdown</h3>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14, padding:'12px 14px', background:'#fce8ed', borderRadius:10 }}>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:16, fontWeight:700, color:'#c8456a' }}>{fmtKES(bsData.stockAtCost)}</div>
                        <div style={{ fontSize:11, color:'#9b6070' }}>At Cost (Balance Sheet Value)</div>
                      </div>
                      <div style={{ textAlign:'center' }}>
                        <div style={{ fontSize:16, fontWeight:700, color:'#059669' }}>{fmtKES(bsData.stockAtRetail)}</div>
                        <div style={{ fontSize:11, color:'#9b6070' }}>At Retail (Potential Revenue)</div>
                      </div>
                    </div>
                    <div className="table-wrap" style={{ maxHeight:320, overflowY:'auto' }}>
                      <table>
                        <thead><tr><th>Product</th><th>Qty</th><th>Cost Value</th></tr></thead>
                        <tbody>
                          {bsData.products.filter(p=>p.costValue>0).map(p => (
                            <tr key={p.id}>
                              <td style={{ fontSize:12, fontWeight:500 }}>{p.name}</td>
                              <td style={{ fontSize:12, textAlign:'center' }}>{r2(p.stock_qty||0)}</td>
                              <td style={{ fontSize:12, fontWeight:600 }}>{fmtKES(p.costValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {bsData.accountsReceivable > 0 && (
                    <div className="card" style={{ border:'1.5px solid #fde68a', background:'#fffbeb' }}>
                      <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#92400e', margin:'0 0 10px' }}>⚠️ Trade receivables</h3>
                      <div style={{ fontFamily:'Playfair Display,serif', fontSize:28, fontWeight:700, color:'#d97706', marginBottom:6 }}>{fmtKES(bsData.accountsReceivable)}</div>
                      <div style={{ fontSize:12, color:'#92400e' }}>Outstanding from credit sales — this money is owed to your business and counted as an asset.</div>
                    </div>
                  )}

                  {!shop?.opening_capital_kes && (
                    <div className="card" style={{ border:'1.5px solid #bfdbfe', background:'#eff6ff' }}>
                      <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:15, color:'#1e40af', margin:'0 0 8px' }}>💡 Set Opening Capital</h3>
                      <div style={{ fontSize:12, color:'#1e40af', lineHeight:1.6 }}>
                        To fully balance this sheet, go to <strong>Settings → Business</strong> and enter your Opening Capital — the amount you invested to start this business (equipment, stock, cash). This anchors your equity calculation permanently.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ══ TAB 2: CASH FLOW ════════════════════════════════════════════ */}
      {tab === 2 && (
        <div>
          <div className="card" style={{ marginBottom:20 }}>
            <PeriodPicker dateFrom={cfFrom} dateTo={cfTo} setDateFrom={setCfFrom} setDateTo={setCfTo} initial="last6"/>
          </div>
          {cfLoad ? <Spinner/> : cfData ? (
            <div>
              {/* KPI cards */}
              <div className="stat-grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
                {[
                  {label:'Receipts from customers',value:fmtKES(cfData.totalInflows),color:'#059669',icon:'💰',sub:`${cfData.cashSalesCount} cash/mpesa sales`},
                  {label:'Payments (expenses and stock)',value:fmtKES(cfData.totalOutflows),color:'#dc2626',icon:'💸',sub:'Expenses and cash stock purchases'},
                  {label:'Net cash from operating activities',value:fmtKES(cfData.netCashFlow),color:cfData.netCashFlow>=0?'#059669':'#dc2626',icon:cfData.netCashFlow>=0?'✅':'⚠️',sub:cfData.netCashFlow>=0?'Positive cash position':'Negative cash position'},
                ].map((kpi,i) => (
                  <div key={i} className="stat-card">
                    <div style={{ fontSize:28 }}>{kpi.icon}</div>
                    <div style={{ fontFamily:'Playfair Display,serif', fontSize:22, fontWeight:700, color:kpi.color }}>{kpi.value}</div>
                    <div style={{ fontSize:12, color:'#9b6070', marginTop:2 }}>{kpi.label}</div>
                    <div style={{ fontSize:10, color:'#b09090', marginTop:2 }}>{kpi.sub}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ marginBottom:20 }}>
                <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:20, color:'#3d1020', margin:'0 0 4px' }}>Statement of Cash Flows</h2>
                <div style={{ fontSize:12, color:'#9b6070', marginBottom:12 }}>For the period {fmtDate(new Date(cfFrom))} - {fmtDate(new Date(cfTo))} (direct method)</div>
                <PLSection title="CASH FLOWS FROM OPERATING ACTIVITIES" color="#059669">
                  <PLRow label="Receipts from customers" value={cfData.totalInflows} indent/>
                  <PLRow label="Cash paid for inventories" value={cfData.stockPurchases} negative indent/>
                  <PLRow label="Payments for operating expenses" value={cfData.expensesPaid} negative indent/>
                  <PLRow label="Net cash from operating activities" value={cfData.netCashFlow} bold border color={cfData.netCashFlow>=0?'#059669':'#dc2626'}/>
                </PLSection>
                <div style={{ height:10 }}/>
                <PLSection title="CASH AND CASH EQUIVALENTS" color="#3b82f6">
                  <PLRow label="At start of period" value={cfData.openingCash} indent/>
                  <PLRow label="Net increase/(decrease) in cash" value={cfData.netCashFlow} indent/>
                  <PLRow label="At end of period" value={cfData.closingCash} bold big border color={cfData.closingCash>=0?'#059669':'#dc2626'}/>
                </PLSection>
                <div style={{ fontSize:11, color:'#9b6070', lineHeight:1.5, marginTop:8 }}>Closing cash equals Cash and cash equivalents on the Statement of Financial Position at the end date. Credit sales count when the customer pays. Stock purchases count on the day they were entered in Inventory and only when tagged as paid from cash. Owner contributions, drawings, loans and asset purchases are not recorded in SalesTrack, so no investing or financing activities are shown.</div>
                {(cfData.inflowByMethod.mixed || 0) > 0 && <div style={{ fontSize:11, color:'#92400e', background:'#fef3c7', borderRadius:8, padding:'6px 10px', marginTop:8 }}>Some Split sales have no valid cash part recorded, so {fmtKES(cfData.inflowByMethod.mixed)} is shown as Split (cash and M-Pesa not separated).</div>}
                {cfData.undatedCount > 0 && <div style={{ fontSize:11, color:'#92400e', background:'#fef3c7', borderRadius:8, padding:'6px 10px', marginTop:8 }}>{cfData.undatedCount} completed sale(s) worth {fmtKES(cfData.undatedTotal)} have no date in the receipt number and are left out.</div>}
              </div>

              {cfData.creditSalesTotal > 0 && (
                <div style={{ background:'#fef3c7', border:'1px solid #fde68a', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#92400e' }}>
                  ℹ️ Credit sales of <strong>{fmtKES(cfData.creditSalesTotal)}</strong> are excluded from cash inflows — cash flow only counts money actually received.
                </div>
              )}

              <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20 }}>
                {/* Running balance chart */}
                <div className="card">
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
                    <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:0 }}>Monthly cash receipts and payments</h3>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={shareCFWhatsApp} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#25D366', color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>📲 Share</button>
                      <button className="btn-secondary" style={{ fontSize:12 }} onClick={() => {
                        exportCSV(cfData.monthlyFlow.map(m=>({Month:m.label,Cash_Inflows_KES:m.inflows,Cash_Outflows_KES:m.outflows,Net_Cash_Flow_KES:m.net,Running_Balance_KES:m.running})),'cash-flow-summary.csv')
                        if (cfData.inflowTransactions?.length) exportCSV(cfData.inflowTransactions.map(t=>({Date:t.date,Receipt:t.receipt_no,Method:t.method,Amount_KES:t.amount})),'cash-flow-inflows-detail.csv')
                        if (cfData.outflowTransactions?.length) exportCSV(cfData.outflowTransactions.map(t=>({Date:t.date,Description:t.description,Category:t.category,Amount_KES:t.amount,Payment_Method:t.payment_method})),'cash-flow-outflows-detail.csv')
                      }}><Download size={14}/> CSV (3 files)</button>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={cfData.monthlyFlow} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fontSize:11, fill:'#9b6070' }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:11, fill:'#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={v=>fmtKES(v)} contentStyle={{ borderRadius:10, fontFamily:'Nunito,sans-serif', fontSize:12 }}/>
                      <Legend wrapperStyle={{ fontSize:11, fontFamily:'Nunito,sans-serif' }}/>
                      <Bar dataKey="inflows" fill="#059669" radius={[4,4,0,0]} name="Inflows"/>
                      <Bar dataKey="outflows" fill="#dc2626" radius={[4,4,0,0]} name="Outflows"/>
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Running balance line */}
                  <div style={{ marginTop:16 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#9b6070', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Running Balance</div>
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={cfData.monthlyFlow}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false}/>
                        <XAxis dataKey="label" tick={{ fontSize:10, fill:'#9b6070' }} axisLine={false} tickLine={false}/>
                        <YAxis tick={{ fontSize:10, fill:'#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                        <Tooltip formatter={v=>fmtKES(v)} contentStyle={{ borderRadius:10, fontFamily:'Nunito,sans-serif', fontSize:12 }}/>
                        <Line type="monotone" dataKey="running" stroke="#c8456a" strokeWidth={2} dot={{ r:3 }} name="Running Balance"/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Monthly table */}
                  <div className="table-wrap" style={{ marginTop:16 }}>
                    <table>
                      <thead><tr><th>Month</th><th style={{ textAlign:'right' }}>Inflows</th><th style={{ textAlign:'right' }}>Outflows</th><th style={{ textAlign:'right' }}>Net</th><th style={{ textAlign:'right' }}>Running</th></tr></thead>
                      <tbody>
                        {cfData.monthlyFlow.map((m,i) => (
                          <tr key={i} style={{ background:m.net<0?'#fff5f5':'transparent' }}>
                            <td style={{ fontWeight:600, fontSize:13 }}>{m.label}</td>
                            <td style={{ textAlign:'right', color:'#059669', fontWeight:600 }}>{fmtKES(m.inflows)}</td>
                            <td style={{ textAlign:'right', color:'#dc2626', fontSize:12 }}>({fmtKES(m.outflows)})</td>
                            <td style={{ textAlign:'right', fontWeight:700, color:m.net>=0?'#059669':'#dc2626' }}>{fmtKES(m.net)}</td>
                            <td style={{ textAlign:'right', fontFamily:'Playfair Display,serif', fontWeight:700, color:m.running>=0?'#059669':'#dc2626' }}>{fmtKES(m.running)}</td>
                          </tr>
                        ))}
                        <tr style={{ background:'#fdf5f7', borderTop:'2px solid #c8456a' }}>
                          <td style={{ fontWeight:800 }}>TOTAL</td>
                          <td style={{ textAlign:'right', fontWeight:800, color:'#059669' }}>{fmtKES(cfData.totalInflows)}</td>
                          <td style={{ textAlign:'right', fontWeight:800, color:'#dc2626' }}>({fmtKES(cfData.totalOutflows)})</td>
                          <td style={{ textAlign:'right', fontWeight:800, color:cfData.netCashFlow>=0?'#059669':'#dc2626' }}>{fmtKES(cfData.netCashFlow)}</td>
                          <td/>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Right sidebar: breakdowns */}
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div className="card">
                    <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:15, color:'#3d1020', margin:'0 0 12px' }}>💰 Inflows by Method</h3>
                    {Object.entries(cfData.inflowByMethod).map(([method,total],i) => (
                      <div key={i} style={{ marginBottom:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                          <span style={{ fontWeight:600 }}>{method==='cash'?'💵 Cash':method==='mpesa'?'📱 M-Pesa':method==='mixed'?'Split (cash and M-Pesa not separated)':method==='bank'?'Bank and card':method==='visa_mc'?'💳 Card':method}</span>
                          <span style={{ color:'#059669', fontWeight:700 }}>{fmtKES(total)}</span>
                        </div>
                        <div style={{ background:'#f5edf0', borderRadius:4, height:5 }}>
                          <div style={{ background:'linear-gradient(90deg,#059669,#10b981)', height:5, borderRadius:4, width:`${Math.min(100,(total/cfData.totalInflows)*100)}%` }}/>
                        </div>
                        <div style={{ fontSize:10, color:'#9b6070', textAlign:'right' }}>{cfData.totalInflows?((total/cfData.totalInflows)*100).toFixed(1):0}%</div>
                      </div>
                    ))}
                  </div>
                  {cfData.outflowByCat.length>0 && (
                    <div className="card">
                      <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:15, color:'#3d1020', margin:'0 0 12px' }}>💸 Outflows by Category</h3>
                      {cfData.outflowByCat.map((cat,i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'6px 0', borderBottom:'1px solid #f5edf0' }}>
                          <span>{cat.name}</span>
                          <span style={{ fontWeight:700, color:'#dc2626' }}>{fmtKES(cat.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ══ TAB 3: SALES REPORT ═════════════════════════════════════════ */}
      {tab === 3 && (
        <div>
          <div className="card" style={{ marginBottom:20 }}>
            <PeriodPicker dateFrom={srFrom} dateTo={srTo} setDateFrom={setSrFrom} setDateTo={setSrTo}/>
          </div>
          {srLoad ? <Spinner/> : srData ? (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button className="btn-secondary" onClick={() => exportCSV(srData.topProducts.map(p=>({Product:p.name,Qty_Sold:p.qty,Revenue_KES:p.revenue.toFixed(2),Profit_KES:p.profit.toFixed(2)})),'sales-report.csv')}><Download size={14}/> Export CSV</button>
              </div>
              <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20 }}>
                <div className="card">
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:18, color:'#3d1020', margin:'0 0 16px' }}>Daily Sales</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={srData.salesChart} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fontSize:10, fill:'#9b6070' }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:10, fill:'#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={v=>fmtKES(v)} contentStyle={{ borderRadius:10, fontFamily:'Nunito,sans-serif', fontSize:12 }}/>
                      <Bar dataKey="revenue" radius={[4,4,0,0]} name="Revenue">
                        
                        {srData.salesChart.map((_,i)=><Cell key={i} fill="#c8456a"/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:'0 0 16px' }}>Top Products</h3>
                  {srData.topProducts.slice(0,6).map((p,i) => (
                    <div key={i} style={{ marginBottom:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                        <span style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'55%' }}>{p.name}</span>
                        <span style={{ color:'#c8456a', fontWeight:700 }}>{fmtKES(p.revenue)}</span>
                      </div>
                      <div style={{ background:'#f5edf0', borderRadius:4, height:5 }}>
                        <div style={{ background:'linear-gradient(90deg,#c8456a,#8b2550)', height:5, borderRadius:4, width:`${Math.min(100,(p.revenue/srData.topProducts[0].revenue)*100)}%` }}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20 }}>
                <div className="card">
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:'0 0 16px' }}>⏰ Peak Selling Hours</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={srData.peakHours} barSize={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fontSize:9, fill:'#9b6070' }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:9, fill:'#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={v=>fmtKES(v)} contentStyle={{ borderRadius:10, fontFamily:'Nunito,sans-serif', fontSize:12 }}/>
                      <Bar dataKey="revenue" radius={[4,4,0,0]} name="Revenue">
                        {srData.peakHours.map((entry,i)=>{const mx=Math.max(...srData.peakHours.map(h=>h.revenue));return<Cell key={i} fill={entry.revenue===mx?'#c8456a':'#f0c0ce'}/>})}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:'0 0 12px' }}>📊 Period Stats</h3>
                  {[
                    {label:'Total Transactions',value:srData.salesCount},
                    {label:'Avg Transaction',value:fmtKES(srData.salesCount?srData.revenue/srData.salesCount:0)},
                    {label:'Repeat Customers',value:srData.returningCount},
                    {label:'Walk-in Sales',value:srData.walkInCount},
                    {label:'Credit Outstanding',value:fmtKES(srData.creditOutstanding),alert:srData.creditOutstanding>0},
                  ].map((s,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'7px 0', borderBottom:'1px solid #f5edf0' }}>
                      <span style={{ color:'#6b4050' }}>{s.label}</span>
                      <span style={{ fontWeight:700, color:s.alert?'#dc2626':'#1a1a1f' }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ padding:0 }}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #f5edf0' }}>
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:0 }}>Product Performance</h3>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Product</th><th>Units Sold</th><th>Revenue</th><th>Gross Profit</th><th>Margin</th></tr></thead>
                    <tbody>
                      {srData.topProducts.map((p,i) => (
                        <tr key={i}>
                          <td style={{ color:'#9b6070', fontSize:12 }}>#{i+1}</td>
                          <td style={{ fontWeight:600 }}>{p.name}</td>
                          <td>{p.qty}</td>
                          <td style={{ fontWeight:600 }}>{fmtKES(p.revenue)}</td>
                          <td style={{ color:'#059669', fontWeight:600 }}>{fmtKES(p.profit)}</td>
                          <td><span style={{ background:p.revenue?(p.profit/p.revenue>0.4?'#f0fdf4':p.profit/p.revenue>0.2?'#fefce8':'#fee2e2'):'#f5f5f5', color:p.revenue?(p.profit/p.revenue>0.4?'#059669':p.profit/p.revenue>0.2?'#d97706':'#dc2626'):'#9b6070', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{p.revenue?((p.profit/p.revenue)*100).toFixed(0):0}%</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ══ TAB 4: EXPENSE REPORT ═══════════════════════════════════════ */}
      {tab === 4 && (
        <div>
          <div className="card" style={{ marginBottom:20 }}>
            <PeriodPicker dateFrom={erFrom} dateTo={erTo} setDateFrom={setErFrom} setDateTo={setErTo}/>
          </div>
          {erLoad ? <Spinner/> : erData ? (
            <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
              <div className="card" style={{ padding:0 }}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #f5edf0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:0 }}>All Expenses</h3>
                  <button className="btn-secondary" style={{ fontSize:12 }} onClick={() => exportCSV(erData.expensesRaw.map(e=>({Date:String(e.expense_date||'').slice(0,10),Description:e.description,Category:e.expand?.category_id?.name||'',Amount_KES:e.amount_kes,Payment:e.payment_method,Ref:e.reference||''})),'expenses.csv')}><Download size={14}/> CSV</button>
                </div>
                <div className="table-wrap" style={{ maxHeight:400, overflowY:'auto' }}>
                  <table>
                    <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
                    <tbody>
                      {erData.expensesRaw.map(e => (
                        <tr key={e.id}>
                          <td style={{ fontSize:11, color:'#9b6070' }}>{fmtDate(e.expense_date)}</td>
                          <td style={{ fontSize:13 }}>{e.description}</td>
                          <td style={{ fontSize:12 }}>{e.expand?.category_id?.icon} {e.expand?.category_id?.name||'—'}</td>
                          <td style={{ fontWeight:700, color:'#dc2626' }}>{fmtKES(e.amount_kes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
                <div className="card">
                  <h3 style={{ fontFamily:'Playfair Display,serif', fontSize:16, color:'#3d1020', margin:'0 0 16px' }}>By Category</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={erData.expByCat} layout="vertical" barSize={16}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" horizontal={false}/>
                      <XAxis type="number" tick={{ fontSize:10, fill:'#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <YAxis type="category" dataKey="name" tick={{ fontSize:10, fill:'#9b6070' }} axisLine={false} tickLine={false} width={100}/>
                      <Tooltip formatter={v=>fmtKES(v)} contentStyle={{ borderRadius:10, fontFamily:'Nunito,sans-serif', fontSize:12 }}/>
                      <Bar dataKey="total" fill="#c8456a" radius={[0,6,6,0]} name="Amount"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card" style={{ padding:'16px 20px' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#3d1020', marginBottom:12 }}>Category Summary</div>
                  {erData.expByCat.map((cat,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid #f5edf0' }}>
                      <span>{cat.name}</span>
                      <span style={{ fontWeight:700, color:'#dc2626' }}>{fmtKES(cat.total)}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, padding:'10px 0 0', fontWeight:700 }}>
                    <span>TOTAL</span>
                    <span style={{ color:'#dc2626', fontFamily:'Playfair Display,serif' }}>{fmtKES(erData.totalExpenses)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ══ TAB 5: STOCK VALUATION ══════════════════════════════════════ */}
      {tab === 5 && (
        <div>
          {svLoad ? <Spinner/> : svData ? (
            <div>
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
                <button className="btn-secondary" onClick={() => exportCSV(svData.stockVal.map(p=>({Product:p.name,Brand:p.brand||'',SKU:p.sku||'',Barcode:p.barcode||'',Stock_Qty:p.stock_qty||0,Unit:p.unit||'',Cost_Price:p.cost_price_kes||0,Selling_Price:p.price_kes||0,Cost_Value:p.costValue.toFixed(2),Retail_Value:p.retailValue.toFixed(2)})),'stock-valuation.csv')}><Download size={14}/> Export CSV</button>
              </div>
              <div className="stat-grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:20 }}>
                {[
                  {label:'Total Products',value:svData.stockVal.length,color:'#c8456a',icon:'📦'},
                  {label:'Stock at Cost',value:fmtKES(svData.totalStockCost),color:'#d97706',icon:'💰'},
                  {label:'Stock at Retail',value:fmtKES(svData.totalStockRetail),color:'#059669',icon:'🏷️'},
                ].map((kpi,i) => (
                  <div key={i} className="stat-card">
                    <div style={{ fontSize:28 }}>{kpi.icon}</div>
                    <div style={{ fontFamily:'Playfair Display,serif', fontSize:22, fontWeight:700, color:kpi.color }}>{kpi.value}</div>
                    <div style={{ fontSize:12, color:'#9b6070', marginTop:2 }}>{kpi.label}</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding:0 }}>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Product</th><th>Brand</th><th>Barcode</th><th>Qty</th><th>Cost Price</th><th>Selling Price</th><th>Cost Value</th><th>Retail Value</th><th>Markup %</th></tr></thead>
                    <tbody>
                      {svData.stockVal.map(p => {
                        const markup = p.cost_price_kes?(((p.price_kes-p.cost_price_kes)/p.cost_price_kes)*100).toFixed(0):null
                        return (
                          <tr key={p.id}>
                            <td style={{ fontWeight:600, fontSize:13 }}>{p.name}</td>
                            <td style={{ fontSize:12, color:'#9b6070' }}>{p.brand||'—'}</td>
                            <td style={{ fontFamily:'monospace', fontSize:11 }}>{p.barcode||p.sku||'—'}</td>
                            <td style={{ fontWeight:700, color:p.stock_qty<=0?'#dc2626':'#1a1a1f' }}>{r2(p.stock_qty||0)}</td>
                            <td>{fmtKES(p.cost_price_kes)}</td>
                            <td style={{ fontWeight:600 }}>{fmtKES(p.price_kes)}</td>
                            <td>{fmtKES(p.costValue)}</td>
                            <td style={{ fontWeight:600 }}>{fmtKES(p.retailValue)}</td>
                            <td>{markup!==null?<span style={{ background:markup>50?'#f0fdf4':'#fefce8', color:markup>50?'#059669':'#d97706', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{markup}%</span>:'—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ══ TAB 6: LENDER PACK (UNCHANGED) ═════════════════════════════ */}
      {tab === 6 && !canSeeLenderPack && (
        <PlanGuard requiredPlan="growth"><div /></PlanGuard>
      )}
      {tab === 6 && canSeeLenderPack && (
        <div>
          <style>{`
            @media print {
              .no-print { display: none !important; }
              .page-header, .tab-nav-wrap, .period-filter-card { display: none !important; }
              body { font-size: 12px !important; }
              .lender-pack-root { max-width: 100% !important; }
              .lender-section { page-break-inside: avoid; margin-bottom: 24px; }
              .lender-print-header { display: flex !important; }
            }
            .lender-print-header { display: none; }
          `}</style>
          <div className="lender-print-header" style={{ justifyContent:'space-between', alignItems:'center', marginBottom:24, paddingBottom:12, borderBottom:'2px solid #c8456a' }}>
            <div>
              <div style={{ fontFamily:'Playfair Display,serif', fontSize:22, fontWeight:700, color:'#3d1020' }}>{shop?.name}</div>
              <div style={{ fontSize:12, color:'#9b6070' }}>{shop?.business_type||'Business'} · Business Credit Report</div>
            </div>
            <div style={{ textAlign:'right', fontSize:11, color:'#9b6070' }}>
              <div>Generated: {lenderData?.generatedAt}</div>
              <div>Report ID: {lenderData?.reportId}</div>
            </div>
          </div>
          <div className="page-header no-print" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8, marginBottom:20 }}>
            <div>
              <div style={{ fontFamily:'Playfair Display,serif', fontSize:22, color:'#3d1020', fontWeight:700 }}>🏦 Lender Pack</div>
              <div style={{ fontSize:13, color:'#9b6070', marginTop:2 }}>Bank-grade credit document · {shop?.name} · Generated from your SalesTrack records</div>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button onClick={shareLenderWhatsApp} style={{ padding:'9px 16px', borderRadius:10, border:'none', background:'#25D366', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>📲 Share Summary</button>
              <button onClick={() => window.print()} style={{ padding:'9px 16px', borderRadius:10, border:'1.5px solid #c8456a', background:'#fff', color:'#c8456a', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>🖨️ Print / Save PDF</button>
              <button onClick={() => { setLenderData(null); loadLenderData() }} style={{ padding:'9px 16px', borderRadius:10, border:'1.5px solid #f0e4e8', background:'#fff', color:'#9b6070', fontWeight:700, fontSize:13, cursor:'pointer' }}>↻ Refresh</button>
            </div>
          </div>
          {lenderLoading ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
              <div style={{ textAlign:'center' }}><div className="spinner" style={{ margin:'0 auto 12px' }}/><div style={{ fontSize:13, color:'#9b6070' }}>Loading financial data…</div></div>
            </div>
          ) : lenderData ? (() => {
            const calc=calcDSCR(), d=lenderData
            return (
              <div className="lender-pack-root">
                <div className="lender-section card" style={{ marginBottom:20, background:'linear-gradient(135deg,#3d1020,#8b2550)', color:'#fff', borderRadius:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:16 }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color:'rgba(255,255,255,0.6)', marginBottom:4 }}>Business Credit Report</div>
                      <div style={{ fontFamily:'Playfair Display,serif', fontSize:28, fontWeight:700, color:'#fff', marginBottom:4 }}>{shop?.name}</div>
                      <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)' }}>{shop?.business_type||'Retail Business'} · {shop?.address||'Kenya'}</div>
                      {shop?.phone&&<div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', marginTop:2 }}>{shop.phone}</div>}
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>Report ID</div>
                      <div style={{ fontFamily:'monospace', fontSize:13, color:'rgba(255,255,255,0.8)', marginBottom:8 }}>{d.reportId}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>Generated</div>
                      <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)' }}>{d.generatedAt}</div>
                    </div>
                  </div>
                  <div className="stat-grid-4" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:20 }}>
                    {[
                      {label:'Months Active',value:`${d.monthsActive}`,sub:'on SalesTrack'},
                      {label:'Lifetime Revenue',value:fmtKES(d.lifetimeRevenue),sub:`${d.lifetimeTx} transactions`},
                      {label:'Avg Monthly Revenue',value:fmtKES(d.avgMonthlyRevenue),sub:'all-time average'},
                      {label:'Avg Monthly Net Profit',value:fmtKES(d.avgMonthlyNet),sub:`over ${d.spanMonths} month${d.spanMonths===1?'':'s'} of sales`},
                    ].map((kpi,i) => (
                      <div key={i} style={{ background:'rgba(255,255,255,0.1)', borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                        <div style={{ fontFamily:'Playfair Display,serif', fontSize:18, fontWeight:700, color:'#fff' }}>{kpi.value}</div>
                        <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', marginTop:3 }}>{kpi.label}</div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:1 }}>{kpi.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lender-section card" style={{ marginBottom:20, padding:0 }}>
                  <div style={{ padding:'16px 20px', borderBottom:'1px solid #f5edf0', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                    <div>
                      <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:18, color:'#3d1020', margin:'0 0 2px' }}>6-Month Financial Performance</h2>
                      <div style={{ fontSize:12, color:'#9b6070' }}>Month-by-month revenue, costs and profit — the core lending assessment table</div>
                    </div>
                    <button className="btn-secondary no-print" style={{ fontSize:12 }} onClick={() => {
                      const rows=[...d.monthlyPL.map(m=>({Month:m.label,Revenue_KES:m.revenue,Cost_of_Sales_KES:m.cogs,Gross_Profit_KES:m.grossProfit,Expenses_KES:m.expenses,Net_Profit_KES:m.netProfit,Net_Margin_Pct:m.netMargin,Transactions:m.txCount})),{Month:'TOTAL / AVERAGE',Revenue_KES:d.totalRevenue6m,Cost_of_Sales_KES:d.monthlyPL.reduce((s,m)=>s+m.cogs,0),Gross_Profit_KES:d.monthlyPL.reduce((s,m)=>s+m.grossProfit,0),Expenses_KES:d.monthlyPL.reduce((s,m)=>s+m.expenses,0),Net_Profit_KES:d.totalNetProfit6m,Net_Margin_Pct:d.totalRevenue6m?((d.totalNetProfit6m/d.totalRevenue6m)*100).toFixed(1):'0.0',Transactions:d.monthlyPL.reduce((s,m)=>s+m.txCount,0)}]
                      const headers=Object.keys(rows[0])
                      const csv=[headers.join(','),...rows.map(r=>headers.map(h=>`"${r[h]??''}"`).join(','))].join('\n')
                      const blob=new Blob([csv],{type:'text/csv'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${shop?.name?.replace(/\s+/g,'-')}-6month-pl.csv`;a.click();URL.revokeObjectURL(url)
                    }}>⬇️ Download CSV</button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Month</th><th style={{ textAlign:'right' }}>Revenue</th><th style={{ textAlign:'right' }}>Cost of sales</th><th style={{ textAlign:'right' }}>Gross Profit</th><th style={{ textAlign:'right' }}>Expenses</th><th style={{ textAlign:'right' }}>Net Profit</th><th style={{ textAlign:'right' }}>Margin</th><th style={{ textAlign:'right' }}>Txns</th></tr></thead>
                      <tbody>
                        {d.monthlyPL.map((m,i) => (
                          <tr key={i} style={{ background:m.netProfit<0?'#fff5f5':'transparent' }}>
                            <td style={{ fontWeight:600, fontSize:13, whiteSpace:'nowrap' }}>{m.label}</td>
                            <td style={{ textAlign:'right', fontWeight:600 }}>{fmtKES(m.revenue)}</td>
                            <td style={{ textAlign:'right', color:'#dc2626', fontSize:12 }}>({fmtKES(m.cogs)})</td>
                            <td style={{ textAlign:'right', color:'#059669', fontWeight:600 }}>{fmtKES(m.grossProfit)}</td>
                            <td style={{ textAlign:'right', color:'#dc2626', fontSize:12 }}>({fmtKES(m.expenses)})</td>
                            <td style={{ textAlign:'right', fontWeight:800, fontFamily:'Playfair Display,serif', color:m.netProfit>=0?'#059669':'#dc2626', fontSize:15 }}>{fmtKES(m.netProfit)}</td>
                            <td style={{ textAlign:'right' }}><span style={{ background:parseFloat(m.netMargin)>10?'#f0fdf4':parseFloat(m.netMargin)>0?'#fefce8':'#fee2e2', color:parseFloat(m.netMargin)>10?'#059669':parseFloat(m.netMargin)>0?'#d97706':'#dc2626', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{m.netMargin}%</span></td>
                            <td style={{ textAlign:'right', color:'#9b6070', fontSize:12 }}>{m.txCount}</td>
                          </tr>
                        ))}
                        <tr style={{ background:'#fdf5f7', borderTop:'2px solid #c8456a' }}>
                          <td style={{ fontWeight:800, fontSize:13 }}>6-MONTH TOTAL</td>
                          <td style={{ textAlign:'right', fontWeight:800 }}>{fmtKES(d.totalRevenue6m)}</td>
                          <td style={{ textAlign:'right', fontWeight:700, color:'#dc2626' }}>({fmtKES(d.monthlyPL.reduce((s,m)=>s+m.cogs,0))})</td>
                          <td style={{ textAlign:'right', fontWeight:700, color:'#059669' }}>{fmtKES(d.monthlyPL.reduce((s,m)=>s+m.grossProfit,0))}</td>
                          <td style={{ textAlign:'right', fontWeight:700, color:'#dc2626' }}>({fmtKES(d.monthlyPL.reduce((s,m)=>s+m.expenses,0))})</td>
                          <td style={{ textAlign:'right', fontWeight:800, fontFamily:'Playfair Display,serif', color:d.totalNetProfit6m>=0?'#059669':'#dc2626', fontSize:16 }}>{fmtKES(d.totalNetProfit6m)}</td>
                          <td style={{ textAlign:'right' }}><span style={{ background:'#fdf5f7', color:'#c8456a', padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:800 }}>{d.totalRevenue6m?((d.totalNetProfit6m/d.totalRevenue6m)*100).toFixed(1):'0'}%</span></td>
                          <td style={{ textAlign:'right', fontWeight:700 }}>{d.monthlyPL.reduce((s,m)=>s+m.txCount,0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="lender-section card" style={{ marginBottom:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16, flexWrap:'wrap', gap:8 }}>
                    <div>
                      <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:18, color:'#3d1020', margin:'0 0 2px' }}>Revenue & Profit Trend</h2>
                      <div style={{ fontSize:12, color:'#9b6070' }}>Month-on-month trajectory — a rising trend signals a healthy, growing business</div>
                    </div>
                    <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                      {d.growthRate!==null&&(<div style={{ textAlign:'center', background:parseFloat(d.growthRate)>=0?'#f0fdf4':'#fff5f5', borderRadius:10, padding:'8px 14px' }}><div style={{ fontFamily:'Playfair Display,serif', fontSize:20, fontWeight:700, color:parseFloat(d.growthRate)>=0?'#059669':'#dc2626' }}>{parseFloat(d.growthRate)>=0?'↑':'↓'} {Math.abs(parseFloat(d.growthRate))}%</div><div style={{ fontSize:11, color:'#9b6070' }}>Revenue growth</div></div>)}
                      <div style={{ textAlign:'center', background:d.consistencyScore>=67?'#f0fdf4':d.consistencyScore>=34?'#fefce8':'#fff5f5', borderRadius:10, padding:'8px 14px' }}><div style={{ fontFamily:'Playfair Display,serif', fontSize:20, fontWeight:700, color:d.consistencyScore>=67?'#059669':d.consistencyScore>=34?'#d97706':'#dc2626' }}>{d.profitableMonths}/{d.spanMonths}</div><div style={{ fontSize:11, color:'#9b6070' }}>Profitable months</div></div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={d.monthlyPL.map(m=>({label:m.short,revenue:m.revenue,netProfit:Math.max(0,m.netProfit)}))} barSize={28} isAnimationActive={false}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0e4e8" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fontSize:11, fill:'#9b6070' }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize:11, fill:'#9b6070' }} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <Tooltip formatter={v=>fmtKES(v)} contentStyle={{ borderRadius:10, fontFamily:'Nunito,sans-serif', fontSize:12 }}/>
                      <Bar dataKey="revenue" fill="#f0c0ce" radius={[4,4,0,0]} name="Revenue"/>
                      <Bar dataKey="netProfit" fill="#c8456a" radius={[4,4,0,0]} name="Net Profit"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="lender-section card" style={{ marginBottom:20 }}>
                  <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:18, color:'#3d1020', margin:'0 0 4px' }}>Debt Service Coverage Ratio (DSCR)</h2>
                  <div style={{ fontSize:12, color:'#9b6070', marginBottom:20 }}>DSCR = Average Monthly Net Profit ÷ Monthly Loan Repayment. Banks require ≥1.25x to approve a loan.</div>
                  <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
                    <div><label className="label">Loan Amount (KES)</label><input className="input" type="number" min={0} placeholder="e.g. 500000" value={dscrLoan} onChange={e=>setDscrLoan(e.target.value)}/></div>
                    <div><label className="label">Loan Term (months)</label><input className="input" type="number" min={1} max={120} placeholder="e.g. 12" value={dscrTerm} onChange={e=>setDscrTerm(e.target.value)}/></div>
                    <div><label className="label">Annual Interest Rate (%)</label><input className="input" type="number" min={0} max={100} step={0.1} placeholder="e.g. 14" value={dscrRate} onChange={e=>setDscrRate(e.target.value)}/></div>
                  </div>
                  {calc ? (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                      <div style={{ background:'#fdf5f7', borderRadius:12, padding:'16px', textAlign:'center' }}><div style={{ fontSize:12, color:'#9b6070', marginBottom:4 }}>Monthly Repayment</div><div style={{ fontFamily:'Playfair Display,serif', fontSize:22, fontWeight:700, color:'#c8456a' }}>{fmtKES(calc.monthlyPmt)}</div></div>
                      <div style={{ background:'#fdf5f7', borderRadius:12, padding:'16px', textAlign:'center' }}><div style={{ fontSize:12, color:'#9b6070', marginBottom:4 }}>Avg Monthly Net Profit</div><div style={{ fontFamily:'Playfair Display,serif', fontSize:22, fontWeight:700, color:d.avgMonthlyNet>=0?'#059669':'#dc2626' }}>{fmtKES(d.avgMonthlyNet)}</div></div>
                      <div style={{ background:calc.dscr>=1.25?'#f0fdf4':calc.dscr>=1.0?'#fefce8':'#fee2e2', borderRadius:12, padding:'16px', textAlign:'center', border:`2px solid ${calc.dscr>=1.25?'#059669':calc.dscr>=1.0?'#d97706':'#dc2626'}` }}>
                        <div style={{ fontSize:12, color:'#9b6070', marginBottom:4 }}>DSCR</div>
                        <div style={{ fontFamily:'Playfair Display,serif', fontSize:32, fontWeight:700, color:calc.dscr>=1.25?'#059669':calc.dscr>=1.0?'#d97706':'#dc2626' }}>{calc.dscr.toFixed(2)}x</div>
                        <div style={{ fontSize:13, fontWeight:700, color:calc.dscr>=1.25?'#059669':calc.dscr>=1.0?'#d97706':'#dc2626', marginTop:4 }}>{calc.dscr>=1.25?'✅ Bankable':calc.dscr>=1.0?'⚠️ Borderline':'❌ High Risk'}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ background:'#fdf5f7', borderRadius:12, padding:'20px', textAlign:'center', color:'#9b6070', fontSize:13 }}>Enter loan details above to calculate borrowing capacity</div>
                  )}
                </div>
                <div className="lender-section card" style={{ marginBottom:20 }}>
                  <h2 style={{ fontFamily:'Playfair Display,serif', fontSize:18, color:'#3d1020', margin:'0 0 4px' }}>Trade receivables ageing</h2>
                  <div style={{ fontSize:12, color:'#9b6070', marginBottom:16 }}>Unpaid credit sales grouped by age.</div>
                  {d.totalAR===0 ? (
                    <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'16px', textAlign:'center' }}>
                      <div style={{ fontSize:24, marginBottom:4 }}>✅</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#059669' }}>No outstanding receivables</div>
                      <div style={{ fontSize:12, color:'#9b6070', marginTop:2 }}>All sales are collected — excellent cash flow hygiene</div>
                    </div>
                  ) : (
                    <div className="mobile-stack" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                      {[
                        {label:'Current (0–30 days)',data:d.arBuckets.current,color:'#059669',bg:'#f0fdf4',border:'#bbf7d0'},
                        {label:'31–60 Days',data:d.arBuckets.d30,color:'#d97706',bg:'#fefce8',border:'#fde68a'},
                        {label:'61–90 Days',data:d.arBuckets.d60,color:'#ea580c',bg:'#fff7ed',border:'#fed7aa'},
                        {label:'90+ Days (Bad Debt Risk)',data:d.arBuckets.d90,color:'#dc2626',bg:'#fee2e2',border:'#fca5a5'},
                      ].map((bucket,i) => (
                        <div key={i} style={{ background:bucket.bg, border:`1px solid ${bucket.border}`, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                          <div style={{ fontFamily:'Playfair Display,serif', fontSize:20, fontWeight:700, color:bucket.color }}>{fmtKES(bucket.data.total)}</div>
                          <div style={{ fontSize:11, color:bucket.color, fontWeight:600, marginTop:2 }}>{bucket.data.count} invoice{bucket.data.count!==1?'s':''}</div>
                          <div style={{ fontSize:10, color:'#9b6070', marginTop:4 }}>{bucket.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {d.totalAR>0&&(<div style={{ marginTop:12, display:'flex', justifyContent:'space-between', padding:'10px 14px', background:'#fdf5f7', borderRadius:10, fontSize:13 }}><span style={{ fontWeight:600, color:'#3d1020' }}>Total outstanding trade receivables</span><span style={{ fontWeight:800, color:'#c8456a', fontFamily:'Playfair Display,serif', fontSize:16 }}>{fmtKES(d.totalAR)}</span></div>)}
                </div>
                <div className="lender-section" style={{ background:'#1a1a1f', borderRadius:14, padding:'20px 24px', marginBottom:20 }}>
                  <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ fontSize:24, flexShrink:0 }}>🔒</div>
                    <div>
                      <div style={{ fontWeight:800, fontSize:14, color:'#fff', marginBottom:6 }}>Data Source and Reliability</div>
                      <div style={{ fontSize:12, color:'rgba(255,255,255,0.65)', lineHeight:1.7 }}>Figures in this report are generated from the business's SalesTrack sales, payment and expense records as at the time shown. Entries are timestamped and each shop's data is kept separate from other shops. Authorised shop users can correct records, so lenders should confirm key figures against M-Pesa or bank statements.</div>
                      <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                        {[{label:'Report ID',value:d.reportId},{label:'Generated',value:d.generatedAt},{label:'Business',value:shop?.name},{label:'Data Source',value:'SalesTrack POS — Sales and Payment Records'}].map((r,i) => (
                          <div key={i} style={{ fontSize:11 }}><span style={{ color:'rgba(255,255,255,0.4)' }}>{r.label}: </span><span style={{ color:'rgba(255,255,255,0.8)', fontWeight:600 }}>{r.value}</span></div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })() : (
            <div style={{ textAlign:'center', padding:60, color:'#9b6070' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🏦</div>
              <div style={{ fontSize:14 }}>Click Refresh to load your lender pack</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Shared sub-components ──────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
      <div className="spinner"/>
    </div>
  )
}

function PLSection({ title, color, children }) {
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.1em', color, marginBottom:6, paddingBottom:4, borderBottom:`2px solid ${color}22` }}>{title}</div>
      {children}
    </div>
  )
}

function PLRow({ label, value, bold, big, negative, indent, border, sub, color, isCurrency=true }) {
  const display = isCurrency ? fmtKES(Math.abs(value)) : value
  const isNeg = isCurrency && (negative ? value > 0 : value < 0)
  const displayColor = color||(negative?'#dc2626':'#1a1a1f')
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:`${big?10:5}px 0`, borderTop:border?'1.5px solid #f0e4e8':'none', marginTop:border?4:0 }}>
      <div>
        <span style={{ fontSize:big?15:13, fontWeight:bold?700:400, color:'#3d1020', paddingLeft:indent?12:0 }}>{label}</span>
        {sub&&<div style={{ fontSize:11, color:'#9b6070' }}>{sub}</div>}
      </div>
      <span style={{ fontSize:big?16:13, fontWeight:bold?700:500, color:displayColor, fontFamily:big?'Playfair Display,serif':'Nunito,sans-serif' }}>
        {isNeg?'(':''}{display}{isNeg?')':''}
      </span>
    </div>
  )
}
