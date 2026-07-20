import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { MapRatedProvider } from "./context/MapRatedContext"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { Layout } from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import Import from "./pages/Import"
import Settings from "./pages/Settings"
import OptOut from "./pages/OptOut"
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
      <Route path="/opt-out" element={<OptOut />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <ProtectedRoute>
          <MapRatedProvider>
            <Layout />
          </MapRatedProvider>
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
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  )
}

export default App
