const { pool } = require('../config/db');

async function fetchReturn(returnId) {
  const [returns] = await pool.execute(
    `SELECT r.id, r.total_amount, r.reason, r.status, r.created_at, r.updated_at,
            u.id AS staff_id, u.name AS staff_name,
            r.sale_id
     FROM returns r
     JOIN users u ON r.staff_id = u.id
     WHERE r.id = ?`,
    [returnId]
  );

  const [items] = await pool.execute(
    `SELECT ri.id, ri.quantity, ri.unit_price, ri.subtotal,
            pr.id AS product_id, pr.name AS product_name, pr.sku
     FROM return_items ri
     JOIN products pr ON ri.product_id = pr.id
     WHERE ri.return_id = ?`,
    [returnId]
  );

  if (!returns.length) return null;
  return { ...returns[0], items };
}

// GET — admin sees all, staff sees own
async function list(req, res, next) {
  try {
    const isAdmin = req.user.role === 'admin';
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(100, parseInt(req.query.limit) || 20);
    const offset  = (page - 1) * limit;

    const conditions = [];
    const params     = [];

    if (!isAdmin) {
      conditions.push('r.staff_id = ?');
      params.push(req.user.id);
    } else if (req.query.staff_id) {
      conditions.push('r.staff_id = ?');
      params.push(req.query.staff_id);
    }

    if (req.query.status) { conditions.push('r.status = ?'); params.push(req.query.status); }
    if (req.query.date_from) { conditions.push('DATE(r.created_at) >= ?'); params.push(req.query.date_from); }
    if (req.query.date_to)   { conditions.push('DATE(r.created_at) <= ?'); params.push(req.query.date_to); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM returns r ${where}`, params
    );

    const [rows] = await pool.execute(
      `SELECT r.id, r.total_amount, r.reason, r.status, r.created_at,
              u.id AS staff_id, u.name AS staff_name, r.sale_id
       FROM returns r
       JOIN users u ON r.staff_id = u.id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success: true, data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// GET /:id
async function getOne(req, res, next) {
  try {
    const ret = await fetchReturn(req.params.id);
    if (!ret) return res.status(404).json({ success: false, message: 'Return not found.' });
    if (req.user.role === 'staff' && ret.staff_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    return res.json({ success: true, data: ret });
  } catch (err) {
    next(err);
  }
}

// POST — staff creates a return to admin
// Body: { sale_id?, reason?, items: [{ product_id, quantity, unit_price }] }
async function create(req, res, next) {
  try {
    const { sale_id, reason, items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Return must have at least one item.' });
    }

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += item.unit_price * item.quantity;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.execute(
        'INSERT INTO returns (staff_id, sale_id, total_amount, reason, status) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, sale_id || null, totalAmount, reason || null, 'pending']
      );
      const returnId = result.insertId;

      for (const item of items) {
        const subtotal = item.unit_price * item.quantity;
        await conn.execute(
          'INSERT INTO return_items (return_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
          [returnId, item.product_id, item.quantity, item.unit_price, subtotal]
        );
      }

      await conn.commit();

      const ret = await fetchReturn(returnId);
      return res.status(201).json({ success: true, data: ret });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/returns/:id/status  [admin only]
// Body: { status: 'approved' | 'rejected' }
// When approved → restore stock
async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;

    const [existing] = await pool.execute(
      'SELECT id, status FROM returns WHERE id = ?',
      [req.params.id]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Return not found.' });
    }

    if (existing[0].status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Return already ${existing[0].status}. Cannot change status.`,
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute('UPDATE returns SET status = ? WHERE id = ?', [status, req.params.id]);

      // If approved, restore stock
      if (status === 'approved') {
        const [items] = await conn.execute(
          'SELECT product_id, quantity FROM return_items WHERE return_id = ?',
          [req.params.id]
        );
        for (const item of items) {
          await conn.execute(
            'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
            [item.quantity, item.product_id]
          );
        }
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const ret = await fetchReturn(req.params.id);
    return res.json({ success: true, data: ret });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/returns/:id  [admin only — only pending returns]
async function remove(req, res, next) {
  try {
    const [existing] = await pool.execute('SELECT status FROM returns WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Return not found.' });
    }
    if (existing[0].status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending returns can be deleted.' });
    }
    await pool.execute('DELETE FROM returns WHERE id = ?', [req.params.id]);
    return res.json({ success: true, message: 'Return deleted.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, updateStatus, remove };