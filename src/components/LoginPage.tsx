import React, { useState } from 'react';
import { 
  LogIn, 
  UserPlus, 
  Lock, 
  User as UserIcon, 
  Mail, 
  KeyRound, 
  AlertCircle, 
  CheckCircle2, 
  Loader2,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { AuthService, UserDto } from '../services/authService';
import { GoogleSignInButton } from './GoogleSignInButton';

interface LoginPageProps {
  onLoginSuccess: (user: UserDto) => void;
  onNavigateHome: () => void;
  reason?: string;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onNavigateHome,
  reason,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Login form
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register form
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

  // States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!usernameOrEmail.trim() || !password) {
      setErrorMessage('Please enter your username or email address and password.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await AuthService.login(usernameOrEmail.trim(), password);
      if (res.success && res.user) {
        setSuccessMessage('Welcome back! Loading your decks and binders...');
        setTimeout(() => {
          onLoginSuccess(res.user!);
        }, 600);
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
    setErrorMessage(null);
    setSuccessMessage(null);

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
        setSuccessMessage('Account created successfully! Loading your profile...');
        setTimeout(() => {
          onLoginSuccess(res.user!);
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

  return (
    <div className="min-h-[85vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center bg-gradient-to-b from-indigo-950/40 to-transparent">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-violet-600 via-fuchsia-500 to-fuchsia-400 p-0.5 shadow-xl shadow-fuchsia-500/20 mb-4">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-fuchsia-400" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-white font-serif tracking-wide">
            {tab === 'login' ? 'Sign In to ScrySync' : 'Create Your Account'}
          </h2>
          <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">
            {tab === 'login' 
              ? 'Enter your username or email address to access your cloud decks and collection.'
              : 'Create an account to save, sync, and track your MTG decks and binders across any device.'
            }
          </p>
        </div>

        {/* Reason banner if triggered by save */}
        {reason && (
          <div className="mx-6 mb-4 px-4 py-3 bg-fuchsia-950/50 border border-fuchsia-800/40 rounded-xl flex items-center gap-3 text-xs text-fuchsia-200">
            <AlertCircle className="w-4 h-4 text-fuchsia-400 flex-shrink-0" />
            <span>{reason}</span>
          </div>
        )}

        {/* Tab Selector */}
        <div className="grid grid-cols-2 p-1.5 mx-6 mb-6 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => { setTab('login'); setErrorMessage(null); setSuccessMessage(null); }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === 'login'
                ? 'bg-slate-800 text-fuchsia-400 shadow-sm border border-slate-700/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setErrorMessage(null); setSuccessMessage(null); }}
            className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === 'register'
                ? 'bg-slate-800 text-fuchsia-400 shadow-sm border border-slate-700/80'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register</span>
          </button>
        </div>

        {/* Alert Notifications */}
        <div className="px-6">
          {errorMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-red-950/50 border border-red-800/50 text-red-300 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
        </div>

        {/* Google One-Click Login & Auto-Register */}
        <div className="px-6 mb-3">
          <GoogleSignInButton
            text={tab === 'register' ? 'signup_with' : 'signin_with'}
            onSuccess={(user) => {
              setSuccessMessage(`Welcome, ${user.username}! Loading your decks...`);
              setTimeout(() => {
                onLoginSuccess(user);
              }, 500);
            }}
            onError={(err) => setErrorMessage(err)}
          />
          <div className="relative my-4 flex items-center justify-center">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider absolute">
              or continue with password
            </span>
          </div>
        </div>

        {/* Form Body */}
        {tab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="px-6 pb-8 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Username or Email Address
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
              className="w-full py-3 px-4 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-fuchsia-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
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
        ) : (
          <form onSubmit={handleRegisterSubmit} className="px-6 pb-8 space-y-4">
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
                  placeholder="Choose your username"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
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
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
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
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
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
                  placeholder="Repeat your password"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 focus:border-fuchsia-500 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-fuchsia-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-fuchsia-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Register</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Guest Mode Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">Want to explore first?</span>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300 transition-colors cursor-pointer"
          >
            <span>Continue as Guest</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
