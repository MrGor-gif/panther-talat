import React, { useState, useEffect, useMemo, useRef } from "react";
import "./storage.js";
import { queueReport, sendReportToServer, syncPending, countPending } from "./offline.js";
import { pushSupported, isStandalone, getPushState, loadSavedFilters, enablePush, saveFilters, disablePush, sendTestPush, getPushDevices } from "./push.js";
import {
  Truck, ClipboardCheck, Camera, X, Check, AlertTriangle, ShieldCheck,
  Lock, LogIn, LogOut, Filter, ChevronLeft, Image as ImageIcon, Trash2, ListChecks, Search, CheckCircle2, Video,
  ShieldAlert, Pencil, Save, WifiOff, CloudUpload, RefreshCw, Bell, BellOff, Smartphone, ChevronRight,
  BarChart3, TrendingUp,
} from "lucide-react";

// Fault conditions per report (mirrors worker.js paramConditions) — for stats.
function paramConditions(r) {
  return {
    sprayersBad: r.sprayers === "לא תקין",
    tireBad: r.tirePressure === "לא תקין",
    lightsBad: r.lights === "לא תקין",
    no360: r.photo360 === "לא מאשר",
    rearDamage: !!(r.rearSeatsDamage && String(r.rearSeatsDamage).trim()),
    fuelLow: r.fuel === "1/4",
    coolantLow: r.coolant === "מים מתחת לקו האמצע",
    noTrunkLock: r.trunkLock === "לא קיים",
    toolsMissing: TOOLS.some((t) => !(r.tools || []).includes(t)),
    extraFaults: !!(r.additionalFaults && String(r.additionalFaults).trim()),
  };
}

// Specific-fault parameters a commander can subscribe to (keys match worker.js)
const NOTIFY_PARAMS = [
  ["sprayersBad", "מתיזים לא תקין"],
  ["tireBad", "לחץ אוויר לא תקין"],
  ["lightsBad", "תאורה לא תקינה"],
  ["no360", "360° לא מאושר"],
  ["rearDamage", "נזק במושבים אחוריים"],
  ["fuelLow", "מפלס דלק 1/4"],
  ["coolantLow", "מי קירור מתחת לקו האמצע"],
  ["noTrunkLock", "אין מנעול תא מטען"],
  ["toolsMissing", "חסר כלי עבודה"],
  ["extraFaults", "תקלות נוספות"],
];
const NOTIFY_PARAM_LABELS = Object.fromEntries(NOTIFY_PARAMS);
const SEVERITY_LABELS = { red: "אדום", yellow: "צהוב", green: "ירוק" };

// Short human summary of a device's notification filter.
function summarizeFilters(f) {
  const parts = [];
  const comp = f.companies || [], sev = f.severities || [], par = f.params || [];
  parts.push(comp.length ? "פלוגות: " + comp.join(", ") : "כל הפלוגות");
  parts.push(sev.length ? "חומרה: " + sev.map((s) => SEVERITY_LABELS[s] || s).join(", ") : "כל הרמות");
  if (par.length) parts.push(par.map((p) => NOTIFY_PARAM_LABELS[p] || p).join(", "));
  return parts.join(" · ");
}
import crestImg from "./assets/crest-panther.png";

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

const MANAGER_PASSWORD = "talat49"; // צפייה בלבד
const ADMIN_PASSWORD = "manig49";   // מנהל — עריכה ומחיקה

