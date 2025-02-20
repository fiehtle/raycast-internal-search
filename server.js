// A simple MCP Filesystem server to scan and search files from your Downloads folder
const express = require('express');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const pdfParse = require('pdf-parse'); // Ensure you installed pdf-parse

const app = express();
const port = 3000;

// Base directory (Downloads folder)
const baseDir = path.join(process.env.HOME, 'Downloads');

// Recursively scan the directory and return all files
async function scanDir(directory) {
  let results = [];
  try {
    const items = await fsPromises.readdir(directory, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(directory, item.name);
      if (item.isDirectory()) {
        // Recursively search subdirectories
        const subResults = await scanDir(fullPath);
        results = results.concat(subResults);
      } else {
        results.push({
          path: fullPath,
          name: item.name,
          type: path.extname(item.name).substring(1) // e.g., "pdf", "txt", "md"
        });
      }
    }
  } catch (err) {
    console.error("Error reading directory:", err);
  }
  return results;
}

// Search endpoint for files: GET /search?q=<query>
// When no query is provided, it returns (up to) 50 files from the Downloads folder.
app.get('/search', async (req, res) => {
  const query = req.query.q ? req.query.q.toLowerCase() : '';
  try {
    const files = await scanDir(baseDir);
    let filteredFiles = files;
    if (query) {
      filteredFiles = files.filter(file => file.name.toLowerCase().includes(query));
    }
    // Return a maximum of 50 files for performance
    res.json({ files: filteredFiles.slice(0, 50) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search files" });
  }
});

// Endpoint to get file content by path: GET /file?path=<fullPath>
// Supports text files and PDFs (reads text directly or extracts text from PDFs)
app.get('/file', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) {
    return res.status(400).json({ error: "Missing file path" });
  }
  // Verify that the requested file is inside the Downloads folder
  if (!filePath.startsWith(baseDir)) {
    return res.status(403).json({ error: "Access denied" });
  }
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      // For PDF files, extract text using pdf-parse
      const dataBuffer = await fsPromises.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      res.json({ content: data.text });
    } else if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.js') {
      // Straight-forward text read (you can add more extensions as needed)
      const content = await fsPromises.readFile(filePath, 'utf8');
      res.json({ content });
    } else {
      res.status(400).json({ error: "Unsupported file type" });
    }
  } catch (err) {
    console.error("Error reading file:", err);
    res.status(500).json({ error: "Failed to read file" });
  }
});

app.listen(port, () => {
  console.log(`MCP Filesystem server is running at http://localhost:${port}`);
}); 