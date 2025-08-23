const express = require("express");
const { Medicine } = require("../models");
const { authenticateToken } = require("../middleware/auth");
const router = express.Router();

// Dorilar ro'yxati
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, category } = req.query;

    const query = { isActive: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { manufacturer: { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      query.category = category;
    }

    const medicines = await Medicine.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ name: 1 });

    const total = await Medicine.countDocuments(query);

    res.json({
      medicines,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// Kategoriyalar ro'yxati
router.get("/categories", authenticateToken, async (req, res) => {
  try {
    const categories = await Medicine.distinct("category", { isActive: true });
    res.json(categories.filter((cat) => cat)); // Bo'sh qiymatlarni filtrlash
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// Bitta dori ma'lumoti
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) {
      return res.status(404).json({ message: "Dori topilmadi" });
    }
    res.json(medicine);
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

module.exports = router;
