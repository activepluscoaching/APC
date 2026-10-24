// Single browser-side Supabase client initialization path.
import { createClient } from '../vendor/supabase/sdk.js';
import { resolveSupabaseConfig, isSupabaseRuntimeEnabled } from './supabase-config.js';

let cachedClient = null;
let cachedKey = '';

export function getSupabaseClient() {
  if (globalThis.__APC_SUPABASE_TEST_CLIENT__) {
    return globalThis.__APC_SUPABASE_TEST_CLIENT__;
  }
  if (!isSupabaseRuntimeEnabled()) return null;
  const resolved = resolveSupabaseConfig();
  if (!resolved.configured || !resolved.config) return null;
  const { url, publishableKey } = resolved.config;
  const key = `${url}::${publishableKey}`;
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'apc.supabase.auth.v1'
    },
    realtime: {
      params: { eventsPerSecond: 10 }
    }
  });
  cachedKey = key;
  return cachedClient;
}
