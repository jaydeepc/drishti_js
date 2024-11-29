import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as faceapi from 'face-api.js';
import canvas from 'canvas';
const { Canvas, Image, ImageData } = canvas;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure face-api.js to use canvas
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const app = express();
const port = 3001;

// Enable CORS
app.use(cors());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for handling file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

async function loadModels() {
    try {
        const modelPath = path.join(__dirname, 'models');
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
        console.log('Face detection models loaded successfully');
    } catch (error) {
        console.error('Error loading face detection models:', error);
        throw error;
    }
}

async function extractFaceFromIDCard(imagePath) {
    try {
        const img = await canvas.loadImage(imagePath);
        const { width, height } = img;
        
        const detectCanvas = new Canvas(width, height);
        const ctx = detectCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const detections = await faceapi.detectAllFaces(detectCanvas, 
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
            .withFaceLandmarks()
            .withFaceDescriptors();

        if (!detections || detections.length === 0) {
            throw new Error('No face found in the ID card image');
        }

        let bestFace = detections[0];
        let largestArea = 0;

        for (const detection of detections) {
            const box = detection.detection.box;
            const area = box.width * box.height;
            if (area > largestArea) {
                largestArea = area;
                bestFace = detection;
            }
        }

        const box = bestFace.detection.box;
        const margin = {
            x: box.width * 0.4,
            y: box.height * 0.4
        };
        
        const extractCanvas = new Canvas(
            box.width + (margin.x * 2),
            box.height + (margin.y * 2)
        );
        const extractCtx = extractCanvas.getContext('2d');
        
        extractCtx.drawImage(
            detectCanvas,
            Math.max(0, box.x - margin.x),
            Math.max(0, box.y - margin.y),
            box.width + (margin.x * 2),
            box.height + (margin.y * 2),
            0,
            0,
            box.width + (margin.x * 2),
            box.height + (margin.y * 2)
        );

        const extractedFileName = `extracted_id_${Date.now()}.jpg`;
        const extractedFilePath = path.join(uploadsDir, extractedFileName);
        const buffer = extractCanvas.toBuffer('image/jpeg');
        fs.writeFileSync(extractedFilePath, buffer);

        return {
            detection: bestFace,
            extractedFilePath: extractedFileName,
            box: {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height
            }
        };
    } catch (error) {
        throw new Error(`Failed to extract face from ID card: ${error.message}`);
    }
}

async function detectFaceInPhoto(imagePath) {
    try {
        const img = await canvas.loadImage(imagePath);
        const { width, height } = img;
        
        const detectCanvas = new Canvas(width, height);
        const ctx = detectCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const detection = await faceapi.detectSingleFace(detectCanvas,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            throw new Error('No face detected in the photo');
        }

        const box = detection.detection.box;
        const margin = {
            x: box.width * 0.4,
            y: box.height * 0.4
        };
        
        const extractCanvas = new Canvas(
            box.width + (margin.x * 2),
            box.height + (margin.y * 2)
        );
        const extractCtx = extractCanvas.getContext('2d');
        
        extractCtx.drawImage(
            detectCanvas,
            Math.max(0, box.x - margin.x),
            Math.max(0, box.y - margin.y),
            box.width + (margin.x * 2),
            box.height + (margin.y * 2),
            0,
            0,
            box.width + (margin.x * 2),
            box.height + (margin.y * 2)
        );

        const extractedFileName = `extracted_photo_${Date.now()}.jpg`;
        const extractedFilePath = path.join(uploadsDir, extractedFileName);
        const buffer = extractCanvas.toBuffer('image/jpeg');
        fs.writeFileSync(extractedFilePath, buffer);

        return {
            detection,
            extractedFilePath: extractedFileName,
            box: {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height
            }
        };
    } catch (error) {
        throw new Error(`Failed to detect face in photo: ${error.message}`);
    }
}

function analyzeFacialFeatures(detection1, detection2) {
    const landmarks1 = detection1.landmarks;
    const landmarks2 = detection2.landmarks;
    
    // Analyze key facial features that are more stable across age
    const eyeDistance1 = faceapi.euclideanDistance(
        landmarks1.getLeftEye()[0],
        landmarks1.getRightEye()[0]
    );
    const eyeDistance2 = faceapi.euclideanDistance(
        landmarks2.getLeftEye()[0],
        landmarks2.getRightEye()[0]
    );

    const noseBridge1 = landmarks1.getNose().slice(0, 4);
    const noseBridge2 = landmarks2.getNose().slice(0, 4);
    const noseShape = faceapi.euclideanDistance(
        noseBridge1[0],
        noseBridge2[0]
    );

    const jawline1 = landmarks1.getJawOutline();
    const jawline2 = landmarks2.getJawOutline();
    const jawShape = faceapi.euclideanDistance(
        jawline1[0],
        jawline2[0]
    );

    return {
        eyeRatio: Math.min(eyeDistance1, eyeDistance2) / Math.max(eyeDistance1, eyeDistance2),
        noseMatch: noseShape < 0.3,
        jawMatch: jawShape < 0.4
    };
}

function calculateSimilarity(detection1, detection2) {
    try {
        // Calculate base similarity using face descriptors
        const distance = faceapi.euclideanDistance(
            detection1.descriptor,
            detection2.descriptor
        );
        
        // Analyze facial features
        const features = analyzeFacialFeatures(detection1, detection2);
        
        // Calculate weighted similarity score
        let similarity = Math.exp(-distance * 2) * 100;
        
        // Boost similarity based on stable facial features
        if (features.eyeRatio > 0.85) similarity *= 1.2;
        if (features.noseMatch) similarity *= 1.15;
        if (features.jawMatch) similarity *= 1.1;
        
        // Cap at 100%
        similarity = Math.min(100, similarity);
        
        // Generate analysis message
        const analysis = [];
        if (distance > 0.6) {
            analysis.push("Significant differences detected in overall facial features");
        } else if (distance > 0.4) {
            analysis.push("Moderate differences in facial features, possibly due to aging or pose");
        }
        
        if (features.eyeRatio > 0.85) {
            analysis.push("Eye spacing ratio matches well");
        }
        if (features.noseMatch) {
            analysis.push("Nose structure shows strong similarity");
        }
        if (features.jawMatch) {
            analysis.push("Jaw structure indicates possible match");
        }
        
        // Round to 2 decimal places
        return {
            similarity: Math.round(similarity * 100) / 100,
            analysis: analysis.join(". ") + "."
        };
    } catch (error) {
        throw new Error(`Error calculating similarity: ${error.message}`);
    }
}

async function startServer() {
    try {
        await loadModels();
        app.listen(port, () => {
            console.log(`Face matching service running at http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

app.post('/api/match-faces', upload.fields([
    { name: 'expectedImage', maxCount: 1 },
    { name: 'actualImage', maxCount: 1 }
]), async (req, res) => {
    const uploadedFiles = [];
    try {
        if (!req.files || !req.files.expectedImage || !req.files.actualImage) {
            return res.status(400).json({ error: 'Both images are required' });
        }

        const expectedImagePath = req.files.expectedImage[0].path;
        const actualImagePath = req.files.actualImage[0].path;
        
        uploadedFiles.push(expectedImagePath, actualImagePath);

        console.log('Extracting face from ID card...');
        const idCardResult = await extractFaceFromIDCard(expectedImagePath);
        
        console.log('Detecting face in photo...');
        const photoResult = await detectFaceInPhoto(actualImagePath);

        console.log('Calculating similarity...');
        const { similarity, analysis } = calculateSimilarity(
            idCardResult.detection,
            photoResult.detection
        );
        
        // Lower threshold and consider analysis
        const threshold = 35;
        const match = similarity >= threshold;

        const baseUrl = `http://localhost:${port}/uploads`;
        const idCardFaceUrl = `${baseUrl}/${idCardResult.extractedFilePath}`;
        const photoFaceUrl = `${baseUrl}/${photoResult.extractedFilePath}`;

        res.json({
            match,
            confidence: similarity,
            analysis,
            message: match ? 'Faces match' : 'Faces do not match',
            threshold,
            idCardFace: {
                url: idCardFaceUrl,
                box: idCardResult.box
            },
            photoFace: {
                url: photoFaceUrl,
                box: photoResult.box
            }
        });

    } catch (error) {
        console.error('Error processing images:', error);
        res.status(500).json({ 
            error: error.message || 'Error processing images'
        });
    } finally {
        uploadedFiles.forEach(filePath => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (e) {
                console.error(`Error deleting file ${filePath}:`, e);
            }
        });
    }
});

startServer();
