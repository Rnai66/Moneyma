// ════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION INTEGRATION GUIDE
// Wire everything into your existing App.js in 3 steps
// ════════════════════════════════════════════════════════════════════════════

// ─── Step 1: Wrap your app with SubscriptionProvider ─────────────────────────
// In src/App.js — add provider + PaywallTrigger

import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { PaywallTrigger } from './components/PaywallScreen';

function App() {
  return (
    <AuthContext.Provider value={...}>
      <SubscriptionProvider>         {/* ← add this */}

        <Router>
          <Routes>
            {/* ... your existing routes ... */}
          </Routes>
        </Router>

        <PaywallTrigger />           {/* ← add this once near root */}

      </SubscriptionProvider>
    </AuthContext.Provider>
  );
}


// ─── Step 2: Gate features in your existing pages ────────────────────────────

// Option A — Block entire section (ScanSlip.js, reports.js, etc.)
import FeatureGate from '../components/FeatureGate';

// In transactions.js — wrap the scan slip button
<FeatureGate feature="ai_scan_slip">
  <ScanSlip onTransactionCreate={handleCreate} onClose={closeModal} />
</FeatureGate>

// In reports.js — wrap export buttons
<FeatureGate feature="export_excel" mode="overlay">
  <button onClick={handleExportExcel}>Export Excel</button>
</FeatureGate>

// In BudgetLimits.js — show nudge in settings row
import { UpgradeNudge } from '../components/FeatureGate';

{budgets.length >= 1 && !isPro && (
  <UpgradeNudge feature="budget_limits" />
)}

// Option B — Check inline with hook
import { useFeatureGate } from '../contexts/SubscriptionContext';

function ScanSlipButton() {
  const { allowed, requirePro } = useFeatureGate('ai_scan_slip');

  return (
    <button onClick={allowed ? openScanner : requirePro}>
      {allowed ? '📷 สแกนสลิป' : '🔒 สแกนสลิป (Pro)'}
    </button>
  );
}

// Option C — Read plan directly
import { useSubscription } from '../contexts/SubscriptionContext';

function SyncStatus() {
  const { plan, isPro, can } = useSubscription();
  if (!can('cloud_sync')) return <span>Cloud Sync — Pro เท่านั้น</span>;
  return <SyncIndicator />;
}


// ─── Step 3: Trigger paywall from anywhere ────────────────────────────────────

import { useSubscription } from '../contexts/SubscriptionContext';

function SettingsPage() {
  const { openPaywall, plan } = useSubscription();

  return (
    <div>
      <p>Plan: {plan}</p>
      <button onClick={() => openPaywall('cloud_sync')}>
        อัปเกรด
      </button>
    </div>
  );
}


// ─── ENV variables to add (.env.local) ───────────────────────────────────────
/*
# RevenueCat
REACT_APP_REVENUECAT_API_KEY_IOS=appl_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REACT_APP_REVENUECAT_API_KEY_ANDROID=goog_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Stripe (get from Stripe Dashboard → API Keys)
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxx

# Stripe Price IDs (Stripe Dashboard → Products → Add price)
REACT_APP_STRIPE_PRO_MONTHLY_PRICE_ID=price_xxxxxx
REACT_APP_STRIPE_PRO_YEARLY_PRICE_ID=price_xxxxxx
REACT_APP_STRIPE_BUSINESS_MONTHLY_PRICE_ID=price_xxxxxx
REACT_APP_STRIPE_BUSINESS_YEARLY_PRICE_ID=price_xxxxxx
*/


// ─── Supabase Edge Function env (supabase secrets set) ───────────────────────
/*
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxxxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxxxx
supabase secrets set STRIPE_PRO_MONTHLY_PRICE_ID=price_xxxxx
supabase secrets set STRIPE_PRO_YEARLY_PRICE_ID=price_xxxxx
supabase secrets set STRIPE_BUSINESS_MONTHLY_PRICE_ID=price_xxxxx
supabase secrets set STRIPE_BUSINESS_YEARLY_PRICE_ID=price_xxxxx

# Deploy edge functions
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
supabase functions deploy stripe-webhook
*/


// ─── RevenueCat Dashboard setup ──────────────────────────────────────────────
/*
Product IDs to create in RevenueCat (must match RC_PRODUCT_TO_PLAN in SubscriptionService.js):
  allslip_pro_monthly
  allslip_pro_yearly
  allslip_business_monthly
  allslip_business_yearly

Entitlements: create "pro" and "business"
Offerings: create "default" with 4 packages
*/
