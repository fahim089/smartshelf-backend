const bcrypt   = require('bcryptjs');
const { pool } = require('../config/db');

// GET /api/admin/users  — list all users
async function listUsers(req, res, next) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, role, is_active, created_at FROM users ORDER BY role, name'
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/users/:id
async function getUser(req, res, next) {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, role, is_active, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/users  — create staff account
async function createUser(req, res, next) {
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
      data: { id: result.insertId, name, email, phone, role, is_active: 1 },
    });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/users/:id  — update any user
async function updateUser(req, res, next) {
  try {
    const { name, email, phone, role, is_active } = req.body;

    const [existing] = await pool.execute('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Prevent admin from deactivating themselves
    if (parseInt(req.params.id) === req.user.id && is_active === false) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
    }

    if (email) {
      const [dup] = await pool.execute(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email.toLowerCase(), req.params.id]
      );
      if (dup.length) {
        return res.status(409).json({ success: false, message: 'Email already in use.' });
      }
    }

    await pool.execute(
      'UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), phone = COALESCE(?, phone), role = COALESCE(?, role), is_active = COALESCE(?, is_active) WHERE id = ?',
      [name || null, email ? email.toLowerCase() : null, phone || null, role || null,
       is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id]
    );

    const [rows] = await pool.execute(
      'SELECT id, name, email, phone, role, is_active FROM users WHERE id = ?',
      [req.params.id]
    );

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/users/:id
async function deleteUser(req, res, next) {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }

    const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser };