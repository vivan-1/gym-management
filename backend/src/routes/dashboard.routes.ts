import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { dashboardService, DashboardServiceError } from '../services/dashboard.service';
import { paginationSchema } from '../schemas/index';
import { MembershipStatus } from '../types/enums';
import { z } from 'zod';

const router = Router();

// Apply auth middleware to all dashboard routes
router.use(authMiddleware);

/**
 * GET /api/dashboard/summary — Get dashboard summary
 */
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.admin!.id;
    const summary = await dashboardService.getSummary(adminId);
    res.json(summary);
  } catch (error) {
    if (error instanceof DashboardServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/dashboard/members/:status — Get members by membership status
 */
router.get('/members/:status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.params;

    // Validate status parameter
    const validStatuses = Object.values(MembershipStatus) as string[];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        error: `Invalid membership status. Must be one of: ${validStatuses.join(', ')}`,
      });
      return;
    }

    const pagination = paginationSchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
    });

    const result = await dashboardService.getMembersByStatus(
      status as MembershipStatus,
      pagination
    );
    res.json(result);
  } catch (error) {
    if (error instanceof DashboardServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
