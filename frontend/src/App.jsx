import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  Upload, 
  FileText, 
  Sliders, 
  Layers, 
  User, 
  CheckCircle, 
  AlertTriangle, 
  TrendingUp, 
  ShieldAlert, 
  Clock, 
  RefreshCw, 
  Download, 
  Printer, 
  X,
  PieChart as PieIcon,
  ChevronRight,
  Database
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';

const API_BASE = "http://127.0.0.1:8000";

function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' or 'diagnose'
  const [theme, setTheme] = useState('dark');
  
  // Dashboard Analytics
  const [analytics, setAnalytics] = useState(null);
  const [history, setHistory] = useState([]);
  
  // Diagnostic State
  const [modality, setModality] = useState('Chest X-Ray');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [currentScan, setCurrentScan] = useState(null); // original scan details
  const [diagnostics, setDiagnostics] = useState(null); // inference results
  const [viewMode, setViewMode] = useState('original'); // 'original', 'heatmap', 'mask'
  
  // DICOM Controls
  const [brightness, setBrightness] = useState(0); // -100 to 100
  const [contrast, setContrast] = useState(1); // 0.5 to 3
  
  // Report Modal
  const [selectedReport, setSelectedReport] = useState(null);
  
  // Load initial data
  useEffect(() => {
    fetchHistory();
    fetchAnalytics();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/patient-history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_BASE}/analytics`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    }
  };

  // Image Upload handler
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setDiagnostics(null);
    setCurrentScan(null);
    setViewMode('original');
    setBrightness(0);
    setContrast(1);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setCurrentScan(data);
    } catch (err) {
      alert("Error uploading file. Make sure backend is running on port 8000!");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // AI inference trigger
  const runDiagnosis = async () => {
    if (!currentScan) return;
    setAnalyzing(true);

    const formData = new FormData();
    formData.append('scan_id', currentScan.scan_id);
    formData.append('modality', modality);
    formData.append('brightness', brightness);
    formData.append('contrast', contrast);

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error("Prediction failed");
      const data = await res.json();
      setDiagnostics(data);
      setViewMode('heatmap'); // switch automatically to heatmap to display findings
      
      // Refresh analytics and history
      fetchHistory();
      fetchAnalytics();
    } catch (err) {
      alert("Diagnosis failed");
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const downloadJSONReport = (reportData) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `MedVision_Report_${reportData.case_id || 'case'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const openReportModal = async (caseRecord) => {
    try {
      const res = await fetch(`${API_BASE}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caseRecord)
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedReport(data.report);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Toggle Theme
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (nextTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  };

  // Select a case from history to view
  const viewCaseInConsole = (caseRecord) => {
    setCurrentScan({
      scan_id: caseRecord.case_id,
      original_url: caseRecord.original_url,
      metadata: {
        patient_id: caseRecord.patient_id,
        patient_name: caseRecord.patient_name,
        patient_age: caseRecord.patient_age,
        patient_gender: caseRecord.patient_gender,
        modality: caseRecord.modality,
        study_date: caseRecord.upload_date
      }
    });
    setDiagnostics(caseRecord);
    setModality(caseRecord.modality);
    setViewMode(caseRecord.has_mask ? 'mask' : 'heatmap');
    setActiveTab('diagnose');
  };

  // Chart Color schemes
  const COLORS = ['#0d9488', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="brand">
            <Activity className="brand-logo" size={32} color="#0d9488" />
            <span>MedVision AI</span>
          </div>
          
          <nav>
            <ul className="nav-links">
              <li>
                <a 
                  className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
                  onClick={() => setActiveTab('dashboard')}
                >
                  <Database size={20} />
                  Analytics Hub
                </a>
              </li>
              <li>
                <a 
                  className={`nav-item ${activeTab === 'diagnose' ? 'active' : ''}`}
                  onClick={() => setActiveTab('diagnose')}
                >
                  <Sliders size={20} />
                  Diagnostics Console
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="control-group" style={{marginBottom: '1rem'}}>
            <button className="secondary-btn" onClick={toggleTheme}>
              {theme === 'dark' ? 'Clinical Light Mode' : 'Clinical Dark Mode'}
            </button>
          </div>
          <div className="user-profile">
            <div className="user-avatar">DR</div>
            <div>
              <p style={{fontWeight: 600, fontSize: '0.9rem'}}>Dr. Robinson</p>
              <p style={{fontSize: '0.75rem', color: 'var(--text-secondary)'}}>Senior Radiologist</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Body content */}
      <main className="main-content">
        <header className="top-bar">
          <h1 className="page-title">
            {activeTab === 'dashboard' ? 'Clinical Telemetry & History' : 'Diagnostic Imaging Console'}
          </h1>
          <div className="system-status">
            <span className="status-dot"></span>
            AI Diagnosis Engine Online
          </div>
        </header>

        {activeTab === 'dashboard' ? (
          /* DASHBOARD VIEW */
          <div style={{flex: 1, overflowY: 'auto'}}>
            <div className="dashboard-grid">
              <div className="stat-card">
                <div className="stat-header">
                  <span>Total Cases Analyzed</span>
                  <Activity size={18} color="var(--color-accent)" />
                </div>
                <div className="stat-value">{analytics?.total_cases || history.length}</div>
                <div className="stat-desc">Synchronized with local diagnostic cache</div>
              </div>

              <div className="stat-card risk-low">
                <div className="stat-header">
                  <span>Target AI Accuracy</span>
                  <TrendingUp size={18} color="var(--color-success)" />
                </div>
                <div className="stat-value">{analytics?.metrics.accuracy || '94.2%'}</div>
                <div className="stat-desc">Avg AUC: {analytics?.metrics.auc || '0.96'}</div>
              </div>

              <div className="stat-card risk-med">
                <div className="stat-header">
                  <span>Average Inference Time</span>
                  <Clock size={18} color="var(--color-warning)" />
                </div>
                <div className="stat-value">{analytics?.metrics.avg_inference_time || '1.8s'}</div>
                <div className="stat-desc">Optimized FastAPI model execution</div>
              </div>
            </div>

            <div className="analytics-section">
              {/* Disease distributions */}
              <div className="analytics-card">
                <h2 className="analytics-title">
                  <PieIcon size={20} color="var(--color-brand)" />
                  Case Diagnosis Distribution
                </h2>
                <div style={{width: '100%', height: 260}}>
                  {analytics?.disease_distribution.length > 0 ? (
                    <ResponsiveContainer>
                      <BarChart data={analytics.disease_distribution}>
                        <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} tickLine={false} />
                        <YAxis stroke="var(--text-secondary)" fontSize={11} tickLine={false} />
                        <Tooltip contentStyle={{background: 'var(--bg-tertiary)', borderColor: 'var(--border-color)', color: 'var(--text-primary)'}} />
                        <Bar dataKey="value" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)'}}>
                      No diagnostic cases logged yet
                    </div>
                  )}
                </div>
              </div>

              {/* Risk levels pie chart */}
              <div className="analytics-card">
                <h2 className="analytics-title">
                  <ShieldAlert size={20} color="var(--color-danger)" />
                  Case Risk Levels
                </h2>
                <div style={{width: '100%', height: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                  {analytics?.risk_distribution ? (
                    <>
                      <div style={{width: '100%', height: 180}}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={analytics.risk_distribution.filter(d => d.value > 0)}
                              innerRadius={50}
                              outerRadius={75}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {analytics.risk_distribution.map((entry, idx) => (
                                <Cell key={`cell-${idx}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{display: 'flex', gap: '1rem', fontSize: '0.75rem', marginTop: '1rem'}}>
                        {analytics.risk_distribution.map((entry, idx) => (
                          <div key={idx} style={{display: 'flex', alignItems: 'center', gap: '0.25rem'}}>
                            <span style={{width: 8, height: 8, borderRadius: '50%', backgroundColor: entry.color}}></span>
                            <span>{entry.name} ({entry.value})</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{color: 'var(--text-muted)'}}>No risk metrics compiled</div>
                  )}
                </div>
              </div>
            </div>

            {/* Case History Table */}
            <div style={{padding: '0 2.5rem 2.5rem 2.5rem'}}>
              <div className="analytics-card">
                <h2 className="analytics-title">
                  Recent Diagnoses Case History
                </h2>
                <div className="history-table-container">
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Case ID</th>
                        <th>Patient ID</th>
                        <th>Name</th>
                        <th>Age/Sex</th>
                        <th>Modality</th>
                        <th>Upload Date</th>
                        <th>Primary Diagnosis</th>
                        <th>Confidence</th>
                        <th>Risk</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((record) => (
                        <tr key={record.case_id}>
                          <td className="meta-value">{record.case_id}</td>
                          <td className="meta-value">{record.patient_id}</td>
                          <td style={{fontWeight: 600}}>{record.patient_name}</td>
                          <td>{record.patient_age} / {record.patient_gender}</td>
                          <td>{record.modality}</td>
                          <td>{record.upload_date}</td>
                          <td style={{color: 'var(--color-brand)', fontWeight: 600}}>{record.disease}</td>
                          <td>{(record.confidence * 100).toFixed(1)}%</td>
                          <td>
                            <span className={`risk-pill ${(record.risk_level || 'low').toLowerCase()}`} style={{fontSize: '0.7rem', padding: '0.2rem 0.5rem'}}>
                              {record.risk_level}
                            </span>
                          </td>
                          <td>
                            <div style={{display: 'flex', gap: '0.5rem'}}>
                              <button 
                                className="toggle-btn active" 
                                style={{fontSize: '0.75rem', padding: '0.25rem 0.5rem'}}
                                onClick={() => viewCaseInConsole(record)}
                              >
                                View Console
                              </button>
                              <button 
                                className="toggle-btn"
                                style={{fontSize: '0.75rem', padding: '0.25rem 0.5rem'}}
                                onClick={() => openReportModal(record)}
                              >
                                Report
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* DIAGNOSTIC CONSOLE VIEW */
          <div className="diagnostic-layout">
            <div className="viewer-pane">
              <div className="pane-header">
                <div className="modality-selector">
                  {['Chest X-Ray', 'Brain MRI', 'Diabetic Retinopathy'].map((m) => (
                    <button
                      key={m}
                      className={`modality-btn ${modality === m ? 'active' : ''}`}
                      onClick={() => {
                        setModality(m);
                        setDiagnostics(null);
                        setCurrentScan(null);
                        setViewMode('original');
                      }}
                      disabled={analyzing || uploading}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {diagnostics && (
                  <div className="view-toggle">
                    <button 
                      className={`toggle-btn ${viewMode === 'original' ? 'active' : ''}`}
                      onClick={() => setViewMode('original')}
                    >
                      Original Scan
                    </button>
                    <button 
                      className={`toggle-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
                      onClick={() => setViewMode('heatmap')}
                    >
                      Grad-CAM Heatmap
                    </button>
                    {diagnostics.has_mask && (
                      <button 
                        className={`toggle-btn ${viewMode === 'mask' ? 'active' : ''}`}
                        onClick={() => setViewMode('mask')}
                      >
                        AI Tumor Mask
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Viewport for images */}
              <div className="scan-viewport">
                {uploading ? (
                  <div style={{textAlign: 'center', color: 'var(--text-secondary)'}}>
                    <RefreshCw className="upload-icon" size={48} style={{animation: 'spin 2s linear infinite'}} />
                    <p>Uploading and Preprocessing Scan...</p>
                  </div>
                ) : analyzing ? (
                  <div style={{textAlign: 'center', color: 'var(--text-secondary)'}}>
                    <div className="scanner-line"></div>
                    <Activity className="upload-icon" size={48} />
                    <p>AI Engine Executing Inference Modules...</p>
                  </div>
                ) : currentScan ? (
                  <>
                    <div className="crosshairs"></div>
                    {analyzing && <div className="scanner-line"></div>}
                    
                    <img 
                      className="scan-image" 
                      src={`${API_BASE}${
                        viewMode === 'original' 
                          ? currentScan.original_url 
                          : viewMode === 'heatmap' 
                            ? diagnostics?.heatmap_url 
                            : diagnostics?.mask_url
                      }`} 
                      alt="Diagnostic Scan Viewport" 
                      style={{
                        filter: `brightness(${100 + brightness}%) contrast(${contrast})`
                      }}
                    />
                    <div className="scanner-overlay"></div>
                  </>
                ) : (
                  <label className="upload-container" htmlFor="scan-file-input">
                    <Upload className="upload-icon" />
                    <h3 style={{marginBottom: '0.5rem', fontFamily: 'var(--font-display)'}}>Load Medical DICOM / Scan</h3>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>Drag & drop or click to upload .dcm, .png, .jpg, .jpeg</p>
                    <input 
                      type="file" 
                      id="scan-file-input" 
                      style={{display: 'none'}} 
                      onChange={handleFileUpload} 
                      accept=".dcm,.png,.jpg,.jpeg"
                    />
                  </label>
                )}
              </div>

              {/* DICOM Adjustments */}
              <div className="dicom-controls">
                <div className="control-group">
                  <div className="control-label">
                    <span>DICOM Brightness (Window Offset)</span>
                    <span>{brightness > 0 ? `+${brightness}` : brightness}%</span>
                  </div>
                  <input 
                    className="slider-input" 
                    type="range" 
                    min="-100" 
                    max="100" 
                    value={brightness} 
                    onChange={(e) => setBrightness(Number(e.target.value))} 
                    disabled={!currentScan}
                  />
                </div>
                <div className="control-group">
                  <div className="control-label">
                    <span>DICOM Contrast (Window Width)</span>
                    <span>{contrast.toFixed(1)}x</span>
                  </div>
                  <input 
                    className="slider-input" 
                    type="range" 
                    min="0.5" 
                    max="3.0" 
                    step="0.1" 
                    value={contrast} 
                    onChange={(e) => setContrast(Number(e.target.value))} 
                    disabled={!currentScan}
                  />
                </div>
              </div>
            </div>

            {/* Diagnostic Details Side Panel */}
            <div className="telemetry-pane">
              {currentScan && (
                <div className="metadata-card">
                  <h3 className="analytics-title" style={{fontSize: '1rem', marginBottom: '1rem'}}>
                    Patient DICOM Metadata
                  </h3>
                  <div className="metadata-grid">
                    <span className="meta-label">Patient ID:</span>
                    <span className="meta-value">{currentScan.metadata.patient_id}</span>
                    <span className="meta-label">Name:</span>
                    <span className="meta-value">{currentScan.metadata.patient_name}</span>
                    <span className="meta-label">Age / Gender:</span>
                    <span className="meta-value">{currentScan.metadata.patient_age} / {currentScan.metadata.patient_gender}</span>
                    <span className="meta-label">Modality:</span>
                    <span className="meta-value">{currentScan.metadata.modality}</span>
                    <span className="meta-label">Study Date:</span>
                    <span className="meta-value">{currentScan.metadata.study_date}</span>
                  </div>
                </div>
              )}

              {currentScan && !diagnostics && (
                <div className="metadata-card" style={{textAlign: 'center'}}>
                  <p style={{color: 'var(--text-secondary)', marginBottom: '1rem'}}>
                    Ready for AI deep-learning diagnostic classifier.
                  </p>
                  <button className="action-btn" onClick={runDiagnosis} disabled={analyzing}>
                    Run Inference Detection
                  </button>
                </div>
              )}

              {diagnostics && (
                <>
                  <div className="metadata-card">
                    <h3 className="analytics-title" style={{fontSize: '1.1rem', marginBottom: '0.75rem'}}>
                      AI Classifier Diagnosis
                    </h3>
                    <h2 style={{color: 'var(--color-brand)', fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem'}}>
                      {diagnostics.disease}
                    </h2>
                    
                    <div className="risk-meter-container">
                      <span style={{fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-secondary)'}}>
                        Confidence Level: {(diagnostics.confidence * 100).toFixed(1)}%
                      </span>
                      <span className={`risk-pill ${diagnostics.risk_level.toLowerCase()}`}>
                        {diagnostics.risk_level} Risk
                      </span>
                    </div>

                    <div className="gauge-track">
                      <div 
                        className="gauge-fill" 
                        style={{
                          width: `${diagnostics.confidence * 100}%`,
                          backgroundColor: diagnostics.risk_level === 'High' ? 'var(--color-danger)' : (diagnostics.risk_level === 'Medium' ? 'var(--color-warning)' : 'var(--color-success)')
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Quantitative analysis values (DICOM/Tumor parameters) */}
                  <div className="metadata-card">
                    <h3 className="analytics-title" style={{fontSize: '1rem', marginBottom: '1rem'}}>
                      Quantitative Telemetry
                    </h3>
                    <div className="metadata-grid">
                      {Object.entries(diagnostics.stats).map(([k, v]) => (
                        <React.Fragment key={k}>
                          <span className="meta-label" style={{textTransform: 'capitalize'}}>{k.replace('_', ' ')}:</span>
                          <span className="meta-value" style={{color: 'var(--color-accent)'}}>{v}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="metadata-card" style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                    <h3 className="analytics-title" style={{fontSize: '1rem', marginBottom: '0.75rem'}}>
                      Clinical Summary
                    </h3>
                    <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem', flex: 1}}>
                      {diagnostics.clinical_summary}
                    </p>

                    <h4 style={{fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem'}}>
                      Recommended Interventions
                    </h4>
                    <ul style={{fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '1.25rem', marginBottom: '1.5rem'}}>
                      {diagnostics.recommendations.map((rec, idx) => (
                        <li key={idx} style={{marginBottom: '0.25rem'}}>{rec}</li>
                      ))}
                    </ul>

                    <div style={{display: 'flex', gap: '0.75rem'}}>
                      <button className="action-btn" onClick={() => openReportModal(diagnostics)}>
                        <FileText size={18} />
                        Generate Report
                      </button>
                      <button 
                        className="secondary-btn" 
                        style={{padding: '0.9rem'}}
                        onClick={() => {
                          setDiagnostics(null);
                          setCurrentScan(null);
                          setViewMode('original');
                        }}
                      >
                        Reset Console
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* REPORT OVERLAY MODAL */}
      {selectedReport && (
        <div className="report-overlay">
          <div className="report-modal">
            <div className="report-modal-header">
              <h3 style={{fontFamily: 'var(--font-display)', fontWeight: 700}}>Case Report Generator</h3>
              <button 
                style={{background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)'}}
                onClick={() => setSelectedReport(null)}
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="report-modal-content" id="printable-report-area">
              <div className="report-title-header">
                <h1 style={{fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.025em', color: '#0f172a'}}>MEDVISION AI CLINICAL REPORT</h1>
                <p style={{fontSize: '0.85rem', color: '#64748b', fontWeight: 500}}>{selectedReport.institution}</p>
                <p style={{fontSize: '0.8rem', color: '#94a3b8'}}>Generated: {selectedReport.generated_at}</p>
              </div>

              <div className="report-meta-grid">
                <div>
                  <h4 className="report-section-title">Patient Demographics</h4>
                  <p><strong>Patient ID:</strong> {selectedReport.patient.id}</p>
                  <p><strong>Full Name:</strong> {selectedReport.patient.name}</p>
                  <p><strong>Age / Gender:</strong> {selectedReport.patient.age} / {selectedReport.patient.gender}</p>
                </div>
                <div>
                  <h4 className="report-section-title">Scan Metadata</h4>
                  <p><strong>Case Number:</strong> {selectedReport.case_id}</p>
                  <p><strong>Exam Modality:</strong> {selectedReport.scan.modality}</p>
                  <p><strong>Study Date:</strong> {selectedReport.scan.date}</p>
                </div>
              </div>

              <div>
                <h4 className="report-section-title">AI Diagnostics Findings</h4>
                <div className="report-findings-box">
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 700}}>
                    <span>Primary Pathology: {selectedReport.findings.detected}</span>
                    <span>Confidence Score: {selectedReport.findings.confidence}</span>
                  </div>
                  <p><strong>Severity Grade:</strong> {selectedReport.findings.severity}</p>
                  <p style={{marginTop: '0.5rem'}}><strong>Diagnostic Summary:</strong> {selectedReport.findings.summary}</p>
                </div>
              </div>

              {Object.keys(selectedReport.findings.stats).length > 0 && (
                <div style={{marginBottom: '2rem'}}>
                  <h4 className="report-section-title">Quantitative Measurements</h4>
                  <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginTop: '0.5rem'}}>
                    <tbody>
                      {Object.entries(selectedReport.findings.stats).map(([k, v]) => (
                        <tr key={k} style={{borderBottom: '1px solid #e2e8f0'}}>
                          <td style={{padding: '0.5rem 0', fontWeight: 600, textTransform: 'capitalize'}}>{k.replace('_', ' ')}</td>
                          <td style={{padding: '0.5rem 0', textAlign: 'right', fontFamily: 'monospace'}}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <h4 className="report-section-title">Intervention & Care Recommendations</h4>
                <ol style={{paddingLeft: '1.5rem', marginTop: '0.5rem'}}>
                  {selectedReport.recommendations.map((rec, idx) => (
                    <li key={idx} style={{marginBottom: '0.5rem'}}>{rec}</li>
                  ))}
                </ol>
              </div>

              <div className="report-footer">
                <p>Disclaimer: This automated diagnostic report is generated by a clinical machine learning model and represents a preliminary screening. It must be reviewed and countersigned by an authorized physician before patient action.</p>
                <div style={{marginTop: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
                  <div>
                    <p style={{fontWeight: 600}}>Countersigned By:</p>
                    <div style={{width: 200, height: 1, borderBottom: '1px dashed #64748b', margin: '1rem 0 0.25rem 0'}}></div>
                    <p style={{fontSize: '0.75rem'}}>Authorized Medical Professional / Radiologist</p>
                  </div>
                  <div>
                    <p><strong>Sign-off Status:</strong> {selectedReport.physician_signoff}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="report-modal-header" style={{borderTop: '1px solid #e2e8f0', borderBottom: 'none', justifyContent: 'flex-end', gap: '0.75rem'}}>
              <button className="secondary-btn" style={{width: 'auto'}} onClick={handlePrint}>
                <Printer size={18} />
                Print Record / Save PDF
              </button>
              <button className="action-btn" style={{width: 'auto'}} onClick={() => downloadJSONReport(selectedReport)}>
                <Download size={18} />
                Export JSON Report
              </button>
              <button className="secondary-btn" style={{width: 'auto'}} onClick={() => setSelectedReport(null)}>
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
