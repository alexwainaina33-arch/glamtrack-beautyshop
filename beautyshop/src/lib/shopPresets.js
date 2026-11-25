// Sector presets for the public shop page.
// Matched on keywords in the free-text business_type label. Order matters.
export const PRESETS = {
  salon:       { key: 'salon',       accent: '#5B2A4E', shopButton: 'Shop Now',            shopTab: 'Shop',       chatLine: 'I saw your page and would like to ask about booking' },
  retail:      { key: 'retail',      accent: '#0B3B32', shopButton: 'Shop Now',            shopTab: 'Shop',       chatLine: 'I saw your shop page and would like to enquire' },
  restaurant:  { key: 'restaurant',  listRows: true, accent: '#8A3B1E', shopButton: 'Order Now',           shopTab: 'Menu',       chatLine: 'I saw your menu and would like to place an order' },
  pharmacy:    { key: 'pharmacy',    listRows: true, accent: '#0F5F5C', shopButton: 'Browse Products',     shopTab: 'Products',   chatLine: 'I saw your page and would like to ask about a product' },
  boutique:    { key: 'boutique',    accent: '#1F1B24', shopButton: 'Shop the Collection', shopTab: 'Collection', chatLine: 'I saw your collection and would like to enquire' },
  hardware:    { key: 'hardware',    listRows: true, accent: '#1F2A30', shopButton: 'Browse Products',     shopTab: 'Products',   chatLine: 'I saw your page and would like to ask about a product' },
  beauty:      { key: 'beauty',      accent: '#A63D5E', shopButton: 'Shop Now',            shopTab: 'Shop',       chatLine: 'I saw your shop page and would like to enquire' },
  electronics: { key: 'electronics', accent: '#0F2A5C', shopButton: 'Shop Now',            shopTab: 'Shop',       chatLine: 'I saw your page and would like to ask about a product' },
  agrovet:     { key: 'agrovet',     listRows: true, accent: '#2F6B2F', shopButton: 'Browse Products',     shopTab: 'Products',   chatLine: 'I saw your page and would like to ask about a product' },
  other:       { key: 'other',       accent: '#0B3B32', shopButton: 'Shop Now',            shopTab: 'Shop',       chatLine: 'I saw your shop page and would like to enquire' },
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