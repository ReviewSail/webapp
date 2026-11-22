import { supabase } from './client';
import { createPasswordRecovery } from '../../lib/passwordRecovery';

// Eagerly imported by ResetPassword, before React mounts or SDK initialization completes.
// Keep recovery evidence in memory only, not a persistent "allowed to reset" flag.
export const passwordRecovery = createPasswordRecovery(supabase.auth, new URL(window.location.href), () => {
  const url = new URL(window.location.href);
  if (url.pathname !== '/reset-password') return;
  url.hash = '';
  for (const key of ['access_token', 'refresh_token', 'token_type', 'expires_in', 'expires_at',
    'error', 'error_code', 'error_description', 'code', 'type']) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', url.pathname + url.search);
});

if (import.meta.hot) import.meta.hot.dispose(() => passwordRecovery.dispose());
