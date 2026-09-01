import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { FileObject } from '@supabase/storage-js';
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  Line,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Copy,
  ExternalLink,
  Eye,
  Folder,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useUserScope } from './contexts/UserScopeContext';
import { useTheme } from './contexts/ThemeContext';

type BucketMeta = {
  id: string;
  label: string;
  description: string;
  sizeLimit: string;
  allowed: string;
  accept?: string;
};

type SelectedAsset = {
  bucketId: string;
  file: FileObject;
  publicUrl: string;
};

type AdMetricRow = {
  id: string;
  bucket_id: string;
  asset_name: string;
  view_date: string;
  views: number;
  client_mac: string | null;
  ap_mac: string | null;
  client_ip: string | null;
};

type AdMetricSummary = {
  key: string;
  bucketId: string;
  assetName: string;
  daily: { date: string; views: number }[];
  lifetimeViews: number;
  lastSevenViews: number;
  deviceCount: number;
  avgViewsPerDevice: number;
  deviceIdentifiers: string[];
};

const PORTAL_PREVIEW_URL = 'https://captive-portal-theta-seven.vercel.app/';

const PREVIEW_DEVICES = {
  tablet: {
    label: 'Tablet',
    widthClass: 'w-[520px] sm:w-[560px]',
    aspectRatio: '820 / 1180',
    showSpeaker: false,
  },
} as const;

type PreviewDeviceKey = keyof typeof PREVIEW_DEVICES;

const BUCKETS: BucketMeta[] = [
  {
    id: 'media-bucket',
    label: 'Media Bucket',
    description: 'General hero images, promo banners, and mixed assets used across the captive portal.',
    sizeLimit: '50 MB',
    allowed: 'Any MIME',
    accept: 'image/*,video/*,audio/*',
  },
  {
    id: 'videos',
    label: 'Video Stories',
    description: 'Walkthroughs, commercials, and showcase clips embedded in the portal.',
    sizeLimit: '50 MB',
    allowed: 'Video only',
    accept: 'video/*',
  },
  {
    id: 'audios',
    label: 'Audio Stingers',
    description: 'Short sound cues and background loops for immersive experiences.',
    sizeLimit: '5 MB',
    allowed: 'Audio only',
    accept: 'audio/*,.mp3,.m4a,audio/mpeg,audio/mp3,audio/x-m4a',
  },
  {
    id: 'backgrounds',
    label: 'Backgrounds',
    description: 'Gradients, illustrations, and wallpapers behind captive portal cards.',
    sizeLimit: '10 MB',
    allowed: 'Images only',
    accept: 'image/*',
  },
  {
    id: 'avatars',
    label: 'Avatars',
    description: 'Profile placeholders and staff portraits surfaced inside the captive experience.',
    sizeLimit: '50 MB',
    allowed: 'Images only',
    accept: 'image/*',
  },
];

const formatBytes = (value?: number | null) => {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
};

const determineMediaKind = (file?: FileObject) => {
  if (!file) return 'unknown';
  const metadata = (file.metadata as { mimetype?: string } | null) ?? null;
  const mimetype = metadata?.mimetype ?? '';
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext) return 'unknown';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  return 'unknown';
};

const formatDateForInput = (date: Date) => date.toISOString().split('T')[0];

