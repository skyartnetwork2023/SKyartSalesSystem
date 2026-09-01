import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Save, Plus, Calendar, Trash2, Lock, Unlock, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { createVoucher, getVouchers, updateVoucher, deleteVoucher } from '../lib/voucherService';
import { updateProfileSettings } from '../lib/profileService';
import { upsertForecast } from '../lib/forecastService';
import { computeForecast, formatTZS, YearlyTotal } from '../lib/forecastUtils';
import { read, utils } from 'xlsx';

type ToastState = { text: string; tone: 'success' | 'error' | 'info' } | null;

interface SimpleVoucher {
  id: string;
  dataPlan: string;
  duration: string;
  unitPrice: number;
  months: Record<string, number>;
}

const monthsOrder = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEPT','OCT','NOV','DEC'];

const defaultVouchers: SimpleVoucher[] = [
  { id: '1', dataPlan: '3 GBs', duration: '1', unitPrice: 1000, months: { JAN: 2, FEB: 1, MAR: 8, APR: 5, MAY: 4, JUN: 4, JUL: 5, AUG: 5, SEPT: 5, OCT: 5, NOV: 5, DEC: 5 } },
  { id: '2', dataPlan: '7 GBs', duration: '2', unitPrice: 2000, months: { JAN: 1, FEB: 0, MAR: 0, APR: 0, MAY: 0, JUN: 4, JUL: 0, AUG: 0, SEPT: 0, OCT: 0, NOV: 0, DEC: 0 } },
  { id: '3', dataPlan: '10 GBs', duration: '3', unitPrice: 3000, months: { JAN: 1, FEB: 0, MAR: 3, APR: 0, MAY: 0, JUN: 0, JUL: 0, AUG: 3, SEPT: 0, OCT: 0, NOV: 7, DEC: 0 } },
  { id: '4', dataPlan: '35 GBs', duration: '7', unitPrice: 7000, months: { JAN: 1, FEB: 0, MAR: 0, APR: 0, MAY: 4, JUN: 0, JUL: 0, AUG: 0, SEPT: 6, OCT: 0, NOV: 0, DEC: 0 } },
  { id: '5', dataPlan: '90 GBs', duration: '15', unitPrice: 15000, months: { JAN: 0, FEB: 0, MAR: 2, APR: 0, MAY: 0, JUN: 0, JUL: 0, AUG: 1, SEPT: 0, OCT: 1, NOV: 0, DEC: 0 } },
  { id: '6', dataPlan: '200 GBs', duration: '30', unitPrice: 28000, months: { JAN: 2, FEB: 0, MAR: 0, APR: 0, MAY: 1, JUN: 0, JUL: 0, AUG: 0, SEPT: 0, OCT: 0, NOV: 0, DEC: 0 } },
  { id: '7', dataPlan: '3.5 GBs', duration: 'Unlimited', unitPrice: 2000, months: { JAN: 1, FEB: 0, MAR: 0, APR: 0, MAY: 0, JUN: 0, JUL: 0, AUG: 0, SEPT: 0, OCT: 0, NOV: 0, DEC: 0 } },
  { id: '8', dataPlan: 'Unlimited', duration: '1', unitPrice: 2000, months: { JAN: 2, FEB: 0, MAR: 0, APR: 0, MAY: 1, JUN: 0, JUL: 0, AUG: 0, SEPT: 0, OCT: 0, NOV: 0, DEC: 0 } },
  { id: '9', dataPlan: 'Unlimited', duration: '7', unitPrice: 15000, months: { JAN: 1, FEB: 0, MAR: 0, APR: 0, MAY: 0, JUN: 0, JUL: 0, AUG: 0, SEPT: 0, OCT: 0, NOV: 0, DEC: 0 } },
  { id: '10', dataPlan: 'Unlimited', duration: '30', unitPrice: 3900, months: { JAN: 4, FEB: 0, MAR: 0, APR: 0, MAY: 0, JUN: 0, JUL: 0, AUG: 0, SEPT: 0, OCT: 0, NOV: 0, DEC: 0 } },
  { id: '11', dataPlan: 'Special', duration: '30', unitPrice: 20000, months: { JAN: 4, FEB: 0, MAR: 0, APR: 0, MAY: 0, JUN: 0, JUL: 0, AUG: 0, SEPT: 0, OCT: 0, NOV: 0, DEC: 0 } },
];

