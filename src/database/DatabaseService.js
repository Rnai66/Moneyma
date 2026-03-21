const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

class DatabaseService {
  constructor(customPath = null) {
    const userDataPath = app.getPath('userData');
    this.dbPath = customPath || path.join(userDataPath, 'finance.db');
    this.db = null;
    this.init();
  }

  init() {
    try {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Database connection error:', err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables();
        }
      });
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  createTables() {
    const createTransactionsTable = `
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createCategoriesTable = `
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        color TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createBudgetsTable = `
      CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL UNIQUE,
        budget_limit REAL NOT NULL,
        month TEXT NOT NULL,
        alertThreshold REAL DEFAULT 80,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.serialize(() => {
      this.db.run(createTransactionsTable, (err) => {
        if (err) console.error('Error creating transactions table:', err);
      });

      this.db.run(createCategoriesTable, (err) => {
        if (err) console.error('Error creating categories table:', err);
        else this.insertDefaultCategories();
      });

      // Migration: check if the budgets table exists with the old 'limit' column
      // and recreate it using 'budget_limit' to avoid the reserved keyword conflict.
      this.db.all("PRAGMA table_info(budgets)", (err, columns) => {
        if (err || !columns || columns.length === 0) {
          // Table doesn't exist yet — create it fresh
          this.db.run(createBudgetsTable, (err) => {
            if (err) console.error('Error creating budgets table:', err);
          });
        } else {
          const hasOldColumn = columns.some(c => c.name === 'limit');
          if (hasOldColumn) {
            // Drop old table and recreate with correct column name
            this.db.run('DROP TABLE IF EXISTS budgets', (err) => {
              if (err) { console.error('Error dropping old budgets table:', err); return; }
              this.db.run(createBudgetsTable, (err) => {
                if (err) console.error('Error recreating budgets table:', err);
                else console.log('Migrated budgets table: renamed limit -> budget_limit');
              });
            });
          }
          // else: table already has budget_limit, nothing to do
        }
      });
    });
  }

  insertDefaultCategories() {
    const defaultCategories = [
      // Income categories
      { name: 'เงินเดือน', type: 'income', color: '#10b981' },
      { name: 'โบนัส', type: 'income', color: '#10b981' },
      { name: 'ดอกเบี้ย', type: 'income', color: '#10b981' },
      { name: 'อื่น ๆ', type: 'income', color: '#10b981' },

      // Expense categories
      { name: 'อาหาร', type: 'expense', color: '#ef4444' },
      { name: 'ค่าขนส่ง', type: 'expense', color: '#ef4444' },
      { name: 'ค่าเช่า', type: 'expense', color: '#ef4444' },
      { name: 'สาธารณูปโภค', type: 'expense', color: '#ef4444' },
      { name: 'ความบันเทิง', type: 'expense', color: '#ef4444' },
      { name: 'สุขภาพ', type: 'expense', color: '#ef4444' },
      { name: 'ช้อปปิ้ง', type: 'expense', color: '#ef4444' },
      { name: 'อื่น ๆ', type: 'expense', color: '#ef4444' }
    ];

    defaultCategories.forEach(cat => {
      this.db.run(
        'INSERT OR IGNORE INTO categories (name, type, color) VALUES (?, ?, ?)',
        [cat.name, cat.type, cat.color],
        (err) => {
          if (err) console.error('Error inserting category:', err);
        }
      );
    });
  }

  // Transaction Methods
  getTransactions(filters = {}) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM transactions WHERE 1=1';
      const params = [];

      if (filters.type) {
        query += ' AND type = ?';
        params.push(filters.type);
      }

      if (filters.category) {
        query += ' AND category = ?';
        params.push(filters.category);
      }

      if (filters.startDate) {
        query += ' AND date >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        query += ' AND date <= ?';
        params.push(filters.endDate);
      }

      if (filters.search) {
        query += ' AND (description LIKE ? OR category LIKE ?)';
        const searchTerm = `%${filters.search}%`;
        params.push(searchTerm, searchTerm);
      }

      query += ' ORDER BY date DESC';

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  addTransaction(transaction) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO transactions (type, amount, category, description, date) VALUES (?, ?, ?, ?, ?)',
        [
          transaction.type,
          transaction.amount,
          transaction.category,
          transaction.description || '',
          transaction.date
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...transaction });
        }
      );
    });
  }

  updateTransaction(id, transaction) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE transactions SET type = ?, amount = ?, category = ?, description = ?, date = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        [
          transaction.type,
          transaction.amount,
          transaction.category,
          transaction.description || '',
          transaction.date,
          id
        ],
        (err) => {
          if (err) reject(err);
          else resolve(this.getTransactionById(id));
        }
      );
    });
  }

  deleteTransaction(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM transactions WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  getTransactionById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM transactions WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  // Statistics Methods
  getSummary() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        let income = 0, expense = 0;

        this.db.get('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "income"', (err, row) => {
          if (!err) income = row.total;

          this.db.get('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "expense"', (err, row) => {
            if (!err) expense = row.total;

            resolve({
              totalIncome: income,
              totalExpense: expense,
              balance: income - expense
            });
          });
        });
      });
    });
  }

  getStatisticsByMonth() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          strftime('%Y-%m', date) as month,
          type,
          SUM(amount) as total
        FROM transactions
        GROUP BY strftime('%Y-%m', date), type
        ORDER BY month DESC
        LIMIT 12
      `;

      this.db.all(query, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  getStatisticsByCategory() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          category,
          type,
          SUM(amount) as total,
          COUNT(*) as count
        FROM transactions
        GROUP BY category, type
        ORDER BY total DESC
      `;

      this.db.all(query, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  getCategories(type = null) {
    return new Promise((resolve, reject) => {
      let query = 'SELECT * FROM categories';
      const params = [];

      if (type) {
        query += ' WHERE type = ?';
        params.push(type);
      }

      query += ' ORDER BY name';

      this.db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  // Budget Methods
  setBudget(category, budget_limit, month, alertThreshold = 80) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO budgets (category, budget_limit, month, alertThreshold) VALUES (?, ?, ?, ?)',
        [category, budget_limit, month, alertThreshold],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, category, budget_limit, month, alertThreshold });
        }
      );
    });
  }

  getBudgets(month) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM budgets WHERE month = ? ORDER BY category',
        [month],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  getBudgetByCategory(category, month) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM budgets WHERE category = ? AND month = ?',
        [category, month],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  deleteBudget(category, month) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM budgets WHERE category = ? AND month = ?',
        [category, month],
        (err) => {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  }

  getCategorySpent(category, month) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE category = ? AND type = "expense" AND date LIKE ?',
        [category, `${month}%`],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.total || 0);
        }
      );
    });
  }

  getBudgetStatus(month) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM budgets WHERE month = ?',
        [month],
        async (err, budgets) => {
          if (err) {
            reject(err);
            return;
          }

          const statusList = await Promise.all(
            (budgets || []).map(async (budget) => {
              const spent = await this.getCategorySpent(budget.category, month);
              const budgetLimit = budget.budget_limit;
              const percentage = budgetLimit > 0 ? (spent / budgetLimit) * 100 : 0;
              const isExceeded = spent > budgetLimit;
              const isWarning = percentage >= budget.alertThreshold && !isExceeded;

              return {
                ...budget,
                limit: budgetLimit,
                spent,
                percentage: Math.round(percentage),
                isExceeded,
                isWarning,
                remaining: budgetLimit - spent
              };
            })
          );

          resolve(statusList);
        }
      );
    });
  }
}

module.exports = DatabaseService;