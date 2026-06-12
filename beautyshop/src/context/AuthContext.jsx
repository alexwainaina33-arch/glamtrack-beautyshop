import { createContext, useContext, useState, useEffect } from 'react'
import pb, { C } from '../lib/pb'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [admin, setAdmin]       = useState(pb.authStore.model)
  const [shop, setShop]         = useState(null)
  const [needsShop, setNeedsShop] = useState(false)   // true = show shop wizard
  const [loading, setLoading]   = useState(true)

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
        setNeedsShop(false)
      } else {
        setNeedsShop(true)
      }
    } catch {
      // No shop_admins entry — new user needs to create their shop
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
    setNeedsShop(false)
  }

  const switchShop = (newShop) => setShop(newShop)

  // Called after shop wizard completes
  const completeShopSetup = (newShop) => {
    setShop(newShop)
    setNeedsShop(false)
  }

  return (
    <AuthContext.Provider value={{ admin, shop, needsShop, loading, login, logout, switchShop, completeShopSetup, loadShop }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)