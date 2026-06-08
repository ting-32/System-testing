const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(
  "import { WorkView } from './views/WorkView';",
  "import { WorkView } from './views/WorkView';\nimport { ScheduleView } from './views/ScheduleView';"
);
fs.writeFileSync('src/App.tsx', content);
