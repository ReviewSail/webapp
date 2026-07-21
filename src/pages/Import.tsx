import { useState, useRef } from 'react';
import { useMapRated } from '../context/MapRatedContext';
import Papa from 'papaparse';
import { 
  FileUp, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  MapPin, 
  Sparkles, 
  RefreshCw, 
  BookOpen, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Info,
  Calendar,
  Mail,
  Phone as PhoneIcon,
  User
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Import() {
  const { addCustomer, addOrder, addReviewRequest, activeLocationId, locations, bulkImport } = useMapRated();
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; count: number; skipped: number; error?: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Modal & Accordion State
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [openSection, setOpenSection] = useState<'booking' | 'airbnb' | 'expedia' | null>('booking');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
  });

  const toggleSection = (section: 'booking' | 'airbnb' | 'expedia') => {
    setOpenSection(prev => prev === section ? null : section);
  };

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Import Data</h1>
          <p className="text-sm text-slate-500 mt-1">Register guest checkout entries or ingest bulk files from external PMS networks.</p>
        </div>
        <button
          onClick={() => setIsGuideOpen(true)}
          className="inline-flex items-center space-x-2 bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 border border-indigo-100 font-semibold text-sm py-2 px-4 rounded-xl transition-colors shadow-sm"
        >
          <BookOpen className="h-4 w-4" />
          <span>Import Guide</span>
        </button>
      </div>

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
                  className="w-full bg-indigo-600 text-white px-4 py-2.5 rounded-md text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center space-x-2"
                >
                  {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
                  <span>{loading ? 'Adding...' : 'Add Record & Queue Request'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: CSV Upload */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-2">CSV Bulk Import</h2>
              <p className="text-sm text-slate-500 mb-4">
                Upload a checkout list exported from your booking extranet or PMS software. MapRated will automatically look for standard layout patterns.
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

            <div className="mt-6 pt-6 border-t border-slate-100 text-xs text-slate-400 flex items-start space-x-2">
              <Info className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
              <span>
                <strong>Tip:</strong> MapRated automatically reconciles alternative column names. Need templates? Click the <strong>Import Guide</strong> button at the top to see expectations.
              </span>
            </div>
          </div>

        </div>
      )}

      {/* Guide Modal Overlay */}
      {isGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden my-8">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2.5 text-indigo-700">
                <BookOpen className="h-6 w-6" />
                <h3 className="text-lg font-bold text-slate-900">Platform Export & Import Guide</h3>
              </div>
              <button
                onClick={() => setIsGuideOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Steppers Accordion */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">PMS & Channel Manager Exports</h4>
                <div className="space-y-3">
                  
                  {/* Booking.com */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSection('booking')}
                      className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors text-left font-semibold text-sm text-slate-800"
                    >
                      <span className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-blue-600" />
                        <span>Booking.com Extranet Instructions</span>
                      </span>
                      {openSection === 'booking' ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </button>
                    {openSection === 'booking' && (
                      <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-xs text-slate-600 space-y-2.5">
                        <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
                          <li>Log in to your <strong>Booking.com Extranet</strong> dashboard.</li>
                          <li>Navigate to the <strong>Reservations</strong> tab from the top navigation bar.</li>
                          <li>Apply date range filters to select recent completed checkout stays.</li>
                          <li>Click the <strong>Download</strong> or <strong>Export to CSV</strong> button in the top right corner of the reservation table.</li>
                        </ol>
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 p-2.5 rounded-lg font-medium mt-3">
                          💡 <strong>Note:</strong> Upload the downloaded CSV file above after export.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Airbnb */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSection('airbnb')}
                      className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors text-left font-semibold text-sm text-slate-800"
                    >
                      <span className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-rose-500" />
                        <span>Airbnb Host Dashboard Instructions</span>
                      </span>
                      {openSection === 'airbnb' ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </button>
                    {openSection === 'airbnb' && (
                      <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-xs text-slate-600 space-y-2.5">
                        <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
                          <li>Switch your Airbnb account to <strong>Hosting Mode</strong> and go to the <strong>Reservations</strong> manager.</li>
                          <li>Select the <strong>Completed</strong> tab or configure custom checkout date boundaries.</li>
                          <li>Click the <strong>Export</strong> button situated above the reservation listings.</li>
                          <li>Select <strong>CSV</strong> as the target format and save the spreadsheet directly.</li>
                        </ol>
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 p-2.5 rounded-lg font-medium mt-3">
                          💡 <strong>Note:</strong> Upload the downloaded CSV file above after export.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expedia */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <button
                      onClick={() => toggleSection('expedia')}
                      className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors text-left font-semibold text-sm text-slate-800"
                    >
                      <span className="flex items-center space-x-2">
                        <span className="h-2 w-2 rounded-full bg-yellow-500" />
                        <span>Expedia Partner Central Instructions</span>
                      </span>
                      {openSection === 'expedia' ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </button>
                    {openSection === 'expedia' && (
                      <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-xs text-slate-600 space-y-2.5">
                        <ol className="list-decimal list-inside space-y-1.5 pl-1 leading-relaxed">
                          <li>Access <strong>Expedia Partner Central</strong> and log in to your property portal.</li>
                          <li>Head to the <strong>Reservations & Reports</strong> tab.</li>
                          <li>Set your filter dates to capture recent guest departures.</li>
                          <li>Click <strong>Export to Excel / CSV</strong> at the top right of the data view.</li>
                        </ol>
                        <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 p-2.5 rounded-lg font-medium mt-3">
                          💡 <strong>Note:</strong> Upload the downloaded CSV file above after export.
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Column Mapping Table Guide */}
              <div>
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">Expected CSV Column Headers</h4>
                <p className="text-xs text-slate-500 mb-4">
                  MapRated accommodates diverse header titles automatically, but ensuring your column labels match or closely resemble the labels below will speed up ingestion:
                </p>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm text-xs">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Expected Column Header</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Alias Matches (Auto-Mapped)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white leading-relaxed">
                      <tr>
                        <td className="px-4 py-3.5 font-semibold text-slate-800 flex items-center space-x-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span>First Name</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="bg-red-50 text-red-700 border border-red-100 font-semibold px-2 py-0.5 rounded text-[10px]">Required</span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">First, FirstName, GuestFirstName, Name</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3.5 font-semibold text-slate-800 flex items-center space-x-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          <span>Last Name</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="bg-red-50 text-red-700 border border-red-100 font-semibold px-2 py-0.5 rounded text-[10px]">Required</span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">Last, LastName, GuestLastName, Surname</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3.5 font-semibold text-slate-800 flex items-center space-x-1.5">
                          <Mail className="h-3.5 w-3.5 text-slate-400" />
                          <span>Email</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="bg-slate-100 text-slate-600 border border-slate-200 font-semibold px-2 py-0.5 rounded text-[10px]">Optional*</span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">Email, EmailAddress, GuestEmail, Mail</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3.5 font-semibold text-slate-800 flex items-center space-x-1.5">
                          <PhoneIcon className="h-3.5 w-3.5 text-slate-400" />
                          <span>Phone</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="bg-slate-100 text-slate-600 border border-slate-200 font-semibold px-2 py-0.5 rounded text-[10px]">Optional*</span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">Phone, PhoneNumber, Mobile, Cell</td>
                      </tr>
                      <tr>
                        <td className="px-4 py-3.5 font-semibold text-slate-800 flex items-center space-x-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>Checkout Date</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="bg-slate-100 text-slate-600 border border-slate-200 font-semibold px-2 py-0.5 rounded text-[10px]">Optional</span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-500">Checkout, CheckoutDate, DepartureDate</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 italic">
                  * Note: In order to successfully contact a guest, you must provide either an active Email Address or Phone Number.
                </p>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setIsGuideOpen(false)}
                className="bg-slate-900 text-white hover:bg-slate-800 text-xs font-semibold py-2.5 px-5 rounded-xl transition-all shadow-sm"
              >
                Close Guide
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}