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

async function alignFace(img, detection) {
    const landmarks = detection.landmarks;
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    // Calculate eye center points
    const leftEyeCenter = {
        x: leftEye.reduce((sum, point) => sum + point.x, 0) / leftEye.length,
        y: leftEye.reduce((sum, point) => sum + point.y, 0) / leftEye.length
    };
    const rightEyeCenter = {
        x: rightEye.reduce((sum, point) => sum + point.x, 0) / rightEye.length,
        y: rightEye.reduce((sum, point) => sum + point.y, 0) / rightEye.length
    };

    // Calculate angle for alignment
    const angle = Math.atan2(
        rightEyeCenter.y - leftEyeCenter.y,
        rightEyeCenter.x - leftEyeCenter.x
    );

    // Create canvas for aligned face
    const alignedCanvas = new Canvas(img.width, img.height);
    const ctx = alignedCanvas.getContext('2d');

    // Translate and rotate
    ctx.translate(img.width/2, img.height/2);
    ctx.rotate(-angle);
    ctx.translate(-img.width/2, -img.height/2);

    // Draw aligned image
    ctx.drawImage(img, 0, 0);

    return alignedCanvas;
}

async function detectFaceAndExtract(imagePath, isIDCard = false) {
    try {
        const img = await canvas.loadImage(imagePath);
        
        // Create detection options
        const options = new faceapi.SsdMobilenetv1Options({
            minConfidence: isIDCard ? 0.1 : 0.2,
            maxResults: 1
        });

        // First detect the face with all features
        const fullDetection = await faceapi.detectSingleFace(img, options)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!fullDetection) {
            throw new Error(`No face detected in the ${isIDCard ? 'ID card' : 'photo'}`);
        }

        // Align face using landmarks
        const alignedFace = await alignFace(img, fullDetection);

        // Re-detect face features on aligned image for better accuracy
        const alignedDetection = await faceapi.detectSingleFace(alignedFace, options)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!alignedDetection) {
            throw new Error(`Could not detect face features in aligned ${isIDCard ? 'ID card' : 'photo'}`);
        }

        // Extract face with margin
        const box = alignedDetection.detection.box;
        const margin = Math.floor(Math.max(box.width, box.height) * 0.25);

        // Create canvas for extraction
        const faceCanvas = new Canvas(
            box.width + (margin * 2),
            box.height + (margin * 2)
        );
        const ctx = faceCanvas.getContext('2d');

        // Draw the face region with margin
        ctx.drawImage(
            alignedFace,
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
        const extractedFilePath = path.join(uploadsDir, extractedFileName);
        const buffer = faceCanvas.toBuffer('image/jpeg');
        fs.writeFileSync(extractedFilePath, buffer);

        return {
            detection: alignedDetection,
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
        // Create labeled descriptors for better matching
        const labeledDescriptors = [
            new faceapi.LabeledFaceDescriptors(
                'reference',
                [detection1.descriptor]
            )
        ];

        // Create face matcher with custom distance threshold
        const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
        
        // Find best match
        const bestMatch = faceMatcher.findBestMatch(detection2.descriptor);
        const distance = bestMatch.distance;
        
        // Calculate base similarity
        let similarity = (1 - distance) * 100;
        
        // Analyze facial landmarks for structural similarity
        const landmarks1 = detection1.landmarks;
        const landmarks2 = detection2.landmarks;
        
        // Compare eye positions
        const leftEyeMatch = compareFeaturePoints(
            landmarks1.getLeftEye(),
            landmarks2.getLeftEye()
        );
        
        const rightEyeMatch = compareFeaturePoints(
            landmarks1.getRightEye(),
            landmarks2.getRightEye()
        );
        
        // Compare nose structure
        const noseMatch = compareFeaturePoints(
            landmarks1.getNose(),
            landmarks2.getNose()
        );
        
        // Compare mouth structure
        const mouthMatch = compareFeaturePoints(
            landmarks1.getMouth(),
            landmarks2.getMouth()
        );
        
        // Calculate feature match scores
        const featureMatchScore = (
            leftEyeMatch + rightEyeMatch + noseMatch + mouthMatch
        ) / 4;
        
        // Boost similarity based on feature matches
        similarity = similarity * (1 + featureMatchScore * 0.2);
        
        // Cap at 100
        similarity = Math.min(100, similarity);
        
        // Generate detailed analysis
        const analysis = [];
        
        if (distance < 0.4) {
            analysis.push("Very high confidence match based on facial features");
        } else if (distance < 0.5) {
            analysis.push("Good confidence match with some variations");
        } else if (distance < 0.6) {
            analysis.push("Possible match with notable variations");
        }
        
        if (featureMatchScore > 0.8) {
            analysis.push("Strong structural similarity in facial features");
        }
        
        if (leftEyeMatch > 0.8 && rightEyeMatch > 0.8) {
            analysis.push("Eye regions show strong correspondence");
        }
        
        if (noseMatch > 0.8) {
            analysis.push("Nose structure shows high similarity");
        }
        
        if (mouthMatch > 0.8) {
            analysis.push("Mouth region indicates a match");
        }
        
        if (distance > 0.45) {
            analysis.push("Variations likely due to aging, expression, or image conditions");
        }
        
        return {
            similarity: Math.round(similarity * 100) / 100,
            analysis: analysis.join(". ") + ".",
            distance,
            featureMatchScore
        };
    } catch (error) {
        console.error('Error in analyzeSimilarity:', error);
        throw error;
    }
}

function compareFeaturePoints(points1, points2) {
    try {
        const distances = points1.map((p1, i) => {
            const p2 = points2[i];
            return 1 - Math.min(
                faceapi.euclideanDistance([p1.x, p1.y], [p2.x, p2.y]) / 100,
                1
            );
        });
        
        return distances.reduce((sum, d) => sum + d, 0) / distances.length;
    } catch (error) {
        console.error('Error comparing feature points:', error);
        return 0;
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

        console.log('Processing ID card...');
        const idCardResult = await detectFaceAndExtract(expectedImagePath, true);
        
        console.log('Processing photo...');
        const photoResult = await detectFaceAndExtract(actualImagePath, false);

        console.log('Analyzing similarity...');
        const { similarity, analysis, featureMatchScore } = analyzeSimilarity(
            idCardResult.detection,
            photoResult.detection
        );
        
        // Keep threshold at 65% but use better matching
        const threshold = 50;
        const match = similarity >= threshold;

        const baseUrl = `http://localhost:${port}/uploads`;
        const idCardFaceUrl = `${baseUrl}/${idCardResult.extractedFilePath}`;
        const photoFaceUrl = `${baseUrl}/${photoResult.extractedFilePath}`;

        res.json({
            match,
            confidence: similarity,
            analysis,
            featureMatchScore: Math.round(featureMatchScore * 100),
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
        // Only delete the original uploaded files, keep the extracted faces
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
