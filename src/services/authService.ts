import { apiFetch } from '../config/apiConfig';

export interface UserDto {
  userId: string;
  username: string;
  email?: string | null;
  allowedApps?: string[];
  isActive?: boolean;
  createdAt?: number;
  updatedAt?: number;
  lastLoginAt?: number | null;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  user?: UserDto;
  token?: string;
  app?: string;
  hasAppAccess?: boolean;
}

export interface ValidateResponse {
  success: boolean;
  isValid: boolean;
  hasAppAccess: boolean;
  message: string;
  user?: UserDto;
}

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

export interface AuthSession {
  user: UserDto;
  token: string;
  app?: string;
  hasAppAccess: boolean;
  savedAt: number;
}

export const STORAGE_AUTH_SESSION_KEY = 'mtg_auth_session';

type AuthListener = (user: UserDto | null) => void;

class AuthServiceClass {
  private listeners: Set<AuthListener> = new Set();
  private currentSession: AuthSession | null = null;
  private hasValidated = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_AUTH_SESSION_KEY);
      if (raw) {
        this.currentSession = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[AuthService] Failed to parse auth session from localStorage:', e);
      this.currentSession = null;
    }
  }

  private saveToStorage(session: AuthSession | null): void {
    if (typeof window === 'undefined') return;
    this.currentSession = session;
    if (session) {
      localStorage.setItem(STORAGE_AUTH_SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_AUTH_SESSION_KEY);
    }
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const user = this.getCurrentUser();
    this.listeners.forEach((fn) => {
      try {
        fn(user);
      } catch (err) {
        console.error('[AuthService] Error in auth listener:', err);
      }
    });
  }

  /**
   * Subscribe to auth state changes (login, logout, session expiration)
   */
  public onAuthStateChanged(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener(this.getCurrentUser());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get the currently logged-in user profile, if any
   */
  public getCurrentUser(): UserDto | null {
    return this.currentSession?.user || null;
  }

  /**
   * Get the active session token, if any
   */
  public getToken(): string | null {
    return this.currentSession?.token || null;
  }

  /**
   * Whether the user is currently logged in
   */
  public isLoggedIn(): boolean {
    return !!(this.currentSession && this.currentSession.token && this.currentSession.user);
  }

  /**
   * Authenticate user with username or email address and password
   */
  public async login(usernameOrEmail: string, password: string): Promise<LoginResponse> {
    const cleanIdentifier = usernameOrEmail.trim();
    if (!cleanIdentifier || !password) {
      return { success: false, message: 'Username/Email and password are required.' };
    }

    try {
      const res = await apiFetch('/security/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        skipAuth: true,
        body: JSON.stringify({
          username: cleanIdentifier,
          password,
          app: 'deckbuilder',
        }),
      });

      const data: LoginResponse = await res.json().catch(() => ({
        success: false,
        message: `HTTP ${res.status} ${res.statusText}`,
      }));

      if (res.ok && data.success && data.user && data.token) {
        const session: AuthSession = {
          user: data.user,
          token: data.token,
          app: data.app || 'deckbuilder',
          hasAppAccess: data.hasAppAccess ?? true,
          savedAt: Date.now(),
        };
        this.saveToStorage(session);
        return data;
      }

      return data;
    } catch (err: any) {
      console.error('[AuthService] Login network error:', err);
      return {
        success: false,
        message: err?.message || 'Network error connecting to authentication service.',
      };
    }
  }

  /**
   * Authenticate or auto-register using a verified Google OAuth ID Token
   */
  public async loginWithGoogle(idToken: string): Promise<LoginResponse> {
    if (!idToken) {
      return { success: false, message: 'Google ID token is required.' };
    }

    try {
      const res = await apiFetch('/security/google-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        skipAuth: true,
        body: JSON.stringify({
          idToken,
          app: 'deckbuilder',
        }),
      });

      const data: LoginResponse = await res.json().catch(() => ({
        success: false,
        message: `HTTP ${res.status} ${res.statusText}`,
      }));

      if (res.ok && data.success && data.user && data.token) {
        const session: AuthSession = {
          user: data.user,
          token: data.token,
          app: data.app || 'deckbuilder',
          hasAppAccess: data.hasAppAccess ?? true,
          savedAt: Date.now(),
        };
        this.saveToStorage(session);
        return data;
      }

      return data;
    } catch (err: any) {
      console.error('[AuthService] Google login network error:', err);
      return {
        success: false,
        message: err?.message || 'Network error connecting to authentication service.',
      };
    }
  }

  /**
   * Register a new user account and log in automatically
   */
  public async register(username: string, password: string, email?: string): Promise<{ success: boolean; message: string; user?: UserDto }> {
    const cleanUsername = username.trim();
    const cleanEmail = email && email.trim() ? email.trim() : undefined;

    if (!cleanUsername) {
      return { success: false, message: 'Username is required.' };
    }
    if (!password || password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    try {
      const res = await apiFetch('/security/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        skipAuth: true,
        body: JSON.stringify({
          username: cleanUsername,
          password,
          email: cleanEmail,
          allowedApps: ['*'],
        }),
      });

      const data = await res.json().catch(() => ({
        success: false,
        message: `HTTP ${res.status} ${res.statusText}`,
      }));

      if (res.ok && data.success) {
        // Automatically log in newly registered user
        const loginRes = await this.login(cleanUsername, password);
        return {
          success: true,
          message: data.message || 'Account registered successfully!',
          user: loginRes.user || data.user,
        };
      }

      return {
        success: false,
        message: data.message || 'Registration failed.',
      };
    } catch (err: any) {
      console.error('[AuthService] Register network error:', err);
      return {
        success: false,
        message: err?.message || 'Network error connecting to registration service.',
      };
    }
  }

  /**
   * Change user password
   */
  public async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword?: string
  ): Promise<ChangePasswordResponse> {
    const user = this.getCurrentUser();
    if (!user) {
      return { success: false, message: 'You must be logged in to change your password.' };
    }

    if (!currentPassword) {
      return { success: false, message: 'Current password is required.' };
    }
    if (!newPassword || newPassword.length < 6) {
      return { success: false, message: 'New password must be at least 6 characters long.' };
    }
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return { success: false, message: 'New password and confirmation do not match.' };
    }

    try {
      const res = await apiFetch('/security/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          userId: user.userId,
          email: user.email,
          currentPassword,
          newPassword,
          confirmPassword: confirmPassword || newPassword,
        }),
      });

      const data: ChangePasswordResponse = await res.json().catch(() => ({
        success: false,
        message: `HTTP ${res.status} ${res.statusText}`,
      }));

      return data;
    } catch (err: any) {
      console.error('[AuthService] Change password error:', err);
      return {
        success: false,
        message: err?.message || 'Failed to update password.',
      };
    }
  }

  /**
   * Validate existing session token against /security/validate
   */
  public async validateSession(): Promise<boolean> {
    if (this.hasValidated) return this.isLoggedIn();
    this.hasValidated = true;

    if (!this.currentSession?.token) return false;

    try {
      const res = await apiFetch('/security/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        skipAuth: true,
        body: JSON.stringify({
          token: this.currentSession.token,
          app: 'deckbuilder',
        }),
      });

      if (!res.ok) {
        console.warn('[AuthService] Session token invalid or expired. Logging out.');
        this.logout();
        return false;
      }

      const data: ValidateResponse = await res.json();
      if (data.isValid && data.hasAppAccess) {
        if (data.user) {
          this.currentSession.user = data.user;
          localStorage.setItem(STORAGE_AUTH_SESSION_KEY, JSON.stringify(this.currentSession));
          this.notifyListeners();
        }
        return true;
      }

      this.logout();
      return false;
    } catch (err) {
      console.warn('[AuthService] Failed to validate session token (network issue):', err);
      // If offline or network glitch, retain existing session locally
      return true;
    }
  }

  /**
   * Log out current user
   */
  public logout(): void {
    this.saveToStorage(null);
  }
}

export const AuthService = new AuthServiceClass();
