import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Save, Plus, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { createVoucher, getVouchers, updateVoucher, deleteVoucher } from '../lib/voucherService';

type ToastState = { text: string; tone: 'success' | 'error' | 'info' } | null;

interface OpexRow {
  id: string;
  item: string;
  expense: string;
  interval: string;
  frequency: number;
  costPerFrequency: number;
  totalCost: number;
}

interface OpRow {
  id: string;
  date: string;
  description: string;
  cost: number;
}

const makeId = (prefix = '') => `${prefix}${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

const safeNumber = (value: unknown) => {
  const parsed = Number(value as any);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatImportedDate = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code?.(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const year = String(parsed.y).padStart(4, '0');
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  return String(value ?? '').trim();
};

const buildDefaultOpexRows = () => Array.from({ length: 6 }).map((_, idx) => ({
  id: makeId('opex-'),
  item: `${idx + 1}`,
  expense: '',
  interval: 'Monthly',
  frequency: 2,
  costPerFrequency: 0,
  totalCost: 0,
}));

const buildDefaultOpRows = () => Array.from({ length: 3 }).map(() => ({
  id: makeId('op-'),
  date: '',
  description: '',
  cost: 0,
}));

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

export default function Opex(){
    // Import logic for Opex
    // Flexible header mapping for import
    // Improved normalization for flexible headers
    const normalizeHeader = (header: string) => {
      const sanitized = (header ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      if (sanitized.includes('totalcost') || sanitized.includes('overall')) return 'totalcost';
      if (sanitized.includes('costper') || sanitized.includes('rate')) return 'costperfrequency';
      if (sanitized.includes('frequency') || sanitized.includes('count')) return 'frequency';
      if (sanitized.includes('interval') || sanitized.includes('period')) return 'interval';
      if (sanitized.includes('description') || sanitized.includes('details') || sanitized.includes('operation')) return 'description';
      if (sanitized.includes('expense') || sanitized.includes('category')) return 'expense';
      if (sanitized.includes('item') || sanitized.includes('line')) return 'item';
      if (sanitized.includes('date')) return 'date';
      if (sanitized.includes('cost') || sanitized.includes('amount')) return 'cost';
      return sanitized;
    };

    const handleImportRecurring = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error('Missing worksheet');
        const recurringJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const headerMap: Record<string, string> = {
          item: 'item',
          expense: 'expense',
          interval: 'interval',
          frequency: 'frequency',
          costperfrequency: 'costPerFrequency',
          totalcost: 'totalCost',
        };
        const importedRecurring: OpexRow[] = recurringJson
          .filter((row) => Object.values(row).some((v) => v && String(v).trim() !== ''))
          .map((row, idx) => {
            const mapped: Record<string, unknown> = {};
            Object.keys(row).forEach((key) => {
              const norm = normalizeHeader(key);
              if (headerMap[norm]) {
                mapped[headerMap[norm]] = row[key];
              }
            });
            const frequency = safeNumber(mapped.frequency);
            const costPerFrequency = safeNumber(mapped.costPerFrequency);
            return {
              id: makeId('opex-'),
              item: String(mapped.item ?? `${idx + 1}`),
              expense: String(mapped.expense ?? ''),
              interval: String(mapped.interval ?? 'Monthly'),
              frequency,
              costPerFrequency,
              totalCost: safeNumber(mapped.totalCost ?? frequency * costPerFrequency),
            };
          });
        setRows(importedRecurring.length ? importedRecurring : blankRows);
        setToast({ text: `Imported ${importedRecurring.length} recurring records.`, tone: 'success' });
      } catch (err) {
        console.error('Recurring Opex import failed', err);
        setToast({ text: 'Recurring import failed. Invalid file format.', tone: 'error' });
      } finally {
        setLoading(false);
        if (event.target) event.target.value = '';
      }
    };

    const handleImportOperations = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error('Missing worksheet');
        const opJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const headerMap: Record<string, string> = {
          date: 'date',
          description: 'description',
          expense: 'description',
          cost: 'cost',
        };
        const importedOperations: OpRow[] = opJson
          .filter((row) => Object.values(row).some((v) => v && String(v).trim() !== ''))
          .map((row) => {
            const mapped: Record<string, unknown> = {};
            Object.keys(row).forEach((key) => {
              const norm = normalizeHeader(key);
              if (headerMap[norm]) {
                mapped[headerMap[norm]] = row[key];
              }
            });
            const formattedDate = formatImportedDate(mapped.date);
            const description = String(mapped.description ?? '').trim();
            return {
              id: makeId('op-'),
              date: formattedDate,
              description,
              cost: safeNumber(mapped.cost),
            };
          })
          .filter((row) => {
            const dateLabel = row.date.toLowerCase();
            const descriptionLabel = row.description.toLowerCase();
            if (!row.date && !row.description && !row.cost) return false;
            if (['total', 'grand total', 'grandtotal'].includes(dateLabel)) return false;
            if (['total', 'grand total', 'grandtotal'].includes(descriptionLabel)) return false;
            return true;
          });
        setOpRows(importedOperations.length ? importedOperations : blankOpRows);
        setToast({ text: `Imported ${importedOperations.length} operation records.`, tone: 'success' });
      } catch (err) {
        console.error('Operation Opex import failed', err);
        setToast({ text: 'Operations import failed. Invalid file format.', tone: 'error' });
      } finally {
        setLoading(false);
        if (event.target) event.target.value = '';
      }
    };
  const { user } = useAuth();
  const { scopeUserId, readOnly, scopedProfile } = useUserScope();
  const currentYear = new Date().getFullYear();
  const activeUserId = scopeUserId ?? user?.id ?? null;
  const viewingLabel = scopedProfile
    ? (scopedProfile.full_name && scopedProfile.full_name.trim()) || scopedProfile.email
    : user?.email ?? 'your account';
  const readOnlyMessage = 'Supervisor accounts have read-only access.';
  const readOnlyFieldClass = readOnly ? 'opacity-60 cursor-not-allowed' : '';

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
  const [showNewYearModal, setShowNewYearModal] = useState(false);

  const [rows, setRows] = useState<OpexRow[]>(() => buildDefaultOpexRows());
  const [opRows, setOpRows] = useState<OpRow[]>(() => buildDefaultOpRows());
  const [currentRowId, setCurrentRowId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [zoom, setZoom] = useState(1);

  const blankRows = useMemo(() => buildDefaultOpexRows(), []);
  const blankOpRows = useMemo(() => buildDefaultOpRows(), []);

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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let mounted = true;
    async function load(){
      if (!activeUserId) {
        if (!mounted) return;
        setRows([]);
        setOpRows([]);
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
        const resolvedYear = sortedYears.includes(selectedYear) ? selectedYear : sortedYears[sortedYears.length - 1];
        setAvailableYears(sortedYears);
        if (resolvedYear !== selectedYear) setSelectedYear(resolvedYear);

        const found = scopedList.find((v: any) => Number(v.data?.year) === resolvedYear && v.data?.opex);
        if (found) {
          const fetchedRows = (found.data?.opex || blankRows).map((row: any, idx: number) => {
            const frequency = safeNumber(row.frequency ?? 0);
            const costPerFrequency = safeNumber(row.costPerFrequency ?? 0);
            return {
              id: row.id || makeId('opex-'),
              item: row.item ?? `${idx + 1}`,
              expense: row.expense ?? '',
              interval: row.interval ?? 'Monthly',
              frequency,
              costPerFrequency,
              totalCost: safeNumber(row.totalCost ?? frequency * costPerFrequency),
            } as OpexRow;
          });
          const fetchedOpRows = (found.data?.opexop || blankOpRows).map((row: any) => ({
            id: row.id || makeId('op-'),
            date: row.date ?? '',
            description: row.description ?? '',
            cost: safeNumber(row.cost ?? 0),
          } as OpRow));
          setRows(fetchedRows);
          setOpRows(fetchedOpRows);
          setCurrentRowId(found.id);
        } else {
          setRows(blankRows);
          setOpRows(blankOpRows);
          setCurrentRowId(null);
        }
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError('Failed to load data from server.');
        setRows(blankRows);
        setOpRows(blankOpRows);
        setCurrentRowId(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [activeUserId, user, selectedYear, currentYear, blankRows, blankOpRows]);

  const handleRecurringChange = (id: string, field: keyof OpexRow, value: string) => {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      if (field === 'frequency' || field === 'costPerFrequency') {
        const next = safeNumber(value);
        const frequency = field === 'frequency' ? next : row.frequency;
        const costPerFrequency = field === 'costPerFrequency' ? next : row.costPerFrequency;
        return {
          ...row,
          [field]: next,
          totalCost: safeNumber(frequency) * safeNumber(costPerFrequency),
        };
      }
      return { ...row, [field]: value };
    }));
  };

  const handleOperationChange = (id: string, field: keyof OpRow, value: string) => {
    setOpRows(prev => prev.map(row => row.id === id ? { ...row, [field]: field === 'cost' ? safeNumber(value) : value } : row));
  };

  const handleAddRecurringRow = () => {
    if (!ensureWritable()) return;
    setRows(prev => ([
      ...prev,
      {
        id: makeId('opex-'),
        item: `${prev.length + 1}`,
        expense: '',
        interval: 'Monthly',
        frequency: 0,
        costPerFrequency: 0,
        totalCost: 0,
      },
    ]));
  };

  const handleAddOperationRow = () => {
    if (!ensureWritable()) return;
    setOpRows(prev => ([
      ...prev,
      { id: makeId('op-'), date: '', description: '', cost: 0 },
    ]));
  };

  const handleDeleteRecurringRow = (id: string) => {
    if (!ensureWritable()) return;
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const handleDeleteOperationRow = (id: string) => {
    if (!ensureWritable()) return;
    setOpRows(prev => prev.filter(row => row.id !== id));
  };

  const recurringTotal = useMemo(() => rows.reduce((sum, row) => sum + safeNumber(row.totalCost), 0), [rows]);
  const operationTotal = useMemo(() => opRows.reduce((sum, row) => sum + safeNumber(row.cost), 0), [opRows]);
  const grandTotal = recurringTotal + operationTotal;

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
    setRows(blankRows);
    setOpRows(blankOpRows);
    setSelectedYear(year);
    setCurrentRowId(null);
    setShowNewYearModal(false);
    try {
      setSaving(true);
      const payload = { year, opex: blankRows, opexop: blankOpRows };
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

  const handleSave = async () => {
    if (!ensureWritable()) return;
    const payload = { year: selectedYear, opex: rows, opexop: opRows };
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
    if (!confirm(`Delete all Opex data for ${selectedYear}?`)) return;
    setDeleting(true);
    setError(null);
    const previousYears = [...availableYears];
    try {
      const remaining = availableYears.filter(year => year !== selectedYear);
      setAvailableYears(remaining);
      setRows(blankRows);
      setOpRows(blankOpRows);
      setCurrentRowId(null);
      setSelectedYear(remaining.length ? remaining[remaining.length - 1] : currentYear);
      if (currentRowId) await deleteVoucher(currentRowId, user.id);
      setToast({ text: `Deleted Opex data for ${selectedYear}.`, tone: 'info' });
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
      const recurringHeader = ['Item', 'Recurring Expense', 'Interval', 'Frequency', 'Cost per Frequency', 'Total Cost'];
      const recurringBody = rows.map(row => [
        row.item,
        row.expense,
        row.interval,
        safeNumber(row.frequency),
        safeNumber(row.costPerFrequency),
        safeNumber(row.totalCost),
      ]);
      const operationHeader = ['Date', 'Operation Expense', 'Cost'];
      const operationBody = opRows.map(row => [
        row.date,
        row.description,
        safeNumber(row.cost),
      ]);

      const csvSections = [
        [recurringHeader, ...recurringBody],
        [['', '', '', '', 'Total', recurringTotal]],
        [[]],
        [operationHeader, ...operationBody],
        [['Total', '', operationTotal]],
        [[]],
        [['Grand Total', '', grandTotal]],
      ];

      const csv = csvSections
        .map(section => section
          .map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
          .join('\n'))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `opex_${selectedYear}.csv`;
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
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Opex Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track recurring and one-off operational expenses per year.</p>
          {readOnly && (
            <p className="text-xs text-amber-500 mt-1">Viewing data for {viewingLabel}. Editing is disabled for supervisors.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <YearDropdown availableYears={availableYears} selectedYear={selectedYear} onChange={setSelectedYear} />
          {!readOnly && (
            <>
              <label htmlFor="opex-recurring-import" className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded cursor-pointer hover:bg-blue-500">
                Import Recurring
                <input
                  id="opex-recurring-import"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleImportRecurring}
                />
              </label>
              <label htmlFor="opex-operations-import" className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded cursor-pointer hover:bg-blue-500">
                Import Operations
                <input
                  id="opex-operations-import"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleImportOperations}
                />
              </label>
              <button onClick={() => setShowNewYearModal(true)} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> New Year
              </button>

              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
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

      <div className="p-4">
        {error && (
          <div className="mb-3 p-3 rounded bg-red-600/20 border border-red-600 text-red-700 dark:text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="px-4 sm:px-8 pb-4 flex flex-wrap gap-4 items-center">
        {!readOnly && (
          <>
            <button onClick={handleAddRecurringRow} className="bg-slate-700 text-white px-3 py-2 rounded">
              + Add Recurring Row
            </button>
            <button onClick={handleAddOperationRow} className="bg-slate-700 text-white px-3 py-2 rounded">
              + Add Operation Row
            </button>
          </>
        )}
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <label htmlFor="zoom-slider">Zoom</label>
          <input id="zoom-slider" type="range" min="0.5" max="2" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-32" />
          <span>{Math.round(zoom * 100)}%</span>
        </div>
        <div className="ml-auto rounded bg-blue-100 dark:bg-blue-900/40 px-4 py-2 text-sm text-blue-800 dark:text-blue-200">
          Grand Total: {grandTotal.toLocaleString()}
        </div>
      </div>

      <div className="p-4 sm:p-8 pt-0 overflow-auto flex-1">
        {loading ? (
          <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <LoadingSkeleton lines={10} />
          </div>
        ) : (
          <>
            <div className="w-full overflow-x-auto rounded-lg shadow border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 mb-8">
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', minWidth: '720px', width: 'fit-content', transition: 'transform 0.2s' }}>
                <table className="min-w-[720px] w-full text-sm text-slate-900 dark:text-slate-100">
                  <thead className="bg-blue-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                    <tr>
                      <th className="p-2 border text-left">Item</th>
                      <th className="p-2 border text-left">Recurring Expense</th>
                      <th className="p-2 border text-left">Interval</th>
                      <th className="p-2 border text-center">Frequency</th>
                      <th className="p-2 border text-right">Cost per frequency</th>
                      <th className="p-2 border text-right">Total cost</th>
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
                            value={row.item}
                            onChange={e => handleRecurringChange(row.id, 'item', e.target.value)}
                            className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                            placeholder="1"
                            disabled={readOnly}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            value={row.expense}
                            onChange={e => handleRecurringChange(row.id, 'expense', e.target.value)}
                            className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                            placeholder="e.g., Data subscription"
                            disabled={readOnly}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            value={row.interval}
                            onChange={e => handleRecurringChange(row.id, 'interval', e.target.value)}
                            className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                            placeholder="Monthly"
                            disabled={readOnly}
                          />
                        </td>
                        <td className="p-2 border text-center">
                          <input
                            type="number"
                            min={0}
                            value={row.frequency}
                            onChange={e => handleRecurringChange(row.id, 'frequency', e.target.value)}
                            className={`w-full bg-transparent outline-none text-center ${readOnlyFieldClass}`}
                            disabled={readOnly}
                          />
                        </td>
                        <td className="p-2 border text-right">
                          <input
                            type="number"
                            min={0}
                            value={row.costPerFrequency}
                            onChange={e => handleRecurringChange(row.id, 'costPerFrequency', e.target.value)}
                            className={`w-full bg-transparent outline-none text-right ${readOnlyFieldClass}`}
                            disabled={readOnly}
                          />
                        </td>
                        <td className="p-2 border text-right font-semibold">{safeNumber(row.totalCost).toLocaleString()}</td>
                        <td className="p-2 border text-center">
                          <button
                            onClick={() => handleDeleteRecurringRow(row.id)}
                            className={`text-red-600 hover:text-red-800 ${readOnly ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                            disabled={readOnly}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                    <tr className="bg-blue-100 font-semibold dark:bg-slate-900/70 dark:text-slate-100">
                      <td className="p-2 border" colSpan={5}>Recurring Total</td>
                      <td className="p-2 border text-right">{recurringTotal.toLocaleString()}</td>
                      <td className="p-2 border" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="w-full overflow-x-auto rounded-lg shadow border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', minWidth: '600px', width: 'fit-content', transition: 'transform 0.2s' }}>
                <table className="min-w-[600px] w-full text-sm text-slate-900 dark:text-slate-100">
                  <thead className="bg-blue-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                    <tr>
                      <th className="p-2 border text-left">Date</th>
                      <th className="p-2 border text-left">Operation expense</th>
                      <th className="p-2 border text-right">Cost</th>
                      <th className="p-2 border text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opRows.map((row, idx) => (
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
                            onChange={e => handleOperationChange(row.id, 'date', e.target.value)}
                            className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                            placeholder="Jan-01"
                            disabled={readOnly}
                          />
                        </td>
                        <td className="p-2 border">
                          <input
                            value={row.description}
                            onChange={e => handleOperationChange(row.id, 'description', e.target.value)}
                            className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                            placeholder="Labour wages"
                            disabled={readOnly}
                          />
                        </td>
                        <td className="p-2 border text-right">
                          <input
                            type="number"
                            min={0}
                            value={row.cost}
                            onChange={e => handleOperationChange(row.id, 'cost', e.target.value)}
                            className={`w-full bg-transparent outline-none text-right ${readOnlyFieldClass}`}
                            disabled={readOnly}
                          />
                        </td>
                        <td className="p-2 border text-center">
                          <button
                            onClick={() => handleDeleteOperationRow(row.id)}
                            className={`text-red-600 hover:text-red-800 ${readOnly ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                            disabled={readOnly}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                    <tr className="bg-blue-100 font-semibold dark:bg-slate-900/70 dark:text-slate-100">
                      <td className="p-2 border" colSpan={2}>Operation Total</td>
                      <td className="p-2 border text-right">{operationTotal.toLocaleString()}</td>
                      <td className="p-2 border" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <NewYearModal isOpen={showNewYearModal} onClose={() => setShowNewYearModal(false)} onAdd={handleAddYear} />
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
