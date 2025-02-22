#!/usr/bin/env node

// Increase memory limit for the server process
const v8 = require('v8');
v8.setFlagsFromString('--max-old-space-size=4096'); // 4GB memory limit

const express = require('express');
const { searchStore } = require('../dist/services/vector-store');

const app = express();
app.use(express.json());

let currentPort = null;

async function initializeServer() {
  console.log('Initializing search store...');
  await searchStore.initialize();

  // Add some test files if the index is empty
  const testFiles = [
    'scripts/start-server.js',
    'src/services/vector-store/index.ts',
    'src/server/index.ts',
    'package.json'
  ];

  for (const file of testFiles) {
    try {
      await searchStore.addOrUpdateFile(file);
    } catch (error) {
      console.error(`Failed to index test file ${file}:`, error);
    }
  }
}

// Initialize before setting up routes
initializeServer().then(() => {
  // File indexing endpoint
  app.post('/index', async (req, res) => {
    try {
      const { path } = req.body;
      if (!path) {
        return res.status(400).json({ error: 'Path is required' });
      }
      await searchStore.addOrUpdateFile(path);
      res.json({ success: true });
    } catch (error) {
      console.error('Error indexing file:', error);
      res.status(500).json({ error: 'Failed to index file' });
    }
  });

  // Search endpoint
  app.get('/search', async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({ error: 'Query parameter q is required' });
      }
      const results = await searchStore.search(q);
      res.json({ results });
    } catch (error) {
      console.error('Error searching:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  // File deletion endpoint
  app.delete('/file', async (req, res) => {
    try {
      const { path } = req.body;
      if (!path) {
        return res.status(400).json({ error: 'Path is required' });
      }
      await searchStore.removeFile(path);
      res.json({ success: true });
    } catch (error) {
      console.error('Error removing file:', error);
      res.status(500).json({ error: 'Failed to remove file' });
    }
  });

  // Start the server
  const port = process.env.PORT || 49152;
  const server = app.listen(port, () => {
    currentPort = port;
    console.log(`Server running on port ${port}`);
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
      process.exit(0);
    });
  });
}).catch(error => {
  console.error('Failed to initialize server:', error);
  process.exit(1);
}); 