import { useState, useEffect } from 'react';

export type LayoutMode = 'auto' | 'standard' | 'compact';

export const useCompactMode = () => {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    return (localStorage.getItem('nm_layout_mode') as LayoutMode) || 'auto';
  });

  useEffect(() => {
    localStorage.setItem('nm_layout_mode', layoutMode);
    
    let isCompact = false;
    
    if (layoutMode === 'compact') {
      isCompact = true;
    } else if (layoutMode === 'auto') {
      const rootFontSize = parseFloat(window.getComputedStyle(document.documentElement).fontSize);
      if (rootFontSize > 16) {
        isCompact = true;
      }
    }

    let styleTag = document.getElementById('compact-mode-styles');
    
    if (isCompact) {
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'compact-mode-styles';
        document.head.appendChild(styleTag);
      }
      // Force space reduction for large font sizes
      styleTag.innerHTML = `
        .p-4, .p-5, .p-6, .p-8 { padding: 12px !important; }
        .py-4, .py-5, .py-6, .py-8, .py-20 { padding-top: 12px !important; padding-bottom: 12px !important; }
        .px-4, .px-5, .px-6, .px-8 { padding-left: 12px !important; padding-right: 12px !important; }
        .mb-4, .mb-5, .mb-6, .mb-8 { margin-bottom: 12px !important; }
        .mt-4, .mt-5, .mt-6, .mt-8 { margin-top: 12px !important; }
        .my-4, .my-6 { margin-top: 12px !important; margin-bottom: 12px !important; }
        .gap-4, .gap-5, .gap-6, .gap-8 { gap: 8px !important; }
        .pb-10 { padding-bottom: 24px !important; }
        .text-xs { font-size: 0.85rem !important; }
        .w-12, .h-12, .w-16, .h-16 { max-width: 44px !important; max-height: 44px !important; }
      `;
    } else {
      if (styleTag) {
        styleTag.remove();
      }
    }
  }, [layoutMode]);

  return { layoutMode, setLayoutMode };
};
