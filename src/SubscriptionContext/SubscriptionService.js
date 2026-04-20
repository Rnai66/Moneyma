/**
 * SubscriptionService.js
 *
 * Handles the full subscription lifecycle across platforms:
 *   Mobile (iOS/Android) → RevenueCat via @revenuecat/purchases-capacitor
 *   Web (Browser)        → Stripe Checkout (hosted page)
 *   Backend              → Supabase `subscriptions` table (source of truth)
 *
 * Platform detection is automatic — callers never need to branch.
 */

import SupabaseService from '../services/SupabaseService';

const supabase = SupabaseService.getClient();

// ─── Plan / Feature definitions ─────────────────────────────────────────────

export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    nameLocal: 'ฟรี',
    price: { monthly: 0, yearly: 0 },
    currency: 'THB',
    color: '#6b6b66',
    limits: {
      transactions_per_month: 50,
      budgets: 1,
      ai_scans_per_month: 0,
      export: false,
      cloud_sync: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    nameLocal: 'โปร',
    price: { monthly: 199, yearly: 1490 },
    currency: 'THB',
    color: '#2c6e49',
    badge: 'แนะนำ',
    limits: {
      transactions_per_month: Infinity,
      budgets: Infinity,
      ai_scans_per_month: 200,
      export: true,
      cloud_sync: true,
    },
  },
  business: {
    id: 'business',
    name: 'Business',
    nameLocal: 'ธุรกิจ',
    price: { monthly: 499, yearly: 3990 },
    currency: 'THB',
    color: '#7c5c1e',
    limits: {
      transactions_per_month: Infinity,
      budgets: Infinity,
      ai_scans_per_month: Infinity,
      export: true,
      cloud_sync: true,
      multi_workspace: true,
      api_access: true,
      priority_support: true,
    },
  },
};

/** Which plans can access each feature */
export const FEATURE_GATES = {
  cloud_sync:           ['pro', 'business'],
  ai_scan_slip:         ['pro', 'business'],
  ai_scan_bill:         ['pro', 'business'],
  auto_scan_batch:      ['pro', 'business'],
  export_excel:         ['pro', 'business'],
  export_pdf:           ['pro', 'business'],
  budget_limits:        ['pro', 'business'],
  slip_verify:          ['pro', 'business'],
  unlimited_tx:         ['pro', 'business'],
  multi_workspace:      ['business'],
  api_access:           ['business'],
  priority_support:     ['business'],
};

export function canAccess(userPlan, feature) {
  const allowed = FEATURE_GATES[feature];
  if (!allowed) return true; // unknown feature = open
  return allowed.includes(userPlan ?? 'free');
}

// ─── Platform detection ──────────────────────────────────────────────────────

function isMobile() {
  try {
    const { Capacitor } = require('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// ─── RevenueCat (mobile) ─────────────────────────────────────────────────────

let rcInitialized = false;
let Purchases = null;

async function getRC() {
  if (!Purchases) {
    const mod = await import('@revenuecat/purchases-capacitor');
    Purchases = mod.Purchases;
  }
  return Purchases;
}

/**
 * Map RevenueCat product IDs to our plan IDs.
 * Set these in your RevenueCat dashboard to match.
 */
const RC_PRODUCT_TO_PLAN = {
  'allslip_pro_monthly':     'pro',
  'allslip_pro_yearly':      'pro',
  'allslip_business_monthly':'business',
  'allslip_business_yearly': 'business',
};

export async function initRevenueCat(userId) {
  if (rcInitialized || !isMobile()) return;
  const RC = await getRC();
  const platform = (await import('@capacitor/core')).Capacitor.getPlatform();
  const apiKey = platform === 'ios'
    ? process.env.REACT_APP_REVENUECAT_API_KEY_IOS
    : process.env.REACT_APP_REVENUECAT_API_KEY_ANDROID;

  if (!apiKey) {
    console.warn('[RC] API key not set. Set REACT_APP_REVENUECAT_API_KEY_IOS/ANDROID');
    return;
  }
  await RC.configure({ apiKey, appUserID: userId });
  rcInitialized = true;
}

export async function getRevenueCatOfferings() {
  const RC = await getRC();
  const { offerings } = await RC.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function purchaseRevenueCat(rcPackage) {
  const RC = await getRC();
  const { customerInfo } = await RC.purchasePackage({ aPackage: rcPackage });
  const activeSubs = Object.keys(customerInfo.entitlements.active);
  const productId = activeSubs[0];
  const plan = RC_PRODUCT_TO_PLAN[productId] ?? 'free';

  await syncSubscriptionToSupabase({
    plan,
    status: 'active',
    provider: 'revenuecat',
    provider_subscription_id: productId,
    current_period_end: customerInfo.latestExpirationDate
      ? new Date(customerInfo.latestExpirationDate).toISOString()
      : null,
  });

  return { plan, customerInfo };
}

export async function restoreRevenueCat() {
  const RC = await getRC();
  const { customerInfo } = await RC.restorePurchases();
  const active = Object.keys(customerInfo.entitlements.active);

  if (!active.length) {
    await syncSubscriptionToSupabase({ plan: 'free', status: 'active', provider: 'revenuecat' });
    return { plan: 'free' };
  }

  const plan = RC_PRODUCT_TO_PLAN[active[0]] ?? 'free';
  await syncSubscriptionToSupabase({
    plan, status: 'active', provider: 'revenuecat',
    provider_subscription_id: active[0],
    current_period_end: customerInfo.latestExpirationDate
      ? new Date(customerInfo.latestExpirationDate).toISOString() : null,
  });
  return { plan };
}

// ─── Stripe (web) ────────────────────────────────────────────────────────────

/**
 * Stripe Price IDs per plan/period.
 * Create these in Stripe Dashboard → Products → Add price
 */
const STRIPE_PRICE_IDS = {
  pro_monthly:       process.env.REACT_APP_STRIPE_PRO_MONTHLY_PRICE_ID,
  pro_yearly:        process.env.REACT_APP_STRIPE_PRO_YEARLY_PRICE_ID,
  business_monthly:  process.env.REACT_APP_STRIPE_BUSINESS_MONTHLY_PRICE_ID,
  business_yearly:   process.env.REACT_APP_STRIPE_BUSINESS_YEARLY_PRICE_ID,
};

/**
 * Redirect to Stripe Checkout.
 * On success, Stripe redirects back to /subscription/success?session_id=...
 * Your FastAPI backend at /api/stripe/create-checkout handles session creation.
 */
export async function createStripeCheckout(plan, period = 'monthly') {
  const priceKey = `${plan}_${period}`;
  const priceId = STRIPE_PRICE_IDS[priceKey];
  if (!priceId) throw new Error(`No Stripe price configured for ${priceKey}`);

  const { data: { session: authSession } } = await supabase.auth.getSession();
  const token = authSession?.access_token;
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/stripe-checkout`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        priceId,
        successUrl: `${window.location.origin}/subscription/success`,
        cancelUrl:  `${window.location.origin}/subscription/cancel`,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Checkout error ${res.status}`);
  }

  const { url } = await res.json();
  window.location.href = url; // redirect to Stripe hosted checkout
}

/**
 * Open Stripe Customer Portal to manage/cancel subscription.
 */
export async function openStripePortal() {
  const { data: { session: authSession } } = await supabase.auth.getSession();
  const token = authSession?.access_token;

  const res = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/stripe-portal`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ returnUrl: window.location.href }),
    }
  );

  if (!res.ok) throw new Error('Failed to open portal');
  const { url } = await res.json();
  window.location.href = url;
}

// ─── Supabase sync ───────────────────────────────────────────────────────────

export async function syncSubscriptionToSupabase(data) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const record = {
    user_id: user.id,
    plan: data.plan ?? 'free',
    status: data.status ?? 'active',
    provider: data.provider ?? null,
    provider_customer_id: data.provider_customer_id ?? null,
    provider_subscription_id: data.provider_subscription_id ?? null,
    current_period_start: data.current_period_start ?? null,
    current_period_end: data.current_period_end ?? null,
    trial_end: data.trial_end ?? null,
    cancel_at_period_end: data.cancel_at_period_end ?? false,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('subscriptions')
    .upsert(record, { onConflict: 'user_id' });

  if (error) console.error('[Sub] Supabase sync error:', error);
}

/**
 * Load current user's subscription from Supabase.
 * Falls back to { plan: 'free' } if no record found.
 */
export async function loadSubscription() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { plan: 'free', status: 'active' };

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error || !data) return { plan: 'free', status: 'active' };

  // Check if subscription has expired
  if (data.current_period_end) {
    const expired = new Date(data.current_period_end) < new Date();
    if (expired && data.plan !== 'free') {
      await syncSubscriptionToSupabase({ plan: 'free', status: 'expired' });
      return { ...data, plan: 'free', status: 'expired' };
    }
  }

  return data;
}

// ─── Unified purchase entry point ────────────────────────────────────────────

/**
 * Purchase a plan — automatically routes to RevenueCat (mobile) or Stripe (web).
 * @param {string} plan      - 'pro' | 'business'
 * @param {string} period    - 'monthly' | 'yearly'
 * @param {object} rcPackage - RevenueCat package (only needed on mobile)
 */
export async function purchasePlan(plan, period = 'monthly', rcPackage = null) {
  if (isMobile()) {
    if (!rcPackage) throw new Error('rcPackage required on mobile');
    return purchaseRevenueCat(rcPackage);
  } else {
    return createStripeCheckout(plan, period);
  }
}
