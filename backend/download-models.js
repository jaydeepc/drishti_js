import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MODELS_DIR = path.join(__dirname, 'models');

// Create models directory if it doesn't exist
if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR);
}

const MODELS_URLS = [
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-weights_manifest.json',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard1',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/ssd_mobilenetv1_model-shard2',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-weights_manifest.json',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_landmark_68_model-shard1',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-weights_manifest.json',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard1',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/face_recognition_model-shard2',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-weights_manifest.json',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/tiny_face_detector_model-shard1'
];

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }

            const file = fs.createWriteStream(destPath);
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });

            file.on('error', (err) => {
                fs.unlink(destPath, () => reject(err));
            });
        }).on('error', reject);
    });
}

async function downloadModels() {
    console.log('Downloading face-api.js models...');
    
    for (const url of MODELS_URLS) {
        const fileName = path.basename(url);
        const destPath = path.join(MODELS_DIR, fileName);
        
        console.log(`Downloading ${fileName}...`);
        await downloadFile(url, destPath);
        console.log(`Downloaded ${fileName}`);
    }
    
    console.log('All models downloaded successfully!');
}

downloadModels().catch(console.error);
