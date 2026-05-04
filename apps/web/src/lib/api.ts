import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { getLocalizedError } from './errors';

export function getApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== 'undefined') {
    // Prefer same-origin API so Next.js rewrites can proxy `/api/*` to the backend.
    // This avoids broken calls like `https://<ngrok-domain>:4000` (port not forwarded).
    if (envUrl) {
      try {
        const parsed = new URL(envUrl);
        const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
        if (!isLocalhost) return envUrl;
      } catch {
        // If envUrl isn't a valid URL, ignore and fall back to same-origin.
      }
    }
    return window.location.origin;
  }

  if (envUrl) return envUrl;
  return 'http://localhost:4000';
}

export const API_URL = getApiUrl();

export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, any>;
}

interface RefreshResponse {
  accessToken: string;
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: string) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (token: string | null, error?: AxiosError) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const requestUrl = originalRequest?.url || '';
    const isAuthRefreshCall = requestUrl.includes('/api/auth/refresh');
    const isAuthLogoutCall = requestUrl.includes('/api/auth/logout');
    const isAuthMeCall = requestUrl.includes('/api/auth/me');
    const isPublicAuthCall =
      requestUrl.includes('/api/auth/login') ||
      requestUrl.includes('/api/auth/register') ||
      requestUrl.includes('/api/auth/verify-email') ||
      requestUrl.includes('/api/auth/resend-otp') ||
      requestUrl.includes('/api/auth/forgot-password') ||
      requestUrl.includes('/api/auth/reset-password') ||
      requestUrl.includes('/api/auth/google');
    const shouldSkipRefresh = isAuthRefreshCall || isAuthLogoutCall || isAuthMeCall || isPublicAuthCall;

    if (error.response?.status === 401 && !originalRequest._retry && !shouldSkipRefresh) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await api.post<RefreshResponse>('/api/auth/refresh');
        const { accessToken } = response.data;
        processQueue(accessToken, undefined);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(null, refreshError as AxiosError);
        localStorage.removeItem('user');
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export const getApiError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError;
    if (data?.error) {
      return {
        ...data,
        error: getLocalizedError(data.code, data.error),
      };
    }
    return {
      error: getLocalizedError(undefined, error.message || 'Terjadi kesalahan'),
      code: 'UNKNOWN_ERROR',
    };
  }
  return {
    error: getLocalizedError(undefined, 'Terjadi kesalahan'),
    code: 'UNKNOWN_ERROR',
  };
};

export const isApiError = (error: unknown): error is AxiosError => {
  return axios.isAxiosError(error);
};

export const authApi = {
  login: (email: string, password: string, rememberMe = false) =>
    api.post<{ user: any; accessToken: string }>('/api/auth/login', { email, password, rememberMe }),

  register: (data: { name: string; email: string; password: string; phone?: string; role?: string }) =>
    api.post<{ user: any; accessToken: string; requiresVerification: boolean }>('/api/auth/register', data),

  google: (idToken: string) =>
    api.post<{ user: any; accessToken: string }>('/api/auth/google', { idToken }),

  me: () => api.get<any>('/api/auth/me'),

  logout: () => api.post('/api/auth/logout'),
};
