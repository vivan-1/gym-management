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
 * Feature: gym-management, Property 17: Account lockout after consecutive failures
 *
 * For any admin account, after exactly 5 consecutive failed authentication attempts,
 * the account SHALL be locked. While locked, even valid credentials SHALL be rejected.
 * The lock SHALL expire after 15 minutes.
 *
 * **Validates: Requirements 9.4**
 */
describe('Property 17: Account lockout after consecutive failures', () => {
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
   * Generator for arbitrary non-empty password strings
   */
  const passwordArb = fc.string({ minLength: 1, maxLength: 50 });

  /**
   * Generator for admin IDs
   */
  const adminIdArb = fc.uuid();

  it('should lock the account after exactly 5 consecutive failed attempts (status 423)', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, passwordArb, adminIdArb, async (email, password, adminId) => {
        // Simulate an admin with 4 failed attempts (one more will trigger lockout)
        const adminWith4Failures = {
          id: adminId,
          email,
          passwordHash: '$2b$10$somefakehashvalue',
          failedLoginAttempts: 4,
          lockedUntil: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.admin.findUnique.mockResolvedValue(adminWith4Failures);
        mockComparePassword.mockResolvedValue(false); // Wrong password
        mockPrisma.admin.update.mockResolvedValue(adminWith4Failures);

        // The 5th failed attempt should lock the account
        try {
          await authService.login(email, password);
          expect.fail('Login should have thrown an error');
        } catch (error) {
          expect(error).toBeInstanceOf(AuthError);
          const authError = error as AuthError;
          // After 5th failure, account is locked — status 423
          expect(authError.statusCode).toBe(423);
        }

        // Verify lockAccount was called (update with lockedUntil set)
        expect(mockPrisma.admin.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: adminId },
            data: expect.objectContaining({
              lockedUntil: expect.any(Date),
              failedLoginAttempts: 5,
            }),
          })
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should reject valid credentials while the account is locked', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, passwordArb, adminIdArb, async (email, password, adminId) => {
        // Simulate a locked account (lockedUntil is in the future)
        const lockedAdmin = {
          id: adminId,
          email,
          passwordHash: '$2b$10$somefakehashvalue',
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now (still locked)
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.admin.findUnique.mockResolvedValue(lockedAdmin);
        // Even if password is valid, it should be rejected
        mockComparePassword.mockResolvedValue(true);

        try {
          await authService.login(email, password);
          expect.fail('Login should have been rejected for a locked account');
        } catch (error) {
          expect(error).toBeInstanceOf(AuthError);
          const authError = error as AuthError;
          expect(authError.statusCode).toBe(423);
          expect(authError.message).toContain('locked');
        }

        // comparePassword should NOT have been called since lockout check happens first
        expect(mockComparePassword).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  it('should allow login after the 15-minute lockout expires', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, passwordArb, adminIdArb, async (email, password, adminId) => {
        // Simulate an account whose lockout has expired (lockedUntil is in the past)
        const expiredLockAdmin = {
          id: adminId,
          email,
          passwordHash: '$2b$10$somefakehashvalue',
          failedLoginAttempts: 5,
          lockedUntil: new Date(Date.now() - 1000), // 1 second ago (lock expired)
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        mockPrisma.admin.findUnique.mockResolvedValue(expiredLockAdmin);
        // Password is valid
        mockComparePassword.mockResolvedValue(true);
        // Mock the update calls (clear lockout + reset on success)
        mockPrisma.admin.update.mockResolvedValue({
          ...expiredLockAdmin,
          failedLoginAttempts: 0,
          lockedUntil: null,
        });

        // Login should succeed after lockout expires
        const result = await authService.login(email, password);
        expect(result).toBeDefined();
        expect(result.token).toBe('mock-jwt-token');
        expect(result.admin).toEqual({ id: adminId, email });
      }),
      { numRuns: 100 }
    );
  });

  it('should not lock the account before reaching 5 consecutive failures', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        passwordArb,
        adminIdArb,
        fc.integer({ min: 0, max: 3 }), // 0-3 prior failures (next attempt is 1st-4th failure)
        async (email, password, adminId, priorFailures) => {
          const admin = {
            id: adminId,
            email,
            passwordHash: '$2b$10$somefakehashvalue',
            failedLoginAttempts: priorFailures,
            lockedUntil: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          mockPrisma.admin.findUnique.mockResolvedValue(admin);
          mockComparePassword.mockResolvedValue(false); // Wrong password
          mockPrisma.admin.update.mockResolvedValue(admin);

          try {
            await authService.login(email, password);
            expect.fail('Login should have thrown an error');
          } catch (error) {
            expect(error).toBeInstanceOf(AuthError);
            const authError = error as AuthError;
            // Should be 401 (invalid credentials), NOT 423 (locked)
            expect(authError.statusCode).toBe(401);
            expect(authError.message).toBe('Invalid email or password');
          }

          // Verify failed attempts were incremented but NOT locked
          expect(mockPrisma.admin.update).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { id: adminId },
              data: { failedLoginAttempts: priorFailures + 1 },
            })
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
