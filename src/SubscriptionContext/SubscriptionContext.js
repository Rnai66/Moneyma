import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  loadSubscription,
  initRevenueCat,
  canAccess,
  PLANS,
} from './SubscriptionService';
import SupabaseService from '../services/SupabaseService';
import { identifyUser } from '../services/rcClient';

const supabase = SupabaseService.getClient();

// ─── Context shape ───────────────────────────────────────────────────────────
const SubscriptionContext = createContext({
  plan: 'free',
  status: 'active',
  subscription: null,
  planInfo: PLANS.free,
  isPro: false,
  isBusiness: false,
  loading: true,
  can: () => false,
  refresh: async () => {},
  showPaywall: false,
  openPaywall: () => {},
  closePaywall: () => {},
  paywallFeature: null,
});

// ─── Provider ────────────────────────────────────────────────────────────────
export function SubscriptionProvider({ children }) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState(null);

  const plan = subscription?.plan ?? 'free';
  const status = subscription?.status ?? 'active';
  const planInfo = PLANS[plan] ?? PLANS.free;
  const isPro = plan === 'pro' || plan === 'business';
  const isBusiness = plan === 'business';

  /** Check if the current user can access a feature */
  const can = useCallback((feature) => canAccess(plan, feature), [plan]);

  /** Load subscription from Supabase */
  const refresh = useCallback(async () => {
    try {
      const data = await loadSubscription();
      setSubscription(data);
    } catch (err) {
      console.error('[Sub] load error:', err);
      setSubscription({ plan: 'free', status: 'active' });
    } finally {
      setLoading(false);
    }
  }, []);

  /** Open paywall modal, optionally pre-highlighting a feature */
  const openPaywall = useCallback((featureId = null) => {
    setPaywallFeature(featureId);
    setShowPaywall(true);
  }, []);

  const closePaywall = useCallback(() => {
    setShowPaywall(false);
    setPaywallFeature(null);
  }, []);

  // ── Bootstrap ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      // 🔴 ต้องยิงก่อนแตะ Supabase เสมอ และห้าม await
      // เดิมบรรทัดนี้อยู่ "หลัง" await supabase.auth.getUser() ซึ่งแปลว่า
      // ถ้าเน็ตช้าหรือ Supabase ตอบช้า RevenueCat จะยังไม่ถูก configure เลย
      // ผู้ตรวจของ Apple ที่กด "ลองใช้แบบผู้เยี่ยมชม" แล้วรีบกด Subscribe
      // จึงเจอปุ่มหมุนค้าง เพราะ SDK ยังไม่พร้อม
      // ไม่ส่ง userId = ใช้ anonymous app user ของ RevenueCat (guest ซื้อได้ทันที)
      initRevenueCat().catch(console.warn);

      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          // ผูก anonymous id เดิมเข้ากับ user จริงด้วย logIn ไม่ configure ซ้ำ
          identifyUser(user.id).catch(console.warn);
          await refresh();
        } else {
          setSubscription({ plan: 'free', status: 'active' });
        }
      } catch (err) {
        console.warn('[Sub] init error:', err);
        setSubscription({ plan: 'free', status: 'active' });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();
    return () => { mounted = false; };
  }, [refresh]);

  // ── Re-load when auth state changes ────────────────────────────────────────
  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN') {
          if (session?.user?.id) {
            // logIn ไม่ใช่ configure — configure ซ้ำคือสิ่งที่ทำให้ปุ่มซื้อค้าง
            identifyUser(session.user.id).catch(console.warn);
          }
          refresh();
        }
        if (event === 'SIGNED_OUT') {
          setSubscription({ plan: 'free', status: 'active' });
          setLoading(false);
        }
      }
    );
    return () => authSub?.unsubscribe();
  }, [refresh]);

  // ── Real-time subscription updates from Supabase ───────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('subscription-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'subscriptions',
      }, () => refresh())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [refresh]);

  const value = {
    plan, status, subscription, planInfo,
    isPro, isBusiness, loading,
    can, refresh,
    showPaywall, openPaywall, closePaywall, paywallFeature,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useSubscription() {
  return useContext(SubscriptionContext);
}

/**
 * Returns whether the current user can access a feature.
 * Also returns openPaywall for easy upgrade prompting.
 *
 * @example
 * const { allowed, requirePro } = useFeatureGate('ai_scan_slip');
 * if (!allowed) return <button onClick={requirePro}>Unlock AI Scan</button>;
 */
export function useFeatureGate(feature) {
  const { can, openPaywall, plan, loading } = useContext(SubscriptionContext);
  const allowed = can(feature);

  const requirePro = useCallback(() => {
    if (!allowed) openPaywall(feature);
  }, [allowed, openPaywall, feature]);

  return { allowed, requirePro, plan, loading };
}
