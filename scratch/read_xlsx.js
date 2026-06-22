const xlsx = require('xlsx');
const path = require('path');

const file = '/Users/harshithgowda/Desktop/hunt_gcc/GCCs LinkedIn HR.xlsx';
const workbook = xlsx.readFile(file);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(sheet);

console.log('Total rows:', data.length);
console.log('Columns:', Object.keys(data[0] || {}));
console.log('\nFirst 10 rows sample:');
data.slice(0, 10).forEach((row, i) => {
  console.log(`Row ${i + 1}:`, JSON.stringify(row, null, 2));
});
