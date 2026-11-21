const url = process.env.VITE_SUPABASE_URL?.trim();
const key = process.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !key) {
  console.error(
    'Build stopped: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment.',
  );
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch {
  console.error('Build stopped: VITE_SUPABASE_URL must be a valid URL.');
  process.exit(1);
}

const localHttp =
  parsedUrl.protocol === 'http:' &&
  ['localhost', '127.0.0.1', '[::1]'].includes(parsedUrl.hostname);

if (parsedUrl.protocol !== 'https:' && !localHttp) {
  console.error('Build stopped: VITE_SUPABASE_URL must use HTTPS outside local development.');
  process.exit(1);
}
