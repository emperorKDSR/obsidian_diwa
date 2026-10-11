import esbuild from 'esbuild';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const testDir = 'tests';
if (!fs.existsSync(testDir)) {
    console.error('No tests directory found');
    process.exit(1);
}

const testFiles = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.test.ts'))
    .map(f => path.join(testDir, f));

if (testFiles.length === 0) {
    console.log('No test files found in tests/');
    process.exit(0);
}

const tempEntry = path.join(testDir, '.entry.ts');
const outfile = path.join(testDir, '.built_tests.cjs');

try {
    const entryContent = testFiles.map(f => `import './${path.basename(f, '.ts')}';`).join('\n');
    fs.writeFileSync(tempEntry, entryContent);

    await esbuild.build({
        entryPoints: [tempEntry],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile,
        alias: {
            'obsidian': './tests/mocks/obsidian.js'
        },
        external: ['node:*']
    });

    const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' });
    process.exit(result.status ?? 0);
} catch (err) {
    console.error('[DIWA Test Runner] Build/execution error:', err);
    process.exit(1);
} finally {
    if (fs.existsSync(tempEntry)) fs.unlinkSync(tempEntry);
    if (fs.existsSync(outfile)) fs.unlinkSync(outfile);
}
