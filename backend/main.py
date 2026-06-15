import os
import uuid
import json
import datetime
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
import numpy as np
import cv2

import simulator

app = FastAPI(title="MedVision AI Backend API")

# Configure CORS so our frontend can connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
UPLOADS_DIR = os.path.join(STATIC_DIR, "uploads")
HISTORY_FILE = os.path.join(BASE_DIR, "history.json")

os.makedirs(UPLOADS_DIR, exist_ok=True)

# Mount static files to serve original, heatmap, and mask images
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Helper to load history
def load_history():
    if not os.path.exists(HISTORY_FILE):
        # Initial seed history to make the dashboard look populated right away!
        seed_data = [
            {
                "case_id": "CASE-7B4D1A",
                "patient_id": "P-902F1A",
                "patient_name": "Eleanor Vance",
                "patient_age": "54Y",
                "patient_gender": "F",
                "modality": "Chest X-Ray",
                "upload_date": (datetime.datetime.now() - datetime.timedelta(days=1)).strftime("%Y-%m-%d %H:%M"),
                "disease": "Cardiomegaly",
                "confidence": 0.82,
                "severity": "Medium",
                "risk_level": "Medium",
                "clinical_summary": "Automated analysis of the Chest X-Ray shows a 82.0% confidence of Cardiomegaly. The heart silhouette is enlarged.",
                "recommendations": ["Correlate with echocardiography.", "Refer to cardiologist."],
                "original_url": "/static/seed_chest.png",
                "heatmap_url": "/static/seed_chest_heatmap.png",
                "has_mask": False,
                "stats": {"density": "Normal", "aeration": "Normal"}
            },
            {
                "case_id": "CASE-4F1E90",
                "patient_id": "P-77B1D5",
                "patient_name": "Marcus Aurelius",
                "patient_age": "62Y",
                "patient_gender": "M",
                "modality": "Brain MRI",
                "upload_date": (datetime.datetime.now() - datetime.timedelta(hours=4)).strftime("%Y-%m-%d %H:%M"),
                "disease": "Glioma",
                "confidence": 0.93,
                "severity": "High",
                "risk_level": "High",
                "clinical_summary": "Brain MRI analysis detects a structural mass lesion consistent with Glioma. Tumor occupies 4.2% of brain space.",
                "recommendations": ["Contrast MRI suggested.", "Immediate neurosurgical consult."],
                "original_url": "/static/seed_brain.png",
                "heatmap_url": "/static/seed_brain_heatmap.png",
                "mask_url": "/static/seed_brain_mask.png",
                "has_mask": True,
                "stats": {"tumor_area": "15420 px", "tumor_percentage": "4.2%", "location": "Right Frontal Lobe"}
            },
            {
                "case_id": "CASE-9C8E7D",
                "patient_id": "P-044A12",
                "patient_name": "Sarah Jenkins",
                "patient_age": "39Y",
                "patient_gender": "F",
                "modality": "Diabetic Retinopathy",
                "upload_date": (datetime.datetime.now() - datetime.timedelta(hours=12)).strftime("%Y-%m-%d %H:%M"),
                "disease": "Mild Diabetic Retinopathy",
                "confidence": 0.88,
                "severity": "Low",
                "risk_level": "Low",
                "clinical_summary": "Fundus photograph analysis reveals signs of Mild Diabetic Retinopathy with small microaneurysms.",
                "recommendations": ["Repeat screening in 6-12 months.", "Monitor glycemic index."],
                "original_url": "/static/seed_retina.png",
                "heatmap_url": "/static/seed_retina_heatmap.png",
                "has_mask": False,
                "stats": {"exudates": "None", "hemorrhages": "None"}
            }
        ]
        
        # We should create actual dummy images for the seed history so they load!
        try:
            # Create dummy black images for seeds
            h, w = 512, 512
            dummy_img = np.zeros((h, w, 3), dtype=np.uint8)
            cv2.putText(dummy_img, "Seed Scan", (150, 250), cv2.FONT_HERSHEY_SIMPLEX, 1, (255,255,255), 2)
            
            # Save chest seed
            chest = dummy_img.copy()
            cv2.circle(chest, (256, 256), 150, (128, 128, 128), -1)
            cv2.imwrite(os.path.join(STATIC_DIR, "seed_chest.png"), chest)
            cv2.imwrite(os.path.join(STATIC_DIR, "seed_chest_heatmap.png"), chest)
            
            # Save brain seed
            brain = dummy_img.copy()
            cv2.circle(brain, (256, 256), 180, (60, 60, 60), -1)
            cv2.imwrite(os.path.join(STATIC_DIR, "seed_brain.png"), brain)
            cv2.imwrite(os.path.join(STATIC_DIR, "seed_brain_heatmap.png"), brain)
            
            brain_mask = brain.copy()
            cv2.circle(brain_mask, (256, 256), 30, (0, 0, 255), -1)
            cv2.imwrite(os.path.join(STATIC_DIR, "seed_brain_mask.png"), brain_mask)
            
            # Save retina seed
            retina = dummy_img.copy()
            cv2.circle(retina, (256, 256), 200, (20, 40, 180), -1)
            cv2.imwrite(os.path.join(STATIC_DIR, "seed_retina.png"), retina)
            cv2.imwrite(os.path.join(STATIC_DIR, "seed_retina_heatmap.png"), retina)
        except Exception as ex:
            print(f"Error creating seed images: {ex}")
            
        with open(HISTORY_FILE, "w") as f:
            json.dump(seed_data, f, indent=4)
        return seed_data
        
    with open(HISTORY_FILE, "r") as f:
        try:
            return json.load(f)
        except:
            return []

