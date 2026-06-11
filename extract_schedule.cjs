const fs = require('fs');
const appTsx = fs.readFileSync('src/App.tsx', 'utf8');
const lines = appTsx.split('\n');
const scheduleCode = [];
let capturing = false;
for (const line of lines) {
    if (line.includes("{activeTab === 'schedule' && (")) {
        capturing = true;
    }
    if (capturing) {
        scheduleCode.push(line);
    }
    if (capturing && (line.includes("{activeTab === 'finance' && (") || line.includes("{activeTab === 'work' && ("))) {
        scheduleCode.pop(); // remove the finance/work line
        break;
    }
}
fs.writeFileSync('schedule_code.txt', scheduleCode.join('\n'));
