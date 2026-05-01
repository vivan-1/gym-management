import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePasswordStrength } from './password';

/**
 * Feature: gym-management, Property 18: Password validation
 *
 * For any string, the password validator SHALL accept it if and only if it has
 * at least 8 characters, contains at least one uppercase letter, at least one
 * lowercase letter, at least one digit, and at least one special character.
 *
 * **Validates: Requirements 9.5**
 */
describe('Property 18: Password validation', () => {
  const SPECIAL_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';

  /**
   * Generator for valid passwords that satisfy all criteria:
   * - ≥8 characters
   * - At least one uppercase letter
   * - At least one lowercase letter
   * - At least one digit
   * - At least one special character
   */
  const validPasswordArb = fc
    .record({
      upper: fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 1, maxLength: 3 }),
      lower: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 3 }),
      digit: fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 1, maxLength: 3 }),
      special: fc.stringOf(fc.constantFrom(...SPECIAL_CHARS.split('')), { minLength: 1, maxLength: 3 }),
      padding: fc.stringOf(
        fc.constantFrom(
          ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'.split('')
        ),
        { minLength: 0, maxLength: 8 }
      ),
    })
    .chain(({ upper, lower, digit, special, padding }) => {
      const chars = (upper + lower + digit + special + padding).split('');
      return fc.shuffledSubarray(chars, { minLength: chars.length, maxLength: chars.length }).map((arr) => arr.join(''));
    })
    .filter((pw) => pw.length >= 8);

  /**
   * Generator for passwords missing at least one criterion.
   * We generate passwords that violate exactly one requirement at a time.
   */
  const noUppercaseArb = fc
    .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'.split('')), { minLength: 8, maxLength: 20 })
    .filter((pw) => /[a-z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw) && !/[A-Z]/.test(pw));

  const noLowercaseArb = fc
    .stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'.split('')), { minLength: 8, maxLength: 20 })
    .filter((pw) => /[A-Z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw) && !/[a-z]/.test(pw));

  const noDigitArb = fc
    .stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*'.split('')), { minLength: 8, maxLength: 20 })
    .filter((pw) => /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[^A-Za-z0-9]/.test(pw) && !/[0-9]/.test(pw));

  const noSpecialArb = fc
    .stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 8, maxLength: 20 })
    .filter((pw) => /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw) && !/[^A-Za-z0-9]/.test(pw));

  const tooShortArb = fc
    .stringOf(
      fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'.split('')),
      { minLength: 1, maxLength: 7 }
    );

  it('should accept all passwords meeting all criteria (≥8 chars, uppercase, lowercase, digit, special)', () => {
    fc.assert(
      fc.property(validPasswordArb, (password) => {
        const result = validatePasswordStrength(password);
        expect(result.success).toBe(true);
        expect(result.errors).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('should reject passwords missing an uppercase letter', () => {
    fc.assert(
      fc.property(noUppercaseArb, (password) => {
        const result = validatePasswordStrength(password);
        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.some((e) => e.includes('uppercase'))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject passwords missing a lowercase letter', () => {
    fc.assert(
      fc.property(noLowercaseArb, (password) => {
        const result = validatePasswordStrength(password);
        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.some((e) => e.includes('lowercase'))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject passwords missing a digit', () => {
    fc.assert(
      fc.property(noDigitArb, (password) => {
        const result = validatePasswordStrength(password);
        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.some((e) => e.includes('digit'))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject passwords missing a special character', () => {
    fc.assert(
      fc.property(noSpecialArb, (password) => {
        const result = validatePasswordStrength(password);
        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.some((e) => e.includes('special character'))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should reject passwords shorter than 8 characters', () => {
    fc.assert(
      fc.property(tooShortArb, (password) => {
        const result = validatePasswordStrength(password);
        expect(result.success).toBe(false);
        expect(result.errors).toBeDefined();
        expect(result.errors!.some((e) => e.includes('8 characters'))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should accept if and only if all criteria are met (biconditional check)', () => {
    const anyStringArb = fc.string({ minLength: 0, maxLength: 30 });

    fc.assert(
      fc.property(anyStringArb, (password) => {
        const hasMinLength = password.length >= 8;
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasDigit = /[0-9]/.test(password);
        const hasSpecial = /[^A-Za-z0-9]/.test(password);

        const shouldBeValid = hasMinLength && hasUppercase && hasLowercase && hasDigit && hasSpecial;
        const result = validatePasswordStrength(password);

        expect(result.success).toBe(shouldBeValid);
      }),
      { numRuns: 200 }
    );
  });
});
