import os
import logging
import sqlite3
import json
from datetime import datetime, timedelta
from aiogram import Bot, Dispatcher, executor, types
from aiogram.types import (InlineKeyboardMarkup, InlineKeyboardButton, 
                          WebAppInfo, ReplyKeyboardMarkup, KeyboardButton)
from aiogram.contrib.fsm_storage.memory import MemoryStorage
from aiogram.dispatcher import FSMContext
from aiogram.dispatcher.filters.state import State, StatesGroup

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

API_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
if not API_TOKEN:
    logger.error("Не найден TELEGRAM_BOT_TOKEN")
    exit(1)

# Настройки администратора
ADMIN_IDS = [8341024077]  # Ваш ID
ADMIN_USERNAME = "Paymentprosu"
ADMIN_CONTACT = "the_boss_manger"

# URL Mini App (замените на ваш)
MINI_APP_URL = "https://youssefhassanein10.github.io/smart-service-webapp/"

# Инициализация бота
bot = Bot(token=API_TOKEN)
storage = MemoryStorage()
dp = Dispatcher(bot, storage=storage)

# Состояния для FSM
class AdminStates(StatesGroup):
    waiting_for_product_name = State()
    waiting_for_product_description = State()
    waiting_for_product_price = State()
    waiting_for_product_photo = State()
    waiting_for_report_date = State()

# Способы оплаты (будет настраиваться админом)
PAYMENT_METHODS = []

# ========================
# ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ
# ========================
def init_db():
    conn = sqlite3.connect('shop.db', check_same_thread=False)
    cursor = conn.cursor()
    
    # Таблица товаров
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            photo_url TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Таблица заказов
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            product_id INTEGER,
            product_name TEXT,
            amount REAL,
            order_date TEXT NOT NULL,
            order_time TEXT NOT NULL,
            payment_method TEXT,
            payment_details TEXT,
            admin_contact TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Таблица способов оплаты
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payment_methods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,  # 'card' или 'qr'
            details TEXT,
            is_active BOOLEAN DEFAULT TRUE
        )
    ''')
    
    # Добавляем стандартные способы оплаты если их нет
    cursor.execute('SELECT COUNT(*) FROM payment_methods')
    if cursor.fetchone()[0] == 0:
        default_payments = [
            ("QR НСПК", "qr", "Детали организации для QR кода"),
            ("Сбербанк", "card", "Номер карты: 0000 0000 0000 0000\nПолучатель: Иван Иванов"),
            ("Т-Банк", "card", "Номер карты: 1111 1111 1111 1111\nПолучатель: Петр Петров"),
            ("Альфа-Банк", "card", "Номер карты: 2222 2222 2222 2222\nПолучатель: Сергей Сергеев"),
            ("МТС Банк", "card", "Номер карты: 3333 3333 3333 3333\nПолучатель: Андрей Андреев"),
            ("Ozon Bank", "card", "Номер карты: 4444 4444 4444 4444\nПолучатель: Дмитрий Дмитриев")
        ]
        cursor.executemany('INSERT INTO payment_methods (name, type, details) VALUES (?, ?, ?)', default_payments)
    
    # Добавляем тестовые товары если их нет
    cursor.execute('SELECT COUNT(*) FROM products')
    if cursor.fetchone()[0] == 0:
        products = [
            ("Веб-разработка", "Создание сайта под ключ", 10000, ""),
            ("Дизайн интерфейса", "UI/UX дизайн", 5000, ""),
            ("Консультация", "Техническая консультация 1 час", 3000, "")
        ]
        cursor.executemany('INSERT INTO products (name, description, price, photo_url) VALUES (?, ?, ?, ?)', products)
    
    conn.commit()
    conn.close()
    logger.info("База данных инициализирована")

# ========================
# ФУНКЦИИ БАЗЫ ДАННЫХ
# ========================
def get_db_connection():
    return sqlite3.connect('shop.db', check_same_thread=False)

def get_products():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM products WHERE is_active = TRUE')
    products = cursor.fetchall()
    conn.close()
    return products

def get_product(product_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM products WHERE id = ?', (product_id,))
    product = cursor.fetchone()
    conn.close()
    return product

def add_product(name, description, price, photo_url=""):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('INSERT INTO products (name, description, price, photo_url) VALUES (?, ?, ?, ?)', 
                   (name, description, price, photo_url))
    product_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return product_id

def delete_product(product_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE products SET is_active = FALSE WHERE id = ?', (product_id,))
    conn.commit()
    conn.close()

def get_payment_methods():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM payment_methods WHERE is_active = TRUE')
    methods = cursor.fetchall()
    conn.close()
    return methods

def get_payment_method(method_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM payment_methods WHERE id = ?', (method_id,))
    method = cursor.fetchone()
    conn.close()
    return method

def create_order(user_id, username, product_id, product_name, amount, order_date, order_time, payment_method):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    payment_method_data = get_payment_method(payment_method)
    payment_details = payment_method_data[3] if payment_method_data else ""
    
    cursor.execute('''
        INSERT INTO orders (user_id, username, product_id, product_name, amount, 
                          order_date, order_time, payment_method, payment_details, admin_contact)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, username, product_id, product_name, amount, 
          order_date, order_time, payment_method, payment_details, ADMIN_CONTACT))
    
    order_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return order_id

def get_orders(date_from=None, date_to=None, payment_method=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = 'SELECT * FROM orders WHERE 1=1'
    params = []
    
    if date_from:
        query += ' AND DATE(created_at) >= ?'
        params.append(date_from)
    
    if date_to:
        query += ' AND DATE(created_at) <= ?'
        params.append(date_to)
    
    if payment_method:
        query += ' AND payment_method = ?'
        params.append(payment_method)
    
    query += ' ORDER BY created_at DESC'
    
    cursor.execute(query, params)
    orders = cursor.fetchall()
    conn.close()
    return orders

def get_order_stats(date_from=None, date_to=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = '''
        SELECT 
            payment_method,
            COUNT(*) as count,
            SUM(amount) as total_amount
        FROM orders 
        WHERE 1=1
    '''
    params = []
    
    if date_from:
        query += ' AND DATE(created_at) >= ?'
        params.append(date_from)
    
    if date_to:
        query += ' AND DATE(created_at) <= ?'
        params.append(date_to)
    
    query += ' GROUP BY payment_method ORDER BY total_amount DESC'
    
    cursor.execute(query, params)
    stats = cursor.fetchall()
    conn.close()
    return stats

# ========================
# КОМАНДА /start
# ========================
@dp.message_handler(commands=['start'])
async def send_welcome(message: types.Message):
    user_id = message.from_user.id
    username = message.from_user.username
    
    keyboard = InlineKeyboardMarkup(row_width=2)
    
    # Основные кнопки
    buttons = [
        InlineKeyboardButton("🛍️ Магазин", callback_data="menu_shop"),
        InlineKeyboardButton("📞 Контакты", callback_data="menu_contacts"),
        InlineKeyboardButton("📱 Mini App", web_app=WebAppInfo(url=MINI_APP_URL))
    ]
    
    # Кнопка админа если пользователь админ
    if user_id in ADMIN_IDS:
        buttons.append(InlineKeyboardButton("👨‍💼 Админ", callback_data="menu_admin"))
    
    keyboard.add(*buttons)
    
    await message.answer(
        f"👋 Добро пожаловать, {message.from_user.first_name}!\n\n"
        "🛍️ **Магазин услуг**\n"
        "💳 **6 способов оплаты**\n"
        "📊 **Полная отчетность**\n\n"
        "Выберите действие:",
        reply_markup=keyboard,
        parse_mode='Markdown'
    )

# ========================
# MINI APP - ОБРАБОТКА ДАННЫХ
# ========================
@dp.message_handler(content_types=['web_app_data'])
async def handle_web_app_data(message: types.Message):
    try:
        data = json.loads(message.web_app_data.data)
        logger.info(f"Данные из Mini App: {data}")
        
        if data.get('action') == 'create_order':
            # Создание заказа из Mini App
            product_id = data['product_id']
            product = get_product(product_id)
            
            if product:
                # Показываем способы оплаты
                payment_methods = get_payment_methods()
                keyboard = InlineKeyboardMarkup(row_width=2)
                
                for method in payment_methods:
                    keyboard.add(InlineKeyboardButton(
                        f"💳 {method[1]}", 
                        callback_data=f"pay_{method[0]}_{product_id}"
                    ))
                
                await message.answer(
                    f"🎁 **Товар из Mini App:** {product[1]}\n"
                    f"💵 **Сумма:** {product[3]:,}₽\n\n"
                    f"💳 **Выберите способ оплаты:**",
                    reply_markup=keyboard,
                    parse_mode='Markdown'
                )
        
    except Exception as e:
        logger.error(f"Ошибка обработки Mini App данных: {e}")
        await message.answer("❌ Ошибка обработки заказа")

# ========================
# ГЛАВНЫЙ ОБРАБОТЧИК CALLBACK
# ========================
@dp.callback_query_handler(lambda call: True)
async def handle_callback(call: types.CallbackQuery, state: FSMContext):
    await call.answer()
    
    if call.data == "menu_shop":
        await show_shop(call.message)
    elif call.data == "menu_contacts":
        await show_contacts(call.message)
    elif call.data == "menu_admin":
        await show_admin_panel(call.message)
    elif call.data == "menu_main":
        await show_main_menu(call.message)
    elif call.data.startswith("product_"):
        product_id = int(call.data.split("_")[1])
        await show_product(call.message, product_id)
    elif call.data.startswith("buy_"):
        product_id = int(call.data.split("_")[1])
        await start_order(call.message, state, product_id)
    elif call.data.startswith("pay_"):
        parts = call.data.split("_")
        payment_method_id = int(parts[1])
        product_id = int(parts[2])
        await process_payment(call, state, payment_method_id, product_id)
    elif call.data == "admin_products":
        await admin_products(call.message)
    elif call.data == "admin_orders":
        await admin_orders(call.message)
    elif call.data == "admin_reports":
        await admin_reports(call.message)
    elif call.data == "admin_payments":
        await admin_payments(call.message)
    elif call.data.startswith("delete_product_"):
        product_id = int(call.data.split("_")[2])
        await delete_product_handler(call.message, product_id)
    elif call.data.startswith("report_"):
        report_type = call.data.split("_")[1]
        await generate_report(call.message, report_type)

# ========================
# ПОКУПАТЕЛЬСКИЙ ФУНКЦИОНАЛ
# ========================
async def show_main_menu(message: types.Message):
    keyboard = InlineKeyboardMarkup(row_width=2)
    buttons = [
        InlineKeyboardButton("🛍️ Магазин", callback_data="menu_shop"),
        InlineKeyboardButton("📞 Контакты", callback_data="menu_contacts"),
        InlineKeyboardButton("📱 Mini App", web_app=WebAppInfo(url=MINI_APP_URL))
    ]
    
    if message.from_user.id in ADMIN_IDS:
        buttons.append(InlineKeyboardButton("👨‍💼 Админ", callback_data="menu_admin"))
    
    keyboard.add(*buttons)
    
    await message.edit_text("Главное меню. Выберите действие:", reply_markup=keyboard)

async def show_shop(message: types.Message):
    products = get_products()
    
    keyboard = InlineKeyboardMarkup(row_width=1)
    for product in products:
        keyboard.add(InlineKeyboardButton(
            f"🎁 {product[1]} - {product[3]:,}₽", 
            callback_data=f"product_{product[0]}"
        ))
    keyboard.add(InlineKeyboardButton("📱 Открыть Mini App", web_app=WebAppInfo(url=MINI_APP_URL)))
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="menu_main"))
    
    await message.edit_text(
        "🛍️ **Магазин услуг**\n\nВыберите товар или откройте Mini App для удобного заказа:",
        reply_markup=keyboard,
        parse_mode='Markdown'
    )

