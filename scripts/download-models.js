const fs = require('fs');
const path = require('path');
const https = require('https');

const MODELS = {
  'all-MiniLM-L6-v2.onnx': 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/model.onnx',
  'bert-base-uncased.json': 'https://huggingface.co/bert-base-uncased/resolve/main/tokenizer.json'
};

const assetsDir = path.join(__dirname, '..', 'assets');

// Create assets directory if it doesn't exist
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir);
}

// Download function
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', err => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// Download all models
async function downloadModels() {
  console.log('Downloading model files...');
  
  for (const [filename, url] of Object.entries(MODELS)) {
    const dest = path.join(assetsDir, filename);
    console.log(`Downloading ${filename}...`);
    await downloadFile(url, dest);
    console.log(`Downloaded ${filename}`);
  }
  
  console.log('All models downloaded successfully!');
}

downloadModels().catch(console.error); 