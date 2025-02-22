"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchStore = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const sqlite_1 = require("sqlite");
const hnswlib_node_1 = require("hnswlib-node");
const openai_1 = __importDefault(require("openai"));
const mcp_1 = require("../mcp");
const os_1 = __importDefault(require("os"));
const DATA_DIR = path_1.default.join(os_1.default.homedir(), '.raycast-search');
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY
});
class SearchStore {
    constructor() {
        this.ready = false;
        this.dimension = 1536; // OpenAI's text-embedding-3-small dimension
        this.dbPath = path_1.default.join(DATA_DIR, 'search.db');
    }
    static getInstance() {
        if (!SearchStore.instance) {
            SearchStore.instance = new SearchStore();
        }
        return SearchStore.instance;
    }
    async initializeDb() {
        await promises_1.default.mkdir(DATA_DIR, { recursive: true });
        console.log(`Initializing SQLite database at ${this.dbPath}`);
        this.db = await (0, sqlite_1.open)({
            filename: this.dbPath,
            driver: sqlite3_1.default.Database
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
    async initializeHnsw() {
        try {
            // Create HNSW index with cosine similarity
            this.index = new hnswlib_node_1.HierarchicalNSW('cosine', this.dimension);
            // Initialize with default parameters
            this.index.initIndex({
                maxElements: 10000, // Maximum number of elements
                efConstruction: 200, // Higher is more accurate but slower to build
                m: 16 // Use lowercase 'm' instead of 'M'
            });
            console.log('HNSW index ready for use');
        }
        catch (error) {
            console.error('Failed to initialize HNSW:', error);
            throw error;
        }
    }
    async initialize() {
        if (this.ready)
            return;
        try {
            await this.initializeDb();
            await this.initializeHnsw();
            this.ready = true;
            console.log('Search store initialization complete');
        }
        catch (error) {
            console.error('Failed to initialize search store:', error);
            throw error;
        }
    }
    async generateEmbedding(text) {
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
        }
        catch (error) {
            console.error('Failed to generate embedding:', error);
            throw error;
        }
    }
    async addOrUpdateFile(filePath) {
        if (!await mcp_1.mcpService.isTextFile(filePath)) {
            console.log(`Skipping non-text file: ${filePath}`);
            return;
        }
        try {
            const stats = await promises_1.default.stat(filePath);
            const fileId = Buffer.from(filePath).toString('base64url');
            const { content, size } = await mcp_1.mcpService.readFile(filePath);
            // Generate embedding and add to HNSW
            const embedding = await this.generateEmbedding(content);
            const vectorId = this.index.getCurrentCount();
            try {
                // Convert Float32Array to regular array for HNSW
                const vector = Array.from(embedding);
                // Add vector to HNSW index
                this.index.addPoint(vector, vectorId);
                console.log(`Added vector ${vectorId} to HNSW index (dimension: ${this.dimension})`);
            }
            catch (error) {
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
                path_1.default.basename(filePath),
                path_1.default.extname(filePath).substring(1),
                size,
                preview,
                stats.mtimeMs,
                vectorId
            ]);
            console.log(`Indexed file ${filePath} with vector ID ${vectorId}`);
        }
        catch (error) {
            console.error(`Failed to process file ${filePath}:`, error);
            throw error;
        }
    }
    async search(query, limit = 50) {
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
          ORDER BY CASE vector_id ${neighbors.map((l, i) => `WHEN ${l} THEN ${i}`).join(' ')} END
          LIMIT ?
        `, [...neighbors, limit]);
                return records.map((record, i) => ({
                    ...record,
                    score: 1 - distances[i] // Convert cosine distance to similarity score
                }));
            }
            catch (error) {
                console.error('Failed to search HNSW:', error);
                throw new Error(`Failed to search HNSW: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        catch (error) {
            console.error('Error in search:', error);
            throw error;
        }
    }
    async removeFile(filePath) {
        const fileId = Buffer.from(filePath).toString('base64url');
        await this.db.run('DELETE FROM files WHERE id = ?', fileId);
        console.log(`Removed file ${filePath} from database`);
    }
    isReady() {
        return this.ready;
    }
}
SearchStore.instance = null;
exports.searchStore = SearchStore.getInstance();
