#!/usr/bin/env node

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const webRoot = path.join(projectRoot, 'web');
const host = process.env.READER_HOST || '127.0.0.1';
const port = Number(process.env.READER_PORT || 8765);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.ftl': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function sendText(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  response.end(body);
}

function containedPath(root, relativePath) {
  const filePath = path.resolve(root, relativePath);
  return filePath === root || filePath.startsWith(`${root}${path.sep}`) ? filePath : null;
}

function resolveRequestPath(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch (_) {
    return null;
  }
  if (pathname === '/') pathname = '/index.html';
  return containedPath(webRoot, pathname.replace(/^\/+/, ''));
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header || '');
  if (!match) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    sendText(response, 405, 'Method not allowed\n');
    return;
  }

  const filePath = resolveRequestPath(request.url);
  if (!filePath) {
    sendText(response, 403, 'Forbidden\n');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendText(response, 404, 'Not found\n');
      return;
    }

    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': contentType.startsWith('text/html') || contentType.startsWith('text/javascript')
        ? 'no-store'
        : 'public, max-age=3600'
    };
    const requestedRange = request.headers.range;
    const range = requestedRange ? parseRange(requestedRange, stats.size) : null;

    if (requestedRange && !range) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}` });
      response.end();
      return;
    }

    if (range) {
      const length = range.end - range.start + 1;
      response.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${range.start}-${range.end}/${stats.size}`,
        'Content-Length': length
      });
      if (request.method === 'HEAD') response.end();
      else fs.createReadStream(filePath, range).pipe(response);
      return;
    }

    response.writeHead(200, { ...headers, 'Content-Length': stats.size });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
});

server.on('error', error => {
  console.error(`Reader server failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Web root: ${webRoot}`);
  console.log(`Accepted papers: http://${host}:${port}/`);
  console.log('Press Ctrl+C to stop.');
});
