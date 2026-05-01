import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock auth middleware to always pass
vi.mock('../middleware/auth.middleware', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    req.admin = { id: 'admin-1', email: 'admin@gym.com' };
    next();
  },
}));

// Mock member service
vi.mock('../services/member.service', () => {
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
  };
});

import request from 'supertest';
import express from 'express';
import memberRoutes from './member.routes';
import { memberService, MemberServiceError } from '../services/member.service';

const app = express();
app.use(express.json());
app.use('/api/members', memberRoutes);

describe('Member API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/members', () => {
    const validMemberData = {
      fullName: 'John Doe',
      email: 'john@example.com',
      phone: '1234567890',
      dateOfBirth: '1990-01-15',
      gender: 'male',
      address: '123 Main St',
    };

    it('should register a new member with valid data', async () => {
      const mockMember = {
        id: 'uuid-1',
        memberId: 'GYM-ABC12',
        ...validMemberData,
        dateOfBirth: new Date('1990-01-15'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(memberService.register).mockResolvedValue(mockMember as any);

      const res = await request(app)
        .post('/api/members')
        .send(validMemberData);

      expect(res.status).toBe(201);
      expect(res.body.memberId).toBe('GYM-ABC12');
      expect(memberService.register).toHaveBeenCalled();
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/members')
        .send({ fullName: 'John' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeDefined();
      expect(memberService.register).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app)
        .post('/api/members')
        .send({ ...validMemberData, email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
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

  describe('GET /api/members/:id', () => {
    it('should return a member by ID', async () => {
      const mockMember = {
        id: 'uuid-1',
        memberId: 'GYM-ABC12',
        fullName: 'John Doe',
        email: 'john@example.com',
        memberships: [],
      };
      vi.mocked(memberService.getById).mockResolvedValue(mockMember as any);

      const res = await request(app).get('/api/members/GYM-ABC12');

      expect(res.status).toBe(200);
      expect(res.body.memberId).toBe('GYM-ABC12');
      expect(memberService.getById).toHaveBeenCalledWith('GYM-ABC12');
    });

    it('should return 404 for non-existent member', async () => {
      vi.mocked(memberService.getById).mockRejectedValue(
        new MemberServiceError('Member not found', 404)
      );

      const res = await request(app).get('/api/members/GYM-XXXXX');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Member not found');
    });
  });

  describe('GET /api/members', () => {
    it('should list members with default pagination', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };
      vi.mocked(memberService.list).mockResolvedValue(mockResult);

      const res = await request(app).get('/api/members');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResult);
      expect(memberService.list).toHaveBeenCalledWith(
        {},
        { page: 1, pageSize: 20 }
      );
    });

    it('should list members with custom pagination', async () => {
      const mockResult = {
        data: [],
        total: 50,
        page: 2,
        pageSize: 10,
        totalPages: 5,
      };
      vi.mocked(memberService.list).mockResolvedValue(mockResult);

      const res = await request(app).get('/api/members?page=2&pageSize=10');

      expect(res.status).toBe(200);
      expect(memberService.list).toHaveBeenCalledWith(
        {},
        { page: 2, pageSize: 10 }
      );
    });

    it('should list members with membership status filter', async () => {
      const mockResult = {
        data: [],
        total: 5,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };
      vi.mocked(memberService.list).mockResolvedValue(mockResult);

      const res = await request(app).get('/api/members?membershipStatus=active');

      expect(res.status).toBe(200);
      expect(memberService.list).toHaveBeenCalledWith(
        { membershipStatus: 'active' },
        { page: 1, pageSize: 20 }
      );
    });

    it('should return 400 for invalid filter values', async () => {
      const res = await request(app).get('/api/members?membershipStatus=invalid_status');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/members/search', () => {
    it('should search members by term', async () => {
      const mockResult = {
        data: [
          {
            id: 'uuid-1',
            memberId: 'GYM-ABC12',
            fullName: 'John Doe',
            email: 'john@example.com',
            membershipStatus: 'active',
            paymentStatus: 'paid',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      };
      vi.mocked(memberService.search).mockResolvedValue(mockResult as any);

      const res = await request(app).get('/api/members/search?term=john');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(memberService.search).toHaveBeenCalledWith({
        term: 'john',
        membershipStatus: undefined,
        paymentStatus: undefined,
        pagination: { page: 1, pageSize: 20 },
      });
    });

    it('should return 400 when search term is missing', async () => {
      const res = await request(app).get('/api/members/search');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should search with filters and pagination', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        pageSize: 10,
        totalPages: 0,
      };
      vi.mocked(memberService.search).mockResolvedValue(mockResult);

      const res = await request(app).get(
        '/api/members/search?term=doe&membershipStatus=active&page=1&pageSize=10'
      );

      expect(res.status).toBe(200);
      expect(memberService.search).toHaveBeenCalledWith({
        term: 'doe',
        membershipStatus: 'active',
        paymentStatus: undefined,
        pagination: { page: 1, pageSize: 10 },
      });
    });
  });
});
