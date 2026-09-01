import { supabase } from './supabase';

const MONTH_CODES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'] as const;

export type MonthCode = typeof MONTH_CODES[number];

const monthLabelToNumber = (label: string): number => {
  const upper = label.trim().slice(0, 3).toUpperCase();
  const index = MONTH_CODES.findIndex((code) => code.startsWith(upper));
  return index >= 0 ? index + 1 : 1;
};

const monthNumberToLabel = (value: number): MonthCode => {
  const normalized = Number.isFinite(value) ? Math.max(1, Math.min(12, Math.trunc(value))) : 1;
  return MONTH_CODES[normalized - 1];
};

const toDateString = (year: number, month: number, fallbackDay = 1) => {
  const safeMonth = Math.max(1, Math.min(12, Math.trunc(month)));
  const day = Math.max(1, Math.min(28, Math.trunc(fallbackDay)));
  const isoMonth = String(safeMonth).padStart(2, '0');
  const isoDay = String(day).padStart(2, '0');
  return `${year}-${isoMonth}-${isoDay}`;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const safeInt = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
};

const parseJson = <T>(payload: string | null, fallback: T): T => {
  if (!payload) return fallback;
  const trimmed = payload.trim();
  if (!trimmed) return fallback;
  const first = trimmed[0];
  const isJsonLike = first === '{' || first === '[' || first === '"' || first === '-' || (first >= '0' && first <= '9');
  if (!isJsonLike) {
    return trimmed as unknown as T;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return (parsed ?? fallback) as T;
  } catch (error) {
    console.warn('Failed to parse JSON payload', error);
    return fallback;
  }
};

const serializeJson = (payload: unknown) => JSON.stringify(payload ?? {});

const mapDistinctYears = (rows: Array<{ year: number | null }>, currentYear: number) => {
  const set = new Set<number>();
  rows.forEach((row) => {
    const year = safeInt(row?.year);
    if (year) set.add(year);
  });
  if (!set.size) set.add(currentYear);
  return Array.from(set).sort((a, b) => a - b);
};

export const financialMonths = MONTH_CODES;

export type VoucherPlanRow = {
  id: string;
  dataPlan: string;
  duration: string;
  unitPrice: number;
  months: Record<MonthCode, number>;
  description?: string | null;
};

export async function listVoucherYears(userId: string, currentYear: number) {
  const { data, error } = await supabase
    .from('vouchers_monthly')
    .select('year')
    .eq('user_id', userId);
  if (error) throw error;
  return mapDistinctYears(data ?? [], currentYear);
}

export async function fetchVoucherPlans(userId: string, year: number): Promise<VoucherPlanRow[]> {
  const { data, error } = await supabase
    .from('vouchers_monthly')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;

  const grouped = new Map<string, VoucherPlanRow>();
  (data ?? []).forEach((entry) => {
    const voucherId = (entry as any)?.voucher_id ?? (entry as any)?.id;
    if (!grouped.has(voucherId)) {
      const months: Record<MonthCode, number> = MONTH_CODES.reduce((acc, code) => {
        acc[code] = 0;
        return acc;
      }, {} as Record<MonthCode, number>);
      grouped.set(voucherId, {
        id: voucherId,
        dataPlan: ((entry as any)?.data_plan ?? '') as string,
        duration: ((entry as any)?.duration ?? '') as string,
        unitPrice: safeNumber((entry as any)?.unit_price),
        months,
        description: (entry as any)?.description ?? null,
      });
    }
    const plan = grouped.get(voucherId)!;
    const monthIndex = safeInt((entry as any)?.month);
    const monthCode = monthNumberToLabel(monthIndex);
    plan.months[monthCode] = safeInt((entry as any)?.units_sold);
    if (!plan.unitPrice) plan.unitPrice = safeNumber((entry as any)?.unit_price);
    if (!plan.dataPlan) plan.dataPlan = ((entry as any)?.data_plan ?? '') as string;
    if (!plan.duration) plan.duration = ((entry as any)?.duration ?? '') as string;
    if (!plan.description) plan.description = (entry as any)?.description ?? null;
  });

  return Array.from(grouped.values());
}

