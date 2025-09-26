const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Чтобы Express понимал JSON
app.use(express.json());

// Пример API: список товаров
app.get("/api/products/:id", (req, res) => {
  res.json({ id: req.params.id, title: "Пример товара" });
});

// Отдаём статические файлы (ваш фронтенд в public/)
app.use(express.static("public"));

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
