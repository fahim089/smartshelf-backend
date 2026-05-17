const { pool } = require('../config/db');

async function fetchPurchase(purchaseId) {
  const [purchases] = await pool.execute(
    `SELECT pu.id, pu.total_amount, pu.note, pu.created_at,
            u.id AS staff_id, u.name AS staff_name,
            p.id AS supplier_id, p.name AS supplier_name
     FROM purchases pu
     JOIN users u ON pu.staff_id = u.id
     LEFT JOIN people p ON pu.supplier_id = p.id
     WHERE pu.id = ?`,
    [purchaseId]
  );

  const [items] = await pool.execute(
    `SELECT pi.id, pi.quantity, pi.unit_price, pi.subtotal,
            pr.id AS product_id, pr.name AS product_name, pr.sku
     FROM purchase_items pi
     JOIN products pr ON pi.product_id = pr.id
     WHERE pi.purchase_id = ?`,
    [purchaseId]
  );

  if (!purchases.length) return null;
  return { ...purchases[0], items };
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
      conditions.push('pu.staff_id = ?');
      params.push(req.user.id);
    } else if (req.query.staff_id) {
      conditions.push('pu.staff_id = ?');
      params.push(req.query.staff_id);
    }

    if (req.query.date_from) { conditions.push('DATE(pu.created_at) >= ?'); params.push(req.query.date_from); }
    if (req.query.date_to)   { conditions.push('DATE(pu.created_at) <= ?'); params.push(req.query.date_to); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM purchases pu ${where}`, params
    );

    const [rows] = await pool.execute(
      `SELECT pu.id, pu.total_amount, pu.note, pu.created_at,
              u.id AS staff_id, u.name AS staff_name,
              pe.id AS supplier_id, pe.name AS supplier_name
       FROM purchases pu
       JOIN users u ON pu.staff_id = u.id
       LEFT JOIN people pe ON pu.supplier_id = pe.id
       ${where}
       ORDER BY pu.created_at DESC
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
    const purchase = await fetchPurchase(req.params.id);
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found.' });
    }
    if (req.user.role === 'staff' && purchase.staff_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    return res.json({ success: true, data: purchase });
  } catch (err) {
    next(err);
  }
}

// POST — staff or admin creates a purchase (adds stock)
// Body: { supplier_id?, note?, items: [{ product_id, quantity, unit_price }] }
async function create(req, res, next) {
  try {
    const { supplier_id, note, items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Purchase must have at least one item.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let totalAmount = 0;

      for (const item of items) {
        const [rows] = await conn.execute(
          'SELECT id FROM products WHERE id = ? AND is_active = 1',
          [item.product_id]
        );
        if (!rows.length) {
          await conn.rollback();
          return res.status(404).json({ success: false, message: `Product ${item.product_id} not found.` });
        }
        totalAmount += item.unit_price * item.quantity;
      }

      const [result] = await conn.execute(
        'INSERT INTO purchases (staff_id, supplier_id, total_amount, note) VALUES (?, ?, ?, ?)',
        [req.user.id, supplier_id || null, totalAmount, note || null]
      );
      const purchaseId = result.insertId;

      for (const item of items) {
        const subtotal = item.unit_price * item.quantity;
        await conn.execute(
          'INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
          [purchaseId, item.product_id, item.quantity, item.unit_price, subtotal]
        );
        // Add stock
        await conn.execute(
          'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }

      await conn.commit();
      const purchase = await fetchPurchase(purchaseId);
      return res.status(201).json({ success: true, data: purchase });
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

// DELETE /admin/purchases/:id  [admin only]
async function remove(req, res, next) {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [items] = await conn.execute(
        'SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ?',
        [req.params.id]
      );
      for (const item of items) {
        await conn.execute(
          'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }

      const [result] = await conn.execute('DELETE FROM purchases WHERE id = ?', [req.params.id]);
      if (!result.affectedRows) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Purchase not found.' });
      }

      await conn.commit();
      return res.json({ success: true, message: 'Purchase deleted and stock reversed.' });
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

module.exports = { list, getOne, create, remove };