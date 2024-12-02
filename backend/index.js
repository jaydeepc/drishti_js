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

// Function to decode base64 image
function decodeBase64Image(dataString) {
    const matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches.length !== 3) {
        throw new Error('Invalid base64 string');
    }

    const type = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');

    return {
        type,
        buffer
    };
}

async function loadModels() {
    try {
        const modelPath = path.join(__dirname, 'models');
        
        // Load models sequentially
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
        console.log('Loaded face detection model');
        
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
        console.log('Loaded landmark detection model');
        
        await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
        console.log('Loaded face recognition model');
        
        console.log('All face detection models loaded successfully');
    } catch (error) {
        console.error('Error loading face detection models:', error);
        throw error;
    }
}

async function detectFaceAndExtract(imageData, isIDCard = false) {
    try {
        // Decode base64 image
        const decodedImage = decodeBase64Image(imageData);
        
        // Save temporary file
        const tempFilePath = path.join(__dirname, 'uploads', `temp_${Date.now()}.jpg`);
        fs.writeFileSync(tempFilePath, decodedImage.buffer);
        
        // Load image using canvas
        const img = await canvas.loadImage(tempFilePath);
        
        // Create detection options
        const options = new faceapi.SsdMobilenetv1Options({
            minConfidence: isIDCard ? 0.1 : 0.2,
            maxResults: 1
        });

        // Detect face with all features
        const fullDetection = await faceapi.detectSingleFace(img, options)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!fullDetection) {
            fs.unlinkSync(tempFilePath);
            throw new Error(`No face detected in the ${isIDCard ? 'ID card' : 'photo'}`);
        }

        // Extract face with margin
        const box = fullDetection.detection.box;
        const margin = Math.floor(Math.max(box.width, box.height) * 0.25);

        // Create canvas for extraction
        const faceCanvas = new Canvas(
            box.width + (margin * 2),
            box.height + (margin * 2)
        );
        const ctx = faceCanvas.getContext('2d');

        // Draw the face region with margin
        ctx.drawImage(
            img,
            Math.max(0, box.x - margin),
            Math.max(0, box.y - margin),
            box.width + (margin * 2),
            box.height + (margin * 2),
            0,
            0,
            box.width + (margin * 2),
            box.height + (margin * 2)
        );

        // Save extracted face
        const extractedFileName = `extracted_${isIDCard ? 'id' : 'photo'}_${Date.now()}.jpg`;
        const extractedFilePath = path.join(__dirname, 'uploads', extractedFileName);
        const buffer = faceCanvas.toBuffer('image/jpeg');
        fs.writeFileSync(extractedFilePath, buffer);

        // Clean up temporary file
        fs.unlinkSync(tempFilePath);

        return {
            detection: fullDetection,
            extractedFilePath: extractedFileName,
            box: {
                x: box.x,
                y: box.y,
                width: box.width,
                height: box.height
            }
        };
    } catch (error) {
        console.error(`Error in detectFaceAndExtract:`, error);
        throw new Error(`Failed to process ${isIDCard ? 'ID card' : 'photo'}: ${error.message}`);
    }
}

function analyzeSimilarity(detection1, detection2) {
    try {
        // Calculate Euclidean distance between face descriptors
        const distance = faceapi.euclideanDistance(
            detection1.descriptor,
            detection2.descriptor
        );

        // Convert distance to confidence percentage (for UI purposes)
        const confidence = Math.max(0, Math.min(100, (1 - distance) * 100));
        
        // Generate analysis based on distance
        const analysis = [];
        
        if (distance < 0.4) {
            analysis.push("Very high confidence match - facial features align strongly");
        } else if (distance < 0.5) {
            analysis.push("High confidence match with some minor variations");
        } else if (distance < 0.6) {
            analysis.push("Possible match but with significant variations");
        } else {
            analysis.push("Faces appear to be different");
        }

        // Add analysis of specific facial features
        const landmarks1 = detection1.landmarks;
        const landmarks2 = detection2.landmarks;
        
        // Compare eye positions
        const eyeDistance1 = faceapi.euclideanDistance(
            landmarks1.getLeftEye()[0],
            landmarks1.getRightEye()[0]
        );
        const eyeDistance2 = faceapi.euclideanDistance(
            landmarks2.getLeftEye()[0],
            landmarks2.getRightEye()[0]
        );
        
        const eyeRatio = Math.min(eyeDistance1, eyeDistance2) / Math.max(eyeDistance1, eyeDistance2);
        
        if (eyeRatio > 0.9) {
            analysis.push("Eye spacing shows strong similarity");
        }
        
        // Compare nose structure
        const noseBridge1 = landmarks1.getNose().slice(0, 4);
        const noseBridge2 = landmarks2.getNose().slice(0, 4);
        const noseDistance = faceapi.euclideanDistance(noseBridge1[0], noseBridge2[0]);
        
        if (noseDistance < 0.2) {
            analysis.push("Nose structure indicates a match");
        }
        
        if (distance >= 0.4) {
            analysis.push("Differences may be due to age, facial hair, glasses, or image quality");
        }
        
        // Determine match based on distance threshold
        const match = distance < 0.4; // Using 0.4 as the strict threshold for matching
        
        return {
            match,
            distance,
            confidence: Math.round(confidence * 100) / 100,
            analysis: analysis.join(". ") + "."
        };
    } catch (error) {
        console.error('Error in analyzeSimilarity:', error);
        throw error;
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

app.post('/api/match-faces', express.json({ limit: '10mb' }), async (req, res) => {
    try {
        const { expectedImage, actualImage } = req.body;

        if (!expectedImage || !actualImage) {
            return res.status(400).json({ error: 'Both images are required' });
        }

        console.log('Processing ID card...');
        const idCardResult = await detectFaceAndExtract(expectedImage, true);
        
        console.log('Processing photo...');
        const photoResult = await detectFaceAndExtract(actualImage, false);

        console.log('Analyzing similarity...');
        const { match, confidence, analysis, distance } = analyzeSimilarity(
            idCardResult.detection,
            photoResult.detection
        );

        const baseUrl = `http://localhost:${port}/uploads`;
        const idCardFaceUrl = `${baseUrl}/${idCardResult.extractedFilePath}`;
        const photoFaceUrl = `${baseUrl}/${photoResult.extractedFilePath}`;

        res.json({
            match,
            confidence,
            distance: Math.round(distance * 1000) / 1000,
            analysis,
            message: match ? 'Faces match' : 'Faces do not match',
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
    }
});

startServer();
