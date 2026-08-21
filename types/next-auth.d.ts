/**
 * What this app puts on a session beyond Auth.js's defaults: the tenant
 * the contractor belongs to, and what they are allowed to do in it.
 */
import type { ContractorRole } from "../lib/auth/types";

declare module "next-auth" {
  interface User {
    role?: ContractorRole;
    orgId?: string;
  }
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role?: ContractorRole;
      orgId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: ContractorRole;
    orgId?: string;
  }
}

export {};
