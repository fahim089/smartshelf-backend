const { pool } = require('../config/db');

// ─── helper: build full sale response ────────────────────────────────────────
async function fetchSale(saleId) {
  const [sales] = await pool.execute(
    `SELECT s.id, s.total_amount, s.note, s.created_at,
            u.id AS staff_id, u.name AS staff_name,
            p.id AS customer_id, p.name AS customer_name
     FROM sales s
     JOIN users u ON s.staff_id = u.id
     LEFT JOIN people p ON s.customer_id = p.id
     WHERE s.id = ?`,
    [saleId]
  );

  const [items] = await pool.execute(
    `SELECT si.id, si.quantity, si.unit_price, si.subtotal,
            pr.id AS product_id, pr.name AS product_name, pr.sku
     FROM sale_items si
     JOIN products pr ON si.product_id = pr.id
     WHERE si.sale_id = ?`,
    [saleId]
  );

  if (!sales.length) return null;
  return { ...sales[0], items };
}

// GET /api/admin/sales        → all sales
// GET /api/staff/sales        → only this staff member's sales
async function list(req, res, next) {
  try {
    const isAdmin = req.user.role === 'admin';
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(100, parseInt(req.query.limit) || 20);
    const offset  = (page - 1) * limit;

    const conditions = [];
    const params     = [];

    if (!isAdmin) {
      conditions.push('s.staff_id = ?');
      params.push(req.user.id);
    } else if (req.query.staff_id) {
      conditions.push('s.staff_id = ?');
      params.push(req.query.staff_id);
    }

    if (req.query.date_from) {
      conditions.push('DATE(s.created_at) >= ?');
      params.push(req.query.date_from);
    }
    if (req.query.date_to) {
      conditions.push('DATE(s.created_at) <= ?');
      params.push(req.query.date_to);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM sales s ${where}`, params
    );

    const [rows] = await pool.execute(
      `SELECT s.id, s.total_amount, s.note, s.created_at,
              u.id AS staff_id, u.name AS staff_name,
              pe.id AS customer_id, pe.name AS customer_name
       FROM sales s
       JOIN users u ON s.staff_id = u.id
       LEFT JOIN people pe ON s.customer_id = pe.id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/sales/:id  +  GET /api/staff/sales/:id
async function getOne(req, res, next) {
  try {
    const sale = await fetchSale(req.params.id);

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale not found.' });
    }

    // Staff can only view their own sales
    if (req.user.role === 'staff' && sale.staff_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    return res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
}

// POST /api/staff/sales  +  POST /api/admin/sales
// Body: { customer_id?, note?, items: [{ product_id, quantity, unit_price }] }
async function create(req, res, next) {
  try {
    const { customer_id, note, items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Sale must have at least one item.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let totalAmount = 0;

      // Validate all products and calculate total
      for (const item of items) {
        const [rows] = await conn.execute(
          'SELECT id, stock_quantity, price FROM products WHERE id = ? AND is_active = 1',
          [item.product_id]
        );
        if (!rows.length) {
          await conn.rollback();
          return res.status(404).json({ success: false, message: `Product ${item.product_id} not found.` });
        }
        if (rows[0].stock_quantity < item.quantity) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for product ID ${item.product_id}.`,
          });
        }
        const unitPrice = item.unit_price ?? rows[0].price;
        totalAmount += unitPrice * item.quantity;
        item._unit_price = unitPrice;
      }

      // Create sale
      const [saleResult] = await conn.execute(
        'INSERT INTO sales (staff_id, customer_id, total_amount, note) VALUES (?, ?, ?, ?)',
        [req.user.id, customer_id || null, totalAmount, note || null]
      );
      const saleId = saleResult.insertId;

      // Insert items + deduct stock
      for (const item of items) {
        const subtotal = item._unit_price * item.quantity;
        await conn.execute(
          'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
          [saleId, item.product_id, item.quantity, item._unit_price, subtotal]
        );
        await conn.execute(
          'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }

      await conn.commit();

      const sale = await fetchSale(saleId);
      return res.status(201).json({ success: true, data: sale });
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

// DELETE /api/admin/sales/:id  [admin only]
async function remove(req, res, next) {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Restore stock
      const [items] = await conn.execute(
        'SELECT product_id, quantity FROM sale_items WHERE sale_id = ?',
        [req.params.id]
      );
      for (const item of items) {
        await conn.execute(
          'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
      }

      const [result] = await conn.execute('DELETE FROM sales WHERE id = ?', [req.params.id]);
      if (!result.affectedRows) {
        await conn.rollback();
        return res.status(404).json({ success: false, message: 'Sale not found.' });
      }

      await conn.commit();
      return res.json({ success: true, message: 'Sale deleted and stock restored.' });
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