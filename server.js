const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = 'SUPER_SECRET_TOKEN';

// --- Настройка базы данных ---
const db = new sqlite3.Database('./data.db', err => {
  if (err) console.error(err);
});

// --- Создание таблиц ---
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY, name TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, title TEXT, description TEXT, price REAL, category_id INTEGER, image_url TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS store (id INTEGER PRIMARY KEY, name TEXT, inn TEXT, address TEXT, email TEXT, phone TEXT)`);
});

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Настройка multer для загрузки файлов ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- Проверка админа ---
function checkAdmin(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) return res.status(403).json({ error: 'Нет доступа' });
  next();
}

// --- API категорий ---
app.get('/api/categories', (req, res) => {
  db.all(`SELECT * FROM categories`, (err, rows) => res.json(rows));
});
app.post('/api/categories', checkAdmin, (req, res) => {
  db.run(`INSERT INTO categories (name) VALUES (?)`, [req.body.name], function() {
    res.json({ id: this.lastID, name: req.body.name });
  });
});

// --- API товаров ---
app.get('/api/products', (req, res) => {
  db.all(`SELECT * FROM products`, (err, rows) => res.json(rows));
});
app.post('/api/products', checkAdmin, upload.single('image'), (req, res) => {
  const { title, description, price, category_id } = req.body;
  const image_url = req.file ? '/uploads/' + req.file.filename : null;
  db.run(`INSERT INTO products (title, description, price, category_id, image_url) VALUES (?, ?, ?, ?, ?)`,
    [title, description, price, category_id, image_url], function() {
      res.json({ id: this.lastID });
    });
});

// --- API информации о магазине ---
app.get('/api/store', (req, res) => {
  db.get(`SELECT * FROM store WHERE id=1`, (err, row) => res.json(row || {}));
});
app.post('/api/store', checkAdmin, (req, res) => {
  db.run(`INSERT OR REPLACE INTO store (id, name, inn, address, email, phone) VALUES (1, ?, ?, ?, ?, ?)`,
    [req.body.name, req.body.inn, req.body.address, req.body.email, req.body.phone],
    () => res.json({ success:true }));
});

// --- Старт сервера ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
