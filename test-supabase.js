/**
 * Supabase Connection Test
 * Run: node test-supabase.js
 * 
 * This verifies your .env.local is correct and Supabase is configured
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing environment variables');
  console.error('Please create .env.local with:');
  console.error('  REACT_APP_SUPABASE_URL=...');
  console.error('  REACT_APP_SUPABASE_ANON_KEY=...');
  process.exit(1);
}

console.log('🔗 Testing Supabase connection...');
console.log('📍 URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  try {
    // Test 1: Check tables exist
    const { data, error } = await supabase
      .from('transactions')
      .select('count', { count: 'exact' });

    if (error) {
      console.error('❌ Error:', error.message);
      throw error;
    }

    console.log('✅ Connected to Supabase');
    console.log('✅ Tables are accessible');
    console.log('\n📋 You can now:');
    console.log('1. Run: npm start');
    console.log('2. Visit: http://localhost:3000');
    console.log('3. Sign up with email & password');
    console.log('4. Start using MoneyMa!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Verify .env.local exists and has correct keys');
    console.error('2. Check Supabase project is active');
    console.error('3. Verify database tables were created');
    console.error('4. Check network connection');
    process.exit(1);
  }
}

testConnection();
