const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Папка для загрузки файлов
const uploadDir = path.join(__dirname, 'uploads');

// Создаём папку uploads, если её нет
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Раздаём статические файлы (HTML, JS, CSS)
app.use(express.static(__dirname));

// Файл с данными
const DATA_FILE = path.join(__dirname, 'data.json');

// Получить все данные
app.get('/api/data', (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(DATA_FILE));
        res.json(data);
    } else {
        res.json({ categories: [], products: [] });
    }
});

// Добавить категорию
app.post('/api/add-category', (req, res) => {
    const { name } = req.body;
    const data = fs.existsSync(DATA_FILE)
        ? JSON.parse(fs.readFileSync(DATA_FILE))
        : { categories: [], products: [] };

    const newCategory = { id: Date.now(), name };
    data.categories.push(newCategory);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    res.json({ success: true, category: newCategory });
});

// Добавить продукт
app.post('/api/add-product', upload.single('image'), (req, res) => {
    const { name, categoryId, price } = req.body;
    const image = req.file ? req.file.filename : null;

    const data = fs.existsSync(DATA_FILE)
        ? JSON.parse(fs.readFileSync(DATA_FILE))
        : { categories: [], products: [] };

    const newProduct = { id: Date.now(), name, categoryId, price, image };
    data.products.push(newProduct);
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

    res.json({ success: true, product: newProduct });
});

// Старт сервера
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
