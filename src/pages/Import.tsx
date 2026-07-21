import { useState, useRef } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import Papa from 'papaparse';
import { FileUp, CheckCircle, AlertTriangle, AlertCircle, MapPin, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Import() {
  const { addCustomer, addOrder, addReviewRequest, activeLocationId, locations, bulkImport } = useMapRated();
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; count: number; skipped: number; error?: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  const validateForm = () => {
    if (!formData.firstName.trim()) {
      setFeedback({ type: 'error', message: 'First name is required.' });
      return false;
    }
    if (!formData.lastName.trim()) {
      setFeedback({ type: 'error', message: 'Last name is required.' });
      return false;
    }
    if (!formData.email.trim() && !formData.phone.trim()) {
      setFeedback({ type: 'error', message: 'Please provide either an Email address or Phone number to contact this guest.' });
      return false;
    }
    if (formData.email.trim() && !/\S+@\S+\.\S+/.test(formData.email)) {
      setFeedback({ type: 'error', message: 'Invalid email address format.' });
      return false;
    }
    if (formData.phone.trim() && formData.phone.length < 7) {
      setFeedback({ type: 'error', message: 'Phone number must be at least 7 digits.' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setUploadResult(null);

    if (!activeLocationId) {
      setFeedback({ type: 'error', message: 'Please select a property location first.' });
      return;
    }
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      const customer = await addCustomer({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
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
          setFormData({ firstName: '', lastName: '', email: '', phone: '' });
          setFeedback({ type: 'success', message: `Successfully queued review request for ${customer.firstName} ${customer.lastName}!` });
        } else {
          setFeedback({ type: 'error', message: 'Customer added, but failed to create guest checkout order.' });
        }
      } else {
        setFeedback({ type: 'error', message: 'Failed to register customer database entry.' });
      }
    } catch (error: any) {
      console.error(error);
      setFeedback({ type: 'error', message: error.message || 'An error occurred while adding the record.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    setFeedback(null);
    setUploadResult(null);

    if (file.type !== "text/csv" && !file.name.endsWith('.csv')) {
      setFeedback({ type: 'error', message: 'Please upload a valid CSV file.' });
      return;
    }

    setLoading(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const cleanKey = (key: string) => key.toLowerCase().trim().replace(/[_-\s]/g, '');

        const mappedRows = results.data.map((row: any) => {
          let firstName = '';
          let lastName = '';
          let email = '';
          let phone = '';
          let checkoutDate = '';

          Object.keys(row).forEach(key => {
            const clean = cleanKey(key);
            if (clean === 'first' || clean === 'firstname' || clean === 'guestfirstname' || clean.includes('firstname')) {
              firstName = row[key];
            } else if (clean === 'last' || clean === 'lastname' || clean === 'guestlastname' || clean.includes('lastname')) {
              lastName = row[key];
            } else if (clean === 'email' || clean === 'emailaddress' || clean.includes('email')) {
              email = row[key];
            } else if (clean === 'phone' || clean === 'phonenumber' || clean.includes('phone')) {
              phone = row[key];
            } else if (clean === 'checkout' || clean === 'checkoutdate' || clean.includes('checkout')) {
              checkoutDate = row[key];
            }
          });

          return { firstName, lastName, email, phone, checkoutDate };
        });

        // Filter and Validate
        let skipped = 0;
        const validRows = mappedRows.filter(r => {
          const hasContact = (r.email && r.email.trim() !== '') || (r.phone && r.phone.trim() !== '');
          const hasFirstName = (r.firstName && r.firstName.trim() !== '');
          
          if (hasContact && hasFirstName) {
            if (!r.checkoutDate || isNaN(Date.parse(r.checkoutDate))) {
              r.checkoutDate = new Date().toISOString();
            } else {
              r.checkoutDate = new Date(r.checkoutDate).toISOString();
            }
            return true;
          } else {
            skipped++;
            return false;
          }
        });

        if (validRows.length === 0) {
          setUploadResult({
            success: false,
            count: 0,
            skipped,
            error: "No valid rows found in the CSV. Make sure rows contain a First Name and either an Email or Phone."
          });
          setLoading(false);
          return;
        }

        const response = await bulkImport(validRows);
        
        if (response.success) {
          setUploadResult({
            success: true,
            count: response.count,
            skipped
          });
        } else {
          setUploadResult({
            success: false,
            count: 0,
            skipped,
            error: response.error
          });
        }
        setLoading(false);
      },
      error: (err) => {
        console.error(err);
        setUploadResult({
          success: false,
          count: 0,
          skipped: 0,
          error: "Failed to parse CSV file."
        });
        setLoading(false);
      }
    });
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const hasNoLocations = locations.length === 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Import Data</h1>

      {feedback && (
        <div className={`mb-6 p-4 rounded-xl border flex items-start space-x-2.5 shadow-sm text-sm ${
          feedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {hasNoLocations ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-12 text-center flex flex-col items-center justify-center space-y-4 max-w-xl mx-auto">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
            <MapPin className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">No properties linked</h2>
            <p className="text-sm text-slate-500 mt-1">
              You must register a location in Settings before you can add guest checkouts or import feedback logs.
            </p>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center space-x-1 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm py-2 px-4 rounded-xl shadow-sm transition-all"
          >
            <Sparkles className="h-4 w-4" />
            <span>Go to Settings</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Column: Manual Entry */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 h-fit">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Manual Entry</h2>
            <p className="text-sm text-slate-500 mb-4">Add a single guest checkout record for the currently selected location.</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                  <input 
                    type="text" 
                    required
                    value={formData.firstName}
                    onChange={e => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Jane"
                    className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border border-slate-300 bg-white" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                  <input 
                    type="text" 
                    required
                    value={formData.lastName}
                    onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Doe"
                    className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border border-slate-300 bg-white" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border border-slate-300 bg-white" 
                  placeholder="guest@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone Number (Optional)</label>
                <input 
                  type="tel" 
                  value={formData.phone}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border border-slate-300 bg-white" 
                  placeholder="+15551234567"
                />
              </div>
              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-indigo-600 text-white px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {loading ? 'Adding...' : 'Add Record & Queue Request'}
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: CSV Upload */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">CSV Bulk Import</h2>
              <p className="text-sm text-slate-500 mb-4">
                Upload a checkout list exported from your property management software. Columns should include: 
                <span className="font-semibold text-slate-700"> First Name, Last Name, Email, Phone, Checkout Date</span>.
              </p>

              <div 
                onDragEnter={handleDrag} 
                onDragOver={handleDrag} 
                onDragLeave={handleDrag} 
                onDrop={handleDrop}
                onClick={onButtonClick}
                className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[220px] ${
                  dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".csv"
                  className="hidden" 
                  onChange={handleFileInputChange}
                />
                <FileUp className="h-10 w-10 text-slate-400 mb-4" />
                <p className="text-sm text-slate-600 font-medium">
                  Drag and drop your PMS CSV here, or <span className="text-indigo-600 hover:underline">browse</span>
                </p>
                <p className="text-xs text-slate-400 mt-2">Only CSV files accepted</p>
              </div>

              {uploadResult && (
                <div className={`mt-6 p-4 rounded-lg border flex items-start space-x-3 ${
                  uploadResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {uploadResult.success ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <h4 className="font-semibold text-sm">Bulk Ingestion Complete!</h4>
                        <p className="text-xs text-green-700 mt-1">
                          Successfully imported <strong className="text-green-900">{uploadResult.count}</strong> guest checkout records and queued their review requests.
                        </p>
                        {uploadResult.skipped > 0 && (
                          <p className="text-xs text-amber-700 mt-1 flex items-center">
                            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                            Skipped {uploadResult.skipped} row(s) due to missing First Name or contact channels.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                      <div>
                        <h4 className="font-semibold text-sm">Ingestion Failed</h4>
                        <p className="text-xs text-red-700 mt-1">{uploadResult.error}</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 text-xs text-slate-400">
              <strong>Formatting Tips:</strong> Ensure headers like "Guest First Name", "First Name", or "First" exist. Ensure checkout date matches standard date formats (YYYY-MM-DD). If checkout date is blank, it defaults to today.
            </div>
          </div>

        </div>
      )}
    </div>
  );
}