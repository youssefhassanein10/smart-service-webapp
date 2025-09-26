// Инициализация Telegram Web App
let tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// Данные приложения
let products = [];
let cart = [];
let selectedPaymentMethod = null;

// Элементы DOM
const productsGrid = document.getElementById('productsGrid');
const loadingElement = document.getElementById('loading');
const cartOverlay = document.getElementById('cartOverlay');
const cartContent = document.getElementById('cartContent');
const cartTotal = document.getElementById('cartTotal');
const paymentModal = document.getElementById('paymentModal');
const paymentMethods = document.getElementById('paymentMethods');

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    loadProducts();
    setupEventListeners();
});

// Загрузка товаров
async function loadProducts() {
    try {
        // В реальном приложении здесь будет запрос к API
        products = [
            {
                id: 1,
                name: "🌐 Веб-разработка",
                description: "Создание сайта под ключ с современным дизайном и адаптивной версткой",
                price: 10000,
                category: "web"
            },
            {
                id: 2,
                name: "🎨 UI/UX Дизайн",
                description: "Проектирование пользовательских интерфейсов и опыт взаимодействия",
                price: 5000,
                category: "design"
            },
            {
                id: 3,
                name: "💼 Техническая консультация",
                description: "Консультация по техническим вопросам продолжительностью 1 час",
                price: 3000,
                category: "consult"
            },
            {
                id: 4,
                name: "📱 Мобильное приложение",
                description: "Разработка кроссплатформенного мобильного приложения",
                price: 15000,
                category: "web"
            },
            {
                id: 5,
                name: "🚀 Оптимизация производительности",
                description: "Ускорение работы сайта и улучшение показателей",
                price: 4000,
                category: "web"
            },
            {
                id: 6,
                name: "🛡 Техническая поддержка",
                description: "Ежемесячная техническая поддержка вашего проекта",
                price: 2000,
                category: "consult"
            }
        ];

        displayProducts(products);
    } catch (error) {
        console.error('Ошибка загрузки товаров:', error);
        showError('Ошибка загрузки товаров');
    }
}

// Отображение товаров
function displayProducts(productsToShow) {
    loadingElement.style.display = 'none';
    productsGrid.innerHTML = '';

    productsToShow.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <h3>${product.name}</h3>
            <div class="description">${product.description}</div>
            <div class="price">${product.price.toLocaleString()}₽</div>
            <div class="actions">
                <button class="btn btn-secondary" onclick="viewProduct(${product.id})">ℹ️ Подробнее</button>
                <button class="btn btn-primary" onclick="addToCart(${product.id})">🛒 В корзину</button>
            </div>
        `;
        productsGrid.appendChild(productCard);
    });
}

// Просмотр товара
function viewProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        tg.showPopup({
            title: product.name,
            message: `${product.description}\n\n💵 Цена: ${product.price.toLocaleString()}₽`,
            buttons: [
                {type: 'default', text: '🛒 Добавить в корзину', id: 'add'},
                {type: 'cancel', text: 'Закрыть'}
            ]
        }, function(buttonId) {
            if (buttonId === 'add') {
                addToCart(productId);
            }
        });
    }
}

// Добавление в корзину
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        const existingItem = cart.find(item => item.product.id === productId);
        
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({
                product: product,
                quantity: 1
            });
        }
        
        updateCart();
        tg.HapticFeedback.impactOccurred('light');
        showNotification(`"${product.name}" добавлен в корзину`);
    }
}

// Обновление корзины
function updateCart() {
    const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
    
    // Можно добавить иконку корзины с количеством товаров
    if (cartCount > 0) {
        document.body.classList.add('has-cart');
    } else {
        document.body.classList.remove('has-cart');
    }
}

// Открытие корзины
function openCart() {
    renderCart();
    cartOverlay.style.display = 'block';
}

// Закрытие корзины
function closeCart() {
    cartOverlay.style.display = 'none';
}

// Отрисовка корзины
function renderCart() {
    cartContent.innerHTML = '';
    
    if (cart.length === 0) {
        cartContent.innerHTML = '<p style="text-align: center; color: #666;">Корзина пуста</p>';
        return;
    }
    
    cart.forEach((item, index) => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <div>
                <strong>${item.product.name}</strong>
                <div>${item.product.price.toLocaleString()}₽ × ${item.quantity}</div>
            </div>
            <div>
                <strong>${(item.product.price * item.quantity).toLocaleString()}₽</strong>
                <button onclick="removeFromCart(${index})" style="margin-left: 10px; background: #ff4757; color: white; border: none; border-radius: 5px; padding: 5px 10px;">×</button>
            </div>
        `;
        cartContent.appendChild(cartItem);
    });
    
    const total = cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    cartTotal.textContent = total.toLocaleString();
}