async def show_product(message: types.Message, product_id: int):
    product = get_product(product_id)
    
    if not product:
        await message.answer("❌ Товар не найден")
        return
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton("💰 Купить", callback_data=f"buy_{product_id}"))
    keyboard.add(InlineKeyboardButton("📱 Открыть в Mini App", web_app=WebAppInfo(url=f"{MINI_APP_URL}?product={product_id}")))
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="menu_shop"))
    
    caption = f"🎁 **{product[1]}**\n\n📝 {product[2]}\n\n💵 **Цена: {product[3]:,}₽**"
    
    if product[4]:  # Если есть фото
        await message.delete()
        await bot.send_photo(message.chat.id, product[4], caption=caption, reply_markup=keyboard, parse_mode='Markdown')
    else:
        await message.edit_text(caption, reply_markup=keyboard, parse_mode='Markdown')

async def start_order(message: types.Message, state: FSMContext, product_id: int):
    product = get_product(product_id)
    
    if not product:
        await message.answer("❌ Товар не найден")
        return
    
    payment_methods = get_payment_methods()
    keyboard = InlineKeyboardMarkup(row_width=2)
    
    for method in payment_methods:
        keyboard.add(InlineKeyboardButton(
            f"💳 {method[1]}", 
            callback_data=f"pay_{method[0]}_{product_id}"
        ))
    
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data=f"product_{product_id}"))
    
    await message.edit_text(
        f"🎁 **Товар:** {product[1]}\n"
        f"💵 **Сумма:** {product[3]:,}₽\n\n"
        f"💳 **Выберите способ оплаты:**",
        reply_markup=keyboard,
        parse_mode='Markdown'
    )

