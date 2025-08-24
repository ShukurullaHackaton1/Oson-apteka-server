// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { createServer } = require("http");
const { Server } = require("socket.io");

// Routes
const authRoutes = require("./routes/auth");
const doctorRoutes = require("./routes/doctors");
const medicineRoutes = require("./routes/medicines");
const saleRoutes = require("./routes/sales");
const dashboardRoutes = require("./routes/dashboard");
const {
  suppliersRouter,
  productsRouter,
  statisticsRouter,
} = require("./routes/suppliers");

// Services
const osonKassaSync = require("./services/osonKassaSync");
const telegramBot = require("./bot/telegramBotRu");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan("combined"));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов за период
  message: "Слишком много запросов с этого IP, попробуйте позже",
});
app.use("/api/", limiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Socket.io global
global.io = io;

// MongoDB connection
mongoose
  .connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/pharmacy_management",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
  .then(() => {
    console.log("✅ Подключение к MongoDB успешно");
  })
  .catch((error) => {
    console.error("❌ Ошибка подключения к MongoDB:", error);
    process.exit(1);
  });

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/products", productsRouter);
app.use("/api/statistics", statisticsRouter);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Sync status endpoint
app.get("/api/sync/status", async (req, res) => {
  try {
    const status = await osonKassaSync.getSyncStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Ошибка:", err);
  res.status(err.status || 500).json({
    message: err.message || "Внутренняя ошибка сервера",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "API endpoint не найден" });
});

// Socket.io connections
io.on("connection", (socket) => {
  console.log("👤 Новый пользователь подключен:", socket.id);

  socket.on("disconnect", () => {
    console.log("👤 Пользователь отключен:", socket.id);
  });

  socket.on("join_admin", () => {
    socket.join("admin_room");
    console.log("👨‍💼 Админ присоединился:", socket.id);
  });

  socket.on("join_supplier", (supplierId) => {
    socket.join(`supplier_${supplierId}`);
    console.log("📦 Поставщик присоединился:", socket.id, supplierId);
  });

  socket.on("join_doctor", (doctorId) => {
    socket.join(`doctor_${doctorId}`);
    console.log("👨‍⚕️ Доктор присоединился:", socket.id, doctorId);
  });
});

// Socket.io events for real-time updates
const emitSyncUpdate = (status) => {
  io.to("admin_room").emit("sync_update", {
    status,
    timestamp: new Date(),
  });
};

const emitNewSale = (sale) => {
  io.to("admin_room").emit("new_sale", {
    sale,
    timestamp: new Date(),
  });

  // Notify specific doctor
  if (sale.doctor) {
    io.to(`doctor_${sale.doctor}`).emit("sale_created", {
      sale,
      timestamp: new Date(),
    });
  }
};

const emitProductUpdate = (products) => {
  io.to("admin_room").emit("products_updated", {
    products,
    timestamp: new Date(),
  });

  // Notify suppliers
  const suppliers = [...new Set(products.map((p) => p.supplier))];
  suppliers.forEach((supplier) => {
    io.to(`supplier_${supplier}`).emit("products_updated", {
      products: products.filter((p) => p.supplier === supplier),
      timestamp: new Date(),
    });
  });
};

// Export emit functions for use in services
global.emitSyncUpdate = emitSyncUpdate;
global.emitNewSale = emitNewSale;
global.emitProductUpdate = emitProductUpdate;

const PORT = process.env.PORT || 3003;

server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(
    `🌐 Админ панель: ${process.env.FRONTEND_URL || "http://localhost:5173"}`
  );
  console.log(`📱 Режим: ${process.env.NODE_ENV || "development"}`);

  // Запуск синхронизации с Oson Kassa
  osonKassaSync.startScheduler();
  console.log("⏰ Планировщик синхронизации Oson Kassa запущен");

  // Инициализация Telegram бота
  telegramBot.start();
  console.log("🤖 Telegram бот запущен");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM сигнал получен, закрытие сервера...");

  server.close(() => {
    console.log("HTTP сервер закрыт");

    mongoose.connection.close(false, () => {
      console.log("MongoDB соединение закрыто");
      process.exit(0);
    });
  });
});

process.on("SIGINT", () => {
  console.log("\nSIGINT сигнал получен, закрытие сервера...");

  server.close(() => {
    console.log("HTTP сервер закрыт");

    mongoose.connection.close(false, () => {
      console.log("MongoDB соединение закрыто");
      process.exit(0);
    });
  });
});
