import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// Read-only access to the original screenshots so a question can show its source image.
// Only serves image files located inside the assessment directory.
const SOURCE_ROOT = path.resolve('D:/CEH/CEH Quizzes And Mocks');

function sourceScreens(): Plugin {
  const handler = (req: { url?: string }, res: import('node:http').ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/source/')) return next();
    try {
      const rel = decodeURIComponent(req.url.slice('/source/'.length).split('?')[0]);
      const full = path.resolve(SOURCE_ROOT, rel);
      if (!full.startsWith(SOURCE_ROOT + path.sep) || !/\.(png|jpe?g|webp|gif|bmp)$/i.test(full) || !fs.existsSync(full)) {
        res.statusCode = 404;
        return res.end('Not found');
      }
      res.setHeader('Content-Type', full.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
      fs.createReadStream(full, { flags: 'r' }).pipe(res);
    } catch {
      res.statusCode = 400;
      res.end('Bad request');
    }
  };
  return {
    name: 'ceh-source-screens',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), sourceScreens()],
  base: './',
  server: { port: 5173, open: true },
  preview: { port: 4173, open: true },
});
