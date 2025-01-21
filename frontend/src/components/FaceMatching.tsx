import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './FaceMatching.css';

interface ImageData {
  file: File;
  base64: string;
  preview: string;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MatchResult {
  match: boolean;
  confidence: number;
  analysis: string;
  result: 'EXACT_MATCH' | 'POSSIBLE_MATCH' | 'NO_MATCH';
  referenceFace: {
    box: Box;
  };
  actualFace: {
    box: Box;
  };
}

interface DetectedFaceProps {
  image: string;
  box: Box;
}

interface MatchStatusProps {
  result: MatchResult['result'];
  confidence: number;
}

interface ErrorDetailsProps {
  error: string;
  traceback?: string;
}

const DetectedFace: React.FC<DetectedFaceProps> = ({ image, box }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const loadImage = async () => {
      const img = new Image();
      img.src = image;
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to match the face box dimensions
        canvas.width = box.width;
        canvas.height = box.height;

        // Draw only the face region
        ctx.drawImage(
          img,
          box.x, box.y,      // Source position
          box.width, box.height,  // Source dimensions
          0, 0,              // Destination position
          box.width, box.height   // Destination dimensions
        );
      };
    };

    loadImage();
  }, [image, box]);

  return (
    <canvas
      ref={canvasRef}
      className="detected-face-canvas"
      style={{
        width: '100%',
        height: 'auto',
        borderRadius: '4px'
      }}
    />
  );
};

const MatchStatus: React.FC<MatchStatusProps> = ({ result, confidence }) => {
  const getMatchStatus = (result: MatchResult['result']) => {
    switch(result) {
      case 'EXACT_MATCH':
        return {
          color: '#28a745',
          text: 'Exact Match'
        };
      case 'POSSIBLE_MATCH':
        return {
          color: '#ffc107',
          text: 'Possible Match'
        };
      case 'NO_MATCH':
      default:
        return {
          color: '#dc3545',
          text: 'No Match'
        };
    }
  };

  const status = getMatchStatus(result);

  return (
    <div className="match-status" style={{
      backgroundColor: status.color,
      color: 'white',
      padding: '15px',
      borderRadius: '8px',
      textAlign: 'center',
      marginBottom: '20px',
      fontSize: '1.2em',
      fontWeight: 'bold'
    }}>
      {status.text}
      <div style={{ fontSize: '0.8em', marginTop: '5px' }}>
        Confidence: {confidence}%
      </div>
    </div>
  );
};

const ErrorDetails: React.FC<ErrorDetailsProps> = ({ error, traceback }) => (
  <div className="error-details">
    <div className="error-message">
      {error}
    </div>
    {traceback && (
      <div className="error-technical">
        <details>
          <summary>Technical Details</summary>
          <pre>{traceback}</pre>
        </details>
      </div>
    )}
  </div>
);

const FaceMatching: React.FC = () => {
  const [referenceImage, setReferenceImage] = useState<ImageData | null>(null);
  const [actualImage, setActualImage] = useState<ImageData | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | React.ReactNode | null>(null);

  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg'];

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        if (!base64String.startsWith('data:image/')) {
          reject(new Error('Invalid image format'));
          return;
        }
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'reference' | 'actual') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!allowedImageTypes.includes(file.type)) {
      setError('Please upload only JPEG or PNG images');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB');
      return;
    }

    try {
      const base64Image = await convertToBase64(file);
      console.log(`Base64 image prefix: ${base64Image.substring(0, 50)}...`);
      
      const imageData: ImageData = {
        file,
        base64: base64Image,
        preview: URL.createObjectURL(file)
      };

      if (type === 'reference') {
        setReferenceImage(imageData);
      } else {
        setActualImage(imageData);
      }
      setError(null);
    } catch (err) {
      setError(`Error processing image: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('Error converting image to base64:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!referenceImage || !actualImage) {
      setError('Please select both images');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await axios.post<MatchResult>('http://localhost:3002/api/match-faces', {
        referenceImage: referenceImage.base64,
        actualImage: actualImage.base64
      }, {
        headers: {
          'Content-Type': 'application/json',
        }
      });
      setResult(response.data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error('API Error:', err.response?.data);
        
        if (err.response?.data?.detail) {
          const detail = err.response.data.detail;
          if (typeof detail === 'object' && detail.error) {
            setError(
              <ErrorDetails 
                error={detail.error} 
                traceback={detail.traceback}
              />
            );
          } else {
            setError(detail);
          }
        } else if (err.response?.status === 413) {
          setError('Image file size is too large. Please use smaller images.');
        } else if (err.response?.status === 415) {
          setError('Unsupported image format. Please use JPEG or PNG images.');
        } else if (!err.response) {
          setError('Network error. Please check your connection and try again.');
        } else {
          setError('An unexpected error occurred. Please try again.');
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="face-matching">
      <h2>Face Matching Service</h2>
      <div className="instructions">
        <p>Upload two images to compare faces:</p>
        <ol>
          <li>First, upload a reference image (e.g., ID card photo)</li>
          <li>Then, upload a current photo to verify against the reference</li>
        </ol>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="image-inputs">
          <div className="input-group">
            <label>
              Reference Photo (ID Card):
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={(e) => handleImageChange(e, 'reference')}
              />
            </label>
            {referenceImage && (
              <div className="preview-container">
                <img
                  src={referenceImage.preview}
                  alt="Reference"
                  className="preview"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
                <button 
                  type="button" 
                  className="remove-image"
                  onClick={() => setReferenceImage(null)}
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <div className="input-group">
            <label>
              Current Photo:
              <input
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                onChange={(e) => handleImageChange(e, 'actual')}
              />
            </label>
            {actualImage && (
              <div className="preview-container">
                <img
                  src={actualImage.preview}
                  alt="Current"
                  className="preview"
                  style={{ maxWidth: '100%', height: 'auto' }}
                />
                <button 
                  type="button" 
                  className="remove-image"
                  onClick={() => setActualImage(null)}
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading || !referenceImage || !actualImage}
          className={loading ? 'loading' : ''}
        >
          {loading ? 'Analyzing...' : 'Compare Faces'}
        </button>
      </form>

      {error && (
        <div className="error-container">
          {typeof error === 'string' ? (
            <div className="error">{error}</div>
          ) : (
            error
          )}
        </div>
      )}
      
      {result && (
        <div className={`result ${result.match ? 'match' : 'no-match'}`}>
          <h3>Results</h3>
          
          <div className="result-content">
            <MatchStatus 
              result={result.result}
              confidence={result.confidence}
            />

            <div className="detected-faces">
              <div className="face-container">
                <h4>Detected Face in Reference Photo</h4>
                <div className="image-wrapper">
                  {referenceImage && (
                    <DetectedFace 
                      image={referenceImage.preview}
                      box={result.referenceFace.box}
                    />
                  )}
                </div>
              </div>
              
              <div className="face-container">
                <h4>Detected Face in Current Photo</h4>
                <div className="image-wrapper">
                  {actualImage && (
                    <DetectedFace 
                      image={actualImage.preview}
                      box={result.actualFace.box}
                    />
                  )}
                </div>
              </div>
            </div>
            
            <div className="analysis-section">
              <h4>Analysis Details</h4>
              <p className="analysis-text">{result.analysis}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FaceMatching;
