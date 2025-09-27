const express = require('express');
const fileUpload = require('express-fileupload');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));

// Функция для получения подключения к БД
async function getDatabaseConnection() {
  // Проверяем переменные окружения Railway
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.log('❌ DATABASE_URL не найден. Убедитесь, что база данных добавлена в Railway.');
    return null;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Проверяем подключение
    const client = await pool.connect();
    console.log('✅ Подключение к базе данных установлено');
    client.release();
    return pool;
  } catch (error) {
    console.log('❌ Ошибка подключения к базе:', error.message);
    return null;
  }
}

// Инициализация базы данных
async function initializeDatabase(pool) {
  try {
    const client = await pool.connect();
    
    // Создаем таблицы
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

    // Добавляем начальные данные
    const settingsCheck = await client.query('SELECT COUNT(*) FROM shop_settings');
    if (parseInt(settingsCheck.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO shop_settings (shop_name, holder_name, inn, registration_address, organization_address, email, phone) 
        VALUES ('Smart Service', 'Иван Иванов', '1234567890', 'г. Москва, ул. Примерная, д. 1', 'г. Москва, ул. Примерная, д. 1', 'example@email.com', '+79991234567')
      `);
    }

    client.release();
    console.log('✅ База данных инициализирована');
    return true;
  } catch (error) {
    console.error('❌ Ошибка инициализации базы:', error);
    return false;
  }
}

// Запуск приложения
async function startServer() {
  const pool = await getDatabaseConnection();
  
  if (!pool) {
    console.log('🚧 Запуск без базы данных (режим заглушки)');
    // Режим без базы данных - для тестирования
    setupRoutesWithoutDB();
  } else {
    await initializeDatabase(pool);
    setupRoutesWithDB(pool);
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📱 Мини-приложение доступно по адресу: https://your-project.railway.app`);
  });
}

// Настройка маршрутов с базой данных
function setupRoutesWithDB(pool) {
  // API для настроек магазина
  app.get('/api/shop-settings', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1');
      res.json(result.rows[0] || {});
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/shop-settings', async (req, res) => {
    try {
      const { shop_name, holder_name, inn, registration_address, organization_address, email, phone } = req.body;
      
      await pool.query('DELETE FROM shop_settings');
      const result = await pool.query(
        'INSERT INTO shop_settings (shop_name, holder_name, inn, registration_address, organization_address, email, phone) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [shop_name, holder_name, inn, registration_address, organization_address, email, phone]
      );
      
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // API для услуг
  app.get('/api/services', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM services WHERE is_active = true ORDER BY name');
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// Заглушки для режима без базы данных
function setupRoutesWithoutDB() {
  app.get('/api/shop-settings', (req, res) => {
    res.json({
      shop_name: 'Smart Service',
      holder_name: 'Иван Иванов',
      inn: '1234567890',
      registration_address: 'г. Москва, ул. Примерная, д. 1',
      organization_address: 'г. Москва, ул. Примерная, д. 1',
      email: 'example@email.com',
      phone: '+79991234567'
    });
  });

  app.get('/api/services', (req, res) => {
    res.json([
      {
        id: 1,
        article: 'SRV001',
        name: 'Пример услуги',
        description: 'Описание примерной услуги',
        price: 1000,
        image_url: null
      }
    ]);
  });
}

// Статические файлы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

startServer();
