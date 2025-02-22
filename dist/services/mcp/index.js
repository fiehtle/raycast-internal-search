"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcpService = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
class MCPService {
    constructor() { }
    static getInstance() {
        if (!MCPService.instance) {
            MCPService.instance = new MCPService();
        }
        return MCPService.instance;
    }
    async readFile(filePath) {
        try {
            // TODO: Replace with actual MCP file reading
            // For now, use fs.readFile as fallback
            const content = await promises_1.default.readFile(filePath, 'utf-8');
            return {
                content,
                encoding: 'utf-8',
                size: Buffer.byteLength(content)
            };
        }
        catch (error) {
            console.error(`Failed to read file ${filePath}:`, error);
            throw error;
        }
    }
    async isTextFile(filePath) {
        const textExtensions = [
            '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx',
            '.html', '.css', '.scss', '.yaml', '.yml', '.xml',
            '.csv', '.log', '.conf', '.ini', '.sh', '.bash',
            '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h',
            '.hpp', '.cs', '.go', '.rs', '.swift', '.kt', '.kts',
            '.gradle', '.properties', '.env', '.sql', '.graphql'
        ];
        const ext = path_1.default.extname(filePath).toLowerCase();
        return textExtensions.includes(ext);
    }
}
exports.mcpService = MCPService.getInstance();
