import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock auth middleware to always pass
vi.mock('../middleware/auth.middleware', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    req.admin = { id: 'admin-1', email: 'admin@gym.com' };
    next();
  },
}));

// Mock membership service
vi.mock('../services/membership.service', () => {
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
      getByMemberId: vi.fn(),
      getStatusCounts: vi.fn(),
    },
    MembershipServiceError,
  };
});

import request from 'supertest';
import express from 'express';
import membershipRoutes from './membership.routes';
import { membershipService, MembershipServiceError } from '../services/membership.service';

const app = express();
app.use(express.json());
app.use('/api/memberships', membershipRoutes);

describe('Membership API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/memberships', () => {
    const validData = {
      memberId: 'member-uuid-1',
      startDate: '2024-06-01',
      duration: 3,
    };

    it('should create a membership with valid data', async () => {
      const mockMembership = {
        id: 'membership-uuid-1',
        memberId: 'member-uuid-1',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-09-01'),
        durationMonths: 3,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(membershipService.create).mockResolvedValue(mockMembership as any);

      const res = await request(app)
        .post('/api/memberships')
        .send(validData);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe('membership-uuid-1');
      expect(membershipService.create).toHaveBeenCalledWith(
        'member-uuid-1',
        expect.objectContaining({ duration: 3 })
      );
    });

    it('should return 400 when memberId is missing', async () => {
      const res = await request(app)
        .post('/api/memberships')
        .send({ startDate: '2024-06-01', duration: 3 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(membershipService.create).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid duration', async () => {
      const res = await request(app)
        .post('/api/memberships')
        .send({ memberId: 'member-uuid-1', startDate: '2024-06-01', duration: 5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 400 when startDate is missing', async () => {
      const res = await request(app)
        .post('/api/memberships')
        .send({ memberId: 'member-uuid-1', duration: 3 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 404 when member does not exist', async () => {
      vi.mocked(membershipService.create).mockRejectedValue(
        new MembershipServiceError('Member not found', 404)
      );

      const res = await request(app)
        .post('/api/memberships')
        .send(validData);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Member not found');
    });
  });

  describe('PUT /api/memberships/:id/renew', () => {
    it('should renew a membership with valid duration', async () => {
      const mockMembership = {
        id: 'membership-uuid-1',
        memberId: 'member-uuid-1',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-12-01'),
        durationMonths: 6,
        status: 'active',
      };
      vi.mocked(membershipService.renew).mockResolvedValue(mockMembership as any);

      const res = await request(app)
        .put('/api/memberships/membership-uuid-1/renew')
        .send({ duration: 6 });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('membership-uuid-1');
      expect(membershipService.renew).toHaveBeenCalledWith('membership-uuid-1', 6);
    });

    it('should return 400 for invalid duration', async () => {
      const res = await request(app)
        .put('/api/memberships/membership-uuid-1/renew')
        .send({ duration: 5 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(membershipService.renew).not.toHaveBeenCalled();
    });

    it('should return 400 when duration is missing', async () => {
      const res = await request(app)
        .put('/api/memberships/membership-uuid-1/renew')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should return 404 when membership does not exist', async () => {
      vi.mocked(membershipService.renew).mockRejectedValue(
        new MembershipServiceError('Membership not found', 404)
      );

      const res = await request(app)
        .put('/api/memberships/non-existent/renew')
        .send({ duration: 3 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Membership not found');
    });
  });

  describe('GET /api/memberships/member/:memberId', () => {
    it('should return membership for a member', async () => {
      const mockMembership = {
        id: 'membership-uuid-1',
        memberId: 'member-uuid-1',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-09-01'),
        durationMonths: 3,
        status: 'active',
        payments: [],
      };
      vi.mocked(membershipService.getByMemberId).mockResolvedValue(mockMembership as any);

      const res = await request(app).get('/api/memberships/member/member-uuid-1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('membership-uuid-1');
      expect(membershipService.getByMemberId).toHaveBeenCalledWith('member-uuid-1');
    });

    it('should return 404 when no membership exists for member', async () => {
      vi.mocked(membershipService.getByMemberId).mockResolvedValue(null);

      const res = await request(app).get('/api/memberships/member/non-existent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Membership not found');
    });
  });

  describe('GET /api/memberships/counts', () => {
    it('should return membership status counts', async () => {
      const mockCounts = {
        active: 10,
        expiringSoon: 3,
        expired: 5,
      };
      vi.mocked(membershipService.getStatusCounts).mockResolvedValue(mockCounts);

      const res = await request(app).get('/api/memberships/counts');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockCounts);
      expect(membershipService.getStatusCounts).toHaveBeenCalled();
    });

    it('should return zeros when no memberships exist', async () => {
      const mockCounts = { active: 0, expiringSoon: 0, expired: 0 };
      vi.mocked(membershipService.getStatusCounts).mockResolvedValue(mockCounts);

      const res = await request(app).get('/api/memberships/counts');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockCounts);
    });
  });
});
