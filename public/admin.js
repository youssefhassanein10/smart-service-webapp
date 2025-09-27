// Функция для сохранения настроек магазина
async function saveShopSettings() {
    const form = document.getElementById('shopSettingsForm');
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    
    try {
        // Показываем индикатор загрузки
        submitButton.textContent = 'Сохранение...';
        submitButton.disabled = true;

        // Собираем данные формы
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        console.log('📤 Отправка данных:', data);

        // Валидация
        if (!data.shop_name || !data.shop_name.trim()) {
            alert('⚠️ Введите название магазина');
            return;
        }

        if (!data.holder_name || !data.holder_name.trim()) {
            alert('⚠️ Введите имя держателя');
            return;
        }

        // Отправляем запрос
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
        // Восстанавливаем кнопку
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

// Функция загрузки настроек
async function loadShopSettings() {
    try {
        const response = await fetch('/api/shop-settings');
        const settings = await response.json();
        
        // Заполняем форму
        for (const key in settings) {
            const input = document.querySelector(`[name="${key}"]`);
            if (input && settings[key] !== null && settings[key] !== undefined) {
                input.value = settings[key];
            }
        }
        
        console.log('✅ Настройки загружены');
    } catch (error) {
        console.error('❌ Ошибка загрузки:', error);
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
        const data = Object.fromEntries(formData.entries());

        // Валидация
        if (!data.article || !data.name || !data.price) {
            alert('⚠️ Заполните артикул, название и цену');
            return;
        }

        const response = await fetch('/api/services', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            alert('✅ Услуга добавлена!');
            form.reset();
            document.querySelector('.image-preview').innerHTML = '';
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

// Функция предпросмотра изображения
function previewImage(input) {
    const preview = document.querySelector('.image-preview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" style="max-width: 200px;">`;
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// Функция переключения вкладок
function openTab(tabName) {
    // Скрываем все вкладки
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Показываем выбранную вкладку
    document.getElementById(tabName).classList.add('active');
    
    // Обновляем активные кнопки
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Админ-панель загружена');
    
    // Загружаем настройки
    loadShopSettings();
    
    // Настраиваем обработчики событий
    document.getElementById('shopSettingsForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveShopSettings();
    });
    
    document.getElementById('serviceForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveService();
    });
    
    document.querySelector('input[name="image"]').addEventListener('change', function(e) {
        previewImage(e.target);
    });
    
    // Проверяем соединение с сервером
    fetch('/api/debug')
        .then(response => response.json())
        .then(data => {
            console.log('🔧 Диагностика сервера:', data);
            if (data.status === 'connected') {
                console.log('✅ Сервер и база данных работают нормально');
            }
        })
        .catch(error => {
            console.error('❌ Ошибка диагностики:', error);
        });
});
