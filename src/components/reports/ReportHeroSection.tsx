import React from 'react';

interface ReportHeroSectionProps {
  totalAmount: number;
  totalTrips: number;
  totalQuantity: number;
  billingMonth: string; // EX: '2024-05'
  isSettled: boolean;
}

export const ReportHeroSection: React.FC<ReportHeroSectionProps> = ({
  totalAmount,
  totalTrips,
  totalQuantity,
  billingMonth,
  isSettled
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-gradient-to-b from-blue-50/50 to-white rounded-3xl border border-slate-100 mb-6 relative overflow-hidden">
      
      {/* 1. 狀態標籤區 (Status Badges) */}
      <div className="flex items-center gap-2 mb-4">
        {isSettled ? (
           <span className="px-3 py-1 text-xs font-black text-emerald-600 bg-emerald-100 rounded-full tracking-wide">
             已結清
           </span>
        ) : (
           <span className="px-3 py-1 text-xs font-black text-rose-600 bg-rose-100 rounded-full tracking-wide shadow-sm">
             未結清
           </span>
        )}
        <span className="px-3 py-1 text-xs font-bold text-slate-500 bg-slate-100 rounded-full">
          請款期間：{billingMonth}
        </span>
      </div>
      
      {/* 2. 絕對視覺焦點 (Hero Number) */}
      <p className="text-sm font-bold text-slate-400 mb-1">總花費</p>
      <div className="text-6xl font-black text-slate-800 tracking-tighter">
        <span className="text-3xl text-slate-400 mr-1">$</span>
        {totalAmount.toLocaleString()}
      </div>
      
      {/* 3. 次要資訊 (Secondary Meta Data) - 收斂處理 */}
      <div className="flex items-center gap-8 mt-8 pt-6 border-t border-slate-100/80 w-full justify-center">
        <div className="text-center">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">總出貨量</p>
          <p className="text-xl font-extrabold text-slate-600">{totalQuantity.toLocaleString()} <span className="text-sm font-medium text-slate-400">斤</span></p>
        </div>
        
        {/* 分隔線 */}
        <div className="w-px h-8 bg-slate-200"></div>
        
        <div className="text-center">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">出貨總計</p>
          <p className="text-xl font-extrabold text-slate-600">{totalTrips} <span className="text-sm font-medium text-slate-400">次</span></p>
        </div>
      </div>

    </div>
  );
};
