// api/shops/page.js - serves /shop/<slug> with crawlable HTML (title, canonical, JSON-LD, visible text).
// Falls back to the normal index.html on any problem. Phone and email are never included.
const SITE = 'https://salestrack.doublexsoftware.com'
const PB_URL = process.env.PB_URL || 'https://fieldtrack-kenya.fly.dev'

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trim() + '...' : t }

async function getJson(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error('fetch failed')
  return r.json()
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const base = 'https://' + host
  const slug = String((req.query && req.query.slug) || '').trim()

  let html = ''
  try {
    const r = await fetch(base + '/index.html')
    if (!r.ok) throw new Error('index missing')
    html = await r.text()
  } catch (e) {
    return res.status(500).send('Temporarily unavailable')
  }

  const send = (h, ok) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', ok ? 'public, s-maxage=60, stale-while-revalidate=300' : 'public, s-maxage=10')
    return res.status(200).send(h)
  }

  try {
    if (!/^[A-Za-z0-9-]{1,120}$/.test(slug)) return send(html, false)
    const shop = await getJson(base + '/api/shops/public?slug=' + encodeURIComponent(slug))
    if (!shop || !shop.id || shop.locked || !shop.name) return send(html, false)

    let products = []
    try {
      const c = await getJson(base + '/api/shops/public?slug=' + encodeURIComponent(slug) + '&catalog=1')
      products = (c.products || []).slice(0, 12)
    } catch (e) { products = [] }

    const url = SITE + '/shop/' + slug
    const title = clip(shop.tagline ? shop.name + ' | ' + shop.tagline : shop.name, 70)
    const desc = clip(shop.tagline || shop.about_text || ('Services, products and prices at ' + shop.name + '. Order via WhatsApp.'), 155)
    const image = shop.cover_image
      ? PB_URL + '/api/files/' + shop.collectionId + '/' + shop.id + '/' + shop.cover_image + '?thumb=1200x630'
      : (shop.logo ? PB_URL + '/api/files/' + shop.collectionId + '/' + shop.id + '/' + shop.logo + '?thumb=800x800' : SITE + '/icons/icon-512.png')

    const ld = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: shop.name, url: url, description: desc, image: image }
    if (shop.address) ld.address = { '@type': 'PostalAddress', streetAddress: shop.address, addressCountry: 'KE' }
    const ldJson = JSON.stringify(ld).replace(/</g, '\\u003c')

    const head =
      '<link rel="canonical" href="' + esc(url) + '" />\n' +
      '<meta name="description" content="' + esc(desc) + '" />\n' +
      '<meta property="og:title" content="' + esc(shop.name) + '" />\n' +
      '<meta property="og:description" content="' + esc(desc) + '" />\n' +
      '<meta property="og:image" content="' + esc(image) + '" />\n' +
      '<meta property="og:url" content="' + esc(url) + '" />\n' +
      '<meta property="og:type" content="website" />\n' +
      '<meta name="twitter:card" content="summary_large_image" />\n' +
      '<meta name="twitter:title" content="' + esc(shop.name) + '" />\n' +
      '<meta name="twitter:description" content="' + esc(desc) + '" />\n' +
      '<meta name="twitter:image" content="' + esc(image) + '" />\n' +
      '<script type="application/ld+json">' + ldJson + '</script>\n'

    const cur = shop.currency || 'KES'
    let body = '<h1>' + esc(shop.name) + '</h1>'
    if (shop.tagline) body += '<p>' + esc(shop.tagline) + '</p>'
    if (shop.about_text) body += '<p>' + esc(clip(shop.about_text, 600)) + '</p>'
    if (shop.address) body += '<p>' + esc(shop.address) + '</p>'
    if (products.length) {
      body += '<ul>'
      for (const p of products) {
        body += '<li>' + esc(p.name) + (p.price_kes != null ? ' - ' + esc(cur) + ' ' + esc(p.price_kes) : '') + '</li>'
      }
      body += '</ul>'
    }

    let out = html
    out = out.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>')
    out = out.replace(/<meta\s+(?:name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*/g, '')
    out = out.replace('</head>', head + '</head>')
    out = out.replace('<div id="root"></div>', '<div id="root">' + body + '</div>')
    return send(out, true)
  } catch (e) {
    return send(html, false)
  }
}