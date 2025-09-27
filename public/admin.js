// Функции для работы с вкладками
function openTab(tabName) {
    // Скрыть все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Показать выбранную вкладку
    document.getElementById(tabName).classList.add('active');
    
    // Обновить активную кнопку
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
}

// Загрузка данных магазина при загрузке страницы
document.addEventListener('DOMContentLoaded', async function() {
    await loadShopSettings();
    await loadCategories();
});

// Загрузка настроек магазина
async function loadShopSettings() {
    try {
        const response = await fetch('/api/shop-settings');
        const settings = await response.json();
        
        // Заполняем форму настроек
        const form = document.getElementById('shopSettingsForm');
        for (const key in settings) {
            if (form.elements[key]) {
                form.elements[key].value = settings[key] || '';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
    }
}

// Загрузка категорий для выпадающего списка
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        
        const select = document.querySelector('select[name="category_id"]');
        select.innerHTML = '<option value="">Без категории</option>';
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка загрузки категорий:', error);
    }
}

// Обработчик формы настроек магазина
document.getElementById('shopSettingsForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = Object.fromEntries(formData);
    
    try {
        const response = await fetch('/api/shop-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showMessage('shopMessage', 'Настройки успешно сохранены!', 'success');
        } else {
            throw new Error('Ошибка сохранения');
        }
    } catch (error) {
        showMessage('shopMessage', 'Ошибка сохранения настроек', 'error');
    }
});

// Обработчик формы категорий
document.getElementById('categoryForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = Object.fromEntries(formData);
    
    try {
        const response = await fetch('/api/categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showMessage('categoryMessage', 'Категория успешно добавлена!', 'success');
            this.reset();
            await loadCategories();
        } else {
            throw new Error('Ошибка добавления категории');
        }
    } catch (error) {
        showMessage('categoryMessage', 'Ошибка добавления категории', 'error');
    }
});

// Обработчик формы услуг
document.getElementById('serviceForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    const data = Object.fromEntries(formData);
    
    // Преобразуем price в число
    data.price = parseFloat(data.price);
    if (data.category_id === '') data.category_id = null;
    
    try {
        const response = await fetch('/api/services', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showMessage('serviceMessage', 'Услуга успешно добавлена!', 'success');
            this.reset();
        } else {
            throw new Error('Ошибка добавления услуги');
        }
    } catch (error) {
        showMessage('serviceMessage', 'Ошибка добавления услуги', 'error');
    }
});

// Функция для показа сообщений
function showMessage(elementId, message, type) {
    const messageDiv = document.getElementById(elementId);
    messageDiv.innerHTML = `<div class="message ${type}">${message}</div>`;
    
    setTimeout(() => {
        messageDiv.innerHTML = '';
    }, 5000);
}