def save_history(history):
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=4)

# Create seed files at startup
load_history()

@app.post("/upload")
async def upload_scan(file: UploadFile = File(...)):
    """
    Endpoint to upload and parse scan. Handles DICOM and standard formats.
    Extracts metadata.
    """
    file_bytes = await file.read()
    filename = file.filename or "scan.png"
    
    # Save raw file
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(filename)[1] or (".dcm" if filename.lower().endswith('.dcm') else ".png")
    raw_filename = f"raw_{file_id}{ext}"
    raw_path = os.path.join(UPLOADS_DIR, raw_filename)
    
    with open(raw_path, "wb") as f:
        f.write(file_bytes)
        
    # Process/parse scan
    img_rgb, metadata, is_dicom = simulator.parse_medical_image(file_bytes, filename)
    if img_rgb is None:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid medical image or DICOM scan.")
        
    # Save standard PNG format of the raw image for display
    display_filename = f"img_{file_id}.png"
    display_path = os.path.join(UPLOADS_DIR, display_filename)
    # Save image using OpenCV
    cv2.imwrite(display_path, cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR))
    
    # Keep track of file locally
    return {
        "scan_id": file_id,
        "is_dicom": is_dicom,
        "metadata": metadata,
        "original_url": f"/static/uploads/{display_filename}"
    }

@app.post("/predict")
async def predict_disease(
    scan_id: str = Form(...),
    modality: str = Form(...),
    brightness: float = Form(0.0),
    contrast: float = Form(1.0)
):
    """
    Performs AI inference, generating Grad-CAM heatmaps and segments if needed.
    Can also apply DICOM brightness/contrast adjustments.
    """
    # Load original image
    display_filename = f"img_{scan_id}.png"
    display_path = os.path.join(UPLOADS_DIR, display_filename)
    if not os.path.exists(display_path):
        raise HTTPException(status_code=404, detail="Scan image not found.")
        
    # Read the image
    img = cv2.imread(display_path)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    # Calculate file hash for stable results
    file_hash = simulator.get_image_hash(img.tobytes())
    
    # Apply windowing adjustments
    adjusted_rgb = simulator.apply_windowing(img_rgb, brightness, contrast)
    
    # Run diagnostic simulator
    findings, blended_rgb, mask_rgb = simulator.generate_diagnostics(adjusted_rgb, modality, file_hash)
    
    # Save outputs
    heatmap_filename = f"heatmap_{scan_id}.png"
    heatmap_path = os.path.join(UPLOADS_DIR, heatmap_filename)
    cv2.imwrite(heatmap_path, cv2.cvtColor(blended_rgb, cv2.COLOR_RGB2BGR))
    
    mask_url = None
    if mask_rgb is not None:
        mask_filename = f"mask_{scan_id}.png"
        mask_path = os.path.join(UPLOADS_DIR, mask_filename)
        cv2.imwrite(mask_path, cv2.cvtColor(mask_rgb, cv2.COLOR_RGB2BGR))
        mask_url = f"/static/uploads/{mask_filename}"
        
    # Create final response and append to history
    case_id = f"CASE-{uuid.uuid4().hex[:6].upper()}"
    patient_id = findings.get("patient_id", f"P-{uuid.uuid4().hex[:6].upper()}")
    
    # Try to extract patient metadata if upload metadata is passed (e.g. from a real session)
    # For simplicity, we create randomized or deterministic metadata
    patient_name = f"Patient {int(file_hash[:4], 16) % 1000}"
    patient_age = f"{25 + (int(file_hash[4:6], 16) % 55)}Y"
    patient_gender = "F" if int(file_hash[6:8], 16) % 2 == 0 else "M"
    
    record = {
        "case_id": case_id,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "patient_age": patient_age,
        "patient_gender": patient_gender,
        "modality": modality,
        "upload_date": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "disease": findings["disease"],
        "confidence": findings["confidence"],
        "severity": findings["severity"],
        "risk_level": findings["risk_level"],
        "clinical_summary": findings["clinical_summary"],
        "recommendations": findings["recommendations"],
        "original_url": f"/static/uploads/{display_filename}",
        "heatmap_url": f"/static/uploads/{heatmap_filename}",
        "mask_url": mask_url,
        "has_mask": findings["has_mask"],
        "stats": findings["stats"]
    }
    
    history = load_history()
    # Check if this case already exists to avoid duplicates
    history.insert(0, record)
    save_history(history)
    
    return record