const makeId = (prefix = '') => `${prefix}${Date.now().toString(36)}-${Math.floor(Math.random()*1000)}`;

const safeNumber = (value: unknown) => {
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.\-]/g, '');
    if (!cleaned) return 0;
    const parsedFromString = Number(cleaned);
    return Number.isFinite(parsedFromString) && parsedFromString >= 0 ? parsedFromString : 0;
  }
  const parsed = Number(value as any);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const calculateVoucherRowTotals = (voucher: SimpleVoucher) => {
  const totalUnits = monthsOrder.reduce((sum, month) => sum + safeNumber(voucher.months?.[month]), 0);
  const totalAmount = totalUnits * safeNumber(voucher.unitPrice);
  return { totalUnits, totalAmount };
};

const normalizeHeaderLabel = (value: unknown) => String(value ?? '').trim().toLowerCase();

const parseImportedVoucherRows = (rows: unknown[][]): SimpleVoucher[] => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const headerCells = Array.isArray(rows[0]) ? rows[0] : [];
  const header = headerCells.map((cell) => normalizeHeaderLabel(cell));

  const planIndex = header.findIndex((label) => label.includes('plan') || label.includes('voucher'));
  const durationIndex = header.findIndex((label) => label.includes('duration'));
  const priceIndex = header.findIndex((label) => label.includes('unit') && label.includes('price')) >= 0
    ? header.findIndex((label) => label.includes('unit') && label.includes('price'))
    : header.findIndex((label) => label === 'price' || label.includes('price'));

  const monthIndices = new Map<string, number>();
  header.forEach((label, index) => {
    monthsOrder.forEach((month) => {
      if (monthIndices.has(month)) return;
      const monthLower = month.toLowerCase();
      const short = monthLower.slice(0, 3);
      if (
        label === monthLower ||
        label.startsWith(`${monthLower} `) ||
        label.startsWith(monthLower) ||
        label.startsWith(short) ||
        label.includes(monthLower)
      ) {
        monthIndices.set(month, index);
      }
    });
  });

  const dataRows = rows.slice(1);
  const imported: SimpleVoucher[] = [];

  dataRows.forEach((rawRow) => {
    if (!Array.isArray(rawRow)) return;
    const planCellIndex = planIndex >= 0 ? planIndex : 0;
    const rawPlan = String(rawRow[planCellIndex] ?? '').trim();
    const upperPlan = rawPlan.toUpperCase();
    if (/^total/.test(upperPlan) || upperPlan === 'SUMMARY') return;

    const months = monthsOrder.reduce((acc, month) => {
      const idx = monthIndices.get(month);
      const rawValue = idx !== undefined ? rawRow[idx] : 0;
      acc[month] = safeNumber(rawValue);
      return acc;
    }, {} as Record<string, number>);

    const hasMonthValues = monthsOrder.some((month) => months[month] !== 0);
    if (!rawPlan && !hasMonthValues) return;

    const duration = durationIndex >= 0 ? String(rawRow[durationIndex] ?? '').trim() : '';
    const unitPriceSource = priceIndex >= 0 ? rawRow[priceIndex] : undefined;
    const unitPrice = safeNumber(unitPriceSource);

    const plan = rawPlan || `Plan ${imported.length + 1}`;

    imported.push({
      id: makeId('import-'),
      dataPlan: plan,
      duration,
      unitPrice,
      months,
    });
  });

  return imported;
};

const createEmptyCashArray = () => [] as unknown[];

const extractCashData = (raw: Record<string, unknown> | null | undefined) => {
  if (!raw) {
    return {
      cashInflows: createEmptyCashArray(),
      cashOutflows: createEmptyCashArray(),
    };
  }
  const cashInflows = Array.isArray((raw as any).cashInflows) ? (raw as any).cashInflows : createEmptyCashArray();
  const cashOutflows = Array.isArray((raw as any).cashOutflows) ? (raw as any).cashOutflows : createEmptyCashArray();
  return { cashInflows, cashOutflows };
};

