const express = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const { authenticate, adminOnly } = require('../middleware/auth');
const { validate }                = require('../middleware/validate');
const { uploadImages }            = require('../middleware/upload');

const userCtrl      = require('../controllers/userController');
const categoryCtrl  = require('../controllers/categoryController');
const productCtrl   = require('../controllers/productController');
const peopleCtrl    = require('../controllers/peopleController');
const saleCtrl      = require('../controllers/saleController');
const purchaseCtrl  = require('../controllers/purchaseController');
const returnCtrl    = require('../controllers/returnController');
const dashCtrl      = require('../controllers/dashboardController');

// All admin routes require auth + admin role
router.use(authenticate, adminOnly);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', dashCtrl.adminDashboard);

// ── Users (Staff Management) ──────────────────────────────────────────────────
router.get('/users',     userCtrl.listUsers);
router.get('/users/:id', userCtrl.getUser);

router.post(
  '/users',
  [
    body('name').trim().notEmpty().withMessage('Name required.'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
    body('role').optional().isIn(['admin', 'staff']).withMessage('Role must be admin or staff.'),
  ],
  validate, userCtrl.createUser
);

router.put('/users/:id',    userCtrl.updateUser);
router.delete('/users/:id', userCtrl.deleteUser);

// ── Categories ────────────────────────────────────────────────────────────────
router.get('/categories',     categoryCtrl.list);
router.get('/categories/:id', categoryCtrl.getOne);

router.post(
  '/categories',
  [body('name').trim().notEmpty().withMessage('Category name required.')],
  validate, categoryCtrl.create
);

router.put(
  '/categories/:id',
  [body('name').trim().notEmpty().withMessage('Category name required.')],
  validate, categoryCtrl.update
);

router.delete('/categories/:id', categoryCtrl.remove);

// ── Products ──────────────────────────────────────────────────────────────────
router.get('/products',     productCtrl.list);
router.get('/products/:id', productCtrl.getOne);

router.post(
  '/products',
  uploadImages,   // handles multipart, field: "images" (max 3)
  [
    body('name').trim().notEmpty().withMessage('Product name required.'),
    body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number.'),
    body('stock_quantity').optional().isInt({ min: 0 }),
    body('low_stock_threshold').optional().isInt({ min: 0 }),
  ],
  validate, productCtrl.create
);

router.put(
  '/products/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('price').optional().isFloat({ min: 0 }),
    body('stock_quantity').optional().isInt({ min: 0 }),
  ],
  validate, productCtrl.update
);

router.delete('/products/:id', productCtrl.remove);

// Product images (max 3 total per product)
router.post('/products/:id/images',           uploadImages, productCtrl.addImages);
router.delete('/products/:id/images/:imageId', productCtrl.deleteImage);

// ── People (Customers & Suppliers) ────────────────────────────────────────────
router.get('/people',     peopleCtrl.list);
router.get('/people/:id', peopleCtrl.getOne);

router.post(
  '/people',
  [
    body('type').isIn(['customer', 'supplier']).withMessage('Type must be customer or supplier.'),
    body('name').trim().notEmpty().withMessage('Name required.'),
    body('email').optional().isEmail(),
  ],
  validate, peopleCtrl.create
);

router.put('/people/:id',    peopleCtrl.update);
router.delete('/people/:id', peopleCtrl.remove);

// ── Sales ─────────────────────────────────────────────────────────────────────
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

router.delete('/sales/:id', saleCtrl.remove);

// ── Purchases ─────────────────────────────────────────────────────────────────
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

router.delete('/purchases/:id', purchaseCtrl.remove);

// ── Returns ───────────────────────────────────────────────────────────────────
router.get('/returns',     returnCtrl.list);
router.get('/returns/:id', returnCtrl.getOne);

router.patch(
  '/returns/:id/status',
  [body('status').isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected.')],
  validate, returnCtrl.updateStatus
);

router.delete('/returns/:id', returnCtrl.remove);

module.exports = router;