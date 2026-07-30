import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Trash2, ChevronLeft, ChevronRight, Settings, Download,
  Utensils, Activity, Ruler, BarChart3, CalendarDays, Check,
  Loader2, AlertTriangle, NotebookPen, LogOut, Lock
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "firebase/auth";
import {
  collection, doc, setDoc, onSnapshot
} from "firebase/firestore";
import { auth, db } from "./firebase.js";

/* ---------------------------------------------------------
   Constants & helpers
--------------------------------------------------------- */

const INFLAMMATION_LABELS = ["Ninguna", "Leve", "Moderada", "Alta", "Muy alta"];
const INFLAMMATION_COLORS = ["#8FBF9F", "#D8CD7A", "#E3A65C", "#D9784F", "#B0473F"];

const RATING_LABELS = ["Muy mal", "Mal", "Regular", "Bien", "Muy bien"];
const RATING_COLORS = ["#B0473F", "#D9784F", "#D8CD7A", "#8FBF9F", "#4F8F6D"];

const SEVERITY_LABELS = ["Leve", "Moderado", "Severo"];
const SEVERITY_COLORS = ["#D8CD7A", "#E3A65C", "#B0473F"];

const SYMPTOM_TYPES = [
  "Hinchazón", "Dolor abdominal", "Gases", "Diarrea",
  "Estreñimiento", "Náuseas", "Reflujo", "Urgencia", "Fatiga", "Otro"
];

const FOOD_TAGS = ["Alto FODMAP", "Bajo FODMAP", "Lácteos", "Gluten", "Ultraprocesado"];

function pad(n) { return n < 10 ? "0" + n : "" + n; }
function toLocalDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayStr() { return toLocalDateStr(new Date()); }
function nowTimeStr() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function emptyDay() {
  return { circumference: null, rating: null, notes: "", symptoms: [], foods: [] };
}
function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
}
function shortDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

const MONTH_NAMES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const WEEKDAY_LETTERS = ["L","M","X","J","V","S","D"];

// For each food, looks at every day it was eaten and checks how often (and how
// severely) a given symptom also showed up that same day, compared against the
// overall baseline rate of that symptom across all logged days.
function computeFoodSymptomCorrelation(days, symptomType) {
  const loggedDays = Object.entries(days).filter(([, d]) => (d.foods || []).length > 0);
  const totalDays = loggedDays.length;
  const daysWithSymptom = loggedDays.filter(([, d]) => (d.symptoms || []).some((s) => s.type === symptomType));
  const baseline = totalDays ? daysWithSymptom.length / totalDays : 0;

  const foodMap = {};
  loggedDays.forEach(([ds, d]) => {
    const seenToday = new Set();
    (d.foods || []).forEach((f) => {
      const key = f.name.trim().toLowerCase();
      if (seenToday.has(key)) return;
      seenToday.add(key);
      if (!foodMap[key]) foodMap[key] = { name: f.name.trim(), days: [] };
      foodMap[key].days.push(ds);
    });
  });

  const results = Object.values(foodMap).map((f) => {
    const daysWithSym = f.days.filter((ds) => (days[ds].symptoms || []).some((s) => s.type === symptomType));
    const rate = f.days.length ? daysWithSym.length / f.days.length : 0;
    const avgSeverity = daysWithSym.length
      ? daysWithSym.reduce((sum, ds) => {
          const matches = days[ds].symptoms.filter((s) => s.type === symptomType);
          return sum + Math.max(...matches.map((s) => s.severity));
        }, 0) / daysWithSym.length
      : 0;
    return { name: f.name, timesEaten: f.days.length, rate, avgSeverity };
  });

  results.sort((a, b) => b.rate - a.rate || b.timesEaten - a.timesEaten);
  return { baseline, totalDays, results };
}

/* ---------------------------------------------------------
   Small shared UI pieces
--------------------------------------------------------- */

