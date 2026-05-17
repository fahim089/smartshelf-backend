const { pool } = require('../config/db');

// GET /api/admin/categories  (admin) + GET /api/staff/categories (staff read-only)
async function list(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT c.id, c.name, c.created_at,
              COUNT(p.id) AS product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       GROUP BY c.id
       ORDER BY c.name`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/categories/:id
async function getOne(req, res, next) {
  try {
    const [rows] = await pool.execute('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/categories
async function create(req, res, next) {
  try {
    const { name } = req.body;

    const [result] = await pool.execute('INSERT INTO categories (name) VALUES (?)', [name.trim()]);

    return res.status(201).json({
      success: true,
      data: { id: result.insertId, name: name.trim() },
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Category already exists.' });
    }
    next(err);
  }
}

// PUT /api/admin/categories/:id
async function update(req, res, next) {
  try {
    const { name } = req.body;

    const [result] = await pool.execute(
      'UPDATE categories SET name = ? WHERE id = ?',
      [name.trim(), req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    return res.json({ success: true, message: 'Category updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Category name already exists.' });
    }
    next(err);
  }
}

// DELETE /api/admin/categories/:id
async function remove(req, res, next) {
  try {
    const [result] = await pool.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    return res.json({ success: true, message: 'Category deleted. Products are now uncategorised.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove };