const express = require('express');


app.get('/api/products/:id', (req, res) => {
const db = readDB();
const p = db.products.find(x => x.id === req.params.id);
if (!p) return res.status(404).json({ error: 'Not found' });
res.json(p);
});


app.post('/api/products', (req, res) => {
const { title, price, sku, image_url = '' } = req.body;
if (!title || !price) return res.status(400).json({ error: 'title and price required' });
const db = readDB();
const newProduct = { id: Date.now().toString(), title, price: Number(price), sku: sku || '', image_url };
db.products.push(newProduct);
writeDB(db);
res.json(newProduct);
});


app.put('/api/products/:id', (req, res) => {
const db = readDB();
const idx = db.products.findIndex(p => p.id === req.params.id);
if (idx === -1) return res.status(404).json({ error: 'Not found' });
const { title, price, sku, image_url } = req.body;
const prod = db.products[idx];
prod.title = title ?? prod.title;
prod.price = price ?? prod.price;
prod.sku = sku ?? prod.sku;
prod.image_url = image_url ?? prod.image_url;
db.products[idx] = prod;
writeDB(db);
res.json(prod);
});


app.delete('/api/products/:id', (req, res) => {
const db = readDB();
const idx = db.products.findIndex(p => p.id === req.params.id);
if (idx === -1) return res.status(404).json({ error: 'Not found' });
const [deleted] = db.products.splice(idx, 1);
writeDB(db);
res.json({ ok: true, deleted });
});


// upload image
app.post('/api/upload', upload.single('image'), (req, res) => {
if (!req.file) return res.status(400).json({ error: 'No file' });
const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
res.json({ url });
});


// SPA fallback
app.get('*', (req, res) => {
res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
