const express = require('express');
const fileUpload = require('express-fileupload');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(fileUpload());
app.use(express.static('public'));

// Подключение к PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Функция инициализации базы данных
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Создание таблицы настроек магазина
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

    // Создание таблицы категорий
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

    // Создание таблицы услуг
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

    // Проверяем, есть ли хотя бы одна запись в настройках, если нет - вставляем начальные данные
    const settingsResult = await client.query('SELECT COUNT(*) FROM shop_settings');
    if (parseInt(settingsResult.rows[0].count) === 0) {
      await client.query(`
        INSERT INTO shop_settings (shop_name, holder_name, inn, registration_address, organization_address, email, phone) 
        VALUES ('Smart Service', 'Ваше имя', '1234567890', 'Адрес регистрации', 'Адрес организации', 'email@example.com', '+79991234567')
      `);
    }

    console.log('База данных инициализирована');
  } catch (error) {
    console.error('Ошибка инициализации базы данных:', error);
  } finally {
    client.release();
  }
}

// Инициализируем базу данных при запуске сервера
initDatabase();

// ... остальные маршруты API ...

// API для получения данных магазина
app.get('/api/shop-settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM shop_settings ORDER BY id DESC LIMIT 1');
    res.json(result.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API для обновления настроек магазина
app.post('/api/shop-settings', async (req, res) => {
  try {
    const {
      shop_name, holder_name, inn, registration_address,
      organization_address, email, phone
    } = req.body;

    // Удаляем старые настройки и вставляем новые (или можно сделать UPDATE, но для простоты будем всегда вставлять новую запись)
    await pool.query('DELETE FROM shop_settings');
    const result = await pool.query(`
      INSERT INTO shop_settings 
      (shop_name, holder_name, inn, registration_address, organization_address, email, phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [shop_name, holder_name, inn, registration_address, organization_address, email, phone]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API для услуг
app.get('/api/services', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, c.name as category_name 
      FROM services s 
      LEFT JOIN categories c ON s.category_id = c.id 
      WHERE s.is_active = true 
      ORDER BY c.sort_order, s.name
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API для категорий
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM categories 
      WHERE is_active = true 
      ORDER BY sort_order, name
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
