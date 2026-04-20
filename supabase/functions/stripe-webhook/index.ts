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
