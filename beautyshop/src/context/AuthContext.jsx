import { createContext, useContext, useState, useEffect } from 'react'
import pb, { C } from '../lib/pb'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(pb.authStore.model)
  const [shop, setShop] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = pb.authStore.onChange((token, model) => {
      setAdmin(model)
      if (model?.id) {
        loadShop(model.id)
      } else {
        setShop(null)
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
        `admin_id.id = "${adminId}"`,
        { expand: 'shop_id', '$autoCancel': false, '$cancelKey': 'auth-shop' }
      )
      if (res?.expand?.shop_id) {
        setShop(res.expand.shop_id)
      }
    } catch {
      // owner with no shop_admins entry yet — grab first active shop
      try {
        const shops = await pb.collection(C.SHOPS).getList(1, 1, { filter: 'is_active = true', '$autoCancel': false, '$cancelKey': 'auth-shop-fallback' })
        if (shops.items.length) setShop(shops.items[0])
      } catch {}
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
  }

  const switchShop = (newShop) => setShop(newShop)

  return (
    <AuthContext.Provider value={{ admin, shop, loading, login, logout, switchShop }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)