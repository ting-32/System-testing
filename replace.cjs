const fs = require('fs');
let lines = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
const startIdx = lines.findIndex(l => l.includes("{activeTab === 'work' && ("));
const endIdx = lines.findIndex((l, i) => i > startIdx && l.includes("</main>"));

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `        {activeTab === 'work' && (
          <WorkView
            orders={orders}
            products={products}
            workDates={workDates}
            setWorkDates={setWorkDates}
            workCustomerFilter={workCustomerFilter}
            setWorkCustomerFilter={setWorkCustomerFilter}
            workDeliveryMethodFilter={workDeliveryMethodFilter}
            setWorkDeliveryMethodFilter={setWorkDeliveryMethodFilter}
            workProductFilter={workProductFilter}
            setWorkProductFilter={setWorkProductFilter}
            workSheetData={workSheetData}
            handlePrint={handlePrint}
            setActiveTab={setActiveTab}
            isProductFilterOpen={isProductFilterOpen}
            setIsProductFilterOpen={setIsProductFilterOpen}
            expandedFilterCats={expandedFilterCats}
            setExpandedFilterCats={setExpandedFilterCats}
            visibleWorkCount={visibleWorkCount}
            setVisibleWorkCount={setVisibleWorkCount}
          />
        )}
      </main>`;
  lines.splice(startIdx, endIdx - startIdx + 1, replacement);
  fs.writeFileSync('src/App.tsx', lines.join('\n'));
  console.log('Replaced successfully');
} else {
  console.log('Not found string!', startIdx, endIdx);
}
