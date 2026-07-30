import { createContext, useContext, useState, type ReactNode } from 'react';

/** Acting role — a ROLE_LABEL key, or 'admin' (unrestricted). Dev stand-in for real auth. */
export type AppRole = string;

interface ActingUser { name: string; nodeId: string; appointmentId?: string }

interface RoleCtx {
  role: AppRole;
  setRole: (r: AppRole) => void;
  /** Signed-in user (req 3j(3)): name + organisational scope. Null = dev role-only mode (unscoped). */
  user: ActingUser | null;
  /** Sign in as a named user: sets role AND scope together. */
  setUser: (u: { name: string; role: AppRole; nodeId: string; appointmentId?: string } | null) => void;
  /** True if the acting role may perform an action requiring `required` (admin always can). */
  can: (required?: string | null) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);
const KEY = 'nlc-ecc.role';
const USER_KEY = 'nlc-ecc.ui.user';

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<AppRole>(() => {
    try { return localStorage.getItem(KEY) || 'admin'; } catch { return 'admin'; }
  });
  const [user, setUserState] = useState<ActingUser | null>(() => {
    try { const raw = localStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) as ActingUser : null; } catch { return null; }
  });
  const setRole = (r: AppRole) => {
    setRoleState(r);
    try { localStorage.setItem(KEY, r); } catch { /* ignore */ }
  };
  const setUser = (u: { name: string; role: AppRole; nodeId: string; appointmentId?: string } | null) => {
    if (u) {
      setUserState({ name: u.name, nodeId: u.nodeId, appointmentId: u.appointmentId });
      setRole(u.role);
      try { localStorage.setItem(USER_KEY, JSON.stringify({ name: u.name, nodeId: u.nodeId, appointmentId: u.appointmentId })); } catch { /* ignore */ }
    } else {
      setUserState(null);
      try { localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
    }
  };
  const can = (required?: string | null) => !required || role === 'admin' || role === required;
  return <Ctx.Provider value={{ role, setRole, user, setUser, can }}>{children}</Ctx.Provider>;
}

export function useRole(): RoleCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRole must be used within RoleProvider');
  return c;
}

/** Roles offered in the dev role switcher (acting-as). */
export const SWITCHABLE_ROLES: AppRole[] = ['admin', 'pm', 'fm', 'pd', 'manager_contracts'];
