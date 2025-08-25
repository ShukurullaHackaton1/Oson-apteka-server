// routes/sync.js - Faqat frontenddan kelgan ma'lumotlarni qabul qilish
const express = require("express");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const osonKassaSync = require("../services/osonKassaSync");
const router = express.Router();

// Frontenddan ma'lumot qabul qilish va qayta ishlash
router.post("/from-frontend", authenticateToken, async (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        message: "Ma'lumotlar yuborilmagan",
      });
    }

    if (!data.items || !Array.isArray(data.items)) {
      return res.status(400).json({
        success: false,
        message: "Items massivi mavjud emas yoki noto'g'ri formatda",
      });
    }

    console.log(
      `📡 Frontend dan ${data.items.length} ta mahsulot ma'lumoti qabul qilindi`
    );

    const result = await osonKassaSync.syncFromFrontend(data);

    res.json(result);
  } catch (error) {
    console.error("❌ Frontend ma'lumotlarini qayta ishlashda xatolik:", error);
    res.status(500).json({
      success: false,
      message: "Sinxronlashda xatolik yuz berdi",
      error: error.message,
    });
  }
});

// Sinxronlash holatini olish
router.get("/status", authenticateToken, async (req, res) => {
  try {
    const status = await osonKassaSync.getSyncStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Holatni olishda xatolik",
      error: error.message,
    });
  }
});

// Ma'lumotlar statistikasini olish
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const statistics = await osonKassaSync.getDataStatistics();
    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Statistika olishda xatolik",
      error: error.message,
    });
  }
});

// Eski ma'lumotlarni tozalash (faqat admin uchun)
router.post("/cleanup", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;
    const deletedCount = await osonKassaSync.clearOldData(daysOld);

    res.json({
      success: true,
      message: `${deletedCount} ta eski yozuv o'chirildi`,
      deletedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Tozalashda xatolik",
      error: error.message,
    });
  }
});

// Sync jarayonini to'xtatish (faqat admin uchun)
router.post("/stop", authenticateToken, isAdmin, async (req, res) => {
  try {
    // Bu funksiya hozircha sodda, lekin kelajakda sync jarayonini to'xtatish uchun ishlatiladi
    res.json({
      success: true,
      message: "Sinxronlash to'xtatish so'rovi qabul qilindi",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "To'xtatishda xatolik",
      error: error.message,
    });
  }
});

module.exports = router;
