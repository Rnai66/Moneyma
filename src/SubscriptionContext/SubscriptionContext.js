import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  loadSubscription,
  initRevenueCat,
  canAccess,
  PLANS,
} from './SubscriptionService';
import SupabaseService from '../services/SupabaseService';

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) { setLoading(false); return; }

      // Init RevenueCat on mobile (non-blocking)
      initRevenueCat(user.id).catch(console.warn);

      await refresh();
    }

    init();
    return () => { mounted = false; };
  }, [refresh]);

  // ── Re-load when auth state changes ────────────────────────────────────────
  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_IN') refresh();
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
