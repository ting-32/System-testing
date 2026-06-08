const fs = require('fs');
let lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
const startIdx = lines.findIndex(l => l.includes("{activeTab === 'orders' && ("));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes("{activeTab === 'customers' && ("));

if (startIdx !== -1 && endIdx !== -1) {
    console.log(lines.slice(startIdx, endIdx).join('\n'));
} else {
    console.log("NOT FOUND", startIdx, endIdx);
}
