const express = require("express");
const { Sale, Doctor, Medicine, ERPLog } = require("../models");
const { authenticateToken } = require("../middleware/auth");
const { erpSyncService } = require("../services/erpSync");
const router = express.Router();

// Dashboard statistikalari
router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const startOfWeek = new Date(today.setDate(today.getDate() - 7));
    const startOfMonth = new Date(today.setDate(today.getDate() - 30));

    // Bugungi statistika
    const todayStats = await Sale.aggregate([
      { $match: { saleDate: { $gte: startOfDay } } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ]);

    // Haftalik statistika
    const weeklyStats = await Sale.aggregate([
      { $match: { saleDate: { $gte: startOfWeek } } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ]);

    // Oylik statistika
    const monthlyStats = await Sale.aggregate([
      { $match: { saleDate: { $gte: startOfMonth } } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ]);

    // Umumiy hisoblar
    const totalDoctors = await Doctor.countDocuments({ isActive: true });
    const totalMedicines = await Medicine.countDocuments({ isActive: true });
    const lowStockMedicines = await Medicine.countDocuments({
      isActive: true,
      quantity: { $lt: 10 },
    });

    res.json({
      today: todayStats[0] || { totalSales: 0, totalAmount: 0 },
      weekly: weeklyStats[0] || { totalSales: 0, totalAmount: 0 },
      monthly: monthlyStats[0] || { totalSales: 0, totalAmount: 0 },
      totals: {
        doctors: totalDoctors,
        medicines: totalMedicines,
        lowStock: lowStockMedicines,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// Top shifokorlar
router.get("/top-doctors", authenticateToken, async (req, res) => {
  try {
    const { period = "month" } = req.query;

    let startDate;
    const today = new Date();

    switch (period) {
      case "week":
        startDate = new Date(today.setDate(today.getDate() - 7));
        break;
      case "month":
        startDate = new Date(today.setDate(today.getDate() - 30));
        break;
      default:
        startDate = new Date(today.setDate(today.getDate() - 30));
    }

    const topDoctors = await Sale.aggregate([
      { $match: { saleDate: { $gte: startDate } } },
      {
        $group: {
          _id: "$doctor",
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "doctors",
          localField: "_id",
          foreignField: "_id",
          as: "doctor",
        },
      },
      { $unwind: "$doctor" },
      {
        $project: {
          doctorName: {
            $concat: ["$doctor.firstName", " ", "$doctor.lastName"],
          },
          specialization: "$doctor.specialization",
          totalSales: 1,
          totalAmount: 1,
        },
      },
    ]);

    res.json(topDoctors);
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// Oxirgi sotuvlar
router.get("/recent-sales", authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const recentSales = await Sale.find()
      .populate("doctor", "firstName lastName")
      .populate("medicines.medicine", "name")
      .sort({ saleDate: -1 })
      .limit(parseInt(limit));

    res.json(recentSales);
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// Manual ERP sinxronizatsiya
router.post("/sync-erp", authenticateToken, async (req, res) => {
  try {
    const result = await erpSyncService.manualSync();
    res.json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Sinxronizatsiya xatosi", error: error.message });
  }
});

// ERP sinxronizatsiya tarixi
router.get("/sync-history", authenticateToken, async (req, res) => {
  try {
    const history = await erpSyncService.getSyncHistory();
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// ERP API holatini tekshirish
router.get("/erp-health", authenticateToken, async (req, res) => {
  try {
    const health = await erpSyncService.checkAPIHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

module.exports = router;
