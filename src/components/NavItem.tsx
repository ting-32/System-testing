import React from 'react';
import { motion } from 'framer-motion';
import { COLORS } from '../constants';

export const NavItem: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; }> = ({ active, onClick, icon, label }) => (
  <motion.button onClick={onClick} whileTap={{ scale: 0.9 }} className={`group flex flex-col items-center justify-center w-full transition-all duration-300 ${active ? '-translate-y-1' : 'opacity-40 hover:opacity-70'}`}>
    <motion.div className={`w-12 h-12 rounded-[20px] flex items-center justify-center mb-1 transition-all duration-300 ${active ? 'text-white shadow-lg' : 'text-morandi-pebble group-hover:bg-morandi-oatmeal/50'}`} style={{ backgroundColor: active ? COLORS.primary : 'transparent', }} animate={{ scale: active ? 1.1 : 1, backgroundColor: active ? COLORS.primary : 'rgba(0,0,0,0)' }}>
      {icon}
    </motion.div>
    <span className={`text-[10px] font-bold tracking-widest transition-colors ${active ? 'text-morandi-charcoal' : 'text-morandi-pebble'}`}>
      {label}
    </span>
  </motion.button>
);
