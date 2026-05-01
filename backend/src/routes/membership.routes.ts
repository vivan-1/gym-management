import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { membershipService, MembershipServiceError } from '../services/membership.service';
import { membershipCreateSchema } from '../schemas/index';
import { MembershipDuration } from '../types/interfaces';

const router = Router();

// Apply auth middleware to all membership routes
router.use(authMiddleware);

/**
 * POST /api/memberships — Create membership for a member
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { memberId, startDate, duration } = req.body;

    if (!memberId) {
      res.status(400).json({ error: 'Validation failed', details: [{ field: 'memberId', message: 'Member ID is required' }] });
      return;
    }

    const validation = membershipCreateSchema.safeParse({ startDate, duration });
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const membership = await membershipService.create(memberId, validation.data);
    res.status(201).json(membership);
  } catch (error) {
    if (error instanceof MembershipServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/memberships/counts — Get membership status counts
 * Must be defined before /:id routes to avoid route conflicts
 */
router.get('/counts', async (_req: Request, res: Response): Promise<void> => {
  try {
    const counts = await membershipService.getStatusCounts();
    res.json(counts);
  } catch (error) {
    if (error instanceof MembershipServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/memberships/member/:memberId — Get membership by member ID
 */
router.get('/member/:memberId', async (req: Request, res: Response): Promise<void> => {
  try {
    const membership = await membershipService.getByMemberId(req.params.memberId);
    if (!membership) {
      res.status(404).json({ error: 'Membership not found' });
      return;
    }
    res.json(membership);
  } catch (error) {
    if (error instanceof MembershipServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/memberships/:id — Edit a membership (start date, end date, status)
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, status } = req.body;

    if (!startDate && !endDate && !status) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'body', message: 'At least one field (startDate, endDate, status) is required' }],
      });
      return;
    }

    const updateData: { startDate?: Date; endDate?: Date; status?: string } = {};
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    if (status) updateData.status = status;

    const membership = await membershipService.update(req.params.id, updateData as any);
    res.json(membership);
  } catch (error) {
    if (error instanceof MembershipServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/memberships/:id/renew — Renew a membership
 */
router.put('/:id/renew', async (req: Request, res: Response): Promise<void> => {
  try {
    const { duration } = req.body;

    const validDurations: MembershipDuration[] = [1, 3, 6, 12];
    if (!duration || !validDurations.includes(duration)) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'duration', message: 'Duration must be 1, 3, 6, or 12 months' }],
      });
      return;
    }

    const membership = await membershipService.renew(req.params.id, duration);
    res.json(membership);
  } catch (error) {
    if (error instanceof MembershipServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
