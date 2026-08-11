import React, { useState, useEffect, useMemo, useRef } from "react";
import "./storage.js";
import {
  Truck, ClipboardCheck, Camera, X, Check, AlertTriangle, ShieldCheck,
  Lock, LogIn, Filter, ChevronLeft, Image as ImageIcon, Trash2, ListChecks, Search,
} from "lucide-react";
import crestImg from "./assets/crest.jpeg";

/* ---------- domain constants ---------- */
const COMPANIES = ["א'", "ב'", "ג'", "פלס\"ם", "מסלול"];
const COMPANY_COLORS = {
  "א'": "#2563EB",      // כחול
  "ב'": "#DC2626",      // אדום
  "ג'": "#7C3AED",      // סגול
  "פלס\"ם": "#059669",  // ירוק
  "מסלול": "#64748B",   // אפור ניטרלי (לא צוין צבע)
};
const companyColor = (c) => COMPANY_COLORS[c] || "#64748B";
const MISSIONS = ["חפ\"ק", "כ\"כ", "מנהלתי", "דורס"];
const FUEL_LEVELS = ["מלא", "3/4", "1/2", "1/4"];
const COOLANT_LEVELS = ["מים מעל קו האמצע", "מים בקו האמצע", "מים מתחת לקו האמצע"];
const TOOLS = ["מטף", "ג'ק", "ידית הפעלה", "מפתח גלגלים", "אפוד זוהר", "משולש אזהרה"];
const TRUNK_LOCK = ["קיים", "לא קיים", "לא רלוונטי"];

const MANAGER_PASSWORD = "talat49";

/* ---------- palette ---------- */
const ACCENT = "#E0A32E";
const HEADER = "#1D2027";
const PAGE = "#F3F4F6";
const SURFACE = "#FFFFFF";
const BORDER = "#E3E5EA";
const TEXT = "#1D2027";
const MUTED = "#6B7280";

const STATUS = {
  red: { label: "לא תקין — דורש התייחסות טנ\"א", color: "#C4463A", bg: "#FBE9E7", dot: "#C4463A" },
  yellow: { label: "דורש התייחסות ברמת הפלוגה", color: "#B7791F", bg: "#FCF3D9", dot: "#E0A32E" },
  green: { label: "תקין, ללא תקלות", color: "#2E7D32", bg: "#E7F4E8", dot: "#2E9E3B" },
};

/* ---------- helpers ---------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function resizeImage(file, maxW = 1100, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- color status logic (spec-exact, red > yellow > green) ---------- */
function computeStatus(r) {
  const red = [];
  const yellow = [];

  if (r.sprayers === "לא תקין") red.push("מתיזים לא תקין");
  if (r.tirePressure === "לא תקין") red.push("לחץ אוויר בגלגלים לא תקין");
  if (r.lights === "לא תקין") red.push("תאורה לא תקינה");
  if (r.rearSeatsDamage && r.rearSeatsDamage.trim()) red.push("דווח נזק במושבים האחוריים");
  if (r.photo360 === "לא מאשר") red.push("לא אושר צילום 360°");

  if (r.fuel === "1/4") yellow.push("מפלס דלק 1/4");
  if (r.coolant === "מים מתחת לקו האמצע") yellow.push("מי קירור מתחת לקו האמצע");
  if (r.trunkLock === "לא קיים") yellow.push("אין מנעול לתא מטען");
  if (TOOLS.some((t) => !(r.tools || []).includes(t))) yellow.push("חסר כלי עבודה");
  if (r.additionalFaults && r.additionalFaults.trim()) yellow.push("דווחו תקלות נוספות");

  const status = red.length ? "red" : yellow.length ? "yellow" : "green";
  return { status, reasons: red.length ? red : yellow };
}

/* ---------- small UI atoms ---------- */
function StatusDot({ status, size = 14 }) {
  return (
    <span
      style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%",
        background: STATUS[status].dot, flexShrink: 0,
        boxShadow: "0 0 0 3px " + STATUS[status].bg,
      }}
    />
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px",
      borderRadius: 999, background: s.bg, color: s.color, fontWeight: 700, fontSize: 13,
      border: "1px solid " + s.color + "33",
    }}>
      <StatusDot status={status} size={11} />
      {s.label}
    </span>
  );
}

