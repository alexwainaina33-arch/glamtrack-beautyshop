// Sector presets for the public shop page (version 1: wording, tab name, preview accent).
// Matched on keywords in the free-text business_type label. Order matters.
export const PRESETS = {
  salon:       { key: 'salon',       accent: '#5B2A4E', shopButton: 'Shop Now',            shopTab: 'Shop' },
  retail:      { key: 'retail',      accent: '#0B3B32', shopButton: 'Shop Now',            shopTab: 'Shop' },
  restaurant:  { key: 'restaurant',  accent: '#8A3B1E', shopButton: 'Order Now',           shopTab: 'Menu' },
  pharmacy:    { key: 'pharmacy',    accent: '#0F5F5C', shopButton: 'Browse Products',     shopTab: 'Products' },
  boutique:    { key: 'boutique',    accent: '#1F1B24', shopButton: 'Shop the Collection', shopTab: 'Collection' },
  hardware:    { key: 'hardware',    accent: '#1F2A30', shopButton: 'Browse Products',     shopTab: 'Products' },
  beauty:      { key: 'beauty',      accent: '#A63D5E', shopButton: 'Shop Now',            shopTab: 'Shop' },
  electronics: { key: 'electronics', accent: '#0F2A5C', shopButton: 'Shop Now',            shopTab: 'Shop' },
  agrovet:     { key: 'agrovet',     accent: '#2F6B2F', shopButton: 'Browse Products',     shopTab: 'Products' },
  other:       { key: 'other',       accent: '#0B3B32', shopButton: 'Shop Now',            shopTab: 'Shop' },
}

const RULES = [
  ['salon',       /salon|barber|\bspa\b/],
  ['restaurant',  /restaurant|caf/],
  ['pharmacy',    /pharmac|clinic/],
  ['boutique',    /boutique|fashion/],
  ['hardware',    /hardware|\bauto\b/],
  ['electronics', /electronic|phone/],
  ['agrovet',     /agrovet|farm/],
  ['beauty',      /beauty/],
  ['retail',      /retail/],
]

export function pickPreset(label, previewKey) {
  const pk = String(previewKey || '').toLowerCase()
  if (pk && PRESETS[pk]) return { ...PRESETS[pk], isPreview: true }
  const l = String(label || '').toLowerCase()
  for (const [key, re] of RULES) {
    if (re.test(l)) return { ...PRESETS[key], isPreview: false }
  }
  return { ...PRESETS.other, isPreview: false }
}