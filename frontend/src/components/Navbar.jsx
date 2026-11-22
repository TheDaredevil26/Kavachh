import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Navbar() {
  const { user, isAuthenticated, isAdmin, logout, switchRole, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const tenantBadges = {
    blinkit: { name: 'Blinkit', color: 'bg-yellow-400 text-yellow-950 border-yellow-500' },
    zepto: { name: 'Zepto', color: 'bg-purple-600 text-white border-purple-700' },
    swiggy_instamart: { name: 'Swiggy', color: 'bg-orange-500 text-white border-orange-600' },
  };

  const currentTenant = user?.tenant_slug ? tenantBadges[user.tenant_slug] : null;

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <Link to={isAuthenticated ? '/dashboard' : '/login'} className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5A4030] to-[#3a281e] flex items-center justify-center text-amber-100 shadow-sm transition group-hover:scale-105">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
                </svg>
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-slate-900 group-hover:text-amber-900 transition">
                  Kavach
                </span>
                <span className="hidden sm:inline-block ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800/80 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                  Gig Armor
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Nav Items */}
          {isAuthenticated && (
            <nav className="hidden md:flex items-center gap-1">
              <Link
                to="/dashboard"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive('/dashboard')
                    ? 'bg-amber-100/70 text-amber-950 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Dashboard
              </Link>
              <Link
                to="/policies/buy"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive('/policies/buy')
                    ? 'bg-amber-100/70 text-amber-950 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Buy Policy
              </Link>
              <Link
                to="/checkin"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive('/checkin')
                    ? 'bg-amber-100/70 text-amber-950 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                QR Check-In
              </Link>

              {/* Admin Console Links */}
              <div className="h-4 w-px bg-slate-200 mx-2" />
              <Link
                to="/admin/queue"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive('/admin/queue')
                    ? 'bg-indigo-100 text-indigo-950 font-semibold'
                    : 'text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50'
                }`}
              >
                Admin Queue
              </Link>
              <Link
                to="/admin/analytics"
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive('/admin/analytics')
                    ? 'bg-indigo-100 text-indigo-950 font-semibold'
                    : 'text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50'
                }`}
              >
                Analytics
              </Link>
            </nav>
          )}

          {/* User profile & controls */}
          <div className="hidden sm:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                {/* Platform Badge */}
                {currentTenant && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${currentTenant.color}`}
                  >
                    {currentTenant.name}
                  </span>
                )}

                {/* Role Switcher Demo Utility */}
                <button
                  type="button"
                  onClick={() => switchRole(role === 'admin' ? 'worker' : 'admin')}
                  className="text-xs px-2.5 py-1 rounded-md border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 font-mono transition"
                  title="Toggle between Worker and Admin role"
                >
                  Role: <span className="font-bold text-amber-900 capitalize">{role}</span>
                </button>

                {/* User Info */}
                <div className="text-right">
                  <div className="text-xs font-semibold text-slate-900">
                    {user?.name || user?.full_name || 'Rider'}
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {user?.phoneNumber || user?.phone_number || 'Partner'}
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 transition"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 transition"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#5A4030] hover:bg-[#483326] text-white shadow-sm transition"
                >
                  Register
                </Link>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            {isAuthenticated && (
              <button
                type="button"
                onClick={() => switchRole(role === 'admin' ? 'worker' : 'admin')}
                className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-slate-50 font-mono"
              >
                {role}
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-4 space-y-2">
          {isAuthenticated ? (
            <>
              <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{user?.name || 'Rider'}</div>
                  <div className="text-xs text-slate-500 font-mono">{user?.phoneNumber || user?.phone_number}</div>
                </div>
                {currentTenant && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${currentTenant.color}`}>
                    {currentTenant.name}
                  </span>
                )}
              </div>
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Dashboard
              </Link>
              <Link
                to="/policies/buy"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Buy Policy
              </Link>
              <Link
                to="/checkin"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                QR Check-In
              </Link>
              <Link
                to="/admin/queue"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                Admin Review Queue
              </Link>
              <Link
                to="/admin/analytics"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                Admin Analytics
              </Link>
              <div className="pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50"
                >
                  Logout
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Log In
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium bg-[#5A4030] text-white text-center"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
