import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { comparePassword } from '../utils/password';
import { AdminProfile } from '../types/interfaces';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const TOKEN_EXPIRATION = '24h';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

export interface LoginResult {
  token: string;
  admin: AdminProfile;
}

export class AuthService {
  /**
   * Authenticate an admin with email and password.
   * Checks lockout status, verifies credentials, manages failed attempt counter,
   * and generates a JWT on success.
   */
  async login(email: string, password: string): Promise<LoginResult> {
    const admin = await prisma.admin.findUnique({ where: { email } });

    if (!admin) {
      throw new AuthError('Invalid email or password', 401);
    }

    // Check if account is locked
    if (admin.lockedUntil && new Date() < new Date(admin.lockedUntil)) {
      const remainingMs = new Date(admin.lockedUntil).getTime() - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      throw new AuthError(
        `Account is locked. Try again in ${remainingMinutes} minute(s).`,
        423
      );
    }

    // If lockout has expired, clear it
    if (admin.lockedUntil && new Date() >= new Date(admin.lockedUntil)) {
      await prisma.admin.update({
        where: { id: admin.id },
        data: { lockedUntil: null, failedLoginAttempts: 0 },
      });
    }

    // Verify password
    const isValid = await comparePassword(password, admin.passwordHash);

    if (!isValid) {
      const newFailedAttempts = admin.failedLoginAttempts + 1;

      if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
        // Lock the account
        await this.lockAccount(admin.id);
        throw new AuthError(
          'Account is locked due to too many failed attempts. Try again in 15 minutes.',
          423
        );
      }

      // Increment failed attempts
      await prisma.admin.update({
        where: { id: admin.id },
        data: { failedLoginAttempts: newFailedAttempts },
      });

      throw new AuthError('Invalid email or password', 401);
    }

    // Successful login — reset failed attempts
    await prisma.admin.update({
      where: { id: admin.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    // Generate JWT
    const token = jwt.sign(
      { adminId: admin.id, email: admin.email },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRATION }
    );

    return {
      token,
      admin: { id: admin.id, email: admin.email },
    };
  }

  /**
   * Validate a JWT token and return the admin profile.
   */
  async validateToken(token: string): Promise<AdminProfile> {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as {
        adminId: string;
        email: string;
      };

      const admin = await prisma.admin.findUnique({
        where: { id: payload.adminId },
      });

      if (!admin) {
        throw new AuthError('Admin not found', 401);
      }

      return { id: admin.id, email: admin.email };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError('Invalid or expired token', 401);
    }
  }

  /**
   * Lock an admin account for 15 minutes.
   */
  async lockAccount(adminId: string): Promise<void> {
    const lockedUntil = new Date(
      Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000
    );

    await prisma.admin.update({
      where: { id: adminId },
      data: {
        lockedUntil,
        failedLoginAttempts: MAX_FAILED_ATTEMPTS,
      },
    });
  }

  /**
   * Unlock an admin account and reset failed attempts.
   */
  async unlockAccount(adminId: string): Promise<void> {
    await prisma.admin.update({
      where: { id: adminId },
      data: {
        lockedUntil: null,
        failedLoginAttempts: 0,
      },
    });
  }

  /**
   * Get the current failed login attempt count for an admin.
   */
  async getFailedAttempts(adminId: string): Promise<number> {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      select: { failedLoginAttempts: true },
    });

    if (!admin) {
      throw new AuthError('Admin not found', 404);
    }

    return admin.failedLoginAttempts;
  }
}

/**
 * Custom error class for authentication errors.
 */
export class AuthError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export const authService = new AuthService();
