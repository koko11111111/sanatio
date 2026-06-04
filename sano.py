import os
import cv2
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import models
import numpy as np
import streamlit as st
from pathlib import Path

st.set_page_config(page_title="DeeVid AI - Detector", layout="wide")

st.markdown("""
    <style>
    .stApp { background-color: #0B0E14; color: #FFFFFF; }
    div[data-testid="stFileUploader"] {
        border: 2px dashed #1E293B;
        border-radius: 10px;
        background-color: #111827;
        padding: 20px;
    }
    .custom-title { color: #38BDF8; font-family: 'Inter', sans-serif; font-weight: bold; }
    </style>
""", unsafe_allow_html=True)

class AIDetectorDataset(Dataset):
    def __init__(self, real_dir, fake_dir, image_size=224):
        self.image_paths = []
        self.labels = []
        self.image_size = image_size
        valid_extensions = ('.jpg', '.jpeg', '.png', '.jfif', '.webp')

        for root, dirs, files in os.walk(real_dir):
            for filename in files:
                if filename.lower().endswith(valid_extensions):
                    self.image_paths.append(Path(root) / filename)
                    self.labels.append(0)  

        for root, dirs, files in os.walk(fake_dir):
            for filename in files:
                if filename.lower().endswith(valid_extensions):
                    self.image_paths.append(Path(root) / filename)
                    self.labels.append(1)  

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        label = self.labels[idx]
        try:
            img_array = np.fromfile(str(img_path), np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            if img is None:
                img = np.zeros((self.image_size, self.image_size, 3), dtype=np.uint8)
            else:
                img = cv2.resize(img, (self.image_size, self.image_size))
        except Exception:
            img = np.zeros((self.image_size, self.image_size, 3), dtype=np.uint8)
            
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))
        return torch.tensor(img, dtype=torch.float32), torch.tensor(label, dtype=torch.long)

def run_background_retraining():
    REAL_FOLDER_NAME = 'real'   
    FAKE_FOLDER_NAME = 'fake'   
    IMAGE_SIZE = 224             
    BATCH_SIZE = 4  
    EPOCHS = 3  
    LEARNING_RATE = 0.00001  
    OLD_MODEL_NAME = "ai_detector_model.pth"
    NEW_MODEL_NAME = "ai_detector_model_new.pth"

    train_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    retrain_model = models.resnet18()
    num_features = retrain_model.fc.in_features
    retrain_model.fc = nn.Linear(num_features, 2)

    if os.path.exists(OLD_MODEL_NAME):
        retrain_model.load_state_dict(torch.load(OLD_MODEL_NAME, map_location=train_device))
    else:
        retrain_model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        retrain_model.fc = nn.Linear(num_features, 2)

    retrain_model = retrain_model.to(train_device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(retrain_model.parameters(), lr=LEARNING_RATE, weight_decay=1e-5)

    dataset = AIDetectorDataset(REAL_FOLDER_NAME, FAKE_FOLDER_NAME, IMAGE_SIZE)
    if len(dataset) == 0:
        return
        
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)

    for epoch in range(EPOCHS):
        retrain_model.train()
        for images, labels in loader:
            images, labels = images.to(train_device), labels.to(train_device)
            optimizer.zero_grad()
            outputs = retrain_model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()

    torch.save(retrain_model.state_dict(), NEW_MODEL_NAME)
    if os.path.exists(OLD_MODEL_NAME):
        os.remove(OLD_MODEL_NAME)
    os.rename(NEW_MODEL_NAME, OLD_MODEL_NAME)
    st.cache_resource.clear()

@st.cache_resource
def load_ai_model():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = models.resnet18()
    num_features = model.fc.in_features
    model.fc = nn.Linear(num_features, 2)
    if os.path.exists("ai_detector_model.pth"):
        model.load_state_dict(torch.load("ai_detector_model.pth", map_location=device))
    model.to(device)
    model.eval()
    return model, device

model, device = load_ai_model()

with st.sidebar:
    st.title("DeeVid AI")
    st.markdown("---")
    app_mode = st.radio("CREATION TOOLS", ["Detector Agent", "Admin Dashboard"])
    st.markdown("---")
    st.info("Logged in as Team Leader")