function SectionCard({ title, icon, children, right }) {
  return (
    <div className="gdt-card">
      {(title || right) && (
        <div className="gdt-card-head">
          <div className="gdt-card-title">
            {icon}
            <span>{title}</span>
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function ScaleChips({ options, colors, value, onChange, size = "md" }) {
  return (
    <div className={`gdt-chip-row gdt-chip-row--${size}`}>
      {options.map((label, i) => (
        <button
          type="button"
          key={label + i}
          className={`gdt-chip ${value === i ? "gdt-chip--active" : ""}`}
          style={value === i ? { background: colors[i], borderColor: colors[i], color: "#20241f" } : {}}
          onClick={() => onChange(value === i ? null : i)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TagToggle({ tags, selected, onToggle }) {
  return (
    <div className="gdt-chip-row gdt-chip-row--sm">
      {tags.map((t) => (
        <button
          type="button"
          key={t}
          className={`gdt-tag ${selected.includes(t) ? "gdt-tag--active" : ""}`}
          onClick={() => onToggle(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function ConfirmModal({ open, title, body, confirmLabel, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="gdt-modal-backdrop" onClick={onCancel}>
      <div className="gdt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gdt-modal-icon"><AlertTriangle size={20} /></div>
        <h3>{title}</h3>
        <p>{body}</p>
        <div className="gdt-modal-actions">
          <button className="gdt-btn gdt-btn--ghost" onClick={onCancel}>Cancelar</button>
          <button className="gdt-btn gdt-btn--danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function DayRing({ rating }) {
  const size = 108, stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = rating ? rating / 5 : 0;
  const color = rating ? RATING_COLORS[rating - 1] : "#D8D4C4";
  return (
    <div className="gdt-ring-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EAE6D9" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c - c * pct} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dashoffset .5s ease, stroke .3s ease" }}
        />
      </svg>
      <div className="gdt-ring-label">
        <span className="gdt-ring-big">{rating ? rating : "–"}</span>
        <span className="gdt-ring-small">{rating ? RATING_LABELS[rating - 1] : "sin registrar"}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Auth gate
--------------------------------------------------------- */

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError("No pudimos iniciar sesión. Revisa tu correo y contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gdt-app gdt-login-screen">
      <style>{CSS}</style>
      <div className="gdt-login-card">
        <div className="gdt-login-icon"><Lock size={22} /></div>
        <h1>Diario Digestivo</h1>
        <p>Inicia sesión con la cuenta que creaste para ti en Firebase.</p>
        <form onSubmit={submit} className="gdt-form">
          <input type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="gdt-login-error">{error}</p>}
          <button type="submit" className="gdt-btn gdt-btn--primary" disabled={busy}>
            {busy ? <Loader2 size={16} className="gdt-spin" /> : "Iniciar sesión"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Root — decides between login and the app
--------------------------------------------------------- */

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  if (authLoading) {
    return (
      <div className="gdt-app gdt-login-screen">
        <style>{CSS}</style>
        <Loader2 size={24} className="gdt-spin" />
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  return <MainApp uid={user.uid} />;
}

/* ---------------------------------------------------------
   Main App (signed in)
--------------------------------------------------------- */

function MainApp({ uid: userId }) {
  const [data, setData] = useState({ days: {} });
  const [dataLoading, setDataLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const [tab, setTab] = useState("registrar");
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [confirmClear, setConfirmClear] = useState(false);

  const saveTimers = useRef({});

  // ---- live subscription to Firestore ----
  useEffect(() => {
    const colRef = collection(db, "users", userId, "days");
    const unsub = onSnapshot(colRef, (snap) => {
      const days = {};
      snap.forEach((d) => { days[d.id] = d.data(); });
      setData({ days });
      setDataLoading(false);
    }, () => setDataLoading(false));
    return unsub;
  }, [userId]);

  const day = data.days[selectedDate] || emptyDay();

  function scheduleSave(dateStr, dayObj) {
    if (saveTimers.current[dateStr]) clearTimeout(saveTimers.current[dateStr]);
    setSaveState("saving");
    saveTimers.current[dateStr] = setTimeout(async () => {
      try {
        await setDoc(doc(db, "users", userId, "days", dateStr), dayObj);
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
      }
    }, 500);
  }

  function mutateDay(dateStr, fn) {
    setData((prev) => {
      const days = { ...prev.days };
      const current = days[dateStr] ? { ...days[dateStr] } : emptyDay();
      const updated = fn(current);
      days[dateStr] = updated;
      scheduleSave(dateStr, updated);
      return { ...prev, days };
    });
  }

  function setField(field, value) {
    mutateDay(selectedDate, (d) => ({ ...d, [field]: value }));
  }
  function addFood(food) {
    mutateDay(selectedDate, (d) => ({ ...d, foods: [...d.foods, { id: uid(), ...food }] }));
  }
  function removeFood(dateStr, id) {
    mutateDay(dateStr, (d) => ({ ...d, foods: d.foods.filter((f) => f.id !== id) }));
  }
  function addSymptom(symptom) {
    mutateDay(selectedDate, (d) => ({ ...d, symptoms: [...d.symptoms, { id: uid(), ...symptom }] }));
  }
  function removeSymptom(dateStr, id) {
    mutateDay(dateStr, (d) => ({ ...d, symptoms: d.symptoms.filter((s) => s.id !== id) }));
  }

  async function clearAllData() {
    const dates = Object.keys(data.days);
    setConfirmClear(false);
    for (const ds of dates) {
      try { await setDoc(doc(db, "users", userId, "days", ds), emptyDay()); } catch (e) { /* ignore */ }
    }
    setData({ days: {} });
  }

  const weeklyStats = useMemo(() => {
    const today = new Date();
    const last7 = [...Array(7)].map((_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - i);
      return toLocalDateStr(d);
    });
    const logged = last7.map((ds) => data.days[ds]).filter(Boolean);
    const goodDays = logged.filter((d) => d.rating >= 4).length;
    const circs = logged.filter((d) => d.circumference != null).map((d) => d.circumference);
    const avgCirc = circs.length ? circs.reduce((a, b) => a + b, 0) / circs.length : null;
    return { loggedCount: logged.length, goodDays, avgCirc };
  }, [data.days]);

  return (
    <div className="gdt-app">
      <style>{CSS}</style>

      <header className="gdt-header">
        <div className="gdt-header-text">
          <h1>Diario Digestivo</h1>
          <p>Registra, observa, entiende a tu intestino</p>
        </div>
        <SaveIndicator state={dataLoading ? "loading" : saveState} />
      </header>

      <main className="gdt-main">
        {tab === "registrar" && (
          <RegistrarTab
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            day={day}
            setField={setField}
            addFood={addFood}
            addSymptom={addSymptom}
            removeFood={(id) => removeFood(selectedDate, id)}
            removeSymptom={(id) => removeSymptom(selectedDate, id)}
            weeklyStats={weeklyStats}
          />
        )}

        {tab === "historial" && (
          <HistorialTab
            days={data.days}
            onJumpToDate={(ds) => { setSelectedDate(ds); setTab("registrar"); }}
            removeFood={removeFood}
            removeSymptom={removeSymptom}
          />
        )}

        {tab === "alimentos" && <AlimentosTab days={data.days} />}

        {tab === "graficas" && <GraficasTab days={data.days} />}

        {tab === "ajustes" && (
          <AjustesTab data={data} onClear={() => setConfirmClear(true)} />
        )}
      </main>

      <nav className="gdt-tabbar">
        <TabButton active={tab === "registrar"} onClick={() => setTab("registrar")} icon={<NotebookPen size={20} />} label="Registrar" />
        <TabButton active={tab === "historial"} onClick={() => setTab("historial")} icon={<CalendarDays size={20} />} label="Historial" />
        <TabButton active={tab === "alimentos"} onClick={() => setTab("alimentos")} icon={<Utensils size={20} />} label="Alimentos" />
        <TabButton active={tab === "graficas"} onClick={() => setTab("graficas")} icon={<BarChart3 size={20} />} label="Gráficas" />
        <TabButton active={tab === "ajustes"} onClick={() => setTab("ajustes")} icon={<Settings size={20} />} label="Ajustes" />
      </nav>

      <ConfirmModal
        open={confirmClear}
        title="¿Borrar todos los datos?"
        body="Esto vaciará todos tus registros guardados en tu base de datos. Esta acción no se puede deshacer. Si quieres, descarga primero un respaldo desde Ajustes."
        confirmLabel="Sí, borrar todo"
        onConfirm={clearAllData}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

function SaveIndicator({ state }) {
  if (state === "idle") return null;
  return (
    <div className={`gdt-save gdt-save--${state}`}>
      {state === "loading" && <><Loader2 size={13} className="gdt-spin" /> Cargando…</>}
      {state === "saving" && <><Loader2 size={13} className="gdt-spin" /> Guardando…</>}
      {state === "saved" && <><Check size={13} /> Guardado</>}
      {state === "error" && <><AlertTriangle size={13} /> No se pudo guardar</>}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button className={`gdt-tab ${active ? "gdt-tab--active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* ---------------------------------------------------------
   Registrar Tab
--------------------------------------------------------- */

function RegistrarTab({ selectedDate, setSelectedDate, day, setField, addFood, addSymptom, removeFood, removeSymptom, weeklyStats }) {
  const [foodName, setFoodName] = useState("");
  const [foodInflammation, setFoodInflammation] = useState(null);
  const [foodTags, setFoodTags] = useState([]);
  const [foodTime, setFoodTime] = useState(nowTimeStr());
  const [foodNote, setFoodNote] = useState("");

  const [symptomType, setSymptomType] = useState(null);
  const [symptomSeverity, setSymptomSeverity] = useState(null);
  const [symptomTime, setSymptomTime] = useState(nowTimeStr());
  const [symptomNote, setSymptomNote] = useState("");

  const isToday = selectedDate === todayStr();

  function submitFood(e) {
    e.preventDefault();
    if (!foodName.trim() || foodInflammation === null) return;
    addFood({ name: foodName.trim(), inflammation: foodInflammation, tags: foodTags, time: foodTime, note: foodNote.trim() });
    setFoodName(""); setFoodInflammation(null); setFoodTags([]); setFoodTime(nowTimeStr()); setFoodNote("");
  }

  function submitSymptom(e) {
    e.preventDefault();
    if (symptomType === null || symptomSeverity === null) return;
    addSymptom({ type: SYMPTOM_TYPES[symptomType], severity: symptomSeverity + 1, time: symptomTime, note: symptomNote.trim() });
    setSymptomType(null); setSymptomSeverity(null); setSymptomTime(nowTimeStr()); setSymptomNote("");
  }

  const allEntries = [
    ...day.foods.map((f) => ({ ...f, kind: "food" })),
    ...day.symptoms.map((s) => ({ ...s, kind: "symptom" })),
  ].sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  return (
    <div className="gdt-stack">
      <SectionCard>
        <div className="gdt-date-row">
          <label className="gdt-date-label">
            <span>Fecha</span>
            <input type="date" value={selectedDate} max={todayStr()} onChange={(e) => setSelectedDate(e.target.value)} />
          </label>
          {!isToday && <span className="gdt-badge-past">Editando un día anterior</span>}
        </div>
        <div className="gdt-today-grid">
          <DayRing rating={day.rating} />
          <div className="gdt-today-side">
            <p className="gdt-label">¿Cómo estuvo tu abdomen hoy?</p>
            <ScaleChips options={RATING_LABELS} colors={RATING_COLORS} value={day.rating === null ? null : day.rating - 1}
              onChange={(i) => setField("rating", i === null ? null : i + 1)} />
          </div>
        </div>
        <div className="gdt-circ-row">
          <Ruler size={16} className="gdt-icon-muted" />
          <label className="gdt-inline-label">Circunferencia abdominal
            <div className="gdt-circ-input">
              <input type="number" step="0.1" min="0" placeholder="cm" value={day.circumference ?? ""}
                onChange={(e) => setField("circumference", e.target.value === "" ? null : parseFloat(e.target.value))} />
              <span>cm</span>
            </div>
          </label>
        </div>
        <label className="gdt-inline-label gdt-notes-label">Notas del día
          <textarea rows={2} placeholder="Cómo dormiste, estrés, ciclo, actividad física…" value={day.notes}
            onChange={(e) => setField("notes", e.target.value)} />
        </label>
      </SectionCard>

      <SectionCard title="Esta semana" icon={<Activity size={16} className="gdt-icon-muted" />}>
        <div className="gdt-week-stats">
          <div><strong>{weeklyStats.goodDays}</strong><span>de 7 días buenos</span></div>
          <div><strong>{weeklyStats.loggedCount}</strong><span>días registrados</span></div>
          <div><strong>{weeklyStats.avgCirc ? weeklyStats.avgCirc.toFixed(1) + " cm" : "–"}</strong><span>circunferencia prom.</span></div>
        </div>
      </SectionCard>

      <SectionCard title="Agregar alimento" icon={<Utensils size={16} className="gdt-icon-muted" />}>
        <form onSubmit={submitFood} className="gdt-form">
          <div className="gdt-form-row">
            <input className="gdt-input-grow" placeholder="¿Qué comiste?" value={foodName} onChange={(e) => setFoodName(e.target.value)} />
            <input type="time" value={foodTime} onChange={(e) => setFoodTime(e.target.value)} />
          </div>
          <p className="gdt-label">Nivel de inflamación que te causó</p>
          <ScaleChips options={INFLAMMATION_LABELS} colors={INFLAMMATION_COLORS} value={foodInflammation} onChange={setFoodInflammation} size="sm" />
          <p className="gdt-label">Etiquetas (opcional)</p>
          <TagToggle tags={FOOD_TAGS} selected={foodTags} onToggle={(t) => setFoodTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t])} />
          <input className="gdt-input-grow" placeholder="Nota (opcional)" value={foodNote} onChange={(e) => setFoodNote(e.target.value)} />
          <button type="submit" className="gdt-btn gdt-btn--primary"><Plus size={16} /> Agregar alimento</button>
        </form>
      </SectionCard>

      <SectionCard title="Agregar síntoma" icon={<Activity size={16} className="gdt-icon-muted" />}>
        <form onSubmit={submitSymptom} className="gdt-form">
          <div className="gdt-chip-row gdt-chip-row--sm">
            {SYMPTOM_TYPES.map((s, i) => (
              <button type="button" key={s} className={`gdt-chip ${symptomType === i ? "gdt-chip--active" : ""}`}
                onClick={() => setSymptomType(symptomType === i ? null : i)}>{s}</button>
            ))}
          </div>
          <p className="gdt-label">Severidad</p>
          <ScaleChips options={SEVERITY_LABELS} colors={SEVERITY_COLORS} value={symptomSeverity} onChange={setSymptomSeverity} size="sm" />
          <div className="gdt-form-row">
            <input className="gdt-input-grow" placeholder="Nota (opcional)" value={symptomNote} onChange={(e) => setSymptomNote(e.target.value)} />
            <input type="time" value={symptomTime} onChange={(e) => setSymptomTime(e.target.value)} />
          </div>
          <button type="submit" className="gdt-btn gdt-btn--primary"><Plus size={16} /> Agregar síntoma</button>
        </form>
      </SectionCard>

      <SectionCard title={`Registros de ${formatDateLabel(selectedDate)}`}>
        {allEntries.length === 0 && <p className="gdt-empty">Aún no hay nada registrado este día.</p>}
        <ul className="gdt-entry-list">
          {allEntries.map((e) => (
            <EntryRow key={e.id} entry={e} onRemove={() => e.kind === "food" ? removeFood(e.id) : removeSymptom(e.id)} />
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function EntryRow({ entry, onRemove }) {
  if (entry.kind === "food") {
    return (
      <li className="gdt-entry">
        <span className="gdt-entry-dot" style={{ background: INFLAMMATION_COLORS[entry.inflammation] }} />
        <div className="gdt-entry-body">
          <div className="gdt-entry-top">
            <strong>{entry.name}</strong>
            <span className="gdt-entry-time">{entry.time}</span>
          </div>
          <div className="gdt-entry-meta">
            Inflamación: {INFLAMMATION_LABELS[entry.inflammation]}
            {entry.tags && entry.tags.length > 0 && <> · {entry.tags.join(", ")}</>}
          </div>
          {entry.note && <div className="gdt-entry-note">{entry.note}</div>}
        </div>
        <button className="gdt-icon-btn" onClick={onRemove}><Trash2 size={15} /></button>
      </li>
    );
  }
  return (
    <li className="gdt-entry">
      <span className="gdt-entry-dot" style={{ background: SEVERITY_COLORS[entry.severity - 1] }} />
      <div className="gdt-entry-body">
        <div className="gdt-entry-top">
          <strong>{entry.type}</strong>
          <span className="gdt-entry-time">{entry.time}</span>
        </div>
        <div className="gdt-entry-meta">Severidad: {SEVERITY_LABELS[entry.severity - 1]}</div>
        {entry.note && <div className="gdt-entry-note">{entry.note}</div>}
      </div>
      <button className="gdt-icon-btn" onClick={onRemove}><Trash2 size={15} /></button>
    </li>
  );
}

/* ---------------------------------------------------------
   Historial Tab
--------------------------------------------------------- */

function HistorialTab({ days, onJumpToDate, removeFood, removeSymptom }) {
  const [monthDate, setMonthDate] = useState(new Date());
  const [expanded, setExpanded] = useState(null);

  const year = monthDate.getFullYear(), month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toLocalDateStr(new Date(year, month, d)));

  function changeMonth(delta) {
    setMonthDate(new Date(year, month + delta, 1));
  }

  const expandedDay = expanded ? days[expanded] : null;

  return (
    <div className="gdt-stack">
      <SectionCard>
        <div className="gdt-month-nav">
          <button className="gdt-icon-btn" onClick={() => changeMonth(-1)}><ChevronLeft size={18} /></button>
          <strong>{MONTH_NAMES[month]} {year}</strong>
          <button className="gdt-icon-btn" onClick={() => changeMonth(1)}><ChevronRight size={18} /></button>
        </div>
        <div className="gdt-cal-weekdays">
          {WEEKDAY_LETTERS.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="gdt-cal-grid">
          {cells.map((ds, i) => {
            if (!ds) return <div key={i} className="gdt-cal-cell gdt-cal-cell--empty" />;
            const d = days[ds];
            const dayNum = parseInt(ds.split("-")[2], 10);
            const isFuture = ds > todayStr();
            const color = d && d.rating ? RATING_COLORS[d.rating - 1] : null;
            return (
              <button
                key={ds}
                disabled={isFuture}
                className={`gdt-cal-cell ${expanded === ds ? "gdt-cal-cell--selected" : ""}`}
                style={color ? { background: color + "33", borderColor: color } : {}}
                onClick={() => setExpanded(expanded === ds ? null : ds)}
              >
                <span className="gdt-cal-daynum">{dayNum}</span>
                {d && (d.foods.length > 0 || d.symptoms.length > 0) && <span className="gdt-cal-dot" />}
              </button>
            );
          })}
        </div>
        <p className="gdt-legend">Color = qué tan bien te sentiste ese día · punto = hay registros</p>
      </SectionCard>

      {expanded && (
        <SectionCard title={formatDateLabel(expanded)} right={
          <button className="gdt-btn gdt-btn--ghost gdt-btn--sm" onClick={() => onJumpToDate(expanded)}>Editar este día</button>
        }>
          {!expandedDay && <p className="gdt-empty">No hay nada registrado este día.</p>}
          {expandedDay && (
            <>
              <div className="gdt-week-stats gdt-week-stats--3">
                <div><strong>{expandedDay.rating ? RATING_LABELS[expandedDay.rating - 1] : "–"}</strong><span>estado</span></div>
                <div><strong>{expandedDay.circumference ?? "–"}</strong><span>cm abdomen</span></div>
                <div><strong>{expandedDay.foods.length}</strong><span>alimentos</span></div>
              </div>
              {expandedDay.notes && <p className="gdt-entry-note" style={{ marginTop: 8 }}>{expandedDay.notes}</p>}
              <ul className="gdt-entry-list">
                {[...expandedDay.foods.map((f) => ({ ...f, kind: "food" })),
                  ...expandedDay.symptoms.map((s) => ({ ...s, kind: "symptom" }))]
                  .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
                  .map((e) => (
                    <EntryRow key={e.id} entry={e}
                      onRemove={() => e.kind === "food" ? removeFood(expanded, e.id) : removeSymptom(expanded, e.id)} />
                  ))}
              </ul>
            </>
          )}
        </SectionCard>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Alimentos Tab
--------------------------------------------------------- */

function AlimentosTab({ days }) {
  const [sortBy, setSortBy] = useState("inflammation");

  const foods = useMemo(() => {
    const map = {};
    Object.entries(days).forEach(([ds, d]) => {
      (d.foods || []).forEach((f) => {
        const key = f.name.trim().toLowerCase();
        if (!map[key]) map[key] = { name: f.name.trim(), count: 0, total: 0, tags: new Set(), last: ds };
        map[key].count += 1;
        map[key].total += f.inflammation;
        (f.tags || []).forEach((t) => map[key].tags.add(t));
        if (ds > map[key].last) map[key].last = ds;
      });
    });
    const list = Object.values(map).map((x) => ({ ...x, avg: x.total / x.count, tags: [...x.tags] }));
    if (sortBy === "inflammation") list.sort((a, b) => b.avg - a.avg);
    else if (sortBy === "count") list.sort((a, b) => b.count - a.count);
    else list.sort((a, b) => b.last.localeCompare(a.last));
    return list;
  }, [days, sortBy]);

  return (
    <div className="gdt-stack">
      <SectionCard title="Patrones por alimento" icon={<Utensils size={16} className="gdt-icon-muted" />}>
        <div className="gdt-sort-row">
          <span>Ordenar por</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="inflammation">Mayor inflamación</option>
            <option value="count">Más veces registrado</option>
            <option value="recent">Más reciente</option>
          </select>
        </div>
        {foods.length === 0 && <p className="gdt-empty">Aún no has registrado alimentos. Empieza en la pestaña Registrar.</p>}
        <ul className="gdt-food-list">
          {foods.map((f) => (
            <li key={f.name} className="gdt-food-row">
              <div className="gdt-food-bar-wrap">
                <div className="gdt-food-bar" style={{ width: `${(f.avg / 4) * 100}%`, background: INFLAMMATION_COLORS[Math.round(f.avg)] }} />
              </div>
              <div className="gdt-food-info">
                <div className="gdt-entry-top">
                  <strong>{f.name}</strong>
                  <span className="gdt-entry-time">{f.count}×</span>
                </div>
                <div className="gdt-entry-meta">
                  Inflamación prom.: {f.avg.toFixed(1)} · {INFLAMMATION_LABELS[Math.round(f.avg)]}
                  {f.tags.length > 0 && <> · {f.tags.join(", ")}</>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

/* ---------------------------------------------------------
   Gráficas Tab
--------------------------------------------------------- */

function GraficasTab({ days }) {
  const [corrSymptom, setCorrSymptom] = useState("Hinchazón");

  const sortedDates = Object.keys(days).sort();

  const circData = sortedDates
    .filter((d) => days[d].circumference != null)
    .map((d) => ({ date: shortDateLabel(d), value: days[d].circumference }));

  const ratingData = sortedDates
    .filter((d) => days[d].rating != null)
    .map((d) => ({ date: shortDateLabel(d), value: days[d].rating }));

  const symptomCounts = {};
  Object.values(days).forEach((d) => {
    (d.symptoms || []).forEach((s) => {
      symptomCounts[s.type] = (symptomCounts[s.type] || 0) + 1;
    });
  });
  const symptomData = Object.entries(symptomCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const symptomTypesLogged = symptomData.map((s) => s.type);

  const correlation = useMemo(
    () => computeFoodSymptomCorrelation(days, corrSymptom),
    [days, corrSymptom]
  );
  const correlationChartData = correlation.results
    .filter((f) => f.timesEaten >= 2)
    .slice(0, 12)
    .map((f) => ({ ...f, pct: Math.round(f.rate * 100) }));

  const hasAny = sortedDates.length > 0;

  return (
    <div className="gdt-stack">
      {!hasAny && (
        <SectionCard>
          <p className="gdt-empty">Registra algunos días para empezar a ver tus gráficas de tendencia.</p>
        </SectionCard>
      )}

      {circData.length > 1 && (
        <SectionCard title="Circunferencia abdominal (cm)" icon={<Ruler size={16} className="gdt-icon-muted" />}>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={circData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D2" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7568" }} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7568" }} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "Work Sans, sans-serif" }} />
                <Line type="monotone" dataKey="value" stroke="#5B7F6B" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {ratingData.length > 1 && (
        <SectionCard title="Cómo te has sentido" icon={<Activity size={16} className="gdt-icon-muted" />}>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={ratingData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D2" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7568" }} />
                <YAxis domain={[0, 5]} ticks={[1,2,3,4,5]} tick={{ fontSize: 11, fill: "#6B7568" }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "Work Sans, sans-serif" }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {ratingData.map((r, i) => <Cell key={i} fill={RATING_COLORS[r.value - 1]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {symptomData.length > 0 && (
        <SectionCard title="Síntomas más frecuentes" icon={<BarChart3 size={16} className="gdt-icon-muted" />}>
          <div style={{ width: "100%", height: Math.max(160, symptomData.length * 34) }}>
            <ResponsiveContainer>
              <BarChart data={symptomData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D2" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#6B7568" }} />
                <YAxis type="category" dataKey="type" width={92} tick={{ fontSize: 11, fill: "#3B4038" }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "Work Sans, sans-serif" }} />
                <Bar dataKey="count" fill="#8B5A73" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Alimentos y síntomas" icon={<Activity size={16} className="gdt-icon-muted" />}>
        <div className="gdt-sort-row">
          <span>Síntoma a revisar</span>
          <select value={corrSymptom} onChange={(e) => setCorrSymptom(e.target.value)}>
            {SYMPTOM_TYPES.filter((s) => s !== "Otro").map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {correlationChartData.length === 0 && (
          <p className="gdt-empty">
            Aún no hay suficientes registros repetidos de un mismo alimento junto con
            "{corrSymptom}" para mostrar un patrón. Sigue registrando y esta gráfica se irá llenando.
          </p>
        )}

        {correlationChartData.length > 0 && (
          <>
            <p className="gdt-corr-explain">
              De los días en que comiste cada alimento, % de esos días en que también
              registraste <strong>{corrSymptom}</strong>. La línea punteada es tu promedio
              general de días con {corrSymptom.toLowerCase()} ({Math.round(correlation.baseline * 100)}%)
              — las barras que la cruzan por mucho son las que más se repiten junto con el síntoma.
            </p>
            <div style={{ width: "100%", height: Math.max(180, correlationChartData.length * 32) }}>
              <ResponsiveContainer>
                <BarChart data={correlationChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E2D2" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "#6B7568" }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "#3B4038" }} />
                  <Tooltip
                    formatter={(value, key, props) => {
                      if (key === "pct") {
                        const sev = props.payload.avgSeverity;
                        return [`${value}% de ${props.payload.timesEaten} veces · severidad prom. ${sev.toFixed(1)}`, corrSymptom];
                      }
                      return [value, key];
                    }}
                    contentStyle={{ fontSize: 12, borderRadius: 8, fontFamily: "Work Sans, sans-serif" }}
                  />
                  <ReferenceLine x={correlation.baseline * 100} stroke="#8B5A73" strokeDasharray="4 4" />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                    {correlationChartData.map((f, i) => (
                      <Cell key={i} fill={SEVERITY_COLORS[Math.max(0, Math.round(f.avgSeverity) - 1)] || "#D8CD7A"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="gdt-legend">
              Color = qué tan severo fue {corrSymptom.toLowerCase()} esos días (verde-amarillo-rojo) ·
              solo se muestran alimentos que has registrado 2 veces o más
            </p>
          </>
        )}
      </SectionCard>

      <SectionCard>
        <p className="gdt-disclaimer">
          Estos porcentajes son un patrón descriptivo de tus propios registros, no una prueba médica
          ni un diagnóstico. Entre más días registres, más confiable se vuelve el patrón — te sirve
          sobre todo como punto de partida para platicarlo con tu médico o nutriólogo.
        </p>
      </SectionCard>
    </div>
  );
}

/* ---------------------------------------------------------
   Ajustes Tab
--------------------------------------------------------- */

function AjustesTab({ data, onClear }) {
  function downloadBackup() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `diario-digestivo-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const dayCount = Object.keys(data.days).length;

  return (
    <div className="gdt-stack">
      <SectionCard title="Tus datos" icon={<Settings size={16} className="gdt-icon-muted" />}>
        <p className="gdt-settings-text">
          Tienes {dayCount} {dayCount === 1 ? "día" : "días"} registrados. Todo se guarda en tu propia
          base de datos, protegida con tu usuario y contraseña — nadie más puede entrar ni verla.
        </p>
        <button className="gdt-btn gdt-btn--secondary" onClick={downloadBackup}>
          <Download size={16} /> Descargar respaldo (JSON)
        </button>
        <p className="gdt-settings-hint">Guarda este archivo de vez en cuando como copia extra, por si acaso.</p>
      </SectionCard>

      <SectionCard title="Zona de riesgo">
        <button className="gdt-btn gdt-btn--danger-outline" onClick={onClear}>
          <Trash2 size={16} /> Borrar todos los datos
        </button>
      </SectionCard>

      <SectionCard>
        <button className="gdt-btn gdt-btn--ghost" onClick={() => signOut(auth)}>
          <LogOut size={16} /> Cerrar sesión
        </button>
      </SectionCard>

      <SectionCard>
        <p className="gdt-disclaimer">
          Esta app es una herramienta personal de registro y no reemplaza una consulta médica.
          Úsala para llevar un mejor control de tus síntomas y compartir patrones con tu médico o nutriólogo.
        </p>
      </SectionCard>
    </div>
  );
}

/* ---------------------------------------------------------
   Styles
--------------------------------------------------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');

.gdt-app {
  --bg: #F3F1E8;
  --surface: #FFFDF8;
  --ink: #262E27;
  --muted: #6B7568;
  --border: #E7E2D2;
  --sage: #5B7F6B;
  --plum: #8B5A73;
  font-family: 'Work Sans', sans-serif;
  background: var(--bg);
  color: var(--ink);
  min-height: 100vh;
  max-width: 560px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  position: relative;
}
.gdt-app *, .gdt-app *::before, .gdt-app *::after { box-sizing: border-box; }
.gdt-app button { font-family: inherit; cursor: pointer; }
.gdt-app input, .gdt-app textarea, .gdt-app select {
  font-family: 'Work Sans', sans-serif; font-size: 14px; color: var(--ink);
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px;
}
.gdt-app input:focus-visible, .gdt-app textarea:focus-visible, .gdt-app select:focus-visible, .gdt-app button:focus-visible {
  outline: 2px solid var(--sage); outline-offset: 1px;
}

.gdt-login-screen { align-items: center; justify-content: center; padding: 20px; }
.gdt-login-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px 22px; text-align: center; max-width: 320px; }
.gdt-login-icon { color: var(--sage); display: flex; justify-content: center; margin-bottom: 6px; }
.gdt-login-card h1 { font-family: 'Fraunces', serif; font-size: 22px; margin: 0 0 4px; }
.gdt-login-card p { font-size: 12.5px; color: var(--muted); margin: 0 0 16px; }
.gdt-login-card input { width: 100%; }
.gdt-login-error { color: #A5473F; font-size: 12px; margin: 0; }

.gdt-header {
  padding: 22px 18px 16px; display: flex; justify-content: space-between; align-items: flex-start;
  border-bottom: 1px solid var(--border);
}
.gdt-header h1 { font-family: 'Fraunces', serif; font-weight: 600; font-size: 24px; margin: 0; }
.gdt-header p { margin: 2px 0 0; font-size: 12.5px; color: var(--muted); }

.gdt-save { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 4px; white-space: nowrap; margin-top: 3px; }
.gdt-save--error { color: #A5473F; }
.gdt-spin { animation: gdt-spin 1s linear infinite; }
@keyframes gdt-spin { to { transform: rotate(360deg); } }

.gdt-main { flex: 1; padding: 16px 14px 90px; }
.gdt-stack { display: flex; flex-direction: column; gap: 14px; }

.gdt-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px;
}
.gdt-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.gdt-card-title { display: flex; align-items: center; gap: 8px; font-family: 'Fraunces', serif; font-weight: 600; font-size: 16px; }

.gdt-date-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.gdt-date-label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.gdt-badge-past { font-size: 11px; background: #F3E9D8; color: #8A6A2E; padding: 3px 8px; border-radius: 20px; }

.gdt-today-grid { display: flex; gap: 18px; align-items: center; margin-bottom: 14px; }
.gdt-ring-wrap { position: relative; flex-shrink: 0; }
.gdt-ring-label { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.gdt-ring-big { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; line-height: 1; }
.gdt-ring-small { font-size: 10px; color: var(--muted); margin-top: 2px; text-align: center; max-width: 70px; }
.gdt-today-side { flex: 1; }
.gdt-label { font-size: 12.5px; color: var(--muted); margin: 6px 0; }

.gdt-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.gdt-chip {
  border: 1px solid var(--border); background: var(--surface); border-radius: 20px; padding: 7px 12px;
  font-size: 13px; transition: transform .1s ease;
}
.gdt-chip-row--sm .gdt-chip { padding: 5px 10px; font-size: 12.5px; }
.gdt-chip:active { transform: scale(0.96); }
.gdt-chip--active { font-weight: 600; }

.gdt-tag { border: 1px solid var(--border); background: transparent; border-radius: 20px; padding: 4px 10px; font-size: 11.5px; color: var(--muted); }
.gdt-tag--active { background: var(--plum); border-color: var(--plum); color: white; }

.gdt-circ-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.gdt-icon-muted { color: var(--sage); flex-shrink: 0; }
.gdt-inline-label { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--muted); flex: 1; }
.gdt-circ-input { display: flex; align-items: center; gap: 6px; }
.gdt-circ-input input { width: 90px; }
.gdt-notes-label textarea { resize: vertical; }

.gdt-week-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; }
.gdt-week-stats--3 { grid-template-columns: repeat(3, 1fr); }
.gdt-week-stats div { background: var(--bg); border-radius: 10px; padding: 10px 4px; }
.gdt-week-stats strong { display: block; font-family: 'IBM Plex Mono', monospace; font-size: 17px; }
.gdt-week-stats span { font-size: 10.5px; color: var(--muted); }

.gdt-form { display: flex; flex-direction: column; gap: 8px; }
.gdt-form-row { display: flex; gap: 8px; }
.gdt-input-grow { flex: 1; }

.gdt-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border-radius: 10px; padding: 10px 14px; font-size: 13.5px; font-weight: 600; border: 1px solid transparent;
}
.gdt-btn--primary { background: var(--sage); color: white; }
.gdt-btn--secondary { background: var(--plum); color: white; }
.gdt-btn--ghost { background: transparent; border-color: var(--border); color: var(--ink); }
.gdt-btn--sm { padding: 6px 10px; font-size: 12px; }
.gdt-btn--danger { background: #A5473F; color: white; }
.gdt-btn--danger-outline { background: transparent; border-color: #A5473F; color: #A5473F; }

.gdt-empty { color: var(--muted); font-size: 13px; text-align: center; padding: 12px 0; }

.gdt-entry-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.gdt-entry { display: flex; align-items: flex-start; gap: 10px; background: var(--bg); border-radius: 10px; padding: 10px; }
.gdt-entry-dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
.gdt-entry-body { flex: 1; min-width: 0; }
.gdt-entry-top { display: flex; justify-content: space-between; gap: 8px; }
.gdt-entry-time { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted); }
.gdt-entry-meta { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.gdt-entry-note { font-size: 12px; color: var(--ink); margin-top: 4px; font-style: italic; }
.gdt-icon-btn { background: transparent; border: none; color: var(--muted); padding: 4px; border-radius: 6px; }
.gdt-icon-btn:hover { background: var(--border); }

.gdt-month-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-family: 'Fraunces', serif; font-size: 15px; text-transform: capitalize; }
.gdt-cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: 10.5px; color: var(--muted); margin-bottom: 4px; }
.gdt-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.gdt-cal-cell {
  aspect-ratio: 1; border: 1px solid var(--border); background: var(--surface); border-radius: 8px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; font-size: 12px;
}
.gdt-cal-cell--empty { border: none; background: transparent; }
.gdt-cal-cell--selected { box-shadow: 0 0 0 2px var(--sage); }
.gdt-cal-cell:disabled { opacity: 0.35; }
.gdt-cal-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--plum); position: absolute; bottom: 4px; }
.gdt-legend { font-size: 10.5px; color: var(--muted); margin-top: 8px; text-align: center; }
.gdt-corr-explain { font-size: 12px; color: var(--muted); line-height: 1.5; margin: 4px 0 12px; }

.gdt-sort-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); margin-bottom: 10px; }
.gdt-food-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.gdt-food-row { display: flex; flex-direction: column; gap: 6px; }
.gdt-food-bar-wrap { height: 5px; background: var(--bg); border-radius: 4px; overflow: hidden; }
.gdt-food-bar { height: 100%; border-radius: 4px; }
.gdt-food-info .gdt-entry-top { font-size: 13.5px; }

.gdt-settings-text { font-size: 13px; color: var(--muted); line-height: 1.5; margin-bottom: 12px; }
.gdt-settings-hint { font-size: 11px; color: var(--muted); margin-top: 8px; }
.gdt-disclaimer { font-size: 11.5px; color: var(--muted); line-height: 1.5; }

.gdt-modal-backdrop { position: fixed; inset: 0; background: rgba(38,46,39,0.45); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
.gdt-modal { background: var(--surface); border-radius: 14px; padding: 20px; max-width: 360px; text-align: center; }
.gdt-modal-icon { color: #A5473F; display: flex; justify-content: center; margin-bottom: 8px; }
.gdt-modal h3 { font-family: 'Fraunces', serif; margin: 0 0 8px; font-size: 17px; }
.gdt-modal p { font-size: 13px; color: var(--muted); margin: 0 0 16px; line-height: 1.5; }
.gdt-modal-actions { display: flex; gap: 8px; justify-content: center; }

.gdt-tabbar {
  position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 560px;
  display: flex; background: var(--surface); border-top: 1px solid var(--border); padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
}
.gdt-tab {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; background: transparent; border: none;
  color: var(--muted); padding: 6px 2px; font-size: 10px; border-radius: 10px;
}
.gdt-tab--active { color: var(--sage); }
`;
