import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const rootPrefix = root.endsWith(sep) ? root : root + sep;
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname).replace(/\/$/, '/index.html');
  return resolve(root, '.' + pathname);
}

const server = createServer(async (req, res) => {
  try {
    const path = resolveRequestPath(req.url);
    if (!path.startsWith(rootPrefix)) {
      res.writeHead(403).end();
      return;
    }
    const content = await readFile(path);
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () =>
  console.log(`Tabtastic preview: http://127.0.0.1:${server.address().port}`),
);
