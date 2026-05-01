import bcrypt from 'bcrypt';
import { passwordSchema } from '../schemas';

const DEFAULT_SALT_ROUNDS = 10;

/**
 * Hash a plaintext password using bcrypt.
 * @param password - The plaintext password to hash
 * @param saltRounds - Number of salt rounds (default: 10)
 * @returns The hashed password string
 */
export async function hashPassword(
  password: string,
  saltRounds: number = DEFAULT_SALT_ROUNDS
): Promise<string> {
  return bcrypt.hash(password, saltRounds);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 * @param password - The plaintext password to check
 * @param hash - The bcrypt hash to compare against
 * @returns True if the password matches the hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength using the Zod passwordSchema.
 * Requirements: minimum 8 characters, at least one uppercase letter,
 * one lowercase letter, one digit, and one special character.
 * @param password - The password string to validate
 * @returns An object with `success` boolean and optional `errors` array of messages
 */
export function validatePasswordStrength(password: string): {
  success: boolean;
  errors?: string[];
} {
  const result = passwordSchema.safeParse(password);
  if (result.success) {
    return { success: true };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => e.message),
  };
}
