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
        phone: '+79991234567',
        admin_contact: '@Paymentprosu'
    },
    services: [],
    categories: [],
    orders: [],
    payment_methods: [
        {
            id: 'sberbank',
            name: 'Сбербанк',
            icon: '🏦',
            details: 'Перевод по номеру карты/телефона',
            instructions: 'Переведите сумму на карту Сбербанка: 2202 2002 2020 2020\nИли по номеру телефона: +7 900 123-45-67',
            is_active: true,
            sort_order: 1
        },
        {
            id: 'tinkoff',
            name: 'Тинькофф',
            icon: '💳',
            details: 'Перевод на карту Тинькофф',
            instructions: 'Переведите сумму на карту Тинькофф: 2200 7007 8998 1122\nВладелец: Иван Иванов',
            is_active: true,
            sort_order: 2
        },
        {
            id: 'nspk',
            name: 'QR НСПК',
            icon: '📱',
            details: 'Оплата по QR-коду (СБП)',
            instructions: 'Отсканируйте QR-код через приложение вашего банка с поддержкой СБП',
            is_active: true,
            sort_order: 3
        }
    ]
};

// Функция для форматирования даты (замена date-fns)
function formatDate(date, format = 'yyyy-MM-dd') {
    if (!date) return '';
    
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
        .replace('yyyy', year)
        .replace('MM', month)
        .replace('dd', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

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
                admin_contact VARCHAR(255) DEFAULT '@Paymentprosu',
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
                service_article VARCHAR(100),
                service_price DECIMAL(10,2) NOT NULL,
                customer_name VARCHAR(255),
                customer_contact VARCHAR(255),
                payment_method VARCHAR(100),
                status VARCHAR(50) DEFAULT 'pending',
                is_manual BOOLEAN DEFAULT false,
                order_date TIMESTAMP DEFAULT NOW(),
                admin_contact VARCHAR(255) DEFAULT '@Paymentprosu',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Таблица способов оплаты
        await client.query(`
            CREATE TABLE IF NOT EXISTS payment_methods (
                id SERIAL PRIMARY KEY,
                method_id VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                icon VARCHAR(10),
                details TEXT,
                instructions TEXT,
                is_active BOOLEAN DEFAULT true,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Проверяем есть ли начальные данные
        const settingsCount = await client.query('SELECT COUNT(*) FROM shop_settings');
        if (parseInt(settingsCount.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO shop_settings (shop_name, holder_name, inn, registration_address, organization_address, email, phone, admin_contact) 
                VALUES ('Smart Service', 'Иван Иванов', '1234567890', 'г. Москва, ул. Примерная, д. 1', 'г. Москва, ул. Примерная, д. 1', 'example@email.com', '+79991234567', '@Paymentprosu')
            `);
            console.log('✅ Начальные данные добавлены в БД');
        }

        // Проверяем есть ли способы оплаты
        const paymentMethodsCount = await client.query('SELECT COUNT(*) FROM payment_methods');
        if (parseInt(paymentMethodsCount.rows[0].count) === 0) {
            const defaultMethods = [
                ['sberbank', 'Сбербанк', '🏦', 'Перевод по номеру карты/телефона', 'Переведите сумму на карту Сбербанка: 2202 2002 2020 2020\nИли по номеру телефона: +7 900 123-45-67', true, 1],
                ['tinkoff', 'Тинькофф', '💳', 'Перевод на карту Тинькофф', 'Переведите сумму на карту Тинькофф: 2200 7007 8998 1122\nВладелец: Иван Иванов', true, 2],
                ['nspk', 'QR НСПК', '📱', 'Оплата по QR-коду (СБП)', 'Отсканируйте QR-код через приложение вашего банка с поддержкой СБП', true, 3]
            ];
            
            for (const method of defaultMethods) {
                await client.query(
                    `INSERT INTO payment_methods (method_id, name, icon, details, instructions, is_active, sort_order) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    method
                );
            }
            console.log('✅ Способы оплаты добавлены в БД');
        }

        client.release();
        console.log('✅ База данных инициализирована');
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
            phone,
            admin_contact 
        } = req.body;

        if (!shop_name || !holder_name) {
            return res.status(400).json({ error: 'Название магазина и имя держателя обязательны' });
        }

        if (pool) {
            await pool.query('DELETE FROM shop_settings');
            
            const result = await pool.query(
                `INSERT INTO shop_settings 
                 (shop_name, holder_name, inn, registration_address, organization_address, email, phone, admin_contact) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                 RETURNING *`,
                [shop_name, holder_name, inn, registration_address, organization_address, email, phone, admin_contact]
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
                phone,
                admin_contact
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
                SELECT o.*, s.article as service_article 
                FROM orders o 
                LEFT JOIN services s ON o.service_id = s.id 
                ORDER BY o.order_date DESC, o.created_at DESC
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
        const { service_id, service_name, service_article, service_price, customer_name, customer_contact, payment_method } = req.body;

        if (!service_id || !customer_name || !payment_method) {
            return res.status(400).json({ error: 'Заполните обязательные поля' });
        }

        if (pool) {
            const result = await pool.query(
                `INSERT INTO orders (service_id, service_name, service_article, service_price, customer_name, customer_contact, payment_method) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7) 
                 RETURNING *`,
                [service_id, service_name, service_article, parseFloat(service_price), customer_name, customer_contact, payment_method]
            );
            console.log('✅ Заказ создан:', result.rows[0]);
            return res.json(result.rows[0]);
        } else {
            const newOrder = {
                id: memoryData.orders.length + 1,
                service_id,
                service_name,
                service_article,
                service_price: parseFloat(service_price),
                customer_name,
                customer_contact,
                payment_method,
                status: 'pending',
                is_manual: false,
                admin_contact: '@Paymentprosu',
                created_at: new Date(),
                order_date: new Date()
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

// Создать заказ вручную
app.post('/api/manual-orders', async (req, res) => {
    try {
        const { service_name, service_article, service_price, customer_name, customer_contact, payment_method, order_date } = req.body;

        if (!service_name || !service_price || !customer_name || !payment_method) {
            return res.status(400).json({ error: 'Заполните обязательные поля' });
        }

        const orderDate = order_date ? new Date(order_date) : new Date();

        if (pool) {
            const result = await pool.query(
                `INSERT INTO orders (service_name, service_article, service_price, customer_name, customer_contact, payment_method, is_manual, order_date, status) 
                 VALUES ($1, $2, $3, $4, $5, $6, true, $7, 'confirmed') 
                 RETURNING *`,
                [service_name, service_article, parseFloat(service_price), customer_name, customer_contact, payment_method, orderDate]
            );
            console.log('✅ Ручной заказ создан:', result.rows[0]);
            return res.json(result.rows[0]);
        } else {
            const newOrder = {
                id: memoryData.orders.length + 1,
                service_name,
                service_article,
                service_price: parseFloat(service_price),
                customer_name,
                customer_contact,
                payment_method,
                status: 'confirmed',
                is_manual: true,
                admin_contact: '@Paymentprosu',
                created_at: new Date(),
                order_date: orderDate
            };
            memoryData.orders.push(newOrder);
            console.log('✅ Ручной заказ создан в памяти');
            res.json(newOrder);
        }
    } catch (error) {
        console.error('❌ Ошибка создания ручного заказа:', error);
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

// Удалить заказ
app.delete('/api/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (pool) {
            await pool.query('DELETE FROM orders WHERE id = $1', [id]);
            res.json({ message: 'Заказ удален' });
        } else {
            memoryData.orders = memoryData.orders.filter(o => o.id != id);
            res.json({ message: 'Заказ удален из памяти' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// API для способов оплаты
app.get('/api/payment-methods', async (req, res) => {
    try {
        if (pool) {
            const result = await pool.query('SELECT * FROM payment_methods WHERE is_active = true ORDER BY sort_order, name');
            return res.json(result.rows);
        }
        res.json(memoryData.payment_methods.filter(m => m.is_active));
    } catch (error) {
        res.json(memoryData.payment_methods.filter(m => m.is_active));
    }
});

// Получить все способы оплаты (для админки)
app.get('/api/admin/payment-methods', async (req, res) => {
    try {
        if (pool) {
            const result = await pool.query('SELECT * FROM payment_methods ORDER BY sort_order, name');
            return res.json(result.rows);
        }
        res.json(memoryData.payment_methods);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Сохранить способ оплаты
app.post('/api/payment-methods', async (req, res) => {
    try {
        const { method_id, name, icon, details, instructions, is_active, sort_order } = req.body;

        if (!method_id || !name) {
            return res.status(400).json({ error: 'ID и название способа оплаты обязательны' });
        }

        if (pool) {
            // Проверяем существует ли уже метод с таким ID
            const existing = await pool.query('SELECT * FROM payment_methods WHERE method_id = $1', [method_id]);
            
            if (existing.rows.length > 0) {
                // Обновляем существующий
                const result = await pool.query(
                    `UPDATE payment_methods 
                     SET name = $1, icon = $2, details = $3, instructions = $4, is_active = $5, sort_order = $6 
                     WHERE method_id = $7 
                     RETURNING *`,
                    [name, icon, details, instructions, is_active, sort_order, method_id]
                );
                return res.json(result.rows[0]);
            } else {
                // Создаем новый
                const result = await pool.query(
                    `INSERT INTO payment_methods (method_id, name, icon, details, instructions, is_active, sort_order) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7) 
                     RETURNING *`,
                    [method_id, name, icon, details, instructions, is_active, sort_order]
                );
                return res.json(result.rows[0]);
            }
        } else {
            // Режим памяти
            const existingIndex = memoryData.payment_methods.findIndex(m => m.id === method_id);
            
            if (existingIndex >= 0) {
                // Обновляем существующий
                memoryData.payment_methods[existingIndex] = {
                    ...memoryData.payment_methods[existingIndex],
                    name, icon, details, instructions, is_active, sort_order
                };
                return res.json(memoryData.payment_methods[existingIndex]);
            } else {
                // Создаем новый
                const newMethod = {
                    id: method_id,
                    method_id,
                    name, icon, details, instructions, 
                    is_active: is_active !== false,
                    sort_order: sort_order || 0,
                    created_at: new Date()
                };
                memoryData.payment_methods.push(newMethod);
                return res.json(newMethod);
            }
        }
    } catch (error) {
        console.error('❌ Ошибка сохранения способа оплаты:', error);
        res.status(500).json({ error: error.message });
    }
});

// Удалить способ оплаты
app.delete('/api/payment-methods/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (pool) {
            await pool.query('DELETE FROM payment_methods WHERE method_id = $1', [id]);
            res.json({ message: 'Способ оплаты удален' });
        } else {
            memoryData.payment_methods = memoryData.payment_methods.filter(m => m.id !== id);
            res.json({ message: 'Способ оплаты удален из памяти' });
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

// API для получения отчета
app.get('/api/reports', async (req, res) => {
    try {
        const { start_date, end_date, status } = req.query;
        let query = `
            SELECT o.*, s.article as service_article 
            FROM orders o 
            LEFT JOIN services s ON o.service_id = s.id 
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 0;

        if (start_date) {
            paramCount++;
            query += ` AND o.order_date >= $${paramCount}`;
            params.push(start_date);
        }

        if (end_date) {
            paramCount++;
            query += ` AND o.order_date <= $${paramCount}`;
            params.push(end_date + ' 23:59:59');
        }

        if (status) {
            paramCount++;
            query += ` AND o.status = $${paramCount}`;
            params.push(status);
        }

        query += ' ORDER BY o.order_date DESC, o.created_at DESC';

        if (pool) {
            const result = await pool.query(query, params);
            
            // Статистика
            const statsResult = await pool.query(`
                SELECT 
                    COUNT(*) as total_orders,
                    SUM(service_price) as total_revenue,
                    COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders
                FROM orders 
                WHERE 1=1 
                ${start_date ? ` AND order_date >= '${start_date}'` : ''}
                ${end_date ? ` AND order_date <= '${end_date} 23:59:59'` : ''}
            `);

            res.json({
                orders: result.rows,
                statistics: statsResult.rows[0]
            });
        } else {
            let orders = memoryData.orders;
            
            if (start_date) {
                orders = orders.filter(o => new Date(o.order_date) >= new Date(start_date));
            }
            
            if (end_date) {
                orders = orders.filter(o => new Date(o.order_date) <= new Date(end_date + 'T23:59:59'));
            }
            
            if (status) {
                orders = orders.filter(o => o.status === status);
            }
            
            const total_revenue = orders.reduce((sum, o) => sum + parseFloat(o.service_price), 0);
            const confirmed_orders = orders.filter(o => o.status === 'confirmed').length;
            const pending_orders = orders.filter(o => o.status === 'pending').length;
            
            res.json({
                orders: orders,
                statistics: {
                    total_orders: orders.length,
                    total_revenue,
                    confirmed_orders,
                    pending_orders
                }
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
                paymentMethodsCount: memoryData.payment_methods.length,
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

            const paymentMethodsCount = await pool.query('SELECT COUNT(*) FROM payment_methods');
            debugInfo.database.paymentMethodsCount = parseInt(paymentMethodsCount.rows[0].count);
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
