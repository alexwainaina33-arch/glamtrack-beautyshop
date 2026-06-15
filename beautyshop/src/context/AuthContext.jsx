import { createContext, useContext, useState, useEffect } from 'react'
import pb, { C } from '../lib/pb'

const AuthContext = createContext(null)

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
      if (model?.id) {
        loadShop(model.id)
      } else {
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

  return (
    <AuthContext.Provider value={{ admin, shop, role, permissions, needsShop, loading, login, logout, switchShop, completeShopSetup, loadShop, canAccess }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)