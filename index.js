const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = 'SUPER_SECRET_TOKEN';

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- Upload setup ---
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- SQLite setup ---
const db = new sqlite3.Database('./shop.db', err => {
  if(err) console.error(err);
  else console.log('Connected to SQLite');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS store_info(id INTEGER PRIMARY KEY, name TEXT, inn TEXT, address TEXT, email TEXT, phone TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, price REAL, category_id INTEGER, image_url TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT)`);
});

// --- Middleware for admin ---
function requireAdmin(req, res, next){
  const token = req.headers['x-admin-token'];
  if(token !== ADMIN_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// --- Store info ---
app.get('/api/store_info', (req,res)=>{
  db.get(`SELECT * FROM store_info WHERE id=1`, (err,row)=>{
    if(err) return res.status(500).json({error:err});
    res.json(row || {});
  });
});

app.post('/api/store_info', requireAdmin, (req,res)=>{
  const {name, inn, address, email, phone} = req.body;
  db.run(`INSERT OR REPLACE INTO store_info(id,name,inn,address,email,phone) VALUES(1,?,?,?,?,?)`,
    [name, inn, address, email, phone], err=>{
      if(err) return res.status(500).json({error:err});
      res.json({success:true});
    });
});

// --- Categories ---
app.get('/api/categories', (req,res)=>{
  db.all(`SELECT * FROM categories`, (err,rows)=>{
    if(err) return res.status(500).json({error:err});
    res.json(rows);
  });
});

app.post('/api/categories', requireAdmin, (req,res)=>{
  const {name} = req.body;
  db.run(`INSERT INTO categories(name) VALUES(?)`, [name], err=>{
    if(err) return res.status(500).json({error:err});
    res.json({success:true});
  });
});

app.delete('/api/categories/:id', requireAdmin, (req,res)=>{
  db.run(`DELETE FROM categories WHERE id=?`, [req.params.id], err=>{
    if(err) return res.status(500).json({error:err});
    res.json({success:true});
  });
});

// --- Products ---
app.get('/api/products', (req,res)=>{
  db.all(`SELECT * FROM products`, (err,rows)=>{
    if(err) return res.status(500).json({error:err});
    res.json(rows);
  });
});

// Добавление товара с фото
app.post('/api/products', requireAdmin, upload.single('image'), (req,res)=>{
  const { title, description, price, category_id } = req.body;
  let image_url = '';
  if(req.file) image_url = '/uploads/' + req.file.filename;
  db.run(`INSERT INTO products(title,description,price,category_id,image_url) VALUES(?,?,?,?,?)`,
    [title, description, price, category_id, image_url], err=>{
      if(err) return res.status(500).json({error:err});
      res.json({success:true});
    });
});

// Редактирование товара
app.put('/api/products/:id', requireAdmin, upload.single('image'), (req,res)=>{
  const { title, description, price, category_id } = req.body;
  const id = req.params.id;
  if(req.file){
    const image_url = '/uploads/' + req.file.filename;
    db.run(`UPDATE products SET title=?,description=?,price=?,category_id=?,image_url=? WHERE id=?`,
      [title, description, price, category_id, image_url, id], err=>{
        if(err) return res.status(500).json({error:err});
        res.json({success:true});
      });
  } else {
    db.run(`UPDATE products SET title=?,description=?,price=?,category_id=? WHERE id=?`,
      [title, description, price, category_id, id], err=>{
        if(err) return res.status(500).json({error:err});
        res.json({success:true});
      });
  }
});

// Удаление товара
app.delete('/api/products/:id', requireAdmin, (req,res)=>{
  db.run(`DELETE FROM products WHERE id=?`, [req.params.id], err=>{
    if(err) return res.status(500).json({error:err});
    res.json({success:true});
  });
});

// --- Users ---
app.post('/api/register', (req,res)=>{
  const {name,email,phone} = req.body;
  db.run(`INSERT INTO users(name,email,phone) VALUES(?,?,?)`, [name,email,phone], err=>{
    if(err) return res.status(500).json({error:err});
    res.json({success:true});
  });
});

// --- Serve HTML ---
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','shop.html')));
app.get('*', (req,res)=>res.sendFile(path.join(__dirname,'public','shop.html')));

app.listen(PORT, ()=>console.log(`Server running on http://localhost:${PORT}`));
