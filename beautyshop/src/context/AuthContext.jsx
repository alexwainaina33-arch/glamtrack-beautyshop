import { createContext, useContext, useState, useEffect } from 'react'
import pb, { C } from '../lib/pb'
import { DEMO_SHOP_ID } from '../lib/planAccess'

const AuthContext = createContext(null)

// AUTOLOCK — computes whether this shop is currently locked out of
// write actions (read-only mode) due to a lapsed trial or subscription.
// Demo shop always bypasses. Trial shops lock immediately at trial_ends_at
// (0-day grace). Shops that have ever had a subscription_ends_at value
// (i.e. have paid at least once) get a fixed 2-day grace period past
// subscription_ends_at before locking — protects real paying customers
// (e.g. Beltronix) from being locked out over a slow manual renewal.
// See DECISIONS LOG: AUTOLOCK, this session.
export function computeIsLocked(shop) {
  if (!shop) return false
  if (shop.id === DEMO_SHOP_ID) return false

  const now = new Date()

  if (shop.subscription_ends_at) {
    const subEnd = new Date(shop.subscription_ends_at)
    const graceEnd = new Date(subEnd.getTime() + 2 * 86400000) // 2-day fixed grace
    return now > graceEnd
  }

  if (shop.trial_ends_at) {
    const trialEnd = new Date(shop.trial_ends_at)
    return now > trialEnd // 0-day grace — trial locks immediately
  }

  return false
}

export function AuthProvider({ children }) {
  const [admin, setAdmin]         = useState(pb.authStore.model)
  const [shop, setShop]           = useState(null)
  const [role, setRole]           = useState(null)
  const [permissions, setPermissions] = useState(null)
  const [needsShop, setNeedsShop] = useState(false)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    const unsub = pb.authStore.onChange((token, model) => {
      setAdmin(model)
      if (model?.id && !shop) {
        loadShop(model.id)
      } else if (!model?.id) {
        setShop(null)
        setNeedsShop(false)
      }
    })
    if (pb.authStore.isValid && pb.authStore.model) {
      loadShop(pb.authStore.model.id).finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return unsub
  }, [])

  const loadShop = async (adminId) => {
    try {
      const res = await pb.collection(C.SHOP_ADMINS).getFirstListItem(
        `admin_id = "${adminId}"`,
        { expand: 'shop_id', '$autoCancel': false, '$cancelKey': 'auth-shop' }
      )
      if (res?.expand?.shop_id) {
        setShop(res.expand.shop_id)
        setRole(res.role || 'owner')
        setPermissions(res.permissions ? JSON.parse(res.permissions) : null)
        setNeedsShop(false)
      } else {
        setNeedsShop(true)
      }
    } catch {
      setNeedsShop(true)
      setShop(null)
    }
  }

  const login = async (email, password) => {
    const auth = await pb.collection(C.ADMINS).authWithPassword(email, password)
    setAdmin(auth.record)
    await loadShop(auth.record.id)
    return auth
  }

  const logout = () => {
    pb.authStore.clear()
    setAdmin(null)
    setShop(null)
    setRole('owner')
    setPermissions(null)
    setNeedsShop(false)
  }

  // Returns true if the current user can access a feature
  // Usage: canAccess(['owner','manager'])
  const canAccess = (allowedRoles) => allowedRoles.includes(role)

  const switchShop = (newShop) => setShop(newShop)

  // Called after shop wizard completes
  const completeShopSetup = (newShop) => {
    setShop(newShop)
    setNeedsShop(false)
  }

  // AUTOLOCK — recomputed on every render from current shop data.
  // See computeIsLocked() above for the full rule set.
  const isLocked = computeIsLocked(shop)

  return (
    <AuthContext.Provider value={{ admin, shop, role, permissions, needsShop, loading, login, logout, switchShop, completeShopSetup, loadShop, canAccess, isLocked }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)