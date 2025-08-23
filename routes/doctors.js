const express = require("express");
const { Doctor } = require("../models");
const { authenticateToken, isAdmin } = require("../middleware/auth");
const bcrypt = require("bcryptjs");
const router = express.Router();

// Barcha shifokorlar ro'yxati
router.get("/", authenticateToken, async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .select("-password")
      .sort({ createdAt: -1 });
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// Yangi shifokor qo'shish
router.post("/", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { firstName, lastName, specialization, phone } = req.body;

    // Username va parol generatsiya qilish
    const username = `doctor_${Date.now()}`;
    const password = Math.random().toString(36).slice(-8);

    const doctor = new Doctor({
      firstName,
      lastName,
      username,
      password,
      specialization,
      phone,
    });

    await doctor.save();

    // Parolsiz qaytarish
    const doctorResponse = doctor.toObject();
    delete doctorResponse.password;
    doctorResponse.generatedPassword = password; // Faqat birinchi marta

    res.status(201).json(doctorResponse);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Shifokor qo'shishda xatolik", error: error.message });
  }
});

// Shifokorni yangilash
router.put("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    const { firstName, lastName, specialization, phone, isActive } = req.body;

    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { firstName, lastName, specialization, phone, isActive },
      { new: true }
    ).select("-password");

    if (!doctor) {
      return res.status(404).json({ message: "Shifokor topilmadi" });
    }

    res.json(doctor);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Yangilashda xatolik", error: error.message });
  }
});

// Shifokor parolini tiklash
router.post(
  "/:id/reset-password",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const newPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      await Doctor.findByIdAndUpdate(req.params.id, {
        password: hashedPassword,
      });

      res.json({
        message: "Parol tiklandi",
        newPassword: newPassword,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Parol tiklashda xatolik", error: error.message });
    }
  }
);

// Shifokorni o'chirish
router.delete("/:id", authenticateToken, isAdmin, async (req, res) => {
  try {
    await Doctor.findByIdAndDelete(req.params.id);
    res.json({ message: "Shifokor o'chirildi" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "O'chirishda xatolik", error: error.message });
  }
});

module.exports = router;
