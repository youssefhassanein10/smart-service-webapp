const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Статические файлы
app.use(express.static(path.join(__dirname)));

// Создаем папку uploads, если её нет
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// База данных SQLite
const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

// Создание таблиц
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price REAL,
    category_id INTEGER,
    image TEXT,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  )`);
});

// Роуты
app.post('/add-category', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).send('Название категории обязательно');
  db.run('INSERT INTO categories(name) VALUES(?)', [name], function(err) {
    if (err) return res.status(500).send(err.message);
    res.json({ id: this.lastID, name });
  });
});

app.post('/add-product', upload.single('image'), (req, res) => {
  const { name, price, category_id } = req.body;
  const image = req.file ? '/uploads/' + req.file.filename : null;
  if (!name || !price || !category_id) return res.status(400).send('Все поля обязательны');
  db.run('INSERT INTO products(name, price, category_id, image) VALUES(?,?,?,?)',
    [name, price, category_id, image],
    function(err) {
      if (err) return res.status(500).send(err.message);
      res.json({ id: this.lastID, name, price, category_id, image });
    }
  );
});

app.get('/categories', (req, res) => {
  db.all('SELECT * FROM categories', (err, rows) => err ? res.status(500).send(err.message) : res.json(rows));
});

app.get('/products', (req, res) => {
  db.all('SELECT * FROM products', (err, rows) => err ? res.status(500).send(err.message) : res.json(rows));
});

app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
