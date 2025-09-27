const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const { v4: uuidv4 } = require('uuid');

const ADMIN_TOKEN = 'SUPER_SECRET_TOKEN';
const PORT = process.env.PORT || 3000;

(async () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  });
  const upload = multer({ storage });

  const db = await open({
    filename: './shop.db',
    driver: sqlite3.Database
  });

  // Создаем таблицы
  await db.exec(`
    CREATE TABLE IF NOT EXISTS store_info(id INTEGER PRIMARY KEY, name TEXT, inn TEXT, address TEXT, email TEXT, phone TEXT);
    CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
    CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, price REAL, image_url TEXT, category_id INTEGER);
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT);
  `);

  // Middleware для админа
  function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'] || req.body.admin_token;
    if(token === ADMIN_TOKEN) return next();
    return res.status(403).json({error:'Forbidden'});
  }

  // Статика и доступ к фото
  app.use('/uploads', express.static(uploadsDir));
  app.use(express.static(path.join(__dirname,'public')));

  // --- Store Info ---
  app.get('/api/store_info', async (req,res)=>{
    const row = await db.get('SELECT * FROM store_info WHERE id=1');
    res.json(row || {});
  });

  app.post('/api/store_info', requireAdmin, async (req,res)=>{
    const {name,inn,address,email,phone} = req.body;
    await db.run('INSERT OR REPLACE INTO store_info(id,name,inn,address,email,phone) VALUES(1,?,?,?,?,?)',[name,inn,address,email,phone]);
    res.json({success:true});
  });

  // --- Categories ---
  app.get('/api/categories', async (req,res)=>{
    const rows = await db.all('SELECT * FROM categories');
    res.json(rows);
  });

  app.post('/api/categories', requireAdmin, async (req,res)=>{
    const {name} = req.body;
    await db.run('INSERT INTO categories(name) VALUES(?)',[name]);
    res.json({success:true});
  });

  app.delete('/api/categories/:id', requireAdmin, async (req,res)=>{
    const {id} = req.params;
    await db.run('DELETE FROM categories WHERE id=?',[id]);
    res.json({success:true});
  });

  // --- Products ---
  app.get('/api/products', async (req,res)=>{
    const rows = await db.all('SELECT * FROM products ORDER BY id DESC');
    res.json(rows);
  });

  app.post('/api/products', requireAdmin, upload.single('image'), async (req,res)=>{
    const {title,description,price,category_id} = req.body;
    let image_url = req.file ? '/uploads/' + req.file.filename : '';
    await db.run('INSERT INTO products(title,description,price,image_url,category_id) VALUES(?,?,?,?,?)',
      [title,description,price,image_url,category_id]);
    const row = await db.get('SELECT * FROM products ORDER BY id DESC LIMIT 1');
    res.json(row);
  });

  app.put('/api/products/:id', requireAdmin, upload.single('image'), async (req,res)=>{
    const {title,description,price,category_id} = req.body;
    const {id} = req.params;
    if(req.file){
      const image_url = '/uploads/' + req.file.filename;
      await db.run('UPDATE products SET title=?,description=?,price=?,category_id=?,image_url=? WHERE id=?',
        [title,description,price,category_id,image_url,id]);
    } else {
      await db.run('UPDATE products SET title=?,description=?,price=?,category_id=? WHERE id=?',
        [title,description,price,category_id,id]);
    }
    const row = await db.get('SELECT * FROM products WHERE id=?',[id]);
    res.json(row);
  });

  app.delete('/api/products/:id', requireAdmin, async (req,res)=>{
    const {id} = req.params;
    await db.run('DELETE FROM products WHERE id=?',[id]);
    res.json({success:true});
  });

  // --- Users ---
  app.get('/api/users', requireAdmin, async (req,res)=>{
    const rows = await db.all('SELECT * FROM users ORDER BY id DESC');
    res.json(rows);
  });

  app.post('/api/register', async (req,res)=>{
    const {name,email,phone} = req.body;
    await db.run('INSERT INTO users(name,email,phone) VALUES(?,?,?)',[name,email,phone]);
    res.json({success:true});
  });

  // --- Admin check ---
  app.get('/api/is_admin', (req,res)=>{
    const token = req.headers['x-admin-token'];
    res.json({admin: token===ADMIN_TOKEN});
  });

  // SPA fallback
  app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','shop.html')));

  app.listen(PORT,()=>console.log(`Server running on http://localhost:${PORT}`));
})();