const CaptivePortal: React.FC = () => {
  const { isSupervisor } = useUserScope();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const pageSurfaceClass = isDark
    ? 'bg-slate-950 text-slate-50'
    : 'bg-slate-50 text-slate-900';
  const bucketCardSurface = isDark
    ? 'border-slate-800 bg-slate-900/60 shadow-2xl shadow-black/30'
    : 'border-slate-200 bg-white shadow-xl shadow-slate-200/70';
  const neutralStateSurface = isDark
    ? 'border-slate-800 bg-slate-900/80 text-slate-400'
    : 'border-slate-200 bg-white text-slate-500';
  const dashedStateSurface = isDark
    ? 'border-slate-800 bg-slate-900/40 text-slate-500'
    : 'border-slate-200 bg-white/60 text-slate-500';
  const previewShellSurface = isDark
    ? 'border-slate-800 bg-black/40 shadow-black/40'
    : 'border-slate-200 bg-white shadow-slate-200/80';
  const selectionCardSurface = isDark
    ? 'border-slate-800 bg-slate-900/60 shadow-black/30'
    : 'border-slate-200 bg-white shadow-slate-200/80';
  const actionMenuSurface = isDark
    ? 'border-slate-800 bg-slate-900/90 text-slate-100 shadow-xl shadow-black/40'
    : 'border-slate-200 bg-white text-slate-900 shadow-xl shadow-slate-200/70';
  const listHeaderSurface = isDark
    ? 'border-slate-800/80 bg-slate-950/40 text-slate-400'
    : 'border-slate-200 bg-slate-50 text-slate-500';
  const errorBannerClass = isDark
    ? 'border-red-500/40 bg-red-500/10 text-red-200'
    : 'border-red-200 bg-red-50 text-red-700';
  const successBannerClass = isDark
    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  const phoneBezelClass = isDark
    ? 'border-slate-800 bg-black shadow-[0_25px_60px_rgba(0,0,0,0.65)]'
    : 'border-slate-200 bg-black shadow-[0_25px_60px_rgba(15,23,42,0.35)]';
  const phoneSpeakerClass = isDark
    ? 'bg-slate-700'
    : 'bg-slate-300';
  const [filesByBucket, setFilesByBucket] = useState<Record<string, FileObject[]>>({});
  const [loadingBuckets, setLoadingBuckets] = useState<Record<string, boolean>>({});
  const [collapsedBuckets, setCollapsedBuckets] = useState<Record<string, boolean>>({});
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null);
  const [portalRefreshKey, setPortalRefreshKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{
    bucketId: string;
    file: FileObject;
    nextName: string;
  } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [actionContext, setActionContext] = useState<{ bucketId: string; file: FileObject } | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number; placement: 'up' | 'down' } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const actionAnchorRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [expiryDrafts, setExpiryDrafts] = useState<Record<string, string>>({});
  const [savingExpiryId, setSavingExpiryId] = useState<string | null>(null);
  const [adMetrics, setAdMetrics] = useState<AdMetricRow[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [selectedAdKey, setSelectedAdKey] = useState<string | null>(null);
  const [previewDevice] = useState<PreviewDeviceKey>('tablet');
  const statusTimeoutRef = useRef<number | null>(null);
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);
  const defaultAnalyticsStart = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return start.toISOString().split('T')[0];
  }, []);
  const [dateFilterStart, setDateFilterStart] = useState<string>(defaultAnalyticsStart);
  const [dateFilterEnd, setDateFilterEnd] = useState<string>(today);

  const handleResetAnalyticsRange = useCallback(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 29);
    setDateFilterStart(start.toISOString().split('T')[0]);
    setDateFilterEnd(end.toISOString().split('T')[0]);
    setSelectedAdKey(null); // Reset selected file/asset filter
  }, []);
  const expiryFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }),
    [],
  );
  const metricDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
    [],
  );

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current);
    }
  };
  }, []);

  const closeActionMenu = useCallback(() => {
    setOpenActionId(null);
    setActionContext(null);
    setActionMenuPosition(null);
  }, []);

  useEffect(() => {
    const handleClickAway = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-action-menu]')) return;
      if (actionMenuRef.current && actionMenuRef.current.contains(target)) return;
      closeActionMenu();
    };
    window.addEventListener('click', handleClickAway);
    return () => {
      window.removeEventListener('click', handleClickAway);
    };
  }, [closeActionMenu]);
  const registerActionAnchor = useCallback((actionId: string) => {
    return (element: HTMLButtonElement | null) => {
      actionAnchorRefs.current[actionId] = element;
    };
  }, []);

  useLayoutEffect(() => {
    if (!openActionId || !actionContext) return undefined;
    const computePosition = () => {
      const anchor = actionAnchorRefs.current[openActionId];
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuWidth = actionMenuRef.current?.offsetWidth ?? 224;
      const menuHeight = actionMenuRef.current?.offsetHeight ?? 320;
      const padding = 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;
      const top = dropUp ? rect.top - menuHeight - padding : rect.bottom + padding;
      let left = rect.right - menuWidth;
      left = Math.min(left, window.innerWidth - menuWidth - padding);
      left = Math.max(padding, left);
      setActionMenuPosition({ top, left, placement: dropUp ? 'up' : 'down' });
    };
    computePosition();
    window.addEventListener('resize', computePosition);
    window.addEventListener('scroll', computePosition, true);
    return () => {
      window.removeEventListener('resize', computePosition);
      window.removeEventListener('scroll', computePosition, true);
    };
  }, [openActionId, actionContext]);


  const pushStatus = useCallback((message: string) => {
    setStatusMessage(message);
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = window.setTimeout(() => {
      setStatusMessage(null);
    }, 4000);
  }, []);

  const fetchBucketFiles = useCallback(async (bucketId: string) => {
    setLoadingBuckets(prev => ({ ...prev, [bucketId]: true }));
    setErrorMessage(null);
    const { data, error } = await supabase.storage.from(bucketId).list('', {
      limit: 1000,
      sortBy: { column: 'updated_at', order: 'desc' },
    });
    setLoadingBuckets(prev => ({ ...prev, [bucketId]: false }));
    if (error) {
      setErrorMessage(error.message);
      return undefined;
    }
    const onlyFiles = (data ?? []).filter(item => item.metadata);
    setFilesByBucket(prev => ({ ...prev, [bucketId]: onlyFiles }));
    setCollapsedBuckets(prev => (
      Object.prototype.hasOwnProperty.call(prev, bucketId) ? prev : { ...prev, [bucketId]: true }
    ));
    return onlyFiles;
  }, []);

  useEffect(() => {
    BUCKETS.forEach(bucket => {
      fetchBucketFiles(bucket.id);
    });
  }, [fetchBucketFiles]);

  const assetFileMap = useMemo(() => {
    const map = new Map<string, FileObject>();
    Object.entries(filesByBucket).forEach(([bucketId, fileList]) => {
      fileList.forEach(file => {
        map.set(`${bucketId}::${file.name}`, file);
      });
    });
    return map;
  }, [filesByBucket]);

  const fetchAdMetrics = useCallback(async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    let query = supabase
      .from('ad_metrics')
      .select('id,bucket_id,asset_name,view_date,views,client_mac,ap_mac,client_ip')
      .order('view_date', { ascending: true });
    if (dateFilterStart) {
      query = query.gte('view_date', dateFilterStart);
    }
    if (dateFilterEnd) {
      query = query.lte('view_date', dateFilterEnd);
    }
    const { data, error } = await query;
    setAnalyticsLoading(false);
    if (error) {
      setAnalyticsError(error.message);
      return;
    }
    setAdMetrics(data ?? []);
  }, [dateFilterStart, dateFilterEnd]);

  useEffect(() => {
    if (!isSupervisor) return;
    fetchAdMetrics();
  }, [fetchAdMetrics, isSupervisor]);

  // Fetch metrics when date filter changes
  useEffect(() => {
    if (!isSupervisor) return;
    fetchAdMetrics();
  }, [dateFilterStart, dateFilterEnd, isSupervisor, fetchAdMetrics]);

  const analyticsEntries = useMemo(() => {
    if (adMetrics.length === 0) return [] as AdMetricSummary[];
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(todayMidnight);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    type WorkingSummary = {
      key: string;
      bucketId: string;
      assetName: string;
      daily: { date: string; views: number }[];
      lifetimeViews: number;
      lastSevenViews: number;
      identifiers: Set<string>;
    };

    const entries = new Map<string, WorkingSummary>();

    adMetrics.forEach(row => {
      const key = `${row.bucket_id}::${row.asset_name}`;
      let summary = entries.get(key);
      if (!summary) {
        summary = {
          key,
          bucketId: row.bucket_id,
          assetName: row.asset_name,
          daily: [],
          lifetimeViews: 0,
          lastSevenViews: 0,
          identifiers: new Set<string>(),
        };
        entries.set(key, summary);
      }

      summary.daily.push({ date: row.view_date, views: row.views });
      summary.lifetimeViews += row.views;

      const bucketDate = new Date(`${row.view_date}T00:00:00Z`);
      if (!Number.isNaN(bucketDate.getTime()) && bucketDate >= sevenDaysAgo) {
        summary.lastSevenViews += row.views;
      }

      const identifier = row.client_mac || row.client_ip || row.ap_mac;
      if (identifier) {
        summary.identifiers.add(identifier);
      }
    });

    const ordered = Array.from(entries.values()).map(item => {
      item.daily.sort((a, b) => a.date.localeCompare(b.date));
      const deviceIdentifiers = Array.from(item.identifiers);
      const deviceCount = deviceIdentifiers.length;
      return {
        key: item.key,
        bucketId: item.bucketId,
        assetName: item.assetName,
        daily: item.daily,
        lifetimeViews: item.lifetimeViews,
        lastSevenViews: item.lastSevenViews,
        deviceCount,
        avgViewsPerDevice: deviceCount > 0 ? Math.round(item.lifetimeViews / deviceCount) : 0,
        deviceIdentifiers,
      } as AdMetricSummary;
    });

    return ordered.sort((a, b) => b.lifetimeViews - a.lifetimeViews);
  }, [adMetrics]);

  useEffect(() => {
    if (analyticsEntries.length === 0) {
      setSelectedAdKey(null);
      return;
    }
    if (!selectedAdKey || !analyticsEntries.some(entry => entry.key === selectedAdKey)) {
      setSelectedAdKey(analyticsEntries[0].key);
    }
  }, [analyticsEntries, selectedAdKey]);

  const selectedAnalytics = useMemo(() => {
    if (analyticsEntries.length === 0) return null;
    if (!selectedAdKey) return analyticsEntries[0];
    return analyticsEntries.find(entry => entry.key === selectedAdKey) ?? analyticsEntries[0];
  }, [analyticsEntries, selectedAdKey]);

  const chartData = useMemo(() => {
    if (!selectedAnalytics) return [] as { date: string; label: string; rawViews: number }[];
    return selectedAnalytics.daily.map(item => {
      const isoDate = `${item.date}T00:00:00Z`;
      let label = item.date;
      try {
        label = metricDateFormatter.format(new Date(isoDate));
      } catch (err) {
        label = item.date;
      }
      return {
        date: item.date,
        label,
        rawViews: item.views,
      };
    });
  }, [metricDateFormatter, selectedAnalytics]);

  const selectedFile = useMemo(() => {
    if (!selectedAnalytics) return null;
    return assetFileMap.get(selectedAnalytics.key) ?? null;
  }, [assetFileMap, selectedAnalytics]);

  const trackedDays = useMemo(() => {
    if (!selectedAnalytics || selectedAnalytics.daily.length === 0) return 0;
    const first = new Date(`${selectedAnalytics.daily[0].date}T00:00:00Z`);
    const last = new Date(`${selectedAnalytics.daily[selectedAnalytics.daily.length - 1].date}T00:00:00Z`);
    if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) {
      return selectedAnalytics.daily.length;
    }
    const diff = Math.max(0, last.getTime() - first.getTime());
    return Math.max(1, Math.round(diff / 86400000) + 1);
  }, [selectedAnalytics]);

  const averageDailyViews = useMemo(() => {
    if (!selectedAnalytics || trackedDays === 0) return 0;
    return Math.round(selectedAnalytics.lifetimeViews / trackedDays);
  }, [selectedAnalytics, trackedDays]);

  const lastRecorded = useMemo(() => {
    if (!selectedAnalytics || selectedAnalytics.daily.length === 0) {
      return { date: null as string | null, views: 0 };
    }
    const tail = selectedAnalytics.daily[selectedAnalytics.daily.length - 1];
    return { date: tail.date, views: tail.views };
  }, [selectedAnalytics]);

  const uploadedAt = useMemo(() => {
    if (!selectedFile?.created_at) return null;
    const created = new Date(selectedFile.created_at);
    return Number.isNaN(created.getTime()) ? null : created;
  }, [selectedFile]);

  const daysSinceUpload = useMemo(() => {
    if (!uploadedAt) return null;
    const diff = Date.now() - uploadedAt.getTime();
    return Math.max(1, Math.ceil(diff / 86400000));
  }, [uploadedAt]);

  const formatMetricDate = (isoDate: string | null) => {
    if (!isoDate) return '—';
    try {
      return expiryFormatter.format(new Date(`${isoDate}T00:00:00Z`));
    } catch (err) {
      return isoDate;
    }
  };

  const handleUpload = async (bucketId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const sanitizedName = file.name.replace(/\s+/g, '-');
    const filePath = `${Date.now()}-${sanitizedName}`;
    setUploadTarget(bucketId);
    setErrorMessage(null);
    const { error } = await supabase.storage.from(bucketId).upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });
    setUploadTarget(null);
    if (error) {
      const friendly = error.message.includes('row-level security')
        ? 'Upload blocked: Supabase storage RLS prevented this action. Ensure the current service role or policy allows inserts for this bucket.'
        : error.message;
      setErrorMessage(friendly);
      return;
    }
    pushStatus('Upload complete.');
    const updatedFiles = await fetchBucketFiles(bucketId);
    if (updatedFiles) {
      const newFile = updatedFiles.find(item => item.name === filePath) ?? updatedFiles[0];
      if (newFile) {
        handlePreview(bucketId, newFile);
      }
    }
  };

  const handleDelete = async (bucketId: string, fileName: string) => {
    setErrorMessage(null);
    const { error } = await supabase.storage.from(bucketId).remove([fileName]);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    pushStatus('File deleted.');
    await fetchBucketFiles(bucketId);
    if (selectedAsset?.bucketId === bucketId && selectedAsset.file.name === fileName) {
      setSelectedAsset(null);
    }
  };

  const beginRename = (bucketId: string, file: FileObject) => {
    setErrorMessage(null);
    setRenameState({ bucketId, file, nextName: file.name });
    closeActionMenu();
  };

  const cancelRename = () => {
    setRenameState(null);
    setRenaming(false);
  };

  const handleRenameSubmit = async () => {
    if (!renameState) return;
    const trimmed = renameState.nextName.trim();
    if (!trimmed) {
      setErrorMessage('Please provide a new file name.');
      return;
    }
    if (trimmed === renameState.file.name) {
      setRenameState(null);
      return;
    }
    setRenaming(true);
    setErrorMessage(null);
    const { error } = await supabase.storage.from(renameState.bucketId).move(renameState.file.name, trimmed);
    setRenaming(false);
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    pushStatus('File renamed.');
    const bucketId = renameState.bucketId;
    const previousName = renameState.file.name;
    setRenameState(null);
    const updatedFiles = await fetchBucketFiles(bucketId);
    if (updatedFiles) {
      const renamedFile = updatedFiles.find(item => item.name === trimmed);
      if (
        renamedFile &&
        selectedAsset?.bucketId === bucketId &&
        selectedAsset.file.name === previousName
      ) {
        handlePreview(bucketId, renamedFile);
      }
    }
  };

  const handlePreview = (bucketId: string, file: FileObject) => {
    const { data } = supabase.storage.from(bucketId).getPublicUrl(file.name);
    const url = data?.publicUrl;
    if (!url) {
      setErrorMessage('Could not generate a public URL for this asset.');
      return;
    }
    setSelectedAsset({ bucketId, file, publicUrl: url });
  };

  const copyPublicUrl = async (bucketId: string, file: FileObject) => {
    const { data } = supabase.storage.from(bucketId).getPublicUrl(file.name);
    const url = data?.publicUrl;
    if (!url) {
      setErrorMessage('Could not generate a public URL for this asset.');
      return;
    }
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      pushStatus('Public URL copied to clipboard.');
    } else {
      setErrorMessage('Clipboard API is not available in this browser.');
    }
  };

  const toggleBucketCollapsed = useCallback((bucketId: string) => {
    setCollapsedBuckets(prev => ({ ...prev, [bucketId]: !prev[bucketId] }));
  }, []);

  const selectedKind = useMemo(() => determineMediaKind(selectedAsset?.file), [selectedAsset]);
  const activeDevice = PREVIEW_DEVICES[previewDevice];

  const handleActionButtonClick = useCallback(
    (bucketId: string, file: FileObject, actionId: string) => {
      if (openActionId === actionId) {
        closeActionMenu();
        return;
      }
      setActionMenuPosition(null);
      setActionContext({ bucketId, file });
      setOpenActionId(actionId);
    },
    [closeActionMenu, openActionId],
  );

  const handleSaveExpiry = useCallback(
    async (bucketId: string, file: FileObject, actionId: string, dateValue: string) => {
      const existingInput = (() => {
        const metadata = (file.metadata as { expiry_at?: string; expiryAt?: string } | null) ?? null;
        const raw = metadata?.expiry_at ?? metadata?.expiryAt;
        if (!raw) return '';
        try {
          return formatDateForInput(new Date(raw));
        } catch (err) {
          return '';
        }
      })();
      if (dateValue === existingInput) {
        closeActionMenu();
        return;
      }
      const normalized = dateValue ? new Date(`${dateValue}T00:00:00Z`).toISOString() : null;
      setSavingExpiryId(actionId);
      setErrorMessage(null);
      const { data: blob, error: downloadError } = await supabase.storage.from(bucketId).download(file.name);
      if (downloadError || !blob) {
        setSavingExpiryId(null);
        setErrorMessage(downloadError?.message ?? 'Failed to download file before updating metadata.');
        return;
      }
      const existingMetadata = ((file.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
      if (normalized) {
        existingMetadata.expiry_at = normalized;
      } else {
        delete existingMetadata.expiry_at;
      }
      const mimetype = (file.metadata as { mimetype?: string } | null)?.mimetype;
      const { error: updateError } = await supabase.storage.from(bucketId).update(file.name, blob, {
        cacheControl: '3600',
        upsert: true,
        metadata: existingMetadata,
        contentType: mimetype,
      });
      setSavingExpiryId(null);
      if (updateError) {
        setErrorMessage(updateError.message);
        return;
      }
      pushStatus(normalized ? 'Expiry scheduled.' : 'Expiry cleared.');
      closeActionMenu();
      setExpiryDrafts(prev => {
        const copy = { ...prev };
        delete copy[actionId];
        return copy;
      });
      await fetchBucketFiles(bucketId);
    },
    [closeActionMenu, fetchBucketFiles, pushStatus],
  );


  if (!isSupervisor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-2">Access Denied</h2>
          <p className="text-slate-700 dark:text-slate-200">This page is only available to supervisors.</p>
        </div>
      </div>
    );
  }

    const canRenderPortal = typeof document !== 'undefined';
    const actionMenuPortal = canRenderPortal && openActionId && actionContext
      ? (() => {
          const actionId = openActionId;
          const { bucketId, file } = actionContext;
          const metadata = (file.metadata as { size?: number; mimetype?: string } | null) ?? null;
          const renameActive =
            renameState?.bucketId === bucketId && renameState.file.name === file.name;
          const renameBusy = renameActive && renaming;
          const expiryRaw = metadata
            ? ((metadata as { expiry_at?: string; expiryAt?: string }).expiry_at ??
              (metadata as { expiry_at?: string; expiryAt?: string }).expiryAt ??
              null)
            : null;
          const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
          const defaultExpiryInput = expiryDate ? formatDateForInput(expiryDate) : '';
          const currentExpiryInput = expiryDrafts[actionId] ?? defaultExpiryInput;
          const isSavingExpiry = savingExpiryId === actionId;
          const isExpiryDirty = currentExpiryInput !== defaultExpiryInput;
          const menuStyle = actionMenuPosition
            ? { top: actionMenuPosition.top, left: actionMenuPosition.left, visibility: 'visible' as const }
            : { top: -9999, left: -9999, visibility: 'hidden' as const };
          return createPortal(
            <div
              ref={actionMenuRef}
              className={`fixed z-[999] w-56 rounded-2xl border text-xs font-semibold ${actionMenuSurface}`}
              style={menuStyle}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 transition-colors duration-200 hover:text-blue-400"
                onClick={() => {
                  handlePreview(bucketId, file);
                  closeActionMenu();
                }}
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 transition-colors duration-200 hover:text-blue-400"
                onClick={async () => {
                  await copyPublicUrl(bucketId, file);
                  closeActionMenu();
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy URL
              </button>
              <button
                type="button"
                disabled={renameBusy}
                className={`flex w-full items-center gap-2 px-3 py-2 transition-colors duration-200 ${
                  renameBusy ? 'opacity-60' : 'hover:text-amber-400'
                }`}
                onClick={() => beginRename(bucketId, file)}
              >
                Rename
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-red-500 transition-colors duration-200 hover:text-red-400"
                onClick={() => {
                  handleDelete(bucketId, file.name);
                  closeActionMenu();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
              <div className="border-t border-slate-200/60 px-3 py-2 text-left text-[0.65rem] uppercase tracking-wide dark:border-slate-700/60">
                <p className="mb-2 text-[0.6rem] text-slate-500 dark:text-slate-400">Expiry date</p>
                <input
                  type="date"
                  min={today}
                  value={currentExpiryInput}
                  onChange={event =>
                    setExpiryDrafts(prev => ({ ...prev, [actionId]: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-transparent px-2 py-1 text-[0.7rem] text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:text-slate-100"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleSaveExpiry(
                        bucketId,
                        file,
                        actionId,
                        currentExpiryInput,
                      )
                    }
                    disabled={!isExpiryDirty || isSavingExpiry}
                    className={`flex-1 rounded-xl px-3 py-1 font-semibold ${
                      isSavingExpiry
                        ? 'bg-slate-500 text-white opacity-70'
                        : 'bg-blue-600 text-white hover:bg-blue-500'
                    }`}
                  >
                    {isSavingExpiry ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpiryDrafts(prev => ({ ...prev, [actionId]: '' }))}
                    disabled={isSavingExpiry}
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-1 font-semibold text-slate-700 transition-colors duration-200 hover:border-slate-500 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          );
        })()
      : null;

  return (
    <>
      <div className={`min-h-screen ${pageSurfaceClass} py-10 transition-colors duration-300`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.4em] text-blue-400">Captive Portal Studio</p>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Media Buckets</h1>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Manage Supabase assets powering <span className="text-blue-300">captive-portal-theta-seven</span>.
            </div>
          </div>
          {errorMessage && (
            <div className={`rounded-xl border px-4 py-2 text-sm transition-colors duration-200 ${errorBannerClass}`}>
              {errorMessage}
            </div>
          )}
          {statusMessage && (
            <div className={`rounded-xl border px-4 py-2 text-sm transition-colors duration-200 ${successBannerClass}`}>
              {statusMessage}
            </div>
          )}
        </header>

        <div className="grid gap-8 xl:grid-cols-[2fr_1fr]">
          <section className="space-y-6">
            <div
              className={`rounded-3xl border ${bucketCardSurface} p-6 backdrop-blur transition-colors duration-300`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-blue-400">Ad Analytics</p>
                  <h2 className="mt-1 text-2xl font-semibold">Performance overview</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Monitor captive portal ad impressions by asset and day.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-2 text-sm text-slate-600 dark:text-slate-400 lg:items-end">
                  <button
                    type="button"
                    onClick={fetchAdMetrics}
                    disabled={analyticsLoading}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors duration-200 border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-600 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:text-blue-300"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${analyticsLoading ? 'animate-spin' : ''}`} />
                    {analyticsLoading ? 'Refreshing…' : 'Refresh analytics'}
                  </button>
                </div>
              </div>
              {analyticsError && (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm transition-colors duration-200 ${errorBannerClass}`}
                >
                  {analyticsError}
                </div>
              )}
              {analyticsLoading && analyticsEntries.length === 0 && (
                <div
                  className={`mt-6 rounded-2xl border px-4 py-6 text-center text-sm transition-colors duration-200 ${neutralStateSurface}`}
                >
                  Loading analytics…
                </div>
              )}
              {!analyticsLoading && analyticsEntries.length === 0 && (
                <div
                  className={`mt-6 rounded-2xl border border-dashed px-4 py-6 text-center text-sm transition-colors duration-200 ${dashedStateSurface}`}
                >
                  No view data recorded yet.
                </div>
              )}
              {analyticsEntries.length > 0 && (
                <div className="mt-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                        Ad asset
                      </label>
                      <select
                        value={selectedAnalytics?.key ?? ''}
                        onChange={event => setSelectedAdKey(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-slate-300 bg-transparent px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
                      >
                        {analyticsEntries.map(entry => (
                          <option key={entry.key} value={entry.key}>
                            {entry.assetName} · {entry.bucketId}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div
                      className={`rounded-2xl border p-4 text-sm transition-colors duration-200 ${selectionCardSurface}`}
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                        Asset details
                      </p>
                      <div className="mt-3 space-y-2 text-slate-600 dark:text-slate-300">
                        <div className="flex items-center justify-between">
                          <span>Lifetime views</span>
                          <span>{selectedAnalytics ? selectedAnalytics.lifetimeViews.toLocaleString() : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Status</span>
                          <span className="font-semibold">
                            {selectedFile ? 'Active in storage' : 'Asset missing'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Uploaded</span>
                          <span>{uploadedAt ? expiryFormatter.format(uploadedAt) : 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Tracked since</span>
                          <span>{selectedAnalytics ? formatMetricDate(selectedAnalytics.daily[0]?.date ?? null) : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Last recorded</span>
                          <span>
                            {lastRecorded.date ? `${formatMetricDate(lastRecorded.date)} · ${lastRecorded.views.toLocaleString()} views` : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Avg views/day</span>
                          <span>
                            {trackedDays > 0
                              ? `${averageDailyViews.toLocaleString()} · ${trackedDays.toLocaleString()} days`
                              : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Unique devices</span>
                          <span>{selectedAnalytics ? selectedAnalytics.deviceCount.toLocaleString() : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Avg views/device</span>
                          <span>{selectedAnalytics ? selectedAnalytics.avgViewsPerDevice.toLocaleString() : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Device sample</span>
                          <span className="max-w-[12rem] truncate text-right">
                            {selectedAnalytics && selectedAnalytics.deviceIdentifiers.length > 0
                              ? `${selectedAnalytics.deviceIdentifiers.slice(0, 3).join(', ')}${selectedAnalytics.deviceIdentifiers.length > 3 ? ` +${selectedAnalytics.deviceIdentifiers.length - 3}` : ''}`
                              : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Days live</span>
                          <span>{daysSinceUpload ? daysSinceUpload.toLocaleString() : '—'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`rounded-2xl border p-4 transition-colors duration-200 ${previewShellSurface}`}
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                      Daily views trend
                    </p>
                    <div className="mt-4 h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                          <CartesianGrid stroke={isDark ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'} strokeDasharray="3 3" />
                          <XAxis dataKey="label" stroke={isDark ? '#94a3b8' : '#475569'} tick={{ fontSize: 12 }} />
                          <YAxis stroke={isDark ? '#94a3b8' : '#475569'} tick={{ fontSize: 12 }} allowDecimals={false} />
                          <RechartsTooltip
                            contentStyle={{
                              backgroundColor: isDark ? '#0f172a' : '#ffffff',
                              borderRadius: 12,
                              border: isDark ? '1px solid rgba(148,163,184,0.2)' : '1px solid rgba(148,163,184,0.35)',
                              color: isDark ? '#e2e8f0' : '#0f172a',
                            }}
                            formatter={(value) => [`${value}`, 'Views']}
                            labelFormatter={(_, payload) => {
                              const iso = payload?.[0]?.payload?.date;
                              if (!iso) return '';
                              return formatMetricDate(iso);
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="rawViews"
                            name="Views"
                            stroke="#38bdf8"
                            strokeWidth={2.5}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div
                    className={`rounded-2xl border p-4 transition-colors duration-200 ${selectionCardSurface}`}
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                          All ads
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Unique device reach and total views for the selected range.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">From</span>
                          <input
                            type="date"
                            value={dateFilterStart}
                            max={dateFilterEnd || undefined}
                            onChange={event => setDateFilterStart(event.target.value)}
                            className="w-36 rounded-xl border border-slate-300 bg-transparent px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">To</span>
                          <input
                            type="date"
                            value={dateFilterEnd}
                            min={dateFilterStart || undefined}
                            max={today}
                            onChange={event => setDateFilterEnd(event.target.value)}
                            className="w-36 rounded-xl border border-slate-300 bg-transparent px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleResetAnalyticsRange}
                          className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 transition-colors duration-200 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:text-slate-200 dark:hover:text-blue-300"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-sm">
                      <div className="grid grid-cols-[minmax(0,2fr),minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),minmax(0,2fr)] gap-3 rounded-xl border border-slate-200/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
                        <span>Asset</span>
                        <span className="text-right">Views</span>
                        <span className="text-right">Devices</span>
                        <span className="text-right">Avg / device</span>
                        <span className="text-right">Device IDs</span>
                      </div>
                      <div className="space-y-2">
                        {analyticsEntries.map(entry => {
                          const isSelected = selectedAnalytics?.key === entry.key;
                          const exists = assetFileMap.has(entry.key);
                          const previewIdentifiers = entry.deviceIdentifiers.slice(0, 3);
                          const remainder = entry.deviceIdentifiers.length - previewIdentifiers.length;
                          const identifierLabel = previewIdentifiers.length > 0
                            ? `${previewIdentifiers.join(', ')}${remainder > 0 ? ` +${remainder}` : ''}`
                            : '—';
                          return (
                            <button
                              type="button"
                              key={entry.key}
                              onClick={() => setSelectedAdKey(entry.key)}
                              className={`w-full rounded-xl border px-3 py-2 text-left transition-colors duration-200 ${
                                isSelected
                                  ? 'border-blue-400 bg-blue-500/10 text-blue-600 dark:border-blue-500/60 dark:bg-blue-500/10 dark:text-blue-200'
                                  : isDark
                                    ? 'border-slate-700/60 bg-slate-900/40 text-slate-300 hover:border-blue-500/60 hover:text-blue-300'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-500'
                              }`}
                            >
                              <div className="grid grid-cols-[minmax(0,2fr),minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),minmax(0,2fr)] items-center gap-3 text-sm">
                                <div>
                                  <p className="truncate font-medium">{entry.assetName}</p>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {entry.bucketId}
                                    {exists ? '' : ' · removed'}
                                  </p>
                                </div>
                                <p className="text-right font-semibold">{entry.lifetimeViews.toLocaleString()}</p>
                                <p className="text-right font-semibold">{entry.deviceCount.toLocaleString()}</p>
                                <p className="text-right font-semibold">{entry.avgViewsPerDevice.toLocaleString()}</p>
                                <p className="text-right text-xs text-slate-500 dark:text-slate-400">{identifierLabel}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {BUCKETS.map(bucket => {
              const bucketFiles = filesByBucket[bucket.id] ?? [];
              const isBusy = loadingBuckets[bucket.id];
              const uploadingHere = uploadTarget === bucket.id;
              const isCollapsed = collapsedBuckets[bucket.id] ?? true;
              return (
                <div
                  key={bucket.id}
                  className={`rounded-3xl border ${bucketCardSurface} p-6 backdrop-blur transition-colors duration-300`}
                >
                  <div
                    className={`flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between cursor-pointer select-none ${isCollapsed ? 'opacity-85' : ''}`}
                    onDoubleClick={() => toggleBucketCollapsed(bucket.id)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleBucketCollapsed(bucket.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title="Double-click or press Enter to toggle bucket files"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <Folder className="h-4 w-4" />
                        {bucket.id}
                        <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                          {isCollapsed ? 'Collapsed' : 'Expanded'}
                        </span>
                      </div>
                      <h2 className="mt-1 text-2xl font-semibold">{bucket.label}</h2>
                      {!isCollapsed && (
                        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{bucket.description}</p>
                      )}
                      {isCollapsed && (
                        <p className="mt-1 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">Double-click to expand this bucket.</p>
                      )}
                    </div>
                    {!isCollapsed && (
                      <div className="flex flex-col items-start gap-2 text-sm text-slate-600 dark:text-slate-400 lg:items-end">
                        <span>
                          {bucket.sizeLimit} · {bucket.allowed}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => fetchBucketFiles(bucket.id)}
                            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors duration-200 border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:text-slate-200 dark:hover:text-blue-300"
                            disabled={isBusy}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                            Refresh
                          </button>
                          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors duration-200 ${
                            uploadingHere
                              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-200'
                              : 'border-slate-300 text-slate-700 hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-200 dark:hover:text-emerald-200'
                          }`}>
                            <Upload className="h-3.5 w-3.5" />
                            {uploadingHere ? 'Uploading…' : 'Upload'}
                            <input
                              type="file"
                              accept={bucket.accept}
                              className="sr-only"
                              onChange={event => handleUpload(bucket.id, event)}
                              disabled={uploadingHere}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {!isCollapsed ? (
                    <div className="mt-5 space-y-2">
                      {isBusy && bucketFiles.length === 0 && (
                        <div className={`rounded-2xl border px-4 py-6 text-center text-sm transition-colors duration-200 ${neutralStateSurface}`}>
                          Fetching files…
                        </div>
                      )}
                      {!isBusy && bucketFiles.length === 0 && (
                        <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm transition-colors duration-200 ${dashedStateSurface}`}>
                          No files yet.
                        </div>
                      )}
                      {bucketFiles.length > 0 && (
                        <div
                          className={`hidden md:grid grid-cols-[2fr,1fr,1fr,1fr,1fr,auto] rounded-2xl border px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${listHeaderSurface}`}
                        >
                          <span>Name</span>
                          <span className="text-center">Type</span>
                          <span className="text-center">Size</span>
                          <span className="text-center">Updated</span>
                          <span className="text-center">Status</span>
                          <span className="text-right">Actions</span>
                        </div>
                      )}
                      {bucketFiles.map(file => {
                      const metadata = (file.metadata as { size?: number; mimetype?: string } | null) ?? null;
                      const renameActive =
                        renameState?.bucketId === bucket.id && renameState.file.name === file.name;
                      const renameBusy = renameActive && renaming;
                      const actionId = `${bucket.id}:${file.name}`;
                      const expiryRaw = metadata
                        ? ((metadata as { expiry_at?: string; expiryAt?: string }).expiry_at ??
                          (metadata as { expiry_at?: string; expiryAt?: string }).expiryAt ??
                          null)
                        : null;
                      const expiryDate = expiryRaw ? new Date(expiryRaw) : null;
                      const isExpired = expiryDate ? expiryDate.getTime() < Date.now() : false;
                      const expiryLabel = expiryDate ? expiryFormatter.format(expiryDate) : null;
                      const defaultExpiryInput = expiryDate ? formatDateForInput(expiryDate) : '';
                      const currentExpiryInput = expiryDrafts[actionId] ?? defaultExpiryInput;
                      const isSavingExpiry = savingExpiryId === actionId;
                      const isExpiryDirty = currentExpiryInput !== defaultExpiryInput;
                      const statusLabel = expiryDate ? (isExpired ? 'Expired' : 'Active') : 'Active';
                      const statusDetail = expiryDate && expiryLabel ? ` · ${expiryLabel}` : '';
                      const statusClass = expiryDate
                        ? isExpired
                          ? 'text-red-400'
                          : 'text-emerald-400'
                        : 'text-emerald-400';
                      return (
                        <div
                          key={file.name}
                          className={`relative rounded-2xl border px-4 py-3 transition-colors duration-200 ${
                            isDark ? 'border-slate-800/60 bg-slate-900/60' : 'border-slate-200 bg-white'
                          } ${openActionId === actionId ? 'z-30' : 'z-0'}`}
                          style={{ overflow: 'visible' }}
                        >
                          <div className="flex flex-col gap-3 md:grid md:grid-cols-[2fr,1fr,1fr,1fr,1fr,auto] md:items-center md:gap-4">
                            <div>
                              <p className="font-medium text-slate-900 dark:text-slate-100 truncate" title={file.name}>
                                {file.name}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 md:hidden">
                                {(metadata?.mimetype ?? 'Unknown type').toUpperCase()} · {formatBytes(metadata?.size)} ·{' '}
                                {file.updated_at ? new Date(file.updated_at).toLocaleString() : '—'}
                                <span className={`block ${statusClass}`}>
                                  {statusLabel}
                                  {statusDetail}
                                </span>
                              </p>
                            </div>
                            <div className="hidden text-sm text-slate-600 dark:text-slate-300 md:block md:text-center">
                              {(metadata?.mimetype ?? 'Unknown type').toUpperCase()}
                            </div>
                            <div className="hidden text-sm text-slate-600 dark:text-slate-300 md:block md:text-center">
                              {formatBytes(metadata?.size)}
                            </div>
                            <div className="hidden text-sm text-slate-600 dark:text-slate-300 md:block md:text-center">
                              {file.updated_at ? new Date(file.updated_at).toLocaleString() : '—'}
                            </div>
                            <div className="hidden text-sm md:block md:text-center">
                              <span className={statusClass}>
                                {statusLabel}
                                {statusDetail}
                              </span>
                            </div>
                            <div className="flex items-center justify-start md:justify-end" data-action-menu>
                              <button
                                type="button"
                                ref={registerActionAnchor(actionId)}
                                onClick={() => handleActionButtonClick(bucket.id, file, actionId)}
                                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200 border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:text-slate-200"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                                Actions
                              </button>
                            </div>
                            {renameActive && (
                              <div className="md:col-span-6 mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                  <input
                                    type="text"
                                    value={renameState.nextName}
                                    onChange={event =>
                                      setRenameState(prev => (prev ? { ...prev, nextName: event.target.value } : prev))
                                    }
                                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                    placeholder="Enter new file name"
                                    disabled={renameBusy}
                                  />
                                  <div className="flex flex-1 flex-col gap-2 md:flex-row md:justify-end">
                                    <button
                                      type="button"
                                      onClick={handleRenameSubmit}
                                      disabled={renameBusy}
                                      className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
                                        renameBusy
                                          ? 'bg-slate-400 text-white opacity-80'
                                          : 'bg-blue-600 text-white hover:bg-blue-500'
                                      }`}
                                    >
                                      {renameBusy ? 'Renaming…' : 'Save Name'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelRename}
                                      disabled={renameBusy}
                                      className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors duration-200 hover:border-slate-500 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  ) : (
                    <div className={`mt-4 rounded-2xl border border-dashed px-4 py-3 text-center text-xs text-slate-500 transition-colors duration-200 dark:text-slate-400 ${dashedStateSurface}`}>
                      Double-click the header to reveal files and actions.
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <aside className="space-y-6 xl:sticky xl:top-6">
            <div className={`rounded-3xl border p-5 transition-colors duration-300 ${previewShellSurface}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Portal Preview</p>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">captive-portal-theta-seven</h3>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPortalRefreshKey(prev => prev + 1)}
                      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200 border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:text-slate-200 dark:hover:text-blue-200"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reload
                    </button>
                    <a
                      href={PORTAL_PREVIEW_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200 border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-600 dark:border-slate-700 dark:text-slate-200 dark:hover:text-blue-200"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    Tablet preview
                  </div>
                </div>
              </div>
              <div className="mt-4 flex w-full justify-center">
                <div className="w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div
                    className={`relative mx-auto min-w-min border-[12px] rounded-[2.5rem] ${phoneBezelClass} transition-colors duration-300 ${activeDevice.widthClass}`}
                    style={{ aspectRatio: activeDevice.aspectRatio }}
                  >
                    {activeDevice.showSpeaker && (
                      <div className={`absolute top-3 left-1/2 -translate-x-1/2 w-20 h-2 rounded-full ${phoneSpeakerClass}`} />
                    )}
                    <div className="h-full w-full rounded-[1.8rem] overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <iframe
                        key={portalRefreshKey}
                        src={`${PORTAL_PREVIEW_URL}?v=${portalRefreshKey}`}
                        className="min-h-full w-full border-0"
                        title="Captive portal preview"
                        loading="lazy"
                        scrolling="yes"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={`rounded-3xl border p-5 transition-colors duration-300 ${selectionCardSurface}`}>
              <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Selected asset</p>
              {selectedAsset ? (
                <div className="mt-4 space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{selectedAsset.file.name}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Bucket · {selectedAsset.bucketId}
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 transition-colors duration-300">
                    {selectedKind === 'image' && (
                      <img
                        src={selectedAsset.publicUrl}
                        alt={selectedAsset.file.name}
                        className="h-64 w-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {selectedKind === 'video' && (
                      <video controls className="h-64 w-full bg-black" src={selectedAsset.publicUrl} />
                    )}
                    {selectedKind === 'audio' && (
                      <div className="flex h-64 flex-col items-center justify-center gap-4 bg-slate-100 text-slate-700 dark:bg-slate-950 dark:text-slate-200">
                        <audio controls src={selectedAsset.publicUrl} className="w-full" />
                        <p className="text-sm">Audio preview</p>
                      </div>
                    )}
                    {selectedKind === 'unknown' && (
                      <div className="flex h-64 items-center justify-center bg-slate-100 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                        Preview unavailable for this file type.
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={selectedAsset.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200 border-blue-400 text-blue-600 hover:text-blue-800 dark:border-blue-500/60 dark:text-blue-200"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open asset
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        if (navigator?.clipboard?.writeText) {
                          navigator.clipboard.writeText(selectedAsset.publicUrl);
                          pushStatus('Public URL copied to clipboard.');
                        } else {
                          setErrorMessage('Clipboard API is not available in this browser.');
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200 border-slate-300 text-slate-700 hover:border-slate-500 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy link
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
                  Select a file to preview how it renders in the captive portal.
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
      {actionMenuPortal}
        </div>
      </>
  );
};

export default CaptivePortal;
