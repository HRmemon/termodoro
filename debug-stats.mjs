
import { getBrowserStatsForDate } from './dist/lib/browser-stats.js';

function getTodayString() {
  const d = new Date();
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return ds;
}

const today = getTodayString();
console.log('--- Environment Info ---');
console.log('Local Time:', new Date().toString());
console.log('ISO Time (UTC):', new Date().toISOString());
console.log('Today String (Local):', today);

console.log('\n--- Running getBrowserStatsForDate("' + today + '") ---');
const stats = getBrowserStatsForDate(today);

if (!stats) {
  console.log('Result: null (No data found or error)');
} else {
  console.log('Total Minutes:', stats.totalMinutes);
  console.log('Active Minutes:', stats.activeMinutes);
  console.log('Audible Minutes:', stats.audibleMinutes);
  console.log('Top Domains:', stats.domains.length);
  if (stats.domains.length > 0) {
    console.log('First Domain:', stats.domains[0]);
  }
}

// Also check Yesterday just in case
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
console.log('\n--- Running getBrowserStatsForDate("' + yesterdayStr + '") ---');
const yStats = getBrowserStatsForDate(yesterdayStr);
if (yStats) {
  console.log('Total Minutes (Yesterday):', yStats.totalMinutes);
}

process.exit(0);
