import cv2
import numpy as np
import hashlib
from io import BytesIO
from PIL import Image

try:
    import pydicom
    HAS_PYDICOM = True
except ImportError:
    HAS_PYDICOM = False

def get_image_hash(image_bytes: bytes) -> str:
    """Generate a stable MD5 hash of the image bytes for deterministic mock results."""
    return hashlib.md5(image_bytes).hexdigest()

def parse_medical_image(file_bytes: bytes, filename: str):
    """
    Parses an uploaded file (DICOM or standard image).
    Returns (image_rgb, metadata_dict, is_dicom).
    """
    is_dicom = filename.lower().endswith('.dcm') or (len(file_bytes) > 132 and file_bytes[128:132] == b'DICM')
    
    if is_dicom and HAS_PYDICOM:
        try:
            ds = pydicom.dcmread(BytesIO(file_bytes))
            pixel_array = ds.pixel_array.astype(float)
            
            # Rescale intercept/slope
            if hasattr(ds, 'RescaleIntercept') and hasattr(ds, 'RescaleSlope'):
                pixel_array = pixel_array * ds.RescaleSlope + ds.RescaleIntercept
            
            # Normalize to 0-255
            min_val = np.min(pixel_array)
            max_val = np.max(pixel_array)
            if max_val > min_val:
                pixel_array = (pixel_array - min_val) / (max_val - min_val) * 255.0
            else:
                pixel_array = np.zeros_like(pixel_array)
                
            img_uint8 = pixel_array.astype(np.uint8)
            
            # Convert to RGB
            if len(img_uint8.shape) == 2:
                img_rgb = cv2.cvtColor(img_uint8, cv2.COLOR_GRAY2RGB)
            else:
                img_rgb = img_uint8
                
            metadata = {
                "patient_id": getattr(ds, 'PatientID', f"P-{get_image_hash(file_bytes)[:8].upper()}"),
                "patient_name": str(getattr(ds, 'PatientName', 'Anonymous Patient')),
                "patient_age": str(getattr(ds, 'PatientAge', '45Y')),
                "patient_gender": getattr(ds, 'PatientSex', 'M'),
                "modality": getattr(ds, 'Modality', 'DX'),
                "study_date": getattr(ds, 'StudyDate', '20260615'),
                "body_part": getattr(ds, 'BodyPartExamined', 'CHEST'),
            }
            return img_rgb, metadata, True
        except Exception as e:
            print(f"Error parsing DICOM: {e}. Falling back to standard image decoding.")

    # Fallback/standard image
    try:
        nparr = np.frombuffer(file_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            h_id = get_image_hash(file_bytes)
            # Create synthetic patient metadata based on hash
            metadata = {
                "patient_id": f"P-{h_id[:8].upper()}",
                "patient_name": f"Patient {int(h_id[8:12], 16) % 1000}",
                "patient_age": f"{20 + (int(h_id[12:14], 16) % 65)}Y",
                "patient_gender": "F" if int(h_id[14:16], 16) % 2 == 0 else "M",
                "modality": "OT",
                "study_date": "20260615",
                "body_part": "UNKNOWN",
            }
            return img_rgb, metadata, False
    except Exception as e:
        print(f"Error decoding standard image: {e}")
        
    return None, None, False

def apply_windowing(image_rgb: np.ndarray, brightness: float, contrast: float) -> np.ndarray:
    """
    Applies brightness (-100 to 100) and contrast (0.5 to 3.0) adjustments.
    """
    # brightness: offset. contrast: multiplier.
    # NewVal = OldVal * contrast + brightness
    adjusted = image_rgb.astype(float) * contrast + brightness
    adjusted = np.clip(adjusted, 0, 255).astype(np.uint8)
    return adjusted

def generate_diagnostics(image_rgb: np.ndarray, modality: str, file_hash: str):
    """
    Simulates AI classification, segmentation, and Grad-CAM based on the file hash.
    Returns:
      - result_dict: contains confidence, diagnosis, severity, metadata, stats
      - heatmap_rgb: the Grad-CAM blended image
      - mask_rgb: the segmentation overlay image (if Brain MRI)
    """
    h, w, c = image_rgb.shape
    h_val = int(file_hash[:8], 16)
    
    # 1. Determine scan characteristics based on modality
    if modality == "Chest X-Ray":
        diseases = [
            ("Pneumonia", "High", 0.88),
            ("Cardiomegaly", "Medium", 0.76),
            ("Effusion", "Medium", 0.65),
            ("Pneumothorax", "High", 0.82),
            ("Atelectasis", "Low", 0.45),
            ("Infiltration", "Low", 0.58),
            ("No Finding", "Low", 0.95)
        ]
        chosen = diseases[h_val % len(diseases)]
        disease, severity, confidence = chosen
        
        # Build simulated Grad-CAM heatmap
        # For chest X-rays, highlight lung regions
        heatmap = np.zeros((h, w), dtype=np.uint8)
        if disease != "No Finding":
            # Generate 1 or 2 Gaussian blobs in lung regions
            # Chest scans typically have lungs left and right
            for lung in [-1, 1]:
                cx = int(w / 2 + lung * (w / 6))
                cy = int(h / 2 + (h_val % 4 - 2) * (h / 20))
                radius = int(min(h, w) * (0.15 + 0.05 * (h_val % 3)))
                # Draw filled circle with gradient
                temp = np.zeros((h, w), dtype=np.uint8)
                cv2.circle(temp, (cx, cy), radius, 255, -1)
                temp = cv2.GaussianBlur(temp, (101, 101), 0)
                heatmap = cv2.max(heatmap, temp)
        
        # Overlay heatmap
        heatmap_color = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
        heatmap_color = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)
        
        # Blend: original + 0.5 * heatmap
        blended = cv2.addWeighted(image_rgb, 0.6, heatmap_color, 0.4, 0)
        
        risk_level = "High" if severity == "High" else ("Medium" if severity == "Medium" else "Low")
        if disease == "No Finding":
            risk_level = "Low"
            
        clinical_summary = (
            f"Automated analysis of the Chest X-Ray shows a {confidence:.1%} confidence of {disease}. "
            f"The pathology is graded as {severity} severity. "
            if disease != "No Finding" else
            "Automated analysis shows no active cardiopulmonary disease. The lung fields are clear."
        )
        recommendations = [
            "Correlate with clinical history and laboratory findings.",
            "PA and Lateral chest views are advised if symptoms persist.",
            f"Refer to a pulmonologist for formal consultation regarding suspected {disease}." if disease != "No Finding" else "Routine follow-up as clinically indicated."
        ]
        
        return {
            "disease": disease,
            "confidence": float(confidence),
            "severity": severity,
            "risk_level": risk_level,
            "clinical_summary": clinical_summary,
            "recommendations": recommendations,
            "has_mask": False,
            "stats": {
                "density": "Normal lung volume",
                "aeration": "Slightly reduced in bases" if disease in ["Pneumonia", "Effusion"] else "Normal"
            }
        }, blended, None

    elif modality == "Brain MRI":
        diseases = [
            ("Glioma", "High", 0.91),
            ("Meningioma", "Medium", 0.84),
            ("Pituitary Tumor", "Medium", 0.89),
            ("No Tumor", "Low", 0.98)
        ]
        chosen = diseases[h_val % len(diseases)]
        disease, severity, confidence = chosen
        
        heatmap = np.zeros((h, w), dtype=np.uint8)
        mask = np.zeros((h, w), dtype=np.uint8)
        
        tumor_pct = 0.0
        tumor_area_pixels = 0
        
        if disease != "No Tumor":
            # Determine a tumor center and radius
            # Let's put the tumor somewhere off-center in the brain
            cx = int(w / 2 + ((h_val % 6) - 3) * (w / 16))
            cy = int(h / 2 + ((h_val % 4) - 2) * (h / 16))
            radius = int(min(h, w) * (0.08 + 0.04 * (h_val % 4)))
            
            # Generate mask (sharp outline)
            cv2.circle(mask, (cx, cy), radius, 255, -1)
            # Add some roughness to make it look like a real tumor mask
            noise = np.random.normal(0, 5, (h, w)).astype(np.uint8)
            mask = cv2.bitwise_and(mask, mask, mask=cv2.threshold(noise, 2, 255, cv2.THRESH_BINARY)[1])
            mask = cv2.GaussianBlur(mask, (15, 15), 0)
            _, mask = cv2.threshold(mask, 100, 255, cv2.THRESH_BINARY)
            
            # Calculate tumor area
            tumor_area_pixels = int(np.sum(mask > 0))
            # Assume brain occupies roughly 50% of the image
            total_brain_pixels = int(h * w * 0.45)
            tumor_pct = (tumor_area_pixels / total_brain_pixels) * 100
            tumor_pct = round(min(tumor_pct, 100.0), 2)
            
            # Generate heatmap blob (blurry)
            cv2.circle(heatmap, (cx, cy), int(radius * 1.5), 255, -1)
            heatmap = cv2.GaussianBlur(heatmap, (81, 81), 0)
            
        heatmap_color = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
        heatmap_color = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)
        blended = cv2.addWeighted(image_rgb, 0.6, heatmap_color, 0.4, 0)
        
        # Build segmentation mask overlay (tinted translucent red/cyan)
        mask_overlay = image_rgb.copy()
        if disease != "No Tumor":
            # Highlight tumor area in translucent medical red/magenta
            mask_overlay[mask > 0] = [244, 63, 94] # Rose pink
            mask_blended = cv2.addWeighted(image_rgb, 0.7, mask_overlay, 0.3, 0)
            # Draw a thin border around the mask
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cv2.drawContours(mask_blended, contours, -1, (244, 63, 94), 2)
        else:
            mask_blended = image_rgb.copy()
            
        risk_level = "High" if disease in ["Glioma"] else ("Medium" if disease in ["Meningioma", "Pituitary Tumor"] else "Low")
        clinical_summary = (
            f"Brain MRI analysis detects a structural mass lesion consistent with {disease}. "
            f"Tumor segmentation indicates it occupies approximately {tumor_pct}% of the cranial space. "
            if disease != "No Tumor" else
            "Brain MRI shows normal cranial anatomy. Ventricles and sulci are within normal limits for age. No mass effect."
        )
        recommendations = [
            "Contrast-enhanced brain MRI (with Gadolinium) is recommended.",
            "Neurosurgical and neuro-oncological clinical assessment.",
            "Monitor patient closely for signs of elevated intracranial pressure."
        ] if disease != "No Tumor" else [
            "Follow-up scan if neurological symptoms persist or change.",
            "No acute neurological intervention required."
        ]
        
        return {
            "disease": disease,
            "confidence": float(confidence),
            "severity": "High" if disease == "Glioma" else ("Medium" if disease != "No Tumor" else "Low"),
            "risk_level": risk_level,
            "clinical_summary": clinical_summary,
            "recommendations": recommendations,
            "has_mask": True,
            "stats": {
                "tumor_area": f"{tumor_area_pixels} px",
                "tumor_percentage": f"{tumor_pct}%",
                "location": "Frontal Lobe" if h_val % 2 == 0 else "Temporal Lobe"
            }
        }, blended, mask_blended

    else: # Diabetic Retinopathy
        grades = [
            ("No Diabetic Retinopathy (DR)", "Low", 0.96),
            ("Mild Diabetic Retinopathy", "Low", 0.85),
            ("Moderate Diabetic Retinopathy", "Medium", 0.78),
            ("Severe Diabetic Retinopathy", "High", 0.84),
            ("Proliferative Diabetic Retinopathy", "High", 0.92)
        ]
        chosen = grades[h_val % len(grades)]
        disease, severity, confidence = chosen
        
        # Build diabetic retinopathy heatmap (pinpoint lesions / microaneurysms)
        heatmap = np.zeros((h, w), dtype=np.uint8)
        if "No DR" not in disease:
            # Create a set of microaneurysm dots scattered randomly
            num_dots = (h_val % 5 + 2) * (2 if "Severe" in disease or "Proliferative" in disease else 1)
            for i in range(num_dots):
                dot_seed = h_val + i * 37
                cx = int(w/2 + ((dot_seed % 8) - 4) * (w / 12))
                cy = int(h/2 + ((dot_seed % 6) - 3) * (h / 12))
                radius = int(min(h, w) * (0.02 + 0.01 * (dot_seed % 3)))
                
                temp = np.zeros((h, w), dtype=np.uint8)
                cv2.circle(temp, (cx, cy), radius, 255, -1)
                temp = cv2.GaussianBlur(temp, (31, 31), 0)
                heatmap = cv2.max(heatmap, temp)
                
        heatmap_color = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
        heatmap_color = cv2.cvtColor(heatmap_color, cv2.COLOR_BGR2RGB)
        blended = cv2.addWeighted(image_rgb, 0.6, heatmap_color, 0.4, 0)
        
        risk_level = "High" if severity == "High" else ("Medium" if severity == "Medium" else "Low")
        clinical_summary = (
            f"Fundus photograph analysis reveals signs of {disease}. "
            f"Visual findings suggest presence of microaneurysms, hemorrhages, or exudates. "
            if "No DR" not in disease else
            "Fundus image shows a normal retina with healthy macula, optic disc, and vasculature."
        )
        recommendations = [
            "Refer to an ophthalmologist for comprehensive dilated eye exam.",
            "Optimize blood glucose, blood pressure, and cholesterol levels.",
            "Repeat fundus screening in 6 months to monitor progression."
        ] if "No DR" not in disease else [
            "Annual diabetic eye screening is advised.",
            "Maintain strict glycemic control."
        ]
        
        return {
            "disease": disease,
            "confidence": float(confidence),
            "severity": severity,
            "risk_level": risk_level,
            "clinical_summary": clinical_summary,
            "recommendations": recommendations,
            "has_mask": False,
            "stats": {
                "exudates": "Detected" if "Severe" in disease or "Proliferative" in disease else "None",
                "hemorrhages": "Scattered" if "Moderate" in disease or "Severe" in disease else "None"
            }
        }, blended, None
