// src/lib/publicShop.js - loads the public part of a shop through the server.
export async function fetchPublicShop(params) {
  const r = await fetch('/api/shops/public?' + new URLSearchParams(params).toString())
  if (!r.ok) {
    const e = new Error('Shop not found')
    e.status = r.status
    throw e
  }
  return r.json()
}