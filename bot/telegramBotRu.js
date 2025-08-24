// bot/telegramBotRu.js
const TelegramBot = require("node-telegram-bot-api");
const { Doctor, Product, Sale, Supplier } = require("../models");

class PharmacyBotRu {
  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: true,
    });
    this.userStates = new Map();
    this.setupHandlers();
  }

  setupHandlers() {
    // Команда Start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;

      await this.bot.sendMessage(
        chatId,
        "🏥 Добро пожаловать в систему управления аптекой!\n\n" +
          "Выберите тип входа:",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "👨‍⚕️ Доктор", callback_data: "login_doctor" }],
              [{ text: "📦 Поставщик", callback_data: "login_supplier" }],
            ],
          },
        }
      );
    });

    // Обработка callback кнопок
    this.bot.on("callback_query", async (query) => {
      const chatId = query.message.chat.id;
      const data = query.data;

      if (data === "login_doctor") {
        this.userStates.set(chatId, { type: "doctor", step: "username" });
        await this.bot.sendMessage(
          chatId,
          "👨‍⚕️ Вход для доктора\n\nВведите ваш логин:"
        );
      } else if (data === "login_supplier") {
        this.userStates.set(chatId, { type: "supplier", step: "username" });
        await this.bot.sendMessage(
          chatId,
          "📦 Вход для поставщика\n\nВведите ваш логин:"
        );
      } else if (data.startsWith("page_")) {
        await this.handlePagination(chatId, data);
      } else if (data.startsWith("branch_")) {
        await this.showBranchProducts(chatId, data);
      }

      await this.bot.answerCallbackQuery(query.id);
    });

    // Обработка текстовых сообщений
    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;

      if (!text || text.startsWith("/")) return;

      const userState = this.userStates.get(chatId);

      if (userState) {
        await this.handleLogin(chatId, text, userState);
      } else {
        await this.handleMainMenu(chatId, text);
      }
    });
  }

  // Обработка процесса входа
  async handleLogin(chatId, text, userState) {
    if (userState.type === "doctor") {
      if (userState.step === "username") {
        userState.username = text;
        userState.step = "password";
        this.userStates.set(chatId, userState);
        await this.bot.sendMessage(chatId, "Введите пароль:");
      } else if (userState.step === "password") {
        const doctor = await Doctor.findOne({
          username: userState.username,
          isActive: true,
        });

        if (!doctor || !(await doctor.comparePassword(text))) {
          this.userStates.delete(chatId);
          return await this.bot.sendMessage(
            chatId,
            "❌ Неверный логин или пароль!\n\nПопробуйте снова: /start"
          );
        }

        doctor.telegramId = chatId.toString();
        doctor.lastLogin = new Date();
        await doctor.save();

        this.userStates.delete(chatId);
        await this.showDoctorMenu(chatId, doctor);
      }
    } else if (userState.type === "supplier") {
      if (userState.step === "username") {
        userState.username = text;
        userState.step = "password";
        this.userStates.set(chatId, userState);
        await this.bot.sendMessage(chatId, "Введите пароль:");
      } else if (userState.step === "password") {
        const supplier = await Supplier.findOne({
          username: userState.username,
          isActive: true,
        });

        if (!supplier || !(await supplier.comparePassword(text))) {
          this.userStates.delete(chatId);
          return await this.bot.sendMessage(
            chatId,
            "❌ Неверный логин или пароль!\n\nПопробуйте снова: /start"
          );
        }

        supplier.telegramId = chatId.toString();
        supplier.lastLogin = new Date();
        await supplier.save();

        this.userStates.delete(chatId);
        await this.showSupplierMenu(chatId, supplier);
      }
    }
  }

  // Меню доктора
  async showDoctorMenu(chatId, doctor) {
    await this.bot.sendMessage(
      chatId,
      `✅ Добро пожаловать, Доктор ${doctor.firstName} ${doctor.lastName}!\n\n` +
        `🏥 Специализация: ${doctor.specialization || "Общая практика"}\n` +
        `🔑 Код: ${doctor.adminCode}\n\n` +
        `Выберите действие:`,
      {
        reply_markup: {
          keyboard: [
            ["📋 Мои продажи", "📊 Статистика"],
            ["➕ Новая продажа", "📈 Отчеты"],
            ["⚙️ Профиль", "🔄 Обновить"],
          ],
          resize_keyboard: true,
        },
      }
    );
  }

  // Меню поставщика
  async showSupplierMenu(chatId, supplier) {
    await this.bot.sendMessage(
      chatId,
      `✅ Добро пожаловать, ${supplier.name}!\n\n` +
        `📦 Всего товаров: ${supplier.statistics.totalProducts}\n` +
        `🏪 Филиалов: ${supplier.statistics.totalBranches}\n\n` +
        `Выберите действие:`,
      {
        reply_markup: {
          keyboard: [
            ["📦 Мои товары", "📊 Остатки"],
            ["🏪 По филиалам", "📈 Статистика"],
            ["🔍 Поиск товара", "🔄 Обновить"],
          ],
          resize_keyboard: true,
        },
      }
    );
  }

  // Обработка главного меню
  async handleMainMenu(chatId, text) {
    // Проверяем, авторизован ли пользователь
    const doctor = await Doctor.findOne({ telegramId: chatId.toString() });
    const supplier = await Supplier.findOne({ telegramId: chatId.toString() });

    if (!doctor && !supplier) {
      return await this.bot.sendMessage(
        chatId,
        "❌ Необходимо войти в систему!\n\nИспользуйте команду: /start"
      );
    }

    if (supplier) {
      await this.handleSupplierMenu(chatId, text, supplier);
    } else if (doctor) {
      await this.handleDoctorMenu(chatId, text, doctor);
    }
  }

  // Обработка меню поставщика
  async handleSupplierMenu(chatId, text, supplier) {
    switch (text) {
      case "📦 Мои товары":
        await this.showSupplierProducts(chatId, supplier, 1);
        break;

      case "📊 Остатки":
        await this.showProductStatistics(chatId, supplier);
        break;

      case "🏪 По филиалам":
        await this.showBranchList(chatId, supplier);
        break;

      case "📈 Статистика":
        await this.showSupplierStatistics(chatId, supplier);
        break;

      case "🔍 Поиск товара":
        await this.bot.sendMessage(
          chatId,
          "🔍 Введите название товара для поиска:"
        );
        this.userStates.set(chatId, {
          type: "search_product",
          supplierId: supplier._id,
        });
        break;

      case "🔄 Обновить":
        await this.bot.sendMessage(chatId, "🔄 Обновление данных...");
        setTimeout(async () => {
          await this.bot.sendMessage(chatId, "✅ Данные обновлены!");
        }, 1000);
        break;
    }
  }

  // Показать товары поставщика с пагинацией
  async showSupplierProducts(chatId, supplier, page = 1) {
    const perPage = 10;
    const skip = (page - 1) * perPage;

    const products = await Product.find({ supplier: supplier.name })
      .sort({ product: 1 })
      .skip(skip)
      .limit(perPage);

    const totalProducts = await Product.countDocuments({
      supplier: supplier.name,
    });
    const totalPages = Math.ceil(totalProducts / perPage);

    if (products.length === 0) {
      return await this.bot.sendMessage(
        chatId,
        "📦 У вас пока нет товаров в системе."
      );
    }

    let message = `📦 *Ваши товары (страница ${page}/${totalPages}):*\n\n`;

    products.forEach((product, index) => {
      const num = skip + index + 1;
      message += `${num}. *${product.product}*\n`;
      message += `   📍 Филиал: ${product.branch}\n`;
      message += `   📊 Остаток: ${product.quantity} ${product.unit}\n`;
      message += `   💰 Цена: ${product.salePrice?.toLocaleString(
        "ru-RU"
      )} сум\n\n`;
    });

    // Кнопки пагинации
    const keyboard = [];
    const paginationRow = [];

    if (page > 1) {
      paginationRow.push({
        text: "⬅️ Назад",
        callback_data: `page_supplier_${page - 1}`,
      });
    }

    paginationRow.push({
      text: `${page}/${totalPages}`,
      callback_data: "current_page",
    });

    if (page < totalPages) {
      paginationRow.push({
        text: "Вперед ➡️",
        callback_data: `page_supplier_${page + 1}`,
      });
    }

    if (paginationRow.length > 0) {
      keyboard.push(paginationRow);
    }

    await this.bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: keyboard,
      },
    });
  }

  // Показать статистику остатков
  async showProductStatistics(chatId, supplier) {
    const stats = await Product.aggregate([
      { $match: { supplier: supplier.name } },
      {
        $group: {
          _id: "$branch",
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalValue: { $sum: { $multiply: ["$quantity", "$salePrice"] } },
        },
      },
      { $sort: { totalValue: -1 } },
    ]);

    let message = "📊 *Статистика остатков по филиалам:*\n\n";

    stats.forEach((stat, index) => {
      message += `${index + 1}. *${stat._id}*\n`;
      message += `   📦 Товаров: ${stat.totalProducts}\n`;
      message += `   📊 Общее кол-во: ${stat.totalQuantity}\n`;
      message += `   💰 Стоимость: ${stat.totalValue.toLocaleString(
        "ru-RU"
      )} сум\n\n`;
    });

    await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  // Показать список филиалов
  async showBranchList(chatId, supplier) {
    const branches = await Product.distinct("branch", {
      supplier: supplier.name,
    });

    if (branches.length === 0) {
      return await this.bot.sendMessage(chatId, "🏪 Нет доступных филиалов.");
    }

    const keyboard = branches.map((branch) => [
      {
        text: `🏪 ${branch}`,
        callback_data: `branch_${branch.substring(0, 20)}`,
      },
    ]);

    await this.bot.sendMessage(
      chatId,
      "🏪 *Выберите филиал для просмотра товаров:*",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: keyboard,
        },
      }
    );
  }

  // Показать товары в филиале
  async showBranchProducts(chatId, data) {
    const branchName = data.replace("branch_", "");

    const products = await Product.find({
      branch: new RegExp(branchName, "i"),
    }).limit(10);

    let message = `🏪 *Товары в филиале:*\n\n`;

    products.forEach((product, index) => {
      message += `${index + 1}. *${product.product}*\n`;
      message += `   📊 Остаток: ${product.quantity} ${product.unit}\n`;
      message += `   💰 Цена: ${product.salePrice?.toLocaleString(
        "ru-RU"
      )} сум\n\n`;
    });

    await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  // Обработка пагинации
  async handlePagination(chatId, data) {
    const parts = data.split("_");
    const type = parts[1];
    const page = parseInt(parts[2]);

    if (type === "supplier") {
      const supplier = await Supplier.findOne({
        telegramId: chatId.toString(),
      });
      if (supplier) {
        await this.showSupplierProducts(chatId, supplier, page);
      }
    }
  }

  // Показать статистику поставщика
  async showSupplierStatistics(chatId, supplier) {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));

    const stats = await Product.aggregate([
      { $match: { supplier: supplier.name } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: "$quantity" },
          totalValue: { $sum: { $multiply: ["$quantity", "$salePrice"] } },
          avgPrice: { $avg: "$salePrice" },
          branches: { $addToSet: "$branch" },
        },
      },
    ]);

    const stat = stats[0] || {
      totalProducts: 0,
      totalQuantity: 0,
      totalValue: 0,
      avgPrice: 0,
      branches: [],
    };

    const message =
      `📈 *Общая статистика:*\n\n` +
      `📦 Всего товаров: ${stat.totalProducts}\n` +
      `📊 Общий остаток: ${stat.totalQuantity}\n` +
      `💰 Общая стоимость: ${stat.totalValue.toLocaleString("ru-RU")} сум\n` +
      `💵 Средняя цена: ${Math.round(stat.avgPrice).toLocaleString(
        "ru-RU"
      )} сум\n` +
      `🏪 Филиалов: ${stat.branches.length}\n\n` +
      `🕒 Последнее обновление: ${
        supplier.statistics.lastSync?.toLocaleString("ru-RU") || "Не определено"
      }`;

    await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  // Обработка меню доктора
  async handleDoctorMenu(chatId, text, doctor) {
    switch (text) {
      case "📋 Мои продажи":
        await this.showDoctorSales(chatId, doctor._id);
        break;

      case "📊 Статистика":
        await this.showDoctorStatistics(chatId, doctor._id);
        break;

      case "➕ Новая продажа":
        await this.startNewSale(chatId, doctor._id);
        break;

      case "📈 Отчеты":
        await this.showDoctorReports(chatId, doctor._id);
        break;

      case "⚙️ Профиль":
        await this.showDoctorProfile(chatId, doctor);
        break;

      case "🔄 Обновить":
        await this.bot.sendMessage(chatId, "🔄 Обновление данных...");
        setTimeout(async () => {
          await this.bot.sendMessage(chatId, "✅ Данные обновлены!");
        }, 1000);
        break;
    }
  }

  // Показать продажи доктора
  async showDoctorSales(chatId, doctorId) {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));

    const sales = await Sale.find({
      doctor: doctorId,
      saleDate: { $gte: startOfDay },
    })
      .populate("medicines.medicine")
      .sort({ saleDate: -1 })
      .limit(10);

    if (sales.length === 0) {
      return await this.bot.sendMessage(
        chatId,
        "📋 Сегодня у вас еще нет продаж."
      );
    }

    let message = "📋 *Ваши продажи за сегодня:*\n\n";
    let totalAmount = 0;

    sales.forEach((sale, index) => {
      message += `${index + 1}. 🕒 ${sale.saleDate.toLocaleTimeString(
        "ru-RU"
      )}\n`;
      message += `💰 Сумма: ${sale.totalAmount.toLocaleString("ru-RU")} сум\n`;
      message += `📦 Лекарства:\n`;

      sale.medicines.forEach((item) => {
        message += `   • ${item.medicine.name} - ${item.quantity} ${item.medicine.unit}\n`;
      });
      message += "\n";
      totalAmount += sale.totalAmount;
    });

    message += `📊 *Общая сумма: ${totalAmount.toLocaleString("ru-RU")} сум*`;

    await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  // Показать статистику доктора
  async showDoctorStatistics(chatId, doctorId) {
    const today1 = new Date();
    const startOfDay = new Date(today1.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(today1.setDate(today1.getDate() - 7));
    const startOfMonth = new Date(today1.setDate(today1.getDate() - 30));

    const [todayStats, weekStats, monthStats] = await Promise.all([
      Sale.aggregate([
        {
          $match: {
            doctor: doctorId,
            saleDate: { $gte: startOfDay },
          },
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]),
      Sale.aggregate([
        {
          $match: {
            doctor: doctorId,
            saleDate: { $gte: startOfWeek },
          },
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]),
      Sale.aggregate([
        {
          $match: {
            doctor: doctorId,
            saleDate: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]),
    ]);

    const today = todayStats[0] || { totalSales: 0, totalAmount: 0 };
    const week = weekStats[0] || { totalSales: 0, totalAmount: 0 };
    const month = monthStats[0] || { totalSales: 0, totalAmount: 0 };

    const message =
      `📊 *Ваша статистика:*\n\n` +
      `📅 *Сегодня:*\n` +
      `   🛒 Продаж: ${today.totalSales}\n` +
      `   💰 Сумма: ${today.totalAmount.toLocaleString("ru-RU")} сум\n\n` +
      `📅 *За неделю:*\n` +
      `   🛒 Продаж: ${week.totalSales}\n` +
      `   💰 Сумма: ${week.totalAmount.toLocaleString("ru-RU")} сум\n\n` +
      `📅 *За месяц:*\n` +
      `   🛒 Продаж: ${month.totalSales}\n` +
      `   💰 Сумма: ${month.totalAmount.toLocaleString("ru-RU")} сум`;

    await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  // Показать профиль доктора
  async showDoctorProfile(chatId, doctor) {
    const message =
      `👨‍⚕️ *Профиль:*\n\n` +
      `👤 Имя: ${doctor.firstName} ${doctor.lastName}\n` +
      `🏥 Специализация: ${doctor.specialization || "Не указана"}\n` +
      `📱 Телефон: ${doctor.phone || "Не указан"}\n` +
      `🔑 Код: ${doctor.adminCode}\n` +
      `📅 Последний вход: ${
        doctor.lastLogin
          ? doctor.lastLogin.toLocaleString("ru-RU")
          : "Неизвестно"
      }\n` +
      `✅ Статус: ${doctor.isActive ? "Активен" : "Неактивен"}`;

    await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  start() {
    console.log("🤖 Telegram бот запущен (RU)");
  }
}

module.exports = new PharmacyBotRu();
