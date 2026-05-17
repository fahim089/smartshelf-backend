const jwt  = require('jsonwebtoken');
const { pool } = require('../config/db');

/**
 * Verifies Bearer JWT and attaches req.user = { id, name, email, role }
 */
async function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  const token  = header && header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, role, is_active FROM users WHERE id = ?',
      [payload.sub]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'Account not found or disabled.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
}

/**
 * Restricts route to admin role only.
 * Must be used AFTER authenticate.
 */
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

/**
 * Restricts route to staff role only.
 * Must be used AFTER authenticate.
 */
function staffOnly(req, res, next) {
  if (req.user.role !== 'staff') {
    return res.status(403).json({ success: false, message: 'Staff access only.' });
  }
  next();
}

module.exports = { authenticate, adminOnly, staffOnly };