const { pool } = require('../config/db');

// GET /api/admin/people?type=customer|supplier
async function list(req, res, next) {
  try {
    const conditions = [];
    const params     = [];

    if (req.query.type) {
      conditions.push('type = ?');
      params.push(req.query.type);
    }
    if (req.query.search) {
      conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      const t = `%${req.query.search}%`;
      params.push(t, t, t);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await pool.execute(
      `SELECT * FROM people ${where} ORDER BY type, name`,
      params
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/people/:id
async function getOne(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT * FROM people WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Person not found.' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/people
async function create(req, res, next) {
  try {
    const { type, name, email, phone, address, note } = req.body;

    const [result] = await pool.execute(
      'INSERT INTO people (type, name, email, phone, address, note) VALUES (?, ?, ?, ?, ?, ?)',
      [type, name, email || null, phone || null, address || null, note || null]
    );

    const [rows] = await pool.execute('SELECT * FROM people WHERE id = ?', [result.insertId]);
    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// PUT /api/admin/people/:id
async function update(req, res, next) {
  try {
    const { type, name, email, phone, address, note } = req.body;

    const [result] = await pool.execute(
      `UPDATE people SET
         type    = COALESCE(?, type),
         name    = COALESCE(?, name),
         email   = COALESCE(?, email),
         phone   = COALESCE(?, phone),
         address = COALESCE(?, address),
         note    = COALESCE(?, note)
       WHERE id = ?`,
      [type || null, name || null, email || null, phone || null,
       address || null, note || null, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Person not found.' });
    }

    const [rows] = await pool.execute('SELECT * FROM people WHERE id = ?', [req.params.id]);
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/people/:id
async function remove(req, res, next) {
  try {
    const [result] = await pool.execute('DELETE FROM people WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Person not found.' });
    }
    return res.json({ success: true, message: 'Deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove };