import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { MapRatedProvider } from "./context/MapRatedContext"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { Layout } from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import Import from "./pages/Import"
import Guests from "./pages/Guests"
import Settings from "./pages/Settings"
import Unsubscribe from "./pages/Unsubscribe"
import Login from "./pages/Login"
import Feedback from "./pages/Feedback"

// Protected Route Wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-50">Loading...</div>;
  }
  
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

// Admin Only Wrapper
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { role, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-50">Loading...</div>;
  }
  
  if (role === 'staff') {
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
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="import" element={<Import />} />
        <Route path="guests" element={<Guests />} />
        <Route path="settings" element={
          <AdminRoute>
            <Settings />
          </AdminRoute>
        } />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <MapRatedProvider>
        <Router>
          <AppRoutes />
        </Router>
      </MapRatedProvider>
    </AuthProvider>
  )
}

export default App