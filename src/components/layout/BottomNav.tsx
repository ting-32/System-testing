import React from 'react';
import { ClipboardList, Users, Package, CalendarCheck, Wallet } from 'lucide-react';
import { NavItem } from '../NavItem';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function BottomNav({ activeTab, setActiveTab }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-100 flex justify-around py-3 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
      <NavItem active={activeTab === 'orders'} onClick={() => setActiveTab('orders')} icon={<ClipboardList className="w-6 h-6" />} label="訂單" />
      <NavItem active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} icon={<Users className="w-6 h-6" />} label="客戶" />
      <NavItem active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={<Package className="w-6 h-6" />} label="品項" />
      <NavItem active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} icon={<CalendarCheck className="w-6 h-6" />} label="行程" />
      <NavItem active={activeTab === 'finance'} onClick={() => setActiveTab('finance')} icon={<Wallet className="w-6 h-6" />} label="帳務" />
    </nav>
  );
}
