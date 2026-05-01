import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { memberService, MemberServiceError } from '../services/member.service';
import {
  memberRegistrationSchema,
  paginationSchema,
  memberFiltersSchema,
  searchQuerySchema,
} from '../schemas/index';
import { MembershipStatus, PaymentStatus } from '../types/enums';

const router = Router();

// Apply auth middleware to all member routes
router.use(authMiddleware);

/**
 * POST /api/members — Register a new member
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = memberRegistrationSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const member = await memberService.register(validation.data);
    res.status(201).json(member);
  } catch (error) {
    if (error instanceof MemberServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/members/search — Search members by query string
 * Must be defined before /:id to avoid route conflicts
 */
router.get('/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const { term, membershipStatus, paymentStatus, page, pageSize } = req.query;

    const queryInput = {
      term: term as string,
      membershipStatus: membershipStatus as MembershipStatus | undefined,
      paymentStatus: paymentStatus as PaymentStatus | undefined,
      pagination: {
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      },
    };

    const validation = searchQuerySchema.safeParse(queryInput);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const result = await memberService.search(validation.data);
    res.json(result);
  } catch (error) {
    if (error instanceof MemberServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/members/:id — Get member by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const member = await memberService.getById(req.params.id);
    res.json(member);
  } catch (error) {
    if (error instanceof MemberServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/members — List members with optional filters and pagination
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { membershipStatus, paymentStatus, page, pageSize } = req.query;

    const paginationInput = {
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    };

    const paginationValidation = paginationSchema.safeParse(paginationInput);
    if (!paginationValidation.success) {
      const errors = paginationValidation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const filtersInput = {
      membershipStatus: membershipStatus as MembershipStatus | undefined,
      paymentStatus: paymentStatus as PaymentStatus | undefined,
    };

    const filtersValidation = memberFiltersSchema.safeParse(filtersInput);
    if (!filtersValidation.success) {
      const errors = filtersValidation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const result = await memberService.list(
      filtersValidation.data,
      paginationValidation.data
    );
    res.json(result);
  } catch (error) {
    if (error instanceof MemberServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
