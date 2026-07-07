const xlsx = require('xlsx');
const path = require('path');
function loadExcel() {
  const excelPath = path.join(__dirname, 'companies.xlsx');
  const workbook = xlsx.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  console.log("Excel companies count:", data.length);
}
loadExcel();
