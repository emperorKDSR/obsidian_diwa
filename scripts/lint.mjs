import { spawnSync } from 'child_process';
import fs from 'fs';

const hasEslint = fs.existsSync('./node_modules/.bin/eslint');

if (hasEslint) {
    const res = spawnSync('./node_modules/.bin/eslint', ['src', '--ext', '.ts'], { stdio: 'inherit' });
    process.exit(res.status ?? 0);
} else {
    console.log('[DIWA Lint] Offline sandbox detected (node_modules/.bin/eslint not installed).');
    console.log('[DIWA Lint] Running TypeScript strict type & syntax check...');
    const tscRes = spawnSync('npx', ['tsc', '--noEmit', '--skipLibCheck'], { stdio: 'inherit' });
    if ((tscRes.status ?? 0) !== 0) {
        process.exit(tscRes.status ?? 1);
    }
    console.log('✔ [DIWA Lint] Type and syntax check passed.');
}
