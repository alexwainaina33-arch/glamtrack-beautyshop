import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import pb, { C } from '../lib/pb'
import { fmtKES, fmtDateTime } from '../lib/utils'
import { format, startOfDay, endOfDay } from 'date-fns'
import { useReactToPrint } from 'react-to-print'
import { Printer, CheckCircle, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1]

export default function ReconciliationPage() {
  const { shop, admin, loading: authLoading } = useAuth()
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [counts, setCounts] = useState({})
  const [openingFloat, setOpeningFloat] = useState(0)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const printRef = useRef()
  const handlePrint = useReactToPrint({ content: () => printRef.current })

  useEffect(() => { if (shop && !authLoading) loadData() }, [shop, authLoading, date])

  const loadData = async () => {
    setLoading(true)
    try {
      const [s, e] = await Promise.all([
        pb.collection(C.SALES).getList(1, 500, { filter: `shop_id="${shop.id}" && status="completed"` }).then(r => r.items),
        pb.collection(C.EXPENSES).getList(1, 500, { filter: `shop_id="${shop.id}"` }).then(r => r.items)
      ])
      setSales(s.filter(x => {
        const m = x.receipt_no?.match(/-(\d{6})-/)
        if (!m) return false
        const c = m[1]
        const saleDate = `20${c.slice(0,2)}-${c.slice(2,4)}-${c.slice(4,6)}`
        return saleDate === date
      }))
      setExpenses(e.filter(x => x.expense_date?.startsWith(date)))
    } finally { setLoading(false) }
  }

  const totalCashSales    = sales.filter(s => s.payment_method === 'cash').reduce((a, s) => a + s.total_kes, 0)
  const totalMpesaSales   = sales.filter(s => s.payment_method === 'mpesa').reduce((a, s) => a + s.total_kes, 0)
  const totalCardSales    = sales.filter(s => s.payment_method === 'visa_mc').reduce((a, s) => a + s.total_kes, 0)
  const totalRevenue      = sales.reduce((a, s) => a + s.total_kes, 0)
  const totalExpenses     = expenses.reduce((a, e) => a + e.amount_kes, 0)
  const cashExpenses      = expenses.filter(e => e.payment_method === 'cash').reduce((a, e) => a + e.amount_kes, 0)
  const expectedCash      = Number(openingFloat) + totalCashSales - cashExpenses
  const actualCash        = DENOMINATIONS.reduce((a, d) => a + d * (Number(counts[d]) || 0), 0)
  const variance          = actualCash - expectedCash
  const isBalanced        = Math.abs(variance) < 1

  const handleCount = (denom, val) => setCounts(c => ({ ...c, [denom]: val }))

  const handleSave = () => {
    setSaved(true)
    toast.success('Z-Report saved! Cash reconciliation complete ✅')
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="page-title">Cash Reconciliation 🏦</div>
          <div className="page-subtitle">Daily Z-Report · Count your cash and close the day</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 160 }} />
          <button className="btn-secondary" onClick={handlePrint}><Printer size={16} /> Print Z-Report</button>
        </div>
      </div>

      <div ref={printRef}>
        <div className="mobile-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* LEFT: Sales Summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px' }}>📊 Day Sales Summary</h3>
              {[
                { label: '💵 Cash Sales', value: totalCashSales, color: '#059669' },
                { label: '📱 M-Pesa Sales', value: totalMpesaSales, color: '#3b82f6' },
                { label: '💳 Card Sales', value: totalCardSales, color: '#8b5cf6' },
                { label: '🧾 Total Revenue', value: totalRevenue, color: '#c8456a', bold: true, border: true },
                { label: '💸 Cash Expenses', value: -cashExpenses, color: '#dc2626' },
                { label: '📦 Opening Float', value: Number(openingFloat), color: '#d97706' },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: r.border ? '2px solid #f0e4e8' : 'none', marginTop: r.border ? 4 : 0 }}>
                  <span style={{ fontSize: 13, fontWeight: r.bold ? 700 : 400 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: r.bold ? 700 : 600, color: r.color }}>{fmtKES(Math.abs(r.value))}</span>
                </div>
              ))}
              <div style={{ borderTop: '2px solid #f0e4e8', marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Expected Cash in Drawer</span>
                <span style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Playfair Display,serif', color: '#c8456a' }}>{fmtKES(expectedCash)}</span>
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 12px' }}>Opening Float</h3>
              <input className="input" type="number" min={0} value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} placeholder="Cash in drawer at start of day" />
            </div>

            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5edf0' }}>
                <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: 0 }}>All Transactions ({sales.length})</h3>
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#fce8ed' }}>
                      <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#8b2550' }}>Receipt</th>
                      <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#8b2550' }}>Method</th>
                      <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#8b2550' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f5edf0' }}>
                        <td style={{ padding: '8px 16px', fontFamily: 'monospace', fontSize: 11 }}>{s.receipt_no}</td>
                        <td style={{ padding: '8px 16px' }}>{s.payment_method === 'cash' ? '💵' : s.payment_method === 'mpesa' ? '📱' : '💳'} {s.payment_method}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right', fontWeight: 600 }}>{fmtKES(s.total_kes)}</td>
                      </tr>
                    ))}
                    {sales.length === 0 && <tr><td colSpan={3} style={{ padding: '24px', textAlign: 'center', color: '#9b6070' }}>No sales today</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT: Cash Count */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 18, color: '#3d1020', margin: '0 0 16px' }}>💵 Physical Cash Count</h3>
              <div className="recon-denom-grid" style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#9b6070' }}>Denom</span>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#9b6070' }}>Count</span>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#9b6070', textAlign: 'right' }}>Total</span>
              </div>
              {DENOMINATIONS.map(d => (
                <div key={d} className="recon-denom-grid" style={{ display: 'grid', gridTemplateColumns: '80px 1fr 80px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#3d1020' }}>KES {d}</span>
                  <input className="input" type="number" min={0} placeholder="0" value={counts[d] || ''} onChange={e => handleCount(d, e.target.value)} style={{ padding: '8px 12px', fontSize: 14 }} />
                  <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#c8456a' }}>{fmtKES(d * (Number(counts[d]) || 0))}</span>
                </div>
              ))}
              <div style={{ borderTop: '2px solid #f0e4e8', marginTop: 8, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>Actual Cash</span>
                <span style={{ fontWeight: 700, fontSize: 18, fontFamily: 'Playfair Display,serif', color: '#3d1020' }}>{fmtKES(actualCash)}</span>
              </div>
            </div>

            <div style={{ background: isBalanced ? '#f0fdf4' : Math.abs(variance) < 500 ? '#fefce8' : '#fff5f5', border: `2px solid ${isBalanced ? '#bbf7d0' : Math.abs(variance) < 500 ? '#fde68a' : '#fecaca'}`, borderRadius: 16, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                {isBalanced ? <CheckCircle size={28} color="#059669" /> : <AlertTriangle size={28} color={Math.abs(variance) < 500 ? '#d97706' : '#dc2626'} />}
                <div>
                  <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 20, fontWeight: 700, color: isBalanced ? '#059669' : '#dc2626' }}>
                    {isBalanced ? '✅ BALANCED' : variance > 0 ? `OVER by ${fmtKES(variance)}` : `SHORT by ${fmtKES(Math.abs(variance))}`}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b4050', marginTop: 2 }}>
                    {isBalanced ? 'Cash drawer perfectly balanced. Great job!' : variance > 0 ? 'More cash than expected — check for double-counts.' : 'Less cash than expected — investigate transactions.'}
                  </div>
                </div>
              </div>
              <div className="stat-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                {[
                  { label: 'Expected', value: fmtKES(expectedCash), color: '#3b82f6' },
                  { label: 'Actual', value: fmtKES(actualCash), color: '#1a1a1f' },
                  { label: 'Variance', value: fmtKES(Math.abs(variance)), color: isBalanced ? '#059669' : '#dc2626' },
                ].map((k, i) => (
                  <div key={i} style={{ textAlign: 'center', background: '#ffffff88', borderRadius: 10, padding: '10px' }}>
                    <div style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 11, color: '#9b6070' }}>{k.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: 16, color: '#3d1020', margin: '0 0 12px' }}>📋 Day Summary</h3>
              {[
                { label: 'Total Sales', value: totalRevenue },
                { label: 'Total Expenses', value: totalExpenses },
                { label: 'Net Cash Flow', value: totalRevenue - totalExpenses, bold: true },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: r.bold ? '2px solid #f0e4e8' : '1px solid #f5edf0', marginTop: r.bold ? 4 : 0 }}>
                  <span style={{ fontSize: 13, fontWeight: r.bold ? 700 : 400 }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: r.bold ? 700 : 600, color: r.bold ? (r.value >= 0 ? '#059669' : '#dc2626') : '#1a1a1f' }}>{fmtKES(r.value)}</span>
                </div>
              ))}
            </div>

            <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 14, fontSize: 15 }} onClick={handleSave} disabled={saved}>
              {saved ? '✅ Z-Report Saved' : '💾 Close Day & Save Z-Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}