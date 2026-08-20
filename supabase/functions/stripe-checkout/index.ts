import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { priceId, successUrl, cancelUrl, mode } = await req.json();
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) throw new Error('No auth token provided');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // ตรวจสอบ Customer
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId = sub?.provider_customer_id;

    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (e) {
        customerId = null;
      }
    }

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

    // --- ส่วนที่แก้ไขใหม่: ตรวจสอบประเภทราคา ---
    console.log('Retrieving price info for:', priceId);
    const price = await stripe.prices.retrieve(priceId);
    
    const lineItem: any = { price: priceId };
    
    // ถ้าไม่ใช่ราคาแบบ metered ให้ใส่ quantity: 1 (กัน Error: Quantity is required)
    if (price.recurring?.usage_type !== 'metered') {
      lineItem.quantity = 1;
    }

    const checkoutMode = mode || (price.type === 'one_time' ? 'payment' : 'subscription');

    console.log('Creating checkout session with line item:', lineItem, 'mode:', checkoutMode);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: checkoutMode,
      line_items: [lineItem],
      success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl,
      ...(checkoutMode === 'subscription' ? {
        subscription_data: {
          metadata: { supabase_user_id: user.id },
        },
      } : {
        payment_intent_data: {
          metadata: { supabase_user_id: user.id },
        },
      }),
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in stripe-checkout:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
