const express = require('express');
const path = require('path');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Папка для загрузки файлов
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// Раздача статических файлов
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// База данных
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error(err);
    else console.log('Connected to SQLite database.');
});

// Создание таблиц, если их нет
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        image TEXT
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

// Маршруты для HTML
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/shop.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shop.html'));
});

// Добавление категории
app.post('/add-category', upload.single('image'), (req, res) => {
    const { name } = req.body;
    const image = req.file ? req.file.filename : null;
    db.run(`INSERT INTO categories (name, image) VALUES (?, ?)`, [name, image], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, image });
    });
});

// Добавление товара
app.post('/add-product', upload.single('image'), (req, res) => {
    const { name, price, category_id } = req.body;
    const image = req.file ? req.file.filename : null;
    db.run(`INSERT INTO products (name, price, category_id, image) VALUES (?, ?, ?, ?)`,
        [name, price, category_id, image], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, name, price, category_id, image });
        });
});

// Получение категорий
app.get('/categories', (req, res) => {
    db.all(`SELECT * FROM categories`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Получение товаров
app.get('/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Раздача загруженных файлов
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
