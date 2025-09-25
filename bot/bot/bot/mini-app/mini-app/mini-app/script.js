// Инициализация Telegram Web App
let tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Загрузка товаров
async function loadProducts() {
    try {
        // В реальном приложении здесь будет API запрос к вашему бэкенду
        const products = [
            {id: 1, name: "Веб-разработка", description: "Создание сайта под ключ", price: 10000},
            {id: 2, name: "Дизайн интерфейса", description: "UI/UX дизайн", price: 5000},
            {id: 3, name: "Консультация", description: "Техническая консультация 1 час", price: 3000}
        ];
        
        displayProducts(products);
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
    }
}

function displayProducts(products) {
    const productsContainer = document.getElementById('products');
    const loading = document.getElementById('loading');
    
    loading.style.display = 'none';
    
    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <div class="price">${product.price.toLocaleString()}₽</div>
            <button class="buy-btn" onclick="selectProduct(${product.id})">Выбрать</button>
        `;
        productsContainer.appendChild(productCard);
    });
}

function selectProduct(productId) {
    // Отправляем данные в бот
    tg.sendData(JSON.stringify({
        action: "create_order",
        product_id: productId
    }));
    
    // Закрываем приложение
    tg.close();
}

// Загружаем товары при старте
loadProducts();
