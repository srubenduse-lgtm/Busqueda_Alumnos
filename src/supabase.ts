import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://sdslqlqycfusavnyshah.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc2xxbHF5Y2Z1c2F2bnlzaGFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjIxNzIsImV4cCI6MjA4OTMzODE3Mn0.qr9jnFGAqgJY18sV-z3JkC6rL_3Oik5ivzYs1X3n0Uo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
