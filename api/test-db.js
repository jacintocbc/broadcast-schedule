import { supabase } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Test Supabase connection
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    const envStatus = {
      SUPABASE_URL: supabaseUrl ? 'Set' : 'Missing',
      SUPABASE_ANON_KEY: supabaseAnonKey ? 'Set' : 'Missing'
    };

    // Try a simple query
    const { data, error } = await supabase
      .from('commentators')
      .select('count')
      .limit(1);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
        env: envStatus,
        details: 'Database query failed'
      });
    }

    res.json({
      success: true,
      message: 'Database connection successful',
      env: envStatus,
      testQuery: 'Success'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
