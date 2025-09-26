const productsContainer = document.getElementById('products');
const form = document.getElementById('product-form');
const imageFileInput = document.getElementById('imagefile');
const editingIdInput = document.getElementById('editingId');


async function loadProducts() {
const res = await fetch('/api/products');
const products = await res.json();
renderProducts(products);
}


function renderProducts(products) {
productsContainer.innerHTML = '';
if (!products.length) productsContainer.innerHTML = '<p>Пока нет товаров</p>';
products.forEach(p => {
const el = document.createElement('div');
el.className = 'card';
el.innerHTML = `
<img src="${p.image_url || 'https://via.placeholder.com/300x200?text=No+Image'}" alt="${p.title}" onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'" />
<h3>${p.title}</h3>
<p>Артикул: ${p.sku || '-'} </p>
<p class="price">${p.price} ₽</p>
<div class="card-actions">
<button data-id="${p.id}" class="edit">Редактировать</button>
<button data-id="${p.id}" class="delete">Удалить</button>
</div>
`;
productsContainer.appendChild(el);
});


// event listeners
document.querySelectorAll('.delete').forEach(btn => btn.addEventListener('click', async (e) => {
const id = e.target.dataset.id;
if (!confirm('Удалить товар?')) return;
await fetch('/api/products/' + id, { method: 'DELETE' });
loadProducts();
}));


document.querySelectorAll('.edit').forEach(btn => btn.addEventListener('click', async (e) => {
const id = e.target.dataset.id;
const res = await fetch('/api/products/' + id);
const p = await res.json();
form.title.value = p.title;
form.price.value = p.price;
form.sku.value = p.sku;
form.image_url.value = p.image_url || '';
editingIdInput.value = p.id;
window.scrollTo({ top: 0, behavior: 'smooth' });
}));
}


form.addEventListener('submit', async (ev) => {
ev.preventDefault();
const formData = new FormData(form);
let imageUrl = formData.get('image_url').trim();


if (imageFileInput.files.length) {
const fd = new FormData();
fd.append('image', imageFileInput.files[0]);
const up = await fetch('/api/upload', { method: 'POST', body: fd });
const upj = await up.json();
imageUrl = upj.url;
loadProducts();
