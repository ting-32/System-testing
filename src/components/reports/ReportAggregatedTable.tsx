import React from 'react';

interface AggregatedItem {
  productName: string;
  totalQuantity: number;
  unit: string;
  unitPrice: number;
  totalAmount: number;
}

interface ReportAggregatedTableProps {
  items: AggregatedItem[];
}

export const ReportAggregatedTable: React.FC<ReportAggregatedTableProps> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <div className="mb-8 print:break-inside-avoid">
      <h3 className="text-sm font-extrabold text-slate-800 tracking-wide mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-morandi-blue rounded-full"></span>
        本期採購品項總結
      </h3>
      
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="py-3 px-4 font-bold text-slate-500 text-sm">品項</th>
              <th className="py-3 px-4 font-bold text-slate-500 text-sm text-right">當月總數</th>
              <th className="py-3 px-4 font-bold text-slate-500 text-sm text-right">單價</th>
              <th className="py-3 px-4 font-bold text-slate-500 text-sm text-right">小計金額</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3 px-4 font-bold text-slate-700">{item.productName}</td>
                <td className="py-3 px-4 text-right text-slate-600 font-bold">
                  {item.totalQuantity.toLocaleString()} <span className="text-xs text-slate-400 font-normal">{item.unit === '元' ? '' : item.unit}</span>
                </td>
                <td className="py-3 px-4 text-right text-slate-500">
                  {item.unit === '元' ? '-' : `$${item.unitPrice}`}
                </td>
                <td className="py-3 px-4 text-right font-black text-slate-800">
                  ${item.totalAmount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
