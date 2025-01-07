import os
import urllib.request

def download_file(url, filename):
    print(f"Downloading {filename}...")
    urllib.request.urlretrieve(url, filename)
    print(f"Downloaded {filename}")

def main():
    # Create models directory if it doesn't exist
    os.makedirs('models', exist_ok=True)
    
    # Model files URLs
    model_files = {
        'deploy.prototxt': 'https://raw.githubusercontent.com/opencv/opencv/master/samples/dnn/face_detector/deploy.prototxt',
        'res10_300x300_ssd_iter_140000.caffemodel': 'https://raw.githubusercontent.com/opencv/opencv_3rdparty/dnn_samples_face_detector_20170830/res10_300x300_ssd_iter_140000.caffemodel'
    }
    
    # Download each model file
    for filename, url in model_files.items():
        filepath = os.path.join('models', filename)
        if not os.path.exists(filepath):
            try:
                download_file(url, filepath)
            except Exception as e:
                print(f"Error downloading {filename}: {str(e)}")
                print("Please download the model files manually and place them in the 'models' directory:")
                print("1. deploy.prototxt")
                print("2. res10_300x300_ssd_iter_140000.caffemodel")
                return False
    return True

if __name__ == "__main__":
    main()