export async function saveVoucherPlans(userId: string, year: number, plans: VoucherPlanRow[]) {
  const rows = plans.flatMap((plan) => {
    const unitPrice = safeNumber(plan.unitPrice);
    return MONTH_CODES.map((code, index) => {
      const units = safeInt(plan.months?.[code] ?? 0);
      const amount = unitPrice * units;
      return {
        user_id: userId,
        year,
        month: index + 1,
        date: toDateString(year, index + 1),
        voucher_id: plan.id,
        data_plan: plan.dataPlan,
        duration: plan.duration,
        unit_price: unitPrice,
        units_sold: units,
        amount,
        description: plan.description ?? null,
      };
    });
  });

  const { error: deleteError } = await supabase
    .from('vouchers_monthly')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (deleteError) throw deleteError;

  if (!rows.length) return;

  const { error: insertError } = await supabase
    .from('vouchers_monthly')
    .insert(rows, { returning: 'minimal' });
  if (insertError) throw insertError;
}

export async function deleteVoucherYear(userId: string, year: number) {
  const { error } = await supabase
    .from('vouchers_monthly')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
}

export async function fetchVoucherYearTotals(userId: string) {
  const { data, error } = await supabase
    .from('vouchers_monthly')
    .select('year, amount')
    .eq('user_id', userId);
  if (error) throw error;

  const totals = new Map<number, number>();
  (data ?? []).forEach((entry: any) => {
    const year = safeInt(entry?.year);
    if (!year) return;
    const current = totals.get(year) ?? 0;
    totals.set(year, current + safeNumber(entry?.amount));
  });

  return Array.from(totals.entries())
    .map(([year, total]) => ({ year, total }))
    .sort((a, b) => a.year - b.year);
}

type CashTable = 'cash_inflows' | 'cash_outflows';

export type CashEntryRow = {
  id: string;
  date: string;
  name: string;
  details: string;
  source: string;
  amount: number;
};

const fetchCashTable = async (table: CashTable, userId: string, year: number): Promise<CashEntryRow[]> => {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((entry: any) => ({
    id: entry.id,
    date: entry.date ?? toDateString(year, entry.month ?? 1),
    name: table === 'cash_inflows' ? (entry.source ?? '') : (entry.category ?? ''),
    details: entry.description ?? '',
    source: table === 'cash_inflows' ? (entry.source ?? '') : (entry.category ?? ''),
    amount: safeNumber(entry.amount),
  }));
};

const saveCashTable = async (table: CashTable, userId: string, year: number, rows: CashEntryRow[]) => {
  const mapped = rows.map((row) => {
    const parsedDate = row.date ? new Date(row.date) : null;
    const month = parsedDate ? parsedDate.getUTCMonth() + 1 : monthLabelToNumber(row.source || 'JAN');
    const day = parsedDate ? parsedDate.getUTCDate() : 1;
    return {
      user_id: userId,
      year,
      month,
      date: parsedDate ? parsedDate.toISOString().slice(0, 10) : toDateString(year, month, day),
      amount: safeNumber(row.amount),
      description: row.details ?? '',
      ...(table === 'cash_inflows'
        ? { source: row.source ?? row.name ?? '' }
        : { category: row.source ?? row.name ?? '' }),
    };
  });

  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (deleteError) throw deleteError;

  if (!mapped.length) return;

  const { error: insertError } = await supabase
    .from(table)
    .insert(mapped, { returning: 'minimal' });
  if (insertError) throw insertError;
};

export const fetchCashInflows = (userId: string, year: number) => fetchCashTable('cash_inflows', userId, year);
export const fetchCashOutflows = (userId: string, year: number) => fetchCashTable('cash_outflows', userId, year);
export const saveCashInflows = (userId: string, year: number, rows: CashEntryRow[]) => saveCashTable('cash_inflows', userId, year, rows);
export const saveCashOutflows = (userId: string, year: number, rows: CashEntryRow[]) => saveCashTable('cash_outflows', userId, year, rows);
export const deleteCashInflowsYear = async (userId: string, year: number) => {
  const { error } = await supabase
    .from('cash_inflows')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
};

