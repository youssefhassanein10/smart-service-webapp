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
        const data = {};
        
        // Преобразуем FormData в объект
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }

        console.log('📤 Отправляемые данные:', data);

        // Валидация обязательных полей
        if (!data.shop_name || data.shop_name.trim() === '') {
            alert('⚠️ Пожалуйста, заполните название магазина');
            return;
        }

        if (!data.holder_name || data.holder_name.trim() === '') {
            alert('⚠️ Пожалуйста, заполните имя держателя');
            return;
        }

        // Отправляем запрос на сервер
        const response = await fetch('/api/shop-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        console.log('📥 Ответ сервера:', response.status, response.statusText);

        // Парсим ответ
        const result = await response.json();
        console.log('📋 Данные ответа:', result);

        if (response.ok) {
            alert('✅ Настройки успешно сохранены!');
            console.log('💾 Настройки сохранены:', result);
            
            // Обновляем данные на странице
            await loadShopSettings();
        } else {
            // Обрабатываем ошибки сервера
            const errorMessage = result.error || result.message || `Ошибка ${response.status}`;
            throw new Error(errorMessage);
        }

    } catch (error) {
        console.error('❌ Ошибка сохранения настроек:', error);
        
        // Более информативное сообщение об ошибке
        let errorMessage = 'Неизвестная ошибка';
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Ошибка соединения с сервером. Проверьте интернет-соединение.';
        } else if (error.message.includes('500')) {
            errorMessage = 'Ошибка на сервере. Попробуйте позже.';
        } else if (error.message.includes('404')) {
            errorMessage = 'Сервер не найден. Проверьте URL адреса.';
        } else {
            errorMessage = error.message;
        }
        
        alert('❌ Ошибка сохранения настроек: ' + errorMessage);
    } finally {
        // Восстанавливаем кнопку
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

// Также обновим функцию loadShopSettings для лучшей обработки ошибок
async function loadShopSettings() {
    try {
        console.log('🔄 Загрузка настроек магазина...');
        
        const response = await fetch('/api/shop-settings');
        
        if (!response.ok) {
            throw new Error(`Ошибка загрузки: ${response.status}`);
        }
        
        const settings = await response.json();
        console.log('📖 Загруженные настройки:', settings);
        
        // Заполняем форму данными
        for (const key in settings) {
            const input = document.querySelector(`[name="${key}"]`);
            if (input && settings[key] !== null) {
                input.value = settings[key];
            }
        }
        
    } catch (error) {
        console.error('❌ Ошибка загрузки настроек:', error);
        
        // Устанавливаем значения по умолчанию
        document.querySelector('[name="shop_name"]').value = 'Smart Service';
        console.log('📝 Установлены значения по умолчанию');
    }
}

// Добавим функцию для проверки соединения с сервером
async function checkServerConnection() {
    try {
        const response = await fetch('/api/shop-settings');
        return response.ok;
    } catch (error) {
        console.error('🔌 Сервер недоступен:', error);
        return false;
    }
}

// Обновим обработчик загрузки страницы
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Админ-панель загружается...');
    
    // Проверяем соединение с сервером
    checkServerConnection().then(isConnected => {
        if (isConnected) {
            console.log('✅ Соединение с сервером установлено');
            loadShopSettings();
        } else {
            console.log('⚠️ Сервер недоступен');
            alert('⚠️ Сервер временно недоступен. Некоторые функции могут не работать.');
        }
    });
    
    setupEventListeners();
});
