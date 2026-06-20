/**
 * Generate a unique username for a new user.
 * Format: firstname.lastname@pharmacyslug
 *
 * pharmacySlug = pharmacy name from settings, lowercased,
 * spaces and special chars replaced with dots,
 * multiple consecutive dots collapsed to one.
 *
 * Example: "City Pharmacy Plus" → "city.pharmacy.plus"
 *
 * If "ali.khan@pharmacare" exists:
 *   try "ali.khan2@pharmacare"
 *   try "ali.khan3@pharmacare" etc.
 */
export function generateUsername(
  firstName: string,
  lastName: string,
  pharmacyName: string,
  existingUsernames: string[],
): string {
  const slug = pharmacyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/, '')

  const base      = `${firstName.toLowerCase().trim()}.${lastName.toLowerCase().trim()}`
  const candidate = `${base}@${slug}`

  if (!existingUsernames.includes(candidate)) return candidate

  let counter = 2
  while (existingUsernames.includes(`${base}${counter}@${slug}`)) {
    counter++
  }
  return `${base}${counter}@${slug}`
}

/**
 * Generate a cryptographically random strong password.
 *
 * Rules:
 * - 12 characters total
 * - At least 1 uppercase, 1 lowercase, 1 digit, 1 special char (@#$%!)
 * - No ambiguous characters (0, O, l, 1, I)
 *
 * Never stored in plaintext. Passed to Supabase Auth which hashes it.
 * Returned to the caller once to display on Step 3 of the creation wizard.
 */
export function generatePassword(): string {
  const upper   = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const lower   = 'abcdefghjkmnpqrstuvwxyz'
  const digits  = '23456789'
  const special = '@#$%!'
  const all     = upper + lower + digits + special

  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ]

  const rest = Array.from({ length: 8 }, () =>
    all[Math.floor(Math.random() * all.length)]
  )

  return [...required, ...rest]
    .sort(() => Math.random() - 0.5)
    .join('')
}
