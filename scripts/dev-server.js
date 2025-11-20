import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');
const port = Number.parseInt(process.env.PORT, 10) || 8080;

const mimeTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json'
};

function isPathInsidePublic(candidatePath) {
  const relative = path.relative(publicDir, candidatePath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://localhost:${port}`);
  const requestedPath = decodeURIComponent(requestUrl.pathname);
  const normalizedPath = path.normalize(requestedPath).replace(/^[/\\]+/, '');
  const filePath = path.join(publicDir, normalizedPath);

  if (!isPathInsidePublic(filePath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  let resolvedPath = filePath;

  try {
    const fileStat = await stat(resolvedPath);
    if (fileStat.isDirectory()) {
      resolvedPath = path.join(resolvedPath, 'index.html');
      await stat(resolvedPath);
    }

    const fileContents = await readFile(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    const contentType = mimeTypes[extension] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(fileContents);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`Serving public/ at http://localhost:${port}`);
});
