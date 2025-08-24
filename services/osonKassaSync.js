// services/osonKassaSync.js
const axios = require("axios");
const { Product, SyncStatus, Supplier } = require("../models");
const cron = require("node-cron");

class OsonKassaSyncService {
  constructor() {
    this.baseURL = "https://osonkassa.uz/api";
    this.isRunning = false;
    this.pageSize = 100;
  }

  // Получение данных с API
  async fetchPage(pageNumber) {
    try {
      const response = await axios.post(
        `${this.baseURL}/report/inventory/remains`,
        {
          pageNumber,
          pageSize: this.pageSize,
          searchText: "",
          sortOrders: [
            {
              property: "product",
              direction: "asc",
            },
          ],
          source: 0,
          onlyActiveItems: true,
          manufacturerIds: [],
        },
        {
          headers: {
            Authorization:
              "Bearer eyJhbGciOiJodHRwOi8vd3d3LnczLm9yZy8yMDAxLzA0L3htbGRzaWctbW9yZSNobWFjLXNoYTI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJ3ZWIuYXBpIiwiaXNzIjoiaHR0cHM6Ly9vc29ua2Fzc2EudXovd2ViLmFwaSIsImV4cCI6MTc1NjEwNjE1MywiaWF0IjoxNzU2MDIzMzUzLCJVc2VybmFtZSI6ImFwdGVrYSIsIlVzZXJJZCI6IjgxZWViMzFmLTFiZWMtNGM3MC1iOGJmLTYzMjk4MTdiY2NjZSIsIlRlbmFudElkIjoiYmlvZmFybXMiLCJwZXJtaXNzaW9ucyI6InNlY3VyaXR5Iiwicm9sZSI6IiIsIm5iZiI6MTc1NjAyMzM1M30.nBzaFgdk1S_fZiUYofUknvB2m-yAQPSWnNAKut9oWr8",
          },
          timeout: 30000,
        }
      );

      return response.data.page;
    } catch (error) {
      console.error(`Ошибка при получении страницы ${pageNumber}:`, error);
      throw error;
    }
  }

