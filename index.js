// index.js — полностью рабочий сервер для Telegram Mini App магазина
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite'); // async open
const { stringify } = require('csv-stringify/sync');
const { v4: uuidv4 } = require('uuid');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '012127471266Jo@';
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.sqlite');

(async () => {
  // ensure uploads dir
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

  // multer storage
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, unique + ext);
    }
  });
  const upload = multer({ storage });

  // open sqlite (async)
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

  // simple in-memory session store for admin tokens
  const adminSessions = new Set();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // serve uploads and static public
  app.use('/uploads', express.static(uploadsDir));
  app.use(express.static(path.join(__dirname, 'public')));

  // --- Auth endpoints ---
  // login with password -> returns token
  app.post('/api/login', (req, res) => {
    const { password } = req.body || {};
    if (password && password === ADMIN_PASSWORD) {
      const token = uuidv4();
      adminSessions.add(token);
      // token valid until server restarts (simple approach)
      res.json({ success: true, token });
    } else {
      res.status(401).json({ success: false, message: 'Invalid password' });
    }
  });

  // logout (optional)
  app.post('/api/logout', (req, res) => {
    const token = req.headers['x-admin-token'] || req.body.token;
    if (token && adminSessions.has(token)) {
      adminSessions.delete(token);
    }
    res.json({ success: true });
  });

  // requireAdmin middleware:
  // accepts x-admin-token (session token) OR x-admin-pass (legacy password)
  function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    const pass = req.headers['x-admin-pass'] || req.body.admin_pass;
    if (token && adminSessions.has(token)) return next();
    if (pass && pass === ADMIN_PASSWORD) return next();
    return res.status(401).json({ error: 'admin auth required' });
  }

  // --- PRODUCTS ---
  app.get('/api/products', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM products ORDER BY created_at DESC');
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const p = await db.get('SELECT * FROM products WHERE id = ?', req.params.id);
      if (!p) return res.status(404).json({ error: 'not found' });
      res.json(p);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.post('/api/products', requireAdmin, async (req, res) => {
    try {
      const { title, description = '', price = 0, sku = '', image_url = '' } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });
      const id = uuidv4();
      await db.run(
        `INSERT INTO products(id,title,description,price,sku,image_url) VALUES(?,?,?,?,?,?)`,
        [id, title, description, Number(price), sku, image_url]
      );
      const p = await db.get('SELECT * FROM products WHERE id = ?', id);
      res.json(p);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.put('/api/products/:id', requireAdmin, async (req, res) => {
    try {
      const { title, description, price, sku, image_url } = req.body;
      const id = req.params.id;
      await db.run(
        `UPDATE products SET title = COALESCE(?,title), description = COALESCE(?,description),
        price = COALESCE(?,price), sku = COALESCE(?,sku), image_url = COALESCE(?,image_url) WHERE id = ?`,
        [title, description, price ? Number(price) : null, sku, image_url, id]
      );
      const p = await db.get('SELECT * FROM products WHERE id = ?', id);
      res.json(p);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    try {
      await db.run('DELETE FROM products WHERE id = ?', req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  // --- UPLOAD ---
  app.post('/api/upload', requireAdmin, upload.single('image'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'no file' });
      const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
      res.json({ url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'upload error' });
    }
  });

  // --- PAYMENT METHODS ---
  app.get('/api/payments', async (req, res) => {
    try {
      const rows = await db.all('SELECT * FROM payment_methods');
      // parse details JSON safely
      const parsed = rows.map(r => {
        let details = r.details;
        try { details = details ? JSON.parse(details) : {}; } catch (e) { details = r.details; }
        return { ...r, details };
      });
      res.json(parsed);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.post('/api/payments', requireAdmin, async (req, res) => {
    try {
      const { name, type = 'other', details = {}, enabled = 1 } = req.body;
      if (!name) return res.status(400).json({ error: 'name required' });
      const id = uuidv4();
      await db.run(
        'INSERT INTO payment_methods(id,name,type,details,enabled) VALUES(?,?,?,?,?)',
        [id, name, type, JSON.stringify(details || {}), enabled ? 1 : 0]
      );
      const pm = await db.get('SELECT * FROM payment_methods WHERE id = ?', id);
      pm.details = details;
      res.json(pm);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.put('/api/payments/:id', requireAdmin, async (req, res) => {
    try {
      const { name, type, details, enabled } = req.body;
      const id = req.params.id;
      await db.run(
        'UPDATE payment_methods SET name = COALESCE(?,name), type = COALESCE(?,type), details = COALESCE(?,details), enabled = COALESCE(?,enabled) WHERE id = ?',
        [name, type, details ? JSON.stringify(details) : undefined, enabled === undefined ? undefined : enabled ? 1 : 0, id]
      );
      const pm = await db.get('SELECT * FROM payment_methods WHERE id = ?', id);
      try { pm.details = pm.details ? JSON.parse(pm.details) : {}; } catch (e) { /* keep raw */ }
      res.json(pm);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.delete('/api/payments/:id', requireAdmin, async (req, res) => {
    try {
      await db.run('DELETE FROM payment_methods WHERE id = ?', req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  // --- ORDERS ---
  app.post('/api/orders', async (req, res) => {
    try {
      const {
        product_id = null,
        amount,
        payment_method_id = null,
        payment_details = {},
        customer_contact = '',
        admin_contact = ''
      } = req.body;
      if (amount === undefined || amount === null) return res.status(400).json({ error: 'amount required' });
      const id = uuidv4();
      await db.run(
        'INSERT INTO orders(id,product_id,amount,payment_method_id,payment_details,customer_contact,admin_contact) VALUES(?,?,?,?,?,?,?)',
        [id, product_id, Number(amount), payment_method_id, JSON.stringify(payment_details || {}), customer_contact, admin_contact]
      );
      const ord = await db.get('SELECT * FROM orders WHERE id = ?', id);
      ord.payment_details = ord.payment_details ? JSON.parse(ord.payment_details) : {};
      res.json(ord);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.get('/api/orders', requireAdmin, async (req, res) => {
    try {
      const { from, to, method } = req.query;
      let sql = 'SELECT * FROM orders WHERE 1=1';
      const params = [];
      if (from) { sql += ' AND date(created_at) >= date(?)'; params.push(from); }
      if (to) { sql += ' AND date(created_at) <= date(?)'; params.push(to); }
      if (method) { sql += ' AND payment_method_id = ?'; params.push(method); }
      sql += ' ORDER BY created_at DESC';
      const rows = await db.all(sql, params);
      const parsed = rows.map(r => ({ ...r, payment_details: r.payment_details ? JSON.parse(r.payment_details) : {} }));
      res.json(parsed);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.get('/api/orders/:id', requireAdmin, async (req, res) => {
    try {
      const ord = await db.get('SELECT * FROM orders WHERE id = ?', req.params.id);
      if (!ord) return res.status(404).json({ error: 'not found' });
      ord.payment_details = ord.payment_details ? JSON.parse(ord.payment_details) : {};
      res.json(ord);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.put('/api/orders/:id', requireAdmin, async (req, res) => {
    try {
      const id = req.params.id;
      const { amount, payment_method_id, payment_details, customer_contact, admin_contact } = req.body;
      await db.run(
        `UPDATE orders SET amount = COALESCE(?,amount),
         payment_method_id = COALESCE(?,payment_method_id),
         payment_details = COALESCE(?,payment_details),
         customer_contact = COALESCE(?,customer_contact),
         admin_contact = COALESCE(?,admin_contact)
         WHERE id = ?`,
        [amount !== undefined ? Number(amount) : undefined, payment_method_id, payment_details ? JSON.stringify(payment_details) : undefined, customer_contact, admin_contact, id]
      );
      const ord = await db.get('SELECT * FROM orders WHERE id = ?', id);
      ord.payment_details = ord.payment_details ? JSON.parse(ord.payment_details) : {};
      res.json(ord);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
    try {
      await db.run('DELETE FROM orders WHERE id = ?', req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  // --- REPORTS ---
  app.get('/api/reports', requireAdmin, async (req, res) => {
    try {
      const { from, to, group_by } = req.query;
      let sql = 'SELECT * FROM orders WHERE 1=1';
      const params = [];
      if (from) { sql += ' AND datetime(created_at) >= datetime(?)'; params.push(from); }
      if (to) { sql += ' AND datetime(created_at) <= datetime(?)'; params.push(to); }
      const rows = await db.all(sql, params);
      const parsed = rows.map(r => ({ ...r, payment_details: r.payment_details ? JSON.parse(r.payment_details) : {} }));
      const stats = {};
      parsed.forEach(p => {
        const m = p.payment_method_id || 'unknown';
        if (!stats[m]) stats[m] = { count: 0, sum: 0 };
        stats[m].count += 1;
        stats[m].sum += Number(p.amount);
      });
      res.json({ rows: parsed, stats });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  app.get('/api/reports/csv', requireAdmin, async (req, res) => {
    try {
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
        };
      });
      const csv = stringify(out, { header: true });
      res.header('Content-Type', 'text/csv');
      res.attachment('report.csv');
      res.send(csv);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'db error' });
    }
  });

  // SPA fallback: всегда открывать магазин (shop.html)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shop.html'));
  });

  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
})();
