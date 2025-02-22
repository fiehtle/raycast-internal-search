import express from 'express';
import * as net from 'net';
import { searchStore } from '../services/vector-store';
import type { Request, Response } from 'express';

const app = express();
const BASE_PORT = 49152;
const MAX_PORT_TRIES = 10;
let currentPort: number | null = null;

// Middleware
app.use(express.json());

// Routes
app.post('/index', async (req: Request, res: Response) => {
  try {
    const { path } = req.body;
    if (!path || typeof path !== 'string') {
      res.status(400).json({ error: 'Path is required' });
      return;
    }
    await searchStore.addOrUpdateFile(path);
    res.json({ success: true });
  } catch (error) {
    console.error('Error indexing file:', error);
    res.status(500).json({ error: 'Failed to index file' });
  }
});

app.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = Number(req.query.limit) || 50;
    
    if (!query) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }
    
    const results = await searchStore.search(query, limit);
    res.json({ results });
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.delete('/file', async (req: Request, res: Response) => {
  try {
    const { path } = req.body;
    if (!path || typeof path !== 'string') {
      res.status(400).json({ error: 'Path is required' });
      return;
    }
    await searchStore.removeFile(path);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing file:', error);
    res.status(500).json({ error: 'Failed to remove file' });
  }
});

// Find an available port
async function findAvailablePort(): Promise<number> {
  for (let port = BASE_PORT; port < BASE_PORT + MAX_PORT_TRIES; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const testServer = net.createServer()
          .once('error', () => {
            testServer.close();
            resolve();
          })
          .once('listening', () => {
            testServer.close();
            reject();
          })
          .listen(port);
      });
      return port;
    } catch {
      continue;
    }
  }
  throw new Error('No available ports found');
}

// Start the server
export async function startServer(): Promise<void> {
  try {
    await searchStore.initialize();
    const port = await findAvailablePort();
    currentPort = port;
    
    await new Promise<void>((resolve) => {
      app.listen(port, () => {
        console.log(`Server running on port ${port}`);
        resolve();
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    throw error;
  }
}

export function getPort(): number | null {
  return currentPort;
}

// Start server if this file is run directly
if (require.main === module) {
  startServer().catch(console.error);
} 