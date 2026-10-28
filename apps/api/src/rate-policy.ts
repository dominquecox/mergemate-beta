export const RATE_LIMITS = { ip: 60, session: 300, support: 5 } as const;
export type AdmissionScope = keyof typeof RATE_LIMITS;
export interface Admission { success: boolean; retryAfter: number }
export interface AdmissionNamespace {
  getByName(name: string): { admit(scope: AdmissionScope): Promise<Admission> };
}
