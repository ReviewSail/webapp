import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useMapRated } from '../context/MapRatedContext';
import { MapPin } from 'lucide-react';

export function Layout() {
  const { locations, activeLocationId, setActiveLocationId } = useMapRated();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-end border-b border-slate-200 bg-white px-8 shadow-sm">
          <div className="flex items-center space-x-6">
            <div className="flex items-center text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-md">
              <MapPin className="mr-2 h-4 w-4 text-slate-400" />
              <select
                className="bg-transparent border-none text-slate-700 font-medium focus:ring-0 cursor-pointer p-0 pr-4"
                value={activeLocationId || ''}
                onChange={(e) => setActiveLocationId(e.target.value)}
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="h-8 w-8 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-medium text-sm">
              AD
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 p-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}