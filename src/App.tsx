/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Download, 
  Printer, 
  TrendingUp, 
  TrendingDown, 
  Wallet,
  Calendar,
  X,
  Edit2,
  Trash2,
  PieChart as PieChartIcon,
  BarChart3,
  LayoutDashboard,
  ArrowUpRight,
  ArrowDownRight,
  History,
  FileText,
  ChevronRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { format, startOfMonth, endOfMonth, isWithinInterval, startOfYear, endOfYear, subMonths } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Transaction, TransactionType } from './types';
import { cn, formatCurrency, formatDate } from './lib/utils';

// Consts
const CATEGORIES = {
  SALE: ['Product Sales', 'Service Fees', 'Consultation', 'Other Income'],
  EXPENSE: ['Inventory', 'Rent', 'Utilities', 'Salaries', 'Marketing', 'Repairs', 'Tax', 'Other Expense']
};

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Credit Card', 'Cheque', 'Mobile EasyPaisa/JazzCash'];

export default function App() {
  // --- State ---
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('pak_ledger_transactions');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'reports'>('dashboard');
  
  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | TransactionType>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<'month' | 'year' | 'all'>('month');

  // Persistence
  useEffect(() => {
    localStorage.setItem('pak_ledger_transactions', JSON.stringify(transactions));
  }, [transactions]);

  // --- Derived Data ---
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(search.toLowerCase()) || 
                           t.category.toLowerCase().includes(search.toLowerCase()) ||
                           (t.customerOrVendor || '').toLowerCase().includes(search.toLowerCase());
      const matchesReference = (t.reference || '').toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'ALL' || t.type === typeFilter;
      const matchesCategory = categoryFilter === 'ALL' || t.category === categoryFilter;
      const matchesPayment = paymentFilter === 'ALL' || t.paymentMethod === paymentFilter;
      
      let matchesDate = true;
      const tDate = new Date(t.date);
      if (dateRange === 'month') {
        matchesDate = isWithinInterval(tDate, { start: startOfMonth(new Date()), end: endOfMonth(new Date()) });
      } else if (dateRange === 'year') {
        matchesDate = isWithinInterval(tDate, { start: startOfYear(new Date()), end: endOfYear(new Date()) });
      }
      
      return (matchesSearch || matchesReference) && matchesType && matchesCategory && matchesPayment && matchesDate;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, search, typeFilter, categoryFilter, paymentFilter, dateRange]);

  const summary = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => {
      if (t.type === 'SALE') acc.totalSales += t.amount;
      else acc.totalExpenses += t.amount;
      acc.balance = acc.totalSales - acc.totalExpenses;
      return acc;
    }, { totalSales: 0, totalExpenses: 0, balance: 0 });
  }, [filteredTransactions]);

  const chartData = useMemo(() => {
    // Group monthly for the last 6 months
    const last6Months = Array.from({ length: 6 }).map((_, i) => {
      const d = subMonths(new Date(), 5 - i);
      return {
        name: format(d, 'MMM'),
        sales: 0,
        expenses: 0,
        timestamp: startOfMonth(d).getTime()
      };
    });

    transactions.forEach(t => {
      const tDate = new Date(t.date);
      const monthStart = startOfMonth(tDate).getTime();
      const bucket = last6Months.find(m => m.timestamp === monthStart);
      if (bucket) {
        if (t.type === 'SALE') bucket.sales += t.amount;
        else bucket.expenses += t.amount;
      }
    });

    return last6Months;
  }, [transactions]);

  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    filteredTransactions.forEach(t => {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [filteredTransactions]);

  // --- Actions ---
  const handleAddOrEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const amountVal = parseFloat(formData.get('amount') as string);
    const data = {
      type: (editingTransaction?.type || 'SALE') as TransactionType,
      category: formData.get('category') as string,
      amount: isNaN(amountVal) ? 0 : amountVal,
      date: formData.get('date') as string,
      description: formData.get('description') as string,
      customerOrVendor: formData.get('customerOrVendor') as string,
      paymentMethod: formData.get('paymentMethod') as string,
      reference: formData.get('reference') as string,
    };

    if (editingTransaction && editingTransaction.id) {
      setTransactions(prev => prev.map(t => t.id === editingTransaction.id ? { ...t, ...data } : t));
    } else {
      const newTransaction: Transaction = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: new Date().toISOString()
      };
      setTransactions(prev => [newTransaction, ...prev]);
    }
    
    closeModal();
  };

  const deleteTransaction = (id: string) => {
    if (confirm('Are you sure you want to delete this record?')) {
      setTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  const openModal = (transaction?: Transaction) => {
    if (transaction) setEditingTransaction(transaction);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTransaction(null);
  };

  const exportPDF = () => {
    const doc = new jsPDF() as any;
    doc.text('PakLedger - Transaction Report', 14, 15);
    doc.autoTable({
      head: [['Date', 'Type', 'Category', 'Description', 'Ref #', 'Client/Vendor', 'Amount (PKR)']],
      body: filteredTransactions.map(t => [
        formatDate(t.date),
        t.type,
        t.category,
        t.description,
        t.reference || '-',
        t.customerOrVendor || '-',
        t.amount.toFixed(2)
      ]),
      startY: 20,
    });
    doc.save(`pak_ledger_report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  const exportCSV = () => {
    const headers = ['Date,Type,Category,Description,Reference/Ref,Amount,Customer/Vendor,Payment Method'];
    const rows = filteredTransactions.map(t => 
      `${t.date},${t.type},${t.category},"${t.description}","${t.reference || ''}",${t.amount},"${t.customerOrVendor || ''}",${t.paymentMethod}`
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pak_ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  // --- Render Helpers ---
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Sidebar / Navigation */}
      <nav className="fixed top-0 left-0 h-full w-60 bg-slate-950 border-r border-slate-800 hidden lg:flex flex-col z-10">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="text-blue-500 font-extrabold text-2xl tracking-tighter">
              LedgerFlow
            </div>
          </div>

          <div className="space-y-1">
            <NavBtn active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<LayoutDashboard size={20} />} label="Dashboard" />
            <NavBtn active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')} icon={<History size={20} />} label="Ledger Book" />
            <NavBtn active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} icon={<FileText size={20} />} label="Reports" />
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-slate-100">
           <div className="bg-slate-50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Support</p>
              <p className="text-sm text-slate-600">Need help with your records?</p>
              <button className="mt-3 w-full py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors">
                Contact Help
              </button>
           </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="lg:pl-64 min-h-screen">
        {/* Header */}
        <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 lg:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 z-20">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 capitalize">{activeTab}</h2>
            <p className="text-slate-500 text-sm">Managing your business finances effortlessly.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button 
              onClick={exportPDF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              <Printer size={16} />
              Print Ledger
            </button>
            <button 
              onClick={() => openModal()}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm active:scale-95"
            >
              <Plus size={18} />
              New Entry
            </button>
          </div>
        </header>

        <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
          
          {activeTab === 'dashboard' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <SummaryCard 
                  title="Total Sales" 
                  amount={summary.totalSales} 
                />
                <SummaryCard 
                  title="Total Expenses" 
                  amount={summary.totalExpenses} 
                />
                <SummaryCard 
                  title="Net Balance" 
                  amount={summary.balance} 
                />
                <SummaryCard 
                  title="Avg Transaction" 
                  amount={summary.totalSales / (transactions.length || 1)} 
                />
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                      <BarChart3 size={20} className="text-emerald-500" />
                      Monthly Growth
                    </h3>
                  </div>
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area type="monotone" dataKey="sales" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                        <Area type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={3} fill="none" dashArray="5 5" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6">
                      <PieChartIcon size={20} className="text-blue-500" />
                      Category Distribution
                    </h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {categoryData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                </div>
              </div>

              {/* Recent Activity Mini-table */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-bold text-slate-800">Recent Transactions</h3>
                  <button onClick={() => setActiveTab('transactions')} className="text-emerald-600 text-sm font-semibold hover:underline">View All</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Transaction</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.slice(0, 5).map(t => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center",
                                t.type === 'SALE' ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                              )}>
                                {t.type === 'SALE' ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-800">{t.description}</p>
                                <p className="text-xs text-slate-500">{t.category} • {formatDate(t.date)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "font-mono font-bold text-sm",
                              t.type === 'SALE' ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {t.type === 'SALE' ? '+' : '-'}{formatCurrency(t.amount)}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                               Completed
                             </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'transactions' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {/* Filter Bar */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search by description, category, client..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    <FilterBtn active={typeFilter === 'ALL'} onClick={() => setTypeFilter('ALL')} label="All" />
                    <FilterBtn active={typeFilter === 'SALE'} onClick={() => setTypeFilter('SALE')} label="Sales" />
                    <FilterBtn active={typeFilter === 'EXPENSE'} onClick={() => setTypeFilter('EXPENSE')} label="Expenses" />
                  </div>

                  <select 
                    className="bg-white border border-slate-200 py-2.5 px-4 rounded-xl text-sm font-medium outline-none"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="ALL">All Categories</option>
                    {[...CATEGORIES.SALE, ...CATEGORIES.EXPENSE].map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  <select 
                    className="bg-white border border-slate-200 py-2.5 px-4 rounded-xl text-sm font-medium outline-none"
                    value={paymentFilter}
                    onChange={(e) => setPaymentFilter(e.target.value)}
                  >
                    <option value="ALL">All Payments</option>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>

                  <select 
                    className="bg-white border border-slate-200 py-2.5 px-4 rounded-xl text-sm font-medium outline-none"
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value as any)}
                  >
                    <option value="month">Current Month</option>
                    <option value="year">Current Year</option>
                    <option value="all">All Time</option>
                  </select>

                  <div className="flex gap-2">
                    <button onClick={exportPDF} title="Print PDF" className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600">
                      <Printer size={20} />
                    </button>
                    <button onClick={exportCSV} title="Download CSV" className="p-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600">
                      <Download size={20} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Date</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Details</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Category</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Client/Vendor</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Amount</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTransactions.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium text-slate-600">{formatDate(t.date)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">{t.description}</span>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className={cn(
                                  "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider",
                                  t.type === 'SALE' ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                )}>
                                  {t.type}
                                </span>
                                {t.reference && (
                                  <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold border border-blue-100 uppercase">
                                    Ref: {t.reference}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 font-medium italic">{t.paymentMethod}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">{t.category}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-600">{t.customerOrVendor || '-'}</span>
                          </td>
                          <td className="px-6 py-4">
                             <span className={cn(
                               "font-mono font-bold",
                               t.type === 'SALE' ? "text-emerald-600" : "text-rose-600"
                             )}>
                               {t.type === 'SALE' ? '+' : '-'}{formatCurrency(t.amount)}
                             </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openModal(t)} className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-100">
                                <Edit2 size={16} />
                              </button>
                              <button onClick={() => deleteTransaction(t.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredTransactions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-20 text-center">
                            <div className="flex flex-col items-center gap-4">
                              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                                <Search size={32} />
                              </div>
                              <div>
                                <p className="font-bold text-slate-800">No transactions found</p>
                                <p className="text-slate-500 text-sm">Try adjusting your filters or search terms.</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {/* High level stats for report */}
                 <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Top Category</p>
                    <p className="text-2xl font-bold text-slate-900">{categoryData.sort((a, b) => b.value - a.value)[0]?.name || 'N/A'}</p>
                 </div>
                 <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Average Sale</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      <span className="text-slate-400 font-normal text-sm mr-1">PKR</span>
                      {(summary.totalSales / (transactions.filter(t => t.type === 'SALE').length || 1)).toLocaleString('en-PK', { maximumFractionDigits: 0 })}
                    </p>
                 </div>
                 <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Expense Ratio</p>
                    <p className="text-2xl font-bold text-rose-600">
                      {((summary.totalExpenses / (summary.totalSales || 1)) * 100).toFixed(1)}%
                    </p>
                 </div>
               </div>

               <div className="bg-white p-8 rounded-3xl border border-slate-200">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold">Financial Performance Analysis</h3>
                    <div className="flex gap-2">
                       <button onClick={exportPDF} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold text-slate-700 transition-colors">
                         <Printer size={16} />
                         PDF Report
                       </button>
                       <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-semibold text-slate-700 transition-colors">
                         <Download size={16} />
                         CSV Export
                       </button>
                    </div>
                  </div>
                  <div className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: '#F1F5F9'}} />
                        <Legend />
                        <Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} name="Sales" />
                        <Bar dataKey="expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Expenses" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
               </div>
            </motion.div>
          )}

        </div>
      </main>

      {/* Modal Overlay */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <h3 className="text-xl font-bold text-slate-800">{editingTransaction ? 'Edit Record' : 'New Transaction'}</h3>
                <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleAddOrEdit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Type</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button 
                        type="button"
                        onClick={() => setEditingTransaction(prev => prev ? { ...prev, type: 'SALE' } : { id: '', type: 'SALE', date: '', category: '', description: '', amount: 0, paymentMethod: '', createdAt: '' } as any)}
                        className={cn(
                          "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                          (editingTransaction?.type || 'SALE') === 'SALE' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
                        )}
                      >
                        Sale
                      </button>
                      <button 
                         type="button"
                         onClick={() => setEditingTransaction(prev => prev ? { ...prev, type: 'EXPENSE' } : { id: '', type: 'EXPENSE', date: '', category: '', description: '', amount: 0, paymentMethod: '', createdAt: '' } as any)}
                         className={cn(
                          "flex-1 py-2 text-sm font-bold rounded-lg transition-all",
                          (editingTransaction?.type || 'SALE') === 'EXPENSE' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"
                        )}
                      >
                        Expense
                      </button>
                      <input type="hidden" name="type" value={editingTransaction?.type || 'SALE'} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        required 
                        name="date" 
                        type="date" 
                        defaultValue={editingTransaction?.date || new Date().toISOString().split('T')[0]}
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" 
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Category</label>
                  <select 
                    required 
                    name="category" 
                    defaultValue={editingTransaction?.category || ''}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none appearance-none"
                  >
                    <option value="" disabled>Select a category</option>
                    {CATEGORIES[(editingTransaction?.type || 'SALE')].map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Amount (PKR)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Rs.</span>
                    <input 
                      required 
                      name="amount" 
                      type="number" 
                      step="0.01"
                      placeholder="0.00"
                      defaultValue={editingTransaction?.amount}
                      className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono font-bold text-lg" 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Description</label>
                  <textarea 
                    required 
                    name="description" 
                    placeholder="Briefly describe the transaction..."
                    defaultValue={editingTransaction?.description}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Client / Vendor</label>
                    <input 
                      name="customerOrVendor" 
                      type="text" 
                      placeholder="Name of person/business"
                      defaultValue={editingTransaction?.customerOrVendor}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Payment Method</label>
                    <select 
                      name="paymentMethod" 
                      defaultValue={editingTransaction?.paymentMethod || 'Cash'}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    >
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Reference / Invoice # (Optional)</label>
                  <input 
                    name="reference" 
                    type="text" 
                    placeholder="e.g. INV-001"
                    defaultValue={editingTransaction?.reference}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" 
                  />
                </div>

                <div className="pt-4 flex gap-3 sticky bottom-0 bg-white">
                  <button 
                    type="button" 
                    onClick={closeModal}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl font-bold text-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 rounded-xl font-bold text-white shadow-lg shadow-emerald-100 transition-all active:scale-[0.98]"
                  >
                    {editingTransaction ? 'Update Record' : 'Save Transaction'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function NavBtn({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all group border-l-4",
        active 
          ? "bg-slate-900 text-white border-blue-500" 
          : "text-slate-400 hover:bg-slate-900/50 hover:text-white border-transparent"
      )}
    >
      <span className={cn("transition-colors", active ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300")}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function SummaryCard({ title, amount, trend }: { title: string, amount: number, trend?: string }) {
  const isBalance = title.toLowerCase().includes('balance');
  const isExpense = title.toLowerCase().includes('expense');

  return (
    <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
      <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">{title}</p>
      <h3 className={cn(
        "text-2xl font-bold tracking-tight",
        isBalance ? "text-emerald-600" : isExpense ? "text-rose-600" : "text-slate-900"
      )}>
        <span className="text-slate-400 font-normal text-sm mr-1">PKR</span>
        {amount.toLocaleString('en-PK', { minimumFractionDigits: 0 })}
      </h3>
      {trend && (
        <p className="mt-1 text-[10px] font-semibold text-slate-400 uppercase tracking-tighter">
          {trend}
        </p>
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "px-4 py-1.5 text-sm font-bold rounded-lg transition-all",
        active ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
      )}
    >
      {label}
    </button>
  );
}

