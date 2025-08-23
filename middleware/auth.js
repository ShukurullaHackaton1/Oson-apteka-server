// middleware/auth.js
const jwt = require("jsonwebtoken");
const { User } = require("../models");

// Token tekshirish
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Token talab qilinadi" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret_key");

    const user = await User.findById(decoded.userId).select("-password");
    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ message: "Foydalanuvchi topilmadi yoki faol emas" });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token muddati tugagan" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Noto'g'ri token" });
    }
    return res.status(500).json({ message: "Token tekshirishda xatolik" });
  }
};

// Admin huquqlarini tekshirish
const isAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin huquqlari talab qilinadi" });
  }
  next();
};

// Pharmacy yoki Admin huquqlarini tekshirish
const isPharmacyOrAdmin = (req, res, next) => {
  if (!["admin", "pharmacy"].includes(req.user.role)) {
    return res.status(403).json({ message: "Ruxsat etilmagan" });
  }
  next();
};

module.exports = {
  authenticateToken,
  isAdmin,
  isPharmacyOrAdmin,
};