// Удаление из корзины
function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
    updateCart();
    tg.HapticFeedback.impactOccurred('light');
}

// Оформление заказа
function checkout() {
    if (cart.length === 0) {
        showNotification('Корзина пуста');
        return;
    }
    
    showPaymentMethods();
}

// Показ способов оплаты
function showPaymentMethods() {
    const methods = [
        { id: 'sber', name: 'Сбербанк', type: 'card' },
        { id: 'tinkoff', name: 'Тинькофф', type: 'card' },
        { id: 'alpha', name: 'Альфа-Банк', type: 'card' },
        { id: 'nspk', name: 'QR НСПК', type: 'qr' },
        { id: 'mts', name: 'МТС Банк', type: 'card' },
        { id: 'ozon', name: 'Ozon Bank', type: 'card' }
    ];
    
    paymentMethods.innerHTML = '';
    methods.forEach(method => {
        const methodElement = document.createElement('div');
        methodElement.className = 'payment-method';
        methodElement.innerHTML = `
            <div>
                <strong>${method.name}</strong>
                <div>${method.type === 'qr' ? 'QR-код для оплаты' : 'Банковская карта'}</div>
            </div>
        `;
        methodElement.onclick = () => selectPaymentMethod(method);
        paymentMethods.appendChild(methodElement);
    });
    
    paymentModal.style.display = 'block';
    closeCart();
}

// Выбор способа оплаты
function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    
    // Закрываем модальное окно
    paymentModal.style.display = 'none';
    
    // Отправляем данные в бота
    const orderData = {
        action: 'create_order_from_mini_app',
        products: cart.map(item => ({
            id: item.product.id,
            name: item.product.name,
            price: item.product.price,
            quantity: item.quantity
        })),
        total: cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0),
        payment_method: method.id,
        payment_method_name: method.name
    };
    
    tg.sendData(JSON.stringify(orderData));
    
    // Показываем подтверждение
    tg.showConfirm('Заказ отправлен! Вернуться в бот?', function(confirmed) {
        if (confirmed) {
            tg.close();
        }
    });
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Закрытие корзины
    document.getElementById('closeCart').onclick = closeCart;
    
    // Закрытие модального окна
    document.getElementById('closeModal').onclick = function() {
        paymentModal.style.display = 'none';
    };
    
    // Оформление заказа
    document.getElementById('checkoutBtn').onclick = checkout;
    
    // Обработка клика вне модальных окон
    window.onclick = function(event) {
        if (event.target === cartOverlay) {
            closeCart();
        }
        if (event.target === paymentModal) {
            paymentModal.style.display = 'none';
        }
    };
    
    // Категории
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            // Убираем активный класс у всех кнопок
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            // Добавляем активный класс текущей кнопке
            this.classList.add('active');
            
            const category = this.dataset.category;
            filterProducts(category);
        });
    });
}

// Фильтрация товаров по категориям
function filterProducts(category) {
    if (category === 'all') {
        displayProducts(products);
    } else {
        const filteredProducts = products.filter(product => product.category === category);
        displayProducts(filteredProducts);
    }
}

// Вспомогательные функции
function showNotification(message) {
    tg.showPopup({
        title: 'Уведомление',
        message: message,
        buttons: [{type: 'default', text: 'OK', id: 'ok'}]
    });
}

function showError(message) {
    tg.showPopup({
        title: 'Ошибка',
        message: message,
        buttons: [{type: 'default', text: 'OK', id: 'ok'}]
    });
}

// Добавляем кнопку корзины в интерфейс
function addCartButton() {
    const cartBtn = document.createElement('button');
    cartBtn.innerHTML = '🛒 Корзина';
    cartBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 50px;
        padding: 15px 25px;
        font-size: 16px;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 999;
    `;
    cartBtn.onclick = openCart;
    document.body.appendChild(cartBtn);
}

// Инициализируем кнопку корзины после загрузки
setTimeout(addCartButton, 1000);
