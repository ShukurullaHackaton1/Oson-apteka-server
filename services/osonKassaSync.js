// services/osonKassaSync.js - Faqat frontend ma'lumotlarini qayta ishlash uchun
const { Product, SyncStatus, Supplier } = require("../models");

class OsonKassaSyncService {
  constructor() {
    this.isRunning = false;
  }

  // Ma'lumotlarni frontenddan qabul qilish va qayta ishlash
  async syncFromFrontend(data) {
    console.log("📡 Frontenddan kelgan ma'lumotlar qayta ishlanmoqda...");

    if (this.isRunning) {
      throw new Error("Sinxronlash allaqachon ishlab turibdi");
    }

    this.isRunning = true;

    try {
      const startTime = Date.now();
      const processedCount = await this.processDataBatch(data.items || []);

      // Yetkazib beruvchilar statistikasini yangilash
      await this.updateSupplierStatistics();

      // Sync statusni yangilash
      await this.updateSyncStatus("completed", processedCount, startTime);

      console.log(
        `✅ ${processedCount} ta mahsulot muvaffaqiyatli qayta ishlandi`
      );

      // Socket.IO orqali xabar berish
      if (global.io) {
        global.io.emit("sync_completed", {
          processedCount,
          totalRecords: data.totalCount || processedCount,
          timestamp: new Date(),
        });
      }

      return {
        success: true,
        processedCount,
        totalRecords: data.totalCount || processedCount,
        message: "Ma'lumotlar muvaffaqiyatli qayta ishlandi",
      };
    } catch (error) {
      console.error("❌ Ma'lumotlarni qayta ishlashda xatolik:", error);
      await this.updateSyncStatus("error", 0, Date.now(), error.message);

      if (global.io) {
        global.io.emit("sync_error", {
          error: error.message,
          timestamp: new Date(),
        });
      }

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  // Ma'lumotlar to'plamini qayta ishlash
  async processDataBatch(items) {
    let processedCount = 0;
    let errorCount = 0;

    console.log(`📦 ${items.length} ta mahsulot qayta ishlanmoqda...`);

    for (const item of items) {
      try {
        await this.processProductItem(item);
        processedCount++;

        // Har 100 ta mahsulotdan keyin progress ko'rsatish
        if (processedCount % 100 === 0) {
          console.log(`📊 ${processedCount} ta mahsulot qayta ishlandi...`);
        }
      } catch (error) {
        errorCount++;
        console.error(
          `❌ Mahsulot ${item.id || "noma'lum"} qayta ishlanmadi:`,
          error.message
        );
      }
    }

    if (errorCount > 0) {
      console.warn(`⚠️ ${errorCount} ta mahsulotda xatolik yuz berdi`);
    }

    return processedCount;
  }

  // Bitta mahsulotni qayta ishlash
  async processProductItem(item) {
    if (!item.id) {
      throw new Error("Mahsulot ID si mavjud emas");
    }

    const productData = {
      erpId: item.id,
      branchId: item.branchId,
      branch: item.branch,
      productId: item.productId,
      batchId: item.batchId,
      code: item.code,
      product: item.product,
      manufacturer: item.manufacturer,
      country: item.country,
      internationalName: item.internationalName,
      pharmGroup: item.pharmGroup,
      category: item.category,
      unit: item.unit,
      pieceCount: item.pieceCount,
      barcode: item.barcode,
      mxik: item.mxik,
      quantity: Number(item.quantity) || 0,
      quantities: item.quantities || {},
      bookedQuantity: Number(item.bookedQuantity) || 0,
      buyPrice: Number(item.buyPrice) || 0,
      salePrice: Number(item.salePrice) || 0,
      vat: Number(item.vat) || 0,
      markup: Number(item.markup) || 0,
      series: item.series,
      shelfLife: item.shelfLife ? new Date(item.shelfLife) : null,
      supplyQuantity: Number(item.supplyQuantity) || 0,
      supplyDate: item.supplyDate ? new Date(item.supplyDate) : null,
      supplier: item.supplier,
      location: item.location,
      temperature: item.temperature,
      isActive: true,
      lastUpdated: new Date(),
    };

    // Ma'lumotni yangilash yoki yangi yaratish
    await Product.findOneAndUpdate({ erpId: item.id }, productData, {
      upsert: true,
      new: true,
      runValidators: true,
    });
  }

  // Yetkazib beruvchilar statistikasini yangilash
  async updateSupplierStatistics() {
    try {
      console.log("📊 Yetkazib beruvchilar statistikasi yangilanmoqda...");

      const suppliers = await Product.distinct("supplier");
      let updatedCount = 0;

      for (const supplierName of suppliers) {
        if (!supplierName) continue;

        const stats = await Product.aggregate([
          { $match: { supplier: supplierName } },
          {
            $group: {
              _id: null,
              totalProducts: { $sum: 1 },
              branches: { $addToSet: "$branch" },
              totalQuantity: { $sum: "$quantity" },
              totalValue: { $sum: { $multiply: ["$quantity", "$salePrice"] } },
            },
          },
        ]);

        if (stats.length > 0) {
          let supplier = await Supplier.findOne({ name: supplierName });

          if (!supplier) {
            // Yangi yetkazib beruvchi yaratish
            const username = supplierName
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "_")
              .substring(0, 20);
            const password = Math.random().toString(36).slice(-8);

            supplier = new Supplier({
              name: supplierName,
              username,
              password,
              isActive: true,
            });

            console.log(
              `➕ Yangi yetkazib beruvchi yaratildi: ${supplierName}`
            );
          }

          supplier.statistics = {
            totalProducts: stats[0].totalProducts,
            totalBranches: stats[0].branches.length,
            totalQuantity: stats[0].totalQuantity,
            totalValue: stats[0].totalValue,
            lastSync: new Date(),
          };

          await supplier.save();
          updatedCount++;
        }
      }

      console.log(
        `✅ ${updatedCount} ta yetkazib beruvchi statistikasi yangilandi`
      );
    } catch (error) {
      console.error(
        "❌ Yetkazib beruvchilar statistikasini yangilashda xatolik:",
        error
      );
    }
  }

  // Sync holatini yangilash
  async updateSyncStatus(
    status,
    recordsProcessed = 0,
    startTime = Date.now(),
    errorMessage = null
  ) {
    try {
      let syncStatus = await SyncStatus.findOne();
      if (!syncStatus) {
        syncStatus = new SyncStatus();
      }

      syncStatus.status = status;

      if (recordsProcessed > 0) {
        syncStatus.lastSyncDate = new Date();
        syncStatus.totalRecords = recordsProcessed;
      }

      if (errorMessage) {
        syncStatus.errorMessage = errorMessage;
      } else if (status === "completed") {
        syncStatus.errorMessage = null;
      }

      // Bajarilish vaqtini hisoblash
      if (startTime) {
        syncStatus.executionTime = Date.now() - startTime;
      }

      await syncStatus.save();
    } catch (error) {
      console.error("❌ Sync holatini yangilashda xatolik:", error);
    }
  }

  // Sinxronlash holatini olish
  async getSyncStatus() {
    try {
      const status = await SyncStatus.findOne();
      const productCount = await Product.countDocuments();
      const supplierCount = await Supplier.countDocuments();

      // Oxirgi sinxronlash ma'lumotlari
      const lastSync = await Product.findOne()
        .sort({ lastUpdated: -1 })
        .select("lastUpdated");

      return {
        ...status?.toObject(),
        currentProductCount: productCount,
        currentSupplierCount: supplierCount,
        isRunning: this.isRunning,
        lastProductUpdate: lastSync?.lastUpdated,
        systemStatus: "healthy",
      };
    } catch (error) {
      console.error("❌ Sinxronlash holatini olishda xatolik:", error);
      return {
        status: "error",
        error: error.message,
        isRunning: this.isRunning,
        systemStatus: "error",
      };
    }
  }

  // Ma'lumotlar statistikasini olish
  async getDataStatistics() {
    try {
      const [
        totalProducts,
        totalSuppliers,
        activeBranches,
        lowStockProducts,
        recentProducts,
      ] = await Promise.all([
        Product.countDocuments(),
        Supplier.countDocuments({ isActive: true }),
        Product.distinct("branch").then((branches) => branches.length),
        Product.countDocuments({ quantity: { $lt: 10, $gt: 0 } }),
        Product.find().sort({ lastUpdated: -1 }).limit(5),
      ]);

      return {
        totalProducts,
        totalSuppliers,
        activeBranches,
        lowStockProducts,
        recentProducts,
        lastUpdate: new Date(),
      };
    } catch (error) {
      console.error("❌ Statistika olishda xatolik:", error);
      return null;
    }
  }

  // Ma'lumotlarni tozalash (agar kerak bo'lsa)
  async clearOldData(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await Product.deleteMany({
        lastUpdated: { $lt: cutoffDate },
        quantity: 0,
      });

      console.log(`🗑️ ${result.deletedCount} ta eski mahsulot o'chirildi`);
      return result.deletedCount;
    } catch (error) {
      console.error("❌ Eski ma'lumotlarni tozalashda xatolik:", error);
      throw error;
    }
  }
}

module.exports = new OsonKassaSyncService();
