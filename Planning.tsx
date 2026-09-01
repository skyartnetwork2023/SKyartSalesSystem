import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Save, Plus, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { createVoucher, getVouchers, updateVoucher, deleteVoucher } from '../lib/voucherService';

type ToastState = { text: string; tone: 'success' | 'error' | 'info' } | null;

interface PlanNote {
  id: string;
  name: string;
  content: string;
}

interface PendingRow {
  id: string;
  date: string;
  customer: string;
  amount: number;
}

const makeId = (prefix = '') => `${prefix}${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

const buildDefaultNotes = () => [
  { id: makeId('note-'), name: '', content: '' },
  { id: makeId('note-'), name: '', content: '' },
];

const buildDefaultPendingRows = () => ([
  { id: makeId('pending-'), date: '1-Jan', customer: "Mang'eru", amount: 5000 },
  { id: makeId('pending-'), date: '12-Jan', customer: "Pwing'e", amount: 2000 },
]);

const safeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  const cleaned = String(value)
    .replace(/[^0-9.-]/g, '')
    .replace(/(\..*)\./, '$1');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
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
  useEffect(() => { if (!isOpen) setVal(''); }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }} className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-lg w-full max-w-xs z-10">
        <h3 className="text-gray-900 dark:text-white font-semibold mb-3">Add new year</h3>
        <input
          type="number"
          min={2000}
          max={2100}
          value={val}
          onChange={e => setVal(e.target.value)}
          className="w-full border px-3 py-2 rounded mb-4 outline-none"
          placeholder="e.g. 2026"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-gray-200 dark:bg-slate-700">Cancel</button>
          <button onClick={() => onAdd(Number(val))} className="px-3 py-2 rounded bg-blue-600 text-white">Add</button>
        </div>
      </motion.div>
    </div>
  );
}

function Toast({ message, onClose }: { message: ToastState; onClose: () => void }){
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

function LoadingSkeleton({ lines = 6 }:{ lines?:number }){
  return (
    <div className="p-4">
      {Array.from({ length: lines }).map((_, idx) => (
        <div key={idx} className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2 animate-pulse" />
      ))}
    </div>
  );
}

export default function Planning(){
  const normalizeHeader = (header: string) => (header ? String(header).toLowerCase().replace(/[^a-z0-9]/g, '') : '');

  const asText = (value: unknown) => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString().split('T')[0];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return String(value).trim();
  };

  const pickSheetName = (sheetNames: string[], pattern: RegExp) => {
    if (!sheetNames.length) return null;
    const normalized = sheetNames.map(name => ({ raw: name, normalized: normalizeHeader(name) }));
    return normalized.find(({ normalized }) => pattern.test(normalized))?.raw ?? sheetNames[0] ?? null;
  };

  const parsePlanningSheet = (sheet: XLSX.WorkSheet): PlanNote[] => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (!rows.length) return [];

    const planningHeaderMap: Record<string, 'name' | 'content'> = {
      name: 'name',
      title: 'name',
      note: 'name',
      notename: 'name',
      notetitle: 'name',
      project: 'name',
      plan: 'name',
      section: 'name',
      topic: 'name',
      subject: 'name',
      content: 'content',
      details: 'content',
      detail: 'content',
      description: 'content',
      notes: 'content',
      summary: 'content',
      comment: 'content',
      comments: 'content',
    };

    const hasAlias = rows.some(row =>
      Object.keys(row).some(key => planningHeaderMap[normalizeHeader(key)])
    );

    return rows.reduce<PlanNote[]>((acc, row) => {
      if (hasAlias) {
        const mapped: { name?: string; content?: string } = {};
        Object.entries(row).forEach(([key, value]) => {
          const target = planningHeaderMap[normalizeHeader(key)];
          if (!target) return;
          mapped[target] = asText(value);
        });
        const name = mapped.name ?? '';
        const content = mapped.content ?? '';
        if (!name && !content) return acc;
        acc.push({ id: makeId('note-'), name, content });
        return acc;
      }

      const orderedValues = Object.values(row).map(asText).filter(Boolean);
      if (!orderedValues.length) return acc;
      const [first, ...rest] = orderedValues;
      const name = rest.length ? first : '';
      const content = rest.length ? rest.join('\n') : first;
      acc.push({ id: makeId('note-'), name, content });
      return acc;
    }, []);
  };

  const parsePendingSheet = (sheet: XLSX.WorkSheet): PendingRow[] => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (!rows.length) return [];

    const pendingHeaderMap: Record<string, 'date' | 'customer' | 'amount'> = {
      date: 'date',
      duedate: 'date',
      expecteddate: 'date',
      scheduleddate: 'date',
      paymentdate: 'date',
      invoicedate: 'date',
      day: 'date',
      customer: 'customer',
      client: 'customer',
      vendor: 'customer',
      supplier: 'customer',
      name: 'customer',
      company: 'customer',
      customername: 'customer',
      clientname: 'customer',
      vendorname: 'customer',
      entity: 'customer',
      description: 'customer',
      amount: 'amount',
      pendingamount: 'amount',
      amountdue: 'amount',
      value: 'amount',
      outstanding: 'amount',
      balance: 'amount',
      total: 'amount',
      payable: 'amount',
    };

    const hasAlias = rows.some(row =>
      Object.keys(row).some(key => pendingHeaderMap[normalizeHeader(key)])
    );

    return rows.reduce<PendingRow[]>((acc, row) => {
      if (hasAlias) {
        const mapped: { date?: string; customer?: string; amount?: number } = {};
        Object.entries(row).forEach(([key, value]) => {
          const target = pendingHeaderMap[normalizeHeader(key)];
          if (!target) return;
          if (target === 'amount') {
            const parsedAmount = safeNumber(value);
            if (parsedAmount !== 0 || value === 0 || value === '0') {
              mapped.amount = parsedAmount;
            }
          } else if (target === 'date') {
            mapped.date = asText(value);
          } else {
            mapped.customer = asText(value);
          }
        });
        const date = mapped.date ?? '';
        const customer = mapped.customer ?? '';
        const amount = mapped.amount ?? 0;
        if (!date && !customer && amount === 0) return acc;
        acc.push({ id: makeId('pending-'), date, customer, amount });
        return acc;
      }

      const ordered = Object.values(row);
      const textValues = ordered.map(asText).filter(Boolean);
      if (!ordered.length || !textValues.length) return acc;

      const date = textValues[0] ?? '';
      const customer = textValues[1] ?? '';
      let amount = 0;
      for (const candidate of ordered.slice().reverse()) {
        const parsed = safeNumber(candidate);
        if (parsed !== 0 || candidate === 0 || candidate === '0') {
          amount = parsed;
          break;
        }
      }

      if (!date && !customer && amount === 0) return acc;
      acc.push({ id: makeId('pending-'), date, customer, amount });
      return acc;
    }, []);
  };

  const handleImportPlanning = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetNames = workbook.SheetNames ?? [];
      if (!sheetNames.length) throw new Error('No sheets found in the file.');

      const sheetName = pickSheetName(sheetNames, /plan|note|project|strategy|agenda/);
      if (!sheetName) throw new Error('Planning sheet not found.');
      const planningSheet = workbook.Sheets[sheetName];
      if (!planningSheet) throw new Error('Planning sheet is empty.');

      const importedNotes = parsePlanningSheet(planningSheet);
      if (!importedNotes.length) {
        setToast({ text: 'Planning file contained no recognizable rows. Existing notes unchanged.', tone: 'info' });
      } else {
        setNotes(importedNotes);
        setToast({ text: `Imported ${importedNotes.length} planning notes.`, tone: 'success' });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Planning import error:', errorMsg, err);
      setError(`Import failed: ${errorMsg}`);
      setToast({ text: `Import failed: ${errorMsg}`, tone: 'error' });
    } finally {
      setLoading(false);
      if (input) input.value = '';
    }
  };

  const handleImportPending = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetNames = workbook.SheetNames ?? [];
      if (!sheetNames.length) throw new Error('No sheets found in the file.');

      const sheetName = pickSheetName(sheetNames, /pending|payment|receivable|payable|outstanding|due/);
      if (!sheetName) throw new Error('Pending payments sheet not found.');
      const pendingSheet = workbook.Sheets[sheetName];
      if (!pendingSheet) throw new Error('Pending payments sheet is empty.');

      const importedPending = parsePendingSheet(pendingSheet);
      if (!importedPending.length) {
        setToast({ text: 'Pending payments file contained no recognizable rows. Existing entries unchanged.', tone: 'info' });
      } else {
        setPendingRows(importedPending);
        setToast({ text: `Imported ${importedPending.length} pending payments.`, tone: 'success' });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Pending import error:', errorMsg, err);
      setError(`Import failed: ${errorMsg}`);
      setToast({ text: `Import failed: ${errorMsg}`, tone: 'error' });
    } finally {
      setLoading(false);
      if (input) input.value = '';
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

  const [notes, setNotes] = useState<PlanNote[]>(() => buildDefaultNotes());
  const [currentRowId, setCurrentRowId] = useState<string | null>(null);
  const [pendingRows, setPendingRows] = useState<PendingRow[]>(() => buildDefaultPendingRows());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const blankNotes = useMemo(() => buildDefaultNotes(), []);
  const blankPendingRows = useMemo(() => buildDefaultPendingRows(), []);
  const pendingTotal = useMemo(() => pendingRows.reduce((sum, row) => sum + safeNumber(row.amount), 0), [pendingRows]);

  const normalizePendingRows = (rows?: Partial<PendingRow>[] | null): PendingRow[] => {
    if (!rows?.length) return blankPendingRows;
    return rows.map(row => ({
      id: typeof row?.id === 'string' ? row.id : makeId('pending-'),
      date: typeof row?.date === 'string' ? row.date : '',
      customer: typeof row?.customer === 'string' ? row.customer : '',
      amount: safeNumber(row?.amount),
    }));
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
        setNotes([]);
        setCurrentRowId(null);
        setAvailableYears([currentYear]);
        setPendingRows(blankPendingRows);
        setError(user ? 'Select a user to see the data.' : 'You are not authenticated to see the data.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const list = await getVouchers({ userId: activeUserId ?? undefined });
        if (!mounted) return;
        const years = Array.from(new Set((list || [])
          .filter((v: any) => v.user_id === activeUserId && v.data?.year)
          .map((v: any) => Number(v.data.year))));
        const sortedYears = years.length ? years.sort((a, b) => a - b) : [currentYear];
        const resolvedYear = sortedYears.includes(selectedYear) ? selectedYear : sortedYears[sortedYears.length - 1];
        setAvailableYears(sortedYears);
        if (resolvedYear !== selectedYear) {
          setSelectedYear(resolvedYear);
        }
        const found = (list || []).find((v: any) => v.user_id === activeUserId && Number(v.data?.year) === resolvedYear && v.data?.planning);
        if (found) {
          const loadedNotes = Array.isArray(found.data?.planning) && found.data.planning.length
            ? found.data.planning
            : blankNotes;
          setNotes(loadedNotes);
          setCurrentRowId(found.id);
          setPendingRows(normalizePendingRows(found.data?.pendingPayments as PendingRow[] | null));
        } else {
          setNotes(blankNotes);
          setCurrentRowId(null);
          setPendingRows(blankPendingRows);
        }
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError('Failed to load data from server.');
        setNotes(blankNotes);
        setCurrentRowId(null);
        setPendingRows(blankPendingRows);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [activeUserId, user, selectedYear, currentYear, blankNotes, blankPendingRows]);

  const handleNoteChange = (id: string, field: keyof PlanNote, value: string) => {
    setNotes(prev => prev.map(note => note.id === id ? { ...note, [field]: value } : note));
  };

  const handleDeleteNote = (id: string) => {
    if (!ensureWritable()) return;
    setNotes(prev => prev.filter(note => note.id !== id));
  };

  const handleAddNote = () => {
    if (!ensureWritable()) return;
    setNotes(prev => ([...prev, { id: makeId('note-'), name: '', content: '' }]));
  };

  const handlePendingFieldChange = (id: string, field: 'date' | 'customer', value: string) => {
    setPendingRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handlePendingAmountChange = (id: string, value: string) => {
    setPendingRows(prev => prev.map(row => row.id === id ? { ...row, amount: safeNumber(value) } : row));
  };

  const handleAddPendingRow = () => {
    if (!ensureWritable()) return;
    setPendingRows(prev => ([...prev, { id: makeId('pending-'), date: '', customer: '', amount: 0 }]));
  };

  const handleDeletePendingRow = (id: string) => {
    if (!ensureWritable()) return;
    setPendingRows(prev => prev.filter(row => row.id !== id));
  };

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
    setNotes(blankNotes);
    setPendingRows(blankPendingRows);
    setSelectedYear(year);
    setCurrentRowId(null);
    setShowNewYearModal(false);
    try {
      setSaving(true);
      const payload = { year, planning: blankNotes, pendingPayments: blankPendingRows };
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
    const payload = { year: selectedYear, planning: notes, pendingPayments: pendingRows };
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
    if (!confirm(`Delete all Planning data for ${selectedYear}?`)) return;
    setDeleting(true);
    setError(null);
    const previousYears = [...availableYears];
    try {
      const remaining = availableYears.filter(year => year !== selectedYear);
      setAvailableYears(remaining);
      setNotes(blankNotes);
      setCurrentRowId(null);
      setSelectedYear(remaining.length ? remaining[remaining.length - 1] : currentYear);
      setPendingRows(blankPendingRows);
      if (currentRowId) await deleteVoucher(currentRowId, user.id);
      setToast({ text: `Deleted Planning data for ${selectedYear}.`, tone: 'info' });
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
      const csvRows: string[][] = [];
      csvRows.push(['Planning Notes']);
      csvRows.push(['Name', 'Content']);
      csvRows.push(...notes.map(note => [note.name ?? '', note.content ?? '']));
      csvRows.push([]);
      csvRows.push(['Pending Payments']);
      csvRows.push(['Date', 'Customer', 'Pending Amount']);
      csvRows.push(...pendingRows.map(row => [row.date ?? '', row.customer ?? '', safeNumber(row.amount).toString()]));
      csvRows.push(['Total', '', pendingTotal.toString()]);
      const csv = csvRows
        .map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `planning_${selectedYear}.csv`;
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
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Planning Notepads</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Capture project notes and plans per year.</p>
          {readOnly && (
            <p className="text-xs text-amber-500 mt-1">Viewing data for {viewingLabel}. Editing is disabled for supervisors.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <YearDropdown availableYears={availableYears} selectedYear={selectedYear} onChange={setSelectedYear} />

          {!readOnly && (
            <>
              <label htmlFor="planning-import" className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded cursor-pointer hover:bg-blue-500">
                Import Planning
                <input
                  id="planning-import"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleImportPlanning}
                />
              </label>
              <label htmlFor="pending-import" className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded cursor-pointer hover:bg-indigo-500">
                Import Pending Payments
                <input
                  id="pending-import"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleImportPending}
                />
              </label>
              <button onClick={() => setShowNewYearModal(true)} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> New Year
              </button>

              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
              </button>

              <button onClick={handleAddNote} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> Add Note
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

      <div className="p-4 sm:p-8 overflow-auto flex-1">
        {loading ? (
          <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <LoadingSkeleton lines={6} />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="w-full overflow-x-auto rounded-lg shadow border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <table className="min-w-[420px] w-full text-sm text-slate-900 dark:text-slate-100">
                <thead className="bg-blue-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  <tr>
                    <th className="p-2 border text-left">Name</th>
                    <th className="p-2 border text-left">Content</th>
                    <th className="p-2 border text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((note, idx) => (
                    <motion.tr
                      key={note.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-900/40'}
                    >
                      <td className="p-2 border">
                        <input
                          value={note.name}
                          onChange={e => handleNoteChange(note.id, 'name', e.target.value)}
                          className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                          placeholder="Notepad name"
                          disabled={readOnly}
                        />
                      </td>
                      <td className="p-2 border">
                        <textarea
                          value={note.content}
                          onChange={e => handleNoteChange(note.id, 'content', e.target.value)}
                          className={`w-full bg-transparent outline-none min-h-[68px] ${readOnlyFieldClass}`}
                          placeholder="Write your notes here..."
                          disabled={readOnly}
                        />
                      </td>
                      <td className="p-2 border text-center">
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className={`text-red-600 hover:text-red-800 ${readOnly ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                          disabled={readOnly}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Pending Payments</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Track outstanding balances and keep running totals updated.</p>
                </div>
                {!readOnly && (
                  <button onClick={handleAddPendingRow} className="self-start sm:self-auto flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                    <Plus className="w-4 h-4" /> Add Row
                  </button>
                )}
              </div>

              <div className="w-full overflow-x-auto rounded-lg shadow border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <table className="min-w-[420px] w-full text-sm text-slate-900 dark:text-slate-100">
                  <thead className="bg-emerald-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                    <tr>
                      <th className="p-2 border text-left">Date</th>
                      <th className="p-2 border text-left">Customers</th>
                      <th className="p-2 border text-right">Pending Amount</th>
                      <th className="p-2 border text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500 dark:text-slate-400">No pending payments. Add a row to begin.</td>
                      </tr>
                    ) : (
                      pendingRows.map((row, idx) => (
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
                              onChange={e => handlePendingFieldChange(row.id, 'date', e.target.value)}
                              className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                              placeholder="e.g. 1-Jan"
                              disabled={readOnly}
                            />
                          </td>
                          <td className="p-2 border">
                            <input
                              value={row.customer}
                              onChange={e => handlePendingFieldChange(row.id, 'customer', e.target.value)}
                              className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                              placeholder="Customer name"
                              disabled={readOnly}
                            />
                          </td>
                          <td className="p-2 border text-right">
                            <input
                              type="number"
                              min="0"
                              value={row.amount}
                              onChange={e => handlePendingAmountChange(row.id, e.target.value)}
                              className={`w-full bg-transparent text-right outline-none ${readOnlyFieldClass}`}
                              placeholder="0"
                              disabled={readOnly}
                            />
                          </td>
                          <td className="p-2 border text-center">
                            <button
                              onClick={() => handleDeletePendingRow(row.id)}
                              className={`text-red-600 hover:text-red-800 ${readOnly ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                              disabled={readOnly}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-900/60 font-semibold">
                      <td className="p-2 border" colSpan={2}>Total</td>
                      <td className="p-2 border text-right">{pendingTotal.toLocaleString()}</td>
                      <td className="p-2 border" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <NewYearModal isOpen={showNewYearModal} onClose={() => setShowNewYearModal(false)} onAdd={handleAddYear} />
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
