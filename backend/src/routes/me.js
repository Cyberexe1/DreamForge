import { Router } from 'express';
import { validateCapsuleDate, validateProfileUpdate } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import {
  saveCapsule,
  unsaveCapsule,
  updateName,
} from '../repositories/users.js';

export const meRouter = Router();

// Every route below is behind a verified bearer token.
meRouter.use(requireAuth);

/** The signed-in user's profile and saved capsules. */
meRouter.get('/', (req, res) => {
  res.json({ user: req.user });
});

meRouter.patch('/', async (req, res, next) => {
  try {
    const { name } = validateProfileUpdate(req.body);
    const user = await updateName(req.user.email, name);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

/**
 * Bookmarked capsule dates. The capsules themselves stay public in S3 — this
 * only records which ones the user kept, so nothing sensitive is stored.
 */
meRouter.put('/saved/:date', async (req, res, next) => {
  try {
    const date = validateCapsuleDate(req.params.date);
    const user = await saveCapsule(req.user.email, date);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

meRouter.delete('/saved/:date', async (req, res, next) => {
  try {
    const date = validateCapsuleDate(req.params.date);
    const user = await unsaveCapsule(req.user.email, date);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});
