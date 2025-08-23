const express = require("express");
const { Sale, Doctor, Medicine } = require("../models");
const { authenticateToken } = require("../middleware/auth");
const router = express.Router();

// Sotuvlar ro'yxati
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, startDate, endDate, doctorId } = req.query;

    const query = {};

    if (startDate && endDate) {
      query.saleDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    if (doctorId) {
      query.doctor = doctorId;
    }

    const sales = await Sale.find(query)
      .populate("doctor", "firstName lastName specialization")
      .populate("medicines.medicine", "name manufacturer")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ saleDate: -1 });

    const total = await Sale.countDocuments(query);

    res.json({
      sales,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// Yangi sotuv qo'shish
router.post("/", authenticateToken, async (req, res) => {
  try {
    const { doctorId, medicines, notes } = req.body;

    // Shifokor mavjudligini tekshirish
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Shifokor topilmadi" });
    }

    // Dorilar mavjudligini tekshirish va narxlarni hisoblash
    let totalAmount = 0;
    const saleItems = [];

    for (const item of medicines) {
      const medicine = await Medicine.findById(item.medicineId);
      if (!medicine) {
        return res
          .status(404)
          .json({ message: `Dori topilmadi: ${item.medicineId}` });
      }

      const itemTotal = medicine.price * item.quantity;
      totalAmount += itemTotal;

      saleItems.push({
        medicine: medicine._id,
        quantity: item.quantity,
        unitPrice: medicine.price,
        totalPrice: itemTotal,
      });
    }

    const sale = new Sale({
      doctor: doctorId,
      medicines: saleItems,
      totalAmount,
      notes,
    });

    await sale.save();

    // Real-time yangilanish
    if (global.io) {
      global.io.to("admin_room").emit("new_sale", {
        sale: await sale.populate("doctor medicines.medicine"),
        timestamp: new Date(),
      });
    }

    res.status(201).json(await sale.populate("doctor medicines.medicine"));
  } catch (error) {
    res
      .status(500)
      .json({ message: "Sotuv qo'shishda xatolik", error: error.message });
  }
});

// Sotuv ma'lumotini olish
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate("doctor", "firstName lastName specialization")
      .populate("medicines.medicine", "name manufacturer price");

    if (!sale) {
      return res.status(404).json({ message: "Sotuv topilmadi" });
    }

    res.json(sale);
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

module.exports = router;
