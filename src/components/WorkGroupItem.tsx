import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, CheckSquare } from 'lucide-react';
import { triggerHaptic } from './animations';

interface WorkGroupItemProps {
    group: any;
    isCollapsed: boolean;
    onToggleCollapse: (id: string) => void;
    completedWorkItems: Set<string>;
    onToggleComplete: (itemKey: string) => void;
    itemVariants: any;
}

const WorkGroupItemComponent: React.FC<WorkGroupItemProps> = ({
    group,
    isCollapsed,
    onToggleCollapse,
    completedWorkItems,
    onToggleComplete,
    itemVariants
}) => {
    return (
        <motion.section variants={itemVariants} className="bg-white rounded-[24px] overflow-hidden border border-slate-200 shadow-sm">
            {/* Group Header */}
            <div 
                onClick={() => onToggleCollapse(group.id)}
                className="px-5 py-4 flex justify-between items-center cursor-pointer transition-colors hover:bg-opacity-80 active:scale-[0.99]"
                style={{ backgroundColor: group.color + '40' }} // 25% opacity
            >
                <h3 className="font-extrabold text-slate-800 flex items-center gap-3 text-lg">
                    <span className="w-3 h-3 rounded-full shadow-sm" style={{ background: group.color, border: '1px solid rgba(0,0,0,0.1)' }}></span>
                    {group.label}
                </h3>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-slate-600 bg-white/60 px-2 py-1 rounded-lg">共 {Math.round(group.totalWeight * 10) / 10} 單位</span>
                    {isCollapsed ? <ChevronDown className="w-5 h-5 text-slate-500" /> : <ChevronUp className="w-5 h-5 text-slate-500" />}
                </div>
            </div>

            {/* Items List */}
            <AnimatePresence>
                {!isCollapsed && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }} 
                        animate={{ height: 'auto', opacity: 1 }} 
                        exit={{ height: 0, opacity: 0 }} 
                        className="divide-y divide-gray-100"
                    >
                        {group.items.map((item: any, idx: number) => {
                            const itemKey = `${group.id}-${item.name}-${item.unit}`;
                            const isCompleted = completedWorkItems.has(itemKey);

                            return (
                                <div 
                                    key={idx} 
                                    onClick={() => {
                                        onToggleComplete(itemKey);
                                        triggerHaptic(5);
                                    }}
                                    className={`p-5 transition-all cursor-pointer select-none ${isCompleted ? 'bg-gray-50' : 'hover:bg-gray-50/50'}`}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isCompleted ? 'bg-slate-400 border-slate-400' : 'bg-white border-slate-300'}`}>
                                                {isCompleted && <CheckSquare className="w-3.5 h-3.5 text-white" />}
                                            </div>
                                            <span className={`font-bold text-lg transition-all ${isCompleted ? 'text-gray-400 line-through decoration-2 decoration-gray-300' : 'text-slate-800'}`}>{item.name}</span>
                                        </div>
                                        <div className={`text-right transition-all ${isCompleted ? 'opacity-40' : 'opacity-100'}`}>
                                            <span className="font-black text-3xl text-slate-800 tracking-tight">{item.totalQty}</span>
                                            <span className="text-xs text-gray-400 font-bold ml-1">{item.unit}</span>
                                        </div>
                                    </div>
                                    
                                    {/* Details */}
                                    {!isCompleted && (
                                        <div className="pl-8 flex flex-wrap gap-2 mt-3">
                                            {item.details.map((detail: any, dIdx: number) => (
                                                <span key={dIdx} className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600 shadow-sm flex items-center gap-1">
                                                    <span className="font-bold">{detail.customerName}</span>
                                                    <span className="bg-slate-100 px-1.5 rounded text-[10px] font-black text-slate-500">{detail.qty}</span>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.section>
    );
};

export const WorkGroupItem = React.memo(WorkGroupItemComponent, (prevProps, nextProps) => {
    if (prevProps.group !== nextProps.group) return false;
    if (prevProps.isCollapsed !== nextProps.isCollapsed) return false;
    
    // Check if any item in this group changed completion status
    for (const item of prevProps.group.items) {
        const itemKey = `${prevProps.group.id}-${item.name}-${item.unit}`;
        if (prevProps.completedWorkItems.has(itemKey) !== nextProps.completedWorkItems.has(itemKey)) {
            return false;
        }
    }
    
    return true;
});
