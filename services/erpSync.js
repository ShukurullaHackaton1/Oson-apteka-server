// services/erpSync.js
const axios = require("axios");
const { Medicine, ERPLog } = require("../models");

class ERPSyncService {
  constructor() {
    this.baseURL = process.env.ERP_API_URL || "https://api.osonapteka.uz";
    this.apiKey = process.env.ERP_API_KEY;
    this.timeout = 30000; // 30 sekund
  }

  async syncERPData() {
    const startTime = Date.now();
    let recordsUpdated = 0;

    try {
      console.log("🔄 ERP ma'lumotlarini sinxronizatsiya boshlandi...");

      // Oson Apteka API dan dorilar ma'lumotini olish
      const response = await axios.get(`${this.baseURL}/api/medicines`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: this.timeout,
      });

      const erpMedicines = response.data.data || response.data;

      if (!Array.isArray(erpMedicines)) {
        throw new Error("API dan noto'g'ri format qaytdi");
      }

      // Har bir dori uchun bazani yangilash
      for (const erpMedicine of erpMedicines) {
        try {
          await this.updateMedicine(erpMedicine);
          recordsUpdated++;
        } catch (error) {
          console.error(
            `Dori yangilash xatosi (ID: ${erpMedicine.id}):`,
            error
          );
        }
      }

      // Muvaffaqiyatli log yozish
      await this.logSyncResult(
        "success",
        recordsUpdated,
        null,
        Date.now() - startTime
      );

      console.log(
        `✅ ERP sinxronizatsiya tugadi. ${recordsUpdated} ta yozuv yangilandi`
      );

      return {
        success: true,
        recordsUpdated,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error("❌ ERP sinxronizatsiya xatosi:", error);

      // Xato log yozish
      await this.logSyncResult(
        "error",
        recordsUpdated,
        error.message,
        Date.now() - startTime
      );

      throw error;
    }
  }

  async updateMedicine(erpMedicine) {
    const medicineData = {
      erpId: erpMedicine.id || erpMedicine.erpId,
      name: erpMedicine.name || erpMedicine.title,
      manufacturer: erpMedicine.manufacturer || erpMedicine.brand,
      category: erpMedicine.category || erpMedicine.group,
      price: parseFloat(erpMedicine.price) || 0,
      quantity: parseInt(erpMedicine.quantity) || 0,
      unit: erpMedicine.unit || "dona",
      description: erpMedicine.description || "",
      barcode: erpMedicine.barcode || "",
      expiryDate: erpMedicine.expiryDate
        ? new Date(erpMedicine.expiryDate)
        : null,
      isActive: erpMedicine.isActive !== false,
    };

    // Mavjudligini tekshirish va yangilash yoki yangi yaratish
    const existingMedicine = await Medicine.findOne({
      erpId: medicineData.erpId,
    });

    if (existingMedicine) {
      // Mavjud dori ma'lumotlarini yangilash
      Object.assign(existingMedicine, medicineData);
      await existingMedicine.save();
    } else {
      // Yangi dori yaratish
      const newMedicine = new Medicine(medicineData);
      await newMedicine.save();
    }
  }

  async logSyncResult(status, recordsUpdated, errorMessage, executionTime) {
    try {
      const log = new ERPLog({
        status,
        recordsUpdated,
        errorMessage,
        executionTime,
      });
      await log.save();
    } catch (error) {
      console.error("Log yozishda xatolik:", error);
    }
  }

  // Manual sinxronizatsiya
  async manualSync() {
    try {
      const result = await this.syncERPData();

      // Real-time yangilanish
      if (global.io) {
        global.io.to("admin_room").emit("manual_sync_completed", {
          ...result,
          timestamp: new Date(),
        });
      }

      return result;
    } catch (error) {
      if (global.io) {
        global.io.to("admin_room").emit("sync_error", {
          error: error.message,
          timestamp: new Date(),
        });
      }
      throw error;
    }
  }

  // API holatini tekshirish
  async checkAPIHealth() {
    try {
      const response = await axios.get(`${this.baseURL}/api/health`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        timeout: 10000,
      });

      return {
        status: "healthy",
        responseTime: response.headers["x-response-time"] || "unknown",
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  // Oxirgi sinxronizatsiya ma'lumotlarini olish
  async getLastSyncInfo() {
    try {
      const lastLog = await ERPLog.findOne().sort({ createdAt: -1 });
      return lastLog;
    } catch (error) {
      console.error(
        "Oxirgi sinxronizatsiya ma'lumotini olishda xatolik:",
        error
      );
      return null;
    }
  }

  // Sinxronizatsiya tarixi
  async getSyncHistory(limit = 10) {
    try {
      const logs = await ERPLog.find().sort({ createdAt: -1 }).limit(limit);
      return logs;
    } catch (error) {
      console.error("Sinxronizatsiya tarixini olishda xatolik:", error);
      return [];
    }
  }
}

module.exports = {
  erpSyncService: new ERPSyncService(),
  syncERPData: () => new ERPSyncService().syncERPData(),
};
