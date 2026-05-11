import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { buttonTap } from './animations';

export const LoginScreen: React.FC<{ onLogin: (pwd: string) => Promise<boolean> }> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(false);
    const success = await onLogin(password);
    if (!success) {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-morandi-oatmeal flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-3xl shadow-lg w-full max-w-sm"
      >
        <div className="w-16 h-16 bg-morandi-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-morandi-blue" />
        </div>
        <h1 className="text-2xl font-extrabold text-center text-morandi-charcoal mb-2">麵廠職人</h1>
        <p className="text-center text-morandi-pebble mb-8 text-sm font-medium tracking-widest">系統登入</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              placeholder="請輸入密碼"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              className={`w-full px-4 py-3 rounded-xl border ${error ? 'border-rose-300 bg-rose-50 placeholder-rose-300 text-rose-600' : 'border-slate-200 bg-gray-50 focus:bg-white'} outline-none focus:ring-2 focus:ring-morandi-blue/30 transition-all text-center tracking-[0.5em] text-lg font-bold`}
            />
            {error && <p className="text-rose-500 text-xs text-center mt-2 font-medium">密碼錯誤，請再試一次</p>}
          </div>
          
          <motion.button
            whileTap={buttonTap}
            type="submit"
            disabled={loading || !password}
            className="w-full bg-morandi-blue text-white font-bold py-3.5 rounded-xl shadow-md hover:bg-morandi-blue/90 disabled:opacity-50 transition-all tracking-wider"
          >
            {loading ? '驗證中...' : '登入系統'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};
