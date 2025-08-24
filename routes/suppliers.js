// routes/suppliers.js
const express = require("express");
const { Supplier, Product } = require("../models");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const bcrypt = require("bcryptjs");
const router = express.Router();

// Получить всех поставщиков
router.get("/", authenticateToken, async (req, res) => {
  try {
    const suppliers = await Supplier.find()
      .select("-password")
      .sort({ createdAt: -1 });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// Создать нового поставщика
router.post("/", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name, username, password } = req.body;

    // Проверка существования
    const existing = await Supplier.findOne({ $or: [{ name }, { username }] });
    if (existing) {
      return res.status(400).json({ message: "Поставщик уже существует" });
    }

    const supplier = new Supplier({
      name,
      username,
      password,
    });

    await supplier.save();

    const supplierResponse = supplier.toObject();
    delete supplierResponse.password;

    res.status(201).json(supplierResponse);
  } catch (error) {
    res.status(500).json({ message: "Ошибка создания", error: error.message });
  }
});

// Обновить поставщика
router.put("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { name, isActive } = req.body;

    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { name, isActive },
      { new: true }
    ).select("-password");

    if (!supplier) {
      return res.status(404).json({ message: "Поставщик не найден" });
    }

    res.json(supplier);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Ошибка обновления", error: error.message });
  }
});

// Сбросить пароль поставщика
router.post(
  "/:id/reset-password",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const newPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      await Supplier.findByIdAndUpdate(req.params.id, {
        password: hashedPassword,
      });

      res.json({
        message: "Пароль сброшен",
        newPassword: newPassword,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Ошибка сброса пароля", error: error.message });
    }
  }
);

// Удалить поставщика
router.delete("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    await Supplier.findByIdAndDelete(req.params.id);
    res.json({ message: "Поставщик удален" });
  } catch (error) {
    res.status(500).json({ message: "Ошибка удаления", error: error.message });
  }
});

// Получить товары поставщика
router.get("/:id/products", authenticateToken, async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ message: "Поставщик не найден" });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const products = await Product.find({ supplier: supplier.name })
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ product: 1 });

    const total = await Product.countDocuments({ supplier: supplier.name });

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

module.exports = router;

// routes/products.js
const productsRouter = express.Router();

// Получить товары с фильтрацией
productsRouter.get("/", authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      branch,
      supplier,
      minQuantity,
      maxQuantity,
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { product: { $regex: search, $options: "i" } },
        { manufacturer: { $regex: search, $options: "i" } },
      ];
    }

    if (branch) {
      query.branch = branch;
    }

    if (supplier) {
      query.supplier = supplier;
    }

    if (minQuantity) {
      query.quantity = { $gte: parseInt(minQuantity) };
    }

    if (maxQuantity) {
      query.quantity = { ...query.quantity, $lte: parseInt(maxQuantity) };
    }

    const products = await Product.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ product: 1 });

    const total = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// Получить уникальные филиалы
