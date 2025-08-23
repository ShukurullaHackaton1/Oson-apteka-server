// bot/telegramBot.js
const TelegramBot = require("node-telegram-bot-api");
const { Doctor, Medicine, Sale } = require("../models");

class PharmacyBot {
  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
      polling: true,
    });
    this.userStates = new Map(); // Foydalanuvchi holatlarini saqlash
    this.setupHandlers();
  }

  setupHandlers() {
    // Start komandasi
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;

      await this.bot.sendMessage(
        chatId,
        "🏥 Dorixona boshqaruv botiga xush kelibsiz!\n\n" +
          "Kirish uchun /login komandasi bilan username va parolingizni kiriting.\n\n" +
          "Masalan: /login doctor123 parol123",
        {
          reply_markup: {
            keyboard: [
              ["📋 Mening sotuvlarim", "📊 Statistika"],
              ["⚙️ Sozlamalar", "❓ Yordam"],
            ],
            resize_keyboard: true,
            one_time_keyboard: false,
          },
        }
      );
    });

    // Login komandasi
    this.bot.onText(/\/login (.+) (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const username = match[1];
      const password = match[2];

      try {
        const doctor = await Doctor.findOne({ username, isActive: true });

        if (!doctor || !(await doctor.comparePassword(password))) {
          return await this.bot.sendMessage(
            chatId,
            "❌ Noto'g'ri username yoki parol!\n\n" +
              "Iltimos, qaytadan urinib ko'ring: /login username parol"
          );
        }

        // Telegram ID ni yangilash
        doctor.telegramId = chatId.toString();
        doctor.lastLogin = new Date();
        await doctor.save();

        await this.bot.sendMessage(
          chatId,
          `✅ Muvaffaqiyatli kiritdingiz!\n\n` +
            `👨‍⚕️ Dr. ${doctor.firstName} ${doctor.lastName}\n` +
            `🏥 ${doctor.specialization || "Umumiy amaliyot"}\n\n` +
            `Menyudan kerakli bo'limni tanlang:`,
          {
            reply_markup: {
              keyboard: [
                ["📋 Mening sotuvlarim", "📊 Bugungi statistika"],
                ["📅 Haftalik hisobot", "📈 Oylik hisobot"],
                ["⚙️ Profil", "🔄 Yangilash"],
              ],
              resize_keyboard: true,
            },
          }
        );
      } catch (error) {
        console.error("Login xatosi:", error);
        await this.bot.sendMessage(
          chatId,
          "❌ Tizimda xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring."
        );
      }
    });

    // Menyudagi tugmalar
    this.bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;

      // Agar komanda bo'lsa, o'tkazib yuborish
      if (text && text.startsWith("/")) return;

      const doctor = await Doctor.findOne({
        telegramId: chatId.toString(),
        isActive: true,
      });

      if (!doctor) {
        return await this.bot.sendMessage(
          chatId,
          "❌ Avval tizimga kirishingiz kerak!\n\n" +
            "Kirish: /login username parol"
        );
      }

      switch (text) {
        case "📋 Mening sotuvlarim":
          await this.showMySales(chatId, doctor._id);
          break;

        case "📊 Bugungi statistika":
          await this.showTodayStats(chatId, doctor._id);
          break;

        case "📅 Haftalik hisobot":
          await this.showWeeklyReport(chatId, doctor._id);
          break;

        case "📈 Oylik hisobot":
          await this.showMonthlyReport(chatId, doctor._id);
          break;

        case "⚙️ Profil":
          await this.showProfile(chatId, doctor);
          break;

        case "🔄 Yangilash":
          await this.refreshData(chatId);
          break;

        case "➕ Yangi sotuv":
          await this.startNewSale(chatId, doctor._id);
          break;

        default:
          // Agar foydalanuvchi sotuv jarayonida bo'lsa
          await this.handleSaleProcess(chatId, text, doctor._id);
      }
    });

    // Callback query handler (inline keyboards)
    this.bot.on("callback_query", async (callbackQuery) => {
      const message = callbackQuery.message;
      const data = callbackQuery.data;
      const chatId = message.chat.id;

      await this.handleCallbackQuery(chatId, data, callbackQuery.id);
    });
  }

  async showMySales(chatId, doctorId) {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));

      const sales = await Sale.find({
        doctor: doctorId,
        saleDate: { $gte: startOfDay },
      })
        .populate("medicines.medicine")
        .sort({ saleDate: -1 });

      if (sales.length === 0) {
        return await this.bot.sendMessage(
          chatId,
          "📋 Bugun sizning retseptingiz bo'yicha sotilgan dorilar yo'q.",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "➕ Yangi sotuv qo'shish",
                    callback_data: "add_sale",
                  },
                ],
              ],
            },
          }
        );
      }

      let message = "📋 *Bugungi sotuvlaringiz:*\n\n";
      let totalAmount = 0;

      sales.forEach((sale, index) => {
        message += `${index + 1}. 🕒 ${sale.saleDate.toLocaleTimeString(
          "uz-UZ"
        )}\n`;
        message += `💰 Summa: ${sale.totalAmount.toLocaleString(
          "uz-UZ"
        )} so'm\n`;
        message += `📦 Dorilar:\n`;

        sale.medicines.forEach((item) => {
          message += `   • ${item.medicine.name} - ${item.quantity} ${item.medicine.unit}\n`;
        });
        message += "\n";
        totalAmount += sale.totalAmount;
      });

      message += `📊 *Jami summa: ${totalAmount.toLocaleString("uz-UZ")} so'm*`;

      await this.bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "➕ Yangi sotuv", callback_data: "add_sale" },
              { text: "📊 Batafsil", callback_data: "detailed_report" },
            ],
          ],
        },
      });
    } catch (error) {
      console.error("Sotuvlarni ko'rsatish xatosi:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Ma'lumotlarni yuklashda xatolik yuz berdi."
      );
    }
  }

  async showTodayStats(chatId, doctorId) {
    try {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0));

      const stats = await Sale.aggregate([
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
            totalMedicines: { $sum: { $size: "$medicines" } },
          },
        },
      ]);

      const stat = stats[0] || {
        totalSales: 0,
        totalAmount: 0,
        totalMedicines: 0,
      };

      const message =
        `📊 *Bugungi statistika:*\n\n` +
        `🛒 Sotuvlar soni: ${stat.totalSales}\n` +
        `💊 Sotilgan dorilar: ${stat.totalMedicines}\n` +
        `💰 Jami summa: ${stat.totalAmount.toLocaleString("uz-UZ")} so'm\n\n` +
        `📈 Sizning retseptingiz orqali bugun ${stat.totalSales} ta mijoz xizmat oldi.`;

      await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Statistikani ko'rsatish xatosi:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Statistikani yuklashda xatolik yuz berdi."
      );
    }
  }

  async startNewSale(chatId, doctorId) {
    this.userStates.set(chatId, {
      state: "selecting_medicines",
      doctorId,
      selectedMedicines: [],
      currentMedicine: null,
    });

    // Dorilar ro'yxatini olish
    const medicines = await Medicine.find({
      isActive: true,
      quantity: { $gt: 0 },
    }).limit(10);

    const keyboard = medicines.map((med) => [
      {
        text: `${med.name} - ${med.price.toLocaleString("uz-UZ")} so'm`,
        callback_data: `select_med_${med._id}`,
      },
    ]);

    keyboard.push([{ text: "❌ Bekor qilish", callback_data: "cancel_sale" }]);

    await this.bot.sendMessage(
      chatId,
      "🔍 Sotilgan dorilarni tanlang:\n\n" +
        "Quyidagi ro'yxatdan kerakli dorilarni tanlang:",
      {
        reply_markup: {
          inline_keyboard: keyboard,
        },
      }
    );
  }

  async handleCallbackQuery(chatId, data, queryId) {
    try {
      if (data === "add_sale") {
        const doctor = await Doctor.findOne({ telegramId: chatId.toString() });
        await this.startNewSale(chatId, doctor._id);
      }

      if (data.startsWith("select_med_")) {
        await this.handleMedicineSelection(chatId, data, queryId);
      }

      if (data === "confirm_sale") {
        await this.confirmSale(chatId, queryId);
      }

      if (data === "cancel_sale") {
        this.userStates.delete(chatId);
        await this.bot.answerCallbackQuery(queryId, {
          text: "Sotuv bekor qilindi",
        });
        await this.bot.sendMessage(
          chatId,
          "Sotuv bekor qilindi. Asosiy menyuga qaytdingiz."
        );
      }
    } catch (error) {
      console.error("Callback query xatosi:", error);
      await this.bot.answerCallbackQuery(queryId, {
        text: "Xatolik yuz berdi",
      });
    }
  }

  async handleMedicineSelection(chatId, data, queryId) {
    const medicineId = data.replace("select_med_", "");
    const userState = this.userStates.get(chatId);

    if (!userState) return;

    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return;

    // Miqdor so'rash
    userState.currentMedicine = medicine;
    userState.state = "entering_quantity";
    this.userStates.set(chatId, userState);

    await this.bot.answerCallbackQuery(queryId);
    await this.bot.sendMessage(
      chatId,
      `💊 ${medicine.name} tanlandi.\n\n` +
        `Nechta sotilganini kiriting (raqam):`,
      {
        reply_markup: {
          keyboard: [
            ["1", "2", "3"],
            ["4", "5", "❌ Bekor qilish"],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
  }

  async handleSaleProcess(chatId, text, doctorId) {
    const userState = this.userStates.get(chatId);

    if (!userState) return;

    if (userState.state === "entering_quantity") {
      const quantity = parseInt(text);

      if (isNaN(quantity) || quantity <= 0) {
        return await this.bot.sendMessage(
          chatId,
          "❌ Noto'g'ri miqdor! Iltimos, musbat son kiriting."
        );
      }

      const medicine = userState.currentMedicine;
      const totalPrice = medicine.price * quantity;

      userState.selectedMedicines.push({
        medicine: medicine._id,
        name: medicine.name,
        quantity: quantity,
        unitPrice: medicine.price,
        totalPrice: totalPrice,
      });

      await this.bot.sendMessage(
        chatId,
        `✅ ${medicine.name} - ${quantity} dona qo'shildi.\n\n` +
          `Yana dori qo'shasizmi?`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "➕ Yana dori qo'shish", callback_data: "add_more" }],
              [{ text: "✅ Sotuvni yakunlash", callback_data: "finish_sale" }],
              [{ text: "❌ Bekor qilish", callback_data: "cancel_sale" }],
            ],
          },
        }
      );
    }
  }

  async finishSale(chatId) {
    const userState = this.userStates.get(chatId);

    if (!userState || userState.selectedMedicines.length === 0) return;

    try {
      const totalAmount = userState.selectedMedicines.reduce(
        (sum, item) => sum + item.totalPrice,
        0
      );

      const sale = new Sale({
        doctor: userState.doctorId,
        medicines: userState.selectedMedicines.map((item) => ({
          medicine: item.medicine,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
        totalAmount: totalAmount,
        saleDate: new Date(),
      });

      await sale.save();

      // Real-time yangilanish
      if (global.io) {
        global.io.to("admin_room").emit("new_sale", {
          sale: await sale.populate("doctor medicines.medicine"),
          timestamp: new Date(),
        });
      }

      let message = "✅ *Sotuv muvaffaqiyatli saqlandi!*\n\n";
      message += "📦 Sotilgan dorilar:\n";

      userState.selectedMedicines.forEach((item, index) => {
        message += `${index + 1}. ${item.name} - ${item.quantity} dona\n`;
        message += `   💰 ${item.totalPrice.toLocaleString("uz-UZ")} so'm\n`;
      });

      message += `\n💵 *Jami: ${totalAmount.toLocaleString("uz-UZ")} so'm*`;

      await this.bot.sendMessage(chatId, message, {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [
            ["📋 Mening sotuvlarim", "📊 Bugungi statistika"],
            ["📅 Haftalik hisobot", "📈 Oylik hisobot"],
            ["⚙️ Profil", "🔄 Yangilash"],
          ],
          resize_keyboard: true,
        },
      });

      this.userStates.delete(chatId);
    } catch (error) {
      console.error("Sotuvni saqlash xatosi:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Sotuvni saqlashda xatolik yuz berdi."
      );
    }
  }

  async showProfile(chatId, doctor) {
    const message =
      `👨‍⚕️ *Profil ma'lumotlari:*\n\n` +
      `👤 Ism: ${doctor.firstName} ${doctor.lastName}\n` +
      `🏥 Mutaxassislik: ${doctor.specialization || "Ko'rsatilmagan"}\n` +
      `📱 Telefon: ${doctor.phone || "Ko'rsatilmagan"}\n` +
      `📅 Oxirgi kirish: ${
        doctor.lastLogin ? doctor.lastLogin.toLocaleString("uz-UZ") : "Noma'lum"
      }\n` +
      `✅ Holat: ${doctor.isActive ? "Faol" : "Nofaol"}`;

    await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
  }

  async refreshData(chatId) {
    await this.bot.sendMessage(chatId, "🔄 Ma'lumotlar yangilanmoqda...");

    setTimeout(async () => {
      await this.bot.sendMessage(chatId, "✅ Ma'lumotlar yangilandi!");
    }, 1000);
  }

  async showWeeklyReport(chatId, doctorId) {
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const sales = await Sale.find({
        doctor: doctorId,
        saleDate: { $gte: weekAgo },
      }).populate("medicines.medicine");

      if (sales.length === 0) {
        return await this.bot.sendMessage(
          chatId,
          "📅 So'nggi 7 kun ichida sizning retseptingiz bo'yicha sotilgan dorilar yo'q."
        );
      }

      const totalAmount = sales.reduce(
        (sum, sale) => sum + sale.totalAmount,
        0
      );
      const totalMedicines = sales.reduce(
        (sum, sale) => sum + sale.medicines.length,
        0
      );

      const message =
        `📅 *Haftalik hisobot (7 kun):*\n\n` +
        `🛒 Sotuvlar soni: ${sales.length}\n` +
        `💊 Sotilgan dorilar: ${totalMedicines}\n` +
        `💰 Jami summa: ${totalAmount.toLocaleString("uz-UZ")} so'm\n` +
        `📊 Kunlik o'rtacha: ${Math.round(totalAmount / 7).toLocaleString(
          "uz-UZ"
        )} so'm`;

      await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Haftalik hisobot xatosi:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Hisobotni yuklashda xatolik yuz berdi."
      );
    }
  }

  async showMonthlyReport(chatId, doctorId) {
    try {
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const sales = await Sale.aggregate([
        {
          $match: {
            doctor: doctorId,
            saleDate: { $gte: monthAgo },
          },
        },
        {
          $group: {
            _id: { $dayOfMonth: "$saleDate" },
            dailySales: { $sum: 1 },
            dailyAmount: { $sum: "$totalAmount" },
            medicines: { $push: "$medicines" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      if (sales.length === 0) {
        return await this.bot.sendMessage(
          chatId,
          "📈 So'nggi 30 kun ichida sizning retseptingiz bo'yicha sotilgan dorilar yo'q."
        );
      }

      const totalAmount = sales.reduce((sum, day) => sum + day.dailyAmount, 0);
      const totalSales = sales.reduce((sum, day) => sum + day.dailySales, 0);

      const message =
        `📈 *Oylik hisobot (30 kun):*\n\n` +
        `🛒 Jami sotuvlar: ${totalSales}\n` +
        `💰 Jami summa: ${totalAmount.toLocaleString("uz-UZ")} so'm\n` +
        `📊 Kunlik o'rtacha: ${Math.round(totalAmount / 30).toLocaleString(
          "uz-UZ"
        )} so'm\n` +
        `📈 Faol kunlar soni: ${sales.length}`;

      await this.bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Oylik hisobot xatosi:", error);
      await this.bot.sendMessage(
        chatId,
        "❌ Hisobotni yuklashda xatolik yuz berdi."
      );
    }
  }

  start() {
    console.log("🤖 Telegram bot ishga tushdi");
  }

  // Admin uchun xabar yuborish
  async sendAdminNotification(message) {
    const adminChatIds = process.env.ADMIN_CHAT_IDS?.split(",") || [];

    for (const chatId of adminChatIds) {
      try {
        await this.bot.sendMessage(chatId.trim(), message, {
          parse_mode: "Markdown",
        });
      } catch (error) {
        console.error(`Admin ${chatId} ga xabar yuborishda xatolik:`, error);
      }
    }
  }
}

module.exports = new PharmacyBot();
