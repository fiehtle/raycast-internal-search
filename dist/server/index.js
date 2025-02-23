import express from 'express';
import { mcpService } from '../services/mcp/index.js';
const app = express();
const BASE_PORT = 49152;
const MAX_PORT_TRIES = 10;
let currentPort = null;
// Fuzzy search function
function fuzzySearch(text, query) {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    // Exact match gets highest score
    if (textLower.includes(queryLower)) {
        return { match: true, score: 1.0 };
    }
    // Split query into characters for fuzzy matching
    const chars = queryLower.split('');
    let lastFoundIndex = -1;
    let score = 0;
    let matchCount = 0;
    // Check if characters appear in sequence
    for (const char of chars) {
        const index = textLower.indexOf(char, lastFoundIndex + 1);
        if (index > -1) {
            matchCount++;
            // Score is higher for matches closer together
            score += 1 - (index - lastFoundIndex - 1) / textLower.length;
            lastFoundIndex = index;
        }
    }
    // Calculate final score based on matches and their positions
    const matchRatio = matchCount / chars.length;
    const finalScore = matchRatio * (score / chars.length);
    // Consider it a match if we found at least 60% of characters in sequence
    return { match: matchRatio >= 0.6, score: finalScore };
}
// Middleware
app.use(express.json());
// Routes
app.get('/health', async (req, res) => {
    res.json({ status: 'ok' });
});
app.get('/files', async (req, res) => {
    try {
        const files = await mcpService.listFiles();
        res.json({ files });
    }
    catch (error) {
        console.error('Error listing files:', error);
        res.status(500).json({ error: 'Failed to list files' });
    }
});
app.get('/file', async (req, res) => {
    try {
        const { path } = req.query;
        if (!path || typeof path !== 'string') {
            res.status(400).json({ error: 'Path is required' });
            return;
        }
        const content = await mcpService.readFile(path);
        res.json(content);
    }
    catch (error) {
        console.error('Error reading file:', error);
        res.status(500).json({ error: 'Failed to read file' });
    }
});
app.post('/search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query || typeof query !== 'string') {
            res.status(400).json({ error: 'Search query is required' });
            return;
        }
        const files = await mcpService.listFiles();
        const results = [];
        for (const filePath of files) {
            const fileName = filePath.split('/').pop() || '';
            const ext = '.' + (filePath.split('.').pop() || '').toLowerCase();
            // Try fuzzy filename match first
            const fuzzyResult = fuzzySearch(fileName, query);
            if (fuzzyResult.match) {
                results.push({
                    path: filePath,
                    name: fileName,
                    type: ext.slice(1).toUpperCase() || 'FILE',
                    matchType: 'filename',
                    score: fuzzyResult.score
                });
                continue;
            }
            // Then try content match for text files
            if (await mcpService.isTextFile(filePath)) {
                try {
                    const fileContent = await mcpService.readFile(filePath);
                    // Use both exact and fuzzy matching on content
                    const contentMatch = fileContent.content.toLowerCase().includes(query.toLowerCase());
                    const fuzzyContentResult = fuzzySearch(fileContent.content, query);
                    if (contentMatch || fuzzyContentResult.match) {
                        results.push({
                            path: filePath,
                            name: fileName,
                            type: ext.slice(1).toUpperCase() || 'FILE',
                            content: fileContent.content,
                            matchType: 'content',
                            score: contentMatch ? 1.0 : fuzzyContentResult.score
                        });
                    }
                }
                catch (err) {
                    console.error(`Error reading file ${filePath}:`, err);
                }
            }
        }
        // Sort results by score (highest first)
        results.sort((a, b) => b.score - a.score);
        res.json({ results });
    }
    catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});
// Start the server
export async function startServer() {
    let lastError = null;
    for (let port = BASE_PORT; port < BASE_PORT + MAX_PORT_TRIES; port++) {
        try {
            await new Promise((resolve, reject) => {
                const server = app.listen(port)
                    .once('listening', () => {
                    currentPort = port;
                    console.log(`File Search Server running on port ${port}`);
                    resolve();
                })
                    .once('error', (err) => {
                    reject(err);
                });
            });
            return; // Server started successfully
        }
        catch (error) {
            lastError = error;
            console.log(`Port ${port} is in use, trying next port...`);
            continue;
        }
    }
    throw new Error(`Failed to start server: ${lastError?.message || 'No available ports'}`);
}
export function getPort() {
    return currentPort;
}
// Start server if this file is run directly
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
    startServer().catch(console.error);
}
