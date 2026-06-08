const ts = require('typescript');
const fs = require('fs');

function removeUnused(filePath, unusedVars) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Very simple regex replacement for imports
    unusedVars.forEach(v => {
        // try to remove from destructured imports
        let regexDesc = new RegExp(`\\b${v}\\b\\s*,?\\s*`, 'g');
        content = content.replace(regexDesc, (match) => {
            // we should only remove it if it's inside an import
            return match; // Actually this is too risky with simple regex
        });
    });
}
