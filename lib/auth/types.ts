/**
 * What a signed-in contractor is, everywhere in the app.
 *
 * Deliberately small: an identity and the tenant it belongs to. Anything
 * else a surface needs (the price book, the lead) it resolves for itself.
 *
 * Server-only.
 */
export type ContractorRole = "rep" | "admin";

export type Contractor = {
  id: string;
  email: string;
  name: string;
  role: ContractorRole;
  orgId: string;
};
