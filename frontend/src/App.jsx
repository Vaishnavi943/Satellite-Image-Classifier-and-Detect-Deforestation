import { useState, useRef, useEffect } from "react";

const API_BASE =  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const ICONS = {
  Forest:"🌲", AnnualCrop:"🌾", HerbaceousVegetation:"🌿",
  Highway:"🛣️", Industrial:"🏭", Pasture:"🐄",
  PermanentCrop:"🍇", Residential:"🏘️", River:"🌊", SeaLake:"💧",
};

const SEVERITY_STYLES = {
  none:     { bg:"#0a1628", border:"#1e3a5f", badge:"#7dd3fc", badgeBg:"#082f49", icon:"✓"  },
  positive: { bg:"#0a1f0a", border:"#166534", badge:"#86efac", badgeBg:"#14532d", icon:"🌱" },
  low:      { bg:"#0a1628", border:"#1e3a5f", badge:"#7dd3fc", badgeBg:"#082f49", icon:"ℹ"  },
  moderate: { bg:"#1c1200", border:"#854f0b", badge:"#fcd34d", badgeBg:"#451a03", icon:"⚠"  },
  high:     { bg:"#1a0a00", border:"#9a3412", badge:"#fdba74", badgeBg:"#431407", icon:"🔶" },
  critical: { bg:"#1a0000", border:"#991b1b", badge:"#fca5a5", badgeBg:"#450a0a", icon:"🚨" },
};

function getGrade(c) {
  if (c >= 0.95) return { g:"A+", color:"#22c55e" };
  if (c >= 0.85) return { g:"A",  color:"#22c55e" };
  if (c >= 0.70) return { g:"B",  color:"#86efac" };
  if (c >= 0.55) return { g:"C",  color:"#f59e0b" };
  if (c >= 0.40) return { g:"D",  color:"#ef4444" };
  return               { g:"F",  color:"#ef4444" };
}

function barColor(c) {
  return c >= 0.85 ? "#22c55e" : c >= 0.55 ? "#f59e0b" : "#ef4444";
}

// ============================================================
// ARC GAUGE
// ============================================================
function ArcGauge({ value }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 150); return () => clearTimeout(t); }, [value]);
  const ARC = 157;
  const col = barColor(value);
  const grade = getGrade(value);
  const label = value >= 0.95 ? "Very high confidence"
              : value >= 0.85 ? "High confidence"
              : value >= 0.70 ? "Good confidence"
              : value >= 0.55 ? "Moderate confidence" : "Low confidence";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:20, padding:"14px 16px",
                  background:"#0a0f0a", borderRadius:10, border:"1px solid #1a1f1a", marginTop:14 }}>
      <div style={{ position:"relative", width:110, height:62, flexShrink:0 }}>
        <svg width="110" height="62" viewBox="0 0 130 72" style={{ overflow:"visible" }}>
          <path d="M10,65 A55,55 0 0,1 120,65" fill="none" stroke="#1f2937" strokeWidth="10" strokeLinecap="round"/>
          <path d="M10,65 A55,55 0 0,1 120,65" fill="none" stroke={col} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={ARC} strokeDashoffset={on ? ARC*(1-value) : ARC}
            style={{ transition:"stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }}/>
        </svg>
        <div style={{ position:"absolute", bottom:0, left:"50%", transform:"translateX(-50%)", textAlign:"center" }}>
          <p style={{ margin:0, fontSize:20, fontWeight:700, color:col, lineHeight:1 }}>{Math.round(value*100)}%</p>
          <p style={{ margin:0, fontSize:10, color:"#6b7280" }}>{grade.g}</p>
        </div>
      </div>
      <div>
        <p style={{ margin:"0 0 2px", fontSize:14, fontWeight:600, color:col }}>{label}</p>
        <p style={{ margin:0, fontSize:12, color:"#6b7280" }}>Model confidence score</p>
      </div>
    </div>
  );
}