productsRouter.get("/branches", authenticateToken, async (req, res) => {
  try {
    const branches = await Product.distinct("branch");
    res.json(branches.filter((b) => b));
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// Получить уникальных поставщиков
productsRouter.get("/suppliers", authenticateToken, async (req, res) => {
  try {
    const suppliers = await Product.distinct("supplier");
    res.json(suppliers.filter((s) => s));
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// routes/statistics.js
const statisticsRouter = express.Router();

// Получить общую статистику
statisticsRouter.get("/overview", authenticateToken, async (req, res) => {
  try {
    const { dateRange = "month", branch } = req.query;

    // Определение периода
    const now = new Date();
    let startDate;

    switch (dateRange) {
      case "today":
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case "week":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "month":
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case "year":
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setMonth(now.getMonth() - 1));
    }

    // Базовый фильтр
    const baseFilter = { saleDate: { $gte: startDate } };
    if (branch && branch !== "all") {
      baseFilter.branch = branch;
    }

    // Получение данных
    const [
      totalRevenue,
      totalSales,
      totalProducts,
      activeDoctors,
      salesByDay,
      salesByCategory,
      salesByBranch,
      topProducts,
      supplierStats,
    ] = await Promise.all([
      // Общая выручка
      Sale.aggregate([
        { $match: baseFilter },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),

      // Всего продаж
      Sale.countDocuments(baseFilter),

      // Товаров в наличии
      Product.countDocuments({ quantity: { $gt: 0 } }),

      // Активных докторов
      Doctor.countDocuments({ isActive: true }),

      // Продажи по дням
      Sale.aggregate([
        { $match: baseFilter },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$saleDate" } },
            revenue: { $sum: "$totalAmount" },
            sales: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Продажи по категориям
      Product.aggregate([
        {
          $group: {
            _id: "$category",
            value: { $sum: { $multiply: ["$quantity", "$salePrice"] } },
          },
        },
        { $sort: { value: -1 } },
        { $limit: 6 },
      ]),

      // Продажи по филиалам
      Product.aggregate([
        {
          $group: {
            _id: "$branch",
            revenue: { $sum: { $multiply: ["$quantity", "$salePrice"] } },
            sales: { $sum: "$quantity" },
          },
        },
        { $sort: { revenue: -1 } },
      ]),

      // Топ товары
      Product.find({ quantity: { $gt: 0 } })
        .sort({ quantity: -1 })
        .limit(10)
        .select("product supplier quantity salePrice"),

      // Статистика поставщиков
      Supplier.aggregate([
        {
          $lookup: {
            from: "products",
            localField: "name",
            foreignField: "supplier",
            as: "products",
          },
        },
        {
          $project: {
            name: 1,
            products: { $size: "$products" },
            revenue: {
              $sum: {
                $map: {
                  input: "$products",
                  as: "product",
                  in: {
                    $multiply: ["$$product.quantity", "$$product.salePrice"],
                  },
                },
              },
            },
            sold: { $sum: "$products.quantity" },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),
    ]);

    // Расчет изменений
    const previousPeriodFilter = {
      saleDate: {
        $gte: new Date(startDate.getTime() - (now - startDate)),
        $lt: startDate,
      },
    };

    const previousRevenue = await Sale.aggregate([
      { $match: previousPeriodFilter },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    const revenueChange = previousRevenue[0]
      ? ((totalRevenue[0]?.total - previousRevenue[0].total) /
          previousRevenue[0].total) *
        100
      : 0;

    res.json({
      totalRevenue: totalRevenue[0]?.total || 0,
      revenueChange: Math.round(revenueChange),
      totalSales,
      salesChange: 0, // Calculate if needed
      totalProducts,
      productsChange: 0, // Calculate if needed
      activeDoctors,
      doctorsChange: 0, // Calculate if needed
      salesByDay: salesByDay.map((d) => ({ date: d._id, ...d })),
      salesByCategory: salesByCategory.map((c) => ({
        name: c._id || "Другое",
        value: c.value,
      })),
      salesByBranch: salesByBranch.map((b) => ({ branch: b._id, ...b })),
      topProducts: topProducts.map((p) => ({
        name: p.product,
        supplier: p.supplier,
        sales: p.quantity,
      })),
      supplierStats: supplierStats.map((s) => ({
        ...s,
        trend: Math.floor(Math.random() * 40) - 20, // Mock trend data
      })),
      branches: await Product.distinct("branch"),
    });
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// Статус синхронизации
statisticsRouter.get("/sync-status", authenticateToken, async (req, res) => {
  try {
    const osonKassaSync = require("../services/osonKassaSync");
    const status = await osonKassaSync.getSyncStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

// Запустить синхронизацию вручную
statisticsRouter.post(
  "/sync/manual",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const osonKassaSync = require("../services/osonKassaSync");

      // Запускаем асинхронно
      osonKassaSync.fullSync();

      res.json({
        message: "Синхронизация запущена",
        status: "processing",
      });
    } catch (error) {
      res
        .status(500)
        .json({
          message: "Ошибка запуска синхронизации",
          error: error.message,
        });
    }
  }
);

module.exports = {
  suppliersRouter: router,
  productsRouter,
  statisticsRouter,
};
