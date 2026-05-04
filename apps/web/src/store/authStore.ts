import { create } from 'zustand';
import { api, getApiError } from '@/lib/api';
import { persist, createJSONStorage } from 'zustand/middleware';

export type UserRole = 'SUPER_ADMIN' | 'EO_ADMIN' | 'EO_STAFF' | 'AFFILIATE' | 'RESELLER' | 'CUSTOMER';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  city?: string;
  bio?: string;
  role: UserRole;
  status: string;
  isVerified: boolean;
  avatar?: string;
  referralCode?: string;
  twoFAEnabled?: boolean;
  createdAt: string;
}

interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  role: UserRole | null;
  _hasHydrated: boolean;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  login: (email: string, password: string, captchaToken?: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; phone?: string; role?: UserRole }) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setHydrated: (state: boolean) => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      isLoggedIn: false,
      role: null,
      _hasHydrated: false,

      setHydrated: (state) => set({ _hasHydrated: state }),

      setUser: (user) => {
        set({
          user,
          isLoggedIn: !!user,
          role: user?.role || null,
        });
      },

      login: async (email: string, password: string, captchaToken?: string) => {
        const response = await api.post<{
          user: User;
          accessToken?: string;
          requiresVerification?: boolean;
          requiresApproval?: boolean;
        }>('/api/auth/login', {
          email,
          password,
          captchaToken,
        });
        const res = response.data;

        if (res.requiresVerification) {
          localStorage.setItem('pending_email', email);
          throw new Error('EMAIL_VERIFICATION_REQUIRED');
        }

        if (res.requiresApproval) {
          localStorage.setItem('token', '');
          if (typeof window !== 'undefined') {
            document.cookie = `token=; path=/; max-age=0`;
            document.cookie = `user=${encodeURIComponent(JSON.stringify(res.user))}; path=/; max-age=604800`;
          }
          set({
            user: res.user,
            isLoggedIn: true,
            role: res.user.role,
            _hasHydrated: true,
          });
          throw new Error('ACCOUNT_PENDING_APPROVAL');
        }

        if (res.accessToken) {
          localStorage.setItem('token', res.accessToken);
          if (typeof window !== 'undefined') {
            document.cookie = `token=${res.accessToken}; path=/; max-age=604800`;
            document.cookie = `user=${encodeURIComponent(JSON.stringify(res.user))}; path=/; max-age=604800`;
          }
          set({
            user: res.user,
            isLoggedIn: true,
            role: res.user.role,
            _hasHydrated: true,
          });
        }
      },

      register: async (data) => {
        const response = await api.post<{
          user: User;
          accessToken?: string;
          requiresVerification?: boolean;
          userId?: string;
        }>('/api/auth/register', data);
        const res = response.data;

        if (res.requiresVerification || res.userId) {
          localStorage.setItem('pending_email', data.email);
          localStorage.setItem('pending_user_id', res.userId || '');
          throw new Error('EMAIL_VERIFICATION_REQUIRED');
        }

        if (res.accessToken && res.user) {
          localStorage.setItem('token', res.accessToken);
          localStorage.setItem('user', JSON.stringify(res.user));

          if (typeof window !== 'undefined') {
            document.cookie = `token=${res.accessToken}; path=/; max-age=604800`;
            document.cookie = `user=${encodeURIComponent(JSON.stringify(res.user))}; path=/; max-age=604800`;
          }

          set({
            user: res.user,
            isLoggedIn: true,
            role: res.user.role,
            _hasHydrated: true,
          });
        }
      },

      logout: async () => {
        try {
          await api.post('/api/auth/logout');
        } catch {
        } finally {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          
          document.cookie = 'token=; path=/; max-age=0';
          document.cookie = 'user=; path=/; max-age=0';
          
          set({
            user: null,
            isLoggedIn: false,
            role: null,
          });
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
        }
      },

      checkAuth: async () => {
        const token = localStorage.getItem('token');
        if (!token) {
          set({ user: null, isLoggedIn: false, role: null });
          return;
        }
        try {
          const response = await api.get<User>('/api/auth/me');
          const user = response.data;
          if (user) {
            document.cookie = `token=${token}; path=/; max-age=604800`;
            document.cookie = `user=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=604800`;
            set({ user, isLoggedIn: true, role: user.role });
          }
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          document.cookie = 'token=; path=/; max-age=0';
          document.cookie = 'user=; path=/; max-age=0';
          set({ user: null, isLoggedIn: false, role: null });
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isLoggedIn: state.isLoggedIn,
        role: state.role,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);

export const useRequireAuth = (redirectTo = '/login') => {
  const { isLoggedIn, checkAuth } = useAuthStore();

  if (!isLoggedIn) {
    if (typeof window !== 'undefined') {
      window.location.href = redirectTo;
    }
  }

  return { isLoggedIn };
};

export const useRequireRole = (roles: UserRole[]) => {
  const { role } = useAuthStore();
  return role ? roles.includes(role) : false;
};