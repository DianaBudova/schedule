// supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_KEY;

if (!url || !anonKey) {
  console.warn('SUPABASE_URL or SUPABASE_KEY is not set in env');
}

const supabase = createClient(url, anonKey);

export default supabase;
