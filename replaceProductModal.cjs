const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// 1. Remove useState for productForm
code = code.replace(/  const \[productForm, setProductForm\] = useState[^\n]+\n/g, '');

// 2. Remove productForm from useDataManagement args
code = code.replace(/    productForm,\n/g, '');

// 3. Find the AnimatePresence that wraps isEditingProduct and replace it.
const startIdx = code.indexOf('{isEditingProduct && (');
if (startIdx !== -1) {
    let before = code.substring(0, startIdx);
    let after = code.substring(startIdx);
    // Find the enclosing <AnimatePresence>
    const matchStart = before.lastIndexOf('<AnimatePresence>');
    const matchEnd = after.indexOf('</AnimatePresence>') + '</AnimatePresence>'.length;
    
    after = after.substring(matchEnd);
    before = before.substring(0, matchStart);
    
    code = before + `
      <ProductEditModal 
        isOpen={!!isEditingProduct}
        onClose={() => setIsEditingProduct(null)}
        initialData={isEditingProduct === 'new' ? null : productMap[isEditingProduct as string]}
        onSave={async (data) => requireAuth(() => handleSaveProduct(data))}
        isSaving={isSaving}
        isWarmingUp={isWarmingUp}
        isRetrying={isRetrying}
      />
` + after;
}

// Add import
code = code.replace("import { NetworkTimeoutModal }", "import { ProductEditModal } from './components/ProductEditModal';\nimport { NetworkTimeoutModal }");

fs.writeFileSync('src/App.tsx', code);
