import { Router, Request, Response } from 'express';
import { authService, AuthError } from '../services/auth.service';
import { loginSchema } from '../schemas/index';

const router = Router();

/**
 * POST /api/auth/login — Authenticate admin and return JWT token
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      const errors = validation.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      res.status(400).json({ error: 'Validation failed', details: errors });
      return;
    }

    const { email, password } = validation.data;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
