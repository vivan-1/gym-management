import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { AuthService, AuthError } from './auth.service';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    admin: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock password utilities
vi.mock('../utils/password', () => ({
  comparePassword: vi.fn(),
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-jwt-token'),
    verify: vi.fn(() => ({ adminId: 'admin-1', email: 'admin@gym.com' })),
  },
}));

import { prisma } from '../lib/prisma';
import { comparePassword } from '../utils/password';

const mockPrisma = prisma as unknown as {
  admin: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const mockComparePassword = comparePassword as ReturnType<typeof vi.fn>;

/**
 * Feature: gym-management, Property 16: Invalid credentials are denied
 *
 * For any admin account and any password that does not match the stored password,
 * authentication SHALL fail and access SHALL be denied.
 *
 * **Validates: Requirements 9.3**
 */
describe('Property 16: Invalid credentials are denied', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService();
  });

  /**
   * Generator for valid email addresses
   */
  const emailArb = fc
    .record({
      local: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
        minLength: 1,
        maxLength: 15,
      }),
      domain: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
        minLength: 2,
        maxLength: 10,
      }),
      tld: fc.constantFrom('com', 'org', 'net', 'io'),
    })
    .map(({ local, domain, tld }) => `${local}@${domain}.${tld}`);

  /**
   * Generator for arbitrary non-empty password strings (the "wrong" password attempts)
   */
  const wrongPasswordArb = fc.string({ minLength: 1, maxLength: 50 });

  /**
   * Generator for admin records with unlocked accounts
   */
  const adminRecordArb = fc
    .record({
      id: fc.uuid(),
      passwordHash: fc.string({ minLength: 20, maxLength: 60 }),
      failedLoginAttempts: fc.integer({ min: 0, max: 3 }),
    })
    .map(({ id, passwordHash, failedLoginAttempts }) => ({
      id,
      email: '', // will be set per-test
      passwordHash,
      failedLoginAttempts,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

  it('should deny authentication for any password that does not match the stored hash', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, wrongPasswordArb, adminRecordArb, async (email, wrongPassword, adminRecord) => {
        // Set up the admin record with the test email
        const admin = { ...adminRecord, email };

        // Mock: admin exists in the database
        mockPrisma.admin.findUnique.mockResolvedValue(admin);

        // Mock: comparePassword returns false (password does NOT match stored hash)
        mockComparePassword.mockResolvedValue(false);

        // Mock: update call succeeds (for incrementing failed attempts)
        mockPrisma.admin.update.mockResolvedValue(admin);

        // Attempt login with the wrong password — should always fail
        try {
          await authService.login(email, wrongPassword);
          // If login succeeds, the property is violated
          expect.fail('Login should have been denied for non-matching password');
        } catch (error) {
          expect(error).toBeInstanceOf(AuthError);
          const authError = error as AuthError;
          // Should be either 401 (invalid credentials) or 423 (account locked due to reaching max attempts)
          expect([401, 423]).toContain(authError.statusCode);
        }

        // Verify that comparePassword was called with the attempted password
        expect(mockComparePassword).toHaveBeenCalledWith(wrongPassword, admin.passwordHash);
      }),
      { numRuns: 100 }
    );
  });

  it('should never return a token when password comparison fails', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, wrongPasswordArb, async (email, wrongPassword) => {
        const admin = {
          id: 'admin-fixed-id',
          email,
          passwordHash: '$2b$10$somefakehashvalue1234567890abcdef',
          failedLoginAttempts: 0,
          lockedUntil: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.admin.findUnique.mockResolvedValue(admin);
        mockComparePassword.mockResolvedValue(false);
        mockPrisma.admin.update.mockResolvedValue(admin);

        let result: unknown = null;
        try {
          result = await authService.login(email, wrongPassword);
        } catch {
          // Expected to throw
        }

        // The login should never return a successful result
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('should deny access for non-existent email addresses', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, wrongPasswordArb, async (email, password) => {
        // Mock: no admin found for this email
        mockPrisma.admin.findUnique.mockResolvedValue(null);

        try {
          await authService.login(email, password);
          expect.fail('Login should have been denied for non-existent email');
        } catch (error) {
          expect(error).toBeInstanceOf(AuthError);
          const authError = error as AuthError;
          expect(authError.statusCode).toBe(401);
          expect(authError.message).toBe('Invalid email or password');
        }
      }),
      { numRuns: 100 }
    );
  });
});
