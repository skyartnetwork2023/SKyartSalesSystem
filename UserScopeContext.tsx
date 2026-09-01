import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getProfile, listProfiles, ProfileData, ProfileSummary } from '../lib/profileService';

interface UserScopeContextValue {
  profile: ProfileData | null;
  setProfileState: (profile: ProfileData | null) => void;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  isSupervisor: boolean;
  readOnly: boolean;
  scopeUserId: string | null;
  setScopeUserId: (userId: string | null) => void;
  viewingOwnData: boolean;
  profiles: ProfileSummary[];
  profilesLoading: boolean;
  scopedProfile: ProfileSummary | null;
  refreshProfiles: () => Promise<void>;
}

const UserScopeContext = createContext<UserScopeContextValue | undefined>(undefined);

export function UserScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [scopeUserId, setScopeUserIdInternal] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  const refreshProfile = async () => {
    if (!user?.id) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const data = await getProfile(user.id);
      setProfile(data);
    } catch (error) {
      console.error('Failed to load profile', error);
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) {
      setProfile(null);
      setProfileLoading(false);
      setScopeUserIdInternal(null);
      return;
    }
    refreshProfile();
    setScopeUserIdInternal(user.id);
  }, [user?.id]);

  const isSupervisor = (profile?.role ?? 'user') === 'supervisor';

  const refreshProfiles = useCallback(async () => {
    if (!isSupervisor) {
      setProfiles([]);
      setProfilesLoading(false);
      return;
    }
    setProfilesLoading(true);
    try {
      const list = await listProfiles();
      setProfiles(list);
    } catch (error) {
      console.error('Failed to list profiles', error);
      setProfiles([]);
    } finally {
      setProfilesLoading(false);
    }
  }, [isSupervisor]);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const effectiveScopeUserId = scopeUserId ?? user?.id ?? null;

  useEffect(() => {
    if (!isSupervisor) return;
    if (!profiles.length) return;
    if (!effectiveScopeUserId) {
      const fallback = profiles.find((p) => p.id === user?.id) ?? profiles[0];
      setScopeUserIdInternal(fallback.id);
      return;
    }
    const exists = profiles.some((profileItem) => profileItem.id === effectiveScopeUserId);
    if (!exists) {
      const fallback = profiles.find((p) => p.id === user?.id) ?? profiles[0];
      setScopeUserIdInternal(fallback.id);
    }
  }, [profiles, effectiveScopeUserId, isSupervisor, user?.id]);

  const setScopeUserId = (nextId: string | null) => {
    if (!isSupervisor) return;
    if (!nextId) {
      setScopeUserIdInternal(user?.id ?? null);
      return;
    }
    setScopeUserIdInternal(nextId);
  };

  const viewingOwnData = !isSupervisor || !effectiveScopeUserId || effectiveScopeUserId === user?.id;
  const readOnly = isSupervisor;

  const scopedProfile = useMemo(() => {
    if (!isSupervisor) {
      return profile ? { id: profile.id, email: profile.email, full_name: profile.full_name, role: profile.role } : null;
    }
    const found = profiles.find((item) => item.id === effectiveScopeUserId);
    if (found) return found;
    return profile ? { id: profile.id, email: profile.email, full_name: profile.full_name, role: profile.role } : null;
  }, [isSupervisor, profiles, effectiveScopeUserId, profile]);

  const value: UserScopeContextValue = {
    profile,
    setProfileState: setProfile,
    profileLoading,
    refreshProfile,
    isSupervisor,
    readOnly,
    scopeUserId: effectiveScopeUserId,
    setScopeUserId,
    viewingOwnData,
    profiles,
    profilesLoading,
    scopedProfile,
    refreshProfiles,
  };

  return (
    <UserScopeContext.Provider value={value}>
      {children}
    </UserScopeContext.Provider>
  );
}

export function useUserScope() {
  const context = useContext(UserScopeContext);
  if (!context) {
    throw new Error('useUserScope must be used within a UserScopeProvider');
  }
  return context;
}
