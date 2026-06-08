const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const lines = code.split('\n');
const newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('productForm,')) continue;
  if (lines[i].includes('setProductForm={setProductForm}')) continue;
  newLines.push(lines[i]);
}

fs.writeFileSync('src/App.tsx', newLines.join('\n'));
