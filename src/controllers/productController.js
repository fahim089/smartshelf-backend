const fs       = require('fs');
const path     = require('path');
const { pool } = require('../config/db');

// ─── Build full image URL from stored filename ────────────────────────────────

function buildImageUrl(filename) {
  const base = process.env.BASE_URL
  return `${base}/uploads/${filename}`;
}

function extractFilename(raw) {
  if (!raw) return null;
  const match = raw.match(/([^/\\]+\.(jpg|jpeg|png|webp|gif))$/i);
  return match ? match[1] : null;
}

// ─── Fetch images for a product, always returning full URLs ──────────────────
async function fetchImages(productId) {
  const [imgs] = await pool.execute(
    'SELECT id, image_url, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order',
    [productId]
  );
  return imgs.map(img => ({
    id:         img.id,
    image_url:  buildImageUrl(extractFilename(img.image_url) || img.image_url),
    sort_order: img.sort_order,
  }));
}

// GET /api/admin/products  +  GET /api/staff/products
async function list(req, res, next) {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const conditions = ['p.is_active = 1'];
    const params     = [];

    if (req.query.search) {
      conditions.push('(p.name LIKE ? OR p.sku LIKE ?)');
      const t = `%${req.query.search}%`;
      params.push(t, t);
    }
    if (req.query.category_id) {
      conditions.push('p.category_id = ?');
      params.push(req.query.category_id);
    }
    if (req.query.low_stock === 'true') {
      conditions.push('p.stock_quantity <= p.low_stock_threshold');
    }

    const where = conditions.join(' AND ');

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM products p WHERE ${where}`,
      params
    );

    const [rows] = await pool.execute(
      `SELECT p.id, p.name, p.sku, p.price, p.cost_price, p.unit,
              p.stock_quantity, p.low_stock_threshold, p.description,
              p.is_active, p.created_at, p.updated_at,
              c.id AS category_id, c.name AS category_name,
              CASE
                WHEN p.stock_quantity = 0 THEN 'out_of_stock'
                WHEN p.stock_quantity <= p.low_stock_threshold THEN 'low_stock'
                ELSE 'in_stock'
              END AS stock_status
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE ${where}
       ORDER BY p.name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    for (const row of rows) {
      row.images = await fetchImages(row.id);
    }

    return res.json({
      success: true,
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/products/:id  +  GET /api/staff/products/:id
async function getOne(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT p.*,
              c.id AS category_id, c.name AS category_name,
              CASE
                WHEN p.stock_quantity = 0 THEN 'out_of_stock'
                WHEN p.stock_quantity <= p.low_stock_threshold THEN 'low_stock'
                ELSE 'in_stock'
              END AS stock_status
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.id = ?`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    rows[0].images = await fetchImages(rows[0].id);
    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/products  [admin only]
async function create(req, res, next) {
  try {
    const {
      name, description, sku, price, cost_price,
      unit, stock_quantity = 0, low_stock_threshold = 5, category_id,
    } = req.body;

    const [result] = await pool.execute(
      `INSERT INTO products
         (category_id, name, description, sku, price, cost_price, unit, stock_quantity, low_stock_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [category_id || null, name, description || null, sku || null,
       price, cost_price || null, unit || null, stock_quantity, low_stock_threshold]
    );

    const productId = result.insertId;

    // Store only the filename in DB
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        await pool.execute(
          'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
          [productId, req.files[i].filename, i]
        );
      }
    }

    const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [productId]);
    rows[0].images = await fetchImages(productId);

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'A product with this SKU already exists.' });
    }
    next(err);
  }
}

// PUT /api/admin/products/:id  [admin only]
async function update(req, res, next) {
  try {
    const {
      name, description, sku, price, cost_price,
      unit, stock_quantity, low_stock_threshold, category_id, is_active,
    } = req.body;

    const [existing] = await pool.execute('SELECT id FROM products WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    await pool.execute(
      `UPDATE products SET
         category_id         = COALESCE(?, category_id),
         name                = COALESCE(?, name),
         description         = ?,
         sku                 = COALESCE(?, sku),
         price               = COALESCE(?, price),
         cost_price          = COALESCE(?, cost_price),
         unit                = COALESCE(?, unit),
         stock_quantity      = COALESCE(?, stock_quantity),
         low_stock_threshold = COALESCE(?, low_stock_threshold),
         is_active           = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        category_id !== undefined ? category_id : null,
        name || null,
        description !== undefined ? description : undefined,
        sku || null,
        price || null,
        cost_price !== undefined ? cost_price : null,
        unit || null,
        stock_quantity !== undefined ? stock_quantity : null,
        low_stock_threshold !== undefined ? low_stock_threshold : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        req.params.id,
      ]
    );

    const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);
    rows[0].images = await fetchImages(rows[0].id);

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'SKU already exists.' });
    }
    next(err);
  }
}

// DELETE /api/admin/products/:id  [admin only]
async function remove(req, res, next) {
  try {
    const [result] = await pool.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    return res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/admin/products/:id/images  [admin only]
async function addImages(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No images uploaded.' });
    }

    const [[{ count }]] = await pool.execute(
      'SELECT COUNT(*) AS count FROM product_images WHERE product_id = ?',
      [req.params.id]
    );

    const available = 3 - count;
    if (available <= 0) {
      for (const f of req.files) fs.unlink(f.path, () => {});
      return res.status(400).json({ success: false, message: 'Product already has 3 images (maximum).' });
    }

    const toSave = req.files.slice(0, available);
    for (const f of req.files.slice(available)) fs.unlink(f.path, () => {});

    for (let i = 0; i < toSave.length; i++) {
      // Store only the filename
      await pool.execute(
        'INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?, ?, ?)',
        [req.params.id, toSave[i].filename, count + i]
      );
    }

    const images = await fetchImages(req.params.id);
    return res.json({ success: true, data: images });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/products/:id/images/:imageId  [admin only]
async function deleteImage(req, res, next) {
  try {
    const [rows] = await pool.execute(
      'SELECT image_url FROM product_images WHERE id = ? AND product_id = ?',
      [req.params.imageId, req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Image not found.' });
    }

    // Extract filename and delete from disk
    const filename = extractFilename(rows[0].image_url) || rows[0].image_url;
    const filePath = path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads', filename);
    fs.unlink(filePath, () => {});

    await pool.execute('DELETE FROM product_images WHERE id = ?', [req.params.imageId]);

    const images = await fetchImages(req.params.id);
    return res.json({ success: true, data: images });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update, remove, addImages, deleteImage };