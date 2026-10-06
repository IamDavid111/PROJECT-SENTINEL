import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// clsx joins classes that may depend on conditions; tailwind-merge removes conflicting utilities.
// This lets callers combine shared styles with overrides without keeping both Tailwind classes.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
