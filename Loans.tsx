
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Save, Plus, Trash2, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { createVoucher, getVouchers, updateVoucher, deleteVoucher } from '../lib/voucherService';

// -----------------------------
// Types
// -----------------------------
interface LoanRow { id: string; date: string; creditor: string; amount: number }
interface RepaymentRow { id: string; date: string; debtor: string; amount: number }

// -----------------------------
// Defaults
// -----------------------------
const defaultLoanRows: LoanRow[] = [
  { id: '1', date: '', creditor: '', amount: 0 },
  { id: '2', date: '', creditor: '', amount: 0 },
];
const defaultRepaymentRows: RepaymentRow[] = [
  { id: '1', date: '', debtor: '', amount: 0 },
  { id: '2', date: '', debtor: '', amount: 0 },
];

// -----------------------------
// Utility helpers
// -----------------------------
const makeId = (prefix = '') => `${prefix}${Date.now().toString(36)}-${Math.floor(Math.random()*1000)}`;

// Small UI components
// -----------------------------
function YearDropdown({ availableYears, selectedYear, onChange }: { availableYears:number[]; selectedYear:number; onChange:(y:number)=>void }){
  return (
    <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
      <Calendar className="w-5 h-5 text-slate-400" />
      <select value={selectedYear} onChange={e => onChange(Number(e.target.value))} className="bg-transparent text-white outline-none">
        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}

function NewYearModal({ isOpen, onClose, onAdd }: { isOpen:boolean; onClose:()=>void; onAdd:(year:number)=>void }){
  const [val, setVal] = useState('');
  useEffect(()=>{ if(!isOpen) setVal(''); }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:20, opacity:0 }} className="bg-white dark:bg-slate-900 rounded-lg p-6 shadow-lg w-full max-w-xs z-10">
        <h3 className="text-gray-900 dark:text-white font-semibold mb-3">Add new year</h3>
        <input type="number" min={2000} max={2100} value={val} onChange={e=>setVal(e.target.value)} className="w-full border px-3 py-2 rounded mb-4 outline-none" placeholder="e.g. 2026" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded bg-gray-200 dark:bg-slate-700">Cancel</button>
          <button onClick={()=>{ onAdd(Number(val)); }} className="px-3 py-2 rounded bg-blue-600 text-white">Add</button>
        </div>
      </motion.div>
    </div>
  );
}

