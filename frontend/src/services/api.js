// Kavach API Client
// Provides unified fetch wrapper with JWT management and typed methods for all endpoints

export const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Token helpers
export function getAccessToken() {
  return sessionStorage.getItem('kavach_access') || localStorage.getItem('kavach_access');
}

export function getRefreshToken() {
  return sessionStorage.getItem('kavach_refresh') || localStorage.getItem('kavach_refresh');
}

export function setTokens(accessToken, refreshToken) {
  if (accessToken) {
    sessionStorage.setItem('kavach_access', accessToken);
    localStorage.setItem('kavach_access', accessToken);
  }
  if (refreshToken) {
    sessionStorage.setItem('kavach_refresh', refreshToken);
    localStorage.setItem('kavach_refresh', refreshToken);
  }
}

export function clearTokens() {
  sessionStorage.removeItem('kavach_access');
  sessionStorage.removeItem('kavach_refresh');
  sessionStorage.removeItem('kavach_user');
  localStorage.removeItem('kavach_access');
  localStorage.removeItem('kavach_refresh');
  localStorage.removeItem('kavach_user');
}

/**
 * Normalizes an API path ensuring it points to the configured endpoint.
 */
function resolveUrl(path) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (cleanPath.startsWith('/api/v1')) {
    return cleanPath;
  }
  return `${BASE_URL}${cleanPath}`;
}

let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

/**
 * Universal fetch request wrapper
 */
async function request(method, path, body = null, customHeaders = {}) {
  const url = resolveUrl(path);
  const token = getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...customHeaders,
  };

  const config = {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  try {
    const response = await fetch(url, config);

    // Handle 401 Unauthorized with token refresh
    if (response.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        if (!isRefreshing) {
          isRefreshing = true;
          try {
            const refreshRes = await fetch(resolveUrl('/auth/refresh'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
            const refreshJson = await refreshRes.json();
            const newAccessToken = refreshJson.data?.access_token || refreshJson.access_token;
            const newRefreshToken = refreshJson.data?.refresh_token || refreshJson.refresh_token;

            if (newAccessToken) {
              setTokens(newAccessToken, newRefreshToken || refreshToken);
              processQueue(null, newAccessToken);
              // Retry original request
              headers.Authorization = `Bearer ${newAccessToken}`;
              const retryRes = await fetch(url, { ...config, headers });
              const retryJson = await retryRes.json();
              return retryJson.data !== undefined ? retryJson.data : retryJson;
            } else {
              throw new Error('Failed to refresh token');
            }
          } catch (refreshErr) {
            processQueue(refreshErr, null);
            clearTokens();
            throw refreshErr;
          } finally {
            isRefreshing = false;
          }
        } else {
          // Wait for token refresh to complete
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: async (newToken) => {
                headers.Authorization = `Bearer ${newToken}`;
                try {
                  const retryRes = await fetch(url, { ...config, headers });
                  const retryJson = await retryRes.json();
                  resolve(retryJson.data !== undefined ? retryJson.data : retryJson);
                } catch (err) {
                  reject(err);
                }
              },
              reject: (err) => reject(err),
            });
          });
        }
      }
    }

    const json = await response.json().catch(() => ({}));

    if (!response.ok || json.success === false) {
      const errorMessage =
        json.error?.message ||
        json.message ||
        `Request failed with status ${response.status}`;
      const err = new Error(errorMessage);
      err.status = response.status;
      err.code = json.error?.code || json.code;
      err.details = json.error?.details || json.details;
      throw err;
    }

    // Return inner data payload if standard envelope is present
    return json.data !== undefined ? json.data : json;
  } catch (error) {
    throw error;
  }
}

// Export API service functions
export const api = {
  // Base request
  request,

  // Authentication
  register: (data) => request('POST', '/auth/register', data),
  login: (credentials) => request('POST', '/auth/login', credentials),
  refresh: (refreshToken) => request('POST', '/auth/refresh', { refresh_token: refreshToken }),

  // Worker Profile & Actions
  getProfile: () => request('GET', '/workers/me'),
  updateProfile: (data) => request('PUT', '/workers/me', data),
  uploadGps: (latitude, longitude) => request('POST', '/workers/me/gps', { latitude, longitude }),
  verifyBank: (data) => request('POST', '/workers/me/bank-verify', data),
  getNotifications: () => request('GET', '/workers/me/notifications'),
  platformAuthorize: (tenantSlug) => request('GET', `/auth/platform/${tenantSlug}/authorize`),

  // Policies
  getTiers: () => request('GET', '/policies/tiers'),
  buyPolicy: (data) => request('POST', '/policies', data),
  getPolicies: () => request('GET', '/policies'),
  getPolicy: (id) => request('GET', `/policies/${id}`),
  getPolicyCoverage: (id) => request('GET', `/policies/${id}/coverage`),
  cancelPolicy: (id) => request('DELETE', `/policies/${id}`),

  // Triggers
  getActiveTriggers: () => request('GET', '/triggers/active'),
  getTriggerHistory: () => request('GET', '/triggers/history'),
  getTrigger: (id) => request('GET', `/triggers/${id}`),

  // Claims
  fileClaim: (data) => request('POST', '/claims', data),
  getClaims: () => request('GET', '/claims'),
  getClaim: (id) => request('GET', `/claims/${id}`),
  getClaimStatus: (id) => request('GET', `/claims/${id}/status`),
  disputeClaim: (id, reason) => request('POST', `/claims/${id}/dispute`, { reason }),

  // Dark-store Check-In
  qrCheckIn: (data) => request('POST', '/workers/me/checkin/qr', data),

  // Admin Queue & Operations
  getAdminQueue: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request('GET', `/admin/claims/queue${query ? `?${query}` : ''}`);
  },
  reviewClaim: (id, data) => request('POST', `/admin/claims/${id}/review`, data),
  resolveDispute: (id, data) => request('POST', `/admin/disputes/${id}/resolve`, data),
  getAdminAnalytics: (tenantId) => {
    const query = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
    return request('GET', `/admin/analytics/tenant${query}`);
  },
  simulateTrigger: (data) => request('POST', '/admin/triggers/simulate', data),
};

export default api;
