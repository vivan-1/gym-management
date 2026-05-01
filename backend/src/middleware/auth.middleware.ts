import { Request, Response, NextFunction } from 'express';
import { authService, AuthError } from '../services/auth.service';
import { AdminProfile } from '../types/interfaces';

// Extend Express Request to include admin profile
declare global {
  namespace Express {
    interface Request {
      admin?: AdminProfile;
    }
  }
}

/**
 * JWT authentication middleware.
 * Extracts the Bearer token from the Authorization header,
 * validates it, and attaches the admin profile to the request.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Authorization header is required' });
    return;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({ error: 'Authorization header must be in format: Bearer <token>' });
    return;
  }

  const token = parts[1];

  try {
    const adminProfile = await authService.validateToken(token);
    req.admin = adminProfile;
    next();
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
