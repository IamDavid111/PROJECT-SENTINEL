import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Enter a valid work email.'),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  companyCode: z.string().min(3, 'Company code is required.'),
  rememberMe: z.boolean().optional(),
})

export const registrationSchema = z.object({
  companyName: z.string().min(2, 'Company name is required.'),
  industry: z.string().min(2, 'Industry is required.'),
  companySize: z.string().min(2, 'Company size is required.'),
  country: z.string().min(2, 'Country is required.'),
  state: z.string().min(2, 'State is required.'),
  contactEmail: z.string().email('Valid contact email is required.'),
  contactPhone: z.string().min(6, 'Phone number is required.'),
  adminName: z.string().min(2, 'Admin full name is required.'),
  adminEmail: z.string().email('Valid admin email is required.'),
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
