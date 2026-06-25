import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserRole } from '@/lib/permissions'

// ─── Action type registry ─────────────────────────────────────────────────────

export const ACTION_TYPES = {
  // User management
  CREATE_USER:          'CREATE_USER',
  UPDATE_USER:          'UPDATE_USER',
  DEACTIVATE_USER:      'DEACTIVATE_USER',
  REACTIVATE_USER:      'REACTIVATE_USER',
  RESET_PASSWORD:       'RESET_PASSWORD',
  CHANGE_PASSWORD:      'CHANGE_PASSWORD',
  UPDATE_PERMISSIONS:   'UPDATE_PERMISSIONS',
  LOGIN:                'LOGIN',
  LOGOUT:               'LOGOUT',

  // Medicine master
  CREATE_MEDICINE:      'CREATE_MEDICINE',
  UPDATE_MEDICINE:      'UPDATE_MEDICINE',
  DEACTIVATE_MEDICINE:  'DEACTIVATE_MEDICINE',
  REACTIVATE_MEDICINE:  'REACTIVATE_MEDICINE',
  IMPORT_MEDICINES:     'IMPORT_MEDICINES',
  CREATE_CATEGORY:      'CREATE_CATEGORY',
  UPDATE_CATEGORY:      'UPDATE_CATEGORY',

  // Stock management
  ADD_STOCK_BATCH:      'ADD_STOCK_BATCH',
  ADJUST_STOCK:         'ADJUST_STOCK',
  STOCK_WRITEOFF:       'STOCK_WRITEOFF',

  // Sales (Phase 5)
  CREATE_SALE:          'CREATE_SALE',
  HOLD_SALE:            'HOLD_SALE',
  RESUME_SALE:          'RESUME_SALE',
  VOID_SALE:            'VOID_SALE',
  RETURN_SALE:          'RETURN_SALE',
  APPROVE_PRESCRIPTION: 'APPROVE_PRESCRIPTION',

  // Procurement (Phase 4)
  CREATE_PO:            'CREATE_PO',
  ADD_PO_ITEM:          'ADD_PO_ITEM',
  UPDATE_PO_ITEM:       'UPDATE_PO_ITEM',
  CONFIRM_PO:           'CONFIRM_PO',
  APPROVE_PO:           'APPROVE_PO',
  REJECT_PO:            'REJECT_PO',
  CANCEL_PO:            'CANCEL_PO',
  CREATE_GRN:           'CREATE_GRN',
  REVERT_PO_TO_DRAFT:   'REVERT_PO_TO_DRAFT',
  // Phase 4B
  PO_FORCE_CLOSED:      'PO_FORCE_CLOSED',
  PO_DELETED:           'PO_DELETED',
  PO_REVERTED_TO_DRAFT: 'PO_REVERTED_TO_DRAFT',
  PO_ITEM_REMOVED:      'PO_ITEM_REMOVED',

  // Suppliers (Phase 4)
  CREATE_SUPPLIER:      'CREATE_SUPPLIER',
  UPDATE_SUPPLIER:      'UPDATE_SUPPLIER',
  DEACTIVATE_SUPPLIER:  'DEACTIVATE_SUPPLIER',
  REACTIVATE_SUPPLIER:  'REACTIVATE_SUPPLIER',

  // Expenses (Phase 8)
  RECORD_EXPENSE:       'RECORD_EXPENSE',
  CREATE_EXPENSE:       'CREATE_EXPENSE',
  UPDATE_EXPENSE:       'UPDATE_EXPENSE',
  EDIT_EXPENSE:         'EDIT_EXPENSE',
  DELETE_EXPENSE:       'DELETE_EXPENSE',
  VOID_EXPENSE:         'VOID_EXPENSE',

  // Settings
  UPDATE_SETTINGS:      'UPDATE_SETTINGS',

  // Shifts (Phase 5)
  OPEN_SHIFT:           'OPEN_SHIFT',
  CLOSE_SHIFT:          'CLOSE_SHIFT',
  AUTO_CLOSE_SHIFT:     'AUTO_CLOSE_SHIFT',

  // Ledger & Accounting (Phase 7)
  MANUAL_JOURNAL_ENTRY:  'MANUAL_JOURNAL_ENTRY',
  REVERSE_JOURNAL_ENTRY: 'REVERSE_JOURNAL_ENTRY',
  SUPPLIER_PAYMENT:      'SUPPLIER_PAYMENT',
  CUSTOMER_PAYMENT:      'CUSTOMER_PAYMENT',
  BORROWING_TRANSACTION: 'BORROWING_TRANSACTION',

  // Returns & Exchanges (Phase 6)
  INITIATE_RETURN: 'INITIATE_RETURN',
  APPROVE_RETURN:  'APPROVE_RETURN',
  DENY_RETURN:     'DENY_RETURN',

  // Borrowing POS (Phase 7F)
  BORROW_TO_FULFILL:    'BORROW_TO_FULFILL',
  LEND_TO_PHARMACY:     'LEND_TO_PHARMACY',
  BORROWING_SETTLEMENT: 'BORROWING_SETTLEMENT',
} as const

export type ActionType = typeof ACTION_TYPES[keyof typeof ACTION_TYPES]

// ─── logAction helper ─────────────────────────────────────────────────────────

interface LogActionParams {
  supabase:   SupabaseClient
  userId:     string
  userRole:   UserRole
  action:     ActionType
  tableName?: string
  recordId?:  string
  oldValue?:  Record<string, unknown>
  newValue?:  Record<string, unknown>
}

export async function logAction(params: LogActionParams): Promise<void> {
  const { supabase, userId, userRole, action, tableName, recordId, oldValue, newValue } = params

  const { error } = await supabase.from('audit_logs').insert({
    user_id:    userId,
    user_role:  userRole,
    action,
    table_name: tableName,
    record_id:  recordId,
    old_value:  oldValue ?? null,
    new_value:  newValue ?? null,
  })

  // Never throw on audit failure — log errors to console only.
  // Audit logging must never block the main operation.
  if (error) {
    console.error('[audit] Failed to log action:', action, error.message)
  }
}
