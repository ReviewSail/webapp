import { Fragment, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { inboxLoginPath } from './lib/inboxSignIn';
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/queryClient"
import { ReviewSailProvider } from "./context/ReviewSailContext"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { Layout } from "./components/Layout"
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Analytics = lazy(() => import("./pages/Analytics"));
const SyncGuests = lazy(() => import("./pages/SyncGuests"));
const Guests = lazy(() => import("./pages/Guests"));
const Settings = lazy(() => import("./pages/Settings"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const Login = lazy(() => import("./pages/Login"));
const Feedback = lazy(() => import("./pages/Feedback"));
const AlreadyReviewed = lazy(() => import("./pages/AlreadyReviewed"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const FeedbackGate = lazy(() => import("./pages/FeedbackGate"));
const ReviewReply = lazy(() => import("./pages/ReviewReply"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Inbox = lazy(() => import("./pages/Inbox"));
const NotFound = lazy(() => import("./pages/NotFound"));
import { ToastProvider } from "./components/ui/Toast"
import { ThemeProvider } from "./context/ThemeContext"
import { SailMark } from "./components/brand/SailMark"
import { isAdmin } from "./lib/roles"

/** The first thing a returning user sees. Branded, and quiet about it. */
const RouteLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-canvas">
    <div className="flex items-center gap-2.5 text-ink-muted">
      <SailMark variant="container" className="h-7 w-7 shrink-0 animate-pulse" />
      <span className="text-sm font-medium">Loading ReviewSail…</span>
    </div>
  </div>
);

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading, error, refreshIdentity, accountId, scopeVersion } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return <RouteLoader />;
  }

  if (!session) {
    return <Navigate to={inboxLoginPath(pathname)} replace />;
  }

  if (error) return <div role="alert" className="p-8 text-ink">
    <p>Account access could not be verified. Your private data is hidden.</p>
    <button type="button" className="text-brand-600 underline" onClick={() => { void refreshIdentity().catch(() => {}); }}>Retry account access</button>
  </div>;

  // Reset private component drafts/cursors even if a fast account switch batches
  // away the intermediate loading render. Public recovery/invite routes stay mounted.
  return <Fragment key={`${session.user.id}:${accountId}:${scopeVersion}`}>{children}</Fragment>;
};

export const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { role, loading } = useAuth();

  if (loading) {
    return <RouteLoader />;
  }

  if (!isAdmin(role)) {
    return <Navigate to="/dashboard?access_denied=true" replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoader />}>
    <Routes>
      <Route path="/opt-out" element={<Unsubscribe />} />
      <Route path="/unsubscribe" element={<Unsubscribe />} />
      <Route path="/feedback" element={<Feedback />} />
      <Route path="/feedback-gate" element={<FeedbackGate />} />
      {/* Short form used in SMS, where the long URL costs most of a segment.
          The legacy /feedback-gate?request_id= route stays for links already sent. */}
      <Route path="/r/:code" element={<FeedbackGate />} />
      {/* Property QR. Same 22-character code shape as /r/, but holding a
          location id rather than a request id — the two are indistinguishable
          once encoded, so the prefix is what tells them apart. Used where no
          guest list exists: Airbnb and Booking.com never release a usable
          guest email, so a poster is the only thing that reaches those guests. */}
      <Route path="/p/:code" element={<FeedbackGate mode="property" />} />
      <Route path="/already-reviewed" element={<AlreadyReviewed />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/login" element={<Login />} />
      {/* Public: the invitee signs in or signs up on this page before redeeming. */}
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="import" element={<SyncGuests />} />
        <Route path="guests" element={<Guests />} />
        {/* Was a tab on the Dashboard. Old links keep working — Dashboard
            redirects ?tab=feedback here. */}
        <Route path="inbox" element={<Inbox />} />
        <Route path="reply" element={<ReviewReply />} />
        <Route path="settings" element={
          <AdminRoute>
            <Settings />
          </AdminRoute>
        } />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <ReviewSailProvider>
              <Router>
                <AppRoutes />
              </Router>
            </ReviewSailProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
