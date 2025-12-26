import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';

function copyStaticDirs(): Plugin {
    let resolved: ResolvedConfig | null = null;

    return {
        name: 'copy-static-dirs',
        apply: 'build',
        configResolved(config) {
            resolved = config;
        },
        closeBundle() {
            if (!resolved) return;
            const outDir = path.resolve(resolved.root, resolved.build.outDir);

            const entries = [
                { from: path.resolve(resolved.root, 'assets'), to: path.resolve(outDir, 'assets') },
                { from: path.resolve(resolved.root, 'data'), to: path.resolve(outDir, 'data') }
            ];

            for (const entry of entries) {
                if (!fs.existsSync(entry.from)) continue;
                fs.cpSync(entry.from, entry.to, { recursive: true });
            }
        }
    };
}

export default defineConfig({
    base: './',
    plugins: [react(), copyStaticDirs()]
});
