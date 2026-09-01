
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Save, Plus, Trash2, Calendar, Lock, Unlock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { createVoucher, getVouchers, updateVoucher, deleteVoucher } from '../lib/voucherService';
import { updateProfileSettings } from '../lib/profileService';
import { upsertForecast } from '../lib/forecastService';
import { computeForecast, formatTZS, YearlyTotal } from '../lib/forecastUtils';

// -----------------------------
// Types
// -----------------------------
interface InvestmentRow {
  id: string;
  date: string;
  item: string;
  vendor: string;
  details: string;
  quantity: number;
  costPerItem: number;
  totalCost: number;
}

type EditableInvestmentField = 'date' | 'item' | 'vendor' | 'details' | 'quantity' | 'costPerItem';

// -----------------------------
// Defaults
// -----------------------------
const defaultRows: InvestmentRow[] = [
  { id: '1', date: '', item: '', vendor: '', details: '', quantity: 0, costPerItem: 0, totalCost: 0 },
  { id: '2', date: '', item: '', vendor: '', details: '', quantity: 0, costPerItem: 0, totalCost: 0 },
];

// -----------------------------
// Helpers
// -----------------------------
const makeId = (prefix = '') => `${prefix}${Date.now().toString(36)}-${Math.floor(Math.random()*1000)}`;

function safeNumber(val: unknown) {
  const n = Number(val as any);
  return Number.isFinite(n) ? n : 0;
}


// -----------------------------
// Small UI Components
// -----------------------------
function YearDropdown({ availableYears, selectedYear, onChange }:
  { availableYears:number[]; selectedYear:number; onChange:(y:number)=>void }){
  return (
    <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
      <Calendar className="w-5 h-5 text-slate-400" />
      <select value={selectedYear} onChange={e => onChange(Number(e.target.value))} className="bg-transparent text-white outline-none">
        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

function NewYearModal({ isOpen, onClose, onAdd }:{ isOpen:boolean; onClose:()=>void; onAdd:(year:number)=>void }){
  const [val, setVal] = useState('');
  useEffect(()=>{ if(!isOpen) setVal(''); }, [isOpen]);
  if(!isOpen) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y:0, opacity:1 }} exit={{ y:12, opacity:0 }} className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-lg w-full max-w-xs z-10">
        <h3 className="text-gray-900 dark:text-white font-semibold mb-3">Add new year</h3>
        <input type="number" min={2000} max={2100} value={val} onChange={e=>setVal(e.target.value)} placeholder="e.g. 2026" className="w-full border px-3 py-2 rounded mb-4 outline-none" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-gray-200 dark:bg-slate-700">Cancel</button>
          <button onClick={()=>onAdd(Number(val))} className="px-3 py-2 rounded bg-blue-600 text-white">Add</button>
        </div>
      </motion.div>
    </div>
  );
}

