import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Printer, Calendar, FileText, Building2 } from 'lucide-react';
import { Customer, Order, Product, OrderStatus } from '../types';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar 
} from 'recharts';
import { formatTimeDisplay } from '../utils';
import { ReportHeroSection } from './reports/ReportHeroSection';
import { ReportAggregatedTable } from './reports/ReportAggregatedTable';

const COLORS = ['#5b7a8c', '#a8b8c2', '#d9e0e5', '#899da9', '#cbd5db', '#718c9e'];

interface CustomerReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  customers: Customer[];
  orders: Order[];
  products: Product[];
}

export const CustomerReportModal: React.FC<CustomerReportModalProps> = ({
  isOpen, onClose, customerName, customers, orders, products
}) => {
  const [reportType, setReportType] = useState<'month' | 'year'>('month');
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [reportYear, setReportYear] = useState(() => {
    return new Date().getFullYear().toString();
  });

  const [activeTab, setActiveTab] = useState<'invoice' | 'analytics'>('invoice');

  const [activeDate, setActiveDate] = useState<string>('');
  const dateDOMRefs = useRef(new Map<string, HTMLDivElement>());
  const isScrollingRef = useRef(false);

  const customer = customers.find(c => c.name === customerName);

  const reportOrders = useMemo(() => {
    return orders.filter(o => 
      o.pendingAction !== 'delete' &&
      o.customerName === customerName && 
      (reportType === 'month' 
        ? o.deliveryDate.startsWith(reportMonth) 
        : o.deliveryDate.startsWith(reportYear)) &&
      o.status !== 'CANCELLED' && o.status !== OrderStatus.CANCELLED
    ).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
  }, [orders, customerName, reportMonth, reportYear, reportType]);

  const ordersByDate = useMemo(() => {
    const map: Record<string, Order[]> = {};
    reportOrders.forEach(o => {
      const d = o.deliveryDate;
      if(!map[d]) map[d] = [];
      map[d].push(o);
    });
    return map;
  }, [reportOrders]);

  const daysInReport = useMemo(() => {
    if (reportType === 'month') {
      const [yearStr, monthStr] = reportMonth.split('-');
      const days = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
      const shortDays = ['日', '一', '二', '三', '四', '五', '六'];
      return Array.from({ length: days }, (_, i) => {
        const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, i + 1);
        const dateString = `${yearStr}-${monthStr}-${String(i + 1).padStart(2, '0')}`;
        return {
          dateString,
          dayNum: i + 1,
          weekDay: shortDays[date.getDay()],
          month: parseInt(monthStr)
        };
      });
    } else {
      const shortDays = ['日', '一', '二', '三', '四', '五', '六'];
      return Object.keys(ordersByDate).sort().map(dateString => {
        const date = new Date(dateString);
        return {
          dateString,
          dayNum: date.getDate(),
          weekDay: shortDays[date.getDay()],
          month: date.getMonth() + 1
        };
      });
    }
  }, [reportType, reportMonth, ordersByDate]);

  const scrollToDate = (dateStr: string) => {
    setActiveDate(dateStr);
    isScrollingRef.current = true;
    
    const element = dateDOMRefs.current.get(dateStr);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const btn = document.getElementById(`cal-btn-${dateStr}`);
    if (btn) {
        btn.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
    }

    setTimeout(() => {
      isScrollingRef.current = false;
    }, 800); 
  };

  useEffect(() => {
    if (activeTab !== 'invoice' || Object.keys(ordersByDate).length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isScrollingRef.current) {
            const dateStr = entry.target.id.replace('date-', '');
            setActiveDate(dateStr);
            
            const btn = document.getElementById(`cal-btn-${dateStr}`);
            if (btn) {
               btn.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
            }
          }
        });
      },
      { 
        root: null,
        rootMargin: '-20% 0px -70% 0px', 
        threshold: 0 
      }
    );

    dateDOMRefs.current.forEach((el) => {
        if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [reportOrders, activeTab, ordersByDate]);

  const aggregatedItems = useMemo(() => {
    const itemMap = new Map<string, any>();

    reportOrders.forEach(order => {
      order.items.forEach(item => {
        const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
        const productName = item.productName || p?.name || item.productId || '未知商品';
        
        const priceItem = customer?.priceList?.find(pl => pl.productId === (p?.id || item.productId));
        const unitPrice = priceItem ? priceItem.price : (p?.price || 0);
        
        const itemTotal = item.unit === '元' ? item.quantity : Math.round(item.quantity * unitPrice);

        const key = p?.id || item.productId;

        if (itemMap.has(key)) {
          const existing = itemMap.get(key)!;
          existing.totalQuantity += item.quantity;
          existing.totalAmount += itemTotal;
        } else {
          itemMap.set(key, {
            productId: key,
            productName,
            totalQuantity: item.quantity,
            unit: item.unit || p?.unit || '斤',
            unitPrice: unitPrice,
            totalAmount: itemTotal
          });
        }
      });
    });

    return Array.from(itemMap.values());
  }, [reportOrders, products, customer]);

  const kpis = useMemo(() => {
    let totalSpend = 0;
    let totalVolume = 0;

    const itemsSummary: Record<string, { quantity: number, spend: number }> = {};
    const tripSummary: Record<string, number> = {};
    const dailySpend: Record<string, number> = {};
    const monthlySpend: Record<string, number> = {};

    reportOrders.forEach(order => {
      let orderTotal = 0;
      let orderVolume = 0;

      order.items.forEach(item => {
        const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
        const priceItem = customer?.priceList?.find(pl => pl.productId === (p?.id || item.productId));
        const unitPrice = item.unitPrice !== undefined ? item.unitPrice : (priceItem ? priceItem.price : (p?.price || 0));
        
        const subtotal = item.subtotal !== undefined ? item.subtotal : (item.unit === '元' ? item.quantity : Math.round(item.quantity * unitPrice));
        orderTotal += subtotal;
        
        if (item.unit !== '元') {
          orderVolume += item.quantity;
          totalVolume += item.quantity;
        }

        const itemName = item.productName || p?.name || item.productId;
        if (!itemsSummary[itemName]) {
          itemsSummary[itemName] = { quantity: 0, spend: 0 };
        }
        if (item.unit !== '元') {
          itemsSummary[itemName].quantity += item.quantity;
        }
        itemsSummary[itemName].spend += subtotal;
      });

      totalSpend += orderTotal;

      const trip = order.trip || customer?.defaultTrip || '未分配';
      tripSummary[trip] = (tripSummary[trip] || 0) + orderVolume;

      const dateStr = order.deliveryDate.substring(8, 10); // DD
      dailySpend[dateStr] = (dailySpend[dateStr] || 0) + orderTotal;

      const monthStr = order.deliveryDate.substring(5, 7); // MM
      monthlySpend[monthStr] = (monthlySpend[monthStr] || 0) + orderTotal;
    });

    const avgOrderValue = reportOrders.length > 0 ? Math.round(totalSpend / reportOrders.length) : 0;

    // Format data for charts
    const donutData = Object.entries(itemsSummary)
      .map(([name, data]) => ({ name, value: data.spend }))
      .sort((a, b) => b.value - a.value);
    
    // Top 4 and 'Other'
    let finalDonutData = donutData;
    if (donutData.length > 5) {
      const top4 = donutData.slice(0, 4);
      const otherValue = donutData.slice(4).reduce((sum, item) => sum + item.value, 0);
      finalDonutData = [...top4, { name: '其他', value: otherValue }];
    }

    const tripData = Object.entries(tripSummary).map(([name, value]) => ({ name, value }));

    // Generate full month/year data to ensure smooth area chart interpolation
    const trendData = [];
    if (reportType === 'month') {
      const [yearStr, monthStr] = reportMonth.split('-');
      const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
          const dd = String(i).padStart(2, '0');
          trendData.push({
              date: dd,
              amount: dailySpend[dd] || 0
          });
      }
    } else {
      for (let i = 1; i <= 12; i++) {
          const mm = String(i).padStart(2, '0');
          trendData.push({
              date: mm,
              amount: monthlySpend[mm] || 0
          });
      }
    }

    return { 
      totalSpend, 
      totalOrders: reportOrders.length, 
      totalVolume, 
      avgOrderValue,
      donutData: finalDonutData,
      tripData,
      trendData
    };
  }, [reportOrders, products, customer, reportMonth, reportType]);

  const [printWarning, setPrintWarning] = useState(false);
  const [printOptions, setPrintOptions] = useState({
    showUnitPrice: true,
    showTotalPrice: true,
    showDeliveryTrip: true,
    showNotes: true
  });

  const handlePrint = () => {
    if (reportOrders.length === 0) {
      alert('目前沒有對帳單資料可供列印');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('彈跳視窗被封鎖，無法開啟列印頁面');
      return;
    }

    const reportTitle = `${customerName} - ${reportType === 'month' ? reportMonth.replace('-', '年') + '月' : `${reportYear}年度`} 對帳單`;

    // 匯總表 HTML
    let tableHtml = `
      <table class="summary-table">
        <thead>
          <tr>
            <th width="${(printOptions.showUnitPrice && printOptions.showTotalPrice) ? '30%' : (printOptions.showTotalPrice ? '50%' : printOptions.showUnitPrice ? '60%' : '80%')}">品項</th>
            ${printOptions.showUnitPrice ? `<th width="20%" class="text-right">單價</th>` : ''}
            <th width="20%" class="text-right">總數</th>
            ${printOptions.showTotalPrice ? `<th width="30%" class="text-right">總金額</th>` : ''}
          </tr>
        </thead>
        <tbody>
    `;

    aggregatedItems.sort((a, b) => b.totalAmount - a.totalAmount).forEach(item => {
      tableHtml += `
        <tr>
          <td><strong>${item.productName}</strong></td>
          ${printOptions.showUnitPrice ? `<td class="text-right text-gray">${item.unitPrice ? '$' + item.unitPrice : '-'}</td>` : ''}
          <td class="text-right"><strong>${item.totalQuantity}</strong> ${item.unit}</td>
          ${printOptions.showTotalPrice ? `<td class="text-right"><strong>$${item.totalAmount.toLocaleString()}</strong></td>` : ''}
        </tr>
      `;
    });

    tableHtml += `
        </tbody>
        ${printOptions.showTotalPrice ? `
        <tfoot>
          <tr>
            <td colspan="${printOptions.showUnitPrice ? '3' : '2'}" class="text-right" style="font-size: 20px; font-weight: bold;">總計金額</td>
            <td class="text-right" style="font-size: 24px; font-weight: bold;">$${kpis.totalSpend.toLocaleString()}</td>
          </tr>
        </tfoot>
        ` : ''}
      </table>
    `;

    // 每日明細 HTML
    let detailsHtml = `
      <h2 style="font-size: 24px; margin-top: 40px; border-bottom: 2px solid #ddd; padding-bottom: 10px;">每日出貨明細</h2>
      <table class="details-table">
        <thead>
          <tr>
            <th width="20%">日期</th>
            <th width="${(printOptions.showDeliveryTrip && printOptions.showTotalPrice) ? '50%' : (printOptions.showTotalPrice ? '65%' : printOptions.showDeliveryTrip ? '65%' : '80%')}">品項明細</th>
            ${printOptions.showDeliveryTrip ? `<th width="15%">配送</th>` : ''}
            ${printOptions.showTotalPrice ? `<th width="15%" class="text-right">小計</th>` : ''}
          </tr>
        </thead>
        <tbody>
    `;

    reportOrders.forEach(order => {
      const orderTotal = order.items.reduce((sum, item) => {
        const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
        const priceItem = customer?.priceList?.find(pl => pl.productId === (p?.id || item.productId));
        const unitPrice = priceItem ? priceItem.price : (p?.price || 0);
        return sum + (item.unit === '元' ? item.quantity : Math.round(item.quantity * unitPrice));
      }, 0);

      const itemsHtml = order.items.map(item => {
        const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
        return `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: bold;">${item.productName || p?.name || '未知品項'}</span>
            <span>
              <span style="display: inline-block; width: 80px; text-align: right;">${item.quantity} ${item.unit || p?.unit || '斤'}</span>
            </span>
          </div>
        `;
      }).join('');

      detailsHtml += `
        <tr>
          <td style="vertical-align: top; font-weight: bold; font-size: 18px;">${order.deliveryDate.substring(5).replace('-', '/')}</td>
          <td style="vertical-align: top;">
            ${itemsHtml}
            ${(printOptions.showNotes && order.note) ? `<div style="font-size: 14px; color: #666; margin-top: 4px; font-style: italic;">外站備註: ${order.note}</div>` : ''}
          </td>
          ${printOptions.showDeliveryTrip ? `<td style="vertical-align: top;">${order.trip || customer?.defaultTrip || '未分配'}</td>` : ''}
          ${printOptions.showTotalPrice ? `<td style="vertical-align: top;" class="text-right font-bold text-lg">$${orderTotal.toLocaleString()}</td>` : ''}
        </tr>
      `;
    });

    detailsHtml += `
        </tbody>
      </table>
    `;

    const htmlContent = `<!DOCTYPE html>
    <html>
      <head>
        <title>${reportTitle}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #222; }
          h1 { text-align: center; margin-bottom: 5px; font-size: 32px; }
          p.date { text-align: center; color: #666; margin-bottom: 30px; font-size: 20px; font-weight: bold; }
          .summary-table, .details-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 18px; }
          .summary-table th, .summary-table td, .details-table th, .details-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
          .summary-table th, .details-table th { background-color: #f5f5f5; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 20px; border-bottom: 3px solid #ccc; }
          .summary-table tr:nth-child(even), .details-table tr:nth-child(even) { background-color: #fafafa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
          .text-gray { color: #666; }
          .text-lg { font-size: 20px; }
          .footer { margin-top: 40px; text-align: center; font-size: 14px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
          
          @page { margin: 15mm; }
          
          /* 僅在螢幕上顯示，列印時隱藏 */
          @media screen {
            .close-btn {
              position: fixed; top: 20px; right: 20px; background-color: #1e293b; color: white; border: none; padding: 15px 30px; font-size: 18px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); cursor: pointer; font-weight: bold;
            }
          }
          @media print {
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <button class="no-print close-btn" onclick="window.close(); if(!window.closed){window.history.back();}">
          返回 / 關閉
        </button>
        
        <h1>${reportTitle}</h1>
        <p class="date">共 ${reportOrders.length} 筆訂單，總計出貨 ${kpis.totalVolume.toLocaleString()} 單位</p>
        
        ${tableHtml}
        
        ${detailsHtml}
        
        <div class="footer">列印時間: ${new Date().toLocaleString()}</div>
        <script>window.onload = function() { setTimeout(function() { window.print(); }, 500); };</script>
      </body>
    </html>`;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-slate-50 overflow-y-auto print:bg-white modal-container"
      >
        {/* Sticky Header (Hidden in Print) */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm px-4 py-3 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
             <button onClick={onClose} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-100"><X className="w-5 h-5" /></button>
             <h2 className="text-lg font-extrabold text-slate-800 tracking-tight">對帳單預覽</h2>
          </div>
          <div className="flex items-center gap-2">
             <div className="flex bg-slate-100 p-1 rounded-xl">
               <button 
                 onClick={() => setReportType('month')}
                 className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-colors ${reportType === 'month' ? 'bg-white text-morandi-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 月報
               </button>
               <button 
                 onClick={() => setReportType('year')}
                 className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-colors ${reportType === 'year' ? 'bg-white text-morandi-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 年報
               </button>
             </div>
             
             {reportType === 'month' ? (
               <div className="relative">
                 <input 
                   type="month" 
                   className="pl-9 pr-3 py-2 bg-morandi-oatmeal/50 rounded-xl text-sm font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all"
                   value={reportMonth}
                   onChange={e => setReportMonth(e.target.value)}
                 />
                 <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
               </div>
             ) : (
               <div className="relative">
                 <select 
                   className="pl-9 pr-3 py-2 bg-morandi-oatmeal/50 rounded-xl text-sm font-bold border border-slate-100 outline-none focus:ring-2 focus:ring-morandi-blue transition-all appearance-none min-w-[100px]"
                   value={reportYear}
                   onChange={e => setReportYear(e.target.value)}
                 >
                   {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(y => (
                     <option key={y} value={y.toString()}>{y}年</option>
                   ))}
                 </select>
                 <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
               </div>
             )}
             <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-morandi-blue text-white rounded-xl text-sm font-bold shadow-md hover:bg-slate-600 transition-colors">
               <Printer className="w-4 h-4" /> 列印 / PDF
             </button>
          </div>
        </div>

        {/* 列印選項設定區 */}
        <div className="flex items-center gap-4 py-3 px-6 bg-gray-50 border-b border-gray-200 print:hidden text-sm justify-center">
          <span className="font-bold text-gray-700">列印顯示內容：</span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input 
              type="checkbox" 
              checked={printOptions.showUnitPrice}
              onChange={(e) => setPrintOptions(prev => ({ ...prev, showUnitPrice: e.target.checked }))}
              className="rounded text-morandi-blue focus:ring-morandi-blue"
            />
            單價
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input 
              type="checkbox" 
              checked={printOptions.showTotalPrice}
              onChange={(e) => setPrintOptions(prev => ({ ...prev, showTotalPrice: e.target.checked }))}
              className="rounded text-morandi-blue focus:ring-morandi-blue"
            />
            總金額
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input 
              type="checkbox" 
              checked={printOptions.showDeliveryTrip}
              onChange={(e) => setPrintOptions(prev => ({ ...prev, showDeliveryTrip: e.target.checked }))}
              className="rounded text-morandi-blue focus:ring-morandi-blue"
            />
            配送趟次
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input 
              type="checkbox" 
              checked={printOptions.showNotes}
              onChange={(e) => setPrintOptions(prev => ({ ...prev, showNotes: e.target.checked }))}
              className="rounded text-morandi-blue focus:ring-morandi-blue"
            />
            備註資訊
          </label>
        </div>

        {/* Warning missing print functionality in iframe */}
        <AnimatePresence>
          {printWarning && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="sticky top-20 z-50 mx-auto max-w-lg mb-4 print:hidden"
            >
              <div className="bg-slate-800 text-white px-5 py-4 rounded-xl shadow-lg flex items-start gap-4">
                <div className="bg-slate-700/50 p-2 rounded-full mt-0.5">
                  <Printer className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h4 className="font-bold text-base mb-1 text-white">預覽模式不支援列印功能</h4>
                  <p className="text-sm text-slate-300 leading-relaxed font-medium">
                    目前平台在預覽區塊中封鎖了列印行為。請點擊畫面右上角的「<span className="text-white font-bold inline-flex items-center gap-1"> 在新分頁開啟</span>」圖示，
                    在新分頁中完整開啟應用程式後，再次點擊本按鈕即可完整預覽與列印 PDF。
                  </p>
                </div>
                <button onClick={() => setPrintWarning(false)} className="ml-auto p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Report Content A4 Style --- */}
        <div className="max-w-4xl mx-auto p-4 sm:p-8 my-4 sm:my-8 bg-white sm:rounded-2xl sm:shadow-xl print:shadow-none print:my-0 print:p-0">
           
           {/* 1. Report Header */}
           <div className="border-b-2 border-slate-800 pb-6 mb-8 flex justify-between items-end">
             <div>
                <div className="flex items-center gap-2 text-morandi-blue mb-2">
                  <Building2 className="w-6 h-6" />
                  <span className="font-black text-xl tracking-tight">製麵工廠 (示例)</span>
                </div>
                <h1 className="text-3xl font-black text-slate-800 tracking-tight">B2B 客戶對帳單</h1>
             </div>
             <div className="text-right">
                <p className="text-sm font-bold text-slate-500 mb-1">對帳期間：{reportType === 'month' ? reportMonth.replace('-', '年') + '月' : `${reportYear}年度`}</p>
                <p className="text-xl font-extrabold text-slate-800">{customerName}</p>
                {customer?.address && <p className="text-xs text-slate-400 mt-1">{customer.address}</p>}
             </div>
           </div>

           {/* 2. Executive KPIs (Replaced by Hero Section) */}
           <ReportHeroSection 
             totalAmount={kpis.totalSpend} 
             totalTrips={kpis.totalOrders}
             totalQuantity={kpis.totalVolume}
             billingMonth={reportType === 'month' ? reportMonth.replace('-', '年') + '月' : `${reportYear}年度`}
             isSettled={reportOrders.length > 0 && reportOrders.every(o => o.status === OrderStatus.PAID)}
           />

           {/* Empty State Guard */}
           {reportOrders.length === 0 ? (
             <div className="py-20 text-center border-2 border-dashed border-gray-200 rounded-3xl">
               <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                 <FileText className="w-8 h-8 text-gray-300" />
               </div>
               <h3 className="text-lg font-bold text-slate-600 mb-1">此區間尚無採購紀錄</h3>
               <p className="text-sm text-slate-400">當前選擇月份沒有該客戶的歷史訂單，請嘗試切換月份。</p>
             </div>
           ) : (
             <>
               {/* Segmented Tabs */}
               <div className="flex p-1 mb-6 bg-slate-100/80 rounded-xl max-w-sm mx-auto print:hidden">
                 <button
                   onClick={() => setActiveTab('invoice')}
                   className={`flex-1 py-2 px-4 text-sm font-bold rounded-lg transition-all duration-300 ${
                     activeTab === 'invoice' 
                       ? 'bg-white text-slate-800 shadow-sm' 
                       : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                   }`}
                 >
                   📝 明細對帳
                 </button>
                 <button
                   onClick={() => setActiveTab('analytics')}
                   className={`flex-1 py-2 px-4 text-sm font-bold rounded-lg transition-all duration-300 ${
                     activeTab === 'analytics' 
                       ? 'bg-white text-slate-800 shadow-sm' 
                       : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                   }`}
                 >
                   📊 分析儀表板
                 </button>
               </div>

               {activeTab === 'analytics' && (
                 <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                   {/* 3. Data Visualizations */}
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 print:break-inside-avoid">
                 <div className="md:col-span-2 bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-wide mb-6">採購金額趨勢 ({reportType === 'month' ? '日' : '月'})</h3>
                    <div className="w-full" style={{ height: 250 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={kpis.trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={COLORS[0]} stopOpacity={0.3}/>
                              <stop offset="95%" stopColor={COLORS[0]} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dx={-10} tickFormatter={value => `$${value}`} />
                          <RechartsTooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: number) => [`$${value}`, '金額']}
                            labelFormatter={label => reportType === 'month' ? `${reportMonth}-${label}` : `${reportYear}-${label}月`}
                          />
                          <Area type="monotone" dataKey="amount" stroke={COLORS[0]} strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                 </div>

                 {/* Donut Chart: Top Products */}
                 <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm print:break-inside-avoid">
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-wide mb-6">品項採購佔比 (金額)</h3>
                    <div className="w-full" style={{ height: 250 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={kpis.donutData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            {kpis.donutData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip 
                            formatter={(value: number) => [`$${value.toLocaleString()}`, '金額']}
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          />
                          <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                 </div>

                 {/* Bar Chart: Trips / Delivery Methods */}
                 <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm print:break-inside-avoid">
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-wide mb-6">各趟次出貨量 (斤)</h3>
                    <div className="w-full" style={{ height: 250 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={kpis.tripData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} dy={10} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <RechartsTooltip 
                             contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                             formatter={(value: number) => [value, '出貨量']}
                             cursor={{ fill: '#f8fafc' }}
                          />
                          <Bar dataKey="value" fill={COLORS[1]} radius={[4, 4, 0, 0]} maxBarSize={50} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
               </div>
               )}

               {activeTab === 'invoice' && (
                 <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                   {/* 4. Detailed Data Table */}
                   <div className="print:break-before-page">
                     {/* Print-only header for second page */}
                     <div className="hidden print:block text-lg font-black text-slate-800 mb-6 border-b-2 border-slate-200 pb-2">
                       {customerName} - {reportType === 'month' ? reportMonth.replace('-', '年') + '月' : `${reportYear}年度`} 訂單明細
                     </div>

                     {/* 1. 插入匯總表 */}
                     <ReportAggregatedTable items={aggregatedItems} />

                 {/* 2. 每日出貨流水帳 (瀑布流 + 迷你月曆) */}
                 <div className="mt-8 border-t border-slate-100 pt-8 print:border-none print:mt-8">
                   <h3 className="text-xl font-black text-slate-800 mb-6 print:hidden">每日出貨流水帳</h3>
                   
                   {/* Mini Calendar Header */}
                   <div className="sticky top-[60px] z-30 bg-white/95 backdrop-blur-md border-y border-slate-100 py-3 mb-8 overflow-x-auto snap-x print:hidden -mx-4 sm:-mx-8 px-4 sm:px-8 shadow-sm [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                     <div className="flex gap-2 min-w-max">
                       {daysInReport.map((day) => {
                         const dateStr = day.dateString;
                         const hasOrder = !!ordersByDate[dateStr];
                         const isActive = activeDate === dateStr;

                         return (
                           <button
                             key={dateStr}
                             id={`cal-btn-${dateStr}`}
                             onClick={() => scrollToDate(dateStr)}
                             className={`relative flex flex-col items-center justify-center w-14 h-16 rounded-xl snap-center transition-all ${
                               isActive ? 'text-white' : 'text-slate-600 hover:bg-slate-50'
                             }`}
                           >
                             {isActive && (
                                <motion.div layoutId="activeDate" className="absolute inset-0 bg-slate-800 rounded-xl -z-10" />
                             )}
                             
                             <span className="text-[10px] opacity-80 font-medium">
                               {reportType === 'year' ? `${day.month}/${day.dayNum}` : day.weekDay}
                             </span>
                             <span className="text-lg font-bold">{reportType === 'year' ? day.weekDay : day.dayNum}</span>
                             
                             {hasOrder && (
                                <div className={`absolute bottom-1.5 w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-rose-500'}`} />
                             )}
                           </button>
                         );
                       })}
                     </div>
                   </div>

                   {/* Waterfall List */}
                   <div className="space-y-12 print:space-y-8">
                     {Object.entries(ordersByDate).sort(([a], [b]) => a.localeCompare(b)).map(([dateStr, orders]) => {
                       const dayOrders = orders as any[];
                       const dayTotal = dayOrders.reduce((sum, order) => {
                         return sum + order.items.reduce((itemSum, item) => {
                           const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
                           const priceItem = customer?.priceList?.find(pl => pl.productId === (p?.id || item.productId));
                           const unitPrice = priceItem ? priceItem.price : (p?.price || 0);
                           return itemSum + (item.unit === '元' ? item.quantity : Math.round(item.quantity * unitPrice));
                         }, 0);
                       }, 0);

                       return (
                         <div 
                           key={dateStr}
                           id={`date-${dateStr}`}
                           ref={(el) => { if (el) dateDOMRefs.current.set(dateStr, el); }}
                           className="scroll-mt-[160px] relative" 
                         >
                           {/* Date Header */}
                           <div className="flex items-end justify-between border-b-2 border-slate-800 pb-2 mb-4">
                             <h4 className="text-2xl font-black text-slate-800">{dateStr.replace(/-/g, '/')}</h4>
                             <span className="text-sm font-bold text-slate-500">單日總計：<span className="text-lg text-slate-800 ml-1">${dayTotal.toLocaleString()}</span></span>
                           </div>
                           
                           {/* Orders in this day */}
                           <div className="space-y-4">
                             {dayOrders.map((order: any) => {
                               const orderTotal = order.items.reduce((sum, item) => {
                                 const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
                                 const priceItem = customer?.priceList?.find(pl => pl.productId === (p?.id || item.productId));
                                 const unitPrice = priceItem ? priceItem.price : (p?.price || 0);
                                 return sum + (item.unit === '元' ? item.quantity : Math.round(item.quantity * unitPrice));
                               }, 0);

                               return (
                                 <div key={order.id} className="bg-slate-50 rounded-2xl p-4 sm:p-5 print:bg-transparent print:p-0 print:border-none print:rounded-none">
                                   <div className="flex justify-between items-start mb-3">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-block px-2.5 py-1 bg-white border border-slate-200 text-slate-600 rounded-md text-[11px] font-black print:border-none print:px-0">
                                          {order.trip || customer?.defaultTrip || '未分配'}
                                        </span>
                                        <span className="text-xs text-slate-400 font-medium print:hidden">
                                          {formatTimeDisplay(order.deliveryTime)}
                                        </span>
                                      </div>
                                      <div className="font-black text-slate-800 print:hidden">
                                        ${orderTotal.toLocaleString()}
                                      </div>
                                   </div>
                                   
                                   <div className="space-y-2">
                                     {order.items.map((item, idx) => {
                                       const p = products.find(prod => prod.id === item.productId || prod.name === item.productId);
                                       const priceItem = customer?.priceList?.find(pl => pl.productId === (p?.id || item.productId));
                                       const unitPrice = priceItem ? priceItem.price : (p?.price || 0);
                                       const itemTotal = Math.round(item.quantity * unitPrice);
                                       return (
                                         <div key={idx} className="flex justify-between items-center text-sm">
                                           <span className="font-bold text-slate-700">{item.productName || p?.name || '未知品項'}</span>
                                           <div className="flex gap-6 items-center">
                                             <span className="text-morandi-blue font-bold print:text-slate-800 text-right w-20">
                                               {item.quantity} {item.unit || p?.unit || '斤'}
                                             </span>
                                             {item.unit !== '元' && (
                                               <span className="text-gray-400 font-medium text-right w-16">
                                                 ${itemTotal.toLocaleString()}
                                               </span>
                                             )}
                                           </div>
                                         </div>
                                       );
                                     })}
                                   </div>
                                   
                                   {order.note && (
                                     <div className="mt-3 text-xs text-gray-500 bg-white p-2.5 rounded-lg border border-gray-100 italic print:bg-transparent print:border-none print:p-0 print:mt-1">
                                       備註：{order.note}
                                     </div>
                                   )}
                                 </div>
                               );
                             })}
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 </div>
               </div>
               </div>
               )}
             </>
           )}
           
           <div className="hidden print:block text-center text-[10px] text-gray-400 mt-8 pt-4 border-t border-gray-100">
             - 報表產生時間：{new Date().toLocaleString()} -
           </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
