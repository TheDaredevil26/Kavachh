import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getAccessToken, setTokens, clearTokens } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('kavach_user') || localStorage.getItem('kavach_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [role, setRole] = useState(() => {
    const savedRole = sessionStorage.getItem('kavach_role') || localStorage.getItem('kavach_role');
    return savedRole || 'worker';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const saveUserSession = (userData, userRole = 'worker') => {
    setUser(userData);
    setRole(userRole);
    sessionStorage.setItem('kavach_user', JSON.stringify(userData));
    sessionStorage.setItem('kavach_role', userRole);
    localStorage.setItem('kavach_user', JSON.stringify(userData));
    localStorage.setItem('kavach_role', userRole);
  };

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await api.getProfile();
      if (profile) {
        saveUserSession(profile, profile.role || role);
        return profile;
      }
    } catch (err) {
      console.warn('Failed to load user profile:', err);
    }
    return null;
  }, [role]);

  // Initial authentication check on load
  useEffect(() => {
    async function initAuth() {
      const token = getAccessToken();
      if (token) {
        try {
          await refreshProfile();
        } catch (err) {
          console.error('Auth initialization error:', err);
        }
      }
      setIsLoading(false);
    }
    initAuth();
  }, [refreshProfile]);

  const login = async (phone_number, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.login({ phone_number, password });
      const accessToken = res.access_token || res.accessToken;
      const refreshToken = res.refresh_token || res.refreshToken;
      setTokens(accessToken, refreshToken);

      // Attempt to get full worker profile
      let profile = null;
      try {
        profile = await api.getProfile();
      } catch {
        profile = {
          id: res.worker_id || 'worker-demo',
          worker_id: res.worker_id || 'worker-demo',
          phoneNumber: phone_number,
          role: 'worker',
        };
      }

      const detectedRole = profile.role || (phone_number === '9999999999' ? 'admin' : 'worker');
      saveUserSession(profile, detectedRole);
      return profile;
    } catch (err) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (formData) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.register(formData);
      const accessToken = res.access_token || res.accessToken;
      const refreshToken = res.refresh_token || res.refreshToken;
      setTokens(accessToken, refreshToken);

      let profile = null;
      try {
        profile = await api.getProfile();
      } catch {
        profile = {
          id: res.worker_id,
          name: formData.name,
          phoneNumber: formData.phone_number,
          tenant_slug: formData.tenant_slug,
          platform_worker_id: formData.platform_worker_id,
          zone_id: formData.zone_id,
          role: 'worker',
        };
      }

      saveUserSession(profile, 'worker');
      return profile;
    } catch (err) {
      setError(err.message || 'Registration failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    clearTokens();
    sessionStorage.removeItem('kavach_role');
    localStorage.removeItem('kavach_role');
    setUser(null);
    setRole('worker');
    setError(null);
  };

  const switchRole = (newRole) => {
    setRole(newRole);
    sessionStorage.setItem('kavach_role', newRole);
    localStorage.setItem('kavach_role', newRole);
    if (user) {
      const updated = { ...user, role: newRole };
      setUser(updated);
      sessionStorage.setItem('kavach_user', JSON.stringify(updated));
    }
  };

  const value = {
    user,
    role,
    isAuthenticated: Boolean(getAccessToken()),
    isAdmin: role === 'admin',
    isLoading,
    error,
    login,
    register,
    logout,
    refreshProfile,
    switchRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default useAuth;
