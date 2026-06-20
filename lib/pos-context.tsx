'use client'

import React, { createContext, useContext, useReducer, useMemo } from 'react'
import type { CartItem, Cart } from '@/lib/pos-types'

// ─── State ────────────────────────────────────────────────────────────────────

interface CartState {
  items:              CartItem[]
  customerId:         string | null
  customerName:       string | null
  discountAmount:     number
  serviceFee:         number
  serviceFeeLabel:    string   // e.g. "Service Fee", "Handling Fee" — from settings
  serviceFeeEnabled:  boolean  // whether to show/apply the fee — from settings
  notes:              string
  heldSaleId:         string | null
}

// ─── Actions ──────────────────────────────────────────────────────────────────

type CartAction =
  | { type: 'ADD_ITEM';            item: CartItem }
  | { type: 'REMOVE_ITEM';         itemId: string }
  | { type: 'UPDATE_QTY';          itemId: string; qty: number }
  | { type: 'UPDATE_DISCOUNT';     itemId: string; discountPct: number }
  | { type: 'SET_CUSTOMER';        customerId: string | null; customerName: string | null }
  | { type: 'SET_NOTES';           notes: string }
  | { type: 'SET_SERVICE_FEE';     serviceFee: number }
  | { type: 'SET_DISCOUNT_AMOUNT'; discountAmount: number }
  | { type: 'LOAD_CART';           cart: Cart; heldSaleId: string }
  | { type: 'CLEAR_CART' }

function recalcTotal(item: CartItem): number {
  return item.quantity * item.unitPrice * (1 - item.discountPct / 100)
}

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const idx = state.items.findIndex(i => i.batchId === action.item.batchId)
      if (idx >= 0) {
        const items = state.items.map((item, i) => {
          if (i !== idx) return item
          const qty = item.quantity + action.item.quantity
          return { ...item, quantity: qty, totalPrice: recalcTotal({ ...item, quantity: qty }) }
        })
        return { ...state, items }
      }
      return { ...state, items: [...state.items, action.item] }
    }

    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(i => i.id !== action.itemId) }

    case 'UPDATE_QTY': {
      const qty = Math.max(1, action.qty)
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.itemId
            ? { ...i, quantity: qty, totalPrice: recalcTotal({ ...i, quantity: qty }) }
            : i,
        ),
      }
    }

    case 'UPDATE_DISCOUNT': {
      const pct = Math.max(0, action.discountPct)
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.itemId
            ? { ...i, discountPct: pct, totalPrice: recalcTotal({ ...i, discountPct: pct }) }
            : i,
        ),
      }
    }

    case 'SET_CUSTOMER':
      return { ...state, customerId: action.customerId, customerName: action.customerName }

    case 'SET_NOTES':
      return { ...state, notes: action.notes }

    case 'SET_SERVICE_FEE':
      return { ...state, serviceFee: action.serviceFee }

    case 'SET_DISCOUNT_AMOUNT':
      return { ...state, discountAmount: action.discountAmount }

    case 'LOAD_CART':
      // Spread state first so serviceFeeLabel and serviceFeeEnabled (from settings/provider)
      // are preserved — the held sale doesn't store these settings-derived values.
      return {
        ...state,
        items:          action.cart.items,
        customerId:     action.cart.customerId,
        customerName:   action.cart.customerName,
        discountAmount: action.cart.discountAmount,
        serviceFee:     action.cart.serviceFee,
        notes:          action.cart.notes,
        heldSaleId:     action.heldSaleId,
      }

    case 'CLEAR_CART':
      return {
        items:             [],
        customerId:        null,
        customerName:      null,
        discountAmount:    0,
        serviceFee:        state.serviceFee,         // preserve configured fee amount
        serviceFeeLabel:   state.serviceFeeLabel,    // preserve label from settings
        serviceFeeEnabled: state.serviceFeeEnabled,  // preserve enabled flag from settings
        notes:             '',
        heldSaleId:        null,
      }

    default:
      return state
  }
}

// ─── Context value type ───────────────────────────────────────────────────────

interface CartContextValue {
  items:              CartItem[]
  customerId:         string | null
  customerName:       string | null
  discountAmount:     number
  serviceFee:         number
  serviceFeeLabel:    string
  serviceFeeEnabled:  boolean
  notes:              string
  heldSaleId:         string | null
  // Computed
  subtotal:           number
  total:              number
  itemCount:          number
  // Actions
  addItem:           (item: CartItem) => void
  removeItem:        (itemId: string) => void
  updateQuantity:    (itemId: string, qty: number) => void
  updateDiscount:    (itemId: string, discountPct: number) => void
  setCustomer:       (id: string | null, name: string | null) => void
  setNotes:          (notes: string) => void
  setServiceFee:     (amount: number) => void
  setDiscountAmount: (amount: number) => void
  loadCart:          (cart: Cart, heldSaleId: string) => void
  clearCart:         () => void
}

const CartContext = createContext<CartContextValue | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CartProvider({
  children,
  initialServiceFee     = 0,
  initialServiceFeeLabel    = 'Service Fee',
  initialServiceFeeEnabled  = false,
}: {
  children:                   React.ReactNode
  initialServiceFee?:         number
  initialServiceFeeLabel?:    string
  initialServiceFeeEnabled?:  boolean
}) {
  const [state, dispatch] = useReducer(reducer, {
    items:             [],
    customerId:        null,
    customerName:      null,
    discountAmount:    0,
    serviceFee:        initialServiceFee,
    serviceFeeLabel:   initialServiceFeeLabel,
    serviceFeeEnabled: initialServiceFeeEnabled,
    notes:             '',
    heldSaleId:        null,
  })

  const subtotal = useMemo(
    () => state.items.reduce((s, i) => s + i.totalPrice, 0),
    [state.items],
  )
  const total = useMemo(
    () => Math.max(0, subtotal - state.discountAmount + state.serviceFee),
    [subtotal, state.discountAmount, state.serviceFee],
  )

  const value: CartContextValue = useMemo(() => ({
    ...state,
    subtotal,
    total,
    itemCount:         state.items.length,
    addItem:           (item) => dispatch({ type: 'ADD_ITEM', item }),
    removeItem:        (itemId) => dispatch({ type: 'REMOVE_ITEM', itemId }),
    updateQuantity:    (itemId, qty) => dispatch({ type: 'UPDATE_QTY', itemId, qty }),
    updateDiscount:    (itemId, discountPct) => dispatch({ type: 'UPDATE_DISCOUNT', itemId, discountPct }),
    setCustomer:       (customerId, customerName) => dispatch({ type: 'SET_CUSTOMER', customerId, customerName }),
    setNotes:          (notes) => dispatch({ type: 'SET_NOTES', notes }),
    setServiceFee:     (serviceFee) => dispatch({ type: 'SET_SERVICE_FEE', serviceFee }),
    setDiscountAmount: (discountAmount) => dispatch({ type: 'SET_DISCOUNT_AMOUNT', discountAmount }),
    loadCart:          (cart, heldSaleId) => dispatch({ type: 'LOAD_CART', cart, heldSaleId }),
    clearCart:         () => dispatch({ type: 'CLEAR_CART' }),
  }), [state, subtotal, total])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
