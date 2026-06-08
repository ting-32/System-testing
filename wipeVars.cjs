const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/\bLayers\b\s*,?\s*/g, '');
code = code.replace(/\bFilter\b\s*,?\s*/g, '');

const lines = code.split('\n');

const toDelete = ['collapsedWorkGroups', 'completedWorkItems', 'filteredCustomers,'];
for (let i = 0; i < lines.length; i++) {
  if (toDelete.some(v => lines[i].includes(v))) {
    lines.splice(i, 1);
    i--;
  }
}

code = lines.join('\n');

// For handleNavigateTrip, getTripSummary, handleToggleWorkGroupCollapse, handleToggleWorkItemComplete
const blocksToRemove = [
  'handleNavigateTrip',
  'getTripSummary',
  'handleToggleWorkGroupCollapse',
  'handleToggleWorkItemComplete'
];

for (const block of blocksToRemove) {
    const fnStart = code.indexOf(`const ${block} =`);
    if (fnStart !== -1) {
        let fnEnd = fnStart;
        let braceCount = 0;
        let started = false;
        while (fnEnd < code.length) {
            if (code[fnEnd] === '{') {
                braceCount++;
                started = true;
            } else if (code[fnEnd] === '}') {
                braceCount--;
                if (started && braceCount === 0) {
                    // if it's useCallback, maybe it ends with }, []); or similar
                    let nextSemi = code.indexOf(';', fnEnd);
                    if (nextSemi !== -1 && nextSemi - fnEnd < 15) {
                        fnEnd = nextSemi;
                    }
                    fnEnd++;
                    break;
                }
            }
            fnEnd++;
        }
        code = code.substring(0, fnStart) + code.substring(fnEnd);
    }
}

fs.writeFileSync('src/App.tsx', code);