function CompanyBadge({ company }) {
  const c = companyColor(company);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999,
      background: c + "18", color: c, border: "1px solid " + c + "45", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
      פלוגה {company}
    </span>
  );
}

const emptyForm = () => ({
  vehicleNumber: "", company: "", mission: "", doresNumber: "",
  driver: "", commander: "", fuel: "", coolant: "", sprayers: "",
  engineOilImg: "", rearSeatsDamage: "", rearSeatsImg: "",
  licenseImg: "", tools: [], tirePressure: "", lights: "",
  trunkLock: "", talatSheetImg: "", photo360: "", additionalFaults: "",
});

/* =================================================================== */
export default function App() {
  const [view, setView] = useState("form"); // form | manager
  const [toast, setToast] = useState(null);

  const showToast = (msg, kind = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div style={{ minHeight: "100vh", background: PAGE, color: TEXT, fontFamily: "system-ui, 'Segoe UI', Arial, sans-serif" }}>
      <GlobalStyle />
      <Header view={view} setView={setView} />
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px 14px 60px" }}>
        {view === "form" ? (
          <ReportForm onSaved={() => showToast("הטל\"ת נשלח ונשמר בהצלחה ✓")} onError={(m) => showToast(m, "err")} />
        ) : (
          <ManagerPage onError={(m) => showToast(m, "err")} />
        )}
        <footer style={{ textAlign: "center", color: MUTED, fontSize: 12, marginTop: 28, paddingTop: 16, borderTop: "1px solid " + BORDER }}>
          אתר זה נבנה ע"י גיא גורליק
        </footer>
      </main>
      {toast && (
        <div className={"toast " + (toast.kind === "err" ? "toast-err" : "toast-ok")}>
          {toast.kind === "err" ? <AlertTriangle size={18} /> : <Check size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- header ---------- */
function Header({ view, setView }) {
  return (
    <header style={{ background: HEADER, color: "#fff", borderBottom: "3px solid " + ACCENT }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <img src={crestImg} alt="סמל" style={{ height: 46, width: 46, objectFit: "contain", borderRadius: 8 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.15 }}>טל"ת — בדיקת רכב לפני נסיעה</div>
          <div style={{ fontSize: 12, color: "#B9BDC7" }}>הפרויקטים של Mr.Gor</div>
        </div>
        <nav style={{ display: "flex", gap: 6 }}>
          <button className={"navbtn " + (view === "form" ? "navbtn-on" : "")} onClick={() => setView("form")}>
            <ClipboardCheck size={16} /> טופס
          </button>
          <button className={"navbtn " + (view === "manager" ? "navbtn-on" : "")} onClick={() => setView("manager")}>
            <Lock size={16} /> מפקד
          </button>
        </nav>
      </div>
    </header>
  );
}

/* =================================================================== */
/* ------------------------- REPORT FORM ----------------------------- */
function ReportForm({ onSaved, onError }) {
  const [f, setF] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const live = useMemo(() => computeStatus(f), [f]);

  const toggleTool = (t) =>
    setF((p) => ({ ...p, tools: p.tools.includes(t) ? p.tools.filter((x) => x !== t) : [...p.tools, t] }));

  function validate() {
    const e = {};
    const req = {
      vehicleNumber: "מספר צ' רכב", company: "פלוגה", mission: "משימה",
      driver: "שם נהג", commander: "שם מפקד נסיעה", fuel: "מפלס דלק",
      coolant: "מפלס מי קירור", sprayers: "מתיזים", tirePressure: "לחץ אוויר",
      lights: "תאורה", trunkLock: "מנעול תא מטען", photo360: "אישור צילום 360",
    };
    for (const k in req) if (!String(f[k] || "").trim()) e[k] = true;
    if (f.mission === "דורס" && !f.doresNumber.trim()) e.doresNumber = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate()) {
      onError("יש למלא את כל שדות החובה המסומנים באדום");
      const first = document.querySelector(".field-error");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    try {
      const { status } = computeStatus(f);
      const record = { id: uid(), createdAt: new Date().toISOString(), status, ...f };
      await window.storage.set("talat:" + record.id, JSON.stringify(record), true);
      setF(emptyForm());
      setErrors({});
      window.scrollTo({ top: 0, behavior: "smooth" });
      onSaved();
    } catch (e) {
      onError("שמירה נכשלה — בדוק חיבור אינטרנט ונסה שוב");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <IntroCard />

      <Section n={1} title="מספר צ' רכב">
        <input className={"inp " + (errors.vehicleNumber ? "field-error" : "")} inputMode="numeric"
          placeholder="לדוגמה: 812345" value={f.vehicleNumber} onChange={(e) => set("vehicleNumber", e.target.value)} />
      </Section>

      <Section n={2} title="פלוגה">
        <CompanyChoice value={f.company} onChange={(v) => set("company", v)} error={errors.company} />
      </Section>

      <Section n={3} title="משימה">
        <Choice options={MISSIONS} value={f.mission} onChange={(v) => set("mission", v)} error={errors.mission} />
        {f.mission === "דורס" && (
          <input className={"inp " + (errors.doresNumber ? "field-error" : "")} style={{ marginTop: 10 }}
            placeholder="מספר הדורס" value={f.doresNumber} onChange={(e) => set("doresNumber", e.target.value)} />
        )}
      </Section>

      <Section n={4} title="שם נהג">
        <input className={"inp " + (errors.driver ? "field-error" : "")} placeholder="שם מלא"
          value={f.driver} onChange={(e) => set("driver", e.target.value)} />
      </Section>

      <Section n={5} title="שם מפקד נסיעה">
        <input className={"inp " + (errors.commander ? "field-error" : "")} placeholder="שם מלא"
          value={f.commander} onChange={(e) => set("commander", e.target.value)} />
      </Section>

      <Section n={6} title="מפלס דלק">
        <Choice options={FUEL_LEVELS} value={f.fuel} onChange={(v) => set("fuel", v)} error={errors.fuel} />
      </Section>

      <Section n={7} title="מפלס מי קירור">
        <Choice options={COOLANT_LEVELS} value={f.coolant} onChange={(v) => set("coolant", v)} error={errors.coolant} col />
      </Section>

      <Section n={8} title="מתיזים" hint="בדוק מים, מיכל ווישרים">
        <OkBad value={f.sprayers} onChange={(v) => set("sprayers", v)} error={errors.sprayers} />
      </Section>

      <Section n={9} title="שמן מנוע" hint="יש להוציא ולנגב את המדיד, לטבול שוב, ולצלם את קצה המדיד">
        <ImageField value={f.engineOilImg} onChange={(v) => set("engineOilImg", v)} onError={onError} />
      </Section>

      <Section n={10} title="מושבים אחוריים" hint="צלם ובדוק תקינות מושבים אחוריים, תעד אם יש נזק">
        <input className="inp" placeholder="תיאור נזק (אופציונלי)" value={f.rearSeatsDamage}
          onChange={(e) => set("rearSeatsDamage", e.target.value)} />
        <div style={{ height: 10 }} />
        <ImageField value={f.rearSeatsImg} onChange={(v) => set("rearSeatsImg", v)} onError={onError} />
      </Section>

      <Section n={11} title="רישיון רכב" hint="צלם ובדוק רישיון רכב">
        <ImageField value={f.licenseImg} onChange={(v) => set("licenseImg", v)} onError={onError} />
      </Section>

      <Section n={12} title="כלי עבודה" hint="סמן את כל הכלים הקיימים ברכב">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {TOOLS.map((t) => {
            const on = f.tools.includes(t);
            return (
              <button type="button" key={t} onClick={() => toggleTool(t)}
                className={"toolbtn " + (on ? "toolbtn-on" : "")}>
                <span className={"cbx " + (on ? "cbx-on" : "")}>{on && <Check size={13} />}</span>
                {t}
              </button>
            );
          })}
        </div>
      </Section>

      <Section n={13} title="לחץ אוויר בגלגלים">
        <OkBad value={f.tirePressure} onChange={(v) => set("tirePressure", v)} error={errors.tirePressure} />
      </Section>

      <Section n={14} title="תאורה" hint="בדוק פנסים קדמיים ואחוריים">
        <OkBad value={f.lights} onChange={(v) => set("lights", v)} error={errors.lights} />
      </Section>

      <Section n={15} title="מנעול לתא מטען">
        <Choice options={TRUNK_LOCK} value={f.trunkLock} onChange={(v) => set("trunkLock", v)} error={errors.trunkLock} />
      </Section>

      <Section n={16} title="דף טל&quot;ת פיזי" hint="מלא וצלם דף טל&quot;ת פיזי">
        <ImageField value={f.talatSheetImg} onChange={(v) => set("talatSheetImg", v)} onError={onError} />
      </Section>

      <Section n={17} title="אישור צילום 360°"
        hint="אשר/י שצילמת את הרכב 360° (פנים וחוץ) ושלחת סרטון לקבוצת הטל&quot;ת הפלוגתית">
        <div className={"row2 " + (errors.photo360 ? "field-error" : "")}>
          <button type="button" className={"seg " + (f.photo360 === "מאשר" ? "seg-green" : "")}
            onClick={() => set("photo360", "מאשר")}><Check size={16} /> מאשר</button>
          <button type="button" className={"seg " + (f.photo360 === "לא מאשר" ? "seg-red" : "")}
            onClick={() => set("photo360", "לא מאשר")}><X size={16} /> לא מאשר</button>
        </div>
      </Section>

      <Section n={18} title="תקלות נוספות" hint="אם קיימות תקלות נוספות ברכב, אנא פרט/י (אופציונלי)">
        <textarea className="inp" rows={3} placeholder="פירוט תקלות נוספות…" value={f.additionalFaults}
          onChange={(e) => set("additionalFaults", e.target.value)} />
      </Section>

      {/* live status preview */}
      <div style={{ margin: "18px 0", padding: "14px 16px", background: STATUS[live.status].bg,
        borderRadius: 14, border: "1px solid " + STATUS[live.status].color + "33" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, color: STATUS[live.status].color }}>
          <StatusDot status={live.status} /> חיווי צפוי: {STATUS[live.status].label}
        </div>
        {live.reasons.length > 0 && (
          <ul style={{ margin: "8px 22px 0 0", padding: 0, color: STATUS[live.status].color, fontSize: 13 }}>
            {live.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
      </div>

      <button className="submit" disabled={submitting} onClick={submit}>
        {submitting ? "שולח…" : (<><ShieldCheck size={20} /> שליחת טל"ת</>)}
      </button>
    </div>
  );
}

function IntroCard() {
  return (
    <div style={{ background: SURFACE, border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ background: ACCENT + "22", color: "#9A6B12", borderRadius: 10, padding: 9, flexShrink: 0 }}><Truck size={22} /></div>
      <div style={{ fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
        מלא/י את בדיקת הרכב לפני נסיעה. שדות חובה מסומנים. בסיום — לחצ/י על <b>שליחת טל"ת</b>. הדיווח יישמר במאגר המרכזי ויקבל חיווי תקינות אוטומטי.
      </div>
    </div>
  );
}

/* ---------- form building blocks ---------- */
function Section({ n, title, hint, children }) {
  return (
    <section style={{ background: SURFACE, border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: hint ? 4 : 10 }}>
        <span style={{ background: HEADER, color: "#fff", width: 24, height: 24, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{n}</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h3>
      </div>
      {hint && <div style={{ fontSize: 13, color: MUTED, margin: "0 32px 10px", lineHeight: 1.45 }}>{hint}</div>}
      <div style={{ margin: hint ? "0 0 0 0" : 0 }}>{children}</div>
    </section>
  );
}

function CompanyChoice({ value, onChange, error }) {
  return (
    <div className={error ? "field-error" : ""} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: 8 }}>
      {COMPANIES.map((o) => {
        const c = companyColor(o);
        const on = value === o;
        return (
          <button type="button" key={o} onClick={() => onChange(o)} className="cchip"
            style={{ border: "1.5px solid " + (on ? c : BORDER), background: on ? c : "#fff", color: on ? "#fff" : c }}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Choice({ options, value, onChange, error, col }) {
  return (
    <div className={(error ? "field-error " : "")} style={{ display: "grid", gridTemplateColumns: col ? "1fr" : "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 }}>
      {options.map((o) => (
        <button type="button" key={o} onClick={() => onChange(o)} className={"chip " + (value === o ? "chip-on" : "")}>{o}</button>
      ))}
    </div>
  );
}

function OkBad({ value, onChange, error }) {
  return (
    <div className={"row2 " + (error ? "field-error" : "")}>
      <button type="button" className={"seg " + (value === "תקין" ? "seg-green" : "")} onClick={() => onChange("תקין")}>
        <Check size={16} /> תקין
      </button>
      <button type="button" className={"seg " + (value === "לא תקין" ? "seg-red" : "")} onClick={() => onChange("לא תקין")}>
        <X size={16} /> לא תקין
      </button>
    </div>
  );
}

function ImageField({ value, onChange, onError }) {
  const camRef = useRef(null);
  const galRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handle(file) {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImage(file);
      onChange(dataUrl);
    } catch (e) {
      onError && onError("טעינת התמונה נכשלה, נסה שוב");
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <img src={value} alt="תמונה" style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 12, border: "1px solid " + BORDER, display: "block" }} />
        <button type="button" onClick={() => onChange("")} title="הסר תמונה"
          style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,.65)", color: "#fff", border: "none", borderRadius: 9, padding: 7, cursor: "pointer", display: "flex" }}>
          <Trash2 size={16} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => handle(e.target.files?.[0])} />
      <input ref={galRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handle(e.target.files?.[0])} />
      <button type="button" className="imgbtn" disabled={busy} onClick={() => camRef.current?.click()}>
        <Camera size={18} /> {busy ? "טוען…" : "צילום במצלמה"}
      </button>
      <button type="button" className="imgbtn imgbtn-ghost" disabled={busy} onClick={() => galRef.current?.click()}>
        <ImageIcon size={18} /> מהגלריה
      </button>
    </div>
  );
}

/* =================================================================== */
/* ------------------------- MANAGER PAGE ---------------------------- */
function ManagerPage({ onError }) {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("talat-mgr") === "1");
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);

  function login(e) {
    e && e.preventDefault();
    if (pw === MANAGER_PASSWORD) {
      sessionStorage.setItem("talat-mgr", "1");
      setAuthed(true);
    } else {
      setPwErr(true);
    }
  }

  if (!authed) {
    return (
      <form onSubmit={login} style={{ maxWidth: 360, margin: "40px auto 0", background: SURFACE, border: "1px solid " + BORDER, borderRadius: 16, padding: 24, textAlign: "center" }}>
        <div style={{ background: HEADER, color: "#fff", width: 56, height: 56, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <Lock size={26} />
        </div>
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>כניסת מפקד</h2>
        <p style={{ color: MUTED, fontSize: 14, margin: "0 0 18px" }}>הזן/י סיסמה לצפייה במאגר הדיווחים</p>
        <input className={"inp " + (pwErr ? "field-error" : "")} type="password" placeholder="סיסמה" autoFocus
          value={pw} onChange={(e) => { setPw(e.target.value); setPwErr(false); }} style={{ textAlign: "center", marginBottom: 12 }} />
        {pwErr && <div style={{ color: "#C4463A", fontSize: 13, marginBottom: 12 }}>סיסמה שגויה</div>}
        <button className="submit" type="submit"><LogIn size={18} /> כניסה</button>
      </form>
    );
  }

  return <ManagerDatabase onError={onError} />;
}

function ManagerDatabase({ onError }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fDriver, setFDriver] = useState("");
  const [fCommander, setFCommander] = useState("");
  const [fStatus, setFStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.getAll("talat:", true);
        const list = (res?.items || [])
          .map((it) => { try { return JSON.parse(it.value); } catch (e) { return null; } })
          .filter(Boolean)
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        setRecords(list);
      } catch (e) {
        onError && onError("טעינת המאגר נכשלה");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const drivers = useMemo(() => [...new Set(records.map((r) => r.driver).filter(Boolean))].sort(), [records]);
  const commanders = useMemo(() => [...new Set(records.map((r) => r.commander).filter(Boolean))].sort(), [records]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return records.filter((r) => {
      if (fCompany && r.company !== fCompany) return false;
      if (fDriver && r.driver !== fDriver) return false;
      if (fCommander && r.commander !== fCommander) return false;
      if (fStatus && r.status !== fStatus) return false;
      if (needle) {
        const hay = [r.vehicleNumber, r.driver, r.commander, r.company, r.mission, r.doresNumber, r.additionalFaults]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [records, q, fCompany, fDriver, fCommander, fStatus]);

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    records.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [records]);

  const clearFilters = () => { setQ(""); setFCompany(""); setFDriver(""); setFCommander(""); setFStatus(""); };
  const hasFilters = q || fCompany || fDriver || fCommander || fStatus;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 14px" }}>
        <ListChecks size={22} color={ACCENT} />
        <h2 style={{ margin: 0, fontSize: 20 }}>מאגר דיווחי טל"ת</h2>
        <span style={{ color: MUTED, fontSize: 14 }}>({records.length})</span>
      </div>

      {/* status summary */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["red", "yellow", "green"].map((s) => (
          <button key={s} onClick={() => setFStatus(fStatus === s ? "" : s)}
            style={{ flex: 1, cursor: "pointer", border: "1px solid " + (fStatus === s ? STATUS[s].color : BORDER),
              background: fStatus === s ? STATUS[s].bg : SURFACE, borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: STATUS[s].color }}>{counts[s] || 0}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: MUTED }}>
              <StatusDot status={s} size={9} /> {s === "red" ? "אדום" : s === "yellow" ? "צהוב" : "ירוק"}
            </div>
          </button>
        ))}
      </div>

      {/* filters */}
      <div style={{ background: SURFACE, border: "1px solid " + BORDER, borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: MUTED, fontSize: 13, fontWeight: 600 }}>
          <Filter size={15} /> סינון
          {hasFilters && <button onClick={clearFilters} style={{ marginRight: "auto", background: "none", border: "none", color: ACCENT, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>נקה</button>}
        </div>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <Search size={17} color={MUTED} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input className="inp" style={{ paddingRight: 36 }} placeholder="חיפוש חופשי (צ' רכב, נהג, מפקד, משימה…)"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <select className="inp" value={fCompany} onChange={(e) => setFCompany(e.target.value)}>
            <option value="">כל הפלוגות</option>
            {COMPANIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="inp" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="">כל הסטטוסים</option>
            <option value="red">🔴 אדום</option>
            <option value="yellow">🟡 צהוב</option>
            <option value="green">🟢 ירוק</option>
          </select>
          <select className="inp" value={fDriver} onChange={(e) => setFDriver(e.target.value)}>
            <option value="">כל הנהגים</option>
            {drivers.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="inp" value={fCommander} onChange={(e) => setFCommander(e.target.value)}>
            <option value="">כל המפקדים</option>
            {commanders.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: MUTED, padding: 40 }}>טוען…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: MUTED, padding: 40, background: SURFACE, borderRadius: 12, border: "1px dashed " + BORDER }}>
          {records.length === 0 ? "עדיין לא נשלחו דיווחים" : "אין דיווחים התואמים לסינון"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((r) => (
            <button key={r.id} onClick={() => setSelected(r)} className="reccard">
              <span style={{ width: 5, alignSelf: "stretch", borderRadius: 4, background: companyColor(r.company), flexShrink: 0 }} />
              <StatusDot status={r.status} />
              <div style={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>צ' {r.vehicleNumber || "—"}</span>
                  <CompanyBadge company={r.company} />
                </div>
                <div style={{ fontSize: 13, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.mission}{r.mission === "דורס" && r.doresNumber ? ` (${r.doresNumber})` : ""} · נהג: {r.driver} · מפקד: {r.commander}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{fmtDateTime(r.createdAt)}</div>
              </div>
              <ChevronLeft size={20} color={MUTED} />
            </button>
          ))}
        </div>
      )}

      {selected && <DetailModal record={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DetailModal({ record: r, onClose }) {
  const { status, reasons } = computeStatus(r);
  const images = [
    ["שמן מנוע", r.engineOilImg],
    ["מושבים אחוריים", r.rearSeatsImg],
    ["רישיון רכב", r.licenseImg],
    ["דף טל\"ת פיזי", r.talatSheetImg],
  ].filter(([, v]) => v);

  const rows = [
    ["מספר צ' רכב", r.vehicleNumber],
    ["פלוגה", r.company],
    ["משימה", r.mission + (r.mission === "דורס" && r.doresNumber ? ` — דורס ${r.doresNumber}` : "")],
    ["שם נהג", r.driver],
    ["שם מפקד נסיעה", r.commander],
    ["מפלס דלק", r.fuel],
    ["מפלס מי קירור", r.coolant],
    ["מתיזים", r.sprayers],
    ["נזק במושבים אחוריים", r.rearSeatsDamage || "לא דווח"],
    ["כלי עבודה", (r.tools && r.tools.length) ? r.tools.join(", ") : "לא סומנו"],
    ["כלים חסרים", TOOLS.filter((t) => !(r.tools || []).includes(t)).join(", ") || "אין"],
    ["לחץ אוויר בגלגלים", r.tirePressure],
    ["תאורה", r.lights],
    ["מנעול תא מטען", r.trunkLock],
    ["אישור צילום 360°", r.photo360],
    ["תקלות נוספות", r.additionalFaults || "אין"],
  ];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ borderTop: "5px solid " + companyColor(r.company) }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            צ' {r.vehicleNumber} <CompanyBadge company={r.company} />
          </div>
          <button onClick={onClose} className="xbtn"><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>{fmtDateTime(r.createdAt)}</div>

        <div style={{ marginBottom: 14 }}><StatusBadge status={status} /></div>
        {reasons.length > 0 && (
          <div style={{ background: STATUS[status].bg, border: "1px solid " + STATUS[status].color + "33", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
            <ul style={{ margin: 0, paddingRight: 18, color: STATUS[status].color, fontSize: 13 }}>
              {reasons.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: "1px solid " + BORDER }}>
                <td style={{ padding: "9px 4px", color: MUTED, whiteSpace: "nowrap", verticalAlign: "top", width: "42%" }}>{k}</td>
                <td style={{ padding: "9px 4px", fontWeight: 600 }}>{v || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {images.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Camera size={17} /> תמונות</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {images.map(([label, src]) => (
                <a key={label} href={src} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                  <img src={src} alt={label} style={{ width: "100%", borderRadius: 10, border: "1px solid " + BORDER, display: "block" }} />
                  <div style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 3 }}>{label}</div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- global styles ---------- */
function GlobalStyle() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body { margin: 0; }
      .inp {
        width: 100%; padding: 11px 12px; border: 1px solid ${BORDER}; border-radius: 10px;
        font-size: 15px; font-family: inherit; background: #fff; color: ${TEXT}; outline: none;
      }
      .inp:focus { border-color: ${ACCENT}; box-shadow: 0 0 0 3px ${ACCENT}22; }
      textarea.inp { resize: vertical; }
      .field-error, .field-error .chip, .inp.field-error { border-color: #C4463A !important; }
      .field-error { box-shadow: 0 0 0 3px #C4463A22; border-radius: 10px; }

      .chip {
        padding: 11px 10px; border: 1px solid ${BORDER}; background: #fff; border-radius: 10px;
        font-size: 15px; font-weight: 600; cursor: pointer; color: ${TEXT}; transition: .12s; font-family: inherit;
      }
      .chip:hover { border-color: ${ACCENT}; }
      .chip-on { background: ${HEADER}; color: #fff; border-color: ${HEADER}; }

      .cchip {
        padding: 11px 10px; border-radius: 10px; font-size: 15px; font-weight: 800;
        cursor: pointer; font-family: inherit; transition: .12s;
      }
      .cchip:hover { filter: brightness(0.97); box-shadow: 0 0 0 3px rgba(0,0,0,.04); }

      .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; border-radius: 10px; }
      .seg {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        padding: 12px; border: 1px solid ${BORDER}; background: #fff; border-radius: 10px;
        font-size: 15px; font-weight: 700; cursor: pointer; color: ${TEXT}; font-family: inherit;
      }
      .seg-green { background: ${STATUS.green.bg}; border-color: ${STATUS.green.color}; color: ${STATUS.green.color}; }
      .seg-red { background: ${STATUS.red.bg}; border-color: ${STATUS.red.color}; color: ${STATUS.red.color}; }

      .toolbtn {
        display: flex; align-items: center; gap: 9px; padding: 11px 12px; border: 1px solid ${BORDER};
        background: #fff; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;
        color: ${TEXT}; text-align: right; font-family: inherit;
      }
      .toolbtn-on { border-color: ${STATUS.green.color}; background: ${STATUS.green.bg}; }
      .cbx { width: 20px; height: 20px; border-radius: 6px; border: 2px solid ${BORDER}; display: inline-flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; }
      .cbx-on { background: ${STATUS.green.color}; border-color: ${STATUS.green.color}; }

      .imgbtn {
        display: inline-flex; align-items: center; gap: 8px; padding: 12px 16px; border: none;
        background: ${HEADER}; color: #fff; border-radius: 10px; font-size: 15px; font-weight: 600;
        cursor: pointer; font-family: inherit;
      }
      .imgbtn-ghost { background: #fff; color: ${TEXT}; border: 1px solid ${BORDER}; }
      .imgbtn:disabled { opacity: .6; }

      .submit {
        width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
        padding: 16px; border: none; border-radius: 14px; background: ${ACCENT}; color: #1D2027;
        font-size: 18px; font-weight: 800; cursor: pointer; font-family: inherit;
        box-shadow: 0 4px 14px ${ACCENT}55;
      }
      .submit:disabled { opacity: .7; cursor: default; }

      .navbtn {
        display: inline-flex; align-items: center; gap: 5px; padding: 8px 12px; border-radius: 9px;
        border: 1px solid #ffffff33; background: transparent; color: #fff; font-size: 14px; font-weight: 600;
        cursor: pointer; font-family: inherit;
      }
      .navbtn-on { background: ${ACCENT}; color: #1D2027; border-color: ${ACCENT}; }

      .reccard {
        display: flex; align-items: center; gap: 12px; width: 100%; text-align: right;
        background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 12px; padding: 12px 14px;
        cursor: pointer; font-family: inherit; color: ${TEXT};
      }
      .reccard:hover { border-color: ${ACCENT}; }

      .overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: flex-end;
        justify-content: center; z-index: 50; padding: 0;
      }
      .sheet {
        background: ${PAGE}; width: 100%; max-width: 720px; max-height: 92vh; overflow-y: auto;
        border-radius: 18px 18px 0 0; padding: 18px 16px 40px;
      }
      @media (min-width: 600px) {
        .overlay { align-items: center; padding: 20px; }
        .sheet { border-radius: 18px; }
      }
      .xbtn { background: #fff; border: 1px solid ${BORDER}; border-radius: 9px; padding: 6px; cursor: pointer; color: ${TEXT}; display: flex; }

      .toast {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 100;
        display: flex; align-items: center; gap: 8px; padding: 13px 18px; border-radius: 12px;
        color: #fff; font-weight: 700; font-size: 15px; box-shadow: 0 8px 24px rgba(0,0,0,.25);
        max-width: 92vw;
      }
      .toast-ok { background: #2E7D32; }
      .toast-err { background: #C4463A; }
    `}</style>
  );
}
