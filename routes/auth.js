// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const router = express.Router();

// Register (User yaratish)
router.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;

    // Avval foydalanuvchi mavjudmi tekshirish
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Bunday username allaqachon mavjud" });
    }

    // Yangi user yaratish
    const newUser = new User({
      username,
      password,
      role: role || "admin", // agar role berilmasa default admin bo‘ladi
    });

    await newUser.save();

    // JWT token yaratish
    const token = jwt.sign(
      { userId: newUser._id, role: newUser.role },
      process.env.JWT_SECRET || "secret_key",
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Foydalanuvchi muvaffaqiyatli yaratildi",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        role: newUser.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username, isActive: true });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Noto'g'ri login yoki parol" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || "secret_key",
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server xatosi", error: error.message });
  }
});

module.exports = router;