export const deleteCashOutflowsYear = async (userId: string, year: number) => {
  const { error } = await supabase
    .from('cash_outflows')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
};

export async function cashSalesTotal(userId: string, year: number) {
  const { data, error } = await supabase
    .from('vouchers_monthly')
    .select('amount')
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).reduce((sum, entry: any) => sum + safeNumber(entry?.amount), 0);
}

export async function capexTotal(userId: string, year: number) {
  const { data, error } = await supabase
    .from('capex')
    .select('amount')
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).reduce((sum, entry: any) => sum + safeNumber(entry?.amount), 0);
}

export async function opexTotal(userId: string, year: number) {
  const { data, error } = await supabase
    .from('opex')
    .select('amount')
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
  return (data ?? []).reduce((sum, entry: any) => sum + safeNumber(entry?.amount), 0);
}

const parseUiDate = (value: unknown, year: number) => {
  if (value instanceof Date) {
    const time = value.getTime();
    if (!Number.isFinite(time)) return toDateString(year, 1, 1);
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 59 && value < 60000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const asDate = new Date(excelEpoch + Math.round(value) * 24 * 60 * 60 * 1000);
    if (Number.isFinite(asDate.getTime())) {
      return asDate.toISOString().slice(0, 10);
    }
  }

  const textRaw = typeof value === 'string' ? value : String(value ?? '');
  const text = textRaw.trim();
  const lower = text.toLowerCase();
  if (!text || lower === '[object object]' || lower === 'invalid date' || lower === 'undefined' || lower === 'null') {
    return toDateString(year, 1, 1);
  }

  const isoMatch = /^\d{4}-\d{2}-\d{2}$/;
  if (isoMatch.test(text)) return text;

  const monthPart = text.slice(0, 3);
  const dayPart = text.slice(-2);
  const month = monthLabelToNumber(monthPart);
  const day = safeInt(dayPart) || 1;
  return toDateString(year, month, day);
};

// Capex helpers

type CapexDetailsPayload = {
  details?: string;
  quantity?: number;
  costPerItem?: number;
};

const decodeCapexDetails = (text: string | null): CapexDetailsPayload => {
  if (!text) return {};
  const asJson = parseJson<CapexDetailsPayload | string>(text, {});
  if (typeof asJson === 'string') return { details: asJson };
  return asJson ?? {};
};

export type CapexRow = {
  id: string;
  date: string;
  item: string;
  details: string;
  quantity: number;
  costPerItem: number;
  totalCost: number;
  vendor: string;
};

export async function listCapexYears(userId: string, currentYear: number) {
  const { data, error } = await supabase
    .from('capex')
    .select('year')
    .eq('user_id', userId);
  if (error) throw error;
  return mapDistinctYears(data ?? [], currentYear);
}

export async function fetchCapexRows(userId: string, year: number): Promise<CapexRow[]> {
  const { data, error } = await supabase
    .from('capex')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((entry: any) => {
    const decoded = decodeCapexDetails(entry.description ?? null);
    const quantity = safeNumber((decoded as any)?.quantity ?? entry.quantity);
    const costPerItem = safeNumber((decoded as any)?.costPerItem ?? entry.cost_per_item);
    const details = ((decoded as any)?.details ?? entry.description ?? '') as string;
    const totalCost = safeNumber(entry.amount ?? quantity * costPerItem);
    return {
      id: entry.id,
      date: entry.date ?? toDateString(year, entry.month ?? 1),
      item: entry.item ?? '',
      details,
      quantity,
      costPerItem,
      totalCost,
      vendor: entry.vendor ?? '',
    };
  });
}

