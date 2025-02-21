import path from 'path';
import fs from 'fs/promises';
import { environment } from '@raycast/api';

interface FileRecord {
  id: string;
  path: string;
  name: string;
  type: string;
  size: number;
  content_preview: string;
  last_modified: number;
}

interface SearchIndex {
  files: { [key: string]: FileRecord };
  terms: { [key: string]: Set<string> };
}

class SearchStore {
  private static instance: SearchStore;
  private ready = false;
  private index: SearchIndex = {
    files: {},
    terms: {}
  };
  private indexPath: string;

  private constructor() {
    this.indexPath = path.join(environment.supportPath, 'search_index.json');
  }

  public static getInstance(): SearchStore {
    if (!SearchStore.instance) {
      SearchStore.instance = new SearchStore();
    }
    return SearchStore.instance;
  }

  private async loadIndex(): Promise<void> {
    try {
      const data = await fs.readFile(this.indexPath, 'utf8');
      const savedIndex = JSON.parse(data);
      
      // Reconstruct the index with Sets
      this.index.files = savedIndex.files;
      this.index.terms = {};
      
      for (const [term, fileIds] of Object.entries(savedIndex.terms)) {
        this.index.terms[term] = new Set(fileIds as string[]);
      }
    } catch (err) {
      // If file doesn't exist or is corrupted, start with empty index
      this.index = { files: {}, terms: {} };
    }
  }

  private async saveIndex(): Promise<void> {
    try {
      // Convert Sets to arrays for JSON serialization
      const serializableIndex = {
        files: this.index.files,
        terms: {} as { [key: string]: string[] }
      };

      for (const [term, fileIds] of Object.entries(this.index.terms)) {
        serializableIndex.terms[term] = Array.from(fileIds);
      }

      await fs.writeFile(this.indexPath, JSON.stringify(serializableIndex));
    } catch (err) {
      console.error('Error saving index:', err);
    }
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2);
  }

  public async initialize(): Promise<void> {
    if (this.ready) return;

    try {
      await this.loadIndex();
      this.ready = true;
    } catch (error) {
      console.error('Failed to initialize search store:', error);
      throw error;
    }
  }

  public async addOrUpdateFile(filePath: string, content: string): Promise<void> {
    const stats = await fs.stat(filePath);
    const fileId = Buffer.from(filePath).toString('base64url');
    
    // Remove old terms if file exists
    if (this.index.files[fileId]) {
      const oldTerms = this.tokenize(this.index.files[fileId].content_preview);
      for (const term of oldTerms) {
        this.index.terms[term]?.delete(fileId);
        if (this.index.terms[term]?.size === 0) {
          delete this.index.terms[term];
        }
      }
    }

    // Add new file record
    const fileRecord: FileRecord = {
      id: fileId,
      path: filePath,
      name: path.basename(filePath),
      type: path.extname(filePath).substring(1),
      size: stats.size,
      content_preview: content,
      last_modified: stats.mtimeMs
    };

    this.index.files[fileId] = fileRecord;

    // Index new terms
    const terms = this.tokenize(content);
    for (const term of terms) {
      if (!this.index.terms[term]) {
        this.index.terms[term] = new Set();
      }
      this.index.terms[term].add(fileId);
    }

    // Save index periodically
    if (Object.keys(this.index.files).length % 100 === 0) {
      await this.saveIndex();
    }
  }

  public async search(query: string, limit: number = 50): Promise<FileRecord[]> {
    const terms = this.tokenize(query);
    if (terms.length === 0) return [];

    // Find files that match all terms
    const matchingSets = terms
      .map(term => this.index.terms[term])
      .filter(set => set !== undefined);

    if (matchingSets.length === 0) return [];

    // Start with the smallest set for better performance
    matchingSets.sort((a, b) => a.size - b.size);
    let matches = Array.from(matchingSets[0]);

    // Intersect with other sets
    for (let i = 1; i < matchingSets.length; i++) {
      matches = matches.filter(id => matchingSets[i].has(id));
    }

    // Convert to file records and sort by last modified
    return matches
      .map(id => this.index.files[id])
      .sort((a, b) => b.last_modified - a.last_modified)
      .slice(0, limit);
  }

  public async removeFile(filePath: string): Promise<void> {
    const fileId = Buffer.from(filePath).toString('base64url');
    const file = this.index.files[fileId];
    
    if (file) {
      const terms = this.tokenize(file.content_preview);
      for (const term of terms) {
        this.index.terms[term]?.delete(fileId);
        if (this.index.terms[term]?.size === 0) {
          delete this.index.terms[term];
        }
      }
      delete this.index.files[fileId];
      await this.saveIndex();
    }
  }

  public isReady(): boolean {
    return this.ready;
  }
}

export const searchStore = SearchStore.getInstance(); 