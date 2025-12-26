import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';

function serveDevStaticDirs(): Plugin {
    return {
        name: 'serve-dev-static-dirs',
        apply: 'serve',
        configureServer(server) {
            const rootDir = server.config.root;

            const mounts: Array<{ mount: string; dir: string }> = [
                { mount: '/assets', dir: path.resolve(rootDir, 'assets') },
                { mount: '/data', dir: path.resolve(rootDir, 'data') }
            ];

            const getContentType = (filePath: string): string => {
                switch (path.extname(filePath).toLowerCase()) {
                    case '.png':
                        return 'image/png';
                    case '.jpg':
                    case '.jpeg':
                        return 'image/jpeg';
                    case '.webp':
                        return 'image/webp';
                    case '.gif':
                        return 'image/gif';
                    case '.svg':
                        return 'image/svg+xml';
                    case '.json':
                        return 'application/json; charset=utf-8';
                    case '.wav':
                        return 'audio/wav';
                    case '.mp3':
                        return 'audio/mpeg';
                    case '.ogg':
                        return 'audio/ogg';
                    default:
                        return 'application/octet-stream';
                }
            };

            for (const { mount, dir } of mounts) {
                server.middlewares.use(mount, (req, res, next) => {
                    if (!req.url) return next();

                    const url = new URL(req.url, 'http://localhost');
                    const rel = url.pathname.replace(/^\/+/, '');
                    const filePath = path.resolve(dir, rel);

                    // Prevent directory traversal.
                    if (!filePath.startsWith(dir)) return next();

                    try {
                        const stat = fs.statSync(filePath);
                        if (!stat.isFile()) return next();

                        res.statusCode = 200;
                        res.setHeader('Content-Type', getContentType(filePath));
                        res.setHeader('Cache-Control', 'no-cache');
                        fs.createReadStream(filePath).pipe(res);
                        return;
                    } catch {
                        return next();
                    }
                });
            }
        }
    };
}

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
    plugins: [react(), serveDevStaticDirs(), copyStaticDirs()]
});