export async function saveCapexRows(userId: string, year: number, rows: CapexRow[]) {
  const mapped = rows.map((row) => {
    const quantity = safeNumber(row.quantity);
    const costPerItem = safeNumber(row.costPerItem);
    const totalCost = safeNumber(row.totalCost || quantity * costPerItem);
    const isoDate = parseUiDate(row.date, year);
    const month = safeInt(isoDate.slice(5, 7));
    return {
      user_id: userId,
      year,
      month,
      date: isoDate,
      item: row.item ?? '',
      vendor: row.vendor ?? '',
      amount: totalCost,
      description: serializeJson({ details: row.details ?? '', quantity, costPerItem }),
    };
  });

  const { error: deleteError } = await supabase
    .from('capex')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (deleteError) throw deleteError;

  if (!mapped.length) return;

  const { error: insertError } = await supabase
    .from('capex')
    .insert(mapped, { returning: 'minimal' });
  if (insertError) throw insertError;
}

export async function deleteCapexYear(userId: string, year: number) {
  const { error } = await supabase
    .from('capex')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
}

// Opex helpers

type OpexPayload = {
  type: 'recurring' | 'operation';
  expense?: string;
  interval?: string;
  frequency?: number;
  costPerFrequency?: number;
  description?: string;
};

export type OpexRecurringRow = {
  id: string;
  item: string;
  expense: string;
  interval: string;
  frequency: number;
  costPerFrequency: number;
  totalCost: number;
};

export type OpexOperationRow = {
  id: string;
  date: string;
  description: string;
  cost: number;
};

const decodeOpexPayload = (text: string | null): OpexPayload => {
  const parsed = parseJson<OpexPayload | string>(text, { type: 'recurring' });
  if (typeof parsed === 'string') {
    return { type: 'recurring', expense: parsed };
  }
  return parsed ?? { type: 'recurring' };
};

export async function listOpexYears(userId: string, currentYear: number) {
  const { data, error } = await supabase
    .from('opex')
    .select('year')
    .eq('user_id', userId);
  if (error) throw error;
  return mapDistinctYears(data ?? [], currentYear);
}

export async function fetchOpexRows(userId: string, year: number) {
  const { data, error } = await supabase
    .from('opex')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('date', { ascending: true });
  if (error) throw error;

  const recurring: OpexRecurringRow[] = [];
  const operations: OpexOperationRow[] = [];

  (data ?? []).forEach((entry: any) => {
    const payload = decodeOpexPayload(entry.description ?? null);
    if (payload.type === 'operation') {
      operations.push({
        id: entry.id,
        date: entry.date ?? toDateString(year, entry.month ?? 1),
        description: payload.description ?? entry.item ?? '',
        cost: safeNumber(entry.amount),
      });
    } else {
      const frequency = safeNumber(payload.frequency);
      const costPerFrequency = safeNumber(payload.costPerFrequency);
      const totalCost = safeNumber(entry.amount ?? frequency * costPerFrequency);
      recurring.push({
        id: entry.id,
        item: entry.item ?? '',
        expense: payload.expense ?? entry.item ?? '',
        interval: payload.interval ?? 'Monthly',
        frequency,
        costPerFrequency,
        totalCost,
      });
    }
  });

  return { recurring, operations };
}

export async function saveOpexRows(
  userId: string,
  year: number,
  recurring: OpexRecurringRow[],
  operations: OpexOperationRow[],
) {
  const recurringPayload = recurring.map((row) => ({
    user_id: userId,
    year,
    month: 1,
    date: toDateString(year, 1),
    item: row.item ?? '',
    amount: safeNumber(row.totalCost),
    description: serializeJson({
      type: 'recurring',
      expense: row.expense,
      interval: row.interval,
      frequency: safeNumber(row.frequency),
      costPerFrequency: safeNumber(row.costPerFrequency),
    }),
  }));

  const operationPayload = operations.map((row) => {
    const isoDate = parseUiDate(row.date, year);
    const month = safeInt(isoDate.slice(5, 7));
    return {
      user_id: userId,
      year,
      month,
      date: isoDate,
      item: row.description ?? '',
      amount: safeNumber(row.cost),
      description: serializeJson({ type: 'operation', description: row.description ?? '' }),
    };
  });

  const payload = [...recurringPayload, ...operationPayload];

  const { error: deleteError } = await supabase
    .from('opex')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (deleteError) throw deleteError;

  if (!payload.length) return;

  const { error: insertError } = await supabase
    .from('opex')
    .insert(payload, { returning: 'minimal' });
  if (insertError) throw insertError;
}

