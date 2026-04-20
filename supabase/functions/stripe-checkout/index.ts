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
