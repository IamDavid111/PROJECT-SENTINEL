import { z } from 'zod'

import { getCountryOption, getCountryRegion, worldRegions } from './locations'

function validateLocationSelection(
  data: { region: string; country: string; state: string },
  context: z.RefinementCtx,
) {
  if (!data.region) return

  if (!worldRegions.includes(data.region as (typeof worldRegions)[number])) {
    context.addIssue({ code: 'custom', path: ['region'], message: 'Select a valid region.' })
    return
  }

  if (!data.country) return

  const country = getCountryOption(data.country)
  if (!country || getCountryRegion(country.code) !== data.region) {
    context.addIssue({ code: 'custom', path: ['country'], message: 'Select a country within the selected region.' })
    return
  }

  if (data.state && country.regions.length > 0 && !country.regions.some(([name]) => name === data.state)) {
    context.addIssue({ code: 'custom', path: ['state'], message: 'Select a state or province within the selected country.' })
  }
}

export const companyCodeSchema = z
  .string()
  .regex(/^[A-Z0-9-]{3,20}$/, 'Use 3-20 uppercase letters, numbers, or hyphens.')

export const loginSchema = z.object({
  email: z.string().email('Enter a valid work email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  companyCode: companyCodeSchema,
  rememberMe: z.boolean().optional(),
})

export const registrationSchema = z.object({
  companyName: z.string().min(2, 'Company name is required.'),
  companyRegistrationNumber: z.string().optional(),
  companyType: z.string().optional(),
  industry: z.string().min(2, 'Industry is required.'),
  companySize: z.string().min(2, 'Company size is required.'),
  region: z.string().min(2, 'Region is required.'),
  country: z.string().min(2, 'Country is required.'),
  state: z.string().min(2, 'State is required.'),
  address: z.string().optional(),
  contactEmail: z.string().email('Valid contact email is required.'),
  contactPhone: z.string().min(6, 'Phone number is required.'),
  adminName: z.string().min(2, 'Admin full name is required.'),
  adminEmail: z.string().email('Valid admin email is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  passwordConfirmation: z.string().min(8, 'Please confirm your password.'),
  acceptTerms: z.boolean().refine((value) => value === true, 'You must accept the terms to continue.'),
}).superRefine(validateLocationSelection).refine((data) => data.password === data.passwordConfirmation, {
  message: 'Passwords do not match.',
  path: ['passwordConfirmation'],
})

export const passwordResetSchema = z.object({
  email: z.string().email('Enter a valid email.'),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, 'Current password is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
  confirmPassword: z.string().min(8, 'Please confirm your new password.'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
})

export const organizationSetupSchema = z.object({
  companyName: z.string().min(2, 'Company name is required.'),
  companyRegistrationNumber: z.string().optional(),
  companyType: z.string().optional(),
  industry: z.string().min(2, 'Industry is required.'),
  companySize: z.string().min(2, 'Company size is required.'),
  region: z.string().min(2, 'Region is required.'),
  country: z.string().min(2, 'Country is required.'),
  state: z.string().min(2, 'State is required.'),
  address: z.string().optional(),
  contactEmail: z.string().email('Valid contact email is required.'),
  contactPhone: z.string().min(6, 'Phone number is required.'),
  adminName: z.string().min(2, 'Admin full name is required.'),
}).superRefine(validateLocationSelection)

export type LoginFormValues = z.infer<typeof loginSchema>
export type RegistrationFormValues = z.infer<typeof registrationSchema>
export type OrganizationSetupFormValues = z.infer<typeof organizationSetupSchema>
export type PasswordResetFormValues = z.infer<typeof passwordResetSchema>
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>
