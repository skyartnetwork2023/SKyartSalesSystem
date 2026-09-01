import { supabase } from './supabase';
import {
  financialMonths,
  type MonthCode,
  fetchVoucherPlans,
  saveVoucherPlans,
  deleteVoucherYear,
  fetchCashInflows,
  saveCashInflows,
  deleteCashInflowsYear,
  fetchCashOutflows,
  saveCashOutflows,
  deleteCashOutflowsYear,
  fetchCapexRows,
  saveCapexRows,
  deleteCapexYear,
  fetchOpexRows,
  saveOpexRows,
  deleteOpexYear,
  fetchInvestmentRows,
  saveInvestmentRows,
  deleteInvestmentYear,
  fetchLoanLedger,
  saveLoanLedger,
  deleteLoanYear,
  fetchPlanningRows,
  savePlanningRows,
  deletePlanningYear,
  cashSalesTotal,
  capexTotal,
  opexTotal,
  type VoucherPlanRow,
  type CashEntryRow,
  type CapexRow,
  type OpexRecurringRow,
  type OpexOperationRow,
  type InvestmentRow,
  type LoanRow,
  type RepaymentRow,
  type PlanningRow,
} from './financialRecordsService';

export interface VoucherData {
  id: string;
  user_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const GLOBAL_CACHE_KEY = '__all__';
const vouchersCache = new Map<string, VoucherData[]>();
const vouchersPromises = new Map<string, Promise<VoucherData[]>>();
const cacheKeyForUser = (userId?: string) => userId ?? GLOBAL_CACHE_KEY;

type CompositeKey = { userId: string; year: number };

type PlanningNote = {
  id: string;
  name: string;
  content: string;
};

type PendingPaymentRow = {
  id: string;
  date: string;
  customer: string;
  amount: number;
};

const PENDING_META_KEY = '__pendingPayments__';
const PENDING_META_ID = 'pending-meta';

const composeId = (userId: string, year: number) => `${userId}:${year}`;

const parseCompositeId = (id: string): CompositeKey | null => {
  if (!id) return null;
  const [userId, yearPart] = id.split(':');
  const year = Number(yearPart);
  if (!userId || !Number.isFinite(year)) return null;
  return { userId, year };
};

const randomId = () => {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const monthTemplate = (): Record<MonthCode, number> =>
  financialMonths.reduce((acc, code) => {
    acc[code] = 0;
    return acc;
  }, {} as Record<MonthCode, number>);

const legacyFromVoucherPlans = (plans: VoucherPlanRow[]) =>
  plans.map((plan) => ({
    id: plan.id,
    dataPlan: plan.dataPlan ?? '',
    duration: plan.duration ?? '',
    unitPrice: safeNumber(plan.unitPrice),
    months: { ...monthTemplate(), ...plan.months },
  }));

const toVoucherPlanRows = (rows: any[]): VoucherPlanRow[] =>
  rows.map((row) => ({
    id: String(row.id ?? randomId()),
    dataPlan: String(row.dataPlan ?? row.data_plan ?? ''),
    duration: String(row.duration ?? ''),
    unitPrice: safeNumber(row.unitPrice ?? row.unit_price),
    months: financialMonths.reduce((acc, code) => {
      acc[code] = safeNumber(row.months?.[code] ?? 0);
      return acc;
    }, {} as Record<MonthCode, number>),
  }));

const legacyFromCashRows = (rows: CashEntryRow[]) =>
  rows.map((row) => ({
    id: row.id,
    date: row.date,
    name: row.name ?? row.source ?? '',
    details: row.details ?? '',
    source: row.source ?? row.name ?? '',
    amount: safeNumber(row.amount),
    derived: false,
  }));

const toCashEntryRows = (rows: any[]): CashEntryRow[] =>
  rows
    .filter((row) => !row?.derived)
    .map((row) => ({
      id: String(row.id ?? randomId()),
      date: row.date ?? '',
      name: row.name ?? row.source ?? '',
      details: row.details ?? '',
      source: row.source ?? row.name ?? '',
      amount: safeNumber(row.amount),
    }));

const toCapexRows = (rows: any[]): CapexRow[] =>
  rows.map((row) => ({
    id: String(row.id ?? randomId()),
    date: row.date ?? '',
    item: row.item ?? '',
    details: row.details ?? row.description ?? '',
    quantity: safeNumber(row.quantity),
    costPerItem: safeNumber(row.costPerItem ?? row.cost_per_item),
    totalCost: safeNumber(row.totalCost ?? row.total_cost),
    vendor: row.vendor ?? '',
  }));

const toOpexRecurringRows = (rows: any[]): OpexRecurringRow[] =>
  rows.map((row, index) => ({
    id: String(row.id ?? randomId() ?? `opex-${index}`),
    item: String(row.item ?? `${index + 1}`),
    expense: row.expense ?? '',
    interval: row.interval ?? 'Monthly',
    frequency: safeNumber(row.frequency),
    costPerFrequency: safeNumber(row.costPerFrequency ?? row.cost_per_frequency),
    totalCost: safeNumber(row.totalCost ?? row.total_cost),
  }));

const toOpexOperationRows = (rows: any[]): OpexOperationRow[] =>
  rows.map((row, index) => ({
    id: String(row.id ?? randomId() ?? `op-${index}`),
    date: row.date ?? '',
    description: row.description ?? '',
    cost: safeNumber(row.cost ?? row.amount ?? row.totalCost),
  }));

const toInvestmentRows = (rows: any[]): InvestmentRow[] =>
  rows.map((row) => ({
    id: String(row.id ?? randomId()),
    date: row.date ?? '',
    item: row.item ?? '',
    vendor: row.vendor ?? '',
    details: row.details ?? row.description ?? '',
    quantity: safeNumber(row.quantity),
    costPerItem: safeNumber(row.costPerItem ?? row.cost_per_item),
    totalCost: safeNumber(row.totalCost ?? row.amount ?? row.total_cost),
  }));

const toLoanRows = (rows: any[]): LoanRow[] =>
  rows.map((row) => ({
    id: String(row.id ?? randomId()),
    date: row.date ?? '',
    creditor: row.creditor ?? row.lender ?? '',
    amount: safeNumber(row.amount),
    interestRate: safeNumber(row.interestRate ?? row.interest_rate),
    description: row.description ?? '',
  }));

const toRepaymentRows = (rows: any[]): RepaymentRow[] =>
  rows.map((row) => ({
    id: String(row.id ?? randomId()),
    date: row.date ?? '',
    debtor: row.debtor ?? row.lender ?? '',
    amount: safeNumber(row.amount),
  }));

const toPlanningRows = (rows: any[]): PlanningRow[] =>
  rows.map((row) => ({
    id: String(row.id ?? randomId()),
    date: row.date ?? '',
    planType: row.planType ?? row.plan_type ?? row.name ?? row.title ?? '',
    description: row.description ?? row.content ?? row.note ?? '',
    details: (row.details ?? {}) as Record<string, unknown>,
  }));

const toPendingPaymentsRows = (rows: any[]): PendingPaymentRow[] =>
  rows
    .map((row) => {
      const dateValue = typeof row.date === 'string' ? row.date.trim() : row.date ?? '';
      const customerValue =
        typeof row.customer === 'string' && row.customer.trim()
          ? row.customer.trim()
          : typeof row.client === 'string' && row.client.trim()
            ? row.client.trim()
            : typeof row.vendor === 'string' && row.vendor.trim()
              ? row.vendor.trim()
              : typeof row.name === 'string'
                ? row.name.trim()
                : '';
      return {
        id: String(row.id ?? randomId()),
        date: typeof dateValue === 'string' ? dateValue : String(dateValue ?? ''),
        customer: customerValue,
        amount: safeNumber(row.amount),
      };
    })
    .filter((row) => Boolean(row.date) || Boolean(row.customer) || row.amount !== 0);

const legacyFromCapex = (rows: CapexRow[]) => rows.map((row) => ({ ...row }));
const legacyFromInvestments = (rows: InvestmentRow[]) => rows.map((row) => ({ ...row }));

const legacyFromLoans = (rows: LoanRow[]) =>
  rows.map((row) => ({
    id: row.id,
    date: row.date,
    creditor: row.creditor,
    amount: safeNumber(row.amount),
    interestRate: safeNumber(row.interestRate),
    description: row.description ?? '',
  }));

const legacyFromRepayments = (rows: RepaymentRow[]) =>
  rows.map((row) => ({
    id: row.id,
    date: row.date,
    debtor: row.debtor,
    amount: safeNumber(row.amount),
  }));

const legacyFromPlanning = (rows: PlanningNote[]) =>
  rows.map((row) => ({
    id: row.id,
    name: row.name,
    content: row.content,
  }));

const extractPlanningData = (rows: PlanningRow[]) => {
  const notes: PlanningNote[] = [];
  let pending: PendingPaymentRow[] = [];

  rows.forEach((row) => {
    if (typeof row.planType === 'string' && row.planType === PENDING_META_KEY) {
      const details = (row.details ?? {}) as Record<string, unknown>;
      const rawEntries = Array.isArray((details as any).entries) ? (details as any).entries : [];
      pending = toPendingPaymentsRows(rawEntries as any[]);
    } else {
      const noteName = typeof row.planType === 'string' ? row.planType.trim() : '';
      const noteContent = typeof row.description === 'string' ? row.description.trim() : '';
      notes.push({
        id: row.id,
        name: noteName,
        content: noteContent,
      });
    }
  });

  return { notes, pending };
};

const buildPlanningRowsForSave = (planningNotes: any[], pendingRows: any[]): PlanningRow[] => {
  const noteRows = toPlanningRows(planningNotes)
    .map((row) => ({
      ...row,
      planType: (row.planType ?? '').trim(),
      description: (row.description ?? '').trim(),
      details: {},
    }))
    .filter((row) => Boolean(row.planType) || Boolean(row.description));

  const normalizedPending = toPendingPaymentsRows(pendingRows);

  if (normalizedPending.length) {
    noteRows.push({
      id: PENDING_META_ID,
      date: '',
      planType: PENDING_META_KEY,
      description: '',
      details: { entries: normalizedPending },
    });
  }

  return noteRows;
};

const assembleYearRecord = async (userId: string, year: number): Promise<VoucherData | null> => {
  const [
    voucherPlans,
    cashIn,
    cashOut,
    capexRows,
    opexRows,
    investments,
    loanLedger,
    planningRows,
    voucherSales,
    capexSum,
    opexSum,
  ] = await Promise.all([
    fetchVoucherPlans(userId, year),
    fetchCashInflows(userId, year),
    fetchCashOutflows(userId, year),
    fetchCapexRows(userId, year),
    fetchOpexRows(userId, year),
    fetchInvestmentRows(userId, year),
    fetchLoanLedger(userId, year),
    fetchPlanningRows(userId, year),
    cashSalesTotal(userId, year),
    capexTotal(userId, year),
    opexTotal(userId, year),
  ]);

  const { notes: planningNotes, pending: pendingRows } = extractPlanningData(planningRows);

  const hasData =
    voucherPlans.length ||
    cashIn.length ||
    cashOut.length ||
    capexRows.length ||
    opexRows.recurring.length ||
    opexRows.operations.length ||
    investments.length ||
    loanLedger.loans.length ||
    loanLedger.repayments.length ||
    planningNotes.length ||
    pendingRows.length;

  if (!hasData) return null;

  const id = composeId(userId, year);
  const now = new Date().toISOString();
  return {
    id,
    user_id: userId,
    data: {
      year,
      vouchers: legacyFromVoucherPlans(voucherPlans),
      cashInflows: legacyFromCashRows(cashIn),
      cashOutflows: legacyFromCashRows(cashOut),
      capex: legacyFromCapex(capexRows),
      opex: opexRows.recurring,
      opexop: opexRows.operations,
      investment: legacyFromInvestments(investments),
      loans: legacyFromLoans(loanLedger.loans),
      repayments: legacyFromRepayments(loanLedger.repayments),
      planning: legacyFromPlanning(planningNotes),
      pendingPayments: pendingRows.map((row) => ({
        id: row.id,
        date: row.date,
        customer: row.customer,
        amount: safeNumber(row.amount),
      })),
      voucherSalesTotal: voucherSales,
      capexTotal: capexSum,
      opexTotal: opexSum,
    },
    created_at: now,
    updated_at: now,
  };
};

const collectCompositeKeys = async (userId?: string): Promise<CompositeKey[]> => {
  const tables = [
    'vouchers_monthly',
    'cash_inflows',
    'cash_outflows',
    'capex',
    'opex',
    'investments',
    'loans',
    'planning',
  ] as const;

  const combos = new Map<string, CompositeKey>();

  const responses = await Promise.all(
    tables.map((table) => {
      let query = supabase.from(table).select('user_id, year');
      if (userId) {
        query = query.eq('user_id', userId);
      }
      return query;
    }),
  );

  responses.forEach((response) => {
    if (!response) return;
    if (response.error) {
      throw response.error;
    }
    (response.data ?? []).forEach((row: any) => {
      const rowUserId = row?.user_id;
      const year = Number(row?.year);
      if (!rowUserId || !Number.isFinite(year)) return;
      if (userId && rowUserId !== userId) return;
      combos.set(composeId(rowUserId, year), { userId: rowUserId, year });
    });
  });

  return Array.from(combos.values());
};

const persistFinancialData = async (payload: Record<string, unknown>, userId: string, fallbackYear?: number) => {
  const yearValue = payload?.year ?? fallbackYear;
  const year = Number(yearValue);
  if (!Number.isFinite(year)) throw new Error('Year is required to persist financial data.');

  const tasks: Promise<unknown>[] = [];
  const hasProp = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);

  if (hasProp('vouchers')) {
    const rows = Array.isArray((payload as any).vouchers) ? (payload as any).vouchers : [];
    tasks.push(saveVoucherPlans(userId, year, toVoucherPlanRows(rows)));
  }
  if (hasProp('cashInflows')) {
    const rows = Array.isArray((payload as any).cashInflows) ? (payload as any).cashInflows : [];
    tasks.push(saveCashInflows(userId, year, toCashEntryRows(rows)));
  }
  if (hasProp('cashOutflows')) {
    const rows = Array.isArray((payload as any).cashOutflows) ? (payload as any).cashOutflows : [];
    tasks.push(saveCashOutflows(userId, year, toCashEntryRows(rows)));
  }
  if (hasProp('capex')) {
    const rows = Array.isArray((payload as any).capex) ? (payload as any).capex : [];
    tasks.push(saveCapexRows(userId, year, toCapexRows(rows)));
  }
  if (hasProp('opex') || hasProp('opexop')) {
    const recurring = Array.isArray((payload as any).opex) ? toOpexRecurringRows((payload as any).opex) : [];
    const operations = Array.isArray((payload as any).opexop) ? toOpexOperationRows((payload as any).opexop) : [];
    tasks.push(saveOpexRows(userId, year, recurring, operations));
  }
  if (hasProp('investment')) {
    const rows = Array.isArray((payload as any).investment) ? (payload as any).investment : [];
    tasks.push(saveInvestmentRows(userId, year, toInvestmentRows(rows)));
  }
  if (hasProp('loans') || hasProp('repayments')) {
    const loanRows = Array.isArray((payload as any).loans) ? toLoanRows((payload as any).loans) : [];
    const repaymentRows = Array.isArray((payload as any).repayments) ? toRepaymentRows((payload as any).repayments) : [];
    tasks.push(saveLoanLedger(userId, year, { loans: loanRows, repayments: repaymentRows }));
  }
  if (hasProp('planning') || hasProp('pendingPayments')) {
    const planningNotes = Array.isArray((payload as any).planning) ? (payload as any).planning : [];
    const pendingPayments = Array.isArray((payload as any).pendingPayments) ? (payload as any).pendingPayments : [];
    tasks.push(savePlanningRows(userId, year, buildPlanningRowsForSave(planningNotes, pendingPayments)));
  }

  await Promise.all(tasks);
  const record = await assembleYearRecord(userId, year);
  if (record) return record;
  const now = new Date().toISOString();
  return {
    id: composeId(userId, year),
    user_id: userId,
    data: { year },
    created_at: now,
    updated_at: now,
  };
};

export async function createVoucher(data: Record<string, unknown>, userId: string) {
  const result = await persistFinancialData(data, userId);
  invalidateVouchersCache(userId);
  return result;
}

export function invalidateVouchersCache(userId?: string) {
  if (userId) {
    const cacheKey = cacheKeyForUser(userId);
    vouchersCache.delete(cacheKey);
    vouchersPromises.delete(cacheKey);
    return;
  }
  vouchersCache.clear();
  vouchersPromises.clear();
}

async function fetchAllVouchers(userId?: string): Promise<VoucherData[]> {
  const combos = await collectCompositeKeys(userId);
  if (!combos.length) return [];
  const records = await Promise.all(combos.map(({ userId: entryUserId, year }) => assembleYearRecord(entryUserId, year)));
  return records
    .filter((value): value is VoucherData => Boolean(value) && (!userId || value.user_id === userId))
    .sort((a, b) => {
      const yearA = Number(a.data?.year ?? 0);
      const yearB = Number(b.data?.year ?? 0);
      if (yearA === yearB) return a.user_id.localeCompare(b.user_id);
      return yearB - yearA;
    });
}

export async function getVouchers(options?: { force?: boolean; userId?: string }): Promise<VoucherData[]> {
  const cacheKey = cacheKeyForUser(options?.userId);

  if (options?.force) {
    vouchersCache.delete(cacheKey);
    vouchersPromises.delete(cacheKey);
  }

  if (!options?.force && vouchersCache.has(cacheKey)) {
    return vouchersCache.get(cacheKey)!;
  }
  if (!options?.force && vouchersPromises.has(cacheKey)) {
    return vouchersPromises.get(cacheKey)!;
  }

  const loadPromise = fetchAllVouchers(options?.userId).then((records) => {
    vouchersCache.set(cacheKey, records);
    return records;
  });

  const guardedPromise = loadPromise
    .catch((error) => {
      vouchersCache.delete(cacheKey);
      throw error;
    })
    .finally(() => {
      vouchersPromises.delete(cacheKey);
    });

  vouchersPromises.set(cacheKey, guardedPromise);

  return guardedPromise;
}

export async function getVoucherById(id: string) {
  const parsed = parseCompositeId(id);
  if (!parsed) return null;
  return assembleYearRecord(parsed.userId, parsed.year);
}

export async function updateVoucher(id: string, data: Record<string, unknown>, userId: string) {
  const parsed = parseCompositeId(id);
  const year = Number(data?.year ?? parsed?.year);
  if (!parsed && !Number.isFinite(year)) throw new Error('Unable to resolve record key for update.');
  const result = await persistFinancialData(data, userId, year);
  invalidateVouchersCache(userId);
  return result;
}

export async function deleteVoucher(id: string, userId: string) {
  const parsed = parseCompositeId(id);
  if (!parsed) return;
  const { year } = parsed;

  await Promise.all([
    deleteVoucherYear(userId, year),
    deleteCashInflowsYear(userId, year),
    deleteCashOutflowsYear(userId, year),
    deleteCapexYear(userId, year),
    deleteOpexYear(userId, year),
    deleteInvestmentYear(userId, year),
    deleteLoanYear(userId, year),
    deletePlanningYear(userId, year),
  ]);

  invalidateVouchersCache(userId);
}
