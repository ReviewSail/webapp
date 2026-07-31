import { useState } from 'react';
import { useReviewSail } from '../context/ReviewSailContext';
import CsvImportWizard from '../components/import/CsvImportWizard';
import {
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  RefreshCw,
  BookOpen,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  Mail,
  Phone as PhoneIcon,
  User
} from 'lucide-react';

export default function SyncGuests() {
  const { addCustomer, addOrder, addReviewRequest, activeLocationId, locations } = useReviewSail();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal & Accordion State
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [openSection, setOpenSection] = useState<'booking' | 'airbnb' | 'expedia' | null>('booking');

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    checkoutDate: new Date().toISOString().split('T')[0],
    checkinDate: '',
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
          checkoutDate: formData.checkoutDate,
          checkinDate: formData.checkinDate || undefined,
          status: 'completed',
        });

        if (order) {
          await addReviewRequest(order.id);
          setFormData({ firstName: '', lastName: '', email: '', phone: '', checkoutDate: new Date().toISOString().split('T')[0], checkinDate: '' });
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


  const locationName = locations.find(l => l.id === activeLocationId)?.name || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Import Guests</h2>
          <p className="text-sm text-gray-500 mt-1">
            Add guests manually or upload a CSV file to queue review requests.
          </p>
        </div>
        <button
          onClick={() => setIsGuideOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
        >
          <BookOpen size={16} />
          CSV Format Guide
        </button>
      </div>

      {/* Location warning */}
      {!activeLocationId && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle size={18} />
          <span>Please select a property location from the dropdown in the header before importing guests.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CSV Upload */}
        <CsvImportWizard />

        {/* Manual Entry */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User size={20} className="text-indigo-500" />
            Add Guest Manually
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={e => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                  disabled={!activeLocationId}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={e => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                  disabled={!activeLocationId}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Mail size={14} /> Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="guest@example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                disabled={!activeLocationId}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <PhoneIcon size={14} /> Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 555-0100"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                disabled={!activeLocationId}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <Calendar size={14} /> Check-out Date *
                </label>
                <input
                  type="date"
                  value={formData.checkoutDate}
                  onChange={e => setFormData(prev => ({ ...prev, checkoutDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                  disabled={!activeLocationId}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                  <Calendar size={14} /> Check-in Date
                </label>
                <input
                  type="date"
                  value={formData.checkinDate}
                  onChange={e => setFormData(prev => ({ ...prev, checkinDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                  disabled={!activeLocationId}
                />
                <p className="text-xs text-gray-400 mt-1">Optional — enables mid-stay check-ins</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !activeLocationId}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Add Guest & Queue Review
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`p-4 rounded-lg text-sm flex items-start gap-3 ${
          feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {feedback.type === 'success' ? <CheckCircle size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="ml-auto shrink-0 hover:opacity-70">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Guide Modal */}
      {isGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setIsGuideOpen(false)}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <BookOpen size={20} className="text-indigo-500" />
                CSV Import Format Guide
              </h3>
              <button onClick={() => setIsGuideOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              <p className="text-sm text-gray-600">
                Your CSV file must include column headers. We recognise exports from the major booking platforms and
                match their columns automatically — but every match is only a suggestion, and you can correct any of
                them in the import step before anything is saved.
              </p>
              <p className="text-sm text-gray-600">
                You'll need a <strong>name</strong> column, a <strong>check-out date</strong>, and at least one way to
                reach the guest (<strong>email</strong> or <strong>phone</strong>). Adding a <strong>check-in date</strong> is
                optional and enables mid-stay check-ins.
              </p>

              {/* Booking.com */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('booking')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-medium text-sm text-gray-900">Booking.com Export</span>
                  {openSection === 'booking' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {openSection === 'booking' && (
                  <div className="px-4 py-3 space-y-2 text-sm text-gray-600">
                    <p>Export your reservations from Booking.com as CSV and upload directly.</p>
                    <p className="text-xs text-gray-400">Supported columns: Guest first name, Guest last name, Email, Phone, Check-out, Check-in</p>
                  </div>
                )}
              </div>

              {/* Airbnb */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('airbnb')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-medium text-sm text-gray-900">Airbnb Export</span>
                  {openSection === 'airbnb' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {openSection === 'airbnb' && (
                  <div className="px-4 py-3 space-y-2 text-sm text-gray-600">
                    <p>Export your reservations from Airbnb as CSV and upload directly.</p>
                    <p className="text-xs text-gray-400">Supported columns: First Name, Last Name, Email, Phone Number, Checkout, Check-in</p>
                  </div>
                )}
              </div>

              {/* Expedia */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection('expedia')}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="font-medium text-sm text-gray-900">Expedia / VRBO Export</span>
                  {openSection === 'expedia' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {openSection === 'expedia' && (
                  <div className="px-4 py-3 space-y-2 text-sm text-gray-600">
                    <p>Export your reservations from Expedia or VRBO as CSV and upload directly.</p>
                    <p className="text-xs text-gray-400">Supported columns: First Name, Last Name, Email, Phone, Departure Date, Arrival Date</p>
                  </div>
                )}
              </div>

              {/* Custom format */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h4 className="font-medium text-sm text-gray-900 mb-2">Custom CSV Format</h4>
                <p className="text-xs text-gray-500 mb-2">
                  For custom files, use any of these column header names (case-insensitive):
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="font-medium text-gray-700">First Name:</span>
                    <span className="text-gray-500 ml-1">firstname, first name, guest name</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Last Name:</span>
                    <span className="text-gray-500 ml-1">lastname, last name</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Email:</span>
                    <span className="text-gray-500 ml-1">email, email address, e-mail</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Phone:</span>
                    <span className="text-gray-500 ml-1">phone, phone number, mobile, tel</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Check-out:</span>
                    <span className="text-gray-500 ml-1">checkout, departure, end date</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-700">Check-in:</span>
                    <span className="text-gray-500 ml-1">checkin, arrival, start date</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 px-6 py-4 flex justify-end">
              <button
                onClick={() => setIsGuideOpen(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
