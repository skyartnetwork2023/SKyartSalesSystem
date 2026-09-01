// Delete all normalized financial records for a user and year
import {
  deleteVoucherYear,
  deleteCashInflowsYear,
  deleteCashOutflowsYear,
  deleteCapexYear,
  deleteOpexYear,
  deleteInvestmentYear,
  deleteLoanYear,
  deletePlanningYear,
} from './financialRecordsService';

export async function deleteVouchersByYear(userId: string, year: number) {
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
}
