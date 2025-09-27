// Функция для сохранения настроек магазина
async function saveShopSettings() {
    const form = document.getElementById('shopSettingsForm');
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    
    try {
        submitButton.textContent = 'Сохранение...';
        submitButton.disabled = true;

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        console.log('📤 Отправка данных:', data);

        if (!data.shop_name || !data.shop_name.trim()) {
            alert('⚠️ Введите название магазина');
            return;
        }

        if (!data.holder_name || !data.holder_name.trim()) {
            alert('⚠️ Введите имя держателя');
            return;
        }

        const response = await fetch('/api/shop-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            alert('✅ Настройки успешно сохранены!');
            console.log('✅ Ответ сервера:', result);
        } else {
            throw new Error(result.error || `Ошибка ${response.status}`);
        }

    } catch (error) {
        console.error('❌ Ошибка:', error);
        alert('❌ Ошибка сохранения: ' + error.message);
    } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

// Функция загрузки настроек
async function loadShopSettings() {
    try {
        console.log('🔄 Загрузка настроек магазина...');
        
        const response = await fetch('/api/shop-settings');
        
        if (!response.ok) {
            throw new Error(`Ошибка загрузки: ${response.status}`);
        }
        
        const settings = await response.json();
        console.log('📖 Загруженные настройки:', settings);
        
        for (const key in settings) {
            const input = document.querySelector(`[name="${key}"]`);
            if (input && settings[key] !== null && settings[key] !== undefined) {
                input.value = settings[key];
            }
        }
        
        console.log('✅ Настройки загружены');
    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
        document.querySelector('[name="shop_name"]').value = 'Smart Service';
    }
}

// Функция для управления услугами
async function saveService() {
    const form = document.getElementById('serviceForm');
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    
    try {
        submitButton.textContent = 'Добавление...';
        submitButton.disabled = true;

        const formData = new FormData(form);

        const article = formData.get('article');
        const name = formData.get('name');
        const price = formData.get('price');

        if (!article || !name || !price) {
            alert('⚠️ Заполните артикул, название и цену');
            return;
        }

        const response = await fetch('/api/services', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            alert('✅ Услуга добавлена!');
            form.reset();
            const preview = document.querySelector('.image-preview');
            if (preview) preview.innerHTML = '';
            console.log('✅ Услуга создана:', result);
            
            // Перезагружаем список услуг
            loadServicesList();
        } else {
            throw new Error(result.error || `Ошибка ${response.status}`);
        }

    } catch (error) {
        console.error('❌ Ошибка:', error);
        alert('❌ Ошибка добавления услуги: ' + error.message);
    } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

// Функция для сохранения способа оплаты
async function savePaymentMethod(event) {
    event.preventDefault();
    
    const form = document.getElementById('paymentMethodForm');
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    
    try {
        submitButton.textContent = 'Сохранение...';
        submitButton.disabled = true;

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Преобразуем checkbox в boolean
        data.is_active = data.is_active === 'on';

        console.log('📤 Отправка данных способа оплаты:', data);

        if (!data.method_id || !data.name) {
            alert('⚠️ Заполните ID и название способа оплаты');
            return;
        }

        const response = await fetch('/api/payment-methods', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            alert('✅ Способ оплаты сохранен!');
            form.reset();
            hideAddPaymentMethodForm();
            loadPaymentMethods();
        } else {
            throw new Error(result.error || `Ошибка ${response.status}`);
        }

    } catch (error) {
        console.error('❌ Ошибка:', error);
        alert('❌ Ошибка сохранения способа оплаты: ' + error.message);
    } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

// Функция для сохранения ручного заказа
async function saveManualOrder(event) {
    event.preventDefault();
    
    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    
    try {
        submitButton.textContent = 'Добавление...';
        submitButton.disabled = true;

        const data = {
            service_name: document.getElementById('manualServiceName').value,
            service_article: document.getElementById('manualServiceArticle').value,
            service_price: document.getElementById('manualServicePrice').value,
            customer_name: document.getElementById('manualCustomerName').value,
            customer_contact: document.getElementById('manualCustomerContact').value,
            payment_method: document.getElementById('manualPaymentMethod').value,
            order_date: document.getElementById('manualOrderDate').value
        };

        if (!data.service_name || !data.service_price || !data.customer_name || !data.payment_method) {
            alert('⚠️ Заполните обязательные поля');
            return;
        }

        const response = await fetch('/api/manual-orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            alert('✅ Заказ добавлен!');
            hideManualOrderForm();
            loadOrders();
            loadReports();
        } else {
            throw new Error(result.error || `Ошибка ${response.status}`);
        }

    } catch (error) {
        console.error('❌ Ошибка:', error);
        alert('❌ Ошибка добавления заказа: ' + error.message);
    } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

// Функция предпросмотра изображения
function previewImage(input) {
    const preview = document.querySelector('.image-preview');
    if (!preview) return;
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `
                <div style="text-align: center;">
                    <img src="${e.target.result}" style="max-width: 200px; border: 1px solid #ddd; border-radius: 5px;">
                    <div style="margin-top: 10px; color: #666;">Предпросмотр изображения</div>
                </div>
            `;
        }
        reader.onerror = function(error) {
            console.error('❌ Ошибка загрузки изображения:', error);
            alert('Ошибка загрузки изображения');
        }
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.innerHTML = '';
    }
}

// Функция переключения вкладок
function openTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.getElementById(tabName);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
}

// Функция проверки соединения с сервером
async function checkServerConnection() {
    try {
        const response = await fetch('/api/debug');
        const data = await response.json();
        console.log('🔧 Диагностика сервера:', data);
        
        if (data.status === 'running') {
            console.log('✅ Сервер работает нормально');
            if (data.database.poolConnected) {
                console.log('✅ База данных подключена');
            } else {
                console.log('⚠️ Используется резервное хранилище');
            }
            return true;
        }
        return false;
    } catch (error) {
        console.error('❌ Ошибка диагностики:', error);
        return false;
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Админ-панель загружена');
    
    checkServerConnection();
    loadShopSettings();
    
    // Настраиваем обработчики событий
    const shopForm = document.getElementById('shopSettingsForm');
    if (shopForm) {
        shopForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveShopSettings();
        });
    }
    
    const serviceForm = document.getElementById('serviceForm');
    if (serviceForm) {
        serviceForm.setAttribute('enctype', 'multipart/form-data');
        
        serviceForm.addEventListener('submit', function(e) {
            e.preventDefault();
            saveService();
        });
    }
    
    const paymentMethodForm = document.getElementById('paymentMethodForm');
    if (paymentMethodForm) {
        paymentMethodForm.addEventListener('submit', savePaymentMethod);
    }
    
    const manualOrderForm = document.getElementById('manualOrderForm');
    if (manualOrderForm) {
        manualOrderForm.addEventListener('submit', saveManualOrder);
    }
    
    const imageInput = document.querySelector('input[name="image"]');
    if (imageInput) {
        imageInput.addEventListener('change', function(e) {
            previewImage(e.target);
        });
    }
    
    loadCategories();
});

// Функция загрузки категорий
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        
        const select = document.querySelector('select[name="category_id"]');
        if (select && categories.length > 0) {
            while (select.children.length > 1) {
                select.removeChild(select.lastChild);
            }
            
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}
