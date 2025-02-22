import { environment } from '@raycast/api';
import path from 'path';
import fs from 'fs/promises';

interface MCPFileContent {
  content: string;
  encoding: string;
  size: number;
}

class MCPService {
  private static instance: MCPService;

  private constructor() {}

  public static getInstance(): MCPService {
    if (!MCPService.instance) {
      MCPService.instance = new MCPService();
    }
    return MCPService.instance;
  }

  public async readFile(filePath: string): Promise<MCPFileContent> {
    try {
      // TODO: Replace with actual MCP file reading
      // For now, use fs.readFile as fallback
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        content,
        encoding: 'utf-8',
        size: Buffer.byteLength(content)
      };
    } catch (error) {
      console.error(`Failed to read file ${filePath}:`, error);
      throw error;
    }
  }

  public async isTextFile(filePath: string): Promise<boolean> {
    const textExtensions = [
      '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx',
      '.html', '.css', '.scss', '.yaml', '.yml', '.xml',
      '.csv', '.log', '.conf', '.ini', '.sh', '.bash',
      '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h',
      '.hpp', '.cs', '.go', '.rs', '.swift', '.kt', '.kts',
      '.gradle', '.properties', '.env', '.sql', '.graphql'
    ];
    
    const ext = path.extname(filePath).toLowerCase();
    return textExtensions.includes(ext);
  }
}

export const mcpService = MCPService.getInstance(); 