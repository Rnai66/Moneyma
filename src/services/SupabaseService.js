import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

// Initialize with your Supabase credentials
// Get these from your Supabase project settings
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

function getAuthRedirectBaseUrl() {
  const nativeRedirectUrl = process.env.REACT_APP_NATIVE_AUTH_REDIRECT_URL?.trim();
  const siteUrl = process.env.REACT_APP_SITE_URL?.trim();

  if (Capacitor.isNativePlatform()) {
    if (nativeRedirectUrl) {
      return nativeRedirectUrl.replace(/\/$/, '');
    }

    return 'moneyma://auth';
  }

  if (typeof window !== 'undefined') {
    const { origin, protocol } = window.location;
    const isHttpOrigin = protocol === 'http:' || protocol === 'https:';
    const isLocalhost = /localhost|127\.0\.0\.1/.test(window.location.hostname);

    if (isHttpOrigin && !isLocalhost) {
      return origin;
    }
  }

  if (siteUrl) {
    return siteUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }

  return '';
}

function getPasswordResetRedirectUrl() {
  const redirectBaseUrl = getAuthRedirectBaseUrl();
  if (!redirectBaseUrl) {
    return '';
  }

  if (Capacitor.isNativePlatform()) {
    return `${redirectBaseUrl}/update-password`;
  }

  return `${redirectBaseUrl}/?mode=update-password`;
}

function getRecoveryParamsFromUrl() {
  if (typeof window === 'undefined') {
    return null;
  }

  const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '');
  const searchParams = new URLSearchParams(window.location.search);
  const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
  const type = hashParams.get('type') || searchParams.get('type');

  if (!accessToken || !refreshToken || type !== 'recovery') {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}

