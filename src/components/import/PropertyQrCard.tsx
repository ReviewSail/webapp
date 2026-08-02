import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Check, Download } from 'lucide-react';
import { encodeShortId } from '../../lib/shortLink';

/**
 * The path that works when there is no guest list to import.
 *
 * Airbnb never releases a guest's real email — it issues an alias that stops
 * forwarding shortly after checkout, which is exactly when a review request
 * goes out. Booking.com masks addresses too. For those hosts a CSV import can
 * be perfectly mapped and still deliver nothing, so the poster is not a
 * convenience feature: it is the only thing that reaches those guests.
 */
export default function PropertyQrCard({
  locationId,
  locationName,
}: { locationId: string | null; locationName: string }) {
  const [pngUrl, setPngUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const code = locationId ? encodeShortId(locationId) : null;
  const link = code ? `${window.location.origin}/p/${code}` : '';

  useEffect(() => {
    if (!link) {
      setPngUrl('');
      return;
    }
    // Rendered locally rather than via a QR web service: the link identifies
    // the property, and there's no reason to hand that to a third party.
    QRCode.toDataURL(link, { width: 512, margin: 2, errorCorrectionLevel: 'M' })
      .then(setPngUrl)
      .catch(err => console.error('Could not render QR code:', err));
  }, [link]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some embedded browsers; the link is on screen
      // and selectable either way.
    }
  };

  const downloadPng = () => {
    if (!pngUrl) return;
    const link_ = document.createElement('a');
    link_.href = pngUrl;
    link_.download = `${locationName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'property'}-review-qr.png`;
    link_.click();
  };

  if (!locationId) return null;

  return (
    <div className="bg-card rounded-xl border border-line p-6">
      <h3 className="text-lg font-semibold text-ink mb-1 flex items-center gap-2">
        <QrCode size={20} className="text-brand-500" />
        No guest list? Use your property code
      </h3>
      <p className="text-sm text-ink-muted mb-4">
        Print this where guests check out. They scan, rate their stay, and happy guests go straight
        to your Google page — no import needed. Useful for Airbnb and Booking.com stays, where the
        platform never gives you a working email address.
      </p>

      <div className="flex flex-col sm:flex-row gap-5 items-start">
        {pngUrl ? (
          <img
            src={pngUrl}
            alt={`QR code linking to the review page for ${locationName}`}
            className="w-36 h-36 rounded-lg border border-line bg-white p-2 shrink-0"
          />
        ) : (
          <div className="w-36 h-36 rounded-lg border border-line bg-canvas shrink-0" />
        )}

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-1">
              Your review link
            </p>
            <code className="block text-xs text-ink bg-canvas border border-line rounded-lg px-3 py-2 break-all">
              {link}
            </code>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-ink border border-line rounded-lg hover:bg-canvas transition-colors"
            >
              {copied ? <Check size={15} className="text-positive" /> : <Copy size={15} />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={downloadPng}
              disabled={!pngUrl}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 disabled:opacity-50 transition-colors"
            >
              <Download size={15} /> Download QR
            </button>
          </div>

          <p className="text-xs text-ink-faint">
            The same code works forever — print it once.
          </p>
        </div>
      </div>
    </div>
  );
}
