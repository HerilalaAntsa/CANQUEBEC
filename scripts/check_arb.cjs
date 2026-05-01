const XLSX = require('xlsx');
const wb = XLSX.readFile('public/data/HORAIRE_2026.xlsx');
const ws = wb.Sheets['HORAIRE'];
const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
// Colonnes arbitres : 11=C, 12=T1, 13=T2, 14=CO
const arbRows = data.filter(r => r[11] || r[12] || r[13] || r[14]);
arbRows.slice(0, 30).forEach(r => {
  console.log(`C:${r[11]} | T1:${r[12]} | T2:${r[13]} | CO:${r[14]}`);
});