if app_mode == "Detector Agent":
    st.markdown("<h1 class='custom-title'>Create like a pro. Just ask DeeVid Agent.</h1>", unsafe_allow_html=True)
    st.write("Upload an image below to verify its authenticity with our AI models.")
    st.markdown("---")
    
    uploaded_file = st.file_uploader("Tell me what image content you want to verify...", type=["jpg", "jpeg", "png", "webp","jfif"])
    
    if uploaded_file is not None:
        col1, col2 = st.columns(2)
        
        with col1:
            st.image(uploaded_file, caption="Target Image", use_container_width=True)
            
        file_bytes = np.asarray(bytearray(uploaded_file.read()), dtype=np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        img_resized = cv2.resize(img, (224, 224))
        img_normalized = img_resized / 255.0
        img_input = np.transpose(img_normalized, (2, 0, 1))
        img_tensor = torch.tensor(img_input, dtype=torch.float32).unsqueeze(0).to(device)
        
        with torch.no_grad():
            outputs = model(img_tensor)
            probabilities = torch.softmax(outputs, dim=1)
            confidence, predicted = torch.max(probabilities, 1)
            
        real_score = probabilities[0][0].item() * 100
        ai_score = probabilities[0][1].item() * 100
        pred_class = predicted.item()
        
        with col2:
            st.subheader("Analysis Verdict:")
            if pred_class == 0:
                st.markdown(f"<h2 style='color:#10B981;'>REAL PHOTO</h2>", unsafe_allow_html=True)
            else:
                st.markdown(f"<h2 style='color:#EF4444;'>AI GENERATED</h2>", unsafe_allow_html=True)
                
            st.markdown("---")
            st.write(f"Real Photo Content: **{real_score:.2f}%**")
            st.progress(int(real_score))
            st.write(f"AI Artifacts Content: **{ai_score:.2f}%**")
            st.progress(int(ai_score))
            
        REAL_DIR = Path('real')
        FAKE_DIR = Path('fake')
        review_dir = Path("data_lake_review")
        review_dir.mkdir(exist_ok=True)
        
        existing_images = set()
        valid_extensions = ('.jpg', '.jpeg', '.png', '.jfif', '.webp')
        
        for folder in [REAL_DIR, FAKE_DIR, review_dir]:
            if folder.exists():
                for root, _, files in os.walk(folder):
                    for f in files:
                        if f.lower().endswith(valid_extensions):
                            existing_images.add(f)
                            
        if uploaded_file.name not in existing_images:
            save_path = review_dir / uploaded_file.name
            with open(save_path, "wb") as f:
                f.write(uploaded_file.getbuffer())

elif app_mode == "Admin Dashboard":
    st.title("Data Lake Review Panel")
    st.write("Review and label the low-confidence images collected from users.")
    st.markdown("---")
    
    review_dir = Path("data_lake_review")
    
    if not review_dir.exists() or len(os.listdir(review_dir)) == 0:
        st.success("Great job! No low-confidence images to review at the moment.")
    else:
        all_images = [f for f in os.listdir(review_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.jfif'))]
        if len(all_images) > 0:
            current_img_name = all_images[0]
            img_path = review_dir / current_img_name
            
            st.image(str(img_path), caption=f"Reviewing File: {current_img_name}", width=400)
            
            col1, col2, col3 = st.columns(3)
            
            with col1:
                if st.button("Confirm as REAL"):
                    target = Path("real") / current_img_name
                    Path("real").mkdir(exist_ok=True)
                    os.rename(str(img_path), str(target))
                    with st.spinner("Updating model in background..."):
                        run_background_retraining()
                    st.rerun()
                    
            with col2:
                if st.button("Confirm as AI"):
                    target = Path("fake") / current_img_name
                    Path("fake").mkdir(exist_ok=True)
                    os.rename(str(img_path), str(target))
                    with st.spinner("Updating model in background..."):
                        run_background_retraining()
                    st.rerun()
                    
            with col3:
                if st.button("Delete"):
                    os.remove(str(img_path))
                    st.rerun()
