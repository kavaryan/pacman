#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = __dirname;
const acceptedDir = path.join(projectRoot, 'accepted');
const webDir = path.join(projectRoot, 'web');
const sourceCataloguePath = path.join(projectRoot, 'accepted-papers-metadata.json');
const outputCataloguePath = path.join(webDir, 'accepted-catalog.json');
const sourceCatalogue = JSON.parse(fs.readFileSync(sourceCataloguePath, 'utf8'));

if (!Array.isArray(sourceCatalogue)) {
  throw new Error(`${sourceCataloguePath}: expected a JSON array`);
}

function paperIdFromMetadata(metadata) {
  if (!metadata.pdf_path) return null;
  return path.basename(metadata.pdf_path, path.extname(metadata.pdf_path));
}

const metadataById = new Map();
for (const metadata of sourceCatalogue) {
  const id = paperIdFromMetadata(metadata);
  if (!id) continue;
  if (metadataById.has(id)) throw new Error(`${sourceCataloguePath}: duplicate paper id ${id}`);
  metadataById.set(id, metadata);
}

function readPaperId(filename) {
  const document = JSON.parse(fs.readFileSync(path.join(acceptedDir, filename), 'utf8'));
  const paper = Array.isArray(document) && document.length === 1 ? document[0] : document;
  if (!paper || typeof paper !== 'object' || Array.isArray(paper)) {
    throw new Error(`${filename}: expected one paper object`);
  }
  const unexpectedKeys = Object.keys(paper).filter(key => key !== 'id' && key !== 'theorems');
  if (unexpectedKeys.length) {
    throw new Error(`${filename}: paper JSON contains forbidden metadata fields: ${unexpectedKeys.join(', ')}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(paper.id || '')) {
    throw new Error(`${filename}: invalid or missing paper id`);
  }
  if (!Array.isArray(paper.theorems)) {
    throw new Error(`${filename}: missing theorems array`);
  }
  if (path.basename(filename, '.json') !== paper.id) {
    throw new Error(`${filename}: filename must match paper id ${paper.id}`);
  }
  return paper.id;
}

function buildCatalogue() {
  const dataFiles = fs.readdirSync(acceptedDir)
    .filter(name => name.endsWith('.json') && name !== 'accepted-catalog.json')
    .sort();
  const processedIds = new Set();
  for (const filename of dataFiles) {
    const id = readPaperId(filename);
    if (!metadataById.has(id)) throw new Error(`${filename}: id not found in ${sourceCataloguePath}`);
    if (processedIds.has(id)) throw new Error(`${filename}: duplicate processed paper id ${id}`);
    processedIds.add(id);
  }

  const papers = sourceCatalogue.map(metadata => {
    const id = paperIdFromMetadata(metadata);
    if (!id) throw new Error(`${sourceCataloguePath}: record has no usable pdf_path`);
    return { ...metadata, id, processed: processedIds.has(id) };
  });

  papers.sort((a, b) =>
    Number(b.processed) - Number(a.processed)
    || (b.year || 0) - (a.year || 0)
    || a.title.localeCompare(b.title)
  );
  fs.writeFileSync(outputCataloguePath, `${JSON.stringify(papers, null, 2)}\n`);
  return papers;
}

try {
  const papers = buildCatalogue();
  const processed = papers.filter(paper => paper.processed).length;
  console.log(`Wrote ${outputCataloguePath} with ${papers.length} papers (${processed} processed).`);
} catch (error) {
  console.error(`Catalogue generation failed: ${error.message}`);
  process.exitCode = 1;
}
