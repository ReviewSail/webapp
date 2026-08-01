import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

/**
 * vercel.json rewrites every unmatched path to index.html, so without a catch-all
 * route a typo'd URL rendered a blank white page with no way out.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas py-12 px-4">
      <div className="w-full max-w-md text-center space-y-6 bg-card p-10 rounded-2xl shadow-sm border border-line">
        <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-brand-50 text-brand-600">
          <Compass className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-ink">This page doesn't exist</h1>
          <p className="text-sm text-ink-muted mt-2">
            The link may be out of date, or the address may have a typo in it.
          </p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center bg-brand-600 text-white font-semibold py-2.5 px-5 rounded-xl hover:bg-brand-700 transition-colors"
        >
          Go to your dashboard
        </Link>
      </div>
    </div>
  );
}
