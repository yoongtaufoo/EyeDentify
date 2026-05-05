import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ChatScreen from './screens/ChatScreen';
import MainLayout from './screens/MainLayout';

/* ── Auth Guard: redirects unauthenticated users to /login ── */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return user ? children : <Navigate to="/login" replace />;
}

/* ── Public route: redirects logged-in users to /home ── */
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  return user ? <Navigate to="/home" replace /> : children;
}

/* ── Logout page: signs out then redirects ── */
function LogoutPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    (async () => {
      await signOut();
      navigate('/login', { replace: true });
    })();
  }, []);

  return <LoadingSpinner />;
}

/* ── Loading spinner ── */
function LoadingSpinner() {
  return (
    <div style={{
      flex: 1, backgroundColor: '#F7F7F7',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh',
    }}>
      <div style={{
        width: 40, height: 40,
        border: '4px solid #E8E8E8', borderTopColor: '#F5A623',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── Root layout with all routes ── */
function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={
        <PublicRoute><LoginScreen /></PublicRoute>
      } />
      <Route path="/signup" element={
        <PublicRoute><RegisterScreen /></PublicRoute>
      } />

      {/* Protected routes - Main app with tabs */}
      <Route path="/home" element={
        <ProtectedRoute><MainLayoutWithAuth /></ProtectedRoute>
      } />

      {/* Logout action */}
      <Route path="/logout" element={<LogoutPage />} />

      {/* Default redirects */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

/* Wraps MainLayout to inject auth state */
function MainLayoutWithAuth() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return <MainLayout user={user} onLogout={handleLogout} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