class SupabaseService {
  constructor() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('Supabase credentials not configured. Auth will not work.');
      console.warn('Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY environment variables.');
    }
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // =====================
  // Authentication Methods
  // =====================

  /**
   * Sign up a new user
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {object} metadata - Additional user metadata (firstName, lastName, etc.)
   */
  async signUp(email, password, metadata = {}) {
    try {
      const { data, error } = await this.client.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      });

      if (error) throw error;
      return { user: data.user, session: data.session, error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return { user: null, session: null, error };
    }
  }

  /**
   * Sign in with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   */
  async signIn(email, password) {
    try {
      const { data, error } = await this.client.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      return { user: data.user, session: data.session, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { user: null, session: null, error };
    }
  }

  /**
   * Sign out current user
   */
  async signOut() {
    try {
      const { error } = await this.client.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error };
    }
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser() {
    try {
      const { data, error } = await this.client.auth.getUser();
      if (error) throw error;
      return { user: data.user, error: null };
    } catch (error) {
      console.error('Get current user error:', error);
      return { user: null, error };
    }
  }

  /**
   * Get current session
   */
  async getSession() {
    try {
      const { data, error } = await this.client.auth.getSession();
      if (error) throw error;
      return { session: data.session, error: null };
    } catch (error) {
      console.error('Get session error:', error);
      return { session: null, error };
    }
  }

  /**
   * Subscribe to auth state changes
   * @param {function} callback - Function to call when auth state changes
   */
  onAuthStateChange(callback) {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      callback(session);
    });
    return data;
  }

  async establishRecoverySessionFromUrl() {
    try {
      const recoveryParams = getRecoveryParamsFromUrl();
      if (!recoveryParams) {
        return { session: null, error: null };
      }

      const { data, error } = await this.client.auth.setSession(recoveryParams);
      if (error) throw error;

      return { session: data.session, error: null };
    } catch (error) {
      console.error('Establish recovery session error:', error);
      return { session: null, error };
    }
  }

  /**
   * Reset password via email
   * @param {string} email - User email
   */
  async resetPassword(email) {
    try {
      const redirectTo = getPasswordResetRedirectUrl();
      if (!redirectTo) {
        throw new Error('Missing auth redirect URL. Set REACT_APP_SITE_URL for password reset links.');
      }

      const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Reset password error:', error);
      return { error };
    }
  }

  /**
   * Update user password
   * @param {string} newPassword - New password
   */
  async updatePassword(newPassword) {
    try {
      const { error } = await this.client.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Update password error:', error);
      return { error };
    }
  }

  // =====================
  // Database Methods
  // =====================

  /**
   * Fetch user profile data
   * @param {string} userId - User ID
   */
  async getUserProfile(userId) {
    try {
      const { data, error } = await this.client
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // Ignore PGRST116 error (no rows returned) when a profile doesn't exist yet
      if (error && error.code !== 'PGRST116') throw error;
      return { profile: data || null, error: null };
    } catch (error) {
      console.error('Get user profile error:', error);
      return { profile: null, error };
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {object} updates - Profile updates
   */
  async updateUserProfile(userId, updates) {
    try {
      const { data, error } = await this.client
        .from('user_profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { profile: data, error: null };
    } catch (error) {
      console.error('Update user profile error:', error);
      return { profile: null, error };
    }
  }

  /**
   * Save transactions to cloud
   * @param {string} userId - User ID
   * @param {array} transactions - Transactions to save
   */
  async saveTransactions(userId, transactions) {
    try {
      const { data, error } = await this.client
        .from('transactions')
        .upsert(
          transactions.map((tx) => ({
            ...tx,
            user_id: userId,
          }))
        )
        .select();

      if (error) throw error;
      return { transactions: data, error: null };
    } catch (error) {
      console.error('Save transactions error:', error);
      return { transactions: null, error };
    }
  }

  /**
   * Fetch user transactions from cloud
   * @param {string} userId - User ID
   */
  async getTransactions(userId) {
    try {
      const { data, error } = await this.client
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (error) throw error;
      return { transactions: data, error: null };
    } catch (error) {
      console.error('Get transactions error:', error);
      return { transactions: null, error };
    }
  }

  /**
   * Add a single transaction to cloud
   * @param {string} userId - User ID
   * @param {object} transaction - Transaction to add
   */
  async addTransaction(userId, transaction) {
    try {
      const { data, error } = await this.client
        .from('transactions')
        .insert({
          ...transaction,
          user_id: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return { transaction: data, error: null };
    } catch (error) {
      console.error('Add transaction error:', error);
      return { transaction: null, error };
    }
  }

  /**
   * Update a single transaction in cloud
   * @param {string} userId - User ID
   * @param {string} transactionId - Transaction ID
   * @param {object} updates - Updates to apply
   */
  async updateTransaction(userId, transactionId, updates) {
    try {
      const { data, error } = await this.client
        .from('transactions')
        .update(updates)
        .eq('id', transactionId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return { transaction: data, error: null };
    } catch (error) {
      console.error('Update transaction error:', error);
      return { transaction: null, error };
    }
  }

  /**
   * Delete a single transaction from cloud
   * @param {string} userId - User ID
   * @param {string} transactionId - Transaction ID
   */
  async deleteTransaction(userId, transactionId) {
    try {
      const { error } = await this.client
        .from('transactions')
        .delete()
        .eq('id', transactionId)
        .eq('user_id', userId);

      if (error) throw error;
      return { success: true, error: null };
    } catch (error) {
      console.error('Delete transaction error:', error);
      return { success: false, error };
    }
  }

  /**
   * Log error/crash to database
   * @param {string} userId - User ID (optional)
   * @param {object} errorData - Error information
   */
  async logError(userId, errorData) {
    try {
      const { error: dbError } = await this.client
        .from('error_logs')
        .insert({
          user_id: userId,
          error_message: errorData.message,
          error_stack: errorData.stack,
          error_type: errorData.type,
          app_version: errorData.appVersion,
          timestamp: new Date().toISOString(),
        });

      if (dbError) throw dbError;
      return { error: null };
    } catch (error) {
      console.error('Log error error:', error);
      return { error };
    }
  }

  /**
   * Get Supabase client instance
   */
  getClient() {
    return this.client;
  }

  // =====================
  // Budget Methods
  // =====================

  /**
   * Set budget limit for a category
   * @param {string} userId - User ID
   * @param {string} category - Budget category
   * @param {number} limitAmount - Budget limit amount
   * @param {number} alertThreshold - Alert threshold percentage (0-100)
   * @param {string} period - Budget period (monthly, weekly, etc.)
   */
  async setBudget(userId, category, limitAmount, alertThreshold = 80, period = 'monthly') {
    try {
      // First check if budget already exists for this category
      const { data: existing, error: fetchError } = await this.client
        .from('budget_limits')
        .select('id')
        .eq('user_id', userId)
        .eq('category', category)
        .eq('period', period)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw fetchError;
      }

      let result;
      if (existing) {
        // Update existing budget
        const { data, error } = await this.client
          .from('budget_limits')
          .update({
            limit_amount: limitAmount,
            alert_threshold: alertThreshold,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Create new budget
        const { data, error } = await this.client
          .from('budget_limits')
          .insert({
            user_id: userId,
            category,
            limit_amount: limitAmount,
            alert_threshold: alertThreshold,
            period
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return { budget: result, error: null };
    } catch (error) {
      console.error('Set budget error:', error);
      return { budget: null, error };
    }
  }

  /**
   * Get budget limits for user
   * @param {string} userId - User ID
   * @param {string} period - Budget period filter (optional)
   */
  async getBudgets(userId, period = null) {
    try {
      let query = this.client
        .from('budget_limits')
        .select('*')
        .eq('user_id', userId);

      if (period) {
        query = query.eq('period', period);
      }

      const { data, error } = await query.order('category');

      if (error) throw error;
      return { budgets: data || [], error: null };
    } catch (error) {
      console.error('Get budgets error:', error);
      return { budgets: [], error };
    }
  }

  /**
   * Delete budget limit
   * @param {string} userId - User ID
   * @param {string} category - Budget category to delete
   * @param {string} period - Budget period
   */
  async deleteBudget(userId, category, period = 'monthly') {
    try {
      const { error } = await this.client
        .from('budget_limits')
        .delete()
        .eq('user_id', userId)
        .eq('category', category)
        .eq('period', period);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error('Delete budget error:', error);
      return { error };
    }
  }

  /**
   * Get budget status (used vs limit) for current month
   * @param {string} userId - User ID
   * @param {string} month - Month in YYYY-MM format
   */
  async getBudgetStatus(userId, month) {
    try {
      // Get all budgets for user
      const { budgets, error: budgetError } = await this.getBudgets(userId, 'monthly');
      if (budgetError) throw budgetError;

      // Get transactions for the month
      const startDate = `${month}-01`;
      const endDate = new Date(month.split('-')[0], month.split('-')[1], 0).toISOString().split('T')[0];

      const { data: transactions, error: txError } = await this.client
        .from('transactions')
        .select('category, amount, type')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate);

      if (txError) throw txError;

      // Calculate budget status
      const status = budgets.map(budget => {
        const categoryExpenses = transactions
          .filter(tx => tx.category === budget.category && tx.type === 'expense')
          .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

        const alertThreshold = budget.alert_threshold || 80;
        const percentage = budget.limit_amount > 0 ? (categoryExpenses / budget.limit_amount) * 100 : 0;
        const remaining = budget.limit_amount - categoryExpenses;

        let statusType = 'normal';
        if (percentage >= 100) statusType = 'exceeded';
        else if (percentage >= alertThreshold) statusType = 'warning';

        return {
          category: budget.category,
          limit: budget.limit_amount,
          used: categoryExpenses,
          remaining,
          percentage: Math.round(percentage),
          alertThreshold,
          status: statusType
        };
      });

      return { status, error: null };
    } catch (error) {
      console.error('Get budget status error:', error);
      return { status: [], error };
    }
  }
}

// Export singleton instance
const supabaseServiceInstance = new SupabaseService();
export default supabaseServiceInstance;
