import type { ApiClient } from './client';
import type {
  AuthResponse,
  LoginRequest,
  Profile,
  RegisterRequest,
  UpdateProfileRequest,
} from './types';

/** Typed wrappers for the endpoints that exist today. Add new ones per backend milestone. */
export function rentopiaApi(client: ApiClient) {
  return {
    auth: {
      register: (body: RegisterRequest) => client.post<AuthResponse>('/auth/register', body, { auth: false }),
      login: (body: LoginRequest) => client.post<AuthResponse>('/auth/login', body, { auth: false }),
      logout: (refreshToken: string) => client.post<void>('/auth/logout', { refreshToken }, { auth: false }),
      sendOtp: (purpose: 'VERIFY_PHONE' | 'VERIFY_EMAIL') =>
        client.post<{ destinationHint: string; expiresIn: number }>('/auth/otp/send', { purpose }),
      verifyOtp: (purpose: 'VERIFY_PHONE' | 'VERIFY_EMAIL', code: string) =>
        client.post<void>('/auth/verify-otp', { purpose, code }),
    },
    users: {
      getProfile: () => client.get<Profile>('/users/profile'),
      updateProfile: (body: UpdateProfileRequest) => client.put<Profile>('/users/profile', body),
    },
  };
}

export type RentopiaApi = ReturnType<typeof rentopiaApi>;
