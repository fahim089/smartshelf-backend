/**
 * SmartShelf v2 — Seed
 * Run: npm run seed
 *
 * ⚠️  Products & categories kept EXACTLY as listed.
 *     Existing product_images are NOT deleted — uploaded images are preserved.
 *     Adds: 10 customers, 5 suppliers, 12 sales, 10 purchases, 8 returns.
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

    // ── Clear transactional data only (preserve products, categories, images) ──
    await conn.execute('DELETE FROM return_items');
    await conn.execute('DELETE FROM returns');
    await conn.execute('DELETE FROM purchase_items');
    await conn.execute('DELETE FROM purchases');
    await conn.execute('DELETE FROM sale_items');
    await conn.execute('DELETE FROM sales');
    await conn.execute('DELETE FROM people');
    await conn.execute('DELETE FROM users');
    await conn.execute('ALTER TABLE users  AUTO_INCREMENT = 1');
    await conn.execute('ALTER TABLE people AUTO_INCREMENT = 1');
    console.log('  🗑   Cleared users, people, transactions (products & images preserved)\n');

    const rounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;

    // ── Users ──────────────────────────────────────────────────────────────
    const users = [
      { name: 'Admin User',  email: 'admin@demo.com', phone: '0400000001', role: 'admin', password: 'admin123' },
      { name: 'Staff Alice', email: 'alice@demo.com', phone: '0400000002', role: 'staff', password: 'staff123' },
      { name: 'Staff Bob',   email: 'bob@demo.com',   phone: '0400000003', role: 'staff', password: 'staff123' },
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

    // ── Categories — keep existing OR insert exact list ────────────────────
    const [existingCats] = await conn.execute('SELECT id, name FROM categories');
    let catIds = {};
    if (existingCats.length > 0) {
      existingCats.forEach(c => { catIds[c.name] = c.id; });
      console.log(`\n  ✔  ${existingCats.length} existing categories kept`);
    } else {
      const cats = [
        'Fresh Produce', 'Dairy & Eggs', 'Meat & Seafood',
        'Dry Goods', 'Bakery', 'Beverages', 'Snacks & Confectionery',
      ];
      for (const name of cats) {
        const [r] = await conn.execute('INSERT INTO categories (name) VALUES (?)', [name]);
        catIds[name] = r.insertId;
      }
      console.log(`\n  ✔  ${cats.length} categories created`);
    }

    // ── Products — keep existing OR insert exact list ──────────────────────
    const [existingProds] = await conn.execute('SELECT id, sku FROM products');
    let productIds = {};
    if (existingProds.length > 0) {
      existingProds.forEach(p => { productIds[p.sku] = p.id; });
      console.log(`  ✔  ${existingProds.length} existing products kept (images preserved)`);
    } else {
      const products = [
        { cat: 'Fresh Produce',          name: 'Granny Smith Apples',  sku: 'FP-001', price:  3.99, cost:  2.00, unit: 'kg',    stock: 50, threshold: 10 },
        { cat: 'Fresh Produce',          name: 'Baby Spinach 200g',    sku: 'FP-002', price:  3.50, cost:  1.80, unit: 'bag',   stock: 30, threshold:  8 },
        { cat: 'Fresh Produce',          name: 'Avocado Hass',         sku: 'FP-003', price:  2.50, cost:  1.20, unit: 'each',  stock: 45, threshold: 10 },
        { cat: 'Fresh Produce',          name: 'Bananas',              sku: 'FP-004', price:  2.99, cost:  1.50, unit: 'kg',    stock: 60, threshold: 15 },
        { cat: 'Dairy & Eggs',           name: 'Full Cream Milk 2L',   sku: 'DA-001', price:  3.20, cost:  1.90, unit: 'each',  stock: 40, threshold: 10 },
        { cat: 'Dairy & Eggs',           name: 'Free Range Eggs 12pk', sku: 'DA-002', price:  7.50, cost:  4.50, unit: 'dozen', stock: 20, threshold:  5 },
        { cat: 'Meat & Seafood',         name: 'Chicken Breast 500g',  sku: 'MS-001', price:  8.99, cost:  5.00, unit: 'pack',  stock: 25, threshold:  8 },
        { cat: 'Meat & Seafood',         name: 'Beef Mince 500g',      sku: 'MS-002', price:  9.50, cost:  5.50, unit: 'pack',  stock: 30, threshold: 10 },
        { cat: 'Dry Goods',              name: 'Jasmine Rice 5kg',     sku: 'DG-001', price: 12.99, cost:  7.00, unit: 'bag',   stock: 25, threshold:  5 },
        { cat: 'Dry Goods',              name: 'Pasta Penne 500g',     sku: 'DG-002', price:  2.50, cost:  1.20, unit: 'each',  stock: 60, threshold: 10 },
        { cat: 'Bakery',                 name: 'Sourdough Loaf',       sku: 'BK-001', price:  7.00, cost:  3.50, unit: 'each',  stock: 10, threshold:  3 },
        { cat: 'Bakery',                 name: 'Wholemeal Bread',      sku: 'BK-002', price:  5.00, cost:  2.50, unit: 'each',  stock: 15, threshold:  4 },
        { cat: 'Beverages',              name: 'Orange Juice 1L',      sku: 'BV-001', price:  5.50, cost:  2.80, unit: 'each',  stock: 35, threshold:  8 },
        { cat: 'Beverages',              name: 'Sparkling Water 1L',   sku: 'BV-002', price:  2.99, cost:  1.20, unit: 'each',  stock: 40, threshold: 10 },
        { cat: 'Snacks & Confectionery', name: 'Potato Chips 150g',    sku: 'SC-001', price:  4.50, cost:  2.00, unit: 'bag',   stock: 50, threshold: 15 },
      ];
      for (const p of products) {
        const [r] = await conn.execute(
          'INSERT INTO products (category_id, name, sku, price, cost_price, unit, stock_quantity, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [catIds[p.cat], p.name, p.sku, p.price, p.cost, p.unit, p.stock, p.threshold]
        );
        productIds[p.sku] = r.insertId;
      }
      console.log(`  ✔  ${products.length} products created`);
    }
    console.log('');

    const pid = (sku) => productIds[sku];
    const aliceId = userIds['alice@demo.com'];
    const bobId   = userIds['bob@demo.com'];
    const adminId = userIds['admin@demo.com'];

    const daysAgo = (d) => {
      const dt = new Date(); dt.setDate(dt.getDate() - d);
      return dt.toISOString().slice(0, 19).replace('T', ' ');
    };

    // ── People — 10 customers + 5 suppliers ───────────────────────────────
    const people = [
      { type: 'customer', name: 'John Smith',         email: 'john.smith@example.com',      phone: '0411 111 111', address: '12 King St, Sydney NSW 2000'           },
      { type: 'customer', name: 'Sarah Johnson',      email: 'sarah.j@example.com',          phone: '0422 222 222', address: '34 Queen Rd, Melbourne VIC 3000'        },
      { type: 'customer', name: 'Michael Chen',       email: 'mchen@example.com',            phone: '0433 333 333', address: '56 George Ave, Brisbane QLD 4000'       },
      { type: 'customer', name: 'Emily Wilson',       email: 'emily.w@example.com',          phone: '0444 444 444', address: '78 Market Ln, Perth WA 6000'            },
      { type: 'customer', name: 'David Brown',        email: 'david.b@example.com',          phone: '0455 555 555', address: '90 Collins St, Adelaide SA 5000'        },
      { type: 'customer', name: 'Lisa Nguyen',        email: 'lisa.n@example.com',           phone: '0466 666 666', address: '23 Flinders St, Melbourne VIC 3001'     },
      { type: 'customer', name: 'James Taylor',       email: 'james.t@example.com',          phone: '0477 777 777', address: '45 Pitt St, Sydney NSW 2001'            },
      { type: 'customer', name: 'Anna Martinez',      email: 'anna.m@example.com',           phone: '0488 888 888', address: '67 Elizabeth St, Hobart TAS 7000'       },
      { type: 'customer', name: 'Chris Anderson',     email: 'chris.a@example.com',          phone: '0499 999 999', address: '89 Mitchell St, Darwin NT 0800'         },
      { type: 'customer', name: 'Jessica Lee',        email: 'jessica.l@example.com',        phone: '0400 100 200', address: '11 London Circuit, Canberra ACT 2600'   },
      { type: 'supplier', name: 'Fresh Farms Co',        email: 'orders@freshfarms.com.au',  phone: '02 9000 1111', address: '100 Farm Rd, Penrith NSW 2750'          },
      { type: 'supplier', name: 'Metro Wholesale Foods',  email: 'supply@metrowholesale.com',phone: '03 9000 2222', address: '200 Warehouse Dr, Dandenong VIC 3175'   },
      { type: 'supplier', name: 'Pacific Seafood Co',     email: 'fish@pacificseafood.com',  phone: '07 9000 3333', address: '300 Harbour Rd, Cairns QLD 4870'        },
      { type: 'supplier', name: 'Aussie Dairy Direct',    email: 'dairy@aussiedirect.com',   phone: '08 9000 4444', address: '400 Pastoral Way, Shepparton VIC 3630'  },
      { type: 'supplier', name: 'Golden Grain Traders',   email: 'grains@goldengrain.com',   phone: '02 9000 5555', address: '500 Mill St, Wagga Wagga NSW 2650'      },
    ];
    const personIds = {};
    for (const p of people) {
      const [r] = await conn.execute(
        'INSERT INTO people (type, name, email, phone, address) VALUES (?, ?, ?, ?, ?)',
        [p.type, p.name, p.email, p.phone, p.address]
      );
      personIds[p.name] = r.insertId;
    }
    console.log(`  ✔  10 customers + 5 suppliers`);

    // ── Sales — 12 ───────────────────────────────────────────────────────
    const salesData = [
      { staff_id: aliceId, customer_id: 'John Smith',     note: 'Weekly grocery order',       created_at: daysAgo(1),  items: [{ sku:'FP-001',qty:2,price:3.99},{ sku:'DA-001',qty:1,price:3.20},{ sku:'BK-001',qty:1,price:7.00}] },
      { staff_id: aliceId, customer_id: 'Sarah Johnson',  note: null,                         created_at: daysAgo(2),  items: [{ sku:'DA-002',qty:2,price:7.50},{ sku:'FP-002',qty:1,price:3.50}] },
      { staff_id: aliceId, customer_id: 'Michael Chen',   note: 'Bulk rice purchase',         created_at: daysAgo(3),  items: [{ sku:'DG-001',qty:3,price:12.99},{ sku:'DG-002',qty:4,price:2.50},{ sku:'BV-001',qty:2,price:5.50}] },
      { staff_id: aliceId, customer_id: null,              note: 'Walk-in customer',           created_at: daysAgo(4),  items: [{ sku:'SC-001',qty:3,price:4.50},{ sku:'BV-002',qty:2,price:2.99}] },
      { staff_id: aliceId, customer_id: 'Emily Wilson',   note: null,                         created_at: daysAgo(5),  items: [{ sku:'MS-001',qty:2,price:8.99},{ sku:'MS-002',qty:1,price:9.50},{ sku:'FP-003',qty:3,price:2.50}] },
      { staff_id: aliceId, customer_id: 'David Brown',    note: null,                         created_at: daysAgo(7),  items: [{ sku:'FP-004',qty:2,price:2.99},{ sku:'DA-001',qty:2,price:3.20},{ sku:'BK-002',qty:1,price:5.00}] },
      { staff_id: bobId,   customer_id: 'Lisa Nguyen',    note: 'Regular customer',           created_at: daysAgo(1),  items: [{ sku:'FP-001',qty:1,price:3.99},{ sku:'FP-002',qty:2,price:3.50},{ sku:'DA-002',qty:1,price:7.50}] },
      { staff_id: bobId,   customer_id: 'James Taylor',   note: null,                         created_at: daysAgo(2),  items: [{ sku:'MS-001',qty:3,price:8.99},{ sku:'DG-002',qty:2,price:2.50}] },
      { staff_id: bobId,   customer_id: 'Anna Martinez',  note: 'Birthday party supplies',    created_at: daysAgo(3),  items: [{ sku:'BV-001',qty:4,price:5.50},{ sku:'SC-001',qty:5,price:4.50},{ sku:'BK-001',qty:2,price:7.00}] },
      { staff_id: bobId,   customer_id: 'Chris Anderson', note: null,                         created_at: daysAgo(6),  items: [{ sku:'DG-001',qty:2,price:12.99},{ sku:'FP-004',qty:3,price:2.99}] },
      { staff_id: bobId,   customer_id: null,              note: null,                         created_at: daysAgo(8),  items: [{ sku:'BV-002',qty:6,price:2.99},{ sku:'SC-001',qty:2,price:4.50}] },
      { staff_id: adminId, customer_id: 'Jessica Lee',    note: 'VIP customer order',         created_at: daysAgo(1),  items: [{ sku:'MS-001',qty:2,price:8.99},{ sku:'MS-002',qty:2,price:9.50},{ sku:'DA-002',qty:2,price:7.50},{ sku:'FP-001',qty:3,price:3.99}] },
    ];

    for (const sale of salesData) {
      const total = sale.items.reduce((s, it) => s + it.price * it.qty, 0);
      const custId = sale.customer_id ? personIds[sale.customer_id] : null;
      const [sr] = await conn.execute(
        'INSERT INTO sales (staff_id, customer_id, total_amount, note, created_at) VALUES (?, ?, ?, ?, ?)',
        [sale.staff_id, custId, total.toFixed(2), sale.note, sale.created_at]
      );
      for (const item of sale.items) {
        const sub = (item.price * item.qty).toFixed(2);
        await conn.execute(
          'INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
          [sr.insertId, pid(item.sku), item.qty, item.price, sub]
        );
        await conn.execute('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.qty, pid(item.sku)]);
      }
    }
    console.log(`  ✔  ${salesData.length} sales`);

    // ── Purchases — 10 ───────────────────────────────────────────────────
    const purchasesData = [
      { staff_id: aliceId, supplier: 'Fresh Farms Co',        note: 'Weekly produce restock',    created_at: daysAgo(2),  items: [{ sku:'FP-001',qty:100,cost:2.00},{ sku:'FP-002',qty:60,cost:1.80},{ sku:'FP-003',qty:80,cost:1.20},{ sku:'FP-004',qty:120,cost:1.50}] },
      { staff_id: aliceId, supplier: 'Aussie Dairy Direct',   note: 'Dairy delivery',            created_at: daysAgo(3),  items: [{ sku:'DA-001',qty:80,cost:1.90},{ sku:'DA-002',qty:40,cost:4.50}] },
      { staff_id: bobId,   supplier: 'Pacific Seafood Co',    note: 'Meat & seafood order',      created_at: daysAgo(4),  items: [{ sku:'MS-001',qty:50,cost:5.00},{ sku:'MS-002',qty:60,cost:5.50}] },
      { staff_id: bobId,   supplier: 'Golden Grain Traders',  note: 'Dry goods bulk order',      created_at: daysAgo(5),  items: [{ sku:'DG-001',qty:40,cost:7.00},{ sku:'DG-002',qty:100,cost:1.20}] },
      { staff_id: aliceId, supplier: 'Metro Wholesale Foods', note: 'Bakery supplies',           created_at: daysAgo(6),  items: [{ sku:'BK-001',qty:30,cost:3.50},{ sku:'BK-002',qty:40,cost:2.50}] },
      { staff_id: bobId,   supplier: 'Fresh Farms Co',        note: 'Beverage restock',          created_at: daysAgo(7),  items: [{ sku:'BV-001',qty:60,cost:2.80},{ sku:'BV-002',qty:80,cost:1.20}] },
      { staff_id: aliceId, supplier: 'Metro Wholesale Foods', note: 'Snacks top-up',             created_at: daysAgo(9),  items: [{ sku:'SC-001',qty:100,cost:2.00}] },
      { staff_id: adminId, supplier: 'Fresh Farms Co',        note: 'Emergency produce order',   created_at: daysAgo(1),  items: [{ sku:'FP-001',qty:50,cost:2.00},{ sku:'FP-004',qty:50,cost:1.50}] },
      { staff_id: bobId,   supplier: 'Aussie Dairy Direct',   note: 'Extra dairy stock',         created_at: daysAgo(10), items: [{ sku:'DA-001',qty:40,cost:1.90},{ sku:'DA-002',qty:20,cost:4.50}] },
      { staff_id: aliceId, supplier: 'Golden Grain Traders',  note: 'Monthly grain order',       created_at: daysAgo(14), items: [{ sku:'DG-001',qty:50,cost:7.00},{ sku:'DG-002',qty:80,cost:1.20}] },
    ];

    for (const pur of purchasesData) {
      const total = pur.items.reduce((s, it) => s + it.cost * it.qty, 0);
      const suppId = personIds[pur.supplier];
      const [pr] = await conn.execute(
        'INSERT INTO purchases (staff_id, supplier_id, total_amount, note, created_at) VALUES (?, ?, ?, ?, ?)',
        [pur.staff_id, suppId, total.toFixed(2), pur.note, pur.created_at]
      );
      for (const item of pur.items) {
        const sub = (item.cost * item.qty).toFixed(2);
        await conn.execute(
          'INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
          [pr.insertId, pid(item.sku), item.qty, item.cost, sub]
        );
        await conn.execute('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.qty, pid(item.sku)]);
      }
    }
    console.log(`  ✔  ${purchasesData.length} purchases`);

    // ── Returns — 8 ──────────────────────────────────────────────────────
    const returnsData = [
      { staff_id: aliceId, status: 'approved', reason: 'Customer changed mind — unused items',                  created_at: daysAgo(3), items: [{ sku:'SC-001',qty:2,price:4.50},{ sku:'BV-002',qty:1,price:2.99}] },
      { staff_id: bobId,   status: 'approved', reason: 'Damaged packaging on delivery',                         created_at: daysAgo(5), items: [{ sku:'DA-001',qty:1,price:3.20}] },
      { staff_id: aliceId, status: 'approved', reason: 'Wrong product picked — customer returned',              created_at: daysAgo(7), items: [{ sku:'BK-001',qty:1,price:7.00}] },
      { staff_id: bobId,   status: 'approved', reason: 'Product near expiry — not suitable for sale',           created_at: daysAgo(9), items: [{ sku:'FP-002',qty:3,price:3.50}] },
      { staff_id: aliceId, status: 'rejected', reason: 'Customer claims wrong quantity but stock checks out',   created_at: daysAgo(4), items: [{ sku:'DG-001',qty:1,price:12.99}] },
      { staff_id: bobId,   status: 'rejected', reason: 'Product opened — cannot return',                        created_at: daysAgo(6), items: [{ sku:'MS-001',qty:1,price:8.99}] },
      { staff_id: aliceId, status: 'pending',  reason: 'Customer unhappy with freshness of produce',            created_at: daysAgo(1), items: [{ sku:'FP-001',qty:2,price:3.99},{ sku:'FP-003',qty:1,price:2.50}] },
      { staff_id: bobId,   status: 'pending',  reason: 'Incorrect price charged — needs review',                created_at: daysAgo(2), items: [{ sku:'DA-002',qty:1,price:7.50},{ sku:'BV-001',qty:1,price:5.50}] },
    ];

    for (const ret of returnsData) {
      const total = ret.items.reduce((s, it) => s + it.price * it.qty, 0);
      const [rr] = await conn.execute(
        'INSERT INTO returns (staff_id, total_amount, reason, status, created_at) VALUES (?, ?, ?, ?, ?)',
        [ret.staff_id, total.toFixed(2), ret.reason, ret.status, ret.created_at]
      );
      for (const item of ret.items) {
        const sub = (item.price * item.qty).toFixed(2);
        await conn.execute(
          'INSERT INTO return_items (return_id, product_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
          [rr.insertId, pid(item.sku), item.qty, item.price, sub]
        );
        if (ret.status === 'approved') {
          await conn.execute('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.qty, pid(item.sku)]);
        }
      }
    }
    console.log(`  ✔  ${returnsData.length} returns  (4 approved · 2 rejected · 2 pending)\n`);

    await conn.commit();

    console.log('✅  Seed complete!\n');
    console.log('─── Login Accounts ──────────────────────────────────────────');
    for (const u of users) {
      console.log(`  [${u.role.toUpperCase().padEnd(5)}]  ${u.email.padEnd(22)} / ${u.password}`);
    }
    console.log('─────────────────────────────────────────────────────────────');
    console.log('  Categories : 7  (exact list preserved)');
    console.log('  Products   : 15 (images preserved)');
    console.log('  Customers  : 10');
    console.log('  Suppliers  : 5');
    console.log('  Sales      : 12');
    console.log('  Purchases  : 10');
    console.log('  Returns    : 8  (4 approved · 2 rejected · 2 pending)');
    console.log('─────────────────────────────────────────────────────────────\n');

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