import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
vi.mock('./lib/prisma', () => ({
  prisma: {
    admin: { findUnique: vi.fn(), update: vi.fn() },
    member: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    membership: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() },
    payment: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    notification: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    systemConfig: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

// ─── Mock Auth Middleware (bypass for most tests) ────────────────────────────
vi.mock('./middleware/auth.middleware', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    req.admin = { id: 'admin-1', email: 'admin@gym.com' };
    next();
  },
}));

// ─── Mock Auth Service ───────────────────────────────────────────────────────
vi.mock('./services/auth.service', () => {
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
      login: vi.fn(),
      validateToken: vi.fn(),
      lockAccount: vi.fn(),
      unlockAccount: vi.fn(),
      getFailedAttempts: vi.fn(),
    },
    AuthError,
    AuthService: vi.fn(),
  };
});

// ─── Mock Member Service ─────────────────────────────────────────────────────
vi.mock('./services/member.service', () => {
  const MemberServiceError = class MemberServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'MemberServiceError';
      this.statusCode = statusCode;
    }
  };

  return {
    memberService: {
      register: vi.fn(),
      getById: vi.fn(),
      search: vi.fn(),
      list: vi.fn(),
    },
    MemberServiceError,
    MemberService: vi.fn(),
  };
});

// ─── Mock Membership Service ─────────────────────────────────────────────────
vi.mock('./services/membership.service', () => {
  const MembershipServiceError = class MembershipServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'MembershipServiceError';
      this.statusCode = statusCode;
    }
  };

  return {
    membershipService: {
      create: vi.fn(),
      renew: vi.fn(),
      evaluateStatuses: vi.fn(),
      getByMemberId: vi.fn(),
      getStatusCounts: vi.fn(),
    },
    MembershipServiceError,
    MembershipService: vi.fn(),
  };
});

// ─── Mock Payment Service ────────────────────────────────────────────────────
vi.mock('./services/payment.service', () => {
  const PaymentServiceError = class PaymentServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'PaymentServiceError';
      this.statusCode = statusCode;
    }
  };

  return {
    paymentService: {
      record: vi.fn(),
      evaluateOverdue: vi.fn(),
      getByMembershipId: vi.fn(),
      getPaymentSummary: vi.fn(),
    },
    PaymentServiceError,
    PaymentService: vi.fn(),
  };
});

// ─── Mock Notification Service ───────────────────────────────────────────────
vi.mock('./services/notification.service', () => {
  const NotificationServiceError = class NotificationServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'NotificationServiceError';
      this.statusCode = statusCode;
    }
  };

  return {
    notificationService: {
      createInAppNotification: vi.fn(),
      getInAppNotifications: vi.fn(),
      configureExpiryWindow: vi.fn(),
      getExpiryWindow: vi.fn(),
    },
    NotificationServiceError,
    NotificationService: vi.fn(),
  };
});

// ─── Mock Dashboard Service ──────────────────────────────────────────────────
vi.mock('./services/dashboard.service', () => {
  const DashboardServiceError = class DashboardServiceError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'DashboardServiceError';
      this.statusCode = statusCode;
    }
  };

  return {
    dashboardService: {
      getSummary: vi.fn(),
      getMembersByStatus: vi.fn(),
    },
    DashboardServiceError,
    DashboardService: vi.fn(),
  };
});

import request from 'supertest';
import app from './app';
import { authService, AuthError } from './services/auth.service';
import { memberService, MemberServiceError } from './services/member.service';
import { membershipService, MembershipServiceError } from './services/membership.service';
import { paymentService, PaymentServiceError } from './services/payment.service';
import { dashboardService } from './services/dashboard.service';

