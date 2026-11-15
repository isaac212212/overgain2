import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import AppLayout from './components/layout/AppLayout';
import LoadingScreen from './components/layout/LoadingScreen';
import LoginPage from './pages/LoginPage';
import OnboardingPage from './pages/OnboardingPage';
import DashboardPage from './pages/DashboardPage';
import RoutinesPage from './pages/RoutinesPage';
import RoutineViewPage from './pages/RoutineViewPage';
import GroupsPage from './pages/GroupsPage';
import GroupDetailPage from './pages/GroupDetailPage';
import ProfilePage from './pages/ProfilePage';
import PublicProfilePage from './pages/PublicProfilePage';
import SettingsPage from './pages/SettingsPage';
import ActiveWorkoutPage from './pages/ActiveWorkoutPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// Route protector helper
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Main Authenticated App Layout */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="routines" element={<RoutinesPage />} />
        <Route path="routines/:routineId" element={<RoutineViewPage />} />
        <Route path="profiles/:id/routines/:routineId" element={<RoutineViewPage publicView />} />
        <Route path="workout/active" element={<ActiveWorkoutPage />} />
        <Route path="checkin" element={<Navigate to="/routines" replace />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="groups/:id" element={<GroupDetailPage />} />
        <Route path="profile/progress" element={<ProfilePage progressView />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profiles/:id" element={<PublicProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
