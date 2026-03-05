
import { upsertDomainUsage } from './dist/lib/browser-stats.js';

const dummyTab = {
  domain: 'test-domain.com',
  url: 'https://test-domain.com/testing',
  path: '/testing',
  title: 'Test Page'
};

console.log('Recording 300 seconds (5m) for test-domain.com...');
upsertDomainUsage(dummyTab, 300, 0);
console.log('Done.');
process.exit(0);
