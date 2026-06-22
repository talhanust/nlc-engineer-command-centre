import { createContext, useContext, useState, type ReactNode } from 'react';

/** Acting role — a ROLE_LABEL key, or 'admin' (unrestricted). Dev stand-in for real auth. */
export type AppRole = string;

interface RoleCtx {
  role: AppRole;
  setRole: (r: AppRole) => void;
  /** True if the acting role may perform an action requiring `required` (admin always can). */
  can: (required?: string | null) => boolean;
}

const Ctx = createContext<RoleCtx | null>(null);
const KEY = 'nlc-ecc.role';

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<AppRole>(() => {
    try { return localStorage.getItem(KEY) || 'admin'; } catch { return 'admin'; }
  });
  const setRole = (r: AppRole) => {
    setRoleState(r);
    try { localStorage.setItem(KEY, r); } catch { /* ignore */ }
  };
  const can = (required?: string | null) => !required || role === 'admin' || role === required;
  return <Ctx.Provider value={{ role, setRole, can }}>{children}</Ctx.Provider>;
}

export function useRole(): RoleCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRole must be used within RoleProvider');
  return c;
}

/** Roles offered in the dev role switcher (acting-as). */
export const SWITCHABLE_ROLES: AppRole[] = ['admin', 'pm', 'fm', 'pd', 'manager_contracts'];
