const express = require('express');
const fileUpload = require('express-fileupload');
const { Pool } = require('pg');
const path = require('path');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static('public'));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

// Переменная для хранения подключения к БД
let pool = null;

// Функция подключения к базе данных
async function connectDatabase() {
    try {
        const databaseUrl = process.env.DATABASE_URL;
        
        if (!databaseUrl) {
            console.log('⚠️ DATABASE_URL не найден. Режим без базы данных.');
            return null;
        }

        pool = new Pool({
            connectionString: databaseUrl,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 30000,
            max: 10
        });

        // Проверяем подключение
        const client = await pool.connect();
        console.log('✅ Подключение к базе данных установлено');
        
        // Создаем таблицы если их нет
        await client.query(`
            CREATE TABLE IF NOT EXISTS shop_settings (
                id SERIAL PRIMARY KEY,
                shop_name VARCHAR(255) DEFAULT 'Smart Service',
                holder_name VARCHAR(255),
                inn VARCHAR(50),
                registration_address TEXT,
                organization_address TEXT,
                email VARCHAR(255),
                phone VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                image_url VARCHAR(500),
                sort_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS services (
                id SERIAL PRIMARY KEY,
                article VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price DECIMAL(10,2) NOT NULL,
                category_id INTEGER REFERENCES categories(id),
                image_url VARCHAR(500),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Проверяем есть ли начальные данные
        const result = await client.query('SELECT COUNT(*) FROM shop_settings');
        if (parseInt(result.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO shop_settings (shop_name, holder_name, inn, registration_address, organization_address, email, phone) 
                VALUES ('Smart Service', 'Ваше имя', '1234567890', 'Адрес регистрации', 'Адрес организации', 'email@example.com', '+79991234567')
            `);
            console.log('✅ Начальные данные добавлены');
        }

        client.release();
        return pool;
    } catch (error) {
        console.error('❌ Ошибка подключения к базе данных:', error.message);
        return null;
    }
}

// API Routes

// Получить настройки магазина
app.get('/api/shop-settings', async (req, res) => {
    try {
        if (!pool) {
            return res.json({
                shop_name: 'Smart Service',
                holder_name: 'Ваше имя',
                inn: '1234567890',
                registration_address: 'Адрес регистрации',
                organization_address: 'Адрес организации',
                email: 'email@example.com',
                phone: '+79991234567'
            });
        }

        const result = await pool.query('SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1');
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json({});
        }
    } catch (error) {
        console.error('Ошибка получения настроек:', error);
        res.status(500).json({ error: error.message });
    }
});

// Сохранить настройки магазина
app.post('/api/shop-settings', async (req, res) => {
    console.log('📨 Получен запрос на сохранение настроек:', req.body);
    
    try {
        const { 
            shop_name, 
            holder_name, 
            inn, 
            registration_address, 
            organization_address, 
            email, 
            phone 
        } = req.body;

        // Валидация
        if (!shop_name || !holder_name) {
            return res.status(400).json({ error: 'Название магазина и имя держателя обязательны' });
        }

        if (!pool) {
            return res.status(500).json({ error: 'База данных не подключена' });
        }

        // Удаляем старые настройки и добавляем новые
        await pool.query('DELETE FROM shop_settings');
        
        const result = await pool.query(
            `INSERT INTO shop_settings 
             (shop_name, holder_name, inn, registration_address, organization_address, email, phone) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING *`,
            [shop_name, holder_name, inn, registration_address, organization_address, email, phone]
        );

        console.log('✅ Настройки сохранены:', result.rows[0]);
        res.json(result.rows[0]);
        
    } catch (error) {
        console.error('❌ Ошибка сохранения настроек:', error);
        res.status(500).json({ error: error.message });
    }
});

// API для услуг
app.get('/api/services', async (req, res) => {
    try {
        if (!pool) {
            return res.json([]);
        }

        const result = await pool.query(`
            SELECT s.*, c.name as category_name 
            FROM services s 
            LEFT JOIN categories c ON s.category_id = c.id 
            WHERE s.is_active = true 
            ORDER BY s.name
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/services', async (req, res) => {
    try {
        const { article, name, description, price, category_id } = req.body;
        
        if (!pool) {
            return res.status(500).json({ error: 'База данных не подключена' });
        }

        const result = await pool.query(
            `INSERT INTO services (article, name, description, price, category_id) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING *`,
            [article, name, description, parseFloat(price), category_id]
        );

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API для категорий
app.get('/api/categories', async (req, res) => {
    try {
        if (!pool) {
            return res.json([]);
        }

        const result = await pool.query('SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, name');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Диагностический маршрут
app.get('/api/debug', async (req, res) => {
    try {
        if (!pool) {
            return res.json({ 
                status: 'database_not_connected',
                message: 'База данных не подключена',
                databaseUrl: process.env.DATABASE_URL ? 'configured' : 'not_found'
            });
        }

        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);

        const settings = await pool.query('SELECT * FROM shop_settings');
        
        res.json({
            status: 'connected',
            tables: tables.rows.map(row => row.table_name),
            settings_count: settings.rows.length,
            current_settings: settings.rows[0] || null
        });
    } catch (error) {
        res.json({ 
            status: 'error',
            error: error.message 
        });
    }
});

// Статические файлы
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Запуск сервера
const PORT = process.env.PORT || 3000;

async function startServer() {
    // Подключаемся к базе данных
    await connectDatabase();
    
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`🏪 Магазин: http://localhost:${PORT}`);
        console.log(`⚙️ Админка: http://localhost:${PORT}/admin`);
        console.log(`🔧 Диагностика: http://localhost:${PORT}/api/debug`);
    });
}

startServer().catch(console.error);
