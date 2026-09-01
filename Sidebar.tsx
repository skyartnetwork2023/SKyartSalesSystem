import {
  LayoutDashboard,
  FileText,
  ArrowUpDown,
  TrendingDown,
  TrendingUp,
  PieChart,
  BarChart3,
  Wallet,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Camera,
  Globe,
  Loader2,
  Power,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState, ChangeEvent, FormEvent, RefObject } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { updateProfile, uploadAvatar, updateUserRole } from '../lib/profileService';
import { supabase } from '../lib/supabase';
import { buildAccountNoticeUrl, resolveSiteUrl } from '../lib/siteUrl';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: FileText, label: 'Voucher', active: false },
  { icon: ArrowUpDown, label: 'Cash Flows', active: false },
  { icon: TrendingDown, label: 'Opex', active: false },
  { icon: TrendingUp, label: 'Capex', active: false },
  { icon: Wallet, label: 'Investment', active: false },
  { icon: BarChart3, label: 'Visualization', active: false },
  { icon: PieChart, label: 'Loans', active: false },
  { icon: ClipboardList, label: 'Planning', active: false },
  { icon: Camera, label: 'Captive Portal', active: false, route: '/captiveportal' },
  { icon: Globe, label: 'Portal Management', active: false, route: '/portal-management' },
];

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB limit keeps uploads reliable on mobile
const COLLAPSED_STORAGE_KEY = 'skyart.sidebarCollapsed';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FeedbackMessage = { type: 'success' | 'error'; text: string };

const getInitialCollapsedState = () => {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
};

interface SidebarProps {
  onSectionChange: (section: string) => void;
  activeSection: string;
}

