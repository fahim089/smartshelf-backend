const express = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');

const productCtrl  = require('../controllers/productController');
const categoryCtrl = require('../controllers/categoryController');
const saleCtrl     = require('../controllers/saleController');
const purchaseCtrl = require('../controllers/purchaseController');
const returnCtrl   = require('../controllers/returnController');
const dashCtrl     = require('../controllers/dashboardController');

// All staff routes require auth (any role can access these)
router.use(authenticate);

// ── Dashboard (staff sees only own data) ──────────────────────────────────────
router.get('/dashboard', dashCtrl.staffDashboard);

// ── Products — READ ONLY ──────────────────────────────────────────────────────
router.get('/products',     productCtrl.list);
router.get('/products/:id', productCtrl.getOne);

// ── Categories — READ ONLY ────────────────────────────────────────────────────
router.get('/categories',     categoryCtrl.list);
router.get('/categories/:id', categoryCtrl.getOne);

// ── Sales — staff creates and views own ──────────────────────────────────────
router.get('/sales',     saleCtrl.list);
router.get('/sales/:id', saleCtrl.getOne);

router.post(
  '/sales',
  [
    body('items').isArray({ min: 1 }).withMessage('At least one item required.'),
    body('items.*.product_id').isInt({ min: 1 }),
    body('items.*.quantity').isInt({ min: 1 }),
  ],
  validate, saleCtrl.create
);

// ── Purchases — staff creates and views own ───────────────────────────────────
router.get('/purchases',     purchaseCtrl.list);
router.get('/purchases/:id', purchaseCtrl.getOne);

router.post(
  '/purchases',
  [
    body('items').isArray({ min: 1 }).withMessage('At least one item required.'),
    body('items.*.product_id').isInt({ min: 1 }),
    body('items.*.quantity').isInt({ min: 1 }),
    body('items.*.unit_price').isFloat({ min: 0 }),
  ],
  validate, purchaseCtrl.create
);

// ── Returns — staff creates (sends to admin) ──────────────────────────────────
router.get('/returns',     returnCtrl.list);
router.get('/returns/:id', returnCtrl.getOne);

router.post(
  '/returns',
  [
    body('items').isArray({ min: 1 }).withMessage('At least one item required.'),
    body('items.*.product_id').isInt({ min: 1 }),
    body('items.*.quantity').isInt({ min: 1 }),
    body('items.*.unit_price').isFloat({ min: 0 }),
  ],
  validate, returnCtrl.create
);

module.exports = router;