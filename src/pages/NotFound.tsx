import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

/**
 * vercel.json rewrites every unmatched path to index.html, so without a catch-all
 * route a typo'd URL rendered a blank white page with no way out.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 py-12 px-4">
      <div className="w-full max-w-md text-center space-y-6 bg-white p-10 rounded-2xl shadow-sm border border-slate-200">
        <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-indigo-50 text-indigo-600">
          <Compass className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">This page doesn't exist</h1>
          <p className="text-sm text-slate-500 mt-2">
            The link may be out of date, or the address may have a typo in it.
          </p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center bg-indigo-600 text-white font-semibold py-2.5 px-5 rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Go to your dashboard
        </Link>
      </div>
    </div>
  );
}