export default function Sidebar({ onSectionChange, activeSection }: SidebarProps) {
  const { user, signOut, authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    profile,
    setProfileState,
    profileLoading,
    refreshProfile,
    isSupervisor,
    scopeUserId,
    setScopeUserId,
    profiles,
    profilesLoading,
    scopedProfile,
    refreshProfiles,
  } = useUserScope();
  const [collapsed, setCollapsed] = useState<boolean>(() => getInitialCollapsedState());
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<FeedbackMessage | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [roleStatus, setRoleStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [roleUpdating, setRoleUpdating] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailStatus, setEmailStatus] = useState<FeedbackMessage | null>(null);
  const [emailUpdating, setEmailUpdating] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<FeedbackMessage | null>(null);
  const [passwordSending, setPasswordSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (avatarPreview && avatarPreview.startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  useEffect(() => {
    setDisplayName(profile?.full_name ?? user?.email?.split('@')[0] ?? '');
    setAvatarPreview(profile?.avatar_url ?? null);
  }, [profile, user?.email]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? 'true' : 'false');
      }
      return next;
    });
  };

  const resetAccountActions = () => {
    setStatusMessage(null);
    setEmailStatus(null);
    setPasswordStatus(null);
    setRoleStatus(null);
    setEmailInput('');
  };

  const handleNameChange = (value: string) => {
    setDisplayName(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setNameError('Display name is required.');
    } else if (trimmed.length < 2) {
      setNameError('Display name must be at least 2 characters.');
    } else {
      setNameError(null);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_BYTES) {
      setStatusMessage({ type: 'error', text: 'Avatar must be 5MB or less.' });
      return;
    }
    if (avatarPreview && avatarPreview.startsWith('blob:')) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setStatusMessage(null);
  };

  const openProfileModal = () => {
    resetAccountActions();
    setAvatarFile(null);
    setAvatarPreview(profile?.avatar_url ?? null);
    handleNameChange(profile?.full_name ?? user?.email?.split('@')[0] ?? '');
    setProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setProfileModalOpen(false);
    setAvatarFile(null);
    setAvatarPreview(profile?.avatar_url ?? null);
    setStatusMessage(null);
    setNameError(null);
    setDisplayName(profile?.full_name ?? user?.email?.split('@')[0] ?? '');
    resetAccountActions();
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id || nameError) {
      return;
    }

    try {
      setSavingProfile(true);
      setStatusMessage(null);

      let avatarUrl = profile?.avatar_url ?? null;

      if (avatarFile) {
        const { publicUrl } = await uploadAvatar(avatarFile, user.id);
        avatarUrl = publicUrl;
      }

      const updated = await updateProfile(user.id, {
        full_name: displayName.trim(),
        avatar_url: avatarUrl,
      });

      const metadataPayload: Record<string, string | null> = {
        full_name: updated.full_name,
        avatar_url: updated.avatar_url,
      };
      const { error: metadataError } = await supabase.auth.updateUser({ data: metadataPayload });
      if (metadataError) {
        console.warn('Failed to sync auth metadata after profile update', metadataError);
      }

      setProfileState(updated);
      await refreshProfile();
      setAvatarFile(null);
      setAvatarPreview(updated.avatar_url ?? null);
      setDisplayName(updated.full_name ?? updated.email.split('@')[0] ?? '');
      setStatusMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update profile.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setSavingProfile(false);
    }
  };

  const emailFallback = profile?.email ?? user?.email ?? '';
  const resolvedDisplayName = profile?.full_name ?? emailFallback.split('@')[0] ?? 'User';
  const initials = (profile?.full_name ?? emailFallback).charAt(0).toUpperCase() || 'U';
  const cardAvatar = profile?.avatar_url ?? null;
  const profileStatus = profile?.full_name && profile?.avatar_url
    ? {
        label: 'Profile complete',
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
        dotClass: 'bg-emerald-400',
      }
    : {
        label: 'Complete your profile',
        badgeClass: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
        dotClass: 'bg-amber-400',
      };
  const triggerFileDialog = () => fileInputRef.current?.click();
  const supervisorOptions = profiles.map((item) => ({
    id: item.id,
    label: (item.full_name && item.full_name.trim()) || item.email,
  }));
  const viewingLabel = scopedProfile
    ? (scopedProfile.full_name && scopedProfile.full_name.trim()) || scopedProfile.email
    : resolvedDisplayName;
  const managedProfile = isSupervisor ? profiles.find((item) => item.id === scopeUserId) ?? null : null;
  const canEditRole = Boolean(isSupervisor && managedProfile && managedProfile.id !== user?.id);

  useEffect(() => {
    setRoleStatus(null);
  }, [scopeUserId]);

  const handleRoleToggle = async () => {
    if (!managedProfile || !canEditRole) return;
    const nextRole = managedProfile.role === 'supervisor' ? 'user' : 'supervisor';
    try {
      setRoleUpdating(true);
      setRoleStatus(null);
      await updateUserRole(managedProfile.id, nextRole);
      await refreshProfiles();
      if (managedProfile.id === profile?.id) {
        await refreshProfile();
      }
      setRoleStatus({
        type: 'success',
        text: nextRole === 'supervisor' ? 'Granted supervisor access.' : 'Revoked supervisor access.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update role.';
      setRoleStatus({ type: 'error', text: message });
    } finally {
      setRoleUpdating(false);
    }
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user?.id) return;

    const nextEmail = emailInput.trim().toLowerCase();
    if (!nextEmail) {
      setEmailStatus({ type: 'error', text: 'Email is required.' });
      return;
    }
    if (nextEmail === emailFallback) {
      setEmailStatus({ type: 'error', text: 'Enter a different email address.' });
      return;
    }
    if (!EMAIL_PATTERN.test(nextEmail)) {
      setEmailStatus({ type: 'error', text: 'Enter a valid email address.' });
      return;
    }

    try {
      setEmailUpdating(true);
      setEmailStatus(null);
      const emailRedirectTo = buildAccountNoticeUrl('email-change-success');
      const { error } = await supabase.auth.updateUser(
        { email: nextEmail },
        emailRedirectTo ? { emailRedirectTo } : undefined
      );
      if (error) throw error;
      setEmailStatus({ type: 'success', text: 'Check the new inbox to confirm this change.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update email at this time.';
      setEmailStatus({ type: 'error', text: message });
    } finally {
      setEmailUpdating(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!emailFallback) {
      setPasswordStatus({ type: 'error', text: 'No account email found for this profile.' });
      return;
    }

    try {
      setPasswordSending(true);
      setPasswordStatus(null);
      const redirectTo = resolveSiteUrl();
      const { error } = await supabase.auth.resetPasswordForEmail(emailFallback, { redirectTo });
      if (error) throw error;
      setPasswordStatus({ type: 'success', text: 'Password reset email sent.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send password reset email.';
      setPasswordStatus({ type: 'error', text: message });
    } finally {
      setPasswordSending(false);
    }
  };

  const handleEmailInputChange = (value: string) => {
    setEmailInput(value);
    if (emailStatus) {
      setEmailStatus(null);
    }
  };

  // Responsive: show sidebar on md+, bottom nav on mobile
  return (
    <>
      {/* Desktop sidebar */}
      <div
        className={`hidden md:flex ${collapsed ? 'w-20' : 'w-64'} bg-slate-900 h-screen flex-col border-r border-slate-800 transition-all duration-300 flex-shrink-0 overflow-x-hidden`}
      >
        <div className="p-6 border-b border-slate-800 flex items-center justify-between gap-3">
          {!collapsed && (
            <h1 className="text-lg font-semibold leading-tight text-white">
              Skyart Management System
              <span className="block text-sm text-slate-400">[SMS]</span>
            </h1>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className={`flex items-center gap-2 rounded-full border text-xs font-semibold tracking-wide transition-all duration-200 ${
                theme === 'dark'
                  ? 'bg-slate-800/80 border-slate-700 text-slate-100 hover:bg-slate-800'
                  : 'bg-white/95 border-slate-200 text-slate-700 hover:bg-slate-100'
              } ${collapsed ? 'px-2 py-1.5 justify-center' : 'px-3 py-1.5'}`}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                  theme === 'dark'
                    ? 'bg-amber-400/10 text-amber-300'
                    : 'bg-slate-900/5 text-slate-900'
                }`}
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </span>
              {!collapsed && <span>{theme === 'dark' ? 'Dark' : 'Light'} mode</span>}
            </button>
            <button
              onClick={toggleCollapsed}
              className="p-1 hover:bg-slate-800 rounded-lg transition-colors"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={!collapsed}
            >
              {collapsed ? (
                <ChevronRight size={20} className="text-slate-400" />
              ) : (
                <ChevronLeft size={20} className="text-slate-400" />
              )}
            </button>
          </div>
        </div>
        {isSupervisor && !collapsed && (
          <div className="px-4 py-4 border-t border-b border-slate-800 bg-slate-900/60 text-slate-200 text-sm">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs uppercase tracking-wide text-slate-400">Viewing user</span>
              {profilesLoading && <span className="text-[10px] text-slate-500">Loading…</span>}
            </div>
            <select
              value={scopeUserId ?? ''}
              onChange={(event) => setScopeUserId(event.target.value || null)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {supervisorOptions.length === 0 && (
                <option value="" disabled>
                  {profilesLoading ? 'Loading users…' : 'No profiles found'}
                </option>
              )}
              {supervisorOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-amber-300">Supervisor mode is read-only.</p>
            {managedProfile && (
              <div className="mt-3 text-xs text-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span>Role:</span>
                  <span className="font-semibold text-white capitalize">{managedProfile.role ?? 'user'}</span>
                </div>
                {canEditRole && (
                  <button
                    onClick={handleRoleToggle}
                    disabled={roleUpdating}
                    className="w-full text-xs font-semibold px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-60"
                  >
                    {roleUpdating
                      ? 'Updating…'
                      : managedProfile.role === 'supervisor'
                        ? 'Revoke supervisor access'
                        : 'Make supervisor'}
                  </button>
                )}
                {roleStatus && (
                  <p className={`text-xs ${roleStatus.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {roleStatus.text}
                  </p>
                )}
                {!canEditRole && managedProfile?.id === user?.id && (
                  <p className="text-[11px] text-slate-500">You cannot change your own role from here.</p>
                )}
              </div>
            )}
          </div>
        )}
        <nav className="flex-1 p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.label;
            if ((item.label === 'Captive Portal' || item.label === 'Portal Management') && !isSupervisor) {
              return null;
            }
            return (
              <button
                key={item.label}
                onClick={() => onSectionChange(item.label)}
                onDoubleClick={toggleCollapsed}
                aria-current={isActive ? 'page' : undefined}
                className={`relative group w-full rounded-2xl overflow-hidden transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                  collapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'px-4 py-3 flex items-center gap-4'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <span
                  className={`pointer-events-none absolute inset-0 rounded-2xl transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-white/95 via-blue-50/60 to-blue-100/50 shadow-[0_12px_30px_rgba(37,99,235,0.25)]'
                      : 'bg-transparent group-hover:bg-white/5'
                  }`}
                  aria-hidden
                />
                <span
                  className={`pointer-events-none absolute inset-y-1 left-1 w-1 rounded-full transition-opacity duration-300 ${
                    isActive
                      ? 'opacity-100 bg-gradient-to-b from-blue-500 to-blue-300'
                      : 'opacity-0 group-hover:opacity-50 bg-gradient-to-b from-white/40 to-white/5'
                  }`}
                  aria-hidden
                />
                <span
                  className={`relative inline-flex items-center justify-center rounded-xl border text-base transition-all duration-300 ${
                    collapsed ? 'w-12 h-12' : 'w-11 h-11'
                  } ${
                    isActive
                      ? 'bg-blue-500/10 border-blue-200 text-blue-600'
                      : 'bg-slate-800/80 border-slate-800 text-slate-300 group-hover:border-slate-700'
                  }`}
                >
                  <Icon size={20} />
                </span>
                {!collapsed && (
                  <span
                    className={`relative font-semibold tracking-wide text-sm transition-colors duration-200 ${
                      isActive ? 'text-blue-700' : 'text-slate-300 group-hover:text-white'
                    }`}
                  >
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800 rounded-lg p-4 mb-3 transition-all duration-300">
            {profileLoading ? (
              <div className={`w-full ${collapsed ? 'flex flex-col items-center gap-3' : 'flex items-center gap-4'}`}>
                <div className="w-12 h-12 rounded-full bg-slate-700 animate-pulse" />
                {!collapsed && (
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-slate-700 rounded" />
                    <div className="h-3 bg-slate-700 rounded w-3/4" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={authLoading}
                  title="Logout"
                  className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-slate-500 hover:border-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
                >
                  <Power size={18} />
                </button>
              </div>
            ) : (
              <div
                className={`flex ${
                  collapsed ? 'flex-col items-center gap-3' : 'items-center gap-4'
                }`}
              >
                <button
                  type="button"
                  onClick={openProfileModal}
                  className="group relative"
                  aria-label="Open profile settings"
                >
                  {cardAvatar ? (
                    <img
                      src={cardAvatar}
                      alt="Profile avatar"
                      className="w-12 h-12 rounded-full object-cover border border-slate-700"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-base font-semibold">
                      {initials}
                    </div>
                  )}
                  <span className="absolute inset-0 rounded-full bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera size={18} className="text-white" />
                  </span>
                </button>
                {!collapsed && (
                  <button
                    type="button"
                    onClick={openProfileModal}
                    className="flex-1 text-left"
                  >
                    <p className="text-white font-semibold text-sm truncate">{resolvedDisplayName}</p>
                    <p className="text-slate-400 text-xs truncate">{emailFallback}</p>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={authLoading}
                  title="Logout"
                  className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 text-slate-300 hover:border-red-500 hover:text-red-400 transition-colors disabled:opacity-50"
                  style={{ minWidth: 40, minHeight: 40, overflow: 'visible', padding: '2px' }}
                >
                  <Power size={18} />
                </button>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Mobile bottom nav: horizontally scrollable to show all */}
      <nav className="fixed md:hidden bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-800 overflow-x-auto">
        <div className="flex min-w-max justify-start items-stretch py-1 px-1 gap-1">
          {isSupervisor && (
            <div className="flex flex-col min-w-[180px] px-2 py-1 text-slate-200 text-xs">
              <label htmlFor="mobile-user-scope" className="text-[10px] uppercase tracking-wide text-slate-400">
                Viewing
              </label>
              <select
                id="mobile-user-scope"
                value={scopeUserId ?? ''}
                onChange={(event) => setScopeUserId(event.target.value || null)}
                className="mt-0.5 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {supervisorOptions.length === 0 && (
                  <option value="" disabled>
                    {profilesLoading ? 'Loading…' : 'No profiles'}
                  </option>
                )}
                {supervisorOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="flex flex-col items-center px-2 py-1 min-w-[60px] text-slate-200 hover:text-white"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={22} /> : <Moon size={22} />}
            <span className="text-xs mt-0.5">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
          <button
            onClick={openProfileModal}
            className="flex flex-col items-center px-2 py-1 min-w-[60px] text-slate-200 hover:text-white"
            title="Profile"
          >
            {cardAvatar ? (
              <img src={cardAvatar} alt="Profile avatar" className="w-6 h-6 rounded-full border border-slate-700 object-cover" />
            ) : (
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
                {initials}
              </span>
            )}
            <span className="text-xs mt-0.5">Profile</span>
          </button>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.label;
            if ((item.label === 'Captive Portal' || item.label === 'Portal Management') && !isSupervisor) {
              return null;
            }
            return (
              <button
                key={item.label}
                onClick={() => onSectionChange(item.label)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative group flex flex-col items-center justify-center min-w-[70px] rounded-2xl px-3 py-2 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
                  isActive
                    ? 'text-white shadow-lg shadow-blue-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
                title={item.label}
              >
                <span
                  className={`pointer-events-none absolute inset-0 rounded-2xl transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-b from-blue-500 via-blue-500/80 to-blue-400'
                      : 'bg-slate-800/60'
                  }`}
                  aria-hidden
                />
                <span
                  className={`pointer-events-none absolute top-1 left-1 right-1 h-0.5 rounded-full transition-opacity duration-300 ${
                    isActive
                      ? 'opacity-100 bg-white'
                      : 'opacity-0 group-hover:opacity-40 bg-white/70'
                  }`}
                  aria-hidden
                />
                <span className="relative flex flex-col items-center gap-0.5">
                  <span
                    className={`inline-flex items-center justify-center rounded-xl border text-sm transition-all duration-300 w-10 h-10 ${
                      isActive ? 'border-white/70 bg-white/10' : 'border-slate-700 bg-slate-900/40'
                    }`}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="text-[11px] font-semibold tracking-wide">{item.label}</span>
                </span>
              </button>
            );
          })}
          <button
            onClick={handleSignOut}
            disabled={authLoading}
            className="flex flex-col items-center px-2 py-1 min-w-[60px] text-slate-200 hover:text-white disabled:opacity-50"
            title="Logout"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full border border-slate-700 bg-slate-900/60">
              <Power size={18} />
            </span>
            <span className="text-xs mt-0.5">Logout</span>
          </button>
        </div>
      </nav>

      <ProfileModal
        isOpen={profileModalOpen}
        onClose={closeProfileModal}
        displayName={displayName}
        onNameChange={handleNameChange}
        nameError={nameError}
        avatarPreview={avatarPreview}
        onFileTrigger={triggerFileDialog}
        onFileChange={(event) => {
          handleFileChange(event);
          // Reset the input value to allow re-uploading the same file if needed.
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        onSubmit={handleProfileSubmit}
        saving={savingProfile}
        statusMessage={statusMessage}
        fileInputRef={fileInputRef}
        profileStatus={profileStatus}
        initials={initials}
        emailInput={emailInput}
        onEmailInputChange={handleEmailInputChange}
        onEmailSubmit={handleEmailSubmit}
        emailStatus={emailStatus}
        emailUpdating={emailUpdating}
        accountEmail={emailFallback}
        onPasswordReset={handlePasswordReset}
        passwordStatus={passwordStatus}
        passwordSending={passwordSending}
      />
    </>
  );
}

function ProfileModal({
  isOpen,
  onClose,
  displayName,
  onNameChange,
  nameError,
  avatarPreview,
  onFileTrigger,
  onFileChange,
  onSubmit,
  saving,
  statusMessage,
  fileInputRef,
  profileStatus,
  initials,
  emailInput,
  onEmailInputChange,
  onEmailSubmit,
  emailStatus,
  emailUpdating,
  accountEmail,
  onPasswordReset,
  passwordStatus,
  passwordSending,
}: {
  isOpen: boolean;
  onClose: () => void;
  displayName: string;
  onNameChange: (value: string) => void;
  nameError: string | null;
  avatarPreview: string | null;
  onFileTrigger: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  statusMessage: FeedbackMessage | null;
  fileInputRef: RefObject<HTMLInputElement>;
  profileStatus: { label: string; badgeClass: string; dotClass: string };
  initials: string;
  emailInput: string;
  onEmailInputChange: (value: string) => void;
  onEmailSubmit: (event: FormEvent<HTMLFormElement>) => void;
  emailStatus: FeedbackMessage | null;
  emailUpdating: boolean;
  accountEmail: string;
  onPasswordReset: () => void;
  passwordStatus: FeedbackMessage | null;
  passwordSending: boolean;
}) {
  const trimmedEmailInput = emailInput.trim();
  const disableEmailSubmit =
    emailUpdating ||
    trimmedEmailInput.length === 0 ||
    (accountEmail && trimmedEmailInput.toLowerCase() === accountEmail.toLowerCase());

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-slate-950/40 p-6"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Profile settings</h2>
                <p className="text-sm text-slate-400">Upload an avatar and update your display name.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form className="mt-6 space-y-6" onSubmit={onSubmit}>
              <div className="flex flex-col items-center gap-3">
                <div className="relative w-24 h-24">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar preview"
                      className="w-24 h-24 rounded-full object-cover border border-slate-700"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 border border-blue-500/40 flex items-center justify-center text-white text-3xl font-semibold">
                      {initials}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={onFileTrigger}
                    className="absolute bottom-2 right-2 rounded-full bg-blue-600 text-white p-2 shadow-lg shadow-blue-600/40 hover:bg-blue-500 transition-colors"
                  >
                    <Camera size={16} />
                  </button>
                  <span
                    className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-slate-900 ${profileStatus.dotClass}`}
                    aria-hidden
                  />
                </div>
                <p className="text-xs text-slate-500">PNG or JPG up to 2MB.</p>
              </div>

              <div className="flex justify-center">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${profileStatus.badgeClass}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${profileStatus.dotClass}`} />
                  {profileStatus.label}
                </span>
              </div>

              <div>
                <label htmlFor="displayName" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Display name
                </label>
                <input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => onNameChange(event.target.value)}
                  className={`mt-2 w-full rounded-lg bg-slate-800 border px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow ${
                    nameError ? 'border-red-500 focus:ring-red-500' : 'border-slate-700'
                  }`}
                  placeholder="Your display name"
                  maxLength={60}
                />
                {nameError && <p className="mt-2 text-xs text-red-400">{nameError}</p>}
              </div>

              {statusMessage && (
                <div
                  className={`rounded-lg px-3 py-2 text-sm ${
                    statusMessage.type === 'success'
                      ? 'bg-green-600/10 text-green-400 border border-green-500/20'
                      : 'bg-red-600/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {statusMessage.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-2 disabled:opacity-60"
                  disabled={saving || !!nameError}
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  Save changes
                </button>
              </div>

              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={fileInputRef}
                onChange={onFileChange}
              />
            </form>

            <div className="mt-8 border-t border-slate-800 pt-6 space-y-6">
              <div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Account email</h3>
                  <p className="text-xs text-slate-400">Send a confirmation link to move your login email.</p>
                </div>
                <form className="mt-4 space-y-3" onSubmit={onEmailSubmit}>
                  <label htmlFor="accountEmail" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    New email address
                  </label>
                  <input
                    id="accountEmail"
                    type="email"
                    value={emailInput}
                    onChange={(event) => onEmailInputChange(event.target.value)}
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="you@email.com"
                  />
                  <p className="text-[11px] text-slate-500">
                    Current email: <span className="text-slate-300">{accountEmail || 'Not available'}</span>
                  </p>
                  {emailStatus && (
                    <div
                      className={`rounded-lg px-3 py-2 text-xs border ${
                        emailStatus.type === 'success'
                          ? 'bg-green-600/10 text-green-400 border-green-500/20'
                          : 'bg-red-600/10 text-red-400 border-red-500/20'
                      }`}
                    >
                      {emailStatus.text}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-2 disabled:opacity-60"
                      disabled={disableEmailSubmit}
                    >
                      {emailUpdating && <Loader2 size={16} className="animate-spin" />}
                      Send confirmation
                    </button>
                  </div>
                </form>
              </div>

              <div className="pt-6 border-t border-slate-800">
                <h3 className="text-sm font-semibold text-white">Reset password</h3>
                <p className="text-xs text-slate-400">We will email a secure link to change your password.</p>
                {passwordStatus && (
                  <div
                    className={`mt-4 rounded-lg px-3 py-2 text-xs border ${
                      passwordStatus.type === 'success'
                        ? 'bg-green-600/10 text-green-400 border-green-500/20'
                        : 'bg-red-600/10 text-red-400 border-red-500/20'
                    }`}
                  >
                    {passwordStatus.text}
                  </div>
                )}
                <button
                  type="button"
                  onClick={onPasswordReset}
                  className="mt-4 w-full px-4 py-2 rounded-lg border border-slate-700 text-slate-100 hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                  disabled={passwordSending}
                >
                  {passwordSending && <Loader2 size={16} className="animate-spin" />}
                  Email me a reset link
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
