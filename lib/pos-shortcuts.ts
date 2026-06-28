export interface POSShortcut {
  key:         string
  displayKey:  string
  label:       string
  description: string
  category:    'sale' | 'navigation' | 'cart' | 'modal' | 'wizard'
  context:     'pos' | 'wizard' | 'modal' | 'all'
}

export const POS_SHORTCUTS: POSShortcut[] = [
  // Sale actions
  {
    key: 'F2', displayKey: 'F2',
    label: 'Search Medicine',
    description: 'Focus the medicine search bar',
    category: 'navigation', context: 'pos'
  },
  {
    key: 'F3', displayKey: 'F3',
    label: 'Generic Alternatives',
    description: 'Compare generic options for cart items',
    category: 'sale', context: 'pos'
  },
  {
    key: 'F4', displayKey: 'F4',
    label: 'Hold Sale',
    description: 'Park this sale and start a new one',
    category: 'sale', context: 'pos'
  },
  {
    key: 'F5', displayKey: 'F5',
    label: 'Retrieve Held Sale',
    description: 'Resume a previously held sale',
    category: 'sale', context: 'pos'
  },
  {
    key: 'F6', displayKey: 'F6',
    label: 'Process Return',
    description: 'Start a return or exchange',
    category: 'sale', context: 'pos'
  },
  {
    key: 'F7', displayKey: 'F7',
    label: 'Borrow Medicine',
    description: 'Borrow from another pharmacy to fulfill',
    category: 'sale', context: 'pos'
  },
  {
    key: 'F8', displayKey: 'F8',
    label: 'Lend to Pharmacy',
    description: 'Lend stock to another pharmacy',
    category: 'sale', context: 'pos'
  },
  {
    key: 'F9', displayKey: 'F9',
    label: 'Complete Sale',
    description: 'Open checkout to complete the sale',
    category: 'sale', context: 'pos'
  },
  {
    key: '?', displayKey: '?',
    label: 'Show Help',
    description: 'Show keyboard shortcuts reference',
    category: 'navigation', context: 'all'
  },
  {
    key: 'Escape', displayKey: 'Esc',
    label: 'Cancel / Close',
    description: 'Close any open overlay or modal',
    category: 'navigation', context: 'all'
  },
  // Cart navigation
  {
    key: 'Tab', displayKey: 'Tab',
    label: 'Next Quantity',
    description: 'Move focus to next item qty field',
    category: 'cart', context: 'pos'
  },
  {
    key: 'Shift+Tab', displayKey: 'Shift+Tab',
    label: 'Previous Quantity',
    description: 'Move focus to previous item qty field',
    category: 'cart', context: 'pos'
  },
  {
    key: 'Enter', displayKey: 'Enter',
    label: 'Next Quantity',
    description: 'In qty field: move to next qty field',
    category: 'cart', context: 'pos'
  },
  {
    key: 'Delete', displayKey: 'Del',
    label: 'Remove Item',
    description: 'Remove focused item (qty=1), single item in cart, or open item selector (multiple items)',
    category: 'cart', context: 'pos'
  },
  {
    key: 'Backspace', displayKey: '⌫',
    label: 'Undo Remove',
    description: 'Restore last removed item (5 sec window)',
    category: 'cart', context: 'pos'
  },
  {
    key: 'b', displayKey: 'B',
    label: 'Change Batch',
    description: 'Change batch for the focused cart item',
    category: 'cart', context: 'pos'
  },
  {
    key: 'ArrowDown', displayKey: '↓',
    label: 'Next Search Result',
    description: 'Navigate down in medicine search results',
    category: 'navigation', context: 'pos'
  },
  {
    key: 'ArrowUp', displayKey: '↑',
    label: 'Previous Search Result',
    description: 'Navigate up in medicine search results',
    category: 'navigation', context: 'pos'
  },
  // Checkout modal
  {
    key: 'Enter', displayKey: 'Enter',
    label: 'Complete Sale',
    description: 'Confirm and complete the sale',
    category: 'modal', context: 'modal'
  },
  {
    key: 'Escape', displayKey: 'Esc',
    label: 'Cancel',
    description: 'Close checkout without completing',
    category: 'modal', context: 'modal'
  },
  // Wizard
  {
    key: '1', displayKey: '1',
    label: 'Select Original',
    description: 'Select original prescription for all items',
    category: 'wizard', context: 'wizard'
  },
  {
    key: '2', displayKey: '2',
    label: 'Select Option 2',
    description: 'Select Generic Option 1 for all items',
    category: 'wizard', context: 'wizard'
  },
  {
    key: '3', displayKey: '3',
    label: 'Select Option 3',
    description: 'Select Generic Option 2 for all items',
    category: 'wizard', context: 'wizard'
  },
  {
    key: '4', displayKey: '4',
    label: 'Select Option 4',
    description: 'Select Generic Option 3 for all items',
    category: 'wizard', context: 'wizard'
  },
  {
    key: 'l', displayKey: 'L',
    label: 'Lowest Price',
    description: 'Auto-select lowest price option per item',
    category: 'wizard', context: 'wizard'
  },
  {
    key: 'Enter', displayKey: 'Enter',
    label: 'Apply Selection',
    description: 'Apply selected options and close wizard',
    category: 'wizard', context: 'wizard'
  },
]

export function getShortcuts(
  context: POSShortcut['context'] | POSShortcut['context'][]
): POSShortcut[] {
  const contexts = Array.isArray(context) ? context : [context]
  return POS_SHORTCUTS.filter(
    s => contexts.includes(s.context) || s.context === 'all'
  )
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

export function focusNextQtyInput(current: HTMLInputElement): void {
  const all = Array.from(
    document.querySelectorAll<HTMLInputElement>('[data-qty-input]')
  )
  const idx = all.indexOf(current)
  if (idx >= 0 && idx < all.length - 1) {
    all[idx + 1].focus()
    all[idx + 1].select()
  }
  // Last item: stay (Option A)
}

export function focusLastQtyInput(): void {
  setTimeout(() => {
    const all = document.querySelectorAll<HTMLInputElement>('[data-qty-input]')
    const last = all[all.length - 1]
    if (last) { last.focus(); last.select() }
  }, 50)
}

export function getShortcutsByCategory(
  context: POSShortcut['context'] | POSShortcut['context'][]
): Record<string, POSShortcut[]> {
  const shortcuts = getShortcuts(context)
  return shortcuts.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {} as Record<string, POSShortcut[]>)
}