export async function deleteOpexYear(userId: string, year: number) {
  const { error } = await supabase
    .from('opex')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
}

// Loans

export type LoanRow = {
  id: string;
  date: string;
  creditor: string;
  amount: number;
  interestRate: number;
  description: string;
};

export type RepaymentRow = {
  id: string;
  date: string;
  debtor: string;
  amount: number;
};

type LoanMeta = {
  type: 'loan' | 'repayment';
  description?: string;
  name?: string;
};

export async function listLoanYears(userId: string, currentYear: number) {
  const { data, error } = await supabase
    .from('loans')
    .select('year')
    .eq('user_id', userId);
  if (error) throw error;
  return mapDistinctYears(data ?? [], currentYear);
}

export async function fetchLoanLedger(userId: string, year: number) {
  const { data, error } = await supabase
    .from('loans')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('date', { ascending: true });
  if (error) throw error;

  const loans: LoanRow[] = [];
  const repayments: RepaymentRow[] = [];

  (data ?? []).forEach((entry: any) => {
    const meta = parseJson<LoanMeta | string>(entry.description ?? null, { type: 'loan' });
    const normalized = typeof meta === 'string' ? { type: 'loan', description: meta } : (meta ?? { type: 'loan' });
    const date = entry.date ?? toDateString(year, entry.month ?? 1);
    const storedName = typeof normalized.name === 'string' ? normalized.name.trim() : '';
    const persistedName = [entry.lender, entry.creditor, entry.name, entry.company]
      .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
      .find((value: string) => Boolean(value)) ?? '';
    const resolvedName = persistedName || storedName;
    if (normalized.type === 'repayment') {
      repayments.push({
        id: entry.id,
        date,
        debtor: resolvedName,
        amount: safeNumber(entry.amount),
      });
    } else {
      loans.push({
        id: entry.id,
        date,
        creditor: resolvedName,
        amount: safeNumber(entry.amount),
        interestRate: safeNumber(entry.interest_rate),
        description: normalized.description ?? '',
      });
    }
  });

  return { loans, repayments };
}

export async function saveLoanLedger(
  userId: string,
  year: number,
  payload: { loans: LoanRow[]; repayments: RepaymentRow[] },
) {
  const loanRows = payload.loans.map((row) => {
    const isoDate = parseUiDate(row.date, year);
    const month = safeInt(isoDate.slice(5, 7));
    return {
      user_id: userId,
      year,
      month,
      date: isoDate,
      lender: row.creditor ?? '',
      amount: safeNumber(row.amount),
      interest_rate: safeNumber(row.interestRate),
      description: serializeJson({
        type: 'loan',
        description: row.description ?? '',
        name: row.creditor ?? '',
      }),
    };
  });

  const repaymentRows = payload.repayments.map((row) => {
    const isoDate = parseUiDate(row.date, year);
    const month = safeInt(isoDate.slice(5, 7));
    return {
      user_id: userId,
      year,
      month,
      date: isoDate,
      lender: row.debtor ?? '',
      amount: safeNumber(row.amount),
      interest_rate: 0,
      description: serializeJson({ type: 'repayment', name: row.debtor ?? '' }),
    };
  });

  const mapped = [...loanRows, ...repaymentRows];

  const { error: deleteError } = await supabase
    .from('loans')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (deleteError) throw deleteError;

  if (!mapped.length) return;

  const { error: insertError } = await supabase
    .from('loans')
    .insert(mapped, { returning: 'minimal' });
  if (insertError) throw insertError;
}

export async function deleteLoanYear(userId: string, year: number) {
  const { error } = await supabase
    .from('loans')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
}

// Investments

export type InvestmentRow = {
  id: string;
  date: string;
  item: string;
  vendor: string;
  details: string;
  quantity: number;
  costPerItem: number;
  totalCost: number;
};

export async function listInvestmentYears(userId: string, currentYear: number) {
  const { data, error } = await supabase
    .from('investments')
    .select('year')
    .eq('user_id', userId);
  if (error) throw error;
  return mapDistinctYears(data ?? [], currentYear);
}

