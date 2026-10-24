// Active Plus — Public Supabase Web configuration (runs alongside Firebase).
// Never store service_role or sb_secret_* credentials in client code.
import { devSupabaseConfig, devSupabaseHosts } from './supabase-config.dev.js';

export const productionSupabaseConfig = Object.freeze({
  url: 'https://orrinivkfioolkekerkh.supabase.co',
  publishableKey: 'sb_publishable_7tDa2nqcF6SOm-3V_ZdbiQ_iQ7PoXPe',
  projectRef: 'orrinivkfioolkekerkh',
  region: 'ap-southeast-1'
});

export function resolveSupabaseConfig({
  hostname = globalThis.location?.hostname || '',
  search = globalThis.location?.search || '',
  storage = undefined,
  devConfig = devSupabaseConfig,
  devHosts = devSupabaseHosts
} = {}) {
  const host = String(hostname || '').toLowerCase();
  const params = new URLSearchParams(search || '');
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  // Arena live preview (*.e2b.app) is a development origin: never silently
  // read/write production Supabase tables from a preview tab.
  const isPreviewHost = /^[a-z0-9-]+\.e2b\.app$/.test(host);
  const isDevHost = isPreviewHost || devHosts.includes(host) || /-dev\.(web\.app|firebaseapp\.com|netlify\.app)$/.test(host);

  let savedProject = '';
  try {
    const store = storage === undefined ? globalThis.sessionStorage : storage;
    savedProject = store?.getItem('apc.supabaseProject') || '';
  } catch { /* storage disabled */ }

  const requested = params.get('supabaseProject') || globalThis.__apcPublicFlags?.supabaseProject || savedProject;
  if (requested && !['dev', 'prod'].includes(requested)) {
    throw new Error('Unknown Supabase project selection');
  }
  if (isDevHost && requested === 'prod') {
    throw new Error('Production Supabase is forbidden on a development host');
  }
  if (requested === 'dev' && !(isLoopback || isDevHost)) {
    throw new Error('Development Supabase is forbidden on this host');
  }

  const localDev = isLoopback && requested === 'dev';
  const environment = isDevHost || localDev ? 'dev' : 'prod';

  if (environment === 'dev') {
    if (!devConfig?.url || !devConfig?.publishableKey || !devConfig?.projectRef) {
      return {
        environment: 'dev',
        configured: false,
        config: null,
        reason: 'Development Supabase project is not configured'
      };
    }
    if (devConfig.projectRef === productionSupabaseConfig.projectRef ||
        devConfig.url === productionSupabaseConfig.url) {
      throw new Error('Development and production Supabase projects must be different');
    }
    let parsed;
    try { parsed = new URL(devConfig.url); } catch { throw new Error('Invalid development Supabase URL'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new Error('Invalid development Supabase URL');
    }
    return { environment: 'dev', configured: true, config: devConfig, reason: '' };
  }

  return {
    environment: 'prod',
    configured: Boolean(productionSupabaseConfig.url && productionSupabaseConfig.publishableKey),
    config: productionSupabaseConfig,
    reason: ''
  };
}

export function isSupabaseRuntimeEnabled() {
  if (globalThis.__APC_SUPABASE_TEST_CLIENT__) return true;
  if (globalThis.__APC_ENABLE_SUPABASE_IN_TESTS__ === true) return true;
  // Offline Node unit tests mock Firebase directly and must not attempt real
  // outbound HTTPS/WebSocket connections unless explicitly enabled by a test.
  if (globalThis.process?.versions?.node) return false;
  try {
    const resolved = resolveSupabaseConfig();
    return resolved.configured === true;
  } catch {
    return false;
  }
}
