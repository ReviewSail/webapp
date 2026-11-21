export function getSupabaseConfig(url: string | undefined, key: string | undefined) {
  if (!url?.trim() || !key?.trim()) {
    throw new Error(
      'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    throw new Error('VITE_SUPABASE_URL must be a valid URL.');
  }

  const isLocalHttp =
    parsedUrl.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('VITE_SUPABASE_URL must use HTTPS except for a local development server.');
  }

  return { url: parsedUrl.toString().replace(/\/$/, ''), key: key.trim() };
}
