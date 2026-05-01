import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { paymentService, PaymentServiceError } from '../services/payment.service';
import { paymentRecordSchema } from '../schemas/index';

const router = Router();

// Apply auth middleware to all payment routes
router.use(authMiddleware);

/**
 * POST /api/payments — Record a payment for a membership
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { memberId, amount, paymentDate, paymentMethod, membershipId } = req.body;

    if (!memberId) {
      res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'memberId', message: 'Member ID is required' }],
      });
      return;
    }

    const validation = paymentRecordSchema.safeParse({ amount, paymentDate, paymentMethod, membershipId });
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const payment = await paymentService.record(memberId, validation.data);
    res.status(201).json(payment);
  } catch (error) {
    if (error instanceof PaymentServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/payments/summary — Get payment summary
 * Must be defined before /:id routes to avoid route conflicts
 */
router.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await paymentService.getPaymentSummary();
    res.json(summary);
  } catch (error) {
    if (error instanceof PaymentServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/payments/membership/:membershipId — Get payments by membership
 */
router.get('/membership/:membershipId', async (req: Request, res: Response): Promise<void> => {
  try {
    const payments = await paymentService.getByMembershipId(req.params.membershipId);
    res.json(payments);
  } catch (error) {
    if (error instanceof PaymentServiceError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