  // Полная синхронизация всех страниц
  async fullSync() {
    if (this.isRunning) {
      console.log("Синхронизация уже запущена");
      return;
    }

    this.isRunning = true;
    let syncStatus = (await SyncStatus.findOne()) || new SyncStatus();

    try {
      console.log("🔄 Начало полной синхронизации с Oson Kassa...");
      syncStatus.status = "syncing";
      syncStatus.lastSyncDate = new Date();
      await syncStatus.save();

      // Получаем первую страницу для определения общего количества
      const firstPage = await this.fetchPage(1);
      const totalPages = firstPage.totalPages;
      const totalCount = firstPage.totalCount;

      console.log(`📊 Всего страниц: ${totalPages}, товаров: ${totalCount}`);

      syncStatus.totalPages = totalPages;
      syncStatus.totalRecords = totalCount;
      await syncStatus.save();

      // Синхронизируем все страницы
      for (let page = 1; page <= totalPages; page++) {
        console.log(`📄 Обработка страницы ${page}/${totalPages}`);

        const pageData = await this.fetchPage(page);
        await this.processPageData(pageData.items);

        syncStatus.lastPageSynced = page;
        await syncStatus.save();

        // Небольшая задержка между запросами
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Обновляем статистику поставщиков
      await this.updateSupplierStatistics();

      syncStatus.status = "completed";
      syncStatus.nextSyncScheduled = new Date(Date.now() + 10 * 60 * 1000); // +10 минут
      await syncStatus.save();

      console.log("✅ Полная синхронизация завершена");

      // Отправляем уведомление в Socket.io
      if (global.io) {
        global.io.emit("sync_completed", {
          totalPages,
          totalRecords: totalCount,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("❌ Ошибка синхронизации:", error);
      syncStatus.status = "error";
      syncStatus.errorMessage = error.message;
      await syncStatus.save();

      if (global.io) {
        global.io.emit("sync_error", {
          error: error.message,
          timestamp: new Date(),
        });
      }
    } finally {
      this.isRunning = false;
    }
  }

  // Инкрементальная синхронизация (только последняя страница)
  async incrementalSync() {
    if (this.isRunning) {
      console.log("Синхронизация уже запущена");
      return;
    }

    this.isRunning = true;
    const syncStatus = await SyncStatus.findOne();

    if (!syncStatus || !syncStatus.lastPageSynced) {
      console.log("Необходима полная синхронизация");
      return await this.fullSync();
    }

    try {
      console.log("🔄 Инкрементальная синхронизация...");

      const pageData = await this.fetchPage(syncStatus.lastPageSynced);
      await this.processPageData(pageData.items, true); // true = incremental update

      syncStatus.lastSyncDate = new Date();
      syncStatus.status = "completed";
      syncStatus.nextSyncScheduled = new Date(Date.now() + 10 * 60 * 1000);
      await syncStatus.save();

      console.log("✅ Инкрементальная синхронизация завершена");
    } catch (error) {
      console.error("❌ Ошибка инкрементальной синхронизации:", error);
    } finally {
      this.isRunning = false;
    }
  }

  // Обработка данных страницы
  async processPageData(items, isIncremental = false) {
    for (const item of items) {
      try {
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
          quantity: item.quantity,
          quantities: item.quantities,
          bookedQuantity: item.bookedQuantity,
          buyPrice: item.buyPrice,
          salePrice: item.salePrice,
          vat: item.vat,
          markup: item.markup,
          series: item.series,
          shelfLife: item.shelfLife ? new Date(item.shelfLife) : null,
          supplyQuantity: item.supplyQuantity,
          supplyDate: item.supplyDate ? new Date(item.supplyDate) : null,
          supplier: item.supplier,
          location: item.location,
          temperature: item.temperature,
          isActive: true,
        };

        if (isIncremental) {
          // При инкрементальном обновлении проверяем существование
          await Product.findOneAndUpdate({ erpId: item.id }, productData, {
            upsert: true,
            new: true,
          });
        } else {
          // При полной синхронизации перезаписываем
          await Product.findOneAndUpdate({ erpId: item.id }, productData, {
            upsert: true,
            new: true,
            overwrite: true,
          });
        }
      } catch (error) {
        console.error(`Ошибка обработки товара ${item.id}:`, error);
      }
    }
  }

  // Обновление статистики поставщиков
  async updateSupplierStatistics() {
    try {
      const suppliers = await Product.distinct("supplier");

      for (const supplierName of suppliers) {
        if (!supplierName) continue;

        const stats = await Product.aggregate([
          { $match: { supplier: supplierName } },
          {
            $group: {
              _id: null,
              totalProducts: { $sum: 1 },
              branches: { $addToSet: "$branch" },
            },
          },
        ]);

        if (stats.length > 0) {
          // Проверяем существует ли поставщик
          let supplier = await Supplier.findOne({ name: supplierName });

          if (!supplier) {
            // Создаем нового поставщика с автоматическим паролем
            const username = supplierName.toLowerCase().replace(/\s+/g, "_");
            const password = Math.random().toString(36).slice(-8);

            supplier = new Supplier({
              name: supplierName,
              username,
              password, // будет хеширован в pre-save hook
            });
          }

          supplier.statistics = {
            totalProducts: stats[0].totalProducts,
            totalBranches: stats[0].branches.length,
            lastSync: new Date(),
          };

          await supplier.save();
        }
      }
    } catch (error) {
      console.error("Ошибка обновления статистики поставщиков:", error);
    }
  }

  // Запуск планировщика
  startScheduler() {
    // Полная синхронизация при запуске
    this.fullSync();

    // Инкрементальная синхронизация каждые 10 минут
    cron.schedule("*/10 * * * *", () => {
      console.log("⏰ Запуск запланированной синхронизации");
      this.incrementalSync();
    });

    console.log("📅 Планировщик синхронизации запущен (каждые 10 минут)");
  }

  // Получение статистики синхронизации
  async getSyncStatus() {
    const status = await SyncStatus.findOne();
    const productCount = await Product.countDocuments();
    const supplierCount = await Supplier.countDocuments();

    return {
      ...status?.toObject(),
      currentProductCount: productCount,
      currentSupplierCount: supplierCount,
    };
  }
}

module.exports = new OsonKassaSyncService();
