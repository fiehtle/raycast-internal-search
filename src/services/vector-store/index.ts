import path from 'path';
import fs from 'fs/promises';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { HierarchicalNSW } from 'hnswlib-node';
import OpenAI from 'openai';
import { mcpService } from '../mcp';
import os from 'os';

const DATA_DIR = path.join(os.homedir(), '.raycast-search');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

interface FileRecord {
  id: string;
  path: string;
  name: string;
  type: string;
  size: number;
  content_preview: string;
  last_modified: number;
  vector_id?: number;
}

class SearchStore {
  private static instance: SearchStore | null = null;
  private ready = false;
  private db: any;
  private index!: HierarchicalNSW;
  private dbPath: string;
  private dimension = 1536; // OpenAI's text-embedding-3-small dimension

  private constructor() {
    this.dbPath = path.join(DATA_DIR, 'search.db');
  }

  public static getInstance(): SearchStore {
    if (!SearchStore.instance) {
      SearchStore.instance = new SearchStore();
    }
    return SearchStore.instance;
  }

  private async initializeDb(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`Initializing SQLite database at ${this.dbPath}`);

    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER NOT NULL,
        content_preview TEXT NOT NULL,
        last_modified INTEGER NOT NULL,
        vector_id INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_name ON files(name);
    `);

    const count = await this.db.get('SELECT COUNT(*) as count FROM files');
    console.log(`Database initialized with ${count.count} files`);
  }

  private async initializeHnsw(): Promise<void> {
    try {
      // Create HNSW index with cosine similarity
      this.index = new HierarchicalNSW('cosine', this.dimension);
      
      // Initialize with default parameters
      this.index.initIndex({
        maxElements: 10000, // Maximum number of elements
        efConstruction: 200, // Higher is more accurate but slower to build
        m: 16 // Use lowercase 'm' instead of 'M'
      });
      
      console.log('HNSW index ready for use');
    } catch (error) {
      console.error('Failed to initialize HNSW:', error);
      throw error;
    }
  }

  public async initialize(): Promise<void> {
    if (this.ready) return;

    try {
      await this.initializeDb();
      await this.initializeHnsw();
      this.ready = true;
      console.log('Search store initialization complete');
    } catch (error) {
      console.error('Failed to initialize search store:', error);
      throw error;
    }
  }

  private async generateEmbedding(text: string): Promise<Float32Array> {
    try {
      console.log('Generating embedding for text length:', text.length);
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
        encoding_format: "float"
      });

      console.log('Got embedding response:', {
        model: response.model,
        objectType: response.object,
        embeddingLength: response.data[0].embedding.length
      });

      // Convert to Float32Array directly
      const embedding = new Float32Array(response.data[0].embedding);
      console.log('Converted to Float32Array:', {
        length: embedding.length,
        type: embedding.constructor.name,
        firstFew: Array.from(embedding.slice(0, 5))
      });

      return embedding;
    } catch (error) {
      console.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  public async addOrUpdateFile(filePath: string): Promise<void> {
    if (!await mcpService.isTextFile(filePath)) {
      console.log(`Skipping non-text file: ${filePath}`);
      return;
    }

    try {
      const stats = await fs.stat(filePath);
      const fileId = Buffer.from(filePath).toString('base64url');
      const { content, size } = await mcpService.readFile(filePath);
      
      // Generate embedding and add to HNSW
      const embedding = await this.generateEmbedding(content);
      const vectorId = this.index.getCurrentCount();
      
      try {
        // Convert Float32Array to regular array for HNSW
        const vector = Array.from(embedding);
        
        // Add vector to HNSW index
        this.index.addPoint(vector, vectorId);
        console.log(`Added vector ${vectorId} to HNSW index (dimension: ${this.dimension})`);
      } catch (error) {
        console.error('Failed to add vector to HNSW:', error);
        throw new Error(`Failed to add vector to HNSW: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Store file record
      const preview = content.slice(0, 1000);
      await this.db.run(`
        INSERT OR REPLACE INTO files (
          id, path, name, type, size, content_preview, last_modified, vector_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fileId,
        filePath,
        path.basename(filePath),
        path.extname(filePath).substring(1),
        size,
        preview,
        stats.mtimeMs,
        vectorId
      ]);
      
      console.log(`Indexed file ${filePath} with vector ID ${vectorId}`);
    } catch (error) {
      console.error(`Failed to process file ${filePath}:`, error);
      throw error;
    }
  }

  public async search(query: string, limit: number = 50): Promise<FileRecord[]> {
    try {
      const totalVectors = this.index.getCurrentCount();
      if (totalVectors === 0) {
        console.log('No vectors in index');
        return [];
      }

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);
      
      try {
        // Convert Float32Array to regular array for HNSW
        const vector = Array.from(queryEmbedding);
        
        // Search in HNSW index
        const results = this.index.searchKnn(vector, Math.min(limit, totalVectors));
        const { neighbors, distances } = results;
        
        if (neighbors.length === 0) {
          return [];
        }

        // Fetch records
        const placeholders = neighbors.map(() => '?').join(',');
        const records = await this.db.all(`
          SELECT * FROM files 
          WHERE vector_id IN (${placeholders})
          ORDER BY CASE vector_id ${
            neighbors.map((l: number, i: number) => `WHEN ${l} THEN ${i}`).join(' ')
          } END
          LIMIT ?
        `, [...neighbors, limit]);

        return records.map((record: FileRecord, i: number) => ({
          ...record,
          score: 1 - distances[i] // Convert cosine distance to similarity score
        }));
      } catch (error) {
        console.error('Failed to search HNSW:', error);
        throw new Error(`Failed to search HNSW: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      console.error('Error in search:', error);
      throw error;
    }
  }

  public async removeFile(filePath: string): Promise<void> {
    const fileId = Buffer.from(filePath).toString('base64url');
    await this.db.run('DELETE FROM files WHERE id = ?', fileId);
    console.log(`Removed file ${filePath} from database`);
  }

  public isReady(): boolean {
    return this.ready;
  }
}

export const searchStore = SearchStore.getInstance(); 