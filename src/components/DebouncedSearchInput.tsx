import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface DebouncedSearchInputProps {
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export const DebouncedSearchInput: React.FC<DebouncedSearchInputProps> = ({
  value,
  onSearch,
  placeholder = "搜尋...",
  className = "",
  inputClassName = "w-full pl-10 pr-10 py-3 bg-white rounded-[20px] border border-slate-200 shadow-sm text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
}) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (localValue !== value) {
        onSearch(localValue);
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [localValue, onSearch, value]);

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        placeholder={placeholder}
        className={inputClassName}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
      />
      {localValue && (
        <button
          onClick={() => {
            setLocalValue('');
            onSearch('');
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
