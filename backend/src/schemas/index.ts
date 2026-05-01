import { z } from 'zod';
import { MembershipStatus, PaymentStatus, PaymentMethod, Gender } from '../types/enums';

// ─── Member Registration Schema ─────────────────────────────────────────────

export const memberRegistrationSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  phone: z.string().min(1, 'Phone number is required'),
  dateOfBirth: z.coerce.date({ required_error: 'Date of birth is required' }),
  gender: z.nativeEnum(Gender, { required_error: 'Gender is required' }),
  address: z.string().min(1, 'Address is required'),
});

export type MemberRegistrationSchema = z.infer<typeof memberRegistrationSchema>;

// ─── Membership Creation Schema ─────────────────────────────────────────────

export const membershipCreateSchema = z.object({
  startDate: z.coerce.date({ required_error: 'Start date is required' }),
  duration: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)], {
    required_error: 'Duration is required',
    invalid_type_error: 'Duration must be 1, 3, 6, or 12 months',
  }),
});

export type MembershipCreateSchema = z.infer<typeof membershipCreateSchema>;

// ─── Payment Recording Schema ───────────────────────────────────────────────

export const paymentRecordSchema = z.object({
  amount: z.number({ required_error: 'Amount is required' }).positive('Amount must be positive'),
  paymentDate: z.coerce.date({ required_error: 'Payment date is required' }),
  paymentMethod: z.nativeEnum(PaymentMethod, {
    required_error: 'Payment method is required',
    invalid_type_error: 'Payment method must be cash, card, or online_transfer',
  }),
  membershipId: z.string().min(1, 'Membership ID is required'),
});

export type PaymentRecordSchema = z.infer<typeof paymentRecordSchema>;

// ─── Login Schema ───────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginSchema = z.infer<typeof loginSchema>;

// ─── Password Validation Schema ─────────────────────────────────────────────

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// ─── Search Query Schema ────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationSchema = z.infer<typeof paginationSchema>;

export const searchQuerySchema = z.object({
  term: z.string().min(1, 'Search term is required'),
  membershipStatus: z.nativeEnum(MembershipStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
  pagination: paginationSchema.default({ page: 1, pageSize: 20 }),
});

export type SearchQuerySchema = z.infer<typeof searchQuerySchema>;

// ─── Member Filters Schema ──────────────────────────────────────────────────

export const memberFiltersSchema = z.object({
  membershipStatus: z.nativeEnum(MembershipStatus).optional(),
  paymentStatus: z.nativeEnum(PaymentStatus).optional(),
});

export type MemberFiltersSchema = z.infer<typeof memberFiltersSchema>;
