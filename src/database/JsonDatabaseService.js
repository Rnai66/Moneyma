const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULT_CATEGORIES = [
  { id: 1, name: 'เงินเดือน', type: 'income', color: '#10b981' },
  { id: 2, name: 'โบนัส', type: 'income', color: '#10b981' },
  { id: 3, name: 'ดอกเบี้ย', type: 'income', color: '#10b981' },
  { id: 4, name: 'อื่น ๆ', type: 'income', color: '#10b981' },
  { id: 5, name: 'อาหาร', type: 'expense', color: '#ef4444' },
  { id: 6, name: 'ค่าขนส่ง', type: 'expense', color: '#ef4444' },
  { id: 7, name: 'ค่าเช่า', type: 'expense', color: '#ef4444' },
  { id: 8, name: 'สาธารณูปโภค', type: 'expense', color: '#ef4444' },
  { id: 9, name: 'ความบันเทิง', type: 'expense', color: '#ef4444' },
  { id: 10, name: 'สุขภาพ', type: 'expense', color: '#ef4444' },
  { id: 11, name: 'ช้อปปิ้ง', type: 'expense', color: '#ef4444' },
  { id: 12, name: 'อื่น ๆ', type: 'expense', color: '#ef4444' }
];

class JsonDatabaseService {
  constructor(customPath = null) {
    const userDataPath = app.getPath('userData');
    this.dbPath = customPath || path.join(userDataPath, 'finance.json');
    this.data = { transactions: [], budgets: [], categories: DEFAULT_CATEGORIES };
    this.init();
  }

  init() {
    this.ensureDirectory();
    if (!fs.existsSync(this.dbPath)) {
      this.persist();
      return;
    }

    try {
      const raw = fs.readFileSync(this.dbPath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        transactions: parsed.transactions || [],
        budgets: parsed.budgets || [],
        categories: parsed.categories?.length ? parsed.categories : DEFAULT_CATEGORIES,
      };
    } catch (error) {
      console.error('JSON database initialization error:', error);
      this.data = { transactions: [], budgets: [], categories: DEFAULT_CATEGORIES };
      this.persist();
    }
  }

  ensureDirectory() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
  }

  persist() {
    this.ensureDirectory();
    fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  nextId(items) {
    return items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  }

  async getTransactions(filters = {}) {
    let items = [...this.data.transactions];

    if (filters.type) items = items.filter(tx => tx.type === filters.type);
    if (filters.category) items = items.filter(tx => tx.category === filters.category);
    if (filters.startDate) items = items.filter(tx => tx.date >= filters.startDate);
    if (filters.endDate) items = items.filter(tx => tx.date <= filters.endDate);
    if (filters.search) {
      const term = filters.search.toLowerCase();
      items = items.filter(tx =>
        tx.category.toLowerCase().includes(term) ||
        (tx.description || '').toLowerCase().includes(term)
      );
    }

    return items.sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return (b.id || 0) - (a.id || 0);
    });
  }

  async addTransaction(transaction) {
    const item = {
      id: this.nextId(this.data.transactions),
      type: transaction.type,
      amount: Number(transaction.amount),
      category: transaction.category,
      description: transaction.description || '',
      date: transaction.date,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.data.transactions.push(item);
    this.persist();
    return item;
  }

  async updateTransaction(id, transaction) {
    const numericId = Number(id);
    const index = this.data.transactions.findIndex(tx => Number(tx.id) === numericId);
    if (index === -1) throw new Error('Transaction not found');

    this.data.transactions[index] = {
      ...this.data.transactions[index],
      ...transaction,
      id: numericId,
      amount: Number(transaction.amount),
      updatedAt: new Date().toISOString(),
    };
    this.persist();
    return this.data.transactions[index];
  }

  async deleteTransaction(id) {
    const numericId = Number(id);
    this.data.transactions = this.data.transactions.filter(tx => Number(tx.id) !== numericId);
    this.persist();
    return true;
  }

  async getTransactionById(id) {
    return this.data.transactions.find(tx => Number(tx.id) === Number(id)) || null;
  }

  async saveAllTransactions(transactions) {
    this.data.transactions = [...transactions];
    this.persist();
    return { success: true, count: transactions.length };
  }

  async getSummary() {
    return this.data.transactions.reduce((acc, tx) => {
      if (tx.type === 'income') acc.totalIncome += Number(tx.amount) || 0;
      else acc.totalExpense += Number(tx.amount) || 0;
      acc.balance = acc.totalIncome - acc.totalExpense;
      return acc;
    }, { totalIncome: 0, totalExpense: 0, balance: 0 });
  }

  async getStatisticsByMonth() {
    const map = {};
    this.data.transactions.forEach(tx => {
      const key = String(tx.date).slice(0, 7);
      if (!map[key]) map[key] = { month: key, income: 0, expense: 0, balance: 0 };
      if (tx.type === 'income') map[key].income += Number(tx.amount) || 0;
      else map[key].expense += Number(tx.amount) || 0;
      map[key].balance = map[key].income - map[key].expense;
    });
    return Object.values(map).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 12);
  }

  async getStatisticsByCategory() {
    const map = {};
    this.data.transactions.forEach(tx => {
      const key = `${tx.category}:${tx.type}`;
      if (!map[key]) map[key] = { category: tx.category, type: tx.type, total: 0, count: 0 };
      map[key].total += Number(tx.amount) || 0;
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }

  async getCategories(type = null) {
    const items = [...this.data.categories].sort((a, b) => a.name.localeCompare(b.name));
    return type ? items.filter(item => item.type === type) : items;
  }

  close() {}

  async setBudget(category, budget_limit, month, alertThreshold = 80) {
    const key = `${category}:${month}`;
    const existingIndex = this.data.budgets.findIndex(item => `${item.category}:${item.month}` === key);
    const payload = {
      id: existingIndex >= 0 ? this.data.budgets[existingIndex].id : this.nextId(this.data.budgets),
      category,
      budget_limit: Number(budget_limit),
      month,
      alertThreshold: Number(alertThreshold),
      updatedAt: new Date().toISOString(),
      createdAt: existingIndex >= 0 ? this.data.budgets[existingIndex].createdAt : new Date().toISOString(),
    };

    if (existingIndex >= 0) this.data.budgets[existingIndex] = payload;
    else this.data.budgets.push(payload);

    this.persist();
    return payload;
  }

  async getBudgets(month) {
    return this.data.budgets
      .filter(item => item.month === month)
      .sort((a, b) => a.category.localeCompare(b.category));
  }

  async getBudgetByCategory(category, month) {
    return this.data.budgets.find(item => item.category === category && item.month === month) || null;
  }

  async deleteBudget(category, month) {
    this.data.budgets = this.data.budgets.filter(item => !(item.category === category && item.month === month));
    this.persist();
    return true;
  }

  async getCategorySpent(category, month) {
    return this.data.transactions
      .filter(tx => tx.type === 'expense' && tx.category === category && String(tx.date).startsWith(month))
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }

  async getBudgetStatus(month) {
    const budgets = await this.getBudgets(month);
    return Promise.all(budgets.map(async budget => {
      const spent = await this.getCategorySpent(budget.category, month);
      const budgetLimit = Number(budget.budget_limit) || 0;
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
        remaining: budgetLimit - spent,
      };
    }));
  }
}

module.exports = JsonDatabaseService;
