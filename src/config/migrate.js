/**
 * SmartShelf v2 — Migration
 * Run: npm run migrate
 *
 * Tables:
 *   users          — admin + staff accounts
 *   categories     — product categories (admin only)
 *   products       — inventory items
 *   product_images — up to 3 images per product
 *   people         — customers & suppliers (admin only)
 *   sales          — sales transactions
 *   sale_items     — line items per sale
 *   purchases      — purchase transactions
 *   purchase_items — line items per purchase
 *   returns        — return transactions (staff → admin)
 *   return_items   — line items per return
 */

require('dotenv').config();
const { pool } = require('./db');

async function migrate() {
  const conn = await pool.getConnection();
  console.log('🔧  Running SmartShelf v2 migrations...\n');

  try {
    await conn.beginTransaction();

    // ── users ──────────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name          VARCHAR(150)  NOT NULL,
        email         VARCHAR(255)  NOT NULL UNIQUE,
        phone         VARCHAR(30)   DEFAULT NULL,
        password_hash VARCHAR(255)  NOT NULL,
        role          ENUM('admin','staff') NOT NULL DEFAULT 'staff',
        is_active     TINYINT(1)    NOT NULL DEFAULT 1,
        refresh_token VARCHAR(512)  DEFAULT NULL,
        created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_role     (role),
        INDEX idx_active   (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  users');

    // ── categories ─────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id         INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(100)  NOT NULL UNIQUE,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  categories');

    // ── products ───────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id                  INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
        category_id         INT UNSIGNED   DEFAULT NULL,
        name                VARCHAR(200)   NOT NULL,
        description         TEXT           DEFAULT NULL,
        sku                 VARCHAR(100)   DEFAULT NULL UNIQUE,
        price               DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
        cost_price          DECIMAL(10,2)  DEFAULT NULL,
        unit                VARCHAR(50)    DEFAULT NULL,
        stock_quantity      INT            NOT NULL DEFAULT 0,
        low_stock_threshold INT            NOT NULL DEFAULT 5,
        is_active           TINYINT(1)     NOT NULL DEFAULT 1,
        created_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_category (category_id),
        INDEX idx_active   (is_active),
        INDEX idx_stock    (stock_quantity),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  products');

    // ── product_images ─────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS product_images (
        id         INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
        product_id INT UNSIGNED  NOT NULL,
        image_url  VARCHAR(500)  NOT NULL,
        sort_order TINYINT       NOT NULL DEFAULT 0,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_product (product_id),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  product_images');

    // ── people ─────────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS people (
        id         INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
        type       ENUM('customer','supplier') NOT NULL,
        name       VARCHAR(150)  NOT NULL,
        email      VARCHAR(255)  DEFAULT NULL,
        phone      VARCHAR(30)   DEFAULT NULL,
        address    VARCHAR(300)  DEFAULT NULL,
        note       TEXT          DEFAULT NULL,
        created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  people');

    // ── sales ──────────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS sales (
        id           INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
        staff_id     INT UNSIGNED   NOT NULL,
        customer_id  INT UNSIGNED   DEFAULT NULL,
        total_amount DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
        note         TEXT           DEFAULT NULL,
        created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_staff    (staff_id),
        INDEX idx_customer (customer_id),
        INDEX idx_date     (created_at),
        FOREIGN KEY (staff_id)    REFERENCES users(id),
        FOREIGN KEY (customer_id) REFERENCES people(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  sales');

    // ── sale_items ─────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id         INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
        sale_id    INT UNSIGNED   NOT NULL,
        product_id INT UNSIGNED   NOT NULL,
        quantity   INT            NOT NULL,
        unit_price DECIMAL(10,2)  NOT NULL,
        subtotal   DECIMAL(10,2)  NOT NULL,
        FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  sale_items');

    // ── purchases ──────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS purchases (
        id           INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
        staff_id     INT UNSIGNED   NOT NULL,
        supplier_id  INT UNSIGNED   DEFAULT NULL,
        total_amount DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
        note         TEXT           DEFAULT NULL,
        created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_staff    (staff_id),
        INDEX idx_supplier (supplier_id),
        INDEX idx_date     (created_at),
        FOREIGN KEY (staff_id)    REFERENCES users(id),
        FOREIGN KEY (supplier_id) REFERENCES people(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  purchases');

    // ── purchase_items ─────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id         INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
        purchase_id INT UNSIGNED  NOT NULL,
        product_id INT UNSIGNED   NOT NULL,
        quantity   INT            NOT NULL,
        unit_price DECIMAL(10,2)  NOT NULL,
        subtotal   DECIMAL(10,2)  NOT NULL,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id)  REFERENCES products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  purchase_items');

    // ── returns ────────────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS returns (
        id           INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
        staff_id     INT UNSIGNED   NOT NULL,
        sale_id      INT UNSIGNED   DEFAULT NULL,
        total_amount DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
        reason       TEXT           DEFAULT NULL,
        status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        created_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_staff  (staff_id),
        INDEX idx_sale   (sale_id),
        INDEX idx_status (status),
        FOREIGN KEY (staff_id) REFERENCES users(id),
        FOREIGN KEY (sale_id)  REFERENCES sales(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  returns');

    // ── return_items ───────────────────────────────────────────────────────
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS return_items (
        id         INT UNSIGNED   NOT NULL AUTO_INCREMENT PRIMARY KEY,
        return_id  INT UNSIGNED   NOT NULL,
        product_id INT UNSIGNED   NOT NULL,
        quantity   INT            NOT NULL,
        unit_price DECIMAL(10,2)  NOT NULL,
        subtotal   DECIMAL(10,2)  NOT NULL,
        FOREIGN KEY (return_id)  REFERENCES returns(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('  ✔  return_items');

    await conn.commit();
    console.log('\n✅  All migrations completed.\n');
  } catch (err) {
    await conn.rollback();
    console.error('\n❌  Migration failed:', err.message);
    throw err;
  } finally {
    conn.release();
    pool.end();
  }
}

migrate().catch(() => process.exit(1));