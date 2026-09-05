import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Enter a valid work email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  companyCode: z.string().min(3, 'Company code is required.'),
  rememberMe: z.boolean().optional(),
})

export const registrationSchema = z.object({
  companyCode: z.string().regex(/^[A-Z0-9-]{3,20}$/, 'Use 3-20 uppercase letters, numbers, or hyphens.'),
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
  acceptTerms: z.literal(true, 'You must accept the terms to continue.'),
}).refine((data) => data.password === data.passwordConfirmation, {
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

export type LoginFormValues = z.infer<typeof loginSchema>
export type RegistrationFormValues = z.infer<typeof registrationSchema>
export type PasswordResetFormValues = z.infer<typeof passwordResetSchema>
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>
