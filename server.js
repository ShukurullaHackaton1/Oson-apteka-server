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
const cron = require("cron");

// Routes
const authRoutes = require("./routes/auth");
const doctorRoutes = require("./routes/doctors");
const medicineRoutes = require("./routes/medicines");
const saleRoutes = require("./routes/sales");
const dashboardRoutes = require("./routes/dashboard");

// Services
const { syncERPData } = require("./services/erpSync");
const telegramBot = require("./bot/telegramBot");

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
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use("/api/", limiter);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Socket.io
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
    console.log("✅ MongoDB ga ulanish muvaffaqiyatli");
  })
  .catch((error) => {
    console.error("❌ MongoDB ulanish xatosi:", error);
    process.exit(1);
  });

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/sales", saleRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Ichki server xatosi",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "API endpoint topilmadi" });
});

// Cron job - ERP ma'lumotlarini har 15 daqiqada yangilash
const erpSyncJob = new cron.CronJob("*/15 * * * *", async () => {
  console.log("🔄 ERP ma'lumotlarini yangilash boshlandi...");
  try {
    await syncERPData();
    console.log("✅ ERP ma'lumotlari muvaffaqiyatli yangilandi");

    // Real-time update
    io.emit("erp_data_updated", {
      timestamp: new Date(),
      message: "Ma'lumotlar yangilandi",
    });
  } catch (error) {
    console.error("❌ ERP yangilash xatosi:", error);
  }
});

// Socket.io connections
io.on("connection", (socket) => {
  console.log("👤 Yangi foydalanuvchi ulandi:", socket.id);

  socket.on("disconnect", () => {
    console.log("👤 Foydalanuvchi uzildi:", socket.id);
  });

  socket.on("join_admin", () => {
    socket.join("admin_room");
    console.log("👨‍💼 Admin xonasiga qo'shildi:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portda ishlamoqda`);
  console.log(`🌐 Admin panel: http://localhost:5173`);

  // Start cron job
  erpSyncJob.start();
  console.log("⏰ ERP sinxronizatsiya boshlanди (har 15 daqiqada)");

  // Initialize Telegram bot
  telegramBot.start();
  console.log("🤖 Telegram bot ishga tushdi");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal olindi, server yopilmoqda...");
  erpSyncJob.stop();
  server.close(() => {
    mongoose.connection.close();
    process.exit(0);
  });
});
