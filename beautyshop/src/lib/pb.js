import PocketBase from 'pocketbase'

// Shared backend — same instance as sg_ collections
export const PB_URL = import.meta.env.VITE_PB_URL || 'https://fieldtrack-kenya.fly.dev'

export const pb = new PocketBase(PB_URL)

// Collection names — fully independent bs_ namespace
export const C = {
  ADMINS:         'bs_admins',
  SHOPS:          'bs_shops',
  SHOP_ADMINS:    'bs_shop_admins',
  CATEGORIES:     'bs_categories',
  PRODUCTS:       'bs_products',
  INV_MOVEMENTS:  'bs_inv_movements',
  CUSTOMERS:      'bs_customers',
  SALES:          'bs_sales',
  SALE_ITEMS:     'bs_sale_items',
  EXPENSE_CATS:   'bs_expense_categories',
  EXPENSES:       'bs_expenses',
  SERVICES:       'bs_services',
  STAFF:          'bs_staff',
  APPOINTMENTS:   'bs_appointments',
  COMMISSION_PAYOUTS: 'bs_commission_payouts',
}

export default pb
