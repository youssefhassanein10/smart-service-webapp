const express = require('express');
const fileUpload = require('express-fileupload');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 10 * 1024 * 1024 },
    useTempFiles: false
}));
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

// Данные в памяти (резервное хранилище)
let memoryData = {
    settings: {
        shop_name: 'Smart Service',
        holder_name: 'Иван Иванов',
        inn: '1234567890',
        registration_address: 'г. Москва, ул. Примерная, д. 1',
        organization_address: 'г. Москва, ул. Примерная, д. 1',
        email: 'example@email.com',
        phone: '+79991234567'
    },
    services: [],
    categories: [],
    orders: []
};

// Функция для сохранения загруженных изображений
function saveUploadedImage(imageFile) {
    if (!imageFile) return null;
    
    try {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const fileExtension = path.extname(imageFile.name);
        const fileName = `service_${Date.now()}${fileExtension}`;
        const filePath = path.join(uploadDir, fileName);
        
        imageFile.mv(filePath);
        return `/uploads/${fileName}`;
    } catch (error) {
        console.error('❌ Ошибка сохранения изображения:', error);
        return null;
    }
}

// Функция подключения к базе данных
async function connectDatabase() {
    try {
        const databaseUrl = process.env.DATABASE_URL;
        
        if (!databaseUrl) {
            console.log('⚠️ DATABASE_URL не найден. Режим без базы данных.');
            return null;
        }

        console.log('🔗 Попытка подключения к базе данных...');
        
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

        // Таблица заказов
        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                service_id INTEGER REFERENCES services(id),
                service_name VARCHAR(255) NOT NULL,
                service_price DECIMAL(10,2) NOT NULL,
                customer_name VARCHAR(255),
                customer_contact VARCHAR(255),
                payment_method VARCHAR(100),
                status VARCHAR(50) DEFAULT 'pending',
                admin_contact VARCHAR(255) DEFAULT '@Paymentprosu',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Проверяем есть ли начальные данные
        const settingsCount = await client.query('SELECT COUNT(*) FROM shop_settings');
        if (parseInt(settingsCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO shop_settings (shop_name, holder_name, inn, registration_address, organization_address, email, phone) 
                VALUES ('Smart Service', 'Иван Иванов', '1234567890', 'г. Москва, ул. Примерная, д. 1', 'г. Москва, ул. Примерная, д. 1', 'example@email.com', '+79991234567')
            `);
            console.log('✅ Начальные данные добавлены в БД');
        }

        client.release();
        return pool;
    } catch (error) {
        console.error('❌ Ошибка подключения к базе данных:', error.message);
        console.log('⚠️ Используется резервное хранилище в памяти');
        return null;
    }
}

// API Routes

// Получить настройки магазина
app.get('/api/shop-settings', async (req, res) => {
    try {
        if (pool) {
            const result = await pool.query('SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1');
            if (result.rows.length > 0) {
                return res.json(result.rows[0]);
            }
        }
        res.json(memoryData.settings);
    } catch (error) {
        console.error('Ошибка получения настроек:', error);
        res.json(memoryData.settings);
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

        if (!shop_name || !holder_name) {
            return res.status(400).json({ error: 'Название магазина и имя держателя обязательны' });
        }

        if (pool) {
            await pool.query('DELETE FROM shop_settings');
            
            const result = await pool.query(
                `INSERT INTO shop_settings 
                 (shop_name, holder_name, inn, registration_address, organization_address, email, phone) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7) 
                 RETURNING *`,
                [shop_name, holder_name, inn, registration_address, organization_address, email, phone]
            );

            console.log('✅ Настройки сохранены в БД');
            return res.json(result.rows[0]);
        } else {
            memoryData.settings = {
                shop_name, 
                holder_name, 
                inn, 
                registration_address, 
                organization_address, 
                email, 
                phone
            };
            console.log('✅ Настройки сохранены в памяти');
            res.json(memoryData.settings);
        }
        
    } catch (error) {
        console.error('❌ Ошибка сохранения настроек:', error);
        res.status(500).json({ error: error.message });
    }
});

// API для услуг
app.get('/api/services', async (req, res) => {
    try {
        if (pool) {
            const result = await pool.query(`
                SELECT s.*, c.name as category_name 
                FROM services s 
                LEFT JOIN categories c ON s.category_id = c.id 
                WHERE s.is_active = true 
                ORDER BY s.created_at DESC
            `);
            return res.json(result.rows);
        }
        res.json(memoryData.services);
    } catch (error) {
        res.json(memoryData.services);
    }
});

// Сохранить услугу с изображением
app.post('/api/services', async (req, res) => {
    try {
        console.log('📨 Получен запрос на добавление услуги:', req.body);
        
        const { article, name, description, price, category_id } = req.body;
        let imageUrl = null;

        if (req.files && req.files.image) {
            imageUrl = saveUploadedImage(req.files.image);
            console.log('🖼️ Изображение сохранено:', imageUrl);
        }

        if (pool) {
            const result = await pool.query(
                `INSERT INTO services (article, name, description, price, category_id, image_url) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 RETURNING *`,
                [article, name, description, parseFloat(price), category_id || null, imageUrl]
            );
            console.log('✅ Услуга сохранена в БД');
            return res.json(result.rows[0]);
        } else {
            const newService = {
                id: memoryData.services.length + 1,
                article, 
                name, 
                description, 
                price: parseFloat(price), 
                category_id: category_id || null,
                image_url: imageUrl,
                created_at: new Date()
            };
            memoryData.services.push(newService);
            console.log('✅ Услуга сохранена в памяти');
            res.json(newService);
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения услуги:', error);
        res.status(500).json({ error: error.message });
    }
});

// API для заказов
app.get('/api/orders', async (req, res) => {
    try {
        if (pool) {
            const result = await pool.query(`
                SELECT o.*, s.name as service_name 
                FROM orders o 
                LEFT JOIN services s ON o.service_id = s.id 
                ORDER BY o.created_at DESC
            `);
            return res.json(result.rows);
        }
        res.json(memoryData.orders);
    } catch (error) {
        res.json(memoryData.orders);
    }
});

// Создать заказ
app.post('/api/orders', async (req, res) => {
    try {
        const { service_id, service_name, service_price, customer_name, customer_contact, payment_method } = req.body;

        if (!service_id || !customer_name || !payment_method) {
            return res.status(400).json({ error: 'Заполните обязательные поля' });
        }

        if (pool) {
            const result = await pool.query(
                `INSERT INTO orders (service_id, service_name, service_price, customer_name, customer_contact, payment_method) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 RETURNING *`,
                [service_id, service_name, parseFloat(service_price), customer_name, customer_contact, payment_method]
            );
            console.log('✅ Заказ создан:', result.rows[0]);
            return res.json(result.rows[0]);
        } else {
            const newOrder = {
                id: memoryData.orders.length + 1,
                service_id,
                service_name,
                service_price: parseFloat(service_price),
                customer_name,
                customer_contact,
                payment_method,
                status: 'pending',
                admin_contact: '@Paymentprosu',
                created_at: new Date()
            };
            memoryData.orders.push(newOrder);
            console.log('✅ Заказ создан в памяти');
            res.json(newOrder);
        }
    } catch (error) {
        console.error('❌ Ошибка создания заказа:', error);
        res.status(500).json({ error: error.message });
    }
});

// Обновить статус заказа
app.put('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (pool) {
            const result = await pool.query(
                'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
                [status, id]
            );
            res.json(result.rows[0]);
        } else {
            const order = memoryData.orders.find(o => o.id == id);
            if (order) {
                order.status = status;
                order.updated_at = new Date();
            }
            res.json(order);
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API для категорий
app.get('/api/categories', async (req, res) => {
    try {
        if (pool) {
            const result = await pool.query('SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, name');
            return res.json(result.rows);
        }
        res.json(memoryData.categories);
    } catch (error) {
        res.json(memoryData.categories);
    }
});

// API для получения способов оплаты
app.get('/api/payment-methods', (req, res) => {
    const paymentMethods = [
        {
            id: 'sberbank',
            name: 'Сбербанк',
            icon: '🏦',
            details: 'Перевод по номеру карты/телефона',
            instructions: 'Переведите сумму на карту Сбербанка: 2202 2002 2020 2020\nИли по номеру телефона: +7 900 123-45-67'
        },
        {
            id: 'tinkoff',
            name: 'Тинькофф',
            icon: '💳',
            details: 'Перевод на карту Тинькофф',
            instructions: 'Переведите сумму на карту Тинькофф: 2200 7007 8998 1122\nВладелец: Иван Иванов'
        },
        {
            id: 'vtb',
            name: 'ВТБ',
            icon: '🏛️',
            details: 'Перевод на карту ВТБ',
            instructions: 'Переведите сумму на карту ВТБ: 2202 2003 3004 4005\nВладелец: Иван Иванов'
        },
        {
            id: 'alfabank',
            name: 'Альфа-Банк',
            icon: '🔷',
            details: 'Перевод на карту Альфа-Банка',
            instructions: 'Переведите сумму на карту Альфа-Банка: 2200 0000 1111 2222\nВладелец: Иван Иванов'
        },
        {
            id: 'gazprom',
            name: 'Газпромбанк',
            icon: '⛽',
            details: 'Перевод на карту Газпромбанка',
            instructions: 'Переведите сумму на карту Газпромбанка: 2200 3333 4444 5555\nВладелец: Иван Иванов'
        },
        {
            id: 'raiffeisen',
            name: 'Райффайзенбанк',
            icon: '🏢',
            details: 'Перевод на карту Райффайзенбанка',
            instructions: 'Переведите сумму на карту Райффайзенбанка: 2200 6666 7777 8888\nВладелец: Иван Иванов'
        },
        {
            id: 'qiwi',
            name: 'QIWI',
            icon: '👛',
            details: 'Перевод на кошелек QIWI',
            instructions: 'Переведите сумму на QIWI кошелек: +7 900 123-45-67'
        },
        {
            id: 'yoomoney',
            name: 'ЮMoney',
            icon: '💷',
            details: 'Перевод на кошелек ЮMoney',
            instructions: 'Переведите сумму на кошелек ЮMoney: 4100 1234 5678 9012'
        },
        {
            id: 'nspk',
            name: 'QR НСПК',
            icon: '📱',
            details: 'Оплата по QR-коду (СБП)',
            instructions: 'Отсканируйте QR-код через приложение вашего банка с поддержкой СБП'
        }
    ];
    
    res.json(paymentMethods);
});

// Диагностический маршрут
app.get('/api/debug', async (req, res) => {
    try {
        const debugInfo = {
            status: 'running',
            timestamp: new Date().toISOString(),
            database: {
                hasDatabaseUrl: !!process.env.DATABASE_URL,
                poolConnected: !!pool,
                urlLength: process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0
            },
            memory: {
                settings: memoryData.settings,
                servicesCount: memoryData.services.length,
                ordersCount: memoryData.orders.length,
                categoriesCount: memoryData.categories.length
            }
        };

        if (pool) {
            const tables = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            `);
            debugInfo.database.tables = tables.rows.map(row => row.table_name);

            const settingsCount = await pool.query('SELECT COUNT(*) FROM shop_settings');
            debugInfo.database.settingsCount = parseInt(settingsCount.rows[0].count);

            const servicesCount = await pool.query('SELECT COUNT(*) FROM services');
            debugInfo.database.servicesCount = parseInt(servicesCount.rows[0].count);

            const ordersCount = await pool.query('SELECT COUNT(*) FROM orders');
            debugInfo.database.ordersCount = parseInt(ordersCount.rows[0].count);
        }

        res.json(debugInfo);
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
    console.log('🚀 Запуск сервера...');
    console.log('🔍 Проверка окружения:');
    console.log('PORT:', PORT);
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Есть (' + process.env.DATABASE_URL.length + ' символов)' : 'НЕТ!');
    
    // Подключаемся к базе данных
    await connectDatabase();
    
    app.listen(PORT, () => {
        console.log(`✅ Сервер запущен на порту ${PORT}`);
        console.log(`🏪 Магазин: http://localhost:${PORT}`);
        console.log(`⚙️ Админка: http://localhost:${PORT}/admin`);
        console.log(`🔧 Диагностика: http://localhost:${PORT}/api/debug`);
        console.log(pool ? '✅ База данных подключена' : '⚠️ Используется резервное хранилище');
    });
}

startServer().catch(console.error);