function Toast({ message, onClose }:{ message:string|null; onClose:()=>void }){
  return (
    <AnimatePresence>
      {message && (
        <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:20, opacity:0 }} className="fixed right-4 bottom-4 z-50">
          <div className="bg-green-900/90 text-green-100 px-4 py-3 rounded shadow flex items-center gap-4">
            <span>{message}</span>
            <button onClick={onClose} className="text-sm opacity-80">✕</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LoadingSkeleton({ lines=5 }:{ lines?:number }){
  return (
    <div className="p-4">
      {Array.from({length: lines}).map((_,i) => (
        <div key={i} className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2 animate-pulse" />
      ))}
    </div>
  );
}



export default function Investment(){
    // Import logic for Investment
    // Flexible header mapping for import
    // Improved normalization for flexible headers
    const normalizeHeader = (header: string) => {
      return header
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/\(tzs\)/g, '')
        .replace(/peritem|peritemtzs|costperitem|costperitemtzs/, 'costperitem')
        .replace(/totalcost|totalcosttzs/, 'totalcost')
        .replace(/details/, 'details')
        .replace(/quantity/, 'quantity')
        .replace(/date/, 'date')
        .replace(/item/, 'item')
        .replace(/vendor/, 'vendor');
    };

    const handleImportInvestment = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        // Map headers to InvestmentRow fields
        const headerMap: Record<string, string> = {
          date: 'date',
          item: 'item',
          vendor: 'vendor',
          details: 'details',
          quantity: 'quantity',
          costperitem: 'costPerItem',
          totalcost: 'totalCost',
        };
        const importedRows: InvestmentRow[] = json
          .filter(row => Object.values(row).some(v => v && String(v).trim() !== ''))
          .map((row) => {
            const mapped: any = {};
            Object.keys(row).forEach((key) => {
              const norm = normalizeHeader(key);
              if (headerMap[norm]) {
                mapped[headerMap[norm]] = row[key];
              }
            });
            return {
              id: makeId('inv-'),
              date: mapped.date || '',
              item: mapped.item || '',
              vendor: mapped.vendor || '',
              details: mapped.details || '',
              quantity: safeNumber(mapped.quantity),
              costPerItem: safeNumber(mapped.costPerItem),
              totalCost: safeNumber(mapped.totalCost ?? safeNumber(mapped.quantity) * safeNumber(mapped.costPerItem)),
            };
          });
        setRows(importedRows);
        setMessage(`Imported ${importedRows.length} investment records.`);
      } catch (err) {
        setMessage('Import failed. Invalid file format.');
      } finally {
        setLoading(false);
      }
    };
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

  const [rows, setRows] = useState<InvestmentRow[]>(defaultRows);
  const [currentRowId, setCurrentRowId] = useState<string | null>(null);
  const [lockedColumns, setLockedColumns] = useState<Record<string, boolean>>({});
  const [yearlyTotals, setYearlyTotals] = useState<YearlyTotal[]>([]);
  const [lastPersistedForecastKey, setLastPersistedForecastKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isColumnLocked = (key: string) => Boolean(lockedColumns[key]);

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

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!profile?.id) return;
    const settings = (profile.settings as { investmentLocks?: Record<string, boolean> } | null) ?? null;
    setLockedColumns(settings?.investmentLocks ?? {});
  }, [profile?.id, JSON.stringify(profile?.settings)]);

  const persistInvestmentLocks = async (nextLocks: Record<string, boolean>) => {
    if (!profile?.id) return;
    try {
      const currentSettings = (profile.settings as Record<string, unknown> | null) ?? {};
      const newSettings = { ...currentSettings, investmentLocks: nextLocks };
      const updated = await updateProfileSettings(profile.id, newSettings);
      setProfileState(updated);
    } catch (err) {
      console.error('Failed to save investment locks', err);
      setMessage('Failed to sync column locks.');
    }
  };

  const handleLockToggle = async (key: string, label: string) => {
    if (!profile?.id) {
      setMessage('Profile still loading. Try again.');
      return;
    }
    const nextState = !isColumnLocked(key);
    const nextLocks = { ...lockedColumns, [key]: nextState };
    setLockedColumns(nextLocks);
    setMessage(`${label} ${nextState ? 'locked' : 'unlocked'}.`);
    await persistInvestmentLocks(nextLocks);
  };

  const renderLockAction = (key: string, label: string) => {
    const locked = isColumnLocked(key);
    const Icon = locked ? Lock : Unlock;
    const disabled = !profile?.id;
    return (
      <button
        type="button"
        onClick={() => handleLockToggle(key, label)}
        className={`p-1 rounded border ${
          locked ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-slate-500/40 text-slate-300 hover:text-white'
        } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
        disabled={disabled}
        title={locked ? `Unlock ${label}` : `Lock ${label}`}
      >
        <Icon size={14} />
      </button>
    );
  };

  const isFieldDisabled = (key: string) => readOnly || isColumnLocked(key);
  const fieldClass = (key: string, extra = '') => `${extra} ${isFieldDisabled(key) ? 'opacity-60 cursor-not-allowed' : ''}`.trim();

  useEffect(() => {
    let mounted = true;
    async function load(){
      if (!activeUserId) {
        if (!mounted) return;
        setRows([]);
        setCurrentRowId(null);
        setAvailableYears([currentYear]);
        setError(user ? 'Select a user to see the data.' : 'You are not authenticated to see the data.');
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
          const entry = scopedList.find((v: any) => Number(v.data?.year) === year);
          const investmentRows = (entry?.data?.investment as InvestmentRow[] | undefined) ?? [];
          const total = investmentRows.reduce((sum, row) => sum + safeNumber(row.totalCost), 0);
          return { year, total };
        });
        setYearlyTotals(totals);

        const found = scopedList.find((v: any) => Number(v.data?.year) === selectedYear && v.data?.investment);
        if (found) {
          setRows(found.data?.investment || defaultRows);
          setCurrentRowId(found.id);
        } else {
          setRows(defaultRows);
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
  }, [activeUserId, user, selectedYear, currentYear]);

  const forecast = useMemo(() => computeForecast(yearlyTotals), [yearlyTotals]);

  useEffect(() => {
    if (!forecast || !user?.id || activeUserId !== user.id) return;
    const key = `${user.id}-${forecast.year}-${Math.round(forecast.value)}-${forecast.method}-${forecast.note}`;
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
          source: 'investment',
        });
        if (!cancelled) {
          setLastPersistedForecastKey(key);
        }
      } catch (err) {
        console.error('Failed to persist investment forecast', err);
      }
    };

    syncForecast();
    return () => {
      cancelled = true;
    };
  }, [forecast, user?.id, activeUserId, lastPersistedForecastKey]);

  const handleCellChange = (id: string, field: EditableInvestmentField, value: string | number) => {
    if (readOnly || isColumnLocked(field)) return;
    setRows(prev => prev.map(row =>
      row.id === id
        ? {
            ...row,
            [field]: field === 'quantity' || field === 'costPerItem' ? safeNumber(value) : value,
            totalCost: (() => {
              if (field === 'quantity') return safeNumber(value) * row.costPerItem;
              if (field === 'costPerItem') return row.quantity * safeNumber(value);
              return row.quantity * row.costPerItem;
            })()
          }
        : row
    ));
  };

  const handleDelete = (id: string) => {
    if (!ensureWritable()) return;
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const handleAddRow = () => {
    if (!ensureWritable()) return;
    setRows(prev => [
      ...prev,
      { id: makeId('inv-'), date: '', item: '', vendor: '', details: '', quantity: 0, costPerItem: 0, totalCost: 0 }
    ]);
  };

  const calculateTotal = () => rows.reduce((sum, row) => sum + safeNumber(row.totalCost), 0);

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
    setRows(defaultRows);
    setSelectedYear(year);
    setCurrentRowId(null);
    setShowNewYearModal(false);
    try {
      setSaving(true);
      const payload = { year, investment: defaultRows };
      const created = await createVoucher(payload, user.id);
      setCurrentRowId(created.id);
      setMessage(`Year ${year} added and saved.`);
    } catch (err) {
      console.error(err);
      setError('Failed to create year on server.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!ensureWritable()) return;
    const payload = { year: selectedYear, investment: rows };
    setSaving(true);
    setError(null);
    try {
      if (currentRowId) {
        await updateVoucher(currentRowId, payload, user.id);
        setMessage('Saved to server (updated).');
      } else {
        const created = await createVoucher(payload, user.id);
        setCurrentRowId(created.id);
        setMessage('Saved to server.');
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
    if (!confirm(`Delete all Investment data for year ${selectedYear}?`)) return;

    setDeleting(true);
    setError(null);
    const previousYears = [...availableYears];
    try {
      const newYears = availableYears.filter(y => y !== selectedYear);
      setAvailableYears(newYears);
      setRows(defaultRows);
      setCurrentRowId(null);
      setSelectedYear(newYears.length ? newYears[newYears.length - 1] : currentYear);
      if (currentRowId) {
        await deleteVoucher(currentRowId, user.id);
      }
      setMessage(`Deleted all Investment data for ${selectedYear}.`);
    } catch (err) {
      console.error(err);
      setAvailableYears(previousYears);
      setError('Delete failed (server).');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = () => {
    if (!rows.length) {
      setMessage('No data to export.');
      return;
    }
    const header = ['Date', 'Item', 'Vendor/brand', 'Details/Specs', 'Quantity', 'Cost per item(Tzs)', 'Total Cost(Tzs)'];
    const rowsData = rows.map(row => ([
      row.date,
      row.item,
      row.vendor,
      row.details,
      row.quantity,
      row.costPerItem,
      row.totalCost,
    ]));
    const totalRow = ['', 'Total', '', '', '', '', calculateTotal()];
    const lines = [header, ...rowsData, totalRow]
      .map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investment_${selectedYear}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage('Exported as CSV.');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 min-h-screen text-slate-900 dark:text-slate-100">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Investment Spreadsheet</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Add and track capital investments per year.</p>
          {readOnly && (
            <p className="text-xs text-amber-500 mt-1">Viewing data for {viewingLabel}. Editing is disabled for supervisors.</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <YearDropdown availableYears={availableYears} selectedYear={selectedYear} onChange={setSelectedYear} />
          {!readOnly && (
            <>
              <label htmlFor="investment-import" className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded cursor-pointer hover:bg-blue-500">
                Import Investment
                <input
                  id="investment-import"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleImportInvestment}
                />
              </label>
              <button onClick={() => setShowNewYearModal(true)} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> New Year
              </button>

              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
              </button>

              <button onClick={handleAddRow} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> Add Row
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
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Next year forecast ({forecast.year})</p>
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
          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800"><LoadingSkeleton lines={6} /></div>
            <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800"><LoadingSkeleton lines={6} /></div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="w-full overflow-x-auto rounded-lg shadow border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <table className="min-w-[600px] w-full text-sm text-slate-900 dark:text-slate-100">
                <thead className="bg-blue-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  <tr>
                    <th className="p-2 border text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span>Date</span>
                        {renderLockAction('date', 'Date column')}
                      </div>
                    </th>
                    <th className="p-2 border text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span>Item</span>
                        {renderLockAction('item', 'Item column')}
                      </div>
                    </th>
                    <th className="p-2 border text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span>Vendor/brand</span>
                        {renderLockAction('vendor', 'Vendor column')}
                      </div>
                    </th>
                    <th className="p-2 border text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span>Details/Specs</span>
                        {renderLockAction('details', 'Details column')}
                      </div>
                    </th>
                    <th className="p-2 border text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>Quantity</span>
                        {renderLockAction('quantity', 'Quantity column')}
                      </div>
                    </th>
                    <th className="p-2 border text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>Cost per item(Tzs)</span>
                        {renderLockAction('costPerItem', 'Cost per item column')}
                      </div>
                    </th>
                    <th className="p-2 border text-right">Total Cost(Tzs)</th>
                    <th className="p-2 border text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-900/40'}
                    >
                      <td className="p-2 border">
                        <input
                          value={row.date}
                          onChange={e => handleCellChange(row.id, 'date', e.target.value)}
                          className={fieldClass('date', 'w-full bg-transparent outline-none')}
                          placeholder="e.g., Jan-03"
                          disabled={isFieldDisabled('date')}
                        />
                      </td>
                      <td className="p-2 border">
                        <input
                          value={row.item}
                          onChange={e => handleCellChange(row.id, 'item', e.target.value)}
                          className={fieldClass('item', 'w-full bg-transparent outline-none')}
                          placeholder="e.g., Switch"
                          disabled={isFieldDisabled('item')}
                        />
                      </td>
                      <td className="p-2 border">
                        <input
                          value={row.vendor}
                          onChange={e => handleCellChange(row.id, 'vendor', e.target.value)}
                          className={fieldClass('vendor', 'w-full bg-transparent outline-none')}
                          placeholder="e.g., Cisco"
                          disabled={isFieldDisabled('vendor')}
                        />
                      </td>
                      <td className="p-2 border">
                        <input
                          value={row.details}
                          onChange={e => handleCellChange(row.id, 'details', e.target.value)}
                          className={fieldClass('details', 'w-full bg-transparent outline-none')}
                          placeholder="Details"
                          disabled={isFieldDisabled('details')}
                        />
                      </td>
                      <td className="p-2 border text-right">
                        <input
                          type="number"
                          min={0}
                          value={row.quantity}
                          onChange={e => handleCellChange(row.id, 'quantity', Number(e.target.value))}
                          className={fieldClass('quantity', 'w-full bg-transparent outline-none text-right')}
                          disabled={isFieldDisabled('quantity')}
                        />
                      </td>
                      <td className="p-2 border text-right">
                        <input
                          type="number"
                          min={0}
                          value={row.costPerItem}
                          onChange={e => handleCellChange(row.id, 'costPerItem', Number(e.target.value))}
                          className={fieldClass('costPerItem', 'w-full bg-transparent outline-none text-right')}
                          disabled={isFieldDisabled('costPerItem')}
                        />
                      </td>
                      <td className="p-2 border text-right">{row.totalCost.toLocaleString()}</td>
                      <td className="p-2 border text-center">
                        <button
                          onClick={() => handleDelete(row.id)}
                          className={`text-red-600 hover:text-red-800 ${readOnly ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                          disabled={readOnly}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}

                  <tr className="bg-blue-100 dark:bg-slate-900/70 dark:text-slate-100">
                    <td colSpan={6} className="p-2 border font-bold">Total</td>
                    <td className="p-2 border text-right font-bold">{calculateTotal().toLocaleString()}</td>
                    <td className="p-2 border" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <NewYearModal isOpen={showNewYearModal} onClose={() => setShowNewYearModal(false)} onAdd={handleAddYear} />
      <Toast message={message} onClose={() => setMessage(null)} />
    </div>
  );
}
