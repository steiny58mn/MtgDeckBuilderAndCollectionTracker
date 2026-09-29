import { useEscapeKey } from '../hooks/useEscapeKey';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
﻿import React, { useState } from 'react';
import { 
  X, 
  LogIn, 
  UserPlus, 
  Lock, 
  User as UserIcon, 
  Mail, 
  KeyRound, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ShieldCheck
} from 'lucide-react';
import { AuthService, UserDto } from '../services/authService';
import { GoogleSignInButton } from './GoogleSignInButton';

export type AuthMode = 'login' | 'register' | 'change-password';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  reason?: string;
  onSuccess?: (user: UserDto) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login',
  reason,
  onSuccess,
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form states
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Status & loading
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useBodyScrollLock(isOpen);
  useEscapeKey(isOpen, onClose);

  if (!isOpen) return null;

  const resetMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSwitchMode = (newMode: AuthMode) => {
    resetMessages();
    setMode(newMode);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!usernameOrEmail.trim() || !password) {
      setErrorMessage('Please enter your username/email and password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await AuthService.login(usernameOrEmail.trim(), password);
      if (res.success && res.user) {
        setSuccessMessage('Login successful!');
        setTimeout(() => {
          onSuccess?.(res.user!);
          onClose();
        }, 500);
      } else {
        setErrorMessage(res.message || 'Invalid username or password.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to connect to authentication service.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    const cleanUsername = registerUsername.trim();
    const cleanEmail = registerEmail.trim();

    if (!cleanUsername) {
      setErrorMessage('Please enter a username.');
      return;
    }
    if (cleanUsername.length < 3) {
      setErrorMessage('Username must be at least 3 characters.');
      return;
    }
    if (!registerPassword || registerPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (registerPassword !== registerConfirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await AuthService.register(cleanUsername, registerPassword, cleanEmail || undefined);
      if (res.success && res.user) {
        setSuccessMessage('Account created successfully! Logging you in...');
        setTimeout(() => {
          onSuccess?.(res.user!);
          onClose();
        }, 600);
      } else {
        setErrorMessage(res.message || 'Registration failed.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to register account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();

    if (!currentPassword) {
      setErrorMessage('Current password is required.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('New passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await AuthService.changePassword(currentPassword, newPassword, confirmNewPassword);
      if (res.success) {
        setSuccessMessage('Password changed successfully!');
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setErrorMessage(res.message || 'Failed to change password.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error occurred while updating password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-fuchsia-950 border border-fuchsia-800/40 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-fuchsia-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {mode === 'login' && 'Sign In'}
                {mode === 'register' && 'Create Account'}
                {mode === 'change-password' && 'Change Password'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {mode === 'login' && 'Access your cloud decks & collection'}
                {mode === 'register' && 'Join ScrySync to sync your decks anywhere'}
                {mode === 'change-password' && 'Update your account security credentials'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reason Banner (e.g. Save Prompt) */}
        {reason && (
          <div className="px-6 py-2.5 bg-fuchsia-950/40 border-b border-fuchsia-800/30 flex items-center gap-2.5 text-xs text-fuchsia-200">
            <AlertCircle className="w-4 h-4 text-fuchsia-400 flex-shrink-0" />
            <span>{reason}</span>
          </div>
        )}

        {/* Mode Navigation Tabs (Login vs Register) */}
        {mode !== 'change-password' && (
          <div className="grid grid-cols-2 p-1.5 m-6 mb-4 bg-slate-950/70 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => handleSwitchMode('login')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                mode === 'login'
                  ? 'bg-slate-800 text-fuchsia-400 shadow-sm border border-slate-700/80'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchMode('register')}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
                mode === 'register'
                  ? 'bg-slate-800 text-fuchsia-400 shadow-sm border border-slate-700/80'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create Account</span>
            </button>
          </div>
        )}

        {/* Alert Notifications */}
        <div className="px-6">
          {errorMessage && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Google One-Click Login & Auto-Register */}
        {mode !== 'change-password' && (
          <div className="px-6 mb-3">
            <GoogleSignInButton
              text={mode === 'register' ? 'signup_with' : 'signin_with'}
              onSuccess={(user) => {
                setSuccessMessage(`Welcome, ${user.username}!`);
                setTimeout(() => {
                  onSuccess?.(user);
                  onClose();
                }, 500);
              }}
              onError={(err) => setErrorMessage(err)}
            />
            <div className="relative my-4 flex items-center justify-center">
              <div className="border-t border-slate-800 w-full" />
              <span className="bg-slate-900 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider absolute">
                or with password
              </span>
            </div>
          </div>
        )}

        {/* 1. SIGN IN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="px-6 pb-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Username or Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  autoFocus
                  required
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="e.g. jace or jace@beleren.com"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-fuchsia-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* 2. REGISTER / CREATE ACCOUNT FORM */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="px-6 pb-6 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Username <span className="text-fuchsia-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  placeholder="Choose a username"
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password <span className="text-fuchsia-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Confirm Password <span className="text-fuchsia-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-fuchsia-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* 3. CHANGE PASSWORD FORM */}
        {mode === 'change-password' && (
          <form onSubmit={handleChangePasswordSubmit} className="px-6 pb-6 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Current Password <span className="text-fuchsia-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                New Password <span className="text-fuchsia-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Confirm New Password <span className="text-fuchsia-400">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-fuchsia-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
