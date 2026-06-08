const fs = require('fs');

function cleanFile(file, unused) {
  let code = fs.readFileSync(file, 'utf8');

  unused.forEach(i => {
    // Only target imports and hook destructuring at the top level
    const reg = new RegExp('\\b' + i + '\\b\\s*,?\\s*', 'g');
    
    // We only want to remove it inside import { ... } mostly
    // Let's do a safer string replace for imports:
    code = code.replace(/import\s+\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g, (match, p1, p2) => {
       let parts = p1.split(',').map(x => x.trim()).filter(x => x);
       parts = parts.filter(x => x !== i);
       if (parts.length === 0) return '';
       return `import { ${parts.join(', ')} } from '${p2}'`;
    });
  });
  
  // To handle local variable removing:
  const localVars = ['collapsedWorkGroups', 'completedWorkItems', 'filteredCustomers', 'handleNavigateTrip', 'getTripSummary', 'handleToggleWorkGroupCollapse', 'handleToggleWorkItemComplete'];
  localVars.forEach(v => {
      // Find matching line and remove... this is actually tricky since it could be multi-line.
  });

  fs.writeFileSync(file, code);
}

cleanFile('src/App.tsx', [
  'ChevronLeft', 'Search', 'Clock', 'Edit2', 'Layers', 'Loader2', 'WifiOff',
  'FileText', 'ListChecks', 'Printer', 'Save', 'DollarSign', 'Banknote', 'CheckSquare',
  'Mic', 'Filter', 'GripVertical', 'Navigation', 'MoreVertical', 'Bot',
  'Reorder', 'Virtuoso', 'COLORS', 'WorkCalendar', 'SortableProductItem',
  'ScheduleOrderCard', 'TripReorderGroup', 'formatTimeDisplay', 'buttonHover',
  'containerVariants', 'itemVariants', 'WorkGroupItem', 'DebouncedSearchInput'
]);

cleanFile('src/views/OrdersView.tsx', ['Search']);
cleanFile('src/views/ScheduleView.tsx', ['Save', 'Loader2']);
