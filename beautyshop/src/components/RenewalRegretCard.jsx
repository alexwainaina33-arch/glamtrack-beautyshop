// Shared renewal banner — rendered in Layout.jsx so it appears on every /app/* page.
// NEVER duplicate this component inline elsewhere — import from here only.
//
// Structure: each tier has ONE identity line + ONE value line (what they get to keep).
// Each day-bucket (3/2/1/0) has ONE short urgency clause.
// These compose at render time — editing a tier's tone changes it at all 4 urgency
// levels automatically, instead of hunting through hardcoded combinations.

const getTier = (revenue) => {
  if (revenue === 0)    return 'zero'
  if (revenue < 5000)   return 'seed'
  if (revenue < 20000)  return 'growing'
  if (revenue < 50000)  return 'serious'
  if (revenue < 100000) return 'elite'
  return 'empire'
}

const THEME = {
  zero:    { accent: '#0284c7', light: '#eff6ff', border: '#93c5fd', shadow: 'rgba(2,132,199,0.10)',  emoji: '🌱' },
  seed:    { accent: '#7c3aed', light: '#f5f3ff', border: '#c4b5fd', shadow: 'rgba(124,58,237,0.10)', emoji: '🔥' },
  growing: { accent: '#0284c7', light: '#eff6ff', border: '#93c5fd', shadow: 'rgba(2,132,199,0.10)',  emoji: '📈' },
  serious: { accent: '#059669', light: '#f0fdf4', border: '#86efac', shadow: 'rgba(5,150,105,0.10)',  emoji: '💼' },
  elite:   { accent: '#d97706', light: '#fffbeb', border: '#fcd34d', shadow: 'rgba(217,119,6,0.10)',  emoji: '🏆' },
  empire:  { accent: '#c8456a', light: '#fff5f7', border: '#f9a8d4', shadow: 'rgba(200,69,106,0.10)', emoji: '👑' },
}

// One line per tier: what's at stake, stated plainly. {revenue} is filled in at render.
// Zero-revenue has no {revenue} reference since there's nothing to cite yet.
const TIER_VALUE_LINE = {
  zero:    `Your shop is set up — products, settings, and staff are all ready to go.`,
  seed:    `KES {revenue} in sales recorded so far, with all your customer and product records.`,
  growing: `KES {revenue} tracked this month, along with your sales history and customer records.`,
  serious: `KES {revenue} tracked this month, including your margins, reports, and customer records.`,
  elite:   `KES {revenue} tracked this month, with full sales history, margins, and customer records.`,
  empire:  `KES {revenue} tracked this month, across full sales history, margins, and customer records.`,
}

// One short clause per day-bucket — same urgency logic for every tier.
const URGENCY_CLAUSE = {
  3: { label: '3 days left', bg: '#059669', lead: `3 days left on your trial.` },
  2: { label: '2 days left', bg: '#0284c7', lead: `2 days left on your trial.` },
  1: { label: '1 day left',  bg: '#f59e0b', lead: `1 day left on your trial.` },
  0: { label: 'Ends today', bg: '#dc2626', lead: `Your trial ends today.` },
}

const CTA_BY_DAY = {
  3: 'Continue with M-Pesa →',
  2: 'Continue with M-Pesa →',
  1: 'Renew before tomorrow →',
  0: 'Renew now →',
}

const fill = (str, revenueFormatted) =>
  str.replace(/\{revenue\}/g, revenueFormatted)

export default function RenewalRegretCard({ shop, stats, onClick }) {
  if (!shop || !stats) return null

  const now = new Date()
  const expiryDate = shop.subscription_ends_at
    ? new Date(shop.subscription_ends_at)
    : shop.trial_ends_at
    ? new Date(shop.trial_ends_at)
    : null
  if (!expiryDate) return null

  const hoursLeft = (expiryDate - now) / 3600000
  if (hoursLeft > 72 || hoursLeft < 0) return null

  // Clamp to the 4 buckets we have copy for (0-3). Math.ceil on hoursLeft/24 should
  // already stay in this range given the guard above, but clamp explicitly so a
  // missing bucket can never silently fall through to undefined.
  const daysLeft = Math.min(3, Math.max(0, Math.ceil(hoursLeft / 24)))

  const revenue = stats.revenue || 0
  const revenueFormatted = revenue.toLocaleString('en-KE', { minimumFractionDigits: 2 })

  const tier = getTier(revenue)
  const theme = THEME[tier]
  const urgency = URGENCY_CLAUSE[daysLeft]
  const cta = CTA_BY_DAY[daysLeft]

  const valueLine = fill(TIER_VALUE_LINE[tier], `KES ${revenueFormatted}`)
  const headline = urgency.lead

  return (
    <div
      onClick={onClick}
      style={{
        background: `linear-gradient(135deg,${theme.light},#fff)`,
        border: `1.5px solid ${theme.border}`,
        borderRadius: 14,
        padding: '14px 20px',
        marginBottom: 20,
        cursor: 'pointer',
        boxShadow: `0 4px 20px ${theme.shadow}`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      {/* Emoji */}
      <div style={{ fontSize: 28, flexShrink: 0 }}>{theme.emoji}</div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: theme.accent }}>
            {headline}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            background: urgency.bg,
            color: '#fff',
            padding: '2px 8px',
            borderRadius: 20,
            flexShrink: 0,
          }}>
            {urgency.label}
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>
          {valueLine}
        </div>
      </div>

      {/* CTA Button */}
      <div style={{
        background: `linear-gradient(135deg,${theme.accent},${theme.accent}cc)`,
        color: '#fff',
        borderRadius: 10,
        padding: '10px 20px',
        fontSize: 12,
        fontWeight: 800,
        flexShrink: 0,
        boxShadow: `0 4px 14px ${theme.shadow}`,
        whiteSpace: 'nowrap',
      }}>
        {cta}
      </div>
    </div>
  )
}