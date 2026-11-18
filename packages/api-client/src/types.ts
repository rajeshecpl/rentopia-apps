/**
 * Hand-written types for the auth/profile API (Milestone 1).
 * The full contract is in the backend repo: docs/API_CLIENTS.md.
 * Once the API grows, prefer the generated `schema.ts` (npm run api:types).
 */

export type Role = 'CUSTOMER' | 'VENDOR' | 'ADMIN' | 'SUPER_ADMIN' | 'SUPPORT';

export interface UserSummary {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  roles: Role[];
}

export interface AuthResponse {
  tokenType: 'Bearer';
  /** JWT, valid 15 minutes. */
  accessToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  /** Opaque, valid 30 days, single use: every refresh returns a new one. */
  refreshToken: string;
  user: UserSummary;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  accountType: 'CUSTOMER' | 'VENDOR';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  roles: Role[];
  dateOfBirth?: string;
  gender?: Gender;
  createdAt: string;
}

export interface UpdateProfileRequest {
  fullName: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: Gender;
}

/** Error body returned by every API endpoint. Branch on `code`, never on `message`. */
export interface ApiErrorBody {
  timestamp: string;
  status: number;
  code: string;
  message: string;
  path: string;
  fieldErrors?: { field: string; message: string }[];
}
