const { pool } = require('../config/db');

// GET /api/admin/dashboard  [admin only]
async function adminDashboard(req, res, next) {
  try {
    // Overall business summary
    const [[summary]] = await pool.execute(`
      SELECT
        (SELECT COUNT(*) FROM products WHERE is_active = 1)                       AS total_products,
        (SELECT COUNT(*) FROM products WHERE is_active = 1 AND stock_quantity = 0) AS out_of_stock,
        (SELECT COUNT(*) FROM products WHERE is_active = 1 AND stock_quantity <= low_stock_threshold AND stock_quantity > 0) AS low_stock,
        (SELECT COUNT(*) FROM users WHERE role = 'staff' AND is_active = 1)        AS total_staff,
        (SELECT COUNT(*) FROM people WHERE type = 'customer')                      AS total_customers,
        (SELECT COUNT(*) FROM people WHERE type = 'supplier')                      AS total_suppliers,
        (SELECT COALESCE(SUM(total_amount), 0) FROM sales)                         AS total_sales_amount,
        (SELECT COUNT(*) FROM sales)                                                AS total_sales_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM purchases)                     AS total_purchases_amount,
        (SELECT COUNT(*) FROM purchases)                                            AS total_purchases_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM returns WHERE status = 'approved') AS total_returns_amount,
        (SELECT COUNT(*) FROM returns)                                              AS total_returns_count,
        (SELECT COUNT(*) FROM returns WHERE status = 'pending')                    AS pending_returns
    `);

    // Today's summary
    const [[today]] = await pool.execute(`
      SELECT
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_amount END), 0) AS today_sales,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END)                       AS today_sales_count
      FROM sales
    `);

    // Staff performance breakdown
    const [staffPerformance] = await pool.execute(`
      SELECT
        u.id, u.name,
        COUNT(DISTINCT s.id)                          AS sales_count,
        COALESCE(SUM(s.total_amount), 0)              AS sales_amount,
        COUNT(DISTINCT pu.id)                         AS purchases_count,
        COALESCE(SUM(pu.total_amount), 0)             AS purchases_amount,
        COUNT(DISTINCT r.id)                          AS returns_count,
        COALESCE(SUM(CASE WHEN r.status='approved' THEN r.total_amount END), 0) AS returns_amount
      FROM users u
      LEFT JOIN sales     s  ON s.staff_id  = u.id
      LEFT JOIN purchases pu ON pu.staff_id = u.id
      LEFT JOIN returns   r  ON r.staff_id  = u.id
      WHERE u.role = 'staff' AND u.is_active = 1
      GROUP BY u.id, u.name
      ORDER BY sales_amount DESC
    `);

    // Low stock products
    const [lowStockProducts] = await pool.execute(`
      SELECT id, name, sku, stock_quantity, low_stock_threshold
      FROM products
      WHERE is_active = 1 AND stock_quantity <= low_stock_threshold
      ORDER BY stock_quantity ASC
      LIMIT 10
    `);

    // Recent sales (last 5)
    const [recentSales] = await pool.execute(`
      SELECT s.id, s.total_amount, s.created_at, u.name AS staff_name
      FROM sales s
      JOIN users u ON s.staff_id = u.id
      ORDER BY s.created_at DESC LIMIT 5
    `);

    // Pending returns
    const [pendingReturns] = await pool.execute(`
      SELECT r.id, r.total_amount, r.reason, r.created_at, u.name AS staff_name
      FROM returns r
      JOIN users u ON r.staff_id = u.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at ASC
      LIMIT 10
    `);

    return res.json({
      success: true,
      data: {
        summary: { ...summary, ...today },
        staff_performance:  staffPerformance,
        low_stock_products: lowStockProducts,
        recent_sales:       recentSales,
        pending_returns:    pendingReturns,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/staff/dashboard  [staff only — own data]
async function staffDashboard(req, res, next) {
  try {
    const staffId = req.user.id;

    // Today's sales
    const [[todaySales]] = await pool.execute(`
      SELECT
        COUNT(*)                     AS today_sales_count,
        COALESCE(SUM(total_amount), 0) AS today_sales_amount
      FROM sales
      WHERE staff_id = ? AND DATE(created_at) = CURDATE()
    `, [staffId]);

    // All time totals
    const [[totals]] = await pool.execute(`
      SELECT
        COALESCE((SELECT SUM(total_amount) FROM sales     WHERE staff_id = ?), 0) AS total_sales,
        COALESCE((SELECT COUNT(*)          FROM sales     WHERE staff_id = ?), 0) AS total_sales_count,
        COALESCE((SELECT SUM(total_amount) FROM purchases WHERE staff_id = ?), 0) AS total_purchases,
        COALESCE((SELECT COUNT(*)          FROM purchases WHERE staff_id = ?), 0) AS total_purchases_count,
        COALESCE((SELECT SUM(total_amount) FROM returns   WHERE staff_id = ? AND status = 'approved'), 0) AS total_returns,
        COALESCE((SELECT COUNT(*)          FROM returns   WHERE staff_id = ?), 0) AS total_returns_count,
        COALESCE((SELECT COUNT(*)          FROM returns   WHERE staff_id = ? AND status = 'pending'), 0) AS pending_returns
    `, [staffId, staffId, staffId, staffId, staffId, staffId, staffId]);

    // Net = sales - purchases - returns
    const net = parseFloat(totals.total_sales) - parseFloat(totals.total_purchases) - parseFloat(totals.total_returns);

    // Recent sales by this staff (last 5)
    const [recentSales] = await pool.execute(`
      SELECT s.id, s.total_amount, s.created_at, pe.name AS customer_name
      FROM sales s
      LEFT JOIN people pe ON s.customer_id = pe.id
      WHERE s.staff_id = ?
      ORDER BY s.created_at DESC LIMIT 5
    `, [staffId]);

    // Recent purchases by this staff (last 5)
    const [recentPurchases] = await pool.execute(`
      SELECT pu.id, pu.total_amount, pu.created_at, pe.name AS supplier_name
      FROM purchases pu
      LEFT JOIN people pe ON pu.supplier_id = pe.id
      WHERE pu.staff_id = ?
      ORDER BY pu.created_at DESC LIMIT 5
    `, [staffId]);

    // My pending returns
    const [myReturns] = await pool.execute(`
      SELECT id, total_amount, reason, status, created_at
      FROM returns
      WHERE staff_id = ? AND status = 'pending'
      ORDER BY created_at DESC LIMIT 5
    `, [staffId]);

    return res.json({
      success: true,
      data: {
        today:           todaySales,
        totals:          { ...totals, net: net.toFixed(2) },
        recent_sales:    recentSales,
        recent_purchases: recentPurchases,
        my_pending_returns: myReturns,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { adminDashboard, staffDashboard };