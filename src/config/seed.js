/**
 * SmartShelf v2 — Seed
 * Run: npm run seed
 * Creates 1 admin, 2 staff, categories, products
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌  Cannot seed in production.');
    process.exit(1);
  }

  const conn = await pool.getConnection();
  console.log('🌱  Seeding SmartShelf v2...\n');

  try {
    await conn.beginTransaction();

    // Clear all tables in correct FK order
    await conn.execute('DELETE FROM return_items');
    await conn.execute('DELETE FROM returns');
    await conn.execute('DELETE FROM purchase_items');
    await conn.execute('DELETE FROM purchases');
    await conn.execute('DELETE FROM sale_items');
    await conn.execute('DELETE FROM sales');
    await conn.execute('DELETE FROM product_images');
    await conn.execute('DELETE FROM products');
    await conn.execute('DELETE FROM categories');
    await conn.execute('DELETE FROM people');
    await conn.execute('DELETE FROM users');
    console.log('  🗑   Cleared existing data\n');

    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;

    // ── Users ──────────────────────────────────────────────────────────────
    const users = [
      { name: 'Admin User',  email: 'admin@demo.com',  phone: '0400000001', role: 'admin',  password: 'admin123' },
      { name: 'Staff Alice', email: 'alice@demo.com',  phone: '0400000002', role: 'staff',  password: 'staff123' },
      { name: 'Staff Bob',   email: 'bob@demo.com',    phone: '0400000003', role: 'staff',  password: 'staff123' },
    ];

    const userIds = {};
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, rounds);
      const [r] = await conn.execute(
        'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [u.name, u.email, u.phone, hash, u.role]
      );
      userIds[u.email] = r.insertId;
      console.log(`  ✔  User [${u.role}]: ${u.email} / ${u.password}`);
    }

    // ── Categories ─────────────────────────────────────────────────────────
    const cats = ['Fresh Produce', 'Dairy', 'Dry Goods', 'Bakery', 'Beverages'];
    const catIds = {};
    for (const name of cats) {
      const [r] = await conn.execute('INSERT INTO categories (name) VALUES (?)', [name]);
      catIds[name] = r.insertId;
    }
    console.log(`\n  ✔  ${cats.length} categories`);

    // ── Products ───────────────────────────────────────────────────────────
    const products = [
      { category: 'Fresh Produce', name: 'Granny Smith Apples', sku: 'FP-001', price: 3.99, cost_price: 2.00, unit: 'kg',   stock_quantity: 50, low_stock_threshold: 10 },
      { category: 'Fresh Produce', name: 'Baby Spinach 200g',   sku: 'FP-002', price: 3.50, cost_price: 1.80, unit: 'bag',  stock_quantity: 30, low_stock_threshold: 8  },
      { category: 'Dairy',         name: 'Full Cream Milk 2L',  sku: 'DA-001', price: 3.20, cost_price: 1.90, unit: 'each', stock_quantity: 40, low_stock_threshold: 10 },
      { category: 'Dairy',         name: 'Free Range Eggs 12pk',sku: 'DA-002', price: 7.50, cost_price: 4.50, unit: 'dozen',stock_quantity: 20, low_stock_threshold: 5  },
      { category: 'Dry Goods',     name: 'Jasmine Rice 5kg',    sku: 'DG-001', price: 12.99,cost_price: 7.00, unit: 'bag',  stock_quantity: 25, low_stock_threshold: 5  },
      { category: 'Dry Goods',     name: 'Pasta Penne 500g',    sku: 'DG-002', price: 2.50, cost_price: 1.20, unit: 'each', stock_quantity: 60, low_stock_threshold: 10 },
      { category: 'Bakery',        name: 'Sourdough Loaf',      sku: 'BK-001', price: 7.00, cost_price: 3.50, unit: 'each', stock_quantity: 10, low_stock_threshold: 3  },
      { category: 'Beverages',     name: 'Orange Juice 1L',     sku: 'BV-001', price: 5.50, cost_price: 2.80, unit: 'each', stock_quantity: 35, low_stock_threshold: 8  },
    ];

    const productIds = {};
    for (const p of products) {
      const [r] = await conn.execute(
        `INSERT INTO products
           (category_id, name, sku, price, cost_price, unit, stock_quantity, low_stock_threshold)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [catIds[p.category], p.name, p.sku, p.price, p.cost_price, p.unit, p.stock_quantity, p.low_stock_threshold]
      );
      productIds[p.sku] = r.insertId;
    }
    console.log(`  ✔  ${products.length} products\n`);

    // ── People ─────────────────────────────────────────────────────────────
    await conn.execute(
      "INSERT INTO people (type, name, email, phone) VALUES ('customer','John Smith','john@example.com','0411111111')"
    );
    await conn.execute(
      "INSERT INTO people (type, name, email, phone) VALUES ('supplier','Fresh Farms Co','supply@freshfarms.com','0422222222')"
    );
    console.log('  ✔  2 people (1 customer, 1 supplier)');

    await conn.commit();
    console.log('\n✅  Seed complete!\n');
    console.log('─── Login Accounts ─────────────────────────────────');
    for (const u of users) {
      console.log(`  [${u.role.toUpperCase()}]  ${u.email}  /  ${u.password}`);
    }
    console.log('────────────────────────────────────────────────────\n');
  } catch (err) {
    await conn.rollback();
    console.error('❌  Seed failed:', err.message);
    throw err;
  } finally {
    conn.release();
    pool.end();
  }
}

seed().catch(() => process.exit(1));