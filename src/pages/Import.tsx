import { useState } from 'react';
import { useMapRated } from '../context/MapRatedContext';

export default function Import() {
  const { addCustomer, addOrder, addReviewRequest, activeLocationId } = useMapRated();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLocationId) {
      alert("Please select a location first.");
      return;
    }
    
    setLoading(true);
    try {
      const customer = await addCustomer({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: null,
      });

      if (customer) {
        const order = await addOrder({
          customerId: customer.id,
          locationId: activeLocationId,
          checkoutDate: new Date().toISOString(),
          status: 'completed',
        });

        if (order) {
          await addReviewRequest(order.id);
          setFormData({ firstName: '', lastName: '', email: '' });
          alert("Record added and review request queued successfully!");
        }
      } else {
        alert("Failed to add customer. Ensure you have an active account/location setup.");
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred adding the record.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Import Data</h1>
      
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Manual Entry</h2>
        <p className="text-slate-500 mb-4">Add a single guest checkout record for the currently selected location.</p>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
              <input 
                type="text" 
                required
                value={formData.firstName}
                onChange={e => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
              <input 
                type="text" 
                required
                value={formData.lastName}
                onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500" 
              />
            </div>
          </div>
          <div className="mt-4">
            <button 
              type="submit" 
              disabled={loading || !activeLocationId}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Record'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">CSV Upload</h2>
        <p className="text-slate-500 mb-4">Upload a CSV of recent checkouts.</p>
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-12 text-center hover:bg-slate-50 transition-colors cursor-pointer opacity-50">
          <p className="text-slate-600">Drag and drop your CSV here, or click to browse (Coming Soon)</p>
        </div>
      </div>
    </div>
  );
}