const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { login, refresh, logout, me, updateProfile, changePassword, register } =
  require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// Public
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
    body('password').notEmpty().withMessage('Password required.'),
  ],
  validate, login
);

router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('Name required.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('role').optional().isIn(['admin', 'staff']).withMessage('Role must be admin or staff.'),

  ], register);

router.post('/refresh', refresh);

// Protected (any role)
router.use(authenticate);

router.post('/logout', logout);
router.get('/me', me);

router.put(
  '/profile',
  [
    body('name').optional().trim().notEmpty().isLength({ max: 150 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().trim().isLength({ max: 30 }),
  ],
  validate, updateProfile
);

router.post(
  '/change-password',
  [
    body('current_password').notEmpty().withMessage('Current password required.'),
    body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.'),
  ],
  validate, changePassword
);

module.exports = router;