async def process_payment(call: types.CallbackQuery, state: FSMContext, payment_method_id: int, product_id: int):
    product = get_product(product_id)
    payment_method = get_payment_method(payment_method_id)
    
    if not product or not payment_method:
        await call.message.answer("❌ Ошибка обработки заказа")
        return
    
    # Создаем заказ с текущей датой и временем
    order_date = datetime.now().strftime("%d.%m.%Y")
    order_time = datetime.now().strftime("%H:%M")
    
    order_id = create_order(
        user_id=call.from_user.id,
        username=call.from_user.username or call.from_user.first_name,
        product_id=product_id,
        product_name=product[1],
        amount=product[3],
        order_date=order_date,
        order_time=order_time,
        payment_method=payment_method[1]
    )
    
    # Формируем сообщение с деталями заказа
    order_text = (
        f"✅ **Заказ оформлен!**\n\n"
        f"📋 **Детали заказа:**\n"
        f"• Номер: #{order_id}\n"
        f"• Товар: {product[1]}\n"
        f"• Сумма: {product[3]:,}₽\n"
        f"• Дата: {order_date}\n"
        f"• Время: {order_time}\n"
        f"• Способ оплаты: {payment_method[1]}\n\n"
        f"🏦 **Реквизиты для оплаты:**\n{payment_method[3]}\n\n"
        f"📞 **После оплаты свяжитесь с администратором:** @{ADMIN_CONTACT}\n"
        f"🔢 **Укажите номер заказа:** #{order_id}"
    )
    
    await call.message.edit_text(order_text, parse_mode='Markdown')

async def show_contacts(message: types.Message):
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="menu_main"))
    
    await message.edit_text(
        f"📞 **Контакты**\n\n"
        f"👤 **Администратор:** @{ADMIN_CONTACT}\n"
        f"💼 **Техподдержка:** @{ADMIN_USERNAME}\n\n"
        f"⏰ **Время работы:** 10:00 - 22:00\n"
        f"📧 **По всем вопросам:**\n"
        f"• Покупки услуг\n• Техническая поддержка\n• Сотрудничество",
        reply_markup=keyboard,
        parse_mode='Markdown'
    )

# ========================
# АДМИН-ПАНЕЛЬ
# ========================
async def show_admin_panel(message: types.Message):
    if message.from_user.id not in ADMIN_IDS:
        await message.answer("❌ Доступ запрещен")
        return
    
    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        InlineKeyboardButton("📦 Товары", callback_data="admin_products"),
        InlineKeyboardButton("📋 Заказы", callback_data="admin_orders"),
        InlineKeyboardButton("📊 Отчеты", callback_data="admin_reports"),
        InlineKeyboardButton("💳 Способы оплаты", callback_data="admin_payments"),
        InlineKeyboardButton("🔙 Назад", callback_data="menu_main")
    )
    
    # Статистика
    total_orders = len(get_orders())
    today_orders = len(get_orders(date_from=datetime.now().strftime("%Y-%m-%d")))
    
    await message.edit_text(
        f"👨‍💼 **Панель администратора**\n\n"
        f"📊 **Статистика:**\n"
        f"• Всего заказов: {total_orders}\n"
        f"• Заказов сегодня: {today_orders}\n\n"
        f"⚙️ **Управление:**",
        reply_markup=keyboard,
        parse_mode='Markdown'
    )

