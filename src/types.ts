
export type TransactionType = 'SALE' | 'EXPENSE';

export interface Transaction {
  id: string;
  date: string;
  type: TransactionType;
  category: string;
  description: string;
  amount: number;
  customerOrVendor?: string;
  paymentMethod: string;
  reference?: string;
  createdAt: string;
}

export interface LedgerSummary {
  totalSales: number;
  totalExpenses: number;
  balance: number;
}
