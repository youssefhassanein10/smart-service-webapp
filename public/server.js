const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Секретный токен администратора
const ADMIN_TOKEN = 'SUPER_SECRET_TOKEN';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Папка для фото
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- SQLite ---
const db = new sqlite3.Database('./shop.db', err => {
  if(err) console.error(err);
  else console.log('Connected to SQLite');
});

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS store_info(id INTEGER PRIMARY KEY, name TEXT, inn TEXT, address TEXT, email TEXT, phone TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, price REAL, image_url TEXT, category_id INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, phone TEXT)`);
});

// --- Проверка администратора ---
app.get('/api/is_admin', (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token===ADMIN_TOKEN) res.json({admin:true});
  else res.json({admin:false});
});

// --- Store info ---
app.get('/api/store_info', (req,res)=>{
  db.get(`SELECT * FROM store_info WHERE id=1`, (err,row)=>{
    if(err) return res.status(500).json({error:err});
    res.json(row || {});
  });
});

app.post('/api/store_info', (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token!==ADMIN_TOKEN) return res.status(403).json({error:'Forbidden'});
  const {name,inn,address,email,phone} = req.body;
  db.run(`INSERT OR REPLACE INTO store_info(id,name,inn,address,email,phone) VALUES(1,?,?,?,?,?)`,
    [name,inn,address,email,phone], err=>{
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

app.post('/api/categories', (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token!==ADMIN_TOKEN) return res.status(403).json({error:'Forbidden'});
  const {name} = req.body;
  db.run(`INSERT INTO categories(name) VALUES(?)`, [name], err=>{
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

app.post('/api/products', upload.single('image'), (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token!==ADMIN_TOKEN) return res.status(403).json({error:'Forbidden'});
  const {title,description,price,category_id} = req.body;
  let image_url = '';
  if(req.file) image_url = '/uploads/' + req.file.filename;
  db.run(`INSERT INTO products(title,description,price,image_url,category_id) VALUES(?,?,?,?,?)`,
    [title,description,price,image_url,category_id], err=>{
      if(err) return res.status(500).json({error:err});
      res.json({success:true});
    });
});

app.put('/api/products/:id', upload.single('image'), (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token!==ADMIN_TOKEN) return res.status(403).json({error:'Forbidden'});
  const {title,description,price,category_id} = req.body;
  const {id} = req.params;
  if(req.file){
    const image_url = '/uploads/' + req.file.filename;
    db.run(`UPDATE products SET title=?,description=?,price=?,image_url=?,category_id=? WHERE id=?`,
      [title,description,price,image_url,category_id,id], err=>{
        if(err) return res.status(500).json({error:err});
        res.json({success:true});
      });
  } else {
    db.run(`UPDATE products SET title=?,description=?,price=?,category_id=? WHERE id=?`,
      [title,description,price,category_id,id], err=>{
        if(err) return res.status(500).json({error:err});
        res.json({success:true});
      });
  }
});

app.delete('/api/products/:id', (req,res)=>{
  const token = req.headers['x-admin-token'];
  if(token!==ADMIN_TOKEN) return res.status(403).json({error:'Forbidden'});
  const {id} = req.params;
  db.run(`DELETE FROM products WHERE id=?`, [id], err=>{
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

// --- Buy ---
app.post('/api/buy', (req,res)=>{
  const {user, productId} = req.body;
  console.log(`User ${user.name} купил товар ${productId}`);
  res.json({success:true});
});

// Статика
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','shop.html')));

app.listen(PORT, ()=>console.log(`Server running: http://localhost:${PORT}`));