function YearDropdown({ availableYears, selectedYear, onChange }:{ availableYears:number[]; selectedYear:number; onChange:(year:number)=>void }){
  return (
    <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
      <Calendar className="w-5 h-5 text-slate-400" />
      <select value={selectedYear} onChange={e => onChange(Number(e.target.value))} className="bg-transparent text-white outline-none">
        {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
      </select>
    </div>
  );
}

function NewYearModal({ isOpen, onClose, onAdd }:{ isOpen:boolean; onClose:()=>void; onAdd:(year:number)=>void }){
  const [val, setVal] = useState('');
  useEffect(() => { if(!isOpen) setVal(''); }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y:0, opacity:1 }} exit={{ y:18, opacity:0 }} className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-lg w-full max-w-xs z-10">
        <h3 className="text-gray-900 dark:text-white font-semibold mb-3">Add new year</h3>
        <input type="number" min={2000} max={2100} value={val} onChange={e=>setVal(e.target.value)} className="w-full border px-3 py-2 rounded mb-4 outline-none" placeholder="e.g. 2026" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-gray-200 dark:bg-slate-700">Cancel</button>
          <button onClick={()=>onAdd(Number(val))} className="px-3 py-2 rounded bg-blue-600 text-white">Add</button>
        </div>
      </motion.div>
    </div>
  );
}

