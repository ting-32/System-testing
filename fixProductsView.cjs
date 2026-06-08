const fs = require('fs');
let code = fs.readFileSync('src/views/ProductsView.tsx', 'utf8');

// 1. Remove setProductForm from props
code = code.replace(/  setProductForm.*\n/g, '');
code = code.replace(/  setProductForm,\n/g, '');

// 2. Remove setProductForm calls
code = code.replace(/setProductForm\(\{[^}]*\}\);\s*/g, '');
code = code.replace(/setProductForm\(p\);\s*/g, '');

fs.writeFileSync('src/views/ProductsView.tsx', code);