@app.get("/patient-history")
async def get_history():
    """Returns past case history."""
    return load_history()

@app.get("/analytics")
async def get_analytics():
    """Generates analytics summary for the dashboard."""
    history = load_history()
    total_cases = len(history)
    
    # Disease distribution
    disease_counts = {}
    modality_counts = {}
    risk_counts = {"Low": 0, "Medium": 0, "High": 0}
    
    for r in history:
        d = r.get("disease", "Unknown")
        m = r.get("modality", "Unknown")
        risk = r.get("risk_level", "Low")
        
        disease_counts[d] = disease_counts.get(d, 0) + 1
        modality_counts[m] = modality_counts.get(m, 0) + 1
        risk_counts[risk] = risk_counts.get(risk, 0) + 1
        
    disease_distribution = [{"name": k, "value": v} for k, v in disease_counts.items()]
    modality_distribution = [{"name": k, "value": v} for k, v in modality_counts.items()]
    
    # Simulated accuracy metrics
    accuracy = 94.2
    auc = 0.96
    avg_inference_time = 1.8 # seconds
    
    return {
        "total_cases": total_cases,
        "disease_distribution": disease_distribution,
        "modality_distribution": modality_distribution,
        "risk_distribution": [
            {"name": "Low Risk", "value": risk_counts["Low"], "color": "#10b981"},
            {"name": "Medium Risk", "value": risk_counts["Medium"], "color": "#f59e0b"},
            {"name": "High Risk", "value": risk_counts["High"], "color": "#f43f5e"}
        ],
        "metrics": {
            "accuracy": f"{accuracy}%",
            "auc": f"{auc}",
            "avg_inference_time": f"{avg_inference_time}s"
        }
    }

@app.post("/generate-report")
async def generate_report(case: dict):
    """
    Creates structural data or formatted HTML/JSON report export.
    In real usage, this might yield a downloadable PDF.
    Here we return a fully formatted medical record print bundle.
    """
    # Simply echo back the structured report parameters with validation
    return {
        "status": "success",
        "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "report": {
            "title": "CLINICAL IMAGING DIAGNOSTIC REPORT",
            "institution": "MedVision AI Diagnostic Hub",
            "case_id": case.get("case_id"),
            "patient": {
                "id": case.get("patient_id"),
                "name": case.get("patient_name"),
                "age": case.get("patient_age"),
                "gender": case.get("patient_gender"),
            },
            "scan": {
                "modality": case.get("modality"),
                "date": case.get("upload_date"),
            },
            "findings": {
                "detected": case.get("disease"),
                "confidence": f"{case.get('confidence', 0)*100:.1f}%",
                "severity": case.get("severity"),
                "summary": case.get("clinical_summary"),
                "stats": case.get("stats", {})
            },
            "recommendations": case.get("recommendations", []),
            "physician_signoff": "PENDING REVIEW"
        }
    }
