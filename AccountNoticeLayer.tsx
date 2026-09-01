import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, Loader2, Lock, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type BannerPalette = {
  wrapper: string;
  border: string;
  icon: JSX.Element;
};

const paletteByType: Record<'success' | 'error' | 'info', BannerPalette> = {
  success: {
    wrapper: 'bg-emerald-500/15 text-emerald-200',
    border: 'border-emerald-400/40',
    icon: <CheckCircle2 size={18} className="text-emerald-300" />,
  },
  error: {
    wrapper: 'bg-red-500/15 text-red-200',
    border: 'border-red-400/40',
    icon: <AlertCircle size={18} className="text-red-300" />,
  },
  info: {
    wrapper: 'bg-sky-500/15 text-sky-200',
    border: 'border-sky-400/40',
    icon: <Info size={18} className="text-sky-300" />,
  },
};

export default function AccountNoticeLayer() {
  return (
    <>
      <AccountNoticeBanner />
      <PasswordResetDialog />
    </>
  );
}

function AccountNoticeBanner() {
  const { accountNotice, dismissAccountNotice } = useAuth();

  return (
    <AnimatePresence>
      {accountNotice && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="fixed top-4 left-1/2 z-[120] -translate-x-1/2 px-4"
        >
          <div
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl shadow-slate-950/40 backdrop-blur ${
              paletteByType[accountNotice.type].wrapper
            } ${paletteByType[accountNotice.type].border}`}
          >
            {paletteByType[accountNotice.type].icon}
            <p className="text-sm font-medium tracking-wide">{accountNotice.text}</p>
            <button
              type="button"
              onClick={dismissAccountNotice}
              className="ml-2 rounded-full p-1 text-white/70 hover:text-white transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PasswordResetDialog() {
  const {
    passwordRecoveryActive,
    exitPasswordRecovery,
    pushAccountNotice,
    signOut,
  } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!passwordRecoveryActive) {
    return null;
  }

  const handleClose = async () => {
    setPassword('');
    setConfirmPassword('');
    setError(null);
    exitPasswordRecovery();
    await signOut();
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.trim().length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        throw updateError;
      }
      pushAccountNotice({ type: 'success', text: 'Password updated successfully.' });
      setPassword('');
      setConfirmPassword('');
      exitPasswordRecovery();
    } catch (updateErr) {
      const message = updateErr instanceof Error ? updateErr.message : 'Unable to update password. Try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {passwordRecoveryActive && (
        <motion.div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/80 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.form
            onSubmit={handleSubmit}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-white shadow-2xl shadow-slate-950/40"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-slate-400">Secure action required</p>
                <h2 className="mt-1 text-xl font-semibold">Choose a new password</h2>
                <p className="mt-2 text-sm text-slate-400">
                  You followed the email link successfully. Update your password below to finish the reset.
                </p>
              </div>
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 p-2 text-emerald-300">
                <ShieldCheck size={20} />
              </span>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block text-sm font-medium text-slate-300" htmlFor="newPassword">
                New password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 pr-10 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter a strong password"
                  minLength={8}
                  required
                />
                <Lock size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>

              <label className="block text-sm font-medium text-slate-300" htmlFor="confirmPassword">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Re-enter the password"
                minLength={8}
                required
              />
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                Update password
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
