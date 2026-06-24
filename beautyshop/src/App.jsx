import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import TutorialPage from './pages/TutorialPage'
import PricingPage from './pages/PricingPage'
import DashboardPage from './pages/DashboardPage'
import POSPage from './pages/POSPage'
import ProductsPage from './pages/ProductsPage'
import InventoryPage from './pages/InventoryPage'
import SalesPage from './pages/SalesPage'
import ExpensesPage from './pages/ExpensesPage'
import ReportsPage from './pages/ReportsPage'
import CustomersPage from './pages/CustomersPage'
import SuppliersPage from './pages/SuppliersPage'
import AnalyticsPage from './pages/AnalyticsPage'
import BarcodeLabelsPage from './pages/BarcodeLabelsPage'
import ReconciliationPage from './pages/ReconciliationPage'
import SettingsPage from './pages/SettingsPage'
import AppointmentsPage from './pages/AppointmentsPage'
import StaffPage from './pages/StaffPage'
import ReviewsPage from './pages/ReviewsPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import BookingPage from './pages/BookingPage'
import ShopPage from './pages/ShopPage'
import ReceiptPublicPage from './pages/ReceiptPublicPage'
import NotFoundPage from './pages/NotFoundPage'
import InstallBanner from './components/InstallBanner'
import RoleGuard from './components/RoleGuard'
import PlanGuard from './components/PlanGuard'
import ProfilePage from './pages/ProfilePage'

function LandingRedirect() {
  window.location.replace('/landing.html')
  return null
}

function RoleBasedRedirect() {
  const { role, loading } = useAuth()
  if (loading || role === null) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div className="spinner" />
    </div>
  )
  return <Navigate to={role === 'cashier' ? '/app/pos' : '/app/dashboard'} replace />
}

function Protected({ children }) {
  const { admin, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#fdf5f7' }}>
      <div style={{ textAlign:'center' }}>
        <div className="spinner" style={{ margin:'0 auto 16px' }} />
        <p style={{ fontFamily:'Playfair Display,serif', color:'#8b2550', fontSize:20 }}>SalesTrack</p>
      </div>
    </div>
  )
  return admin ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      {/* Root → landing page */}
      <Route path="/" element={<LandingRedirect />} />

      {/* Public — no auth needed */}
      <Route path="/login"           element={<LoginPage />} />
      <Route path="/tutorial"        element={<TutorialPage />} />
      <Route path="/pricing"         element={<PricingPage />} />
      <Route path="/payment-success" element={<PaymentSuccessPage />} />

      {/* Protected app */}
      <Route path="/app" element={<Protected><Layout /></Protected>}>
        <Route index element={<RoleBasedRedirect />} />
        <Route path="dashboard"    element={<DashboardPage />} />
        <Route path="pos"          element={<POSPage />} />
        <Route path="products"     element={<ProductsPage />} />
        <Route path="inventory"    element={<InventoryPage />} />
        <Route path="sales"        element={<SalesPage />} />
        <Route path="expenses"     element={<RoleGuard allow={['owner','manager']}><ExpensesPage /></RoleGuard>} />
        <Route path="reports"      element={<RoleGuard allow={['owner','manager','viewer']}><ReportsPage /></RoleGuard>} />
        <Route path="customers"    element={<CustomersPage />} />
        <Route path="suppliers"    element={<RoleGuard allow={['owner','manager']}><SuppliersPage /></RoleGuard>} />
        <Route path="analytics"    element={<RoleGuard allow={['owner','manager','viewer']}><PlanGuard requiredPlan="growth"><AnalyticsPage /></PlanGuard></RoleGuard>} />
        <Route path="labels"       element={<RoleGuard allow={['owner','manager']}><BarcodeLabelsPage /></RoleGuard>} />
        <Route path="reconcile"    element={<RoleGuard allow={['owner','manager']}><ReconciliationPage /></RoleGuard>} />
        <Route path="settings"     element={<RoleGuard allow={['owner']}><SettingsPage /></RoleGuard>} />
        <Route path="appointments" element={<PlanGuard requiredPlan="growth"><AppointmentsPage /></PlanGuard>} />
         <Route path="staff"        element={<RoleGuard allow={['owner','manager']}><PlanGuard requiredPlan="growth"><StaffPage /></PlanGuard></RoleGuard>} />
        <Route path="reviews"      element={<RoleGuard allow={['owner','manager']}><ReviewsPage /></RoleGuard>} />
        <Route path="profile"      element={<ProfilePage />} />
      </Route>

      {/* Public booking page — no auth */}
      <Route path="/book/:slug"     element={<BookingPage />} />

      {/* Public shop page — full catalogue */}
      <Route path="/shop/:slug"     element={<ShopPage />} />

      {/* Public digital receipt — accessed via share_token */}
      <Route path="/receipt/:token" element={<ReceiptPublicPage />} />

      {/* 404 */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style:{ fontFamily:'Nunito,sans-serif', fontSize:14, borderRadius:12 },
            success:{ iconTheme:{ primary:'#c8456a', secondary:'#fff' } }
          }}
        />
        <InstallBanner />
      </AuthProvider>
    </BrowserRouter>
  )
}