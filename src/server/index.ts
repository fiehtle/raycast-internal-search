import express, { Request, Response, Router, RequestHandler } from 'express';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { environment, showToast, Toast } from "@raycast/api";
import net from 'net';
import { PDFData } from '../types/pdf-parse';
const pdfParse = require('pdf-parse');

// Constants for optimization
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
const SUPPORTED_TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.js', '.ts', '.pdf'];
const BASE_PORT = 49152;
const MAX_PORT_TRIES = 10;

interface FileItem {
  path: string;
  name: string;
  type: string;
  preview?: string;
  size?: number;
}

interface SearchResponse {
  files: FileItem[];
  page: number;
  hasMore: boolean;
}

interface FileResponse {
  content: string;
}

class ServerManager {
  private static instance: ServerManager;
  private server: ReturnType<express.Application['listen']> | null = null;
  private port: number = BASE_PORT;
  private isReady = false;
  private baseDir: string;
  private router: Router;

  private constructor() {
    // Use Documents folder as fallback if Downloads is not accessible
    const homeDir = process.env.HOME || '';
    const downloadDir = path.join(homeDir, 'Downloads');
    const documentsDir = path.join(homeDir, 'Documents');
    
    // Check if Downloads directory is accessible
    try {
      fs.accessSync(downloadDir, fs.constants.R_OK);
      this.baseDir = downloadDir;
    } catch (err) {
      try {
        fs.accessSync(documentsDir, fs.constants.R_OK);
        this.baseDir = documentsDir;
      } catch (err) {
        // If neither is accessible, use the extension's support directory
        this.baseDir = environment.supportPath;
      }
    }

    // Initialize router
    this.router = express.Router();
    this.setupRoutes();
  }

  private setupRoutes() {
    // Search endpoint
    const searchHandler: RequestHandler<any, SearchResponse | { error: string }> = async (req, res) => {
      const query = req.query.q ? (req.query.q as string).toLowerCase() : '';
      const mode = req.query.mode || 'title';
      const page = parseInt(req.query.page as string) || 1;
      const limit = 50;
      const offset = (page - 1) * limit;
      
      try {
        const allFiles = await this.scanDir(this.baseDir);
        let matchingFiles: FileItem[] = [];

        if (mode === 'content') {
          // Search through file contents
          for (const file of allFiles) {
            if (!SUPPORTED_TEXT_EXTENSIONS.includes(path.extname(file.path).toLowerCase())) {
              continue;
            }
            
            const content = await this.getFileContent(file.path);
            if (content && content.toLowerCase().includes(query)) {
              // Add preview of the matching content
              const lines = content.split('\n');
              const matchingLine = lines.find(line => 
                line.toLowerCase().includes(query)
              ) || '';
              
              matchingFiles.push({
                ...file,
                preview: matchingLine.trim().substring(0, 200)
              });
            }
          }
        } else {
          // Title-based search
          matchingFiles = allFiles.filter(file => 
            file.name.toLowerCase().includes(query)
          );
        }

        // Sort by size (smaller files first) and apply pagination
        matchingFiles.sort((a, b) => (a.size || 0) - (b.size || 0));
        const paginatedFiles = matchingFiles.slice(offset, offset + limit);
        
        res.json({
          files: paginatedFiles,
          page,
          hasMore: offset + limit < matchingFiles.length
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to search files" });
      }
    };

    // File content endpoint
    const fileHandler: RequestHandler<any, FileResponse | { error: string }> = async (req, res) => {
      const filePath = req.query.path as string;
      if (!filePath) {
        res.status(400).json({ error: "Missing file path" });
        return;
      }
      if (!filePath.startsWith(this.baseDir)) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      try {
        const content = await this.getFileContent(filePath);
        if (content === null) {
          res.status(400).json({ error: "Failed to read file" });
        } else {
          res.json({ content });
        }
      } catch (err) {
        console.error("Error reading file:", err);
        res.status(500).json({ error: "Failed to read file" });
      }
    };

    this.router.get('/search', searchHandler);
    this.router.get('/file', fileHandler);
  }

  public static getInstance(): ServerManager {
    if (!ServerManager.instance) {
      ServerManager.instance = new ServerManager();
    }
    return ServerManager.instance;
  }

  public get ready(): boolean {
    return this.isReady;
  }

  private async findAvailablePort(): Promise<number> {
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
      } catch (err) {
        // Port is available
        return port;
      }
    }
    throw new Error('No available ports found');
  }

  // Read file content based on type
  private async getFileContent(filePath: string): Promise<string | null> {
    try {
      const ext = path.extname(filePath).toLowerCase();
      const stats = await fsPromises.stat(filePath);
      
      if (stats.size > MAX_FILE_SIZE) {
        return null;
      }

      if (ext === '.pdf') {
        const dataBuffer = await fsPromises.readFile(filePath);
        const data = await pdfParse(dataBuffer) as PDFData;
        return data.text;
      } else if (SUPPORTED_TEXT_EXTENSIONS.includes(ext)) {
        return await fsPromises.readFile(filePath, 'utf8');
      }
      return null;
    } catch (err) {
      console.error("Error reading file content:", err);
      return null;
    }
  }

  // Recursively scan directory
  private async scanDir(directory: string): Promise<FileItem[]> {
    let results: FileItem[] = [];
    try {
      const items = await fsPromises.readdir(directory, { withFileTypes: true });
      for (const item of items) {
        try {
          const fullPath = path.join(directory, item.name);
          
          // Skip hidden files and directories
          if (item.name.startsWith('.')) {
            continue;
          }

          if (item.isDirectory()) {
            const subResults = await this.scanDir(fullPath);
            results = results.concat(subResults);
          } else {
            const stats = await fsPromises.stat(fullPath);
            results.push({
              path: fullPath,
              name: item.name,
              type: path.extname(item.name).substring(1),
              size: stats.size
            });
          }
        } catch (err) {
          // Skip files/directories we can't access
          continue;
        }
      }
    } catch (err) {
      console.error(`Error scanning directory ${directory}:`, err);
    }
    return results;
  }

  async start() {
    try {
      if (this.server) {
        console.log("Server already running");
        return;
      }

      this.isReady = false;

      // Find an available port
      this.port = await this.findAvailablePort();

      const app = express();

      // Error handling middleware
      app.use((err: Error, req: Request, res: Response, next: Function) => {
        console.error(err.stack);
        res.status(500).json({ error: "Internal server error" });
      });

      // Use the router
      app.use('/', this.router);

      return new Promise<void>((resolve, reject) => {
        try {
          this.server = app.listen(this.port, () => {
            console.log(`Server running on port ${this.port}`);
            this.isReady = true;
            if (environment.isDevelopment) {
              showToast({
                style: Toast.Style.Success,
                title: "Local server started",
                message: `Running on port ${this.port}`
              }).then(() => {});
            }
            resolve();
          });

          this.server.on('error', (error) => {
            this.isReady = false;
            reject(error);
          });
        } catch (error) {
          this.isReady = false;
          console.error("Failed to start server:", error);
          if (environment.isDevelopment) {
            showToast({
              style: Toast.Style.Failure,
              title: "Failed to start local server",
              message: error instanceof Error ? error.message : "Unknown error"
            }).then(() => {});
          }
          reject(error);
        }
      });
    } catch (error) {
      this.isReady = false;
      console.error("Failed to start server:", error);
      if (environment.isDevelopment) {
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to start local server",
          message: error instanceof Error ? error.message : "Unknown error"
        }).then(() => {});
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.isReady = false;
      return new Promise((resolve, reject) => {
        try {
          this.server?.close((err) => {
            if (err) {
              reject(err);
              return;
            }
            this.server = null;
            if (environment.isDevelopment) {
              showToast({
                style: Toast.Style.Success,
                title: "Local server stopped"
              });
            }
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      });
    }
  }

  public getPort(): number {
    return this.port;
  }
}

export const serverManager = ServerManager.getInstance(); 