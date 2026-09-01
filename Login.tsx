import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, MessageCircle, Instagram, Twitter } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { resolveSiteUrl } from '../lib/siteUrl';
import RealtimeDateBar from './RealtimeDateBar';

const socialLinks = [
  {
    label: 'WhatsApp',
    value: '0625707139',
    icon: MessageCircle,
    href: 'https://wa.me/255625707139',
  },
  {
    label: 'Email',
    value: 'info@skyartnetworks.co',
    icon: Mail,
    href: 'mailto:info@skyartnetworks.co',
  },
  {
    label: 'Instagram',
    value: '@skyartnetworkstz',
    icon: Instagram,
    href: 'https://instagram.com/skyartnetworkstz',
  },
  {
    label: 'X (Twitter)',
    value: '@skyartnetworkstz',
    icon: Twitter,
    href: 'https://x.com/skyartnetworkstz',
  },
];

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetVisible, setResetVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) setError(error.message);
      } else {
        const { error, message } = await signUp(email, password, fullName);
        if (error) {
          setError(error.message);
        } else if (message) {
          setNotice(message);
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = resetEmail.trim().toLowerCase();
    if (!trimmed) {
      setResetStatus({ type: 'error', text: 'Enter the email tied to your account.' });
      return;
    }

    try {
      setResetLoading(true);
      setResetStatus(null);
      const redirectTo = resolveSiteUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
      if (error) {
        throw error;
      }
      setResetStatus({ type: 'success', text: 'Check your inbox for a secure reset link.' });
    } catch (resetError) {
      const message = resetError instanceof Error ? resetError.message : 'Unable to send reset email right now.';
      setResetStatus({ type: 'error', text: message });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 flex flex-col">
      <RealtimeDateBar className="z-40" />
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-12">
        <div className="w-full max-w-md">
        <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl shadow-2xl p-6 sm:p-8 border border-blue-500/20 space-y-6 sm:space-y-8">
          <motion.div
            className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 p-[2px]"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="bg-slate-950/70 rounded-2xl px-4 py-3 sm:px-6 sm:py-4 flex flex-col gap-2"
              initial={{ backgroundPosition: '0% 50%' }}
              animate={{ backgroundPosition: '100% 50%' }}
              transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
            >
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Welcome to</p>
              <div className="flex items-center gap-3">
                <motion.span
                  className="text-xl sm:text-2xl font-bold text-white"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  Skyart Management System
                </motion.span>
                <motion.span
                  className="text-xs font-semibold text-sky-300 bg-sky-900/50 border border-sky-500/40 rounded-full px-3 py-1"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  [SMS]
                </motion.span>
              </div>
              <p className="text-slate-400 text-sm">Secure access for finance, planning, and vouchers in one place.</p>
            </motion.div>
          </motion.div>
          <div className="text-center mb-4 space-y-2">
            <p className="text-xl sm:text-2xl font-semibold text-white">
              {isLogin ? 'Sign in to your workspace' : 'Create your Skyart account'}
            </p>
            <p className="text-slate-400 text-sm">
              {isLogin
                ? 'Enter your credentials below to continue'
                : 'Fill in the details below to get started'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            {!isLogin && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-slate-300 mb-2">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2.5 sm:py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                  required={!isLogin}
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 sm:py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 sm:py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            {notice && (
              <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-3">
                <p className="text-emerald-300 text-sm">{notice}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-2.5 sm:py-3 px-4 rounded-lg transition-colors duration-200"
            >
              {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Sign Up'}
            </button>
          </form>

          <div className="mt-4 text-center space-y-3">
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setNotice('');
              }}
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
            {isLogin && (
              <button
                type="button"
                onClick={() => {
                  setResetVisible((prev) => !prev);
                  setResetStatus(null);
                }}
                className="block w-full text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                {resetVisible ? 'Close password reset' : 'Forgot password?'}
              </button>
            )}
          </div>
          {resetVisible && isLogin && (
            <form onSubmit={handleResetSubmit} className="mt-4 space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-left">
              <p className="text-sm font-semibold text-white">Send a reset link</p>
              <p className="text-xs text-slate-400">
                We will email a secure link so you can update your password.
              </p>
              <label htmlFor="resetEmail" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Account email
              </label>
              <input
                id="resetEmail"
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
                required
              />
              {resetStatus && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm border ${
                    resetStatus.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      : 'bg-red-500/10 text-red-300 border-red-500/30'
                  }`}
                >
                  {resetStatus.text}
                </div>
              )}
              <button
                type="submit"
                disabled={resetLoading}
                className="w-full rounded-lg bg-blue-600 py-2 text-white font-semibold hover:bg-blue-500 transition-colors disabled:opacity-60"
              >
                {resetLoading ? 'Sending…' : 'Email me the link'}
              </button>
            </form>
          )}
        </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm max-w-full overflow-x-auto px-2 scrollbar-none">
          {socialLinks.map(({ label, value, icon: Icon, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/70 px-4 py-2 text-white hover:border-blue-500/60 transition-colors"
            >
              <span className="text-sky-300">
                <Icon size={16} />
              </span>
              <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
              <span className="text-sm font-semibold text-white">{value}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
