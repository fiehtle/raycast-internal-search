import path from 'path';
import { promisify } from 'util';
import { readFile as fsReadFile, stat as fsStat } from 'fs/promises';
import os from 'os';
import { exec } from 'child_process';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { fromFileWithPath } from 'textract';
const execAsync = promisify(exec);
const extractTextFromFile = promisify(fromFileWithPath);
class MCPService {
    constructor() {
        // Use system Downloads folder
        this.downloadsPath = path.join(os.homedir(), 'Downloads');
    }
    static getInstance() {
        if (!MCPService.instance) {
            MCPService.instance = new MCPService();
        }
        return MCPService.instance;
    }
    getDownloadsPath() {
        return this.downloadsPath;
    }
    async extractPDFText(filePath) {
        try {
            const dataBuffer = await fsReadFile(filePath);
            try {
                const data = await pdfParse(dataBuffer);
                return data.text || '';
            }
            catch (parseError) {
                console.error('Error parsing PDF:', parseError);
                // Try to read as plain text if PDF parsing fails
                try {
                    return dataBuffer.toString('utf-8');
                }
                catch (textError) {
                    console.error('Error reading as text:', textError);
                    return '';
                }
            }
        }
        catch (error) {
            console.error('Error reading PDF file:', error);
            return '';
        }
    }
    async extractDocxText(filePath) {
        try {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        }
        catch (error) {
            console.error('Error extracting DOCX text:', error);
            // Fallback to textract if mammoth fails
            try {
                return await extractTextFromFile(filePath);
            }
            catch (fallbackError) {
                console.error('Fallback text extraction failed:', fallbackError);
                return ''; // Return empty string instead of throwing
            }
        }
    }
    async readFile(filePath) {
        try {
            const stats = await fsStat(filePath);
            const ext = path.extname(filePath).toLowerCase();
            let content = '';
            let encoding = 'utf-8';
            try {
                switch (ext) {
                    case '.pdf':
                        content = await this.extractPDFText(filePath);
                        break;
                    case '.docx':
                    case '.doc':
                        content = await this.extractDocxText(filePath);
                        break;
                    case '.txt':
                    case '.md':
                    case '.json':
                    case '.js':
                    case '.ts':
                        content = (await fsReadFile(filePath, 'utf-8')).toString();
                        break;
                    default:
                        // Try textract for other file types
                        try {
                            content = await extractTextFromFile(filePath);
                        }
                        catch (err) {
                            // If textract fails, try simple text reading
                            try {
                                content = (await fsReadFile(filePath, 'utf-8')).toString();
                            }
                            catch (readError) {
                                console.error(`Failed to read file ${filePath}:`, readError);
                                content = '';
                            }
                        }
                }
            }
            catch (error) {
                console.error(`Error reading file content: ${error}`);
                content = ''; // Set empty content but don't fail completely
            }
            return {
                content,
                encoding,
                size: stats.size,
                lastModified: stats.mtime.getTime()
            };
        }
        catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
            throw error;
        }
    }
    async listFiles() {
        try {
            const { stdout } = await execAsync(`find "${this.downloadsPath}" -type f`);
            return stdout.split('\n').filter(Boolean);
        }
        catch (error) {
            console.error('Error listing files:', error);
            throw error;
        }
    }
    async isTextFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const textExtensions = [
            '.txt', '.md', '.json', '.js', '.ts', '.pdf', '.doc', '.docx',
            '.rtf', '.csv', '.xml', '.html', '.htm', '.css', '.scss', '.less',
            '.yaml', '.yml', '.ini', '.conf', '.log', '.env'
        ];
        return textExtensions.includes(ext);
    }
}
export const mcpService = MCPService.getInstance();
