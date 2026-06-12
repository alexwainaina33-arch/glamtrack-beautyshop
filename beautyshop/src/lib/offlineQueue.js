import Dexie from 'dexie'

// Local database for offline sale queue
const db = new Dexie('SalesTrackOffline')
db.version(1).stores({
  pendingSales: '++id, createdAt, synced',
  cachedProducts: 'id, shop_id, updatedAt',
  cachedCategories: 'id, shop_id',
})

// Save a sale to offline queue
export async function queueSale(saleData) {
  const id = await db.pendingSales.add({
    ...saleData,
    createdAt: new Date().toISOString(),
    synced: false,
  })
  return id
}

// Get all unsynced sales
export async function getPendingSales() {
  return db.pendingSales.filter(s => s.synced === false).toArray()
}

// Mark a sale as synced
export async function markSynced(id) {
  await db.pendingSales.update(id, { synced: true })
}

// Delete synced sales older than 7 days
export async function cleanOldSynced() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  await db.pendingSales.where('createdAt').below(cutoff).and(s => s.synced).delete()
}

// Cache products locally
export async function cacheProducts(products) {
  await db.cachedProducts.bulkPut(products)
}

// Cache categories locally
export async function cacheCategories(categories) {
  await db.cachedCategories.bulkPut(categories)
}

// Get cached products for a shop
export async function getCachedProducts(shopId) {
  return db.cachedProducts.where('shop_id').equals(shopId).toArray()
}

// Get cached categories for a shop
export async function getCachedCategories(shopId) {
  return db.cachedCategories.where('shop_id').equals(shopId).toArray()
}

export { db }