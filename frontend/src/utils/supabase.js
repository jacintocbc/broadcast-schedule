import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables not set. Real-time features will not work.')
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file (local) or Vercel environment variables (deployed)')
  console.error('Current values:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseAnonKey,
    urlValue: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'missing',
    keyValue: supabaseAnonKey ? '***' + supabaseAnonKey.slice(-4) : 'missing',
    allEnvVars: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
  })
} else {
  console.log('✅ Supabase client initialized')
  console.log('   URL:', supabaseUrl.substring(0, 30) + '...')
  console.log('   Key:', '***' + supabaseAnonKey.slice(-4))
}

// Configure Supabase client with real-time options
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})