/* ---------- palette ---------- */
const ACCENT = "#E0A32E";
const HEADER = "#1D2027";
const PAGE = "#F3F4F6";
const SURFACE = "#FFFFFF";
const BORDER = "#E3E5EA";
const TEXT = "#1D2027";
const MUTED = "#6B7280";
const DANGER_BAR = "#C4463A";

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
  const [pendingCount, setPendingCount] = useState(0);

  const showToast = (msg, kind = "ok", ms = 3800) => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), ms);
  };

  async function refreshPending() {
    try { setPendingCount(await countPending()); } catch (e) {}
  }

  async function doSync(announce) {
    let n = 0;
    try { n = await syncPending(); } catch (e) {}
    await refreshPending();
    if (n > 0 && announce) {
      showToast(`${n} ${n === 1 ? "דיווח סונכרן" : "דיווחים סונכרנו"} מהמכשיר לשרת ✓`);
    }
    return n;
  }

  useEffect(() => {
    refreshPending();
    doSync(true); // flush anything left from a previous offline session
    const onOnline = () => doSync(true);
    window.addEventListener("online", onOnline);
    // safety-net retry while offline items may be waiting
    const iv = setInterval(() => { if (navigator.onLine) doSync(true); }, 30000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(iv); };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: PAGE, color: TEXT, fontFamily: "system-ui, 'Segoe UI', Arial, sans-serif" }}>
      <GlobalStyle />
      <Header view={view} setView={setView} />
      {pendingCount > 0 && (
        <div style={{ background: "#FCF3D9", borderBottom: "1px solid #E0A32E55", color: "#8A5A00" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 700 }}>
            <WifiOff size={16} />
            {pendingCount === 1 ? "דיווח אחד ממתין" : `${pendingCount} דיווחים ממתינים`} לשליחה — יסונכרנו אוטומטית כשתחזור הקליטה
            <button onClick={() => doSync(true)} title="נסה לסנכרן עכשיו"
              style={{ marginRight: "auto", background: "none", border: "none", color: "#8A5A00", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, fontSize: 13 }}>
              <RefreshCw size={14} /> סנכרן
            </button>
          </div>
        </div>
      )}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px 14px 60px" }}>
        {view === "form" ? (
          <ReportForm
            onSaved={() => { showToast("הטל\"ת נשלח ונשמר בהצלחה ✓"); refreshPending(); }}
            onOfflineSaved={() => { showToast("הטופס נשמר במכשיר וישלח אוטומטית כשתחזור הקליטה", "offline", 5500); refreshPending(); }}
            onError={(m) => showToast(m, "err")}
          />
        ) : (
          <ManagerPage onError={(m) => showToast(m, "err")} notify={(m) => showToast(m)} />
        )}
        <footer style={{ textAlign: "center", color: MUTED, fontSize: 12, marginTop: 28, paddingTop: 16, borderTop: "1px solid " + BORDER }}>
          אתר זה נבנה ע"י גיא גורליק
        </footer>
      </main>
      {toast && (
        <div className={"toast " + (toast.kind === "err" ? "toast-err" : toast.kind === "offline" ? "toast-offline" : "toast-ok")}>
          {toast.kind === "err" ? <AlertTriangle size={18} /> : toast.kind === "offline" ? <WifiOff size={18} /> : <Check size={18} />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- header ---------- */
function Header({ view, setView }) {
  const crestRef = useRef(null);
  const clicksRef = useRef(0);
  const timerRef = useRef(null);

  function handleCrestClick() {
    // אנימציה קטנה בכל לחיצה
    if (crestRef.current && crestRef.current.animate) {
      crestRef.current.animate(
        [
          { transform: "scale(1) rotate(0deg)" },
          { transform: "scale(1.3) rotate(-14deg)" },
          { transform: "scale(1) rotate(0deg)" },
        ],
        { duration: 320, easing: "ease-out" }
      );
    }
    clicksRef.current += 1;
    clearTimeout(timerRef.current);
    if (clicksRef.current >= 5) {
      // easter egg: פתיחת משחק הנחש בכרטיסייה חדשה
      clicksRef.current = 0;
      window.open("https://guyprojact.guygula-gula.workers.dev/snake/", "_blank", "noopener");
    } else {
      // איפוס הרצף אם עוצרים
      timerRef.current = setTimeout(() => { clicksRef.current = 0; }, 1500);
    }
  }

  return (
    <header style={{ background: HEADER, color: "#fff", borderBottom: "3px solid " + ACCENT }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <img ref={crestRef} onClick={handleCrestClick} src={crestImg} alt="סמל הגדוד"
          style={{ height: 48, width: 64, objectFit: "contain", cursor: "pointer", userSelect: "none" }} draggable={false} />
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

/* shared required-field validation (used by create + admin edit) */
function validateTalat(f, { require360 = false } = {}) {
  const e = {};
  const req = ["vehicleNumber", "company", "mission", "driver", "commander", "fuel",
    "coolant", "sprayers", "tirePressure", "lights", "trunkLock", "photo360"];
  for (const k of req) if (!String(f[k] || "").trim()) e[k] = true;
  if (f.mission === "דורס" && !String(f.doresNumber || "").trim()) e.doresNumber = true;
  if (require360 && f.photo360 !== "מאשר") e.photo360 = true;
  return e;
}

/* the 18 טל"ת fields, shared between the create form and the admin edit modal */
function TalatFields({ f, set, errors, onError }) {
  const toggleTool = (t) =>
    set("tools", f.tools.includes(t) ? f.tools.filter((x) => x !== t) : [...f.tools, t]);
  return (
    <>
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

      <Section n={6} title="מפלס דלק" id="sec-fuel">
        <Choice options={FUEL_LEVELS} value={f.fuel} onChange={(v) => set("fuel", v)} error={errors.fuel} />
      </Section>

      <Section n={7} title="מפלס מי קירור">
        <Choice options={COOLANT_LEVELS} value={f.coolant} onChange={(v) => set("coolant", v)} error={errors.coolant} col />
      </Section>

      <Section n={8} title="מתיזים" hint="בדוק מים, מיכל ווישרים" id="sec-sprayers">
        <OkBad value={f.sprayers} onChange={(v) => set("sprayers", v)} error={errors.sprayers} />
      </Section>

      <Section n={9} title="שמן מנוע" hint="יש להוציא ולנגב את המדיד, לטבול שוב, ולצלם את קצה המדיד">
        <ImageField value={f.engineOilImg} onChange={(v) => set("engineOilImg", v)} onError={onError} />
      </Section>

      <Section n={10} title="מושבים אחוריים" hint="צלם ובדוק תקינות מושבים אחוריים, תעד אם יש נזק" id="sec-seats">
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

      <Section n={13} title="לחץ אוויר בגלגלים" id="sec-tire">
        <OkBad value={f.tirePressure} onChange={(v) => set("tirePressure", v)} error={errors.tirePressure} />
      </Section>

      <Section n={14} title="תאורה" hint="בדוק פנסים קדמיים ואחוריים" id="sec-lights">
        <OkBad value={f.lights} onChange={(v) => set("lights", v)} error={errors.lights} />
      </Section>

      <Section n={15} title="מנעול לתא מטען" id="sec-trunk">
        <Choice options={TRUNK_LOCK} value={f.trunkLock} onChange={(v) => set("trunkLock", v)} error={errors.trunkLock} />
      </Section>

      <Section n={16} title="דף טל&quot;ת פיזי" hint="מלא וצלם דף טל&quot;ת פיזי">
        <ImageField value={f.talatSheetImg} onChange={(v) => set("talatSheetImg", v)} onError={onError} />
      </Section>

      <Section n={17} title="אישור צילום 360°" id="sec-360"
        hint="אשר/י שצילמת את הרכב 360° (פנים וחוץ) ושלחת סרטון לקבוצת הטל&quot;ת הפלוגתית · חובה — לא ניתן לשלוח טל&quot;ת ללא אישור סרטון 360°">
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
    </>
  );
}

/* =================================================================== */
/* ------------------------- REPORT FORM ----------------------------- */
function ReportForm({ onSaved, onOfflineSaved, onError }) {
  const [f, setF] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmed, setConfirmed] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const live = useMemo(() => computeStatus(f), [f]);

  function validate() {
    const e = validateTalat(f, { require360: true });
    setErrors(e);
    return e;
  }

  async function submit() {
    const e = validate();
    if (Object.keys(e).length) {
      const only360 = e.photo360 && f.photo360 === "לא מאשר";
      onError(only360
        ? 'לא ניתן לשלוח טל"ת ללא שליחת סרטון 360°'
        : "יש למלא את כל שדות החובה המסומנים באדום");
      const first = document.querySelector(".field-error");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    const { status } = computeStatus(f);
    const record = { id: uid(), createdAt: new Date().toISOString(), status, ...f };
    try {
      // 1) try to send straight to the server (throws if offline/unreachable)
      await sendReportToServer(record);
      setErrors({});
      setConfirmed({ record, pending: false });
      window.scrollTo({ top: 0, behavior: "smooth" });
      onSaved();
    } catch (e) {
      // 2) offline / server unreachable → save on the device, sync later
      try {
        await queueReport(record);
        setErrors({});
        setConfirmed({ record, pending: true });
        window.scrollTo({ top: 0, behavior: "smooth" });
        onOfflineSaved && onOfflineSaved();
      } catch (dbErr) {
        onError("שמירה נכשלה — נסה שוב");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) return <ConfirmationScreen record={confirmed.record} pending={confirmed.pending} onNew={() => { setConfirmed(null); setF(emptyForm()); }} />;

  return (
    <div>
      <IntroCard />

      <VehicleDiagram f={f} onPart={(id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }} />

      <TalatFields f={f} set={set} errors={errors} onError={onError} />

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

/* ---------- interactive vehicle diagram (live on the form) ---------- */
function VehicleDiagram({ f, onPart }) {
  const OK = "#2E9E3B", BAD = "#C4463A", NA = "#8A90A0", NONE = "#D6D9DF";
  const ob = (v) => (v === "תקין" ? OK : v === "לא תקין" ? BAD : NONE);
  const lights = ob(f.lights);
  const tires = ob(f.tirePressure);
  const sprayers = ob(f.sprayers);
  const trunk = f.trunkLock === "קיים" ? OK : f.trunkLock === "לא קיים" ? BAD : f.trunkLock === "לא רלוונטי" ? NA : NONE;
  const seats = (f.rearSeatsDamage && f.rearSeatsDamage.trim()) ? BAD : NONE;
  const p360 = f.photo360 === "מאשר" ? OK : f.photo360 === "לא מאשר" ? BAD : NONE;
  const st = { transition: "fill .3s ease" };

  const P = ({ id, label, children }) => (
    <g onClick={() => onPart && onPart(id)} style={{ cursor: onPart ? "pointer" : "default" }}>
      <title>{label}</title>
      {children}
    </g>
  );

  return (
    <div style={{ background: SURFACE, border: "1px solid " + BORDER, borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
        <Truck size={17} color={ACCENT} /> מצב הרכב
      </div>
      <div style={{ fontSize: 12, color: MUTED, margin: "2px 0 6px" }}>מתעדכן תוך כדי מילוי · לחיצה על חלק קופצת לשדה</div>
      <svg viewBox="0 0 300 182" style={{ width: "100%", maxWidth: 300, display: "block", margin: "0 auto" }}>
        <P id="sec-360" label="אישור צילום 360°">
          <ellipse cx="150" cy="93" rx="143" ry="86" fill="none" stroke={p360} strokeWidth="3" strokeDasharray="7 7" style={st} />
        </P>
        <P id="sec-tire" label="לחץ אוויר בגלגלים">
          <rect x="82" y="36" width="13" height="30" rx="5" fill={tires} style={st} />
          <rect x="205" y="36" width="13" height="30" rx="5" fill={tires} style={st} />
          <rect x="82" y="120" width="13" height="30" rx="5" fill={tires} style={st} />
          <rect x="205" y="120" width="13" height="30" rx="5" fill={tires} style={st} />
        </P>
        <rect x="95" y="18" width="110" height="152" rx="28" fill="#EEF0F3" stroke="#C7CAD1" strokeWidth="2" />
        <P id="sec-lights" label="תאורה">
          <rect x="104" y="20" width="20" height="9" rx="4" fill={lights} style={st} />
          <rect x="176" y="20" width="20" height="9" rx="4" fill={lights} style={st} />
          <rect x="104" y="159" width="20" height="9" rx="4" fill={lights} style={st} />
          <rect x="176" y="159" width="20" height="9" rx="4" fill={lights} style={st} />
        </P>
        <P id="sec-sprayers" label="מתיזים (וישרים)">
          <path d="M112 62 L124 36 L176 36 L188 62 Z" fill={sprayers} opacity="0.92" style={st} />
        </P>
        <P id="sec-seats" label="מושבים אחוריים">
          <rect x="116" y="98" width="30" height="26" rx="5" fill={seats} style={st} />
          <rect x="154" y="98" width="30" height="26" rx="5" fill={seats} style={st} />
        </P>
        <P id="sec-trunk" label="מנעול תא מטען">
          <rect x="116" y="140" width="68" height="16" rx="5" fill={trunk} style={st} />
        </P>
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 6, fontSize: 12, color: MUTED, flexWrap: "wrap" }}>
        {[["תקין", OK], ["לא תקין", BAD], ["טרם מולא", NONE]].map(([lbl, c]) => (
          <span key={lbl} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: c }} /> {lbl}
          </span>
        ))}
      </div>
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

/* ---------- confirmation screen (screenshot as proof) ---------- */
function ConfirmationScreen({ record: r, pending, onNew }) {
  const code = ("TLT-" + r.id).toUpperCase();
  const bannerColor = pending ? "#B7791F" : STATUS.green.color;
  const rows = [
    ["מספר צ' רכב", r.vehicleNumber],
    ["משימה", r.mission + (r.mission === "דורס" && r.doresNumber ? ` — דורס ${r.doresNumber}` : "")],
    ["שם נהג", r.driver],
    ["מפקד נסיעה", r.commander],
    ["תאריך ושעה", fmtDateTime(r.createdAt)],
  ];
  return (
    <div>
      <div style={{ background: SURFACE, border: "1px solid " + BORDER, borderRadius: 18, overflow: "hidden", boxShadow: "0 6px 20px rgba(0,0,0,.08)" }}>
        <div style={{ background: bannerColor, color: "#fff", padding: "28px 20px 24px", textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            {pending ? <WifiOff size={44} strokeWidth={2.2} /> : <CheckCircle2 size={46} strokeWidth={2.4} />}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{pending ? "הטל\"ת נשמר במכשיר" : "הטל\"ת בוצע ונשלח בהצלחה"}</div>
          <div style={{ fontSize: 14, opacity: 0.92, marginTop: 4 }}>
            {pending ? "אין כרגע קליטה — הדיווח יישלח אוטומטית כשהקליטה תחזור" : "הדיווח נשמר במאגר הפלוגתי"}
          </div>
        </div>

        <div style={{ padding: "18px 18px 22px" }}>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <CompanyBadge company={r.company} />
            <StatusBadge status={r.status} />
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} style={{ borderBottom: "1px solid " + BORDER }}>
                  <td style={{ padding: "10px 4px", color: MUTED, whiteSpace: "nowrap", width: "42%" }}>{k}</td>
                  <td style={{ padding: "10px 4px", fontWeight: 700 }}>{v || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "11px 14px", background: STATUS.green.bg, border: "1px solid " + STATUS.green.color + "40", borderRadius: 10, color: STATUS.green.color, fontWeight: 700, fontSize: 14 }}>
            <Video size={18} /> סרטון 360° נשלח לקבוצת הטל"ת הפלוגתית
            <CheckCircle2 size={18} style={{ marginRight: "auto" }} />
          </div>

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <div style={{ fontSize: 12, color: MUTED }}>מספר אישור</div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 1, direction: "ltr" }}>{code}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 16, padding: "10px 12px", background: "#FFF8E6", border: "1px dashed " + ACCENT, borderRadius: 10, color: "#8A5A00", fontSize: 13, fontWeight: 600 }}>
            <Camera size={16} /> צלמ/י מסך של מסך זה ושמור/י כאישור ביצוע הטל"ת
          </div>
        </div>
      </div>

      <button className="submit" style={{ marginTop: 16, background: HEADER, color: "#fff", boxShadow: "none" }} onClick={onNew}>
        <ClipboardCheck size={20} /> מילוי טל"ת חדש
      </button>
    </div>
  );
}

/* ---------- form building blocks ---------- */
function Section({ n, title, hint, children, id }) {
  return (
    <section id={id} style={{ background: SURFACE, border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px", marginBottom: 12, scrollMarginTop: 12 }}>
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
function ManagerPage({ onError, notify }) {
  const [role, setRole] = useState(() => sessionStorage.getItem("talat-role"));
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState(false);

  function login(e) {
    e && e.preventDefault();
    let r = null;
    if (pw === ADMIN_PASSWORD) r = "admin";
    else if (pw === MANAGER_PASSWORD) r = "viewer";
    if (r) {
      sessionStorage.setItem("talat-role", r);
      setRole(r);
    } else {
      setPwErr(true);
    }
  }

  function logout() {
    sessionStorage.removeItem("talat-role");
    setRole(null);
    setPw("");
  }

  if (!role) {
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

  return <ManagerDatabase isAdmin={role === "admin"} onLogout={logout} onError={onError} notify={notify} />;
}

function ManagerDatabase({ isAdmin, onLogout, onError, notify }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [vehicleHistory, setVehicleHistory] = useState(null);
  const [tab, setTab] = useState("list"); // list | stats
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fDriver, setFDriver] = useState("");
  const [fCommander, setFCommander] = useState("");
  const [fStatus, setFStatus] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // Load the lightweight summary (no base64 images) so the list is fast.
        // Full images are fetched per report when a card is opened / edited.
        const res = await window.storage.getAll("talat:", true, "img");
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

  // "scoped" = everything except the status filter, so the red/yellow/green
  // counts reflect the chosen company/driver/commander/search.
  const scoped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return records.filter((r) => {
      if (fCompany && r.company !== fCompany) return false;
      if (fDriver && r.driver !== fDriver) return false;
      if (fCommander && r.commander !== fCommander) return false;
      if (needle) {
        const hay = [r.vehicleNumber, r.driver, r.commander, r.company, r.mission, r.doresNumber, r.additionalFaults]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [records, q, fCompany, fDriver, fCommander]);

  const filtered = useMemo(
    () => (fStatus ? scoped.filter((r) => r.status === fStatus) : scoped),
    [scoped, fStatus]
  );

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, green: 0 };
    scoped.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [scoped]);

  // UI pagination — 25 reports per page.
  const PAGE_SIZE = 25;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageItems = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage]
  );
  // reset to first page whenever the filter/search changes
  useEffect(() => { setPage(0); }, [q, fCompany, fDriver, fCommander, fStatus]);

  const clearFilters = () => { setQ(""); setFCompany(""); setFDriver(""); setFCommander(""); setFStatus(""); };
  const hasFilters = q || fCompany || fDriver || fCommander || fStatus;

  async function handleDelete(rec) {
    if (!window.confirm(`למחוק לצמיתות את דיווח הטל"ת של צ' ${rec.vehicleNumber}?\nלא ניתן לשחזר פעולה זו.`)) return;
    try {
      await window.storage.delete("talat:" + rec.id, true);
      setRecords((rs) => rs.filter((r) => r.id !== rec.id));
      setSelected(null);
      notify && notify("הדיווח נמחק");
    } catch (e) {
      onError && onError("מחיקה נכשלה — בדוק חיבור ונסה שוב");
    }
  }

  function handleEditSaved(updated) {
    setRecords((rs) => rs.map((r) => (r.id === updated.id ? updated : r))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")));
    setEditing(null);
    setSelected(null);
    notify && notify("הדיווח עודכן ונשמר");
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 14px", flexWrap: "wrap" }}>
        <ListChecks size={22} color={ACCENT} />
        <h2 style={{ margin: 0, fontSize: 20 }}>מאגר דיווחי טל"ת</h2>
        <span style={{ color: MUTED, fontSize: 14 }}>({records.length})</span>
        {isAdmin && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999,
            background: ACCENT + "22", color: "#8A5A00", border: "1px solid " + ACCENT + "66", fontWeight: 800, fontSize: 12 }}>
            <ShieldAlert size={13} /> מצב מנהל · עריכה ומחיקה
          </span>
        )}
        <button onClick={() => setNotifOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999,
          background: HEADER, color: "#fff", border: "none", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>
          <Bell size={14} /> התראות
        </button>
        {onLogout && (
          <button onClick={onLogout} style={{ marginRight: "auto", background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <LogOut size={14} /> יציאה
          </button>
        )}
      </div>

      <div className="dbtabs">
        <button className={"dbtab " + (tab === "list" ? "dbtab-on" : "")} onClick={() => setTab("list")}><ListChecks size={15} /> רשימה</button>
        <button className={"dbtab " + (tab === "stats" ? "dbtab-on" : "")} onClick={() => setTab("stats")}><BarChart3 size={15} /> סטטיסטיקה</button>
      </div>

      {tab === "stats" ? (
        <Dashboard records={records} />
      ) : (
      <>
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
        <>
          <div style={{ fontSize: 12.5, color: MUTED, margin: "0 2px 8px" }}>
            מציג {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, safePage * PAGE_SIZE + PAGE_SIZE)} מתוך {filtered.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pageItems.map((r) => (
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
          <PaginationBar page={safePage} pageCount={pageCount} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        </>
      )}
      </>
      )}

      {selected && (
        <DetailModal
          record={selected}
          isAdmin={isAdmin}
          onEdit={() => { setEditing(selected); setSelected(null); }}
          onDelete={() => handleDelete(selected)}
          onVehicleHistory={(v) => { setSelected(null); setVehicleHistory(v); }}
          onClose={() => setSelected(null)}
        />
      )}
      {vehicleHistory && (
        <VehicleHistoryModal
          vehicle={vehicleHistory}
          records={records}
          onSelect={(rec) => { setVehicleHistory(null); setSelected(rec); }}
          onClose={() => setVehicleHistory(null)}
        />
      )}
      {editing && (
        <EditModal
          record={editing}
          onSaved={handleEditSaved}
          onClose={() => setEditing(null)}
          onError={onError}
        />
      )}
      {notifOpen && (
        <NotificationSettingsModal isAdmin={isAdmin} onClose={() => setNotifOpen(false)} onError={onError} notify={notify} />
      )}
    </div>
  );
}

function DetailModal({ record: r, onClose, isAdmin, onEdit, onDelete, onVehicleHistory }) {
  const { status, reasons } = computeStatus(r);
  // The list is loaded without images (for speed) — fetch the full record now
  // to show its photos.
  const [full, setFull] = useState(r);
  const [imgLoading, setImgLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await window.storage.get("talat:" + r.id, true);
        if (alive && res?.value) setFull(JSON.parse(res.value));
      } catch (e) { /* keep summary */ }
      finally { if (alive) setImgLoading(false); }
    })();
    return () => { alive = false; };
  }, [r.id]);

  const images = [
    ["שמן מנוע", full.engineOilImg],
    ["מושבים אחוריים", full.rearSeatsImg],
    ["רישיון רכב", full.licenseImg],
    ["דף טל\"ת פיזי", full.talatSheetImg],
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
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 10 }}>{fmtDateTime(r.createdAt)}</div>

        {onVehicleHistory && r.vehicleNumber && (
          <button onClick={() => onVehicleHistory(r.vehicleNumber)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, border: "1px solid " + BORDER, background: "#fff", color: TEXT, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", marginBottom: 14 }}>
            <ListChecks size={15} /> כל הטל"תים של צ' {r.vehicleNumber}
          </button>
        )}

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

        {imgLoading ? (
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, color: MUTED, fontSize: 13 }}>
            <RefreshCw size={15} className="spin" /> טוען תמונות…
          </div>
        ) : images.length > 0 ? (
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
        ) : null}

        {isAdmin && (
          <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
            <button onClick={onEdit} className="actbtn actbtn-edit"><Pencil size={17} /> עריכה</button>
            <button onClick={onDelete} className="actbtn actbtn-del"><Trash2 size={17} /> מחיקה</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- manager dashboard / statistics ---------- */
function DashCard({ title, icon, children }) {
  return (
    <div style={{ background: SURFACE, border: "1px solid " + BORDER, borderRadius: 14, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{icon}{title}</div>
      {children}
    </div>
  );
}

function Dashboard({ records }) {
  const [company, setCompany] = useState("");
  const data = useMemo(() => (company ? records.filter((r) => r.company === company) : records), [records, company]);

  const total = data.length;
  const counts = { red: 0, yellow: 0, green: 0 };
  data.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  const pct = (n) => total ? Math.round((n / total) * 100) : 0;

  const days = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push(d); }
  const dayCounts = days.map((d) => {
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const c = data.filter((r) => { const t = new Date(r.createdAt); return t >= d && t < next; }).length;
    return { d, c };
  });
  const maxDay = Math.max(1, ...dayCounts.map((x) => x.c));

  // per-company comparison is computed over ALL records (only shown when not
  // already filtered to a single company).
  const byCompany = COMPANIES.map((co) => {
    const rs = records.filter((r) => r.company === co);
    const c = { red: 0, yellow: 0, green: 0 };
    rs.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return { co, total: rs.length, ...c };
  }).filter((x) => x.total > 0);

  const faultCounts = NOTIFY_PARAMS.map(([k, label]) => ({ k, label, n: data.filter((r) => paramConditions(r)[k]).length }))
    .filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const maxFault = Math.max(1, ...faultCounts.map((x) => x.n));

  const companyFilter = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center" }}>
      <span style={{ fontSize: 13, color: MUTED, fontWeight: 700, marginLeft: 2 }}>פלוגה:</span>
      <NotifChip on={company === ""} onClick={() => setCompany("")}>הכל</NotifChip>
      {COMPANIES.map((c) => <NotifChip key={c} on={company === c} color={companyColor(c)} onClick={() => setCompany(company === c ? "" : c)}>{c}</NotifChip>)}
    </div>
  );

  if (total === 0) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {companyFilter}
      <div style={{ textAlign: "center", color: MUTED, padding: 40, background: SURFACE, borderRadius: 12, border: "1px dashed " + BORDER }}>
        אין נתונים{company ? ` עבור פלוגה ${company}` : ""} להצגה
      </div>
    </div>
  );

  const tile = (label, value, sub, color) => (
    <div style={{ flex: 1, background: SURFACE, border: "1px solid " + BORDER, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 12, color: MUTED }}>{label}{sub != null ? ` · ${sub}%` : ""}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {companyFilter}
      <div style={{ display: "flex", gap: 8 }}>
        {tile('סה"כ', total, null, HEADER)}
        {tile("אדום", counts.red, pct(counts.red), STATUS.red.color)}
        {tile("צהוב", counts.yellow, pct(counts.yellow), STATUS.yellow.color)}
        {tile("ירוק", counts.green, pct(counts.green), STATUS.green.color)}
      </div>

      <DashCard title="דיווחים ב-7 הימים האחרונים" icon={<TrendingUp size={17} />}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
          {dayCounts.map(({ d, c }, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: c ? TEXT : MUTED }}>{c}</div>
              <div style={{ width: "100%", maxWidth: 34, height: Math.round((c / maxDay) * 74) + 2, background: c ? ACCENT : BORDER, borderRadius: 5 }} />
              <div style={{ fontSize: 10.5, color: MUTED }}>{d.getDate()}.{d.getMonth() + 1}</div>
            </div>
          ))}
        </div>
      </DashCard>

      {!company && (
      <DashCard title="לפי פלוגה" icon={<Filter size={16} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {byCompany.map((x) => (
            <div key={x.co}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <CompanyBadge company={x.co} />
                <span style={{ marginRight: "auto", fontSize: 13, color: MUTED, fontWeight: 700 }}>{x.total}</span>
              </div>
              <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", background: BORDER }}>
                {["green", "yellow", "red"].map((s) => x[s] > 0 && (
                  <div key={s} title={`${s}: ${x[s]}`} style={{ width: (x[s] / x.total * 100) + "%", background: STATUS[s].color }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </DashCard>
      )}

      <DashCard title="התקלות הנפוצות" icon={<AlertTriangle size={16} />}>
        {faultCounts.length === 0 ? (
          <div style={{ color: MUTED, fontSize: 13 }}>אין תקלות מדווחות 🎉</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {faultCounts.map((x) => (
              <div key={x.k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 130, fontSize: 12.5, flexShrink: 0 }}>{x.label}</div>
                <div style={{ flex: 1, background: BORDER, borderRadius: 6, height: 16, overflow: "hidden" }}>
                  <div style={{ width: (x.n / maxFault * 100) + "%", height: "100%", background: DANGER_BAR }} />
                </div>
                <div style={{ width: 26, textAlign: "left", fontSize: 13, fontWeight: 700 }}>{x.n}</div>
              </div>
            ))}
          </div>
        )}
      </DashCard>
    </div>
  );
}

/* ---------- per-vehicle history ---------- */
function VehicleHistoryModal({ vehicle, records, onSelect, onClose }) {
  const list = useMemo(
    () => records.filter((r) => r.vehicleNumber === vehicle)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [records, vehicle]
  );
  const counts = { red: 0, yellow: 0, green: 0 };
  list.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>היסטוריית רכב · צ' {vehicle}</div>
          <button onClick={onClose} className="xbtn"><X size={20} /></button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13, color: MUTED, marginBottom: 14 }}>
          <span>{list.length} טל"תים</span>
          {["red", "yellow", "green"].map((s) => counts[s] > 0 && (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: STATUS[s].color, fontWeight: 700 }}>
              <StatusDot status={s} size={9} /> {counts[s]}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {list.map((r) => (
            <button key={r.id} onClick={() => onSelect(r)} className="reccard">
              <StatusDot status={r.status} />
              <div style={{ flex: 1, textAlign: "right", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                  <CompanyBadge company={r.company} />
                  <span style={{ fontSize: 13, color: MUTED }}>{r.mission}{r.mission === "דורס" && r.doresNumber ? ` (${r.doresNumber})` : ""}</span>
                </div>
                <div style={{ fontSize: 13, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  נהג: {r.driver} · מפקד: {r.commander}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{fmtDateTime(r.createdAt)}</div>
              </div>
              <ChevronLeft size={20} color={MUTED} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- admin edit modal (reuses the same fields) ---------- */
function EditModal({ record, onSaved, onClose, onError }) {
  // The list record is a summary (no images) — load the FULL record first so
  // editing keeps the existing photos instead of wiping them.
  const [f, setF] = useState(null);
  const [loadingRec, setLoadingRec] = useState(true);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const live = useMemo(() => (f ? computeStatus(f) : { status: "green" }), [f]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let full = record;
      try {
        const res = await window.storage.get("talat:" + record.id, true);
        if (res?.value) full = JSON.parse(res.value);
      } catch (e) { /* fall back to summary */ }
      if (alive) { setF({ ...emptyForm(), ...full }); setLoadingRec(false); }
    })();
    return () => { alive = false; };
  }, [record.id]);

  async function save() {
    const e = validateTalat(f); // admin edit: required fields, but 360 not forced
    setErrors(e);
    if (Object.keys(e).length) {
      onError && onError("יש למלא את כל שדות החובה המסומנים באדום");
      const first = document.querySelector(".field-error");
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    try {
      const { status } = computeStatus(f);
      const updated = { ...f, id: record.id, createdAt: record.createdAt, status, updatedAt: new Date().toISOString() };
      await window.storage.set("talat:" + record.id, JSON.stringify(updated), true);
      onSaved(updated);
    } catch (err) {
      onError && onError("שמירה נכשלה — בדוק חיבור ונסה שוב");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ borderTop: "5px solid " + ACCENT }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
          <div style={{ fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <Pencil size={18} /> עריכת דיווח
          </div>
          <button onClick={onClose} className="xbtn"><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>צ' {record.vehicleNumber} · {fmtDateTime(record.createdAt)}</div>

        {loadingRec || !f ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: MUTED, padding: "20px 0" }}>
            <RefreshCw size={16} className="spin" /> טוען את הדיווח…
          </div>
        ) : (
        <>
        <TalatFields f={f} set={set} errors={errors} onError={onError} />

        <div style={{ margin: "16px 0", padding: "12px 14px", background: STATUS[live.status].bg,
          borderRadius: 12, border: "1px solid " + STATUS[live.status].color + "33", display: "flex", alignItems: "center", gap: 10, fontWeight: 800, color: STATUS[live.status].color }}>
          <StatusDot status={live.status} /> חיווי לאחר עדכון: {STATUS[live.status].label}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving} className="actbtn actbtn-save">
            <Save size={18} /> {saving ? "שומר…" : "שמירת שינויים"}
          </button>
          <button onClick={onClose} className="actbtn actbtn-cancel">ביטול</button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

/* ---------- pagination bar ---------- */
function PaginationBar({ page, pageCount, onPage }) {
  if (pageCount <= 1) return null;
  const nums = [];
  for (let i = 0; i < pageCount; i++) {
    if (i === 0 || i === pageCount - 1 || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <div className="pager">
      <button className="pager-btn" disabled={page === 0} onClick={() => onPage(page - 1)}>
        <ChevronRight size={16} /> הקודם
      </button>
      <div className="pager-nums">
        {nums.map((n, i) => n === "…"
          ? <span key={"e" + i} className="pager-ellipsis">…</span>
          : <button key={n} className={"pager-num" + (n === page ? " pager-on" : "")} onClick={() => onPage(n)}>{n + 1}</button>
        )}
      </div>
      <button className="pager-btn" disabled={page === pageCount - 1} onClick={() => onPage(page + 1)}>
        הבא <ChevronLeft size={16} />
      </button>
    </div>
  );
}

/* ---------- admin notification settings (push) ---------- */
function NotifChip({ on, color, onClick, children }) {
  const c = color || HEADER;
  return (
    <button type="button" onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 11px", borderRadius: 9,
        border: "1.5px solid " + (on ? c : BORDER), background: on ? c : "#fff", color: on ? "#fff" : TEXT,
        fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
      <span style={{ width: 15, height: 15, borderRadius: 5, border: "1.5px solid " + (on ? "#fff" : BORDER), display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>{on && <Check size={11} />}</span>
      {children}
    </button>
  );
}

function NotificationSettingsModal({ isAdmin, onClose, onError, notify }) {
  const [state, setState] = useState(null);
  const [filters, setFilters] = useState({ companies: [], severities: [], params: [] });
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [devices, setDevices] = useState(null); // admin-only: registered devices

  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  const loadDevices = async () => {
    try { setDevices(await getPushDevices(ADMIN_PASSWORD)); }
    catch (e) { setDevices({ error: true }); }
  };

  useEffect(() => {
    (async () => {
      setState(await getPushState());
      const saved = loadSavedFilters();
      if (saved) setFilters({ companies: saved.companies || [], severities: saved.severities || [], params: saved.params || [] });
      if (isAdmin) loadDevices();
    })();
  }, []);

  const toggle = (key, val) => setFilters((p) => ({ ...p, [key]: p[key].includes(val) ? p[key].filter((x) => x !== val) : [...p[key], val] }));
  const refresh = async () => setState(await getPushState());

  async function onEnable() {
    setBusy(true);
    try { await enablePush(filters); await refresh(); notify && notify("התראות הופעלו ✓"); }
    catch (e) {
      const m = String(e && e.message);
      if (m.includes("permission")) onError('ההרשאה נדחתה — יש לאשר קבלת התראות בדפדפן');
      else if (m.includes("not-supported")) onError("הדפדפן לא תומך בהתראות");
      else onError("הפעלת ההתראות נכשלה");
    } finally { setBusy(false); }
  }
  async function onSave() {
    setBusy(true);
    try { await saveFilters(filters); notify && notify("ההעדפות נשמרו ✓"); }
    catch (e) { onError("שמירת ההעדפות נכשלה"); } finally { setBusy(false); }
  }
  async function onDisable() {
    setBusy(true);
    try { await disablePush(); await refresh(); notify && notify("ההתראות כובו"); }
    catch (e) { onError("כיבוי ההתראות נכשל"); } finally { setBusy(false); }
  }
  async function onTest() {
    setBusy(true);
    try { const r = await sendTestPush(); if (r && r.ok) notify && notify("נשלחה התראת בדיקה 🔔"); else onError("שליחת הבדיקה נכשלה" + (r && r.status ? ` (${r.status})` : "")); }
    catch (e) { onError("שליחת הבדיקה נכשלה"); } finally { setBusy(false); }
  }

  const iosNeedsInstall = isIOS && state && !state.standalone;
  const canEnable = state && state.supported && !iosNeedsInstall;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, borderTop: "5px solid " + ACCENT }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <Bell size={19} /> הגדרות התראות
          </div>
          <button onClick={onClose} className="xbtn"><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13.5, color: MUTED, marginBottom: 14, lineHeight: 1.5 }}>
          בחר/י על אילו דיווחים חדשים לקבל התראה למכשיר. השאר/י קטגוריה ריקה = כל האפשרויות.
        </div>

        {/* help toggle */}
        <button onClick={() => setShowHelp((v) => !v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, border: "1px solid " + BORDER, background: "#F8FAFC", color: TEXT, fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit", marginBottom: iosNeedsInstall ? 10 : 14 }}>
          <Smartphone size={16} /> איך מפעילים? (אייפון / אנדרואיד)
          <ChevronLeft size={16} style={{ marginRight: "auto", transform: showHelp ? "rotate(-90deg)" : "none", transition: ".15s" }} />
        </button>
        {showHelp && (
          <div style={{ border: "1px solid " + BORDER, borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13, lineHeight: 1.6, background: "#fff" }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>🍏 אייפון (חובה להתקין קודם):</div>
            <ol style={{ margin: "0 18px 12px 0", padding: 0 }}>
              <li>פתח/י את האתר ב-<b>Safari</b>.</li>
              <li>לחצ/י על כפתור <b>השיתוף</b> (ריבוע עם חץ כלפי מעלה).</li>
              <li>בחר/י <b>"הוסף למסך הבית"</b>.</li>
              <li>פתח/י את האפליקציה <b>מסמל מסך הבית</b> (לא מ-Safari).</li>
              <li>חזר/י לכאן, לחצ/י "הפעל התראות" ואשר/י.</li>
            </ol>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>🤖 אנדרואיד:</div>
            <ol style={{ margin: "0 18px 0 0", padding: 0 }}>
              <li>פתח/י את האתר ב-<b>Chrome</b>.</li>
              <li>מומלץ: תפריט ⋮ ← <b>"התקנת אפליקציה"</b>.</li>
              <li>לחצ/י "הפעל התראות" ו<b>אשר/י</b> את בקשת ההרשאה.</li>
            </ol>
          </div>
        )}

        {state === null ? (
          <div style={{ color: MUTED, padding: "10px 0" }}>טוען…</div>
        ) : !state.supported ? (
          <div style={{ background: STATUS.red.bg, border: "1px solid " + STATUS.red.color + "44", borderRadius: 10, padding: "12px 14px", color: STATUS.red.color, fontSize: 13.5 }}>
            הדפדפן במכשיר זה לא תומך בהתראות. נסה/י מכשיר או דפדפן אחר (ראה/י ההסבר למעלה).
          </div>
        ) : iosNeedsInstall ? (
          <div style={{ background: STATUS.yellow.bg, border: "1px solid " + STATUS.yellow.color + "55", borderRadius: 10, padding: "12px 14px", color: "#8A5A00", fontSize: 13.5, fontWeight: 600 }}>
            <WifiOff size={16} style={{ verticalAlign: "middle", marginLeft: 6 }} />
            באייפון יש להתקין קודם את האפליקציה למסך הבית ולפתוח אותה משם — ראה/י ההסבר למעלה.
          </div>
        ) : (
          <>
            {/* filters */}
            <div style={{ fontWeight: 700, fontSize: 14, margin: "2px 0 7px" }}>פלוגה</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
              {COMPANIES.map((c) => <NotifChip key={c} on={filters.companies.includes(c)} color={companyColor(c)} onClick={() => toggle("companies", c)}>{c}</NotifChip>)}
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, margin: "2px 0 7px" }}>רמת חומרה</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
              {[["red", "🔴 אדום"], ["yellow", "🟡 צהוב"], ["green", "🟢 ירוק"]].map(([k, lbl]) =>
                <NotifChip key={k} on={filters.severities.includes(k)} color={STATUS[k].color} onClick={() => toggle("severities", k)}>{lbl}</NotifChip>)}
            </div>

            <div style={{ fontWeight: 700, fontSize: 14, margin: "2px 0 7px" }}>פרמטרים ספציפיים</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 18 }}>
              {NOTIFY_PARAMS.map(([k, lbl]) => <NotifChip key={k} on={filters.params.includes(k)} onClick={() => toggle("params", k)}>{lbl}</NotifChip>)}
            </div>

            {/* actions */}
            {!state.subscribed ? (
              <button className="submit" disabled={busy} onClick={onEnable}>
                <Bell size={18} /> {busy ? "מפעיל…" : "הפעל התראות"}
              </button>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, color: STATUS.green.color, fontWeight: 700, fontSize: 14 }}>
                  <CheckCircle2 size={17} /> התראות פעילות במכשיר זה
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <button className="actbtn actbtn-save" disabled={busy} onClick={onSave}><Save size={17} /> שמור העדפות</button>
                  <button className="actbtn" disabled={busy} onClick={onTest} style={{ flex: "0 0 auto" }}><Bell size={16} /> בדיקה</button>
                </div>
                <button className="actbtn actbtn-del" disabled={busy} onClick={onDisable} style={{ width: "100%" }}><BellOff size={17} /> כבה התראות במכשיר זה</button>
              </>
            )}
          </>
        )}

        {isAdmin && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid " + BORDER }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <Smartphone size={17} />
              <span style={{ fontWeight: 800, fontSize: 15 }}>מכשירים רשומים</span>
              {devices && !devices.error && (
                <span style={{ background: HEADER, color: "#fff", borderRadius: 999, padding: "1px 9px", fontSize: 12, fontWeight: 700 }}>{devices.count}</span>
              )}
              <button onClick={loadDevices} title="רענן" style={{ marginRight: "auto", background: "none", border: "none", color: MUTED, cursor: "pointer", display: "inline-flex" }}><RefreshCw size={15} /></button>
            </div>
            {devices === null ? (
              <div style={{ color: MUTED, fontSize: 13 }}>טוען…</div>
            ) : devices.error ? (
              <div style={{ color: STATUS.red.color, fontSize: 13 }}>שגיאה בטעינת הרשימה</div>
            ) : devices.count === 0 ? (
              <div style={{ color: MUTED, fontSize: 13 }}>עדיין אין מכשירים רשומים להתראות</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {devices.devices.map((d, i) => (
                  <div key={i} style={{ border: "1px solid " + BORDER, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{d.platform}</div>
                    <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{summarizeFilters(d.filters)}</div>
                    {d.updatedAt && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>נרשם: {fmtDateTime(d.updatedAt)}</div>}
                  </div>
                ))}
              </div>
            )}
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
      @keyframes talat-spin { to { transform: rotate(360deg); } }
      .spin { animation: talat-spin 0.9s linear infinite; }
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

      .actbtn {
        flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 13px; border-radius: 11px; font-size: 15px; font-weight: 700; cursor: pointer;
        font-family: inherit; border: 1px solid ${BORDER}; background: #fff; color: ${TEXT};
      }
      .actbtn:disabled { opacity: .7; cursor: default; }
      .actbtn-edit { background: ${HEADER}; color: #fff; border-color: ${HEADER}; }
      .actbtn-del { background: ${STATUS.red.bg}; color: ${STATUS.red.color}; border-color: ${STATUS.red.color}; }
      .actbtn-save { background: ${STATUS.green.color}; color: #fff; border-color: ${STATUS.green.color}; }
      .actbtn-cancel { flex: 0 0 auto; padding-left: 22px; padding-right: 22px; }

      .toast {
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 100;
        display: flex; align-items: center; gap: 8px; padding: 13px 18px; border-radius: 12px;
        color: #fff; font-weight: 700; font-size: 15px; box-shadow: 0 8px 24px rgba(0,0,0,.25);
        max-width: 92vw;
      }
      .toast-ok { background: #2E7D32; }
      .toast-err { background: #C4463A; }
      .toast-offline { background: #B7791F; }

      .pager { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; margin: 16px 0 4px; }
      .pager-btn {
        display: inline-flex; align-items: center; gap: 3px; padding: 8px 12px; border-radius: 9px;
        border: 1px solid ${BORDER}; background: #fff; color: ${TEXT}; font-size: 13.5px; font-weight: 700;
        cursor: pointer; font-family: inherit;
      }
      .pager-btn:disabled { opacity: .45; cursor: default; }
      .pager-nums { display: flex; align-items: center; gap: 4px; }
      .pager-num {
        min-width: 34px; height: 34px; padding: 0 6px; border-radius: 9px; border: 1px solid ${BORDER};
        background: #fff; color: ${TEXT}; font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
      }
      .pager-num:hover { border-color: ${ACCENT}; }
      .pager-on { background: ${HEADER}; color: #fff; border-color: ${HEADER}; }
      .pager-ellipsis { color: ${MUTED}; padding: 0 2px; }

      .dbtabs { display: flex; gap: 6px; background: #E9EBEF; border-radius: 11px; padding: 4px; margin-bottom: 14px; }
      .dbtab {
        flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        padding: 9px; border: none; background: transparent; color: ${MUTED}; border-radius: 8px;
        font-size: 14px; font-weight: 700; cursor: pointer; font-family: inherit;
      }
      .dbtab-on { background: #fff; color: ${TEXT}; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    `}</style>
  );
}
