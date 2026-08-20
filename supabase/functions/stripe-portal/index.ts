import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { returnUrl } = await req.json();
    const token = req.headers.get('Authorization')?.split(' ')[1];
    
    if (!token) throw new Error('No auth token provided');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    const { data: sub, error: subError } = await supabase
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (subError) throw new Error(`Database error: ${subError.message}`);
    
    let customerId = sub?.provider_customer_id;
    
    // ตรวจสอบตัวตนลูกค้า
    if (customerId) {
        try {
            await stripe.customers.retrieve(customerId);
        } catch (e) {
            console.warn('Portal: Customer not found in Stripe');
            customerId = null;
        }
    }

    if (!customerId) throw new Error('No active Stripe customer found. Please subscribe first.');

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in stripe-portal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