function Toast({ message, onClose }: { message: string | null; onClose: ()=>void }){
  return (
    <AnimatePresence>
      {message && (
        <motion.div initial={{ y: 20, opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:20, opacity:0 }} className="fixed right-4 bottom-4 z-50">
          <div className="bg-green-900/90 text-green-100 px-4 py-3 rounded shadow flex items-center gap-4">
            <span>{message}</span>
            <button onClick={onClose} className="text-sm opacity-80">✕</button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LoadingSkeleton({ lines=5 }: { lines?: number }){
  return (
    <div className="p-4">
      {Array.from({length: lines}).map((_,i) => (
        <div key={i} className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2 animate-pulse" />
      ))}
    </div>
  );
}

export default function Loans(){
    // Import logic for Loans and Repayments
    // Flexible header mapping for import
    const normalizeHeader = (header: string) => (header ?? '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');

    const asText = (value: unknown) => {
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString().split('T')[0];
      return String(value).trim();
    };

    const toAmount = (value: unknown) => {
      if (value === null || value === undefined || value === '') return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      const cleaned = String(value).replace(/[^0-9.-]/g, '');
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const handleImportLoans = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error('Missing worksheet');
        const loansJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const headerMap: Record<string, keyof LoanRow> = {
          date: 'date',
          loandate: 'date',
          disbursementdate: 'date',
          startdate: 'date',
          creditdate: 'date',
          creditor: 'creditor',
          creditorname: 'creditor',
          lender: 'creditor',
          lendername: 'creditor',
          name: 'creditor',
          customer: 'creditor',
          customername: 'creditor',
          client: 'creditor',
          clientname: 'creditor',
          partner: 'creditor',
          company: 'creditor',
          supplier: 'creditor',
          vendor: 'creditor',
          amount: 'amount',
          loanamount: 'amount',
          principal: 'amount',
          value: 'amount',
          total: 'amount',
          balance: 'amount',
          outstanding: 'amount',
          payable: 'amount',
        };
        const importedLoans = loansJson.reduce<LoanRow[]>((acc, row) => {
          if (!Object.values(row).some((v) => v && String(v).trim() !== '')) return acc;
          const mapped: Partial<LoanRow> = {};
          Object.keys(row).forEach((key) => {
            const norm = normalizeHeader(key);
            if (headerMap[norm]) {
              mapped[headerMap[norm]] = row[key];
            }
          });
          const candidate: LoanRow = {
            id: makeId('loan-'),
            date: asText(mapped.date),
            creditor: asText(mapped.creditor),
            amount: toAmount(mapped.amount),
          };
          if (!candidate.date && !candidate.creditor && candidate.amount === 0) return acc;
          acc.push(candidate);
          return acc;
        }, []);
        setLoanRows(importedLoans.length ? importedLoans : defaultLoanRows);
        setMessage(`Imported ${importedLoans.length} loan records.`);
      } catch (err) {
        console.error('Loan import failed', err);
        setMessage('Loan import failed. Invalid file format.');
      } finally {
        setLoading(false);
        if (event.target) event.target.value = '';
      }
    };

    const handleImportRepayments = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setLoading(true);
      try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error('Missing worksheet');
        const repaymentsJson: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        const headerMap: Record<string, keyof RepaymentRow> = {
          date: 'date',
          repaymentdate: 'date',
          paymentdate: 'date',
          duedate: 'date',
          scheduleddate: 'date',
          debtor: 'debtor',
          debtorname: 'debtor',
          borrower: 'debtor',
          borrowername: 'debtor',
          payer: 'debtor',
          payee: 'debtor',
          paidby: 'debtor',
          repaymentby: 'debtor',
          madeby: 'debtor',
          name: 'debtor',
          customer: 'debtor',
          customername: 'debtor',
          client: 'debtor',
          clientname: 'debtor',
          debtorsname: 'debtor',
          debtordetails: 'debtor',
          debtorinfo: 'debtor',
          debtorfullname: 'debtor',
          debtorfull: 'debtor',
          vendor: 'debtor',
          vendorname: 'debtor',
          company: 'debtor',
          entity: 'debtor',
          person: 'debtor',
          personname: 'debtor',
          recipient: 'debtor',
          recipientname: 'debtor',
          contact: 'debtor',
          contactname: 'debtor',
          fullname: 'debtor',
          amount: 'amount',
          amountreturned: 'amount',
          returnedamount: 'amount',
          repaymentamount: 'amount',
          paidamount: 'amount',
          paymentamount: 'amount',
          value: 'amount',
          total: 'amount',
        };
        const importedRepayments = repaymentsJson.reduce<RepaymentRow[]>((acc, row) => {
          if (!Object.values(row).some((v) => v && String(v).trim() !== '')) return acc;
          const mapped: Partial<RepaymentRow> = {};
          Object.keys(row).forEach((key) => {
            const norm = normalizeHeader(key);
            if (headerMap[norm]) {
              mapped[headerMap[norm]] = row[key];
            }
          });
          if (!mapped.debtor) {
            const fallbackKey = Object.keys(row).find((key) => {
              const norm = normalizeHeader(key);
              return norm.includes('debtor') || norm.includes('borrower') || norm.includes('payer') || norm.includes('recipient');
            });
            if (fallbackKey) {
              mapped.debtor = row[fallbackKey];
            }
          }
          const candidate: RepaymentRow = {
            id: makeId('repay-'),
            date: asText(mapped.date),
            debtor: asText(mapped.debtor),
            amount: toAmount(mapped.amount),
          };
          if (!candidate.date && !candidate.debtor && candidate.amount === 0) return acc;
          acc.push(candidate);
          return acc;
        }, []);
        setRepaymentRows(importedRepayments.length ? importedRepayments : defaultRepaymentRows);
        setMessage(`Imported ${importedRepayments.length} repayment records.`);
      } catch (err) {
        console.error('Repayment import failed', err);
        setMessage('Repayment import failed. Invalid file format.');
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

  const [loanRows, setLoanRows] = useState<LoanRow[]>(defaultLoanRows);
  const [repaymentRows, setRepaymentRows] = useState<RepaymentRow[]>(defaultRepaymentRows);
  const [currentRowId, setCurrentRowId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState('');

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

  const safeNumber = (val: unknown) => toAmount(val);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 2000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const formatAmount = (value: number) => {
    const safe = Number.isFinite(value) ? value : 0;
    return safe.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const totalsByPerson = useMemo(() => {
    const aggregate = new Map<string, { credits: number; debts: number }>();

    loanRows.forEach((row) => {
      const name = (row.creditor || '').trim();
      if (!name) return;
      const entry = aggregate.get(name) ?? { credits: 0, debts: 0 };
      entry.credits += safeNumber(row.amount);
      aggregate.set(name, entry);
    });

    repaymentRows.forEach((row) => {
      const name = (row.debtor || '').trim();
      if (!name) return;
      const entry = aggregate.get(name) ?? { credits: 0, debts: 0 };
      entry.debts += safeNumber(row.amount);
      aggregate.set(name, entry);
    });

    return aggregate;
  }, [loanRows, repaymentRows]);

  const personOptions = useMemo(
    () => Array.from(totalsByPerson.keys()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [totalsByPerson]
  );

  useEffect(() => {
    if (!personOptions.length) {
      if (selectedPerson !== '') {
        setSelectedPerson('');
      }
      return;
    }

    if (!selectedPerson || !personOptions.includes(selectedPerson)) {
      setSelectedPerson(personOptions[0]);
    }
  }, [personOptions, selectedPerson]);

  const selectedTotals = selectedPerson ? totalsByPerson.get(selectedPerson) : undefined;
  const totalCreditsForSelected = selectedTotals?.credits ?? 0;
  const totalDebtsForSelected = selectedTotals?.debts ?? 0;
  const netDifference = totalCreditsForSelected - totalDebtsForSelected;
  const netVariant = netDifference > 0 ? 'credit' : netDifference < 0 ? 'debt' : 'even';
  const netBadgeClass =
    netVariant === 'credit'
      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
      : netVariant === 'debt'
        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
        : 'bg-slate-500/10 text-slate-300 border border-slate-500/20';
  const netLabel = netVariant === 'credit' ? 'Net credit' : netVariant === 'debt' ? 'Net debt' : 'Settled balance';

  useEffect(() => {
    let mounted = true;
    async function load(){
      if (!activeUserId) {
        if (!mounted) return;
        setLoanRows([]);
        setRepaymentRows([]);
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
        const scoped = (list || []).filter((v: any) => v.user_id === activeUserId && v.data?.year);
        const years = Array.from(new Set(scoped.map((v: any) => Number(v.data.year))));
        const sortedYears = years.length ? years.sort((a, b) => a - b) : [currentYear];
        setAvailableYears(sortedYears);
        setSelectedYear(prev => sortedYears.includes(prev) ? prev : sortedYears[sortedYears.length - 1]);

        const found = scoped.find((v: any) => Number(v.data?.year) === selectedYear && (v.data?.loans || v.data?.repayments));
        if (found) {
          setLoanRows(found.data?.loans || defaultLoanRows);
          setRepaymentRows(found.data?.repayments || defaultRepaymentRows);
          setCurrentRowId(found.id);
        } else {
          setLoanRows(defaultLoanRows);
          setRepaymentRows(defaultRepaymentRows);
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

  const handleLoanChange = (id: string, field: keyof LoanRow, value: string | number) => {
    if (readOnly) return;
    setLoanRows(prev => prev.map(row =>
      row.id === id
        ? { ...row, [field]: field === 'amount' ? safeNumber(value) : value }
        : row
    ));
  };

  const handleRepaymentChange = (id: string, field: keyof RepaymentRow, value: string | number) => {
    if (readOnly) return;
    setRepaymentRows(prev => prev.map(row =>
      row.id === id
        ? { ...row, [field]: field === 'amount' ? safeNumber(value) : value }
        : row
    ));
  };

  const handleDeleteLoan = (id: string) => {
    if (!ensureWritable()) return;
    setLoanRows(prev => prev.filter(row => row.id !== id));
  };
  const handleDeleteRepayment = (id: string) => {
    if (!ensureWritable()) return;
    setRepaymentRows(prev => prev.filter(row => row.id !== id));
  };

  const handleAddLoanRow = () => {
    if (!ensureWritable()) return;
    setLoanRows(prev => [...prev, { id: makeId('loan-'), date: '', creditor: '', amount: 0 }]);
  };

  const handleAddRepaymentRow = () => {
    if (!ensureWritable()) return;
    setRepaymentRows(prev => [...prev, { id: makeId('rep-'), date: '', debtor: '', amount: 0 }]);
  };

  const calculateLoanTotal = () => loanRows.reduce((sum, row) => sum + safeNumber(row.amount), 0);
  const calculateRepaymentTotal = () => repaymentRows.reduce((sum, row) => sum + safeNumber(row.amount), 0);

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
    setLoanRows(defaultLoanRows);
    setRepaymentRows(defaultRepaymentRows);
    setSelectedYear(year);
    setCurrentRowId(null);
    setShowNewYearModal(false);
    try {
      setSaving(true);
      const payload = { year, loans: defaultLoanRows, repayments: defaultRepaymentRows };
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
    const payload = { year: selectedYear, loans: loanRows, repayments: repaymentRows };
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
    if (!confirm(`Delete all Loans/Repayments data for year ${selectedYear}?`)) return;

    setDeleting(true);
    setError(null);
    const previousYears = [...availableYears];
    try {
      const newYears = availableYears.filter(y => y !== selectedYear);
      setAvailableYears(newYears);
      setLoanRows(defaultLoanRows);
      setRepaymentRows(defaultRepaymentRows);
      setCurrentRowId(null);
      setSelectedYear(newYears.length ? newYears[newYears.length - 1] : currentYear);
      if (currentRowId) {
        await deleteVoucher(currentRowId, user.id);
      }
      setMessage(`Deleted all Loans/Repayments data for ${selectedYear}.`);
    } catch (err) {
      console.error(err);
      setAvailableYears(previousYears);
      setError('Delete failed — server error');
    } finally {
      setDeleting(false);
    }
  };

  const downloadCsv = (rows: string[][], filename: string, successMessage: string) => {
    const blob = new Blob([rows.map((cells) => cells.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage(successMessage);
  };

  const handleExportLoans = () => {
    const csvRows: string[][] = [['Date', 'Creditor', 'Amount']];
    loanRows.forEach((row) => {
      csvRows.push([
        `"${String(row.date || '').replace(/"/g, '""')}"`,
        `"${String(row.creditor || '').replace(/"/g, '""')}"`,
        String(safeNumber(row.amount)),
      ]);
    });
    csvRows.push(['Total', '', String(calculateLoanTotal())]);
    downloadCsv(csvRows, `loans_${selectedYear}.csv`, 'Exported loans as CSV.');
  };

  const handleExportRepayments = () => {
    const csvRows: string[][] = [['Date', 'Debtor', 'Amount returned']];
    repaymentRows.forEach((row) => {
      csvRows.push([
        `"${String(row.date || '').replace(/"/g, '""')}"`,
        `"${String(row.debtor || '').replace(/"/g, '""')}"`,
        String(safeNumber(row.amount)),
      ]);
    });
    csvRows.push(['Total', '', String(calculateRepaymentTotal())]);
    downloadCsv(csvRows, `repayments_${selectedYear}.csv`, 'Exported repayments as CSV.');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 min-h-screen text-slate-900 dark:text-slate-100">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Loans & Repayments</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Track loans given and repayments by year.</p>
          {scopeUserId && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Viewing data for {viewingLabel}.{readOnly ? ' Editing is disabled for supervisors.' : ''}
            </p>
          )}
          {readOnly && (
            <p className="text-xs text-amber-500 mt-1">{readOnlyMessage}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <YearDropdown availableYears={availableYears} selectedYear={selectedYear} onChange={setSelectedYear} />

          {!readOnly && (
            <>
              <label htmlFor="loans-import" className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded cursor-pointer hover:bg-blue-500">
                Import Loans
                <input
                  id="loans-import"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleImportLoans}
                />
              </label>
              <label htmlFor="repayments-import" className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded cursor-pointer hover:bg-blue-500">
                Import Repayments
                <input
                  id="repayments-import"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={handleImportRepayments}
                />
              </label>
              <button onClick={() => setShowNewYearModal(true)} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> New Year
              </button>

              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60">
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
              </button>

              <button onClick={handleAddLoanRow} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> Loan Row
              </button>

              <button onClick={handleAddRepaymentRow} className="flex items-center gap-2 bg-slate-700 text-white px-3 py-2 rounded">
                <Plus className="w-4 h-4" /> Repayment Row
              </button>
            </>
          )}

          <button onClick={handleExportLoans} className="flex items-center gap-2 bg-green-600 text-white px-3 py-2 rounded">
            <Download className="w-4 h-4" /> Export Loans
          </button>

          <button onClick={handleExportRepayments} className="flex items-center gap-2 bg-emerald-600 text-white px-3 py-2 rounded">
            <Download className="w-4 h-4" /> Export Repayments
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
          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800"><LoadingSkeleton lines={6} /></div>
            <div className="rounded-lg shadow overflow-hidden bg-white dark:bg-slate-800"><LoadingSkeleton lines={6} /></div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 dark:border-slate-700 p-4">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Person totals</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Compare total credits and repayments per person.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="person-summary-select" className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Person
                  </label>
                  <select
                    id="person-summary-select"
                    value={selectedPerson}
                    onChange={(event) => setSelectedPerson(event.target.value)}
                    className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!personOptions.length}
                  >
                    {personOptions.length ? (
                      personOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))
                    ) : (
                      <option value="">No people yet</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total credit</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatAmount(totalCreditsForSelected)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Total debt</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatAmount(totalDebtsForSelected)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Difference</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatAmount(netDifference)}</p>
                  <span className={`inline-flex items-center gap-1 mt-3 px-2 py-1 rounded-full text-xs font-medium ${netBadgeClass}`}>
                    {netLabel}
                  </span>
                </div>
              </div>

              {!personOptions.length && (
                <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                  Add creditor and debtor names above to see per-person totals.
                </div>
              )}
            </div>

            <div className="w-full overflow-x-auto rounded-lg shadow border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <table className="min-w-[420px] w-full text-sm text-slate-900 dark:text-slate-100">
                <thead className="bg-blue-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  <tr>
                    <th className="p-2 border text-left">Date</th>
                    <th className="p-2 border text-left">Creditor</th>
                    <th className="p-2 border text-right">Amount</th>
                    <th className="p-2 border text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loanRows.map((row, idx) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-900/40'}
                    >
                      <td className="p-2 border">
                        <input
                          value={row.date}
                          onChange={e => handleLoanChange(row.id, 'date', e.target.value)}
                          className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                          placeholder="e.g., Feb-03"
                          disabled={readOnly}
                        />
                      </td>
                      <td className="p-2 border">
                        <input
                          value={row.creditor}
                          onChange={e => handleLoanChange(row.id, 'creditor', e.target.value)}
                          className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                          placeholder="e.g., Zotto"
                          disabled={readOnly}
                        />
                      </td>
                      <td className="p-2 border text-right">
                        <input
                          type="number"
                          min={0}
                          value={row.amount}
                          onChange={e => handleLoanChange(row.id, 'amount', Number(e.target.value))}
                          className={`w-full bg-transparent outline-none text-right ${readOnlyFieldClass}`}
                          disabled={readOnly}
                        />
                      </td>
                      <td className="p-2 border text-center">
                        <button
                          onClick={() => handleDeleteLoan(row.id)}
                          className={`text-red-600 ${readOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                          disabled={readOnly}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                  <tr className="bg-blue-100 dark:bg-slate-900/70 dark:text-slate-100">
                    <td colSpan={2} className="p-2 border font-bold">Total</td>
                    <td className="p-2 border text-right font-bold">{calculateLoanTotal().toLocaleString()}</td>
                    <td className="p-2 border" />
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="w-full overflow-x-auto rounded-lg shadow border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
              <table className="min-w-[420px] w-full text-sm text-slate-900 dark:text-slate-100">
                <thead className="bg-blue-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                  <tr>
                    <th className="p-2 border text-left">Date</th>
                    <th className="p-2 border text-left">Debtor</th>
                    <th className="p-2 border text-right">Amount returned</th>
                    <th className="p-2 border text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {repaymentRows.map((row, idx) => (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-900/40'}
                    >
                      <td className="p-2 border">
                        <input
                          value={row.date}
                          onChange={e => handleRepaymentChange(row.id, 'date', e.target.value)}
                          className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                          placeholder="e.g., Mar-03"
                          disabled={readOnly}
                        />
                      </td>
                      <td className="p-2 border">
                        <input
                          value={row.debtor}
                          onChange={e => handleRepaymentChange(row.id, 'debtor', e.target.value)}
                          className={`w-full bg-transparent outline-none ${readOnlyFieldClass}`}
                          placeholder="e.g., Chris"
                          disabled={readOnly}
                        />
                      </td>
                      <td className="p-2 border text-right">
                        <input
                          type="number"
                          min={0}
                          value={row.amount}
                          onChange={e => handleRepaymentChange(row.id, 'amount', Number(e.target.value))}
                          className={`w-full bg-transparent outline-none text-right ${readOnlyFieldClass}`}
                          disabled={readOnly}
                        />
                      </td>
                      <td className="p-2 border text-center">
                        <button
                          onClick={() => handleDeleteRepayment(row.id)}
                          className={`text-red-600 ${readOnly ? 'opacity-40 cursor-not-allowed' : ''}`}
                          disabled={readOnly}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                  <tr className="bg-blue-100 dark:bg-slate-900/70 dark:text-slate-100">
                    <td colSpan={2} className="p-2 border font-bold">Total</td>
                    <td className="p-2 border text-right font-bold">{calculateRepaymentTotal().toLocaleString()}</td>
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
