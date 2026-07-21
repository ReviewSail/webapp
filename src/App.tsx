import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { MapRatedProvider } from "./context/MapRatedContext"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { Layout } from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import Import from "./pages/Import"
import Settings from "./pages/Settings"
import Unsubscribe from "./pages/Unsubscribe"
import Login from "./pages/Login"

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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/opt-out" element={<Unsubscribe />} />
      <Route path="/unsubscribe" element={<Unsubscribe />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="import" element={<Import />} />
        <Route path="settings" element={<Settings />} />
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