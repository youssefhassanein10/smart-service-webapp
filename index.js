const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Парсинг POST-запросов
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Статические файлы (HTML, JS, CSS)
app.use(express.static(path.join(__dirname)));

// Создаём папку uploads только если её нет
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Создаём базу данных SQLite
const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

// Создание таблиц, если их нет
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

// Роут для добавления категории
app.post('/add-category', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).send('Название категории обязательно');
  db.run('INSERT INTO categories(name) VALUES(?)', [name], function(err) {
    if (err) return res.status(500).send(err.message);
    res.json({ id: this.lastID, name });
  });
});

// Роут для добавления товара
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

// Роут для получения категорий
app.get('/categories', (req, res) => {
  db.all('SELECT * FROM categories', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Роут для получения товаров
app.get('/products', (req, res) => {
  db.all('SELECT * FROM products', (err, rows) => {
    if (err) return res.status(500).send(err.message);
    res.json(rows);
  });
});

// Отдача admin.html
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
