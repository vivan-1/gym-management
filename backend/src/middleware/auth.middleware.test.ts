import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from './auth.middleware';
import { authService, AuthError } from '../services/auth.service';

// Mock the auth service
vi.mock('../services/auth.service', () => {
  const AuthError = class AuthError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'AuthError';
      this.statusCode = statusCode;
    }
  };

  return {
    authService: {
      validateToken: vi.fn(),
    },
    AuthError,
  };
});

function createMockRequest(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
  };
}

function createMockResponse(): Partial<Response> & { statusCode?: number; body?: unknown } {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn().mockImplementation((data: unknown) => {
    res.body = data;
    return res;
  });
  return res;
}

describe('authMiddleware', () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  it('should return 401 when Authorization header is missing', async () => {
    const req = createMockRequest() as Request;
    const res = createMockResponse() as Response;

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authorization header is required' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header has no Bearer prefix', async () => {
    const req = createMockRequest('Basic some-token') as Request;
    const res = createMockResponse() as Response;

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authorization header must be in format: Bearer <token>',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header has only Bearer without token', async () => {
    const req = createMockRequest('Bearer') as Request;
    const res = createMockResponse() as Response;

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authorization header must be in format: Bearer <token>',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when token is invalid', async () => {
    vi.mocked(authService.validateToken).mockRejectedValue(
      new AuthError('Invalid or expired token', 401)
    );

    const req = createMockRequest('Bearer invalid-token') as Request;
    const res = createMockResponse() as Response;

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when token is expired', async () => {
    vi.mocked(authService.validateToken).mockRejectedValue(
      new AuthError('Invalid or expired token', 401)
    );

    const req = createMockRequest('Bearer expired-token') as Request;
    const res = createMockResponse() as Response;

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 for unexpected errors during token validation', async () => {
    vi.mocked(authService.validateToken).mockRejectedValue(new Error('Unexpected error'));

    const req = createMockRequest('Bearer some-token') as Request;
    const res = createMockResponse() as Response;

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should attach admin profile to request and call next on valid token', async () => {
    const mockAdmin = { id: 'admin-123', email: 'admin@gym.com' };
    vi.mocked(authService.validateToken).mockResolvedValue(mockAdmin);

    const req = createMockRequest('Bearer valid-token') as Request;
    const res = createMockResponse() as Response;

    await authMiddleware(req, res, mockNext);

    expect(authService.validateToken).toHaveBeenCalledWith('valid-token');
    expect(req.admin).toEqual(mockAdmin);
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should extract token correctly from Bearer header', async () => {
    const mockAdmin = { id: 'admin-456', email: 'test@gym.com' };
    vi.mocked(authService.validateToken).mockResolvedValue(mockAdmin);

    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
    const req = createMockRequest(`Bearer ${token}`) as Request;
    const res = createMockResponse() as Response;

    await authMiddleware(req, res, mockNext);

    expect(authService.validateToken).toHaveBeenCalledWith(token);
    expect(req.admin).toEqual(mockAdmin);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should return 401 when Authorization header has extra parts', async () => {
    const req = createMockRequest('Bearer token extra-part') as Request;
    const res = createMockResponse() as Response;

    await authMiddleware(req, res, mockNext);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authorization header must be in format: Bearer <token>',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });
});
