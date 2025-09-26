// index.js — полностью рабочий сервер для вашего ТЗ
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { stringify } = require('csv-stringify/sync');
const { v4: uuidv4 } = require('uuid');
npm install express multer cors sqlite3 sqlite csv-stringify uuid

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.sqlite');

(async () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ensure uploads dir
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, unique + ext);
    }
  });
  const upload = multer({ storage });

  // open sqlite
  const db = await open({
    filename: DB_FILE,
    driver: sqlite3.Database
  });

  // init tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      price INTEGER,
      sku TEXT,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      details TEXT,
      enabled INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      product_id TEXT,
      amount INTEGER,
      payment_method_id TEXT,
      payment_details TEXT,
      customer_contact TEXT,
      admin_contact TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // helper: admin middleware
  function requireAdmin(req, res, next) {
    const pass = req.headers['x-admin-pass'] || req.body.admin_pass;
    if (pass && pass === ADMIN_PASSWORD) return next();
    return res.status(401).json({ error: 'admin auth required' });
  }

  // static & public
  app.use('/uploads', express.static(uploadsDir));
  app.use(express.static(path.join(__dirname, 'public')));

  // PRODUCTS
  app.get('/api/products', async (req, res) => {
    const rows = await db.all('SELECT * FROM products ORDER BY created_at DESC');
    res.json(rows);
  });

  app.get('/api/products/:id', async (req, res) => {
    const p = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    res.json(p);
  });

  app.post('/api/products', requireAdmin, async (req, res) => {
    const { title, description = '', price = 0, sku = '', image_url = '' } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const id = uuidv4();
    await db.run(`INSERT INTO products(id,title,description,price,sku,image_url) VALUES(?,?,?,?,?,?)`,
      [id, title, description, Number(price), sku, image_url]);
    const p = await db.get('SELECT * FROM products WHERE id = ?', id);
    res.json(p);
  });

  app.put('/api/products/:id', requireAdmin, async (req, res) => {
    const { title, description, price, sku, image_url } = req.body;
    const id = req.params.id;
    await db.run(`UPDATE products SET title = COALESCE(?,title), description = COALESCE(?,description),
      price = COALESCE(?,price), sku = COALESCE(?,sku), image_url = COALESCE(?,image_url) WHERE id = ?`,
      [title, description, price ? Number(price) : null, sku, image_url, id]);
    const p = await db.get('SELECT * FROM products WHERE id = ?', id);
    res.json(p);
  });

  app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    await db.run('DELETE FROM products WHERE id = ?', id);
    res.json({ ok: true });
  });

  // UPLOAD
  app.post('/api/upload', upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ url });
  });

  // PAYMENT METHODS
  app.get('/api/payments', async (req, res) => {
    const rows = await db.all('SELECT * FROM payment_methods');
    res.json(rows);
  });

  app.post('/api/payments', requireAdmin, async (req, res) => {
    const { name, type, details, enabled = 1 } = req.body;
    const id = uuidv4();
    await db.run('INSERT INTO payment_methods(id,name,type,details,enabled) VALUES(?,?,?,?,?)',
      [id, name, type, JSON.stringify(details || {}), enabled ? 1 : 0]);
    const pm = await db.get('SELECT * FROM payment_methods WHERE id = ?', id);
    res.json(pm);
  });

  app.put('/api/payments/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const { name, type, details, enabled } = req.body;
    await db.run('UPDATE payment_methods SET name = COALESCE(?,name), type = COALESCE(?,type), details = COALESCE(?,details), enabled = COALESCE(?,enabled) WHERE id = ?',
      [name, type, details ? JSON.stringify(details) : undefined, enabled === undefined ? undefined : enabled ? 1 : 0, id]);
    const pm = await db.get('SELECT * FROM payment_methods WHERE id = ?', id);
    res.json(pm);
  });

  app.delete('/api/payments/:id', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM payment_methods WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  // ORDERS
  app.post('/api/orders', async (req, res) => {
    // public: create order (e.g. buyer or admin)
    const { product_id = null, amount, payment_method_id = null, payment_details = {}, customer_contact = '', admin_contact = '' } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount required' });
    const id = uuidv4();
    await db.run('INSERT INTO orders(id,product_id,amount,payment_method_id,payment_details,customer_contact,admin_contact) VALUES(?,?,?,?,?,?,?)',
      [id, product_id, Number(amount), payment_method_id, JSON.stringify(payment_details || {}), customer_contact, admin_contact]);
    const ord = await db.get('SELECT * FROM orders WHERE id = ?', id);
    res.json(ord);
  });

  // admin list orders with filters
  app.get('/api/orders', requireAdmin, async (req, res) => {
    const { from, to, method } = req.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (from) { sql += ' AND date(created_at) >= date(?)'; params.push(from); }
    if (to) { sql += ' AND date(created_at) <= date(?)'; params.push(to); }
    if (method) { sql += ' AND payment_method_id = ?'; params.push(method); }
    sql += ' ORDER BY created_at DESC';
    const rows = await db.all(sql, params);
    res.json(rows.map(r => ({ ...r, payment_details: JSON.parse(r.payment_details || '{}') })));
  });

  app.get('/api/orders/:id', requireAdmin, async (req, res) => {
    const ord = await db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
    if (!ord) return res.status(404).json({ error: 'not found' });
    ord.payment_details = JSON.parse(ord.payment_details || '{}');
    res.json(ord);
  });

  app.put('/api/orders/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const { amount, payment_method_id, payment_details, customer_contact, admin_contact } = req.body;
    await db.run(`UPDATE orders SET amount = COALESCE(?,amount),
      payment_method_id = COALESCE(?,payment_method_id),
      payment_details = COALESCE(?,payment_details),
      customer_contact = COALESCE(?,customer_contact),
      admin_contact = COALESCE(?,admin_contact)
      WHERE id = ?`,
      [amount ? Number(amount) : undefined, payment_method_id, payment_details ? JSON.stringify(payment_details) : undefined, customer_contact, admin_contact, id]);
    const ord = await db.get('SELECT * FROM orders WHERE id = ?', id);
    ord.payment_details = JSON.parse(ord.payment_details || '{}');
    res.json(ord);
  });

  app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM orders WHERE id = ?', req.params.id);
    res.json({ ok: true });
  });

  // REPORTS
  app.get('/api/reports', requireAdmin, async (req, res) => {
    const { from, to, group_by } = req.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (from) { sql += ' AND datetime(created_at) >= datetime(?)'; params.push(from); }
    if (to) { sql += ' AND datetime(created_at) <= datetime(?)'; params.push(to); }
    const rows = await db.all(sql, params);
    const parsed = rows.map(r => ({ ...r, payment_details: JSON.parse(r.payment_details || '{}') }));
    // simple stats by method
    const stats = {};
    parsed.forEach(p => {
      const m = p.payment_method_id || 'unknown';
      if (!stats[m]) stats[m] = { count: 0, sum: 0 };
      stats[m].count += 1;
      stats[m].sum += Number(p.amount);
    });
    res.json({ rows: parsed, stats });
  });

  app.get('/api/reports/csv', requireAdmin, async (req, res) => {
    const { from, to } = req.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (from) { sql += ' AND datetime(created_at) >= datetime(?)'; params.push(from); }
    if (to) { sql += ' AND datetime(created_at) <= datetime(?)'; params.push(to); }
    const rows = await db.all(sql, params);
    const out = rows.map(r => {
      const d = new Date(r.created_at);
      return {
        date: d.toISOString().split('T')[0],
        time: d.toISOString().split('T')[1].split('.')[0],
        amount: r.amount,
        method: r.payment_method_id,
        details: r.payment_details,
        customer: r.customer_contact
      }
    });
    const csv = stringify(out, { header: true });
    res.header('Content-Type', 'text/csv');
    res.attachment('report.csv');
    res.send(csv);
  });

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shop.html')); // default to shop
  });

  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
})();