// ============================================================
// CONFIDENCE CHART — only meaningful probabilities
// ============================================================
function ConfidenceChart({ probs, predicted }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 80); return () => clearTimeout(t); }, [probs]);

  const sorted  = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  const maxVal  = sorted[0][1];
  // Show only classes >= 0.1%, always include top prediction, max 5 rows
  const visible = sorted.filter(([cls, prob]) => prob >= 0.001 || cls === predicted).slice(0, 5);
  const hidden  = sorted.length - visible.length;

  return (
    <div style={{ marginTop:14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <p style={{ margin:0, fontSize:12, fontWeight:500, color:"#4b5563",
                    textTransform:"uppercase", letterSpacing:1 }}>
          Confidence breakdown
        </p>
        {hidden > 0 && (
          <span style={{ fontSize:11, color:"#374151" }}>
            +{hidden} class{hidden>1?"es":""} &lt;0.1% not shown
          </span>
        )}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {visible.map(([cls, prob], i) => {
          const isTop = cls === predicted;
          const pct   = prob >= 0.001 ? (prob*100).toFixed(1) : "<0.1";
          const w     = on ? `${(prob/maxVal)*100}%` : "0%";
          const grade = getGrade(prob);
          return (
            <div key={cls} style={{
              display:"flex", alignItems:"center", gap:10,
              padding:"8px 12px", borderRadius:8,
              background: isTop ? "#0a1f0a" : "#0a0f0a",
              border: isTop ? "1px solid #166534" : "1px solid #1a1f1a",
            }}>
              <span style={{ fontSize:16, width:20, textAlign:"center", flexShrink:0 }}>
                {ICONS[cls]||"🌍"}
              </span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                  <span style={{ fontSize:13, fontWeight: isTop?600:400,
                                 color: isTop?"#86efac":"#6b7280" }}>
                    {cls}
                    {isTop && (
                      <span style={{ marginLeft:7, fontSize:10, fontWeight:700, padding:"1px 6px",
                                     borderRadius:99, color:grade.color,
                                     background:`${grade.color}18`, border:`1px solid ${grade.color}33` }}>
                        {grade.g}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize:12, fontWeight: isTop?700:400, flexShrink:0, marginLeft:8,
                                 color: isTop?barColor(prob):"#374151",
                                 fontVariantNumeric:"tabular-nums" }}>
                    {pct}%
                  </span>
                </div>
                <div style={{ height:5, background:"#1f2937", borderRadius:99, overflow:"hidden" }}>
                  <div style={{
                    height:"100%", borderRadius:99,
                    width:w,
                    background: isTop ? barColor(prob) : "#2d3748",
                    transition:`width ${0.5+i*0.07}s cubic-bezier(.4,0,.2,1)`,
                  }}/>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// DROP ZONE
// ============================================================
function DropZone({ label, file, preview, onFile, inputRef }) {
  const [drag, setDrag] = useState(false);
  const handle = (f) => {
    if (!f || !["image/jpeg","image/png","image/jpg"].includes(f.type)) return;
    onFile(f);
  };
  return (
    <div style={{ flex:1, minWidth:0 }}>
      <p style={{ margin:"0 0 6px", fontSize:11, color:"#6b7280", fontWeight:500,
                  textTransform:"uppercase", letterSpacing:1 }}>{label}</p>
      <div
        style={{ border:`2px dashed ${drag?"#22c55e":"#1f2937"}`, borderRadius:10,
                 background: drag?"#0a1f0a":"transparent",
                 padding: preview?"6px":"28px 16px", textAlign:"center",
                 cursor: preview?"default":"pointer", transition:"all 0.2s",
                 display:"flex", alignItems:"center", justifyContent:"center", minHeight:120 }}
        onDragOver={(e)=>{ e.preventDefault(); setDrag(true); }}
        onDragLeave={()=>setDrag(false)}
        onDrop={(e)=>{ e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
        onClick={()=>!preview&&inputRef.current?.click()}
      >
        {preview
          ? <img src={preview} alt={label} style={{ maxWidth:"100%", maxHeight:160,
              borderRadius:6, objectFit:"contain", imageRendering:"pixelated" }}/>
          : <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:28 }}>📡</span>
              <p style={{ margin:0, fontSize:13, color:"#6b7280" }}>
                Drop or <span style={{ color:"#22c55e" }}>browse</span>
              </p>
            </div>
        }
        <input ref={inputRef} type="file" accept="image/jpeg,image/png"
          style={{ display:"none" }} onChange={e=>handle(e.target.files[0])}/>
      </div>
      {file && <p style={{ margin:"4px 0 0", fontSize:11, color:"#4b5563" }}>📎 {file.name}</p>}
    </div>
  );
}

// ============================================================
// IMAGE RESULT CARD — clean, no clutter
// ============================================================
function ImageResult({ data, title }) {
  if (!data) return null;
  const conf  = data.confidence;
  const grade = getGrade(conf);
  const col   = barColor(conf);

  return (
    <div style={{ background:"#0d1117", border:"1px solid #1f2937", borderRadius:12, padding:"18px 20px" }}>
      {title && (
        <p style={{ margin:"0 0 12px", fontSize:11, color:"#4b5563",
                    textTransform:"uppercase", letterSpacing:1, fontWeight:500 }}>{title}</p>
      )}

      {/* Prediction hero */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16,
                    padding:"14px 16px", background:"#0a0f0a",
                    borderRadius:10, border:"1px solid #1a1f1a" }}>
        <span style={{ fontSize:36 }}>{ICONS[data.prediction]||"🌍"}</span>
        <div style={{ flex:1 }}>
          <p style={{ margin:0, fontSize:20, fontWeight:700, color:"#86efac" }}>{data.prediction}</p>
          <p style={{ margin:"2px 0 0", fontSize:12, color:"#6b7280" }}>{data.description}</p>
        </div>
        {/* Grade pill */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                      padding:"8px 14px", borderRadius:8,
                      background:`${col}18`, border:`1.5px solid ${col}44` }}>
          <p style={{ margin:0, fontSize:22, fontWeight:700, color:col }}>{grade.g}</p>
          <p style={{ margin:0, fontSize:10, color:"#6b7280" }}>grade</p>
        </div>
      </div>

      {/* Single confidence bar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <div style={{ flex:1, height:8, background:"#1f2937", borderRadius:99, overflow:"hidden" }}>
          <div style={{ height:"100%", borderRadius:99, width:`${conf*100}%`,
                        background:col, transition:"width 1s ease" }}/>
        </div>
        <span style={{ fontSize:14, fontWeight:700, color:col,
                       minWidth:48, textAlign:"right", fontVariantNumeric:"tabular-nums" }}>
          {(conf*100).toFixed(1)}%
        </span>
      </div>

      {/* Confidence chart — filtered */}
      <ConfidenceChart probs={data.all_probabilities} predicted={data.prediction}/>

      {/* Arc gauge */}
      <ArcGauge value={conf}/>
    </div>
  );
}

// ============================================================
// COMPARISON RESULT
// ============================================================
function ComparisonResult({ result }) {
  if (!result) return null;
  const { before, after, comparison, summary } = result;
  const sev = SEVERITY_STYLES[comparison.severity] || SEVERITY_STYLES.low;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Status banner */}
      <div style={{ background:sev.bg, border:`1px solid ${sev.border}`, borderRadius:12, padding:"16px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize:32 }}>{sev.icon}</span>
          <div style={{ flex:1 }}>
            <p style={{ margin:0, fontSize:19, fontWeight:700, color:sev.badge }}>
              {comparison.status_label}
            </p>
            <p style={{ margin:"2px 0 0", fontSize:13, color:"#9ca3af" }}>{comparison.message}</p>
          </div>
          <span style={{ background:sev.badgeBg, color:sev.badge, border:`1px solid ${sev.border}`,
                         padding:"4px 12px", borderRadius:99, fontSize:11, fontWeight:700,
                         textTransform:"uppercase", letterSpacing:1, flexShrink:0 }}>
            {comparison.severity}
          </span>
        </div>
        <div style={{ marginTop:10, padding:"10px 12px", background:"rgba(0,0,0,0.25)", borderRadius:8 }}>
          <p style={{ margin:0, fontSize:13, color:"#d1d5db" }}>
            <strong style={{ color:sev.badge }}>Action: </strong>{comparison.action}
          </p>
        </div>
      </div>

      {/* Before → After summary row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, alignItems:"center" }}>
        {[
          { label:"Before", cls:summary.before_class, conf:summary.before_confidence_pct },
          { label:"After",  cls:summary.after_class,  conf:summary.after_confidence_pct  },
        ].map((item, idx) => (
          <>
            <div key={item.label} style={{ background:"#0d1117", border:"1px solid #1f2937",
                           borderRadius:10, padding:"14px", textAlign:"center" }}>
              <p style={{ margin:"0 0 6px", fontSize:10, color:"#4b5563",
                          textTransform:"uppercase", letterSpacing:1 }}>{item.label}</p>
              <span style={{ fontSize:26 }}>{ICONS[item.cls]||"🌍"}</span>
              <p style={{ margin:"6px 0 2px", fontSize:14, fontWeight:600, color:"#d1fae5" }}>{item.cls}</p>
              <p style={{ margin:0, fontSize:11, color:"#6b7280" }}>{item.conf}% confidence</p>
            </div>
            {idx === 0 && (
              <div key="arrow" style={{ textAlign:"center", color:"#4b5563" }}>
                <div style={{ fontSize:20 }}>{summary.changed?"→":"="}</div>
                <div style={{ fontSize:10, marginTop:2 }}>{summary.changed?"changed":"same"}</div>
              </div>
            )}
          </>
        ))}
      </div>

      {/* Detailed per-image results */}
      <ImageResult data={before} title="Before image"/>
      <ImageResult data={after}  title="After image"/>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [mode,       setMode]       = useState("compare");
  const [beforeFile, setBeforeFile] = useState(null);
  const [afterFile,  setAfterFile]  = useState(null);
  const [beforePrev, setBeforePrev] = useState(null);
  const [afterPrev,  setAfterPrev]  = useState(null);
  const [singleFile, setSingleFile] = useState(null);
  const [singlePrev, setSinglePrev] = useState(null);
  const [result,     setResult]     = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);

  const beforeRef = useRef(null);
  const afterRef  = useRef(null);
  const singleRef = useRef(null);

  const reset = () => {
    setBeforeFile(null); setAfterFile(null);
    setBeforePrev(null); setAfterPrev(null);
    setSingleFile(null); setSinglePrev(null);
    setResult(null); setError(null);
    [beforeRef,afterRef,singleRef].forEach(r=>{ if(r.current) r.current.value=""; });
  };

  const runCompare = async () => {
    if (!beforeFile||!afterFile) return;
    setLoading(true); setError(null); setResult(null);
    const form = new FormData();
    form.append("before_image", beforeFile);
    form.append("after_image",  afterFile);
    try {
      const res = await fetch(`${API_BASE}/detect-deforestation`, { method:"POST", body:form });
      if (!res.ok) { const e=await res.json(); throw new Error(e.detail||"Server error"); }
      setResult(await res.json());
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const runSingle = async () => {
    if (!singleFile) return;
    setLoading(true); setError(null); setResult(null);
    const form = new FormData();
    form.append("file", singleFile);
    try {
      const res = await fetch(`${API_BASE}/predict`, { method:"POST", body:form });
      if (!res.ok) { const e=await res.json(); throw new Error(e.detail||"Server error"); }
      setResult(await res.json());
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#030712", color:"#f0fdf4",
                  fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",
                  display:"flex", flexDirection:"column" }}>
      {/* Header */}
      <header style={{ background:"#0a1628", borderBottom:"1px solid #1a3a2a", padding:"14px 24px" }}>
        <div style={{ maxWidth:780, margin:"0 auto", display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:32 }}>🛰️</span>
          <div>
            <h1 style={{ margin:0, fontSize:20, fontWeight:700, color:"#86efac", letterSpacing:"-0.5px" }}>
              SatelliteAI
            </h1>
            <p style={{ margin:0, fontSize:12, color:"#6b7280" }}>
              Land Cover Classification · Deforestation Detection
            </p>
          </div>
        </div>
      </header>

      <main style={{ flex:1, maxWidth:780, width:"100%", margin:"24px auto",
                     padding:"0 16px", display:"flex", flexDirection:"column", gap:14 }}>

        {/* Mode tabs */}
        <div style={{ display:"flex", gap:8 }}>
          {[{k:"compare",l:"🔍 Before & After"},{k:"single",l:"📷 Single Image"}].map(m=>(
            <button key={m.k} onClick={()=>{ setMode(m.k); reset(); }}
              style={{ flex:1, padding:"10px", borderRadius:8, cursor:"pointer",
                       fontSize:13, fontWeight:500, transition:"all 0.2s",
                       background: mode===m.k?"#0a1f0a":"transparent",
                       color:      mode===m.k?"#86efac":"#6b7280",
                       border:     mode===m.k?"1px solid #166534":"1px solid #1f2937" }}>
              {m.l}
            </button>
          ))}
        </div>

        {/* Upload card */}
        <div style={{ background:"#0d1117", border:"1px solid #1f2937", borderRadius:14, padding:"20px 24px" }}>
          {mode==="compare" ? (
            <>
              <h2 style={{ margin:"0 0 4px", fontSize:16, fontWeight:600, color:"#d1fae5" }}>
                Deforestation Detection
              </h2>
              <p style={{ margin:"0 0 16px", fontSize:13, color:"#6b7280" }}>
                Upload the <strong style={{ color:"#86efac" }}>same area</strong> from two different years.
              </p>
              <div style={{ display:"flex", gap:12, marginBottom:14 }}>
                <DropZone label="Before (e.g. 2018)" file={beforeFile} preview={beforePrev}
                  onFile={f=>{setBeforeFile(f);setBeforePrev(URL.createObjectURL(f));setResult(null);}}
                  inputRef={beforeRef}/>
                <DropZone label="After (e.g. 2024)"  file={afterFile}  preview={afterPrev}
                  onFile={f=>{setAfterFile(f);setAfterPrev(URL.createObjectURL(f));setResult(null);}}
                  inputRef={afterRef}/>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button
                  onClick={runCompare} disabled={!beforeFile||!afterFile||loading}
                  style={{ padding:"10px 20px", borderRadius:8, border:"none", cursor:"pointer",
                           fontSize:14, fontWeight:600, background:"#16a34a", color:"#fff",
                           opacity:(!beforeFile||!afterFile||loading)?0.4:1 }}>
                  {loading?"Analysing…":"🔍 Detect Deforestation"}
                </button>
                {(beforeFile||afterFile||result) && (
                  <button onClick={reset}
                    style={{ padding:"10px 16px", borderRadius:8, cursor:"pointer",
                             fontSize:14, background:"transparent", color:"#6b7280",
                             border:"1px solid #1f2937" }}>
                    ✕ Reset
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 style={{ margin:"0 0 4px", fontSize:16, fontWeight:600, color:"#d1fae5" }}>
                Single Image Classify
              </h2>
              <p style={{ margin:"0 0 14px", fontSize:13, color:"#6b7280" }}>
                Upload one satellite patch to detect its land cover type.
              </p>
              <DropZone label="Satellite image" file={singleFile} preview={singlePrev}
                onFile={f=>{setSingleFile(f);setSinglePrev(URL.createObjectURL(f));setResult(null);}}
                inputRef={singleRef}/>
              <div style={{ display:"flex", gap:8, marginTop:14 }}>
                <button
                  onClick={runSingle} disabled={!singleFile||loading}
                  style={{ padding:"10px 20px", borderRadius:8, border:"none", cursor:"pointer",
                           fontSize:14, fontWeight:600, background:"#16a34a", color:"#fff",
                           opacity:(!singleFile||loading)?0.4:1 }}>
                  {loading?"Classifying…":"🔍 Classify"}
                </button>
                {(singleFile||result) && (
                  <button onClick={reset}
                    style={{ padding:"10px 16px", borderRadius:8, cursor:"pointer",
                             fontSize:14, background:"transparent", color:"#6b7280",
                             border:"1px solid #1f2937" }}>
                    ✕ Reset
                  </button>
                )}
              </div>
            </>
          )}
          {error && (
            <div style={{ marginTop:12, padding:"10px 14px", background:"#450a0a",
                          border:"1px solid #7f1d1d", borderRadius:8, color:"#fca5a5", fontSize:13 }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ background:"#0d1117", border:"1px solid #1f2937", borderRadius:12,
                        padding:"24px", display:"flex", alignItems:"center",
                        justifyContent:"center", gap:12 }}>
            <div style={{ width:28, height:28, border:"3px solid #1f2937",
                          borderTop:"3px solid #22c55e", borderRadius:"50%",
                          animation:"spin 0.8s linear infinite" }}/>
            <p style={{ margin:0, color:"#6b7280", fontSize:13 }}>
              {mode==="compare"?"Classifying both images…":"Running inference…"}
            </p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          mode==="compare"
            ? <ComparisonResult result={result}/>
            : <ImageResult data={result} title=""/>
        )}
      </main>

      <footer style={{ textAlign:"center", padding:"16px", color:"#374151",
                       fontSize:11, borderTop:"1px solid #111827" }}>
        ResNet50 · EuroSAT · 10 land cover classes · FastAPI + React
      </footer>
    </div>
  );
}

const s = document.createElement("style");
s.textContent = `@keyframes spin { to { transform:rotate(360deg); } }`;
document.head.appendChild(s);