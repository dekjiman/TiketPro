import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { getLocalizedError } from './errors';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
    if (typeof window !== 'undefined' && !config.headers.Authorization) {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await api.post<RefreshResponse>('/api/auth/refresh');
        const { accessToken } = response.data;
        localStorage.setItem('token', accessToken);
        processQueue(accessToken, undefined);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(null, refreshError as AxiosError);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
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