import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import useEventStream from './hooks/useEventStream';

// Shell & Navigation Components
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import SideRail from './components/SideRail';

// Public & Onboarding Pages
import Landing from './pages/landing/Landing';
import Welcome from './pages/Welcome';
import Signup from './pages/auth/Signup';
import Login from './pages/auth/Login';

// Worker App Pages
import Home from './pages/home/Home';
import Plans from './pages/plans/Plans';
import PlanDetail from './pages/plans/PlanDetail';
import ActivatePlan from './pages/plans/ActivatePlan';
import AlertPage from './pages/alert/Alert';
import ClaimsList from './pages/claims/ClaimsList';
import ClaimTracker from './pages/claims/ClaimTracker';
import Dispute from './pages/claims/Dispute';
import QrCheckIn from './pages/checkin/QrCheckIn';
import Notifications from './pages/notifications/Notifications';
import Profile from './pages/profile/Profile';

// Admin Console Pages
import AdminQueue from './pages/admin/AdminQueue';
import AdminAnalytics from './pages/admin/AdminAnalytics';
import AdminLive from './pages/admin/AdminLive';

/**
 * Route protection wrapper for authenticated user sections
 */
function PrivateRoute({ children, adminOnly = false }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-walnut border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-bold text-ink/72">Loading Kavach...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/welcome" state={{ from: location }} replace />;
  }

  if (adminOnly && !isAdmin) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 glass-1 rounded-card text-center space-y-3">
        <h3 className="font-display font-bold text-lg text-ink">Admin Role Required</h3>
        <p className="text-xs font-semibold text-ink/72">
          Switch to Admin view in your Profile page or toggle developer test role.
        </p>
      </div>
    );
  }

  return children;
}

function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, isAdmin } = useAuth();

  const [envState, setEnvState] = useState('clear'); // 'clear' | 'rain' | 'heat' | 'air' | 'offline'

  // SSE stream for environmental zone conditions
  useEventStream('/stream/worker', (eventName, data) => {
    if (eventName === 'trigger.announced') {
      const type = data?.trigger_type || 'rainfall';
      if (type.includes('rain')) setEnvState('rain');
      else if (type.includes('heat')) setEnvState('heat');
      else if (type.includes('air') || type.includes('aqi')) setEnvState('air');
    }
  });

  const pathname = location.pathname;

  // Determine which navigation item is active
  let activeTab = 'home';
  if (pathname.startsWith('/plans')) activeTab = 'plans';
  else if (pathname.startsWith('/claims')) activeTab = 'claims';
  else if (pathname.startsWith('/checkin')) activeTab = 'checkin';
  else if (pathname.startsWith('/profile')) activeTab = 'me';
  else if (pathname.startsWith('/admin/queue')) activeTab = 'queue';
  else if (pathname.startsWith('/admin/live')) activeTab = 'live';
  else if (pathname.startsWith('/admin/analytics')) activeTab = 'analytics';

  // Worker screens showing bottom nav bar on mobile
  const showMobileNav = ['/home', '/dashboard', '/plans', '/claims', '/profile'].some((p) =>
    pathname.startsWith(p)
  );

  // Screens that are full-bleed public / landing
  const isPublicScreen = ['/', '/landing', '/welcome', '/signup', '/login'].includes(pathname);

  const handleNavigate = (tabId) => {
    switch (tabId) {
      case 'home':
        navigate('/home');
        break;
      case 'plans':
        navigate('/plans');
        break;
      case 'checkin':
        navigate('/checkin');
        break;
      case 'claims':
        navigate('/claims');
        break;
      case 'me':
      case 'profile':
        navigate('/profile');
        break;
      case 'queue':
        navigate('/admin/queue');
        break;
      case 'live':
        navigate('/admin/live');
        break;
      case 'analytics':
        navigate('/admin/analytics');
        break;
      default:
        navigate('/home');
    }
  };

  return (
    <div className="min-h-screen relative font-sans text-ink">
      {/* Living background mesh with environment reactive tinting */}
      <div className="app-bg" data-env={envState} />

      {!isPublicScreen && (
        <TopBar
          userName={user?.name || (isAdmin ? 'Adjudicator Desk' : 'Delivery Partner')}
          zoneName={isAdmin ? 'Central Claims Hub' : 'Koramangala Zone'}
          connectionStatus="live"
        />
      )}

      <div className="flex">
        {/* Desktop Side Rail for wide screens (>= 1024px) */}
        {!isPublicScreen && (
          <SideRail
            activeTab={activeTab}
            onNavigate={handleNavigate}
            isAdmin={isAdmin}
          />
        )}

        {/* Main Content Viewport */}
        <main
          className={`flex-1 transition-all ${
            !isPublicScreen ? 'pt-16 px-4 md:px-8' : ''
          }`}
        >
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/landing" element={<Landing />} />
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />

            {/* Worker App Core Routes */}
            <Route
              path="/home"
              element={
                <PrivateRoute>
                  <Home />
                </PrivateRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Home />
                </PrivateRoute>
              }
            />
            <Route
              path="/plans"
              element={
                <PrivateRoute>
                  <Plans />
                </PrivateRoute>
              }
            />
            <Route
              path="/plans/:tier"
              element={
                <PrivateRoute>
                  <PlanDetail />
                </PrivateRoute>
              }
            />
            <Route
              path="/plans/:tier/activate"
              element={
                <PrivateRoute>
                  <ActivatePlan />
                </PrivateRoute>
              }
            />
            <Route
              path="/alert/:triggerId"
              element={
                <PrivateRoute>
                  <AlertPage />
                </PrivateRoute>
              }
            />
            <Route
              path="/claims"
              element={
                <PrivateRoute>
                  <ClaimsList />
                </PrivateRoute>
              }
            />
            <Route
              path="/claims/:id"
              element={
                <PrivateRoute>
                  <ClaimTracker />
                </PrivateRoute>
              }
            />
            <Route
              path="/claims/:id/dispute"
              element={
                <PrivateRoute>
                  <Dispute />
                </PrivateRoute>
              }
            />
            <Route
              path="/checkin"
              element={
                <PrivateRoute>
                  <QrCheckIn />
                </PrivateRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <PrivateRoute>
                  <Notifications />
                </PrivateRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />

            {/* Admin Console Routes */}
            <Route
              path="/admin/queue"
              element={
                <PrivateRoute adminOnly>
                  <AdminQueue />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <PrivateRoute adminOnly>
                  <AdminAnalytics />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/live"
              element={
                <PrivateRoute adminOnly>
                  <AdminLive />
                </PrivateRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>

      {/* Mobile Floating Bottom Bar */}
      {showMobileNav && !isAdmin && (
        <div className="lg:hidden">
          <BottomNav
            activeTab={activeTab}
            claimCount={1}
            onNavigate={handleNavigate}
          />
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