function Toast({ message, onClose }: { message: ToastState; onClose:()=>void }){
  return (
    <AnimatePresence>
      {message && (
        <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} className="fixed right-4 bottom-4 z-50">
          <div className={
            `px-4 py-3 rounded shadow flex items-center gap-3 ${
              message.tone === 'success' ? 'bg-emerald-600 text-emerald-50' : message.tone === 'error' ? 'bg-red-600 text-red-50' : 'bg-slate-900 text-white'
            }`
          }>
            <span>{message.text}</span>
            <button onClick={onClose} className="text-sm opacity-80">✕</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LoadingSkeleton({ lines=6 }:{ lines?:number }){
  return (
    <div className="p-4">
      {Array.from({ length: lines }).map((_, idx) => (
        <div key={idx} className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2 animate-pulse" />
      ))}
    </div>
  );
}

export default function Voucher(){
  const { user } = useAuth();
  const { scopeUserId, readOnly, scopedProfile, profile, setProfileState } = useUserScope();
  const currentYear = new Date().getFullYear();
  const activeUserId = scopeUserId ?? user?.id ?? null;
  const viewingLabel = scopedProfile
    ? (scopedProfile.full_name && scopedProfile.full_name.trim()) || scopedProfile.email
    : user?.email ?? 'your account';
  const readOnlyMessage = 'Supervisor accounts have read-only access.';

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [showNewYearModal, setShowNewYearModal] = useState(false);

  const [vouchers, setVouchers] = useState<SimpleVoucher[]>(defaultVouchers);
  const [persistedCashData, setPersistedCashData] = useState<{ cashInflows?: unknown; cashOutflows?: unknown }>({
    cashInflows: createEmptyCashArray(),
    cashOutflows: createEmptyCashArray(),
  });
  const [currentRowId, setCurrentRowId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [lockedColumns, setLockedColumns] = useState<Record<string, boolean>>({});
  const [yearlyTotals, setYearlyTotals] = useState<YearlyTotal[]>([]);
  const [lastPersistedForecastKey, setLastPersistedForecastKey] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const zeroMonths = useMemo(() => monthsOrder.reduce((acc, month) => ({ ...acc, [month]: 0 }), {} as Record<string, number>), []);
  const blankVouchers = useMemo(() => defaultVouchers.map(v => ({ ...v, months: { ...zeroMonths } })), [zeroMonths]);

  useEffect(() => {
    let mounted = true;
    async function load(){
      if (!activeUserId) {
        if (!mounted) return;
        setVouchers([]);
        setPersistedCashData({
          cashInflows: createEmptyCashArray(),
          cashOutflows: createEmptyCashArray(),
        });
        setCurrentRowId(null);
        setAvailableYears([currentYear]);
        setError('You are not authenticated to see the data.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const list = await getVouchers({ userId: activeUserId ?? undefined });
        if (!mounted) return;
        const scopedList = (list || []).filter((v: any) => v.user_id === activeUserId && v.data?.year);
        const years = Array.from(new Set(scopedList.map((v: any) => Number(v.data.year))));
        const sortedYears = years.length ? years.sort((a, b) => a - b) : [currentYear];
        setAvailableYears(sortedYears);
        setSelectedYear(prev => sortedYears.includes(prev) ? prev : sortedYears[sortedYears.length - 1]);

        const totals = sortedYears.map((year) => {
          const entriesForYear = scopedList.filter((v: any) => Number(v.data?.year) === year && v.data?.vouchers);
          const yearTotal = entriesForYear.reduce((sum: number, entry: any) => {
            const voucherRows = (entry.data?.vouchers as SimpleVoucher[] | undefined) ?? [];
            return sum + voucherRows.reduce((rowSum, voucherRow) => rowSum + calculateVoucherRowTotals(voucherRow).totalAmount, 0);
          }, 0);
          return { year, total: yearTotal };
        });
        setYearlyTotals(totals);

        const found = scopedList.find((v: any) => Number(v.data?.year) === selectedYear && v.data?.vouchers);
        if (found) {
          setVouchers(found.data?.vouchers || blankVouchers);
          setPersistedCashData(extractCashData(found.data as Record<string, unknown>));
          setCurrentRowId(found.id);
        } else {
          setVouchers(blankVouchers);
          setPersistedCashData({
            cashInflows: createEmptyCashArray(),
            cashOutflows: createEmptyCashArray(),
          });
          setCurrentRowId(null);
        }
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError('Failed to load data from server.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [activeUserId, selectedYear, currentYear, blankVouchers]);

  useEffect(() => {
    if (!profile?.id) return;
    const settings = (profile.settings as { voucherLocks?: Record<string, boolean> } | null) ?? null;
    const profileLocks = settings?.voucherLocks ?? {};
    setLockedColumns(profileLocks);
  }, [profile?.id, JSON.stringify(profile?.settings)]);

  const persistVoucherLocks = async (nextLocks: Record<string, boolean>) => {
    if (!profile?.id) return;
    try {
      const currentSettings = (profile.settings as Record<string, unknown> | null) ?? {};
      const newSettings = { ...currentSettings, voucherLocks: nextLocks };
      const updated = await updateProfileSettings(profile.id, newSettings);
      setProfileState(updated);
    } catch (error) {
      console.error('Failed to save voucher locks', error);
      setToast({ text: 'Failed to sync locks. Try again.', tone: 'error' });
    }
  };

  const isColumnLocked = (key: string) => Boolean(lockedColumns[key]);

  const handleColumnLockToggle = async (key: string, label: string) => {
    if (!profile?.id) {
      setToast({ text: 'Profile still loading. Try again in a moment.', tone: 'info' });
      return;
    }
    const nextState = !isColumnLocked(key);
    const nextLocks = { ...lockedColumns, [key]: nextState };
    setLockedColumns(nextLocks);
    setToast({ text: `${label} ${nextState ? 'locked' : 'unlocked'}.`, tone: 'info' });
    await persistVoucherLocks(nextLocks);
  };

  const renderLockAction = (key: string, label: string) => {
    const locked = isColumnLocked(key);
    const Icon = locked ? Lock : Unlock;
    const controlsDisabled = !profile?.id;
    return (
      <button
        type="button"
        onClick={() => void handleColumnLockToggle(key, label)}
        className={`p-1 rounded border ${
          locked ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-slate-500/40 text-slate-300 hover:text-white'
        } ${controlsDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
        title={locked ? `Unlock ${label}` : `Lock ${label}`}
        disabled={controlsDisabled}
      >
        <Icon size={14} />
      </button>
    );
  };

  const handleDataPlanChange = (id: string, value: string) => {
    setVouchers(prev => prev.map(row => row.id === id ? { ...row, dataPlan: value } : row));
  };

  const handleDurationChange = (id: string, value: string) => {
    setVouchers(prev => prev.map(row => row.id === id ? { ...row, duration: value } : row));
  };

  const handlePriceChange = (id: string, value: string) => {
    setVouchers(prev => prev.map(row => row.id === id ? { ...row, unitPrice: safeNumber(value) } : row));
  };

  const handleMonthChange = (id: string, month: string, value: string) => {
    const cleaned = safeNumber(value);
    setVouchers(prev => prev.map(row => row.id === id ? { ...row, months: { ...row.months, [month]: cleaned } } : row));
  };

  const handleAddVoucherRow = () => {
    setVouchers(prev => ([
      ...prev,
      { id: makeId('voucher-'), dataPlan: '', duration: '', unitPrice: 0, months: { ...zeroMonths } }
    ]));
  };

  const handleDeleteVoucherRow = (id: string) => {
    if (!ensureWritable()) return;
    setVouchers(prev => prev.filter(row => row.id !== id));
    setToast({ text: 'Plan removed.', tone: 'info' });
  };

  const ensureWritable = () => {
    if (!user) {
      setError('You are not authenticated to modify data.');
      return false;
    }
    if (readOnly) {
      setError(readOnlyMessage);
      return false;
    }
    return true;
  };

  const handleImportClick = () => {
    if (!ensureWritable()) return;
    importInputRef.current?.click();
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!ensureWritable()) {
      event.target.value = '';
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames?.[0];
      if (!firstSheetName) {
        throw new Error('No sheets detected in file.');
      }
      const sheet = workbook.Sheets[firstSheetName];
      const rows = utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
      const importedRows = parseImportedVoucherRows(rows);
      if (!importedRows.length) {
        throw new Error('No voucher rows detected.');
      }
      setVouchers(importedRows);
      setCurrentRowId(null);
      setToast({ text: `Imported ${importedRows.length} plans from ${file.name}.`, tone: 'success' });
    } catch (importError) {
      console.error('Voucher import failed', importError);
      setError('Import failed. Ensure the file matches the export template.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleAddYear = async (year: number) => {
    if (!ensureWritable()) return;
    if (!year || Number.isNaN(year) || year < 2000 || year > 2100) {
      setError('Please enter a valid year between 2000 and 2100.');
      return;
    }
    if (availableYears.includes(year)) {
      setError('Year already exists.');
      return;
    }
    setAvailableYears(prev => Array.from(new Set([...prev, year])).sort((a, b) => a - b));
    setVouchers(blankVouchers);
    const blankCash = {
      cashInflows: createEmptyCashArray(),
      cashOutflows: createEmptyCashArray(),
    };
    setPersistedCashData(blankCash);
    setSelectedYear(year);
    setCurrentRowId(null);
    setShowNewYearModal(false);
    if (!user) {
      setToast({ text: `Year ${year} added locally.`, tone: 'info' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        year,
        vouchers: blankVouchers,
        cashInflows: blankCash.cashInflows,
        cashOutflows: blankCash.cashOutflows,
      };
      const created = await createVoucher(payload, user.id);
      setCurrentRowId(created.id);
      setToast({ text: `Year ${year} added and saved.`, tone: 'success' });
    } catch (err) {
      console.error(err);
      setError('Failed to create year on server.');
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    const monthTotals = monthsOrder.map(month => vouchers.reduce((sum, row) => sum + safeNumber(row.months[month]), 0));
    const monthRevenue = monthsOrder.map(month => vouchers.reduce((sum, row) => sum + safeNumber(row.months[month]) * safeNumber(row.unitPrice), 0));
    const totalUnits = monthTotals.reduce((a, b) => a + b, 0);
    const totalAmount = monthRevenue.reduce((a, b) => a + b, 0);
    return { monthTotals, totalUnits, totalAmount };
  }, [vouchers]);

  const forecast = useMemo(() => computeForecast(yearlyTotals), [yearlyTotals]);

  useEffect(() => {
    if (!forecast || !user?.id || activeUserId !== user.id) return;
    const key = `voucher-${user.id}-${forecast.year}-${Math.round(forecast.value)}-${forecast.method}-${forecast.note}`;
    if (key === lastPersistedForecastKey) return;

    let cancelled = false;
    const syncForecast = async () => {
      try {
        await upsertForecast({
          userId: user.id,
          year: forecast.year,
          value: forecast.value,
          method: forecast.method,
          note: forecast.note,
          source: 'voucher',
        });
        if (!cancelled) {
          setLastPersistedForecastKey(key);
        }
      } catch (err) {
        console.error('Failed to persist voucher forecast', err);
      }
    };

    syncForecast();
    return () => {
      cancelled = true;
    };
  }, [forecast, user?.id, activeUserId, lastPersistedForecastKey]);

  const handleSave = async () => {
    if (!ensureWritable()) return;
    if (!user) {
      setError('You are not authenticated to save data.');
      return;
    }
    const payload = {
      year: selectedYear,
      vouchers,
      cashInflows: persistedCashData.cashInflows ?? createEmptyCashArray(),
      cashOutflows: persistedCashData.cashOutflows ?? createEmptyCashArray(),
    };
    setSaving(true);
    setError(null);
    try {
      if (currentRowId) {
        await updateVoucher(currentRowId, payload, user.id);
        setToast({ text: 'Saved to server (updated).', tone: 'success' });
      } else {
        const created = await createVoucher(payload, user.id);
        setCurrentRowId(created.id);
        setToast({ text: 'Saved to server.', tone: 'success' });
      }
      setAvailableYears(prev => Array.from(new Set([...prev, selectedYear])).sort((a, b) => a - b));
    } catch (err) {
      console.error(err);
      setError('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteYear = async () => {
    if (!ensureWritable()) return;
    if (availableYears.length === 1) {
      setError('Cannot delete the only year.');
      return;
    }
    if (!confirm(`Delete all voucher data for year ${selectedYear}?`)) return;
    if (!user) {
      setError('You are not authenticated to delete data.');
      return;
    }
    setDeleting(true);
    setError(null);
    const previousYears = [...availableYears];
    try {
      const newYears = availableYears.filter(y => y !== selectedYear);
      setAvailableYears(newYears);
      setVouchers(blankVouchers);
      setPersistedCashData({
        cashInflows: createEmptyCashArray(),
        cashOutflows: createEmptyCashArray(),
      });
      setCurrentRowId(null);
      setSelectedYear(newYears.length ? newYears[newYears.length - 1] : currentYear);
      if (currentRowId) await deleteVoucher(currentRowId, user.id);
      setToast({ text: `Deleted vouchers for ${selectedYear}.`, tone: 'info' });
    } catch (err) {
      console.error(err);
      setAvailableYears(previousYears);
      setError('Delete failed — server error.');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    try {
      const header = ['Data Plan', 'Duration', 'Unit Price', ...monthsOrder, 'Total Amount', 'Total Units'];
      const body = vouchers.map(row => {
        const totals = calculateVoucherRowTotals(row);
        return [
          row.dataPlan,
          row.duration,
          safeNumber(row.unitPrice).toString(),
          ...monthsOrder.map(month => safeNumber(row.months[month]).toString()),
          totals.totalAmount.toString(),
          totals.totalUnits.toString(),
        ];
      });
      const summaryRow = [
        'TOTAL',
        '',
        '',
        ...summary.monthTotals.map(value => value.toString()),
        summary.totalAmount.toString(),
        summary.totalUnits.toString(),
      ];
      const csv = [header, ...body, summaryRow]
        .map(line => line.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `vouchers_${selectedYear}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setToast({ text: 'Exported as CSV.', tone: 'success' });
    } catch (err) {
      console.error(err);
      setError('Export failed.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 min-h-screen text-slate-900 dark:text-slate-100">
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFileImport}
      />
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Voucher Sales Tracking</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track sold vouchers per month and revenue.</p>
          {readOnly && (
            <p className="text-xs text-amber-500 mt-1">Viewing data for {viewingLabel}. Editing is disabled for supervisors.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <YearDropdown availableYears={availableYears} selectedYear={selectedYear} onChange={setSelectedYear} />
          {!readOnly && (
            <>
              <button onClick={() => setShowNewYearModal(true)} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> New Year
              </button>

              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
              </button>

              <button onClick={handleAddVoucherRow} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> Add Plan
              </button>
              <button
                onClick={handleImportClick}
                disabled={importing}
                className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded disabled:opacity-60"
              >
                <Upload className="w-4 h-4" /> {importing ? 'Importing…' : 'Import'}
              </button>
            </>
          )}
          <button onClick={handleExport} className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded">
            <Download className="w-4 h-4" /> Export
          </button>
          {!readOnly && (
            <button onClick={handleDeleteYear} disabled={deleting} className="flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting...' : 'Delete Year'}
            </button>
          )}
        </div>
      </div>

        {forecast && (
          <div className="px-6 pt-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm p-4 sm:p-5 flex flex-col gap-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Voucher sales forecast ({forecast.year})</p>
                  <p className="text-3xl font-semibold text-slate-900 dark:text-white">{formatTZS(forecast.value)} TZS</p>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-300">
                  <p className="font-medium text-slate-900 dark:text-white">Method: {forecast.method}</p>
                  <p>{forecast.note}</p>
                </div>
              </div>
              {!!yearlyTotals.length && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Historical totals:&nbsp;
                  {yearlyTotals.map((entry, idx) => (
                    <span key={entry.year}>
                      {entry.year}: {formatTZS(entry.total)} TZS{idx < yearlyTotals.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      <div className="p-4">
        {error && (
          <div className="mb-3 p-3 rounded bg-red-600/20 border border-red-600 text-red-700 dark:text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-8 overflow-auto flex-1">
        {loading ? (
          <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <LoadingSkeleton lines={8} />
          </div>
        ) : (
          <div className="w-full overflow-x-auto rounded-lg shadow border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
            <table className="min-w-[720px] w-full text-sm text-slate-900 dark:text-slate-100">
              <thead className="bg-blue-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                <tr>
                  <th className="p-2 border text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span>Data Plan</span>
                      {renderLockAction('dataPlan', 'Data Plan')}
                    </div>
                  </th>
                  <th className="p-2 border text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span>Duration (days)</span>
                      {renderLockAction('duration', 'Duration (days)')}
                    </div>
                  </th>
                  <th className="p-2 border text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span>Unit Price</span>
                      {renderLockAction('unitPrice', 'Unit Price')}
                    </div>
                  </th>
                  {monthsOrder.map(month => (
                    <th key={month} className="p-2 border text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span>{month}</span>
                        {renderLockAction(month, `${month} column`)}
                      </div>
                    </th>
                  ))}
                  <th className="p-2 border text-right">Total Amount</th>
                  <th className="p-2 border text-right">Units</th>
                  <th className="p-2 border text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((voucher, idx) => {
                    const totals = calculateVoucherRowTotals(voucher);
                  return (
                    <motion.tr
                      key={voucher.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-900/40'}
                    >
                      <td className="p-2 border">
                        <input value={voucher.dataPlan} onChange={e => handleDataPlanChange(voucher.id, e.target.value)} className={`w-full bg-transparent outline-none ${readOnly || isColumnLocked('dataPlan') ? 'opacity-60 cursor-not-allowed' : ''}`} placeholder="e.g., Unlimited" disabled={readOnly || isColumnLocked('dataPlan')} />
                      </td>
                      <td className="p-2 border">
                        <input value={voucher.duration} onChange={e => handleDurationChange(voucher.id, e.target.value)} className={`w-full bg-transparent outline-none ${readOnly || isColumnLocked('duration') ? 'opacity-60 cursor-not-allowed' : ''}`} placeholder="Duration" disabled={readOnly || isColumnLocked('duration')} />
                      </td>
                      <td className="p-2 border text-right">
                        <input type="number" min={0} value={voucher.unitPrice} onChange={e => handlePriceChange(voucher.id, e.target.value)} className={`w-full bg-transparent outline-none text-right ${readOnly || isColumnLocked('unitPrice') ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={readOnly || isColumnLocked('unitPrice')} />
                      </td>
                      {monthsOrder.map(month => (
                        <td key={month} className="p-2 border text-center">
                          <input type="number" min={0} value={voucher.months[month] ?? 0} onChange={e => handleMonthChange(voucher.id, month, e.target.value)} className={`w-full bg-transparent outline-none text-center ${readOnly || isColumnLocked(month) ? 'opacity-60 cursor-not-allowed' : ''}`} disabled={readOnly || isColumnLocked(month)} />
                        </td>
                      ))}
                      <td className="p-2 border text-right font-semibold">{totals.totalAmount.toLocaleString()}</td>
                      <td className="p-2 border text-right font-semibold">{totals.totalUnits.toLocaleString()}</td>
                      <td className="p-2 border text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteVoucherRow(voucher.id)}
                          className={`inline-flex items-center justify-center rounded border px-2 py-1 text-sm transition ${readOnly ? 'opacity-40 cursor-not-allowed border-slate-500/30 text-slate-400' : 'border-red-500/60 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10'}`}
                          title="Delete plan row"
                          disabled={readOnly}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </motion.tr>
                  );
                })}

                <tr className="bg-blue-100 font-semibold dark:bg-slate-900/70 dark:text-slate-100">
                  <td className="p-2 border" colSpan={3}>Totals</td>
                  {summary.monthTotals.map((value, idx) => (
                    <td key={monthsOrder[idx]} className="p-2 border text-center">{value.toLocaleString()}</td>
                  ))}
                  <td className="p-2 border text-right">{summary.totalAmount.toLocaleString()}</td>
                  <td className="p-2 border text-right">{summary.totalUnits.toLocaleString()}</td>
                  <td className="p-2 border" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewYearModal isOpen={showNewYearModal} onClose={() => setShowNewYearModal(false)} onAdd={handleAddYear} />
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