describe('Integration Tests - API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Authentication Flow ─────────────────────────────────────────────────

  describe('Authentication Flow (POST /api/auth/login)', () => {
    it('should return token and admin profile on valid login', async () => {
      const mockResult = {
        token: 'jwt-token-123',
        admin: { id: 'admin-1', email: 'admin@gym.com' },
      };
      vi.mocked(authService.login).mockResolvedValue(mockResult);

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@gym.com', password: 'SecureP@ss1' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBe('jwt-token-123');
      expect(res.body.admin.email).toBe('admin@gym.com');
    });

    it('should return 400 for missing email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'SecureP@ss1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for missing password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@gym.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'SecureP@ss1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 401 for invalid credentials', async () => {
      vi.mocked(authService.login).mockRejectedValue(
        new AuthError('Invalid email or password', 401)
      );

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@gym.com', password: 'WrongPass1!' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('should return 423 when account is locked after 5 failed attempts', async () => {
      vi.mocked(authService.login).mockRejectedValue(
        new AuthError('Account is locked due to too many failed attempts. Try again in 15 minutes.', 423)
      );

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@gym.com', password: 'WrongPass1!' });

      expect(res.status).toBe(423);
      expect(res.body.error).toContain('locked');
    });
  });

  // ─── Member Registration End-to-End ──────────────────────────────────────

  describe('Member Registration (POST /api/members)', () => {
    const validMemberData = {
      fullName: 'Jane Smith',
      email: 'jane@example.com',
      phone: '9876543210',
      dateOfBirth: '1985-06-20',
      gender: 'female',
      address: '456 Oak Ave',
    };

    it('should register a member with valid input and return 201', async () => {
      const mockMember = {
        id: 'uuid-1',
        memberId: 'GYM-XYZ99',
        fullName: 'Jane Smith',
        email: 'jane@example.com',
        phone: '9876543210',
        dateOfBirth: new Date('1985-06-20'),
        gender: 'female',
        address: '456 Oak Ave',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(memberService.register).mockResolvedValue(mockMember as any);

      const res = await request(app)
        .post('/api/members')
        .send(validMemberData);

      expect(res.status).toBe(201);
      expect(res.body.memberId).toBe('GYM-XYZ99');
      expect(res.body.fullName).toBe('Jane Smith');
      expect(res.body.email).toBe('jane@example.com');
    });

    it('should return 400 with details for missing required fields', async () => {
      const res = await request(app)
        .post('/api/members')
        .send({ fullName: 'Jane' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeDefined();
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details.length).toBeGreaterThan(0);
      // Should identify specific missing fields
      const fields = res.body.details.map((d: any) => d.field);
      expect(fields).toContain('email');
    });

    it('should return 400 when all fields are empty', async () => {
      const res = await request(app)
        .post('/api/members')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details.length).toBeGreaterThanOrEqual(5);
    });

    it('should return 409 for duplicate email', async () => {
      vi.mocked(memberService.register).mockRejectedValue(
        new MemberServiceError('A member with this email address is already registered', 409)
      );

      const res = await request(app)
        .post('/api/members')
        .send(validMemberData);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already registered');
    });
  });

  // ─── Membership Creation and Renewal ─────────────────────────────────────

  describe('Membership Creation (POST /api/memberships)', () => {
    it('should create a membership with valid data', async () => {
      const mockMembership = {
        id: 'ms-uuid-1',
        memberId: 'member-uuid-1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-07-01'),
        durationMonths: 6,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(membershipService.create).mockResolvedValue(mockMembership as any);

      const res = await request(app)
        .post('/api/memberships')
        .send({
          memberId: 'member-uuid-1',
          startDate: '2024-01-01',
          duration: 6,
        });

      expect(res.status).toBe(201);
      expect(res.body.durationMonths).toBe(6);
      expect(res.body.status).toBe('active');
    });

    it('should return 400 when memberId is missing', async () => {
      const res = await request(app)
        .post('/api/memberships')
        .send({ startDate: '2024-01-01', duration: 6 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid duration', async () => {
      const res = await request(app)
        .post('/api/memberships')
        .send({ memberId: 'member-1', startDate: '2024-01-01', duration: 5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 404 when member does not exist', async () => {
      vi.mocked(membershipService.create).mockRejectedValue(
        new MembershipServiceError('Member not found', 404)
      );

      const res = await request(app)
        .post('/api/memberships')
        .send({ memberId: 'nonexistent', startDate: '2024-01-01', duration: 3 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Member not found');
    });
  });

  describe('Membership Renewal (PUT /api/memberships/:id/renew)', () => {
    it('should renew a membership with valid duration', async () => {
      const mockRenewed = {
        id: 'ms-uuid-1',
        memberId: 'member-uuid-1',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2025-01-01'),
        durationMonths: 12,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(membershipService.renew).mockResolvedValue(mockRenewed as any);

      const res = await request(app)
        .put('/api/memberships/ms-uuid-1/renew')
        .send({ duration: 12 });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('active');
      expect(membershipService.renew).toHaveBeenCalledWith('ms-uuid-1', 12);
    });

    it('should return 400 for invalid renewal duration', async () => {
      const res = await request(app)
        .put('/api/memberships/ms-uuid-1/renew')
        .send({ duration: 7 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 404 when membership does not exist', async () => {
      vi.mocked(membershipService.renew).mockRejectedValue(
        new MembershipServiceError('Membership not found', 404)
      );

      const res = await request(app)
        .put('/api/memberships/nonexistent/renew')
        .send({ duration: 3 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Membership not found');
    });
  });

  // ─── Payment Recording Flow ──────────────────────────────────────────────

  describe('Payment Recording (POST /api/payments)', () => {
    it('should record a payment with valid data', async () => {
      const mockPayment = {
        id: 'pay-uuid-1',
        membershipId: 'ms-uuid-1',
        memberId: 'member-uuid-1',
        amount: 5000,
        paymentDate: new Date('2024-01-15'),
        paymentMethod: 'card',
        status: 'paid',
        createdAt: new Date(),
      };
      vi.mocked(paymentService.record).mockResolvedValue(mockPayment as any);

      const res = await request(app)
        .post('/api/payments')
        .send({
          memberId: 'member-uuid-1',
          amount: 5000,
          paymentDate: '2024-01-15',
          paymentMethod: 'card',
          membershipId: 'ms-uuid-1',
        });

      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(5000);
      expect(res.body.status).toBe('paid');
      expect(res.body.paymentMethod).toBe('card');
    });

    it('should return 400 when memberId is missing', async () => {
      const res = await request(app)
        .post('/api/payments')
        .send({
          amount: 5000,
          paymentDate: '2024-01-15',
          paymentMethod: 'card',
          membershipId: 'ms-uuid-1',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for invalid payment method', async () => {
      const res = await request(app)
        .post('/api/payments')
        .send({
          memberId: 'member-uuid-1',
          amount: 5000,
          paymentDate: '2024-01-15',
          paymentMethod: 'bitcoin',
          membershipId: 'ms-uuid-1',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 for negative amount', async () => {
      const res = await request(app)
        .post('/api/payments')
        .send({
          memberId: 'member-uuid-1',
          amount: -100,
          paymentDate: '2024-01-15',
          paymentMethod: 'cash',
          membershipId: 'ms-uuid-1',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 404 when membership does not exist', async () => {
      vi.mocked(paymentService.record).mockRejectedValue(
        new PaymentServiceError('Membership not found', 404)
      );

      const res = await request(app)
        .post('/api/payments')
        .send({
          memberId: 'member-uuid-1',
          amount: 5000,
          paymentDate: '2024-01-15',
          paymentMethod: 'cash',
          membershipId: 'nonexistent',
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Membership not found');
    });
  });

  // ─── Dashboard Summary ───────────────────────────────────────────────────

  describe('Dashboard Summary (GET /api/dashboard/summary)', () => {
    it('should return correct aggregated dashboard data', async () => {
      const mockSummary = {
        totalMembers: 50,
        membershipCounts: {
          active: 35,
          expiringSoon: 10,
          expired: 5,
        },
        paymentSummary: {
          totalCollected: 250000,
          pendingCount: 8,
          overdueCount: 3,
        },
        recentNotifications: [
          {
            id: 'notif-1',
            adminId: 'admin-1',
            type: 'membership_expiring_soon',
            title: 'Membership Expiring Soon',
            message: "John's membership is expiring soon.",
            isRead: false,
            createdAt: new Date('2024-01-20'),
          },
        ],
      };
      vi.mocked(dashboardService.getSummary).mockResolvedValue(mockSummary as any);

      const res = await request(app).get('/api/dashboard/summary');

      expect(res.status).toBe(200);
      expect(res.body.totalMembers).toBe(50);
      expect(res.body.membershipCounts.active).toBe(35);
      expect(res.body.membershipCounts.expiringSoon).toBe(10);
      expect(res.body.membershipCounts.expired).toBe(5);
      expect(res.body.paymentSummary.totalCollected).toBe(250000);
      expect(res.body.paymentSummary.pendingCount).toBe(8);
      expect(res.body.paymentSummary.overdueCount).toBe(3);
      expect(res.body.recentNotifications).toHaveLength(1);
    });

    it('should return empty dashboard when no data exists', async () => {
      const mockSummary = {
        totalMembers: 0,
        membershipCounts: { active: 0, expiringSoon: 0, expired: 0 },
        paymentSummary: { totalCollected: 0, pendingCount: 0, overdueCount: 0 },
        recentNotifications: [],
      };
      vi.mocked(dashboardService.getSummary).mockResolvedValue(mockSummary as any);

      const res = await request(app).get('/api/dashboard/summary');

      expect(res.status).toBe(200);
      expect(res.body.totalMembers).toBe(0);
      expect(res.body.membershipCounts.active).toBe(0);
      expect(res.body.recentNotifications).toHaveLength(0);
    });
  });

  // ─── 404 Handler ─────────────────────────────────────────────────────────

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/api/unknown-endpoint');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not found');
    });
  });

  // ─── Health Check ────────────────────────────────────────────────────────

  describe('Health Check (GET /api/health)', () => {
    it('should return ok status', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });
});
