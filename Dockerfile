# Используем официальный Node.js образ
FROM node:18

# Создаем рабочую папку
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем все файлы проекта
COPY . .

# Указываем порт
EXPOSE 3000

# Запускаем сервер
CMD ["npm", "start"]
