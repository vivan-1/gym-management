import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import jwt from 'jsonwebtoken';

const mockPrisma = prisma as unknown as {
  admin: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const mockComparePassword = comparePassword as ReturnType<typeof vi.fn>;
const mockJwtSign = jwt.sign as ReturnType<typeof vi.fn>;
const mockJwtVerify = jwt.verify as ReturnType<typeof vi.fn>;

describe('AuthService', () => {
  let authService: AuthService;

  const mockAdmin = {
    id: 'admin-1',
    email: 'admin@gym.com',
    passwordHash: 'hashed-password',
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new AuthService();
  });

  describe('login', () => {
    it('should return token and admin profile on successful login', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(mockAdmin);
      mockComparePassword.mockResolvedValue(true);
      mockPrisma.admin.update.mockResolvedValue(mockAdmin);

      const result = await authService.login('admin@gym.com', 'ValidPass1!');

      expect(result.token).toBe('mock-jwt-token');
      expect(result.admin).toEqual({ id: 'admin-1', email: 'admin@gym.com' });
      expect(mockPrisma.admin.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });

    it('should throw 401 for non-existent email', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);

      await expect(
        authService.login('unknown@gym.com', 'password')
      ).rejects.toThrow(AuthError);

      await expect(
        authService.login('unknown@gym.com', 'password')
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('should throw 423 when account is locked', async () => {
      const lockedAdmin = {
        ...mockAdmin,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      };
      mockPrisma.admin.findUnique.mockResolvedValue(lockedAdmin);

      await expect(
        authService.login('admin@gym.com', 'ValidPass1!')
      ).rejects.toMatchObject({ statusCode: 423 });
    });

    it('should increment failed attempts on wrong password', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(mockAdmin);
      mockComparePassword.mockResolvedValue(false);
      mockPrisma.admin.update.mockResolvedValue(mockAdmin);

      await expect(
        authService.login('admin@gym.com', 'WrongPass1!')
      ).rejects.toMatchObject({ statusCode: 401 });

      expect(mockPrisma.admin.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { failedLoginAttempts: 1 },
      });
    });

    it('should lock account after 5 consecutive failed attempts', async () => {
      const adminWith4Failures = {
        ...mockAdmin,
        failedLoginAttempts: 4,
      };
      mockPrisma.admin.findUnique.mockResolvedValue(adminWith4Failures);
      mockComparePassword.mockResolvedValue(false);
      mockPrisma.admin.update.mockResolvedValue(adminWith4Failures);

      await expect(
        authService.login('admin@gym.com', 'WrongPass1!')
      ).rejects.toMatchObject({ statusCode: 423 });

      // lockAccount should have been called (update with lockedUntil)
      expect(mockPrisma.admin.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'admin-1' },
          data: expect.objectContaining({
            lockedUntil: expect.any(Date),
            failedLoginAttempts: 5,
          }),
        })
      );
    });

    it('should clear expired lockout and allow login', async () => {
      const expiredLockAdmin = {
        ...mockAdmin,
        lockedUntil: new Date(Date.now() - 1000), // expired 1 second ago
        failedLoginAttempts: 5,
      };
      mockPrisma.admin.findUnique.mockResolvedValue(expiredLockAdmin);
      mockComparePassword.mockResolvedValue(true);
      mockPrisma.admin.update.mockResolvedValue(expiredLockAdmin);

      const result = await authService.login('admin@gym.com', 'ValidPass1!');

      expect(result.token).toBe('mock-jwt-token');
      // Should have cleared the lockout first
      expect(mockPrisma.admin.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });
    });

    it('should reset failed attempts on successful login', async () => {
      const adminWithFailures = {
        ...mockAdmin,
        failedLoginAttempts: 3,
      };
      mockPrisma.admin.findUnique.mockResolvedValue(adminWithFailures);
      mockComparePassword.mockResolvedValue(true);
      mockPrisma.admin.update.mockResolvedValue(adminWithFailures);

      await authService.login('admin@gym.com', 'ValidPass1!');

      expect(mockPrisma.admin.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });
    });
  });

  describe('validateToken', () => {
    it('should return admin profile for valid token', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(mockAdmin);

      const result = await authService.validateToken('valid-token');

      expect(result).toEqual({ id: 'admin-1', email: 'admin@gym.com' });
    });

    it('should throw 401 for invalid token', async () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(
        authService.validateToken('invalid-token')
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('should throw 401 when admin not found', async () => {
      mockJwtVerify.mockReturnValue({ adminId: 'admin-1', email: 'admin@gym.com' });
      mockPrisma.admin.findUnique.mockResolvedValue(null);

      await expect(
        authService.validateToken('valid-token')
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe('lockAccount', () => {
    it('should set lockedUntil to 15 minutes from now', async () => {
      mockPrisma.admin.update.mockResolvedValue(mockAdmin);

      const before = Date.now();
      await authService.lockAccount('admin-1');
      const after = Date.now();

      const updateCall = mockPrisma.admin.update.mock.calls[0][0];
      const lockedUntil = updateCall.data.lockedUntil as Date;

      // lockedUntil should be approximately 15 minutes from now
      expect(lockedUntil.getTime()).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
      expect(lockedUntil.getTime()).toBeLessThanOrEqual(after + 15 * 60 * 1000);
      expect(updateCall.data.failedLoginAttempts).toBe(5);
    });
  });

  describe('unlockAccount', () => {
    it('should clear lockedUntil and reset failed attempts', async () => {
      mockPrisma.admin.update.mockResolvedValue(mockAdmin);

      await authService.unlockAccount('admin-1');

      expect(mockPrisma.admin.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });
    });
  });

  describe('getFailedAttempts', () => {
    it('should return the current failed attempt count', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue({ failedLoginAttempts: 3 });

      const result = await authService.getFailedAttempts('admin-1');

      expect(result).toBe(3);
    });

    it('should throw 404 when admin not found', async () => {
      mockPrisma.admin.findUnique.mockResolvedValue(null);

      await expect(
        authService.getFailedAttempts('non-existent')
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
