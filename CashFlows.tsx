import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Download, Lock, Plus, Save, Trash2, Unlock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUserScope } from '../contexts/UserScopeContext';
import { createVoucher, deleteVoucher, getVouchers, updateVoucher } from '../lib/voucherService';
import { updateProfileSettings } from '../lib/profileService';
import { formatTZS } from '../lib/forecastUtils';

// Safe JSON parse utility: returns input if not valid JSON
function safeParse<T = unknown>(input: unknown): T | unknown {
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall back to original string
    }
  }
  return input;
}
type ToastState = { text: string; tone: 'success' | 'error' | 'info' } | null;

type CashEntry = {
  id: string;
  date: string;
  name: string;
  details: string;
  source: string;
  amount: number;
  derived?: boolean;
};

const makeId = (prefix = 'cash') => {
  const uuid = typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createEmptyCashEntry = (): CashEntry => ({
  id: makeId('cash'),
  date: '',
  name: '',
  details: '',
  source: '',
  amount: 0,
  derived: false,
});

const ensureRows = (rows: CashEntry[]) => (rows.length ? rows : [createEmptyCashEntry()]);

const normalizeCashEntries = (value: unknown): CashEntry[] => {
  if (!Array.isArray(value) || !value.length) return ensureRows([]);
  return ensureRows(
    value.map((row) => ({
      id: typeof (row as CashEntry)?.id === 'string' ? (row as CashEntry).id : makeId('cash'),
      date: typeof (row as CashEntry)?.date === 'string' ? (row as CashEntry).date : '',
      name: typeof (row as CashEntry)?.name === 'string' ? (row as CashEntry).name : '',
      details: typeof (row as CashEntry)?.details === 'string' ? (row as CashEntry).details : '',
      source: typeof (row as CashEntry)?.source === 'string' ? (row as CashEntry).source : '',
      amount: safeNumber((row as CashEntry)?.amount),
      derived: Boolean((row as CashEntry)?.derived),
    })),
  );
};

const serializeCashEntries = (rows: CashEntry[]) =>
  rows
    .filter((row) => !row.derived)
    .map((row) => ({
    id: row.id,
    date: row.date,
    name: row.name,
    details: row.details,
    source: row.source,
    amount: safeNumber(row.amount),
    derived: Boolean(row.derived),
  }));

const flowLockKey = (scope: 'inflow' | 'outflow', field: keyof Omit<CashEntry, 'id'>) => `${scope}${field[0].toUpperCase()}${field.slice(1)}`;

const DERIVED_ROW_IDS = {
  inflowVoucher: 'cash-derived-voucher-sales',
  outflowOpex: 'cash-derived-opex-total',
  outflowCapex: 'cash-derived-capex-total',
} as const;

const DERIVED_SOURCE_KEYS = ['vouchers', 'opex', 'opexop', 'capex'] as const;

const makeDerivedEntry = (id: string, overrides: Partial<CashEntry>): CashEntry => ({
  id,
  date: '',
  name: '',
  details: '',
  source: '',
  amount: 0,
  derived: true,
  ...overrides,
});

const parseYearNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const MONTH_COLUMN_KEYS = [
  'jan_count',
  'feb_count',
  'mar_count',
  'apr_count',
  'may_count',
  'jun_count',
  'jul_count',
  'aug_count',
  'sept_count',
  'oct_count',
  'nov_count',
  'dec_count',
];

const extractMonthValues = (row: Record<string, unknown> | null | undefined) => {
  if (row?.months && typeof (row as any).months === 'object') {
    return Object.values((row as any).months as Record<string, unknown>).map((value) => safeNumber(value));
  }

  const rawVoucher = (row as any)?.voucher_item_json;
if (rawVoucher) {
  try {
    const parsed = safeParse(rawVoucher);
    if (parsed?.months && typeof parsed.months === 'object') {
      return Object.values(parsed.months as Record<string, unknown>).map((value) => safeNumber(value));
    }
  } catch (parseError) {
    console.warn('Failed to parse voucher_item_json', parseError);
  }
}
  const columnValues = MONTH_COLUMN_KEYS.map((key) => safeNumber((row as any)?.[key]));
  if (columnValues.some((value) => value > 0)) {
    return columnValues;
  }

  return [];
};

const calculateVoucherSalesTotal = (rows: any[]): number => {
  return rows.reduce((sum, row) => {
    const unitPrice = safeNumber(row?.unitPrice ?? row?.unit_price);
    const monthValues = extractMonthValues(row);
    const totalUnits = monthValues.reduce((units, value) => units + safeNumber(value), 0);
    return sum + unitPrice * totalUnits;
  }, 0);
};

const calculateOpexTotal = (opexRows: any[], opexOperationRows: any[]): number => {
  const recurring = opexRows.reduce((sum, row) => sum + safeNumber(row?.totalCost ?? row?.total_cost), 0);
  const operations = opexOperationRows.reduce((sum, row) => sum + safeNumber(row?.cost ?? row?.totalCost ?? row?.total_cost), 0);
  return recurring + operations;
};

const calculateCapexTotal = (rows: any[]): number => {
  return rows.reduce((sum, row) => {
    const totalCost = safeNumber(row?.totalCost ?? row?.total_cost);
    if (totalCost > 0) return sum + totalCost;
    const fallback = safeNumber(row?.quantity) * safeNumber(row?.costPerItem ?? row?.cost_per_item ?? row?.unitCost ?? row?.unit_cost);
    return sum + fallback;
  }, 0);
};

const calculateDerivedTotals = (record: Record<string, unknown>) => {
  const voucherRows = Array.isArray((record as any)?.vouchers) ? (record as any).vouchers : [];
  const opexRows = Array.isArray((record as any)?.opex) ? (record as any).opex : [];
  const opexOperationRows = Array.isArray((record as any)?.opexop) ? (record as any).opexop : [];
  const capexRows = Array.isArray((record as any)?.capex) ? (record as any).capex : [];

  return {
    voucherSales: calculateVoucherSalesTotal(voucherRows),
    opexTotal: calculateOpexTotal(opexRows, opexOperationRows),
    capexTotal: calculateCapexTotal(capexRows),
  };
};

const applyDerivedRows = (
  scope: 'inflow' | 'outflow',
  rows: CashEntry[],
  record: Record<string, unknown>,
  fallbackYear: number,
) => {
  const totals = calculateDerivedTotals(record);
  const resolvedYear = parseYearNumber((record as any)?.year, fallbackYear);
  const yearLabel = Number.isFinite(resolvedYear) ? String(resolvedYear) : '';

  const derivedEntries = scope === 'inflow'
    ? [
        makeDerivedEntry(DERIVED_ROW_IDS.inflowVoucher, {
          date: yearLabel,
          name: 'Voucher Sales',
          details: 'Total voucher sales',
          source: 'Voucher',
          amount: totals.voucherSales,
        }),
      ]
    : [
        makeDerivedEntry(DERIVED_ROW_IDS.outflowOpex, {
          date: yearLabel,
          name: 'Opex Costs',
          details: 'Total operational expenditure',
          source: 'Opex',
          amount: totals.opexTotal,
        }),
        makeDerivedEntry(DERIVED_ROW_IDS.outflowCapex, {
          date: yearLabel,
          name: 'Capex Costs',
          details: 'Total capital expenditure',
          source: 'Capex',
          amount: totals.capexTotal,
        }),
      ];

  const derivedIds = new Set(derivedEntries.map((entry) => entry.id));
  const baseRows = rows.filter((row) => !derivedIds.has(row.id) && !row.derived);
  const result = [...derivedEntries, ...baseRows];

  if (!baseRows.length) {
    result.push(createEmptyCashEntry());
  }

  return result;
};

const buildDerivedRecord = (
  base: Record<string, unknown>,
  entries: Array<{ data?: Record<string, unknown> | null }>,
  fallbackYear: number,
) => {
  const enriched: Record<string, unknown> = { ...base };
  DERIVED_SOURCE_KEYS.forEach((key) => {
    const current = (enriched as any)[key];
    const needsBackfill = !Array.isArray(current) || current.length === 0;
    if (!needsBackfill) return;

    const candidate = entries.find((entry) => {
      const value = (entry?.data as any)?.[key];
      return Array.isArray(value) && value.length > 0;
    });

    if (candidate && Array.isArray((candidate.data as any)?.[key])) {
      (enriched as any)[key] = (candidate.data as any)[key];
    } else {
      (enriched as any)[key] = Array.isArray(current) ? current : [];
    }
  });
  const derivedYear = parseYearNumber((enriched as any)?.year, fallbackYear);
  enriched.year = derivedYear;
  return enriched;
};

const CASH_DATA_KEYS: Array<keyof Record<string, unknown>> = ['cashInflows', 'cashOutflows', 'vouchers', 'opex', 'opexop', 'capex'];

const entryRichnessScore = (entry: { data?: Record<string, unknown> | null }) => {
  const payload = entry?.data ?? {};
  return CASH_DATA_KEYS.reduce((sum, key) => {
    const value = (payload as any)?.[key];
    if (Array.isArray(value)) return sum + value.length;
    return sum;
  }, 0);
};

const hasCashData = (entry: { data?: Record<string, unknown> | null }) => {
  const payload = entry?.data ?? {};
  const inflows = (payload as any)?.cashInflows;
  const outflows = (payload as any)?.cashOutflows;
  return (Array.isArray(inflows) && inflows.length > 0) || (Array.isArray(outflows) && outflows.length > 0);
};

function YearDropdown({
  availableYears,
  selectedYear,
  onChange,
}: {
  availableYears: number[];
  selectedYear: number;
  onChange: (year: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white">
      <Calendar className="h-5 w-5 text-slate-400" />
      <select
        value={selectedYear}
        onChange={(event) => onChange(Number(event.target.value))}
        className="bg-transparent text-white outline-none"
      >
        {availableYears.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );
}

function NewYearModal({ isOpen, onClose, onAdd }: { isOpen: boolean; onClose: () => void; onAdd: (year: number) => void }) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!isOpen) setValue('');
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="relative z-10 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Add financial year</h3>
        <input
          type="number"
          value={value}
          min={2000}
          max={2100}
          onChange={(event) => setValue(event.target.value)}
          className="mb-4 w-full rounded border border-slate-200 px-3 py-2 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          placeholder="e.g. 2026"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onAdd(Number(value))}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
          >
            Add year
          </button>
        </div>
      </motion.div>
    </div>
  );
}

              function Toast({ message, onClose }: { message: ToastState; onClose: () => void }) {
                return (
                  <AnimatePresence>
                    {message && (
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        className="fixed bottom-4 right-4 z-50"
                      >
                        <div
                          className={`flex items-center gap-3 rounded px-4 py-3 shadow ${
                            message.tone === 'success'
                              ? 'bg-emerald-600 text-emerald-50'
                              : message.tone === 'error'
                              ? 'bg-red-600 text-red-50'
                              : 'bg-slate-900 text-white'
                          }`}
                        >
                          <span>{message.text}</span>
                          <button type="button" onClick={onClose} className="text-sm opacity-75">
                            ✕
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                );
              }

              function LoadingSkeleton({ lines = 10 }: { lines?: number }) {
                return (
                  <div className="space-y-2">
                    {Array.from({ length: lines }).map((_, index) => (
                      <div key={index} className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    ))}
                  </div>
                );
              }

              const useFlowTotals = (inflows: CashEntry[], outflows: CashEntry[]) =>
                useMemo(() => {
                  const totalInflows = inflows.reduce((sum, entry) => sum + safeNumber(entry.amount), 0);
                  const totalOutflows = outflows.reduce((sum, entry) => sum + safeNumber(entry.amount), 0);
                  return { totalInflows, totalOutflows, net: totalInflows - totalOutflows };
                }, [inflows, outflows]);

              export default function CashFlows() {
                    // Import logic for cash outflows
                    const handleImportOutflows = async (event: React.ChangeEvent<HTMLInputElement>) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setLoading(true);
                      try {
                        const data = await file.arrayBuffer();
                        const workbook = XLSX.read(data, { type: 'array' });
                        const sheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[sheetName];
                        const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                        // Normalize to CashEntry[]
                        const importedEntries: CashEntry[] = json.map((row) => ({
                          id: makeId('cash'),
                          date: row.date || '',
                          name: row.name || '',
                          details: row.details || '',
                          source: row.source || '',
                          amount: safeNumber(row.amount),
                          derived: false,
                        }));
                        setCashOutflows(importedEntries);
                        setToast({ text: `Imported ${importedEntries.length} outflow records.`, tone: 'success' });
                      } catch (err) {
                        setToast({ text: 'Import failed. Invalid file format.', tone: 'error' });
                      } finally {
                        setLoading(false);
                      }
                    };
                  // Import logic for cash inflows
                  const handleImportInflows = async (event: React.ChangeEvent<HTMLInputElement>) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setLoading(true);
                    try {
                      const data = await file.arrayBuffer();
                      const workbook = XLSX.read(data, { type: 'array' });
                      const sheetName = workbook.SheetNames[0];
                      const sheet = workbook.Sheets[sheetName];
                      const json: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                      // Normalize to CashEntry[]
                      const importedEntries: CashEntry[] = json.map((row) => ({
                        id: makeId('cash'),
                        date: row.date || '',
                        name: row.name || '',
                        details: row.details || '',
                        source: row.source || '',
                        amount: safeNumber(row.amount),
                        derived: false,
                      }));
                      setCashInflows(importedEntries);
                      setToast({ text: `Imported ${importedEntries.length} inflow records.`, tone: 'success' });
                    } catch (err) {
                      setToast({ text: 'Import failed. Invalid file format.', tone: 'error' });
                    } finally {
                      setLoading(false);
                    }
                  };
                const { user } = useAuth();
                const { scopeUserId, readOnly, scopedProfile, profile, setProfileState } = useUserScope();

                const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
                const [availableYears, setAvailableYears] = useState<number[]>(() => [new Date().getFullYear()]);
                const [showNewYearModal, setShowNewYearModal] = useState(false);

                const [cashInflows, setCashInflows] = useState<CashEntry[]>(() => ensureRows([]));
                const [cashOutflows, setCashOutflows] = useState<CashEntry[]>(() => ensureRows([]));
                const [currentRowId, setCurrentRowId] = useState<string | null>(null);
                const [currentRecordData, setCurrentRecordData] = useState<Record<string, unknown>>({});
                const [derivedSource, setDerivedSource] = useState<Record<string, unknown>>({});

                const [lockedColumns, setLockedColumns] = useState<Record<string, boolean>>({});
                const [loading, setLoading] = useState(false);
                const [saving, setSaving] = useState(false);
                const [deleting, setDeleting] = useState(false);
                const [error, setError] = useState<string | null>(null);
                const [toast, setToast] = useState<ToastState>(null);

                const activeUserId = scopeUserId ?? user?.id ?? null;
                const readOnlyMessage = 'Supervisor accounts have read-only access.';
                const viewerLabel = scopedProfile
                  ? scopedProfile.full_name?.trim() || scopedProfile.email
                  : user?.email ?? 'your account';

                const totals = useFlowTotals(cashInflows, cashOutflows);

                useEffect(() => {
                  let cancelled = false;

                  async function load() {
                    if (!activeUserId) {
                      if (!cancelled) {
                        const emptyRecord: Record<string, unknown> = { year: selectedYear };
                        setCashInflows(applyDerivedRows('inflow', ensureRows([]), emptyRecord, selectedYear));
                        setCashOutflows(applyDerivedRows('outflow', ensureRows([]), emptyRecord, selectedYear));
                        setDerivedSource(emptyRecord);
                        setError('You are not authenticated to see this data.');
                      }
                      return;
                    }

                    setLoading(true);
                    setError(null);

                    try {
                      const response = await getVouchers({ userId: activeUserId ?? undefined });
                      if (cancelled) return;

                      const scopedItems = (response ?? []).filter(
                        (entry) => entry?.user_id === activeUserId && Number.isFinite(Number(entry?.data?.year)),
                      );

                      const years = Array.from(new Set(scopedItems.map((entry) => Number(entry.data.year)))).sort((a, b) => a - b);
                      const normalizedYears = years.length ? years : [selectedYear];

                      setAvailableYears(normalizedYears);

                      const targetYear = normalizedYears.includes(selectedYear) ? selectedYear : normalizedYears[normalizedYears.length - 1];
                      if (targetYear !== selectedYear) setSelectedYear(targetYear);

                      const yearEntries = scopedItems.filter((entry) => Number(entry?.data?.year) === targetYear);
                      const orderedEntries = [...yearEntries].sort((a, b) => {
                        const cashPreference = Number(hasCashData(b)) - Number(hasCashData(a));
                        if (cashPreference !== 0) return cashPreference;
                        return entryRichnessScore(b) - entryRichnessScore(a);
                      });
                      const match = orderedEntries[0] ?? null;

                      if (match) {
                        const payload = (match.data as Record<string, unknown>) ?? {};
                        const inflowRows = normalizeCashEntries((payload as any).cashInflows);
                        const outflowRows = normalizeCashEntries((payload as any).cashOutflows);
                        const resolvedYear = parseYearNumber((payload as any)?.year, targetYear);
                        const derivedRecord = buildDerivedRecord(payload, yearEntries, resolvedYear);
                        setDerivedSource(derivedRecord);
                        setCashInflows(applyDerivedRows('inflow', inflowRows, derivedRecord, resolvedYear));
                        setCashOutflows(applyDerivedRows('outflow', outflowRows, derivedRecord, resolvedYear));
                        setCurrentRowId(match.id ?? null);
                        setCurrentRecordData(payload);
                      } else {
                        const emptyRecord: Record<string, unknown> = { year: targetYear };
                        const derivedRecord = buildDerivedRecord(emptyRecord, yearEntries, targetYear);
                        setDerivedSource(derivedRecord);
                        setCashInflows(applyDerivedRows('inflow', ensureRows([]), derivedRecord, targetYear));
                        setCashOutflows(applyDerivedRows('outflow', ensureRows([]), derivedRecord, targetYear));
                        setCurrentRowId(null);
                        setCurrentRecordData(emptyRecord);
                      }
                    } catch (fetchError) {
                      console.error('Failed to load cash flow data', fetchError);
                      if (!cancelled) setError('Failed to load cash flow data.');
                    } finally {
                      if (!cancelled) setLoading(false);
                    }
                  }

                  void load();
                  return () => {
                    cancelled = true;
                  };
                }, [activeUserId, selectedYear]);

                useEffect(() => {
                  if (!profile?.id) return;
                  const settings = (profile.settings as { cashFlowLocks?: Record<string, boolean> } | null) ?? null;
                  setLockedColumns(settings?.cashFlowLocks ?? {});
                }, [profile?.id, JSON.stringify(profile?.settings)]);

                useEffect(() => {
                  if (!toast) return;
                  const timer = window.setTimeout(() => setToast(null), 2200);
                  return () => window.clearTimeout(timer);
                }, [toast]);

                const persistLocks = async (nextLocks: Record<string, boolean>) => {
                  if (!profile?.id) return;

                  try {
                    const currentSettings = (profile.settings as Record<string, unknown>) ?? {};
                    const updated = await updateProfileSettings(profile.id, { ...currentSettings, cashFlowLocks: nextLocks });
                    setProfileState(updated);
                  } catch (lockError) {
                    console.error('Failed to update cash flow locks', lockError);
                    setToast({ text: 'Unable to sync column locks.', tone: 'error' });
                  }
                };

                const isLocked = (key: string) => Boolean(lockedColumns[key]);

                const toggleLock = (key: string, label: string) => {
                  if (!profile?.id) {
                    setToast({ text: 'Profile still loading. Try again shortly.', tone: 'info' });
                    return;
                  }

                  const nextState = !isLocked(key);
                  const nextLocks = { ...lockedColumns, [key]: nextState };
                  setLockedColumns(nextLocks);
                  setToast({ text: `${label} ${nextState ? 'locked' : 'unlocked'}.`, tone: 'info' });
                  void persistLocks(nextLocks);
                };

                const ensureWritable = () => {
                  if (!user) {
                    setError('You are not authenticated to modify cash flows.');
                    return false;
                  }
                  if (readOnly) {
                    setError(readOnlyMessage);
                    return false;
                  }
                  return true;
                };

                const handleAddYear = async (year: number) => {
                  if (!ensureWritable()) return;

                  if (!year || Number.isNaN(year) || year < 2000 || year > 2100) {
                    setError('Enter a valid year between 2000 and 2100.');
                    return;
                  }

                  if (availableYears.includes(year)) {
                    setError('Year already exists.');
                    return;
                  }

                  const newYears = [...availableYears, year].sort((a, b) => a - b);
                  setAvailableYears(newYears);
                  setSelectedYear(year);
                  const baseInflows = ensureRows([]);
                  const baseOutflows = ensureRows([]);
                  const blankRecord: Record<string, unknown> = {
                    year,
                    vouchers: [],
                    opex: [],
                    opexop: [],
                    capex: [],
                  };
                  const derivedRecord = buildDerivedRecord(blankRecord, [], year);
                  const initialInflows = applyDerivedRows('inflow', baseInflows, derivedRecord, year);
                  const initialOutflows = applyDerivedRows('outflow', baseOutflows, derivedRecord, year);
                  setCashInflows(initialInflows);
                  setCashOutflows(initialOutflows);
                  setCurrentRowId(null);
                  setCurrentRecordData(blankRecord);
                  setDerivedSource(derivedRecord);
                  setShowNewYearModal(false);

                  setToast({ text: `Year ${year} ready. Add entries, then save.`, tone: 'info' });
                };

                const handleEntryChange = (
                  scope: 'inflow' | 'outflow',
                  id: string,
                  field: keyof Omit<CashEntry, 'id'>,
                  value: string,
                ) => {
                  const setter = scope === 'inflow' ? setCashInflows : setCashOutflows;
                  setter((previous) =>
                    previous.map((row) => {
                      if (row.id !== id || row.derived) return row;
                      return field === 'amount' ? { ...row, amount: safeNumber(value) } : { ...row, [field]: value };
                    }),
                  );
                };

                const handleAddRow = (scope: 'inflow' | 'outflow') => {
                  if (!ensureWritable()) return;
                  const setter = scope === 'inflow' ? setCashInflows : setCashOutflows;
                  setter((previous) => [...previous, createEmptyCashEntry()]);
                };

                const handleDeleteRow = (scope: 'inflow' | 'outflow', id: string) => {
                  if (!ensureWritable()) return;
                  const setter = scope === 'inflow' ? setCashInflows : setCashOutflows;
                  setter((previous) => {
                    const target = previous.find((row) => row.id === id);
                    if (!target || target.derived) return previous;
                    const next = ensureRows(previous.filter((row) => row.id !== id));
                    setToast({ text: `${scope === 'inflow' ? 'Inflow' : 'Outflow'} removed.`, tone: 'info' });
                    return next;
                  });
                };

                const handleSave = async () => {
                  if (!ensureWritable()) return;
                  if (!user) {
                    setError('You are not authenticated to save data.');
                    return;
                  }

                  const base = { ...currentRecordData };
                  const vouchers = Array.isArray((base as any).vouchers) ? (base as any).vouchers : [];

                  const payload = {
                    ...base,
                    year: selectedYear,
                    vouchers,
                    cashInflows: serializeCashEntries(cashInflows),
                    cashOutflows: serializeCashEntries(cashOutflows),
                  };

                  setSaving(true);
                  setError(null);

                  try {
                    if (currentRowId) {
                      const updated = await updateVoucher(currentRowId, payload, user.id);
                      const nextRecord = updated?.data ?? payload;
                      const nextDerived = buildDerivedRecord(
                        nextRecord ?? {},
                        [{ data: nextRecord ?? {} }, { data: derivedSource }],
                        selectedYear,
                      );
                      setCurrentRecordData(nextRecord);
                      setDerivedSource(nextDerived);
                      setCashInflows((prev) => applyDerivedRows('inflow', prev, nextDerived, selectedYear));
                      setCashOutflows((prev) => applyDerivedRows('outflow', prev, nextDerived, selectedYear));
                      setToast({ text: 'Cash flows updated.', tone: 'success' });
                    } else {
                      const created = await createVoucher(payload, user.id);
                      setCurrentRowId(created.id ?? null);
                      const nextRecord = created.data ?? payload;
                      const nextDerived = buildDerivedRecord(
                        nextRecord ?? {},
                        [{ data: nextRecord ?? {} }, { data: derivedSource }],
                        selectedYear,
                      );
                      setCurrentRecordData(nextRecord);
                      setDerivedSource(nextDerived);
                      setCashInflows((prev) => applyDerivedRows('inflow', prev, nextDerived, selectedYear));
                      setCashOutflows((prev) => applyDerivedRows('outflow', prev, nextDerived, selectedYear));
                      setToast({ text: 'Cash flows saved.', tone: 'success' });
                    }

                    setAvailableYears((previous) => Array.from(new Set([...previous, selectedYear])).sort((a, b) => a - b));
                  } catch (saveError) {
                    console.error('Failed to save cash flows', saveError);
                    setError('Saving failed. Try again.');
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
                  if (!confirm(`Delete all cash flows for ${selectedYear}?`)) return;
                  if (!user) {
                    setError('You are not authenticated to delete data.');
                    return;
                  }

                  setDeleting(true);
                  setError(null);

                  const previousYears = [...availableYears];

                  try {
                    if (currentRowId) await deleteVoucher(currentRowId, user.id);

                    const remaining = previousYears.filter((year) => year !== selectedYear).sort((a, b) => a - b);
                    const fallbackYear = remaining[remaining.length - 1] ?? new Date().getFullYear();

                    setAvailableYears(remaining.length ? remaining : [fallbackYear]);
                    setSelectedYear(fallbackYear);
                    const emptyRecord: Record<string, unknown> = { year: fallbackYear };
                    const derivedRecord = buildDerivedRecord(emptyRecord, [], fallbackYear);
                    setCurrentRecordData(emptyRecord);
                    setDerivedSource(derivedRecord);
                    setCashInflows(applyDerivedRows('inflow', ensureRows([]), derivedRecord, fallbackYear));
                    setCashOutflows(applyDerivedRows('outflow', ensureRows([]), derivedRecord, fallbackYear));
                    setCurrentRowId(null);

                    setToast({ text: `Deleted cash flows for ${selectedYear}.`, tone: 'info' });
                  } catch (deleteError) {
                    console.error('Failed to delete cash flow year', deleteError);
                    setAvailableYears(previousYears);
                    setError('Failed to delete year.');
                  } finally {
                    setDeleting(false);
                  }
                };

                const handleExport = () => {
                  try {
                    const inflowsSection = [
                      ['Date', 'Name', 'Details', 'Source', 'Amount'],
                      ...cashInflows.map((entry) => [entry.date, entry.name, entry.details, entry.source, safeNumber(entry.amount).toString()]),
                      ['TOTAL', '', '', '', safeNumber(totals.totalInflows).toString()],
                    ];

                    const outflowsSection = [
                      ['Date', 'Name', 'Details', 'Source', 'Amount'],
                      ...cashOutflows.map((entry) => [entry.date, entry.name, entry.details, entry.source, safeNumber(entry.amount).toString()]),
                      ['TOTAL', '', '', '', safeNumber(totals.totalOutflows).toString()],
                    ];

                    const summarySection = [
                      ['Summary'],
                      ['Total Inflows', safeNumber(totals.totalInflows).toString()],
                      ['Total Outflows', safeNumber(totals.totalOutflows).toString()],
                      ['Net Cash', safeNumber(totals.net).toString()],
                    ];

                    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
                    const makeCsvSection = (rows: unknown[][]) => rows.map((row) => row.map(quote).join(',')).join('\n');

                    const csv = `${makeCsvSection(summarySection)}\n\n${makeCsvSection(inflowsSection)}\n\n${makeCsvSection(outflowsSection)}`;

                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `cash_flows_${selectedYear}.csv`;
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                    URL.revokeObjectURL(url);
                    setToast({ text: 'Exported CSV downloaded.', tone: 'success' });
                  } catch (exportError) {
                    console.error('Failed to export cash flows', exportError);
                    setError('Export failed.');
                  }
                };

                const renderLockAction = (key: string, label: string) => {
                  const locked = isLocked(key);
                  const Icon = locked ? Lock : Unlock;

                  return (
                    <button
                      type="button"
                      onClick={() => toggleLock(key, label)}
                      className={`rounded border px-1 py-1 text-xs transition ${
                        locked
                          ? 'border-amber-400 bg-amber-500/10 text-amber-300'
                          : 'border-slate-500/40 text-slate-300 hover:text-white'
                      } ${!profile?.id ? 'cursor-not-allowed opacity-50' : ''}`}
                      disabled={!profile?.id}
                      title={locked ? `Unlock ${label}` : `Lock ${label}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  );
                };

                const renderTable = (scope: 'inflow' | 'outflow', rows: CashEntry[]) => {
                  const lockLabel = scope === 'inflow' ? 'Cash inflow' : 'Cash outflow';
                  const total = rows.reduce((sum, row) => sum + safeNumber(row.amount), 0);

                  return (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow dark:border-slate-700 dark:bg-slate-800">
                      <table className="w-full min-w-[720px] text-sm text-slate-900 dark:text-slate-100">
                        <thead className="bg-blue-100 text-slate-800 dark:bg-slate-900/70 dark:text-slate-100">
                          <tr>
                            {['date', 'name', 'details', 'source', 'amount'].map((field) => (
                              <th key={field} className={`border px-2 py-2 ${field === 'amount' ? 'text-right' : 'text-left'}`}>
                                <div className={`flex items-center justify-${field === 'amount' ? 'end' : 'between'} gap-2`}>
                                  <span className="capitalize">{field}</span>
                                  {renderLockAction(flowLockKey(scope, field as keyof Omit<CashEntry, 'id'>), `${lockLabel} ${field}`)}
                                </div>
                              </th>
                            ))}
                            <th className="border px-2 py-2 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          <AnimatePresence initial={false}>
                            {rows.map((row, index) => {
                              const isDerivedRow = Boolean(row.derived);
                              return (
                                <motion.tr
                                  key={row.id}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -6 }}
                                  transition={{ delay: index * 0.015 }}
                                  className={index % 2 ? 'bg-slate-50 dark:bg-slate-900/40' : ''}
                                >
                                  <td className="border px-2">
                                    <input
                                      value={row.date}
                                      disabled={readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'date'))}
                                      onChange={(event) => handleEntryChange(scope, row.id, 'date', event.target.value)}
                                      className={`w-full bg-transparent py-2 outline-none ${
                                        readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'date'))
                                          ? 'cursor-not-allowed opacity-60'
                                          : ''
                                      }`}
                                      placeholder="Jan-26"
                                    />
                                  </td>
                                  <td className="border px-2">
                                    <input
                                      value={row.name}
                                      disabled={readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'name'))}
                                      onChange={(event) => handleEntryChange(scope, row.id, 'name', event.target.value)}
                                      className={`w-full bg-transparent py-2 outline-none ${
                                        readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'name'))
                                          ? 'cursor-not-allowed opacity-60'
                                          : ''
                                      }`}
                                      placeholder={scope === 'inflow' ? 'Voucher Sales' : 'Equipment Purchase'}
                                    />
                                  </td>
                                  <td className="border px-2">
                                    <input
                                      value={row.details}
                                      disabled={readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'details'))}
                                      onChange={(event) => handleEntryChange(scope, row.id, 'details', event.target.value)}
                                      className={`w-full bg-transparent py-2 outline-none ${
                                        readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'details'))
                                          ? 'cursor-not-allowed opacity-60'
                                          : ''
                                      }`}
                                      placeholder="Description"
                                    />
                                  </td>
                                  <td className="border px-2">
                                    <input
                                      value={row.source}
                                      disabled={readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'source'))}
                                      onChange={(event) => handleEntryChange(scope, row.id, 'source', event.target.value)}
                                      className={`w-full bg-transparent py-2 outline-none ${
                                        readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'source'))
                                          ? 'cursor-not-allowed opacity-60'
                                          : ''
                                      }`}
                                      placeholder="Business Unit"
                                    />
                                  </td>
                                  <td className="border px-2 text-right">
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      value={row.amount}
                                      disabled={readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'amount'))}
                                      onChange={(event) => handleEntryChange(scope, row.id, 'amount', event.target.value)}
                                      className={`w-full bg-transparent py-2 text-right outline-none ${
                                        readOnly || isDerivedRow || isLocked(flowLockKey(scope, 'amount'))
                                          ? 'cursor-not-allowed opacity-60'
                                          : ''
                                      }`}
                                    />
                                  </td>
                                  <td className="border px-2 text-center">
                                    {isDerivedRow ? (
                                      <span className="text-xs text-slate-400">Auto</span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRow(scope, row.id)}
                                        className={`inline-flex items-center justify-center rounded border px-2 py-1 text-xs ${
                                          readOnly
                                            ? 'cursor-not-allowed border-slate-500/30 text-slate-400 opacity-50'
                                            : 'border-red-500/60 text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10'
                                        }`}
                                        disabled={readOnly}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    )}
                                  </td>
                                </motion.tr>
                              );
                            })}
                          </AnimatePresence>
                          <tr className="bg-blue-100 font-semibold dark:bg-slate-900/70 dark:text-slate-100">
                            <td className="border px-2 py-2" colSpan={4}>
                              Total
                            </td>
                            <td className="border px-2 py-2 text-right">
                              {formatTZS(total)}
                            </td>
                            <td className="border px-2 py-2" />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                };

                return (
                  <div className="space-y-6">
                    <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Cash Flows</h1>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Monitor inflows and outflows for {viewerLabel}. {readOnly ? readOnlyMessage : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <YearDropdown availableYears={availableYears} selectedYear={selectedYear} onChange={setSelectedYear} />
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => setShowNewYearModal(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
                          >
                            <Plus className="h-4 w-4" />
                            New Year
                          </button>
                        )}
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={handleDeleteYear}
                            disabled={deleting}
                            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-rose-500 disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete Year
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleExport}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-blue-600"
                        >
                          <Download className="h-4 w-4" />
                          Export CSV
                        </button>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:opacity-60"
                          >
                            <Save className="h-4 w-4" />
                            {saving ? 'Saving…' : 'Save Changes'}
                          </button>
                        )}
                      </div>
                    </header>

                    <section className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                        <p className="text-sm text-emerald-700 dark:text-emerald-300">Total Inflows</p>
                        <p className="text-2xl font-semibold text-emerald-800 dark:text-emerald-200">{formatTZS(totals.totalInflows)}</p>
                      </div>
                      <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
                        <p className="text-sm text-rose-700 dark:text-rose-300">Total Outflows</p>
                        <p className="text-2xl font-semibold text-rose-800 dark:text-rose-200">{formatTZS(totals.totalOutflows)}</p>
                      </div>
                      <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
                        <p className="text-sm text-blue-700 dark:text-blue-300">Net Cash</p>
                        <p className={`text-2xl font-semibold ${totals.net >= 0 ? 'text-blue-800 dark:text-blue-200' : 'text-rose-800 dark:text-rose-200'}`}>
                          {formatTZS(totals.net, { allowNegative: true })}
                        </p>
                      </div>
                    </section>

                    {error && (
                      <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-200">
                        {error}
                      </div>
                    )}

                    {loading ? (
                      <LoadingSkeleton />
                    ) : (
                      <div className="space-y-10">
                        <section className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cash Inflows</h2>
                            <div className="flex gap-2">
                              {!readOnly && (
                                <>
                                  <label htmlFor="cash-inflow-import" className="px-3 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-500">
                                    Import Inflows
                                    <input
                                      id="cash-inflow-import"
                                      type="file"
                                      accept=".xlsx,.csv"
                                      className="hidden"
                                      onChange={handleImportInflows}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleAddRow('inflow')}
                                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
                                  >
                                    <Plus className="h-4 w-4" />
                                    Add Row
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          {renderTable('inflow', cashInflows)}
                        </section>

                        <section className="space-y-4">
                          <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cash Outflows</h2>
                            <div className="flex gap-2">
                              {!readOnly && (
                                <>
                                  <label htmlFor="cash-outflow-import" className="px-3 py-2 bg-blue-600 text-white rounded cursor-pointer hover:bg-blue-500">
                                    Import Outflows
                                    <input
                                      id="cash-outflow-import"
                                      type="file"
                                      accept=".xlsx,.csv"
                                      className="hidden"
                                      onChange={handleImportOutflows}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleAddRow('outflow')}
                                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500"
                                  >
                                    <Plus className="h-4 w-4" />
                                    Add Row
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          {renderTable('outflow', cashOutflows)}
                        </section>
                      </div>
                    )}

                    <NewYearModal isOpen={showNewYearModal} onClose={() => setShowNewYearModal(false)} onAdd={handleAddYear} />
                    <Toast message={toast} onClose={() => setToast(null)} />
                  </div>
                );
              }