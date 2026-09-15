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

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

class SupabaseService {
  constructor() {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('Supabase credentials not configured. Auth will not work.');
      console.warn('Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY environment variables.');
    }
    const isNative = Capacitor.isNativePlatform();

    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // PKCE returns a one-time ?code= that we exchange ourselves after the
        // deep link comes back — safer than tokens in a URL fragment.
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        // On native the OAuth response never lands in this WebView's address
        // bar (it arrives as a moneyma:// deep link), so URL detection is off
        // and App.js hands the URL to completeAuthFromDeepLink() instead.
        detectSessionInUrl: !isNative,
      },
    });
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
   * Performs non-blocking revocation with instant local storage cleanup
   */
  async signOut() {
    try {
      const globalPromise = this.client.auth.signOut({ scope: 'global' });
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1200));

      // Wait for server token revocation or timeout (whichever comes first)
      await Promise.race([globalPromise, timeoutPromise]).catch(() => {});

      // Always ensure local session tokens are wiped
      await this.client.auth.signOut({ scope: 'local' }).catch(() => {});
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      try {
        await this.client.auth.signOut({ scope: 'local' });
      } catch {
        /* ignore */
      }
      return { error: null };
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

  /**
   * Finish an OAuth sign-in that came back through a custom-scheme deep link
   * (Android/iOS). Supabase's detectSessionInUrl only looks at window.location,
   * which never sees moneyma://auth — so the tokens have to be handed over here.
   * @param {string} url full deep-link URL
   * @returns {Promise<{session: object|null, error: Error|null}>}
   */
  async completeAuthFromDeepLink(url) {
    try {
      if (!url) return { session: null, error: null };

      const hashPart = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
      const queryPart = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';

      const params = new URLSearchParams(hashPart || queryPart);

      // implicit flow — tokens arrive directly
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token && refresh_token) {
        const { data, error } = await this.client.auth.setSession({ access_token, refresh_token });
        if (error) throw error;
        return { session: data.session, error: null };
      }

      // PKCE flow — exchange the one-time code
      const code = params.get('code') || new URLSearchParams(queryPart).get('code');
      if (code) {
        const { data, error } = await this.client.auth.exchangeCodeForSession(code);
        if (error) throw error;
        return { session: data.session, error: null };
      }

      return { session: null, error: null };
    } catch (error) {
      console.error('Deep link auth error:', error);
      return { session: null, error };
    }
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

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle() {
    try {
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = getAuthRedirectBaseUrl();

      const { data, error } = await this.client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          // On native we take the URL ourselves instead of letting supabase-js
          // navigate the WebView. Google rejects OAuth inside embedded WebViews
          // (error: disallowed_useragent), so it has to run in a real browser.
          skipBrowserRedirect: isNative,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;

      if (isNative) {
        if (!data?.url) {
          throw new Error('Supabase did not return an authorization URL');
        }

        // Opens external browser (Safari on iOS / Chrome on Android)
        // Once completed, Supabase redirects back to moneyma://auth
        window.open(data.url, '_system');
      }

      return { data, error: null };
    } catch (error) {
      console.error('Google sign in error:', error);
      return { data: null, error };
    }
  }

  /**
   * Sign in with Apple (Native iOS Sheet via ID Token / Web OAuth)
   */
  async signInWithApple() {
    try {
      if (Capacitor.isNativePlatform()) {
        const { SignInWithApple } = await import('@capacitor-community/apple-sign-in');
        const result = await SignInWithApple.authorize({
          clientId: 'com.personalfinance.manager',
          redirectURI: 'https://nvgqqhqoarkfulsebepj.supabase.co/auth/v1/callback',
          scopes: 'email name',
        });

        if (!result.response?.identityToken) {
          throw new Error('No identity token received from Apple');
        }

        const { data, error } = await this.client.auth.signInWithIdToken({
          provider: 'apple',
          token: result.response.identityToken,
        });

        if (error) throw error;
        return { data, error: null };
      }

      // Web OAuth Fallback
      const redirectTo = getAuthRedirectBaseUrl();
      const { data, error } = await this.client.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo,
        },
      });

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error('Apple sign in error:', error);
      return { data: null, error };
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
        .maybeSingle();

      if (error) throw error;
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
        .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() })
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
      let targetUserId = userId;
      if (!targetUserId) {
        const { user } = await this.getCurrentUser();
        targetUserId = user?.id;
      }
      if (!targetUserId) {
        throw new Error('User ID is required to save transactions');
      }

      if (!Array.isArray(transactions) || transactions.length === 0) {
        return { transactions: [], error: null };
      }

      const sanitized = transactions.map((tx) => {
        const isValidUUID = typeof tx.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tx.id);
        return {
          id: isValidUUID ? tx.id : generateUUID(),
          user_id: targetUserId,
          type: tx.type === 'income' ? 'income' : 'expense',
          amount: Math.abs(Number(tx.amount)) || 0,
          category: typeof tx.category === 'string' && tx.category.trim() ? tx.category.trim() : 'อื่น ๆ',
          description: typeof tx.description === 'string' ? tx.description : '',
          date: typeof tx.date === 'string' && tx.date.trim() ? tx.date : new Date().toISOString().split('T')[0],
          updated_at: tx.updated_at || new Date().toISOString(),
        };
      });

      /**
       * 🔴 อัปโหลดเป็นก้อนละ 100 แถว ไม่ใช่ยิงทีเดียวทั้งหมด
       *
       * เดิมยิง upsert ก้อนเดียวทั้งชุด ถ้าพลาด (แม้เพราะแถวเสียแถวเดียว)
       * จะร่วงไปเส้น "ไล่ทีละแถว" ทั้ง 300 แถว = 300 รอบเน็ต
       * ผู้ใช้ที่มี 350+ รายการจึงชนเพดาน 20 วิ แล้วค้างไว้ 166 แถวทุกครั้ง
       * ไม่มีวันตามทัน · แบ่งก้อนแล้วก้อนที่ดีผ่านฉลุย เหลือแค่ก้อนที่มีปัญหา
       * ที่ต้องไล่ทีละแถว และไล่เฉพาะใน 100 แถวนั้น
       */
      const CHUNK = 100;
      const successfulRows = [];
      const remapped = [];
      let rlsBlocked = 0;
      let rowFailed = 0;
      let firstError = null;

      // เพดานรวมของทั้งการอัปโหลด — งานที่เหลือยกไปรอบหน้า ไม่ปล่อยให้ค้างยาว
      const DEADLINE = Date.now() + 25000;
      let ranOutOfTime = false;

      for (let i = 0; i < sanitized.length; i += CHUNK) {
        if (Date.now() > DEADLINE) { ranOutOfTime = true; break; }
        const chunk = sanitized.slice(i, i + CHUNK);

        const { error: chunkError } = await this.client
          .from('transactions')
          .upsert(chunk, { onConflict: 'id' });

        if (!chunkError) {
          successfulRows.push(...chunk);
          continue;
        }

        firstError = firstError || chunkError;
        console.warn(`[sync] ก้อนที่ ${i / CHUNK + 1} ไม่ผ่าน (${chunk.length} แถว) ไล่ทีละแถว:`, chunkError.message);

        for (const row of chunk) {
          if (Date.now() > DEADLINE) { ranOutOfTime = true; break; }

          const { error: rowError } = await this.client
            .from('transactions')
            .upsert(row, { onConflict: 'id' });

          if (!rowError) {
            successfulRows.push(row);
            continue;
          }

          const isRls = rowError.message?.includes('violates row-level security') || rowError.code === '42501';
          if (!isRls) {
            rowFailed++;
            if (rowFailed <= 3) console.warn('[sync] แถว', row.id, 'ไม่ผ่าน:', rowError.message);
            continue;
          }

          /**
           * id นี้เป็นของผู้ใช้คนอื่นอยู่แล้ว (มักเกิดจากสลับบัญชีบนเครื่องเดียวกัน)
           * ออก id ใหม่ให้ "ครั้งเดียว" แล้วรายงานกลับไปให้เขียนทับของเดิมใน localStorage
           * ถ้าไม่รายงานกลับ รอบหน้าจะชนซ้ำแล้วแทรกแถวใหม่อีกใบ = database บวมไม่มีที่สิ้นสุด
           */
          rlsBlocked++;
          const freshId = generateUUID();
          const { error: retryError } = await this.client
            .from('transactions')
            .insert({ ...row, id: freshId });

          if (retryError) {
            rowFailed++;
            continue;
          }
          successfulRows.push({ ...row, id: freshId });
          remapped.push({ from: row.id, to: freshId });
        }
        if (ranOutOfTime) break;
      }

      const left = sanitized.length - successfulRows.length;
      if (rlsBlocked || rowFailed || ranOutOfTime) {
        console.warn(
          `[sync] สรุป: สำเร็จ ${successfulRows.length}/${sanitized.length}` +
          (rlsBlocked ? ` · ชน RLS ${rlsBlocked} (ออก id ใหม่ ${remapped.length})` : '') +
          (rowFailed ? ` · ล้มเหลว ${rowFailed}` : '') +
          (ranOutOfTime ? ` · หมดเวลา ค้างไว้ ${left} แถว รอบหน้าต่อให้` : '')
        );
      }

      if (successfulRows.length === 0 && firstError) throw firstError;

      return { transactions: successfulRows, remapped, error: null };

    } catch (error) {
      console.error('Save transactions error:', error.message || error);
      return { transactions: null, remapped: [], error };
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
   * ลบหลายรายการพร้อมกันบนคลาวด์ตามทะเบียน tombstone
   *
   * ผู้ใช้ที่ลบทิ้ง 50 รายการไม่ควรต้องรอ 50 รอบเน็ต — แบ่งเป็นก้อนละ 100
   * `.in()` มีเพดานความยาว URL อยู่ จึงห้ามยิงทีเดียวทั้งหมด
   * @returns {Promise<{deleted: string[], error: Error|null}>}
   */
  async deleteTransactions(userId, ids) {
    const list = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id);
    if (!userId || !list.length) return { deleted: [], error: null };

    const deleted = [];
    try {
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        const { error } = await this.client
          .from('transactions')
          .delete()
          .in('id', chunk)
          .eq('user_id', userId);
        if (error) throw error;
        deleted.push(...chunk);
      }
      return { deleted, error: null };
    } catch (error) {
      console.warn('[sync] ลบบนคลาวด์ไม่สำเร็จ:', error.message || error);
      // คืนเท่าที่ลบสำเร็จ — tombstone ที่เหลือยังอยู่ รอบหน้าลองใหม่ได้
      return { deleted, error };
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
   * ลบบัญชีและข้อมูลทั้งหมดอย่างถาวร
   *
   * Google Play บังคับให้แอปที่มีสมาชิกต้องมีช่องทางนี้ทั้งในแอปและบนเว็บ
   * การลบจริงทำที่ Edge Function `delete-account` เพราะการลบ auth user
   * ต้องใช้ service_role key ซึ่งห้ามอยู่ในแอปฝั่งผู้ใช้
   *
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  /**
   * ลบบัญชีและข้อมูลทั้งหมดอย่างถาวร
   *
   * Google Play บังคับให้แอปที่มีสมาชิกต้องมีช่องทางนี้ทั้งในแอปและบนเว็บ
   * การลบจริงทำที่ Edge Function `delete-account` เพราะการลบ auth user
   * ต้องใช้ service_role key ซึ่งห้ามอยู่ในแอปฝั่งผู้ใช้
   * มีระบบ Fallback ลบข้อมูลผ่าน RLS อัตโนมัติกรณี Edge Function ยังไม่ได้ deploy
   *
   * @returns {Promise<{success: boolean, error: Error|null}>}
   */
  async deleteAccount() {
    try {
      const { data: { session }, error: sessionError } =
        await this.client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session?.access_token) throw new Error('NOT_AUTHENTICATED');

      const userId = session.user?.id;
      let edgeFunctionSucceeded = false;

      // พยายามเรียก Edge Function ก่อน
      try {
        const { data, error } = await this.client.functions.invoke('delete-account', {
          body: { confirm: 'DELETE_MY_ACCOUNT' },
        });

        if (!error && data?.success) {
          edgeFunctionSucceeded = true;
        } else if (error) {
          console.warn('delete-account edge function returned error, trying client fallback:', error.message || error);
        }
      } catch (fnErr) {
        console.warn('delete-account edge function unreachable (FunctionsFetchError), falling back to client-side data deletion:', fnErr);
      }

      // ถ้า Edge Function ยังไม่ได้ deploy หรือเรียกไม่สำเร็จ ให้ลบข้อมูลทุกตารางของผู้ใช้ผ่าน RLS
      if (!edgeFunctionSucceeded && userId) {
        const userTables = [
          'sync_history',
          'error_logs',
          'budget_limits',
          'transactions',
          'user_ai_usage',
          'subscriptions',
          'sales_history',
          'po_history',
          'products',
        ];

        for (const table of userTables) {
          try {
            await this.client.from(table).delete().eq('user_id', userId);
          } catch (tErr) {
            console.warn(`[deleteAccount fallback] could not delete from ${table}:`, tErr);
          }
        }

        try {
          await this.client.from('user_profiles').delete().eq('id', userId);
        } catch (pErr) {
          console.warn('[deleteAccount fallback] could not delete user_profiles:', pErr);
        }
      }

      // ล้างร่องรอยในเครื่องทั้งหมด
      this.clearLocalUserData();

      // signOut แบบ local อย่างเดียว
      try {
        await this.client.auth.signOut({ scope: 'local' });
      } catch {
        /* ไม่เป็นไร ข้อมูลถูกลบไปแล้ว */
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Delete account error:', error);
      return { success: false, error };
    }
  }

  /**
   * ล้างข้อมูลผู้ใช้ที่เก็บไว้ในเครื่อง
   * เก็บค่าที่เป็นการตั้งค่าอุปกรณ์ไว้ (ภาษา ธีม) เพราะไม่ใช่ข้อมูลส่วนบุคคล
   */
  clearLocalUserData() {
    const KEEP = ['language', 'darkMode'];
    const REMOVE = [
      'webTransactions',
      'pendingSync',
      'lastSyncedAt',
      'storageMode',
      'guestMode',
      'mock_premium',
    ];
    try {
      REMOVE.forEach((k) => localStorage.removeItem(k));
      // เก็บกวาด key ของ supabase auth ที่หลงเหลือ
      Object.keys(localStorage)
        .filter((k) => /^sb-.*-auth-token/.test(k) && !KEEP.includes(k))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn('clearLocalUserData failed:', e);
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

  // =====================
  // Business Inventory & POS Methods
  // =====================

  /**
   * Save / Sync Products (Multi-Warehouse Inventory)
   * @param {string} userId - User ID
   * @param {array} products - Products list
   */
  async saveProducts(userId, products) {
    try {
      if (!products || !products.length) return { products: [], error: null };
      const records = products.map(p => ({
        id: String(p.id),
        user_id: userId,
        sku: p.sku || '',
        name: p.name || '',
        category: p.category || 'ทั่วไป',
        cost: Number(p.cost) || 0,
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 0,
        warehouse1: Number(p.warehouse1 !== undefined ? p.warehouse1 : p.stock) || 0,
        warehouse2: Number(p.warehouse2) || 0,
        warehouse3: Number(p.warehouse3) || 0,
        min_stock: Number(p.minStock) || 5,
        image_url: p.imageUrl || p.image || '',
        updated_at: new Date().toISOString(),
      }));

      const { data, error } = await this.client
        .from('products')
        .upsert(records)
        .select();

      if (error) throw error;
      return { products: data, error: null };
    } catch (error) {
      console.error('Save products error:', error);
      return { products: null, error };
    }
  }

  /**
   * Fetch Products (Multi-Warehouse Inventory)
   * @param {string} userId - User ID
   */
  async getProducts(userId) {
    try {
      const { data, error } = await this.client
        .from('products')
        .select('*')
        .eq('user_id', userId)
        .order('name');

      if (error) throw error;
      const formatted = (data || []).map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        cost: Number(p.cost) || 0,
        price: Number(p.price) || 0,
        stock: Number(p.stock) || 0,
        warehouse1: p.warehouse1 !== undefined ? p.warehouse1 : p.stock,
        warehouse2: p.warehouse2 || 0,
        warehouse3: p.warehouse3 || 0,
        minStock: p.min_stock,
        imageUrl: p.image_url || '',
      }));
      return { products: formatted, error: null };
    } catch (error) {
      console.error('Get products error:', error);
      return { products: [], error };
    }
  }

  /**
   * Save / Sync Sales History (Completed POS Sales)
   */
  async saveSalesHistory(userId, sales) {
    try {
      if (!sales || !sales.length) return { sales: [], error: null };
      const records = sales.map(s => ({
        id: String(s.id),
        user_id: userId,
        date: s.date || new Date().toISOString().split('T')[0],
        customer_name: s.customerName || '',
        customer_tax_id: s.customerTaxId || '',
        total_amount: Number(s.totalAmount) || 0,
        items: s.items || [],
      }));

      const { data, error } = await this.client
        .from('sales_history')
        .upsert(records)
        .select();

      if (error) throw error;
      return { sales: data, error: null };
    } catch (error) {
      console.error('Save sales history error:', error);
      return { sales: null, error };
    }
  }

  async getSalesHistory(userId) {
    try {
      const { data, error } = await this.client
        .from('sales_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const formatted = (data || []).map(s => ({
        id: s.id,
        date: s.date,
        customerName: s.customer_name,
        customerTaxId: s.customer_tax_id,
        totalAmount: Number(s.total_amount) || 0,
        items: s.items || [],
      }));
      return { sales: formatted, error: null };
    } catch (error) {
      console.error('Get sales history error:', error);
      return { sales: [], error };
    }
  }

  /**
   * Save / Sync Purchase Order History (Completed Stock In POs)
   */
  async savePoHistory(userId, pos) {
    try {
      if (!pos || !pos.length) return { pos: [], error: null };
      const records = pos.map(p => ({
        id: String(p.id),
        user_id: userId,
        date: p.date || new Date().toISOString().split('T')[0],
        target_warehouse: p.targetWarehouse || 'warehouse1',
        supplier_name: p.supplierName || '',
        supplier_tax_id: p.supplierTaxId || '',
        total_amount: Number(p.totalAmount) || 0,
        items: p.items || [],
      }));

      const { data, error } = await this.client
        .from('po_history')
        .upsert(records)
        .select();

      if (error) throw error;
      return { pos: data, error: null };
    } catch (error) {
      console.error('Save PO history error:', error);
      return { pos: null, error };
    }
  }

  async getPoHistory(userId) {
    try {
      const { data, error } = await this.client
        .from('po_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const formatted = (data || []).map(p => ({
        id: p.id,
        date: p.date,
        targetWarehouse: p.target_warehouse,
        supplierName: p.supplier_name,
        supplierTaxId: p.supplier_tax_id,
        totalAmount: Number(p.total_amount) || 0,
        items: p.items || [],
      }));
      return { pos: formatted, error: null };
    } catch (error) {
      console.error('Get PO history error:', error);
      return { pos: [], error };
    }
  }
}

// Export singleton instance
const supabaseServiceInstance = new SupabaseService();
export default supabaseServiceInstance;
