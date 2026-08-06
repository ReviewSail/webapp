import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "./lib/queryClient"
import { ReviewSailProvider } from "./context/ReviewSailContext"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { Layout } from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import Analytics from "./pages/Analytics"
import SyncGuests from "./pages/SyncGuests"
import Guests from "./pages/Guests"
import Settings from "./pages/Settings"
import Unsubscribe from "./pages/Unsubscribe"
import Login from "./pages/Login"
import Feedback from "./pages/Feedback"
import AlreadyReviewed from "./pages/AlreadyReviewed"
import ResetPassword from "./pages/ResetPassword"
import FeedbackGate from "./pages/FeedbackGate"
import ReviewReply from "./pages/ReviewReply"
import AcceptInvite from "./pages/AcceptInvite"
import Inbox from "./pages/Inbox"
import NotFound from "./pages/NotFound"
import { ToastProvider } from "./components/ui/Toast"
import { ThemeProvider } from "./context/ThemeContext"
import { SailMark } from "./components/brand/SailMark"
import { isStaff } from "./lib/roles"

/** The first thing a returning user sees. Branded, and quiet about it. */
const RouteLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-canvas">
    <div className="flex items-center gap-2.5 text-ink-muted">
      <SailMark variant="container" className="h-7 w-7 shrink-0 animate-pulse" />
      <span className="text-sm font-medium">Loading ReviewSail…</span>
    </div>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();

  if (loading) {
    return <RouteLoader />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { role, loading } = useAuth();

  if (loading) {
    return <RouteLoader />;
  }

  if (isStaff(role)) {
    return <Navigate to="/dashboard?access_denied=true" replace />;
  }

  return <>{children}</>;
};

function AppRoutes() {
  return (
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