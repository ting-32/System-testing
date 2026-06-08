const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(/    productForm,\n/, '');
code = code.replace(/\bPRODUCT_CATEGORIES\b\s*,?\s*/g, '');

fs.writeFileSync('src/App.tsx', code);
