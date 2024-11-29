import { useState } from 'react';
import axios from 'axios';

const FaceMatching = () => {
    const [expectedImage, setExpectedImage] = useState(null);
    const [actualImage, setActualImage] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleImageChange = (e, type) => {
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

            if (type === 'expected') {
                setExpectedImage(file);
            } else {
                setActualImage(file);
            }
            setError(null);
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

        const formData = new FormData();
        formData.append('expectedImage', expectedImage);
        formData.append('actualImage', actualImage);

        try {
            const response = await axios.post('http://localhost:3001/api/match-faces', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                }
            });
            setResult(response.data);
        } catch (error) {
            setError(error.response?.data?.error || 'Error processing images');
        } finally {
            setLoading(false);
        }
    };

    const getConfidenceColor = (confidence) => {
        if (confidence >= 80) return '#28a745'; // Green for high confidence
        if (confidence >= 50) return '#ffc107'; // Yellow for medium confidence
        if (confidence >= 35) return '#fd7e14'; // Orange for borderline
        return '#dc3545'; // Red for low confidence
    };

    const renderImageWithBox = (imageFile, box) => {
        if (!imageFile || !box) return null;

        return (
            <div className="image-with-box" style={{ position: 'relative', display: 'inline-block' }}>
                <img
                    src={URL.createObjectURL(imageFile)}
                    alt="Original"
                    style={{ maxWidth: '100%', height: 'auto' }}
                />
                <div
                    style={{
                        position: 'absolute',
                        left: `${(box.x / imageFile.width) * 100}%`,
                        top: `${(box.y / imageFile.height) * 100}%`,
                        width: `${(box.width / imageFile.width) * 100}%`,
                        height: `${(box.height / imageFile.height) * 100}%`,
                        border: '2px solid #00ff00',
                        boxSizing: 'border-box'
                    }}
                />
            </div>
        );
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
                                    src={URL.createObjectURL(expectedImage)}
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
                                    src={URL.createObjectURL(actualImage)}
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

            {error && <div className="error">{error}</div>}
            
            {result && (
                <div className={`result ${result.match ? 'match' : 'no-match'}`}>
                    <h3>Results</h3>
                    
                    <div className="detected-faces">
                        <div className="face-container">
                            <h4>Detected Face in ID Card</h4>
                            {result.idCardFace && (
                                <>
                                    <div className="original-image">
                                        {renderImageWithBox(expectedImage, result.idCardFace.box)}
                                    </div>
                                    <div className="extracted-face">
                                        <img src={result.idCardFace.url} alt="Extracted ID Card Face" />
                                    </div>
                                </>
                            )}
                        </div>
                        
                        <div className="face-container">
                            <h4>Detected Face in Photo</h4>
                            {result.photoFace && (
                                <>
                                    <div className="original-image">
                                        {renderImageWithBox(actualImage, result.photoFace.box)}
                                    </div>
                                    <div className="extracted-face">
                                        <img src={result.photoFace.url} alt="Extracted Photo Face" />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="result-content">
                        <div className="confidence-meter">
                            <div 
                                className="confidence-bar"
                                style={{
                                    width: `${result.confidence}%`,
                                    backgroundColor: getConfidenceColor(result.confidence)
                                }}
                            />
                        </div>
                        <p className="confidence-text">
                            Match Confidence: {result.confidence.toFixed(1)}%
                        </p>
                        <p className="match-message">{result.message}</p>
                        <div className="analysis-section">
                            <h4>Analysis Details</h4>
                            <p className="analysis-text">{result.analysis}</p>
                            <p className="threshold-info">
                                Required confidence for match: {result.threshold}%
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FaceMatching;
