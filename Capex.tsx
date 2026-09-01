import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Save, Plus, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { createVoucher, getVouchers, updateVoucher, deleteVoucher } from '../lib/voucherService';

type ToastState = { text: string; tone: 'success' | 'error' | 'info' } | null;

interface CapexRow {
  id: string;
  date: string;
  item: string;
  details: string;
  quantity: number;
  costPerItem: number;
  totalCost: number;
}

const seedRows = [
  { date: 'Jan-03', item: 'EAP 225', details: 'TP-Link access point, dual-band OMADA outdoor AP', quantity: 3, costPerItem: 250000 },
  { date: 'Feb-02', item: 'EAP 110', details: '', quantity: 2, costPerItem: 150000 },
];

const makeId = (prefix = '') => `${prefix}${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

const safeNumber = (value: unknown) => {
  const parsed = Number(value as any);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildDefaultRows = () => seedRows.map(row => ({
  id: makeId('capex-'),
  ...row,
  totalCost: row.quantity * row.costPerItem,
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

export default function Capex(){
    // Import logic for Capex
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
        .replace(/item/, 'item');
    };

    const handleImportCapex = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        // Map headers to CapexRow fields
        const headerMap: Record<string, string> = {
          date: 'date',
          item: 'item',
          details: 'details',
          quantity: 'quantity',
          costperitem: 'costPerItem',
          totalcost: 'totalCost',
        };
        const importedRows: CapexRow[] = json
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
              id: makeId('capex-'),
              date: mapped.date || '',
              item: mapped.item || '',
              details: mapped.details || '',
              quantity: safeNumber(mapped.quantity),
              costPerItem: safeNumber(mapped.costPerItem),
              totalCost: safeNumber(mapped.totalCost ?? safeNumber(mapped.quantity) * safeNumber(mapped.costPerItem)),
            };
          });
        setRows(importedRows);
        setToast({ text: `Imported ${importedRows.length} capex records.`, tone: 'success' });
      } catch (err) {
        setToast({ text: 'Import failed. Invalid file format.', tone: 'error' });
      } finally {
        setLoading(false);
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

  const [rows, setRows] = useState<CapexRow[]>(() => buildDefaultRows());
  const [currentRowId, setCurrentRowId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const blankRows = useMemo(() => buildDefaultRows(), []);

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
        const found = scopedList.find((v: any) => Number(v.data?.year) === resolvedYear && v.data?.capex);
        if (found) {
          setRows((found.data?.capex || blankRows).map((row: any) => ({
            ...row,
            id: row.id || makeId('capex-'),
            quantity: safeNumber(row.quantity),
            costPerItem: safeNumber(row.costPerItem),
            totalCost: safeNumber(row.totalCost ?? safeNumber(row.quantity) * safeNumber(row.costPerItem)),
          })));
          setCurrentRowId(found.id);
        } else {
          setRows(blankRows);
          setCurrentRowId(null);
        }
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError('Failed to load data from server.');
        setRows(blankRows);
        setCurrentRowId(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [activeUserId, user, selectedYear, currentYear, blankRows]);

  const handleCellChange = (id: string, field: keyof CapexRow, value: string) => {
    setRows(prev => prev.map(row => {
      if (row.id !== id) return row;
      if (field === 'quantity' || field === 'costPerItem') {
        const next = field === 'quantity' ? safeNumber(value) : safeNumber(value);
        const quantity = field === 'quantity' ? next : row.quantity;
        const costPerItem = field === 'costPerItem' ? next : row.costPerItem;
        return {
          ...row,
          [field]: next,
          totalCost: safeNumber(quantity) * safeNumber(costPerItem),
        };
      }
      return {
        ...row,
        [field]: value,
      };
    }));
  };

  const handleAddRow = () => {
    if (!ensureWritable()) return;
    setRows(prev => ([
      ...prev,
      { id: makeId('capex-'), date: '', item: '', details: '', quantity: 0, costPerItem: 0, totalCost: 0 }
    ]));
  };

  const handleDeleteRow = (id: string) => {
    if (!ensureWritable()) return;
    setRows(prev => prev.filter(row => row.id !== id));
  };

  const calculateTotal = useMemo(() => rows.reduce((sum, row) => sum + safeNumber(row.totalCost), 0), [rows]);

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
    setSelectedYear(year);
    setCurrentRowId(null);
    setShowNewYearModal(false);
    try {
      setSaving(true);
      const payload = { year, capex: blankRows };
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
    const payload = { year: selectedYear, capex: rows };
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
      // Reload data from Supabase to ensure UI is up to date
      setLoading(true);
      try {
        const list = await getVouchers({ userId: activeUserId ?? undefined });
        const scopedList = (list || []).filter((v: any) => v.user_id === activeUserId && v.data?.year);
        const found = scopedList.find((v: any) => Number(v.data?.year) === selectedYear && v.data?.capex);
        if (found) {
          setRows((found.data?.capex || blankRows).map((row: any) => ({
            ...row,
            id: row.id || makeId('capex-'),
            quantity: safeNumber(row.quantity),
            costPerItem: safeNumber(row.costPerItem),
            totalCost: safeNumber(row.totalCost ?? safeNumber(row.quantity) * safeNumber(row.costPerItem)),
          })));
          setCurrentRowId(found.id);
        } else {
          setRows(blankRows);
          setCurrentRowId(null);
        }
      } catch (err) {
        console.error('Failed to reload data after save', err);
      } finally {
        setLoading(false);
      }
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
    if (!confirm(`Delete all Capex data for ${selectedYear}?`)) return;
    setDeleting(true);
    setError(null);
    const previousYears = [...availableYears];
    try {
      const remaining = availableYears.filter(year => year !== selectedYear);
      setAvailableYears(remaining);
      setRows(blankRows);
      setCurrentRowId(null);
      setSelectedYear(remaining.length ? remaining[remaining.length - 1] : currentYear);
      if (currentRowId) await deleteVoucher(currentRowId, user.id);
      setToast({ text: `Deleted Capex data for ${selectedYear}.`, tone: 'info' });
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
      const header = ['Date', 'Item', 'Details', 'Quantity', 'Cost Per Item', 'Total Cost'];
      const body = rows.map(row => [
        row.date,
        row.item,
        row.details,
        safeNumber(row.quantity),
        safeNumber(row.costPerItem),
        safeNumber(row.totalCost),
      ]);
      const totalRow = ['Total', '', '', '', '', calculateTotal];
      const lines = [header, ...body, totalRow]
        .map(line => line.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','));
      const csv = lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `capex_${selectedYear}.csv`;
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
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Capex Spreadsheet</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track capital expenditures and totals for each year.</p>
          {readOnly && (
            <p className="text-xs text-amber-500 mt-1">Viewing data for {viewingLabel}. Editing is disabled for supervisors.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <YearDropdown availableYears={availableYears} selectedYear={selectedYear} onChange={setSelectedYear} />
          {!readOnly && (
            <>
              <label htmlFor="capex-import" className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded cursor-pointer hover:bg-blue-500">
                Import Capex
                <input
                  id="capex-import"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleImportCapex}
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
                  <th className="p-2 border text-left">Date</th>
                  <th className="p-2 border text-left">Item</th>
                  <th className="p-2 border text-left">Details</th>
                  <th className="p-2 border text-right">Quantity</th>
                  <th className="p-2 border text-right">Cost per item (TZS)</th>
                  <th className="p-2 border text-right">Total cost (TZS)</th>
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
                        className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                        placeholder="e.g., Jan-03"
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        value={row.item}
                        onChange={e => handleCellChange(row.id, 'item', e.target.value)}
                        className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                        placeholder="e.g., Router"
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        value={row.details}
                        onChange={e => handleCellChange(row.id, 'details', e.target.value)}
                        className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                        placeholder="Details"
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-2 border text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.quantity}
                        onChange={e => handleCellChange(row.id, 'quantity', e.target.value)}
                        className={`w-full bg-transparent outline-none text-right ${readOnlyFieldClass}`}
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-2 border text-right">
                      <input
                        type="number"
                        min={0}
                        value={row.costPerItem}
                        onChange={e => handleCellChange(row.id, 'costPerItem', e.target.value)}
                        className={`w-full bg-transparent outline-none text-right ${readOnlyFieldClass}`}
                        disabled={readOnly}
                      />
                    </td>
                    <td className="p-2 border text-right font-semibold">{safeNumber(row.totalCost).toLocaleString()}</td>
                    <td className="p-2 border text-center">
                      <button
                        onClick={() => handleDeleteRow(row.id)}
                        className={`text-red-600 hover:text-red-800 ${readOnly ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}`}
                        disabled={readOnly}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
                <tr className="bg-blue-100 font-semibold dark:bg-slate-900/70 dark:text-slate-100">
                  <td className="p-2 border" colSpan={5}>Total</td>
                  <td className="p-2 border text-right">{calculateTotal.toLocaleString()}</td>
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


