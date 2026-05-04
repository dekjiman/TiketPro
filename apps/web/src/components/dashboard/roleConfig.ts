import {
  Users,
  Calendar,
  BarChart3,
  Settings,
  Ticket,
  ShoppingBag,
  User,
  Link2,
  Wallet,
  Package,
  QrCode,
  LayoutDashboard,
  FileText,
  ClipboardList,
  Bell,
  Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface MenuItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface RoleConfig {
  dashboard: string;
  menu: MenuItem[];
}

export const ROLE_CONFIG: Record<string, RoleConfig> = {
  SUPER_ADMIN: {
    dashboard: '/admin/users',
    menu: [
      { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
      { label: 'My Tickets', path: '/dashboard/my-tickets', icon: Ticket },
      { label: 'Users', path: '/admin/users', icon: Users },
      { label: 'Events', path: '/admin/events', icon: Calendar },
      { label: 'Reports', path: '/admin/reports', icon: BarChart3 },
      { label: 'Settings', path: '/admin/settings', icon: Settings },
    ],
  },
  EO_ADMIN: {
    dashboard: '/eo/events',
    menu: [
      { label: 'Dashboard', path: '/eo', icon: LayoutDashboard },
      { label: 'My Tickets', path: '/dashboard/my-tickets', icon: Ticket },
      { label: 'Events', path: '/eo/events', icon: Calendar },
      { label: 'Notifications', path: '/eo/notifications', icon: Bell },
      { label: 'Staff', path: '/eo/staff', icon: Users },
      { label: 'Tickets', path: '/eo/tickets', icon: Ticket },
      { label: 'Check-in', path: '/eo/checkin', icon: QrCode },
      { label: 'Undian', path: '/eo/lottery', icon: Trophy },
      { label: 'Lottery Settings', path: '/eo/lottery/settings', icon: Settings },
      { label: 'Reports', path: '/eo/reports', icon: BarChart3 },
    ],
  },
  EO_STAFF: {
    dashboard: '/eo/checkin',
    menu: [
      { label: 'Check-ins', path: '/eo/checkin', icon: ClipboardList },
      { label: 'My Tickets', path: '/dashboard/my-tickets', icon: Ticket },
    ],
  },
  AFFILIATE: {
    dashboard: '/affiliate',
    menu: [
      { label: 'Dashboard', path: '/affiliate', icon: LayoutDashboard },
      { label: 'My Tickets', path: '/dashboard/my-tickets', icon: Ticket },
      { label: 'My Links', path: '/affiliate/links', icon: Link2 },
      { label: 'Earnings', path: '/affiliate/earnings', icon: Wallet },
    ],
  },
  RESELLER: {
    dashboard: '/reseller',
    menu: [
      { label: 'Dashboard', path: '/reseller', icon: LayoutDashboard },
      { label: 'My Tickets', path: '/dashboard/my-tickets', icon: Ticket },
      { label: 'Stock', path: '/reseller/stock', icon: Package },
      { label: 'Orders', path: '/reseller/orders', icon: ShoppingBag },
      { label: 'Reports', path: '/reseller/reports', icon: BarChart3 },
    ],
  },
  CUSTOMER: {
    dashboard: '/dashboard',
    menu: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { label: 'My Tickets', path: '/dashboard/my-tickets', icon: Ticket },
      { label: 'Orders', path: '/dashboard/orders', icon: ShoppingBag },
      { label: 'Profile', path: '/dashboard/profile', icon: User },
    ],
  },
};

export function getRoleConfig(role: string): RoleConfig | null {
  return ROLE_CONFIG[role] || null;
}

export function getDefaultDashboard(role: string): string {
  return ROLE_CONFIG[role]?.dashboard || '/dashboard';
}
