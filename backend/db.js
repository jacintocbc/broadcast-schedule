import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set in your .env file');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Test connection function - just verifies credentials are set
export async function testConnection() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    return false;
  }

  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    console.error('❌ Invalid SUPABASE_URL format');
    return false;
  }

  if (supabaseKey.length < 50) {
    console.error('❌ SUPABASE_ANON_KEY appears to be invalid (too short)');
    return false;
  }

  console.log('✅ Supabase client initialized successfully!');
  console.log(`   Project URL: ${supabaseUrl.substring(0, 40)}...`);
  console.log('   Note: Connection will be fully tested when you create your first table');
  return true;
}