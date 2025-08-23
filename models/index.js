// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "pharmacy"],
      default: "admin",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// models/Doctor.js
const doctorSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      unique: true,
      sparse: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    specialization: String,
    phone: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: Date,
  },
  {
    timestamps: true,
  }
);

doctorSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

doctorSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// models/Medicine.js
const medicineSchema = new mongoose.Schema(
  {
    erpId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    manufacturer: String,
    category: String,
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      default: 0,
    },
    unit: {
      type: String,
      default: "dona",
    },
    description: String,
    barcode: String,
    expiryDate: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// models/Sale.js
const saleSchema = new mongoose.Schema(
  {
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true,
    },
    medicines: [
      {
        medicine: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Medicine",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        unitPrice: {
          type: Number,
          required: true,
        },
        totalPrice: {
          type: Number,
          required: true,
        },
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    saleDate: {
      type: Date,
      default: Date.now,
    },
    pharmacyStaff: String,
    notes: String,
    telegramMessageId: String,
  },
  {
    timestamps: true,
  }
);

// models/ERPLog.js
const erpLogSchema = new mongoose.Schema(
  {
    syncDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["success", "error"],
      required: true,
    },
    recordsUpdated: Number,
    errorMessage: String,
    executionTime: Number,
  },
  {
    timestamps: true,
  }
);

module.exports = {
  User: mongoose.model("User", userSchema),
  Doctor: mongoose.model("Doctor", doctorSchema),
  Medicine: mongoose.model("Medicine", medicineSchema),
  Sale: mongoose.model("Sale", saleSchema),
  ERPLog: mongoose.model("ERPLog", erpLogSchema),
};
