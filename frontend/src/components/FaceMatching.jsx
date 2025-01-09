import { useState } from 'react';
import axios from 'axios';
import './FaceMatching.css';

const FaceMatching = () => {
    const [expectedImage, setExpectedImage] = useState(null);
    const [actualImage, setActualImage] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const convertToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
        });
    };

    const handleImageChange = async (e, type) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                setError('Please upload only image files');
                return;
            }
            
            if (file.size > 5 * 1024 * 1024) {
                setError('Image size should be less than 5MB');
                return;
            }

            try {
                const base64Image = await convertToBase64(file);
                
                if (type === 'expected') {
                    setExpectedImage({
                        file,
                        base64: base64Image,
                        preview: URL.createObjectURL(file)
                    });
                } else {
                    setActualImage({
                        file,
                        base64: base64Image,
                        preview: URL.createObjectURL(file)
                    });
                }
                setError(null);
            } catch (err) {
                setError('Error processing image');
                console.error('Error converting image to base64:', err);
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!expectedImage || !actualImage) {
            setError('Please select both images');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const response = await axios.post('http://localhost:3002/api/match-faces', {
                expectedImage: expectedImage.base64,
                actualImage: actualImage.base64
            }, {
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            setResult(response.data);
        } catch (err) {
            console.error('API Error:', err.response?.data);
            
            if (err.response?.data?.detail) {
                const detail = err.response.data.detail;
                if (typeof detail === 'object') {
                    setError(
                        <div className="error-details">
                            <div className="error-message">
                                {detail.error || 'An error occurred during processing'}
                            </div>
                            {detail.traceback && (
                                <div className="error-technical">
                                    <details>
                                        <summary>Technical Details</summary>
                                        <pre>{detail.traceback}</pre>
                                    </details>
                                </div>
                            )}
                        </div>
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
        } finally {
            setLoading(false);
        }
    };

    const getMatchStatus = (confidence) => {
        if (confidence > 85) {
            return { 
                color: '#28a745',
                text: 'Very High Confidence Match',
                message: 'Very strong match with consistent core facial features'
            };
        }
        if (confidence > 70) {
            return { 
                color: '#20c997',
                text: 'High Confidence Match',
                message: 'High confidence match - facial features align strongly'
            };
        }
        if (confidence > 60) {
            return { 
                color: '#ffc107',
                text: 'Possible Match',
                message: 'Core facial features show similarity despite differences'
            };
        }
        if (confidence > 40) {
            return { 
                color: '#fd7e14',
                text: 'Low Confidence Match',
                message: 'Possible match with some variations'
            };
        }
        return { 
            color: '#dc3545',
            text: 'No Match',
            message: 'Significant differences in key facial features'
        };
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
                                accept="image/*"
                                onChange={(e) => handleImageChange(e, 'expected')}
                            />
                        </label>
                        {expectedImage && (
                            <div className="preview-container">
                                <img
                                    src={expectedImage.preview}
                                    alt="Reference"
                                    className="preview"
                                />
                                <button 
                                    type="button" 
                                    className="remove-image"
                                    onClick={() => setExpectedImage(null)}
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
                                accept="image/*"
                                onChange={(e) => handleImageChange(e, 'actual')}
                            />
                        </label>
                        {actualImage && (
                            <div className="preview-container">
                                <img
                                    src={actualImage.preview}
                                    alt="Current"
                                    className="preview"
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
                    disabled={loading || !expectedImage || !actualImage}
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
                    
                    <div className="detected-faces">
                        <div className="face-container">
                            <h4>Detected Face in ID Card</h4>
                            {result.idCardFace && (
                                <>
                                    <div className="original-image">
                                        <img
                                            src={expectedImage.preview}
                                            alt="Original ID"
                                            style={{ maxWidth: '100%', height: 'auto' }}
                                        />
                                    </div>
                                    <div className="extracted-face">
                                        <img 
                                            src={`http://localhost:3002${result.idCardFace.url}`} 
                                            alt="Extracted ID Card Face" 
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        
                        <div className="face-container">
                            <h4>Detected Face in Photo</h4>
                            {result.photoFace && (
                                <>
                                    <div className="original-image">
                                        <img
                                            src={actualImage.preview}
                                            alt="Original Photo"
                                            style={{ maxWidth: '100%', height: 'auto' }}
                                        />
                                    </div>
                                    <div className="extracted-face">
                                        <img 
                                            src={`http://localhost:3002${result.photoFace.url}`} 
                                            alt="Extracted Photo Face" 
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="result-content">
                        <div className="match-status" style={{
                            backgroundColor: getMatchStatus(result.confidence).color,
                            color: 'white',
                            padding: '15px',
                            borderRadius: '8px',
                            textAlign: 'center',
                            marginBottom: '20px',
                            fontSize: '1.2em',
                            fontWeight: 'bold'
                        }}>
                            {getMatchStatus(result.confidence).text}
                            <div style={{ fontSize: '0.8em', marginTop: '5px' }}>
                                Confidence: {result.confidence}%
                            </div>
                        </div>
                        
                        <div className="analysis-section">
                            <h4>Analysis Details</h4>
                            <p className="analysis-text">{getMatchStatus(result.confidence).message}</p>
                            {result.confidence > 40 && result.confidence <= 70 && (
                                <p className="analysis-text">
                                    Differences may be due to age, expression, lighting, or angle.
                                    {result.confidence > 60 && (
                                        " Despite variations, underlying facial structure shows consistency."
                                    )}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FaceMatching;