async def admin_products(message: types.Message):
    products = get_products()
    
    keyboard = InlineKeyboardMarkup()
    for product in products:
        keyboard.add(InlineKeyboardButton(
            f"🗑️ {product[1]} - {product[3]:,}₽", 
            callback_data=f"delete_product_{product[0]}"
        ))
    
    keyboard.add(InlineKeyboardButton("➕ Добавить товар", callback_data="add_product"))
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="menu_admin"))
    
    await message.edit_text(
        f"📦 **Управление товарами**\n\n"
        f"📋 **Список товаров ({len(products)}):**\n\n"
        f"Нажмите на товар чтобы удалить:",
        reply_markup=keyboard,
        parse_mode='Markdown'
    )

async def admin_orders(message: types.Message):
    orders = get_orders()[:10]  # Последние 10 заказов
    
    orders_text = "📋 **Последние заказы:**\n\n"
    for order in orders:
        orders_text += f"• #{order[0]} {order[5]} - {order[6]:,}₽ ({order[8]})\n"
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="menu_admin"))
    
    await message.edit_text(orders_text, reply_markup=keyboard, parse_mode='Markdown')

async def admin_reports(message: types.Message):
    keyboard = InlineKeyboardMarkup(row_width=2)
    keyboard.add(
        InlineKeyboardButton("📅 За сегодня", callback_data="report_today"),
        InlineKeyboardButton("📅 За неделю", callback_data="report_week"),
        InlineKeyboardButton("📅 За месяц", callback_data="report_month"),
        InlineKeyboardButton("📅 За все время", callback_data="report_all"),
        InlineKeyboardButton("🔙 Назад", callback_data="menu_admin")
    )
    
    await message.edit_text(
        "📊 **Генерация отчетов**\n\n"
        "Выберите период для отчета:",
        reply_markup=keyboard,
        parse_mode='Markdown'
    )

async def generate_report(message: types.Message, report_type: str):
    today = datetime.now().date()
    
    if report_type == "today":
        date_from = today.strftime("%Y-%m-%d")
        title = "сегодня"
    elif report_type == "week":
        date_from = (today - timedelta(days=7)).strftime("%Y-%m-%d")
        title = "за неделю"
    elif report_type == "month":
        date_from = (today - timedelta(days=30)).strftime("%Y-%m-%d")
        title = "за месяц"
    else:
        date_from = None
        title = "за все время"
    
    orders = get_orders(date_from=date_from)
    stats = get_order_stats(date_from=date_from)
    
    total_amount = sum(order[6] for order in orders)
    
    report_text = f"📊 **Отчет {title}**\n\n"
    report_text += f"📈 **Общая статистика:**\n"
    report_text += f"• Количество заказов: {len(orders)}\n"
    report_text += f"• Общая сумма: {total_amount:,}₽\n\n"
    
    report_text += f"💳 **По способам оплаты:**\n"
    for stat in stats:
        method_name = stat[0]
        count = stat[1]
        amount = stat[2]
        report_text += f"• {method_name}: {count} зак. на {amount:,}₽\n"
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="admin_reports"))
    
    await message.edit_text(report_text, reply_markup=keyboard, parse_mode='Markdown')

async def admin_payments(message: types.Message):
    payment_methods = get_payment_methods()
    
    payments_text = "💳 **Способы оплаты:**\n\n"
    for method in payment_methods:
        payments_text += f"• {method[1]} ({method[2]})\n"
    
    keyboard = InlineKeyboardMarkup()
    keyboard.add(InlineKeyboardButton("✏️ Редактировать", callback_data="edit_payments"))
    keyboard.add(InlineKeyboardButton("🔙 Назад", callback_data="menu_admin"))
    
    await message.edit_text(payments_text, reply_markup=keyboard, parse_mode='Markdown')

async def delete_product_handler(message: types.Message, product_id: int):
    delete_product(product_id)
    await message.answer("✅ Товар удален")
    await admin_products(message)

# ========================
# ЗАПУСК БОТА
# ========================
if __name__ == "__main__":
    init_db()
    logger.info("Бот запускается...")
    executor.start_polling(dp, skip_updates=True)