export async function fetchInvestmentRows(userId: string, year: number): Promise<InvestmentRow[]> {
  const { data, error } = await supabase
    .from('investments')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((entry: any) => {
    const quantity = safeNumber(entry.quantity);
    const costPerItem = safeNumber(entry.cost_per_item);
    const totalCost = safeNumber(entry.amount ?? quantity * costPerItem);
    return {
      id: entry.id,
      date: entry.date ?? toDateString(year, entry.month ?? 1),
      item: entry.item ?? '',
      vendor: entry.vendor ?? '',
      details: entry.description ?? '',
      quantity,
      costPerItem,
      totalCost,
    };
  });
}

export async function saveInvestmentRows(userId: string, year: number, rows: InvestmentRow[]) {
  const mapped = rows.map((row) => {
    const quantity = safeNumber(row.quantity);
    const costPerItem = safeNumber(row.costPerItem);
    const totalCost = safeNumber(row.totalCost || quantity * costPerItem);
    const isoDate = parseUiDate(row.date, year);
    const month = safeInt(isoDate.slice(5, 7));
    return {
      user_id: userId,
      year,
      month,
      date: isoDate,
      item: row.item ?? '',
      vendor: row.vendor ?? '',
      quantity,
      cost_per_item: costPerItem,
      amount: totalCost,
      description: row.details ?? '',
    };
  });

  const { error: deleteError } = await supabase
    .from('investments')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (deleteError) throw deleteError;

  if (!mapped.length) return;

  const { error: insertError } = await supabase
    .from('investments')
    .insert(mapped, { returning: 'minimal' });
  if (insertError) throw insertError;
}

export async function deleteInvestmentYear(userId: string, year: number) {
  const { error } = await supabase
    .from('investments')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
}

// Planning

export type PlanningRow = {
  id: string;
  date: string;
  planType: string;
  description: string;
  details: Record<string, unknown>;
};

export async function listPlanningYears(userId: string, currentYear: number) {
  const { data, error } = await supabase
    .from('planning')
    .select('year')
    .eq('user_id', userId);
  if (error) throw error;
  return mapDistinctYears(data ?? [], currentYear);
}

export async function fetchPlanningRows(userId: string, year: number): Promise<PlanningRow[]> {
  const { data, error } = await supabase
    .from('planning')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('date', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((entry: any) => ({
    id: entry.id,
    date: entry.date ?? toDateString(year, entry.month ?? 1),
    planType: entry.plan_type ?? '',
    description: entry.description ?? '',
    details: (entry.details ?? {}) as Record<string, unknown>,
  }));
}

export async function savePlanningRows(userId: string, year: number, rows: PlanningRow[]) {
  const mapped = rows.map((row) => {
    const isoDate = parseUiDate(row.date, year);
    const month = safeInt(isoDate.slice(5, 7));
    return {
      user_id: userId,
      year,
      month,
      date: isoDate,
      plan_type: row.planType ?? '',
      description: row.description ?? '',
      details: row.details ?? {},
    };
  });

  const { error: deleteError } = await supabase
    .from('planning')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (deleteError) throw deleteError;

  if (!mapped.length) return;

  const { error: insertError } = await supabase
    .from('planning')
    .insert(mapped, { returning: 'minimal' });
  if (insertError) throw insertError;
}

export async function deletePlanningYear(userId: string, year: number) {
  const { error } = await supabase
    .from('planning')
    .delete()
    .eq('user_id', userId)
    .eq('year', year);
  if (error) throw error;
}

export async function listCashYears(userId: string, currentYear: number) {
  const { data, error } = await supabase
    .from('cash_inflows')
    .select('year')
    .eq('user_id', userId);
  if (error) throw error;
  const { data: outflow, error: outflowError } = await supabase
    .from('cash_outflows')
    .select('year')
    .eq('user_id', userId);
  if (outflowError) throw outflowError;
  return mapDistinctYears([...(data ?? []), ...(outflow ?? [])], currentYear);
}
