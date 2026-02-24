import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export function handleTrackSetup(): void {
  const hostScriptPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../native-host/pomodorocli-host.mjs',
  );

  // Make the host script executable
  try {
    fs.chmodSync(hostScriptPath, 0o755);
  } catch {
    console.error(`Could not chmod ${hostScriptPath}. Make sure it exists.`);
    process.exit(1);
  }

  // Write the native messaging manifest
  const nativeHostDir = path.join(os.homedir(), '.mozilla', 'native-messaging-hosts');
  fs.mkdirSync(nativeHostDir, { recursive: true });

  const manifest = {
    name: 'pomodorocli_host',
    description: 'Pomodorocli browser tracking host',
    path: hostScriptPath,
    type: 'stdio',
    allowed_extensions: ['pomodorocli-tracker@local'],
  };

  const manifestPath = path.join(nativeHostDir, 'pomodorocli_host.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log('Native messaging host installed successfully!\n');
  console.log(`  Manifest: ${manifestPath}`);
  console.log(`  Host:     ${hostScriptPath}\n`);
  console.log('Next steps:');
  console.log('  1. Open Firefox and go to about:debugging');
  console.log('  2. Click "This Firefox" > "Load Temporary Add-on"');
  console.log(`  3. Select: ${path.resolve(path.dirname(hostScriptPath), '../browser-ext/manifest.json')}`);
  console.log('  4. Enable "Browser Tracking" in pomodorocli Config view');
}
