import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
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

function Protected({ children }) {
  const { admin, loading } = useAuth()
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#fdf5f7' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <p style={{ fontFamily: 'Playfair Display,serif', color: '#8b2550', fontSize: 20 }}>GlamTrack</p>
      </div>
    </div>
  )
  return admin ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"    element={<DashboardPage />} />
        <Route path="pos"          element={<POSPage />} />
        <Route path="products"     element={<ProductsPage />} />
        <Route path="inventory"    element={<InventoryPage />} />
        <Route path="sales"        element={<SalesPage />} />
        <Route path="expenses"     element={<ExpensesPage />} />
        <Route path="reports"      element={<ReportsPage />} />
        <Route path="customers"    element={<CustomersPage />} />
        <Route path="suppliers"    element={<SuppliersPage />} />
        <Route path="analytics"    element={<AnalyticsPage />} />
        <Route path="labels"       element={<BarcodeLabelsPage />} />
        <Route path="reconcile"    element={<ReconciliationPage />} />
        <Route path="settings"     element={<SettingsPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="staff"        element={<StaffPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" toastOptions={{ style: { fontFamily: 'Nunito,sans-serif', fontSize: 14, borderRadius: 12 }, success: { iconTheme: { primary: '#c8456a', secondary: '#fff' } } }} />
      </AuthProvider>
    </BrowserRouter>
  )
}
