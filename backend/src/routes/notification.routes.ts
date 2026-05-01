import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { notificationService, NotificationServiceError } from '../services/notification.service';
import { paginationSchema } from '../schemas/index';
import { z } from 'zod';

const router = Router();

// Apply auth middleware to all notification routes
router.use(authMiddleware);

const expiryWindowSchema = z.object({
  days: z.number().int().min(1, 'Expiry window must be a positive integer'),
});

/**
 * GET /api/notifications — Get in-app notifications for the authenticated admin (paginated)
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = req.admin!.id;

    const pagination = paginationSchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
    });

    const result = await notificationService.getInAppNotifications(adminId, pagination);
    res.json(result);
  } catch (error) {
    if (error instanceof NotificationServiceError) {
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

/**
 * PUT /api/notifications/expiry-window — Configure expiry window
 */
router.put('/expiry-window', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = expiryWindowSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    await notificationService.configureExpiryWindow(validation.data.days);
    res.json({ message: 'Expiry window updated successfully', days: validation.data.days });
  } catch (error) {
    if (error instanceof NotificationServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/notifications/expiry-window — Get current expiry window
 */
router.get('/expiry-window', async (_req: Request, res: Response): Promise<void> => {
  try {
    const days = await notificationService.getExpiryWindow();
    res.json({ days });
  } catch (error) {
    if (error instanceof NotificationServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
