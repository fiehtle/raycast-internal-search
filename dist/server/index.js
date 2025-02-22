"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
exports.getPort = getPort;
const express_1 = __importDefault(require("express"));
const net = __importStar(require("net"));
const vector_store_1 = require("../services/vector-store");
const app = (0, express_1.default)();
const BASE_PORT = 49152;
const MAX_PORT_TRIES = 10;
let currentPort = null;
// Middleware
app.use(express_1.default.json());
// Routes
app.post('/index', async (req, res) => {
    try {
        const { path } = req.body;
        if (!path || typeof path !== 'string') {
            res.status(400).json({ error: 'Path is required' });
            return;
        }
        await vector_store_1.searchStore.addOrUpdateFile(path);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error indexing file:', error);
        res.status(500).json({ error: 'Failed to index file' });
    }
});
app.get('/search', async (req, res) => {
    try {
        const query = req.query.q;
        const limit = Number(req.query.limit) || 50;
        if (!query) {
            res.status(400).json({ error: 'Search query is required' });
            return;
        }
        const results = await vector_store_1.searchStore.search(query, limit);
        res.json({ results });
    }
    catch (error) {
        console.error('Error searching:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});
app.delete('/file', async (req, res) => {
    try {
        const { path } = req.body;
        if (!path || typeof path !== 'string') {
            res.status(400).json({ error: 'Path is required' });
            return;
        }
        await vector_store_1.searchStore.removeFile(path);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error removing file:', error);
        res.status(500).json({ error: 'Failed to remove file' });
    }
});
// Find an available port
async function findAvailablePort() {
    for (let port = BASE_PORT; port < BASE_PORT + MAX_PORT_TRIES; port++) {
        try {
            await new Promise((resolve, reject) => {
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
        }
        catch {
            continue;
        }
    }
    throw new Error('No available ports found');
}
// Start the server
async function startServer() {
    try {
        await vector_store_1.searchStore.initialize();
        const port = await findAvailablePort();
        currentPort = port;
        await new Promise((resolve) => {
            app.listen(port, () => {
                console.log(`Server running on port ${port}`);
                resolve();
            });
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        throw error;
    }
}
function getPort() {
    return currentPort;
}
// Start server if this file is run directly
if (require.main === module) {
    startServer().catch(console.error);
}
