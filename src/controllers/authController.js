const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { pool } = require('../config/db');

function generateAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function generateRefreshToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
}

//POST /api/auth/register
async function register(req, res, next) {
  try {
    const { name, email, phone, password, role = 'staff' } = req.body;

    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.length) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const hash   = await bcrypt.hash(password, rounds);

    const [result] = await pool.execute(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name, email.toLowerCase(), phone || null, hash, role]
    );

    return res.status(201).json({
      success: true,
      data: { id: result.insertId, name, email, phone, role, is_active: 0 },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, role, password_hash, is_active FROM users WHERE email = ?',
      [email.toLowerCase()]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Your account is disabled.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const accessToken  = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    await pool.execute('UPDATE users SET refresh_token = ? WHERE id = ?', [refreshToken, user.id]);

    const { password_hash, ...safe } = user;

    return res.json({
      success: true,
      data: { access_token: accessToken, refresh_token: refreshToken, user: safe },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/refresh
async function refresh(req, res, next) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ success: false, message: 'refresh_token is required.' });
    }

    let payload;
    try {
      payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
    }

    const [rows] = await pool.execute(
      'SELECT id, refresh_token, is_active FROM users WHERE id = ?',
      [payload.sub]
    );

    if (!rows.length || rows[0].refresh_token !== refresh_token || !rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'Refresh token revoked.' });
    }

    const newAccess  = generateAccessToken(payload.sub);
    const newRefresh = generateRefreshToken(payload.sub);

    await pool.execute('UPDATE users SET refresh_token = ? WHERE id = ?', [newRefresh, payload.sub]);

    return res.json({ success: true, data: { access_token: newAccess, refresh_token: newRefresh } });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/logout  [protected]
async function logout(req, res, next) {
  try {
    await pool.execute('UPDATE users SET refresh_token = NULL WHERE id = ?', [req.user.id]);
    return res.json({ success: true, message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me  [protected]
async function me(req, res, next) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// PUT /api/auth/profile  [protected]
// Both admin and staff can update their own profile
async function updateProfile(req, res, next) {
  try {
    const { name, email, phone } = req.body;

    // Check email not taken by another user
    if (email) {
      const [existing] = await pool.execute(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email.toLowerCase(), req.user.id]
      );
      if (existing.length) {
        return res.status(409).json({ success: false, message: 'Email already in use.' });
      }
    }

    await pool.execute(
      'UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?',
      [
        name    || req.user.name,
        email   ? email.toLowerCase() : req.user.email,
        phone   !== undefined ? phone : req.user.phone,
        req.user.id,
      ]
    );

    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    return res.json({ success: true, message: 'Profile updated.', data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/change-password  [protected]
async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;

    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid  = await bcrypt.compare(current_password, rows[0].password_hash);

    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const rounds  = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const newHash = await bcrypt.hash(new_password, rounds);

    await pool.execute(
      'UPDATE users SET password_hash = ?, refresh_token = NULL WHERE id = ?',
      [newHash, req.user.id]
    );

    return res.json({ success: true, message: 'Password changed. Please log in again.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, refresh, logout, me, updateProfile, changePassword, register };