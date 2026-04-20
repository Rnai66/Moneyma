-- ════════════════════════════════════════════════════════════════════════════
-- Allslip — Subscription Schema
-- Run in Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. subscriptions table (source of truth) ────────────────────────────────
create table if not exists public.subscriptions (
  id                       uuid default gen_random_uuid() primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  plan                     text not null default 'free'
                           check (plan in ('free','pro','business')),
  status                   text not null default 'active'
                           check (status in ('active','cancelled','expired','trial','past_due')),
  provider                 text check (provider in ('revenuecat','stripe',null)),
  provider_customer_id     text,
  provider_subscription_id text,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  trial_end                timestamptz,
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint subscriptions_user_id_unique unique (user_id)
);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
alter table public.subscriptions enable row level security;

-- Users can only read their own subscription
create policy "user_read_own_subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Users can insert their own record (initial free plan)
create policy "user_insert_own_subscription"
  on public.subscriptions for insert
  with check (auth.uid() = user_id);

-- Users can update their own record (client-side sync after purchase)
create policy "user_update_own_subscription"
  on public.subscriptions for update
  using (auth.uid() = user_id);

-- Service role (webhooks) can upsert any record
-- (This is granted automatically to service_role key — no policy needed)

-- ── 3. Auto-update updated_at ────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute procedure public.set_updated_at();

-- ── 4. Index ─────────────────────────────────────────────────────────────────
create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_provider_sub_idx
  on public.subscriptions (provider_subscription_id)
  where provider_subscription_id is not null;

-- ── 5. Insert free plan for existing users (backfill) ────────────────────────
-- Run once after migration:
-- insert into public.subscriptions (user_id, plan, status)
-- select id, 'free', 'active' from auth.users
-- on conflict (user_id) do nothing;


-- ════════════════════════════════════════════════════════════════════════════
-- Supabase Edge Functions (deploy with: supabase functions deploy)
-- Files go in: supabase/functions/
-- ════════════════════════════════════════════════════════════════════════════

/*
── supabase/functions/stripe-checkout/index.ts ──────────────────────────────

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

Deno.serve(async (req) => {
  const { priceId, successUrl, cancelUrl } = await req.json();
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  // Look up or create Stripe customer
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('provider_customer_id')
    .eq('user_id', user.id)
    .single();

  let customerId = sub?.provider_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabase.from('subscriptions').upsert({
      user_id: user.id,
      plan: 'free',
      status: 'active',
      provider: 'stripe',
      provider_customer_id: customerId,
    }, { onConflict: 'user_id' });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
});


── supabase/functions/stripe-portal/index.ts ────────────────────────────────

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

Deno.serve(async (req) => {
  const { returnUrl } = await req.json();
  const token = req.headers.get('Authorization')?.split(' ')[1];
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('provider_customer_id')
    .eq('user_id', user.id)
    .single();

  const session = await stripe.billingPortal.sessions.create({
    customer: sub?.provider_customer_id,
    return_url: returnUrl,
  });
  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json' },
  });
});


── supabase/functions/stripe-webhook/index.ts ───────────────────────────────
-- Add to Stripe Dashboard → Webhooks → Endpoint: https://<project>.supabase.co/functions/v1/stripe-webhook
-- Events: customer.subscription.created, updated, deleted

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe  = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const PRICE_TO_PLAN: Record<string, string> = {
  [Deno.env.get('STRIPE_PRO_MONTHLY_PRICE_ID')!]:      'pro',
  [Deno.env.get('STRIPE_PRO_YEARLY_PRICE_ID')!]:       'pro',
  [Deno.env.get('STRIPE_BUSINESS_MONTHLY_PRICE_ID')!]: 'business',
  [Deno.env.get('STRIPE_BUSINESS_YEARLY_PRICE_ID')!]:  'business',
};

Deno.serve(async (req) => {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature')!;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!);
  } catch {
    return new Response('Bad signature', { status: 400 });
  }

  const sub = event.data.object as Stripe.Subscription;
  const userId = sub.metadata?.supabase_user_id;
  if (!userId) return new Response('No user id', { status: 200 });

  const priceId = sub.items.data[0]?.price.id;
  const plan = PRICE_TO_PLAN[priceId] ?? 'free';

  const statusMap: Record<string, string> = {
    active: 'active', trialing: 'trial',
    past_due: 'past_due', canceled: 'cancelled', unpaid: 'expired',
  };

  await supabase.from('subscriptions').upsert({
    user_id:                  userId,
    plan:                     event.type === 'customer.subscription.deleted' ? 'free' : plan,
    status:                   statusMap[sub.status] ?? 'active',
    provider:                 'stripe',
    provider_customer_id:     sub.customer as string,
    provider_subscription_id: sub.id,
    current_period_start:     new Date(sub.current_period_start * 1000).toISOString(),
    current_period_end:       new Date(sub.current_period_end   * 1000).toISOString(),
    cancel_at_period_end:     sub.cancel_at_period_end,
    updated_at:               new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return new Response('ok', { status: 200 });
});
*/
