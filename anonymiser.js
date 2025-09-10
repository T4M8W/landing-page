// ===== Minimal anonymiser (Scrimba-level) =====

// 1) Get names in order (one per line). Trims and drops blank lines.
function getNames(raw) {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(n => n.trim())
    .filter(n => n.length > 0);
}

// 2) Build a simple, deterministic map (no de-dupe, no sorting)
function buildMap(names) {
  const realToPseudo = {};
  const pseudoToReal = {};
  names.forEach((name, i) => {
    const pseudo = "Pupil-" + String(i + 1).padStart(2, "0");
    realToPseudo[name] = pseudo;
    pseudoToReal[pseudo] = name;
  });
  return { realToPseudo, pseudoToReal, names };
}

// 3) Simple replace using word boundaries (basic regex).
//    (We sort longer names first so "Ann" doesn't hit inside "Anna".)
function anonymiseText(text, realToPseudo) {
  const names = Object.keys(realToPseudo).sort((a, b) => b.length - a.length);
  let out = text;
  names.forEach(name => {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp("\\b" + esc + "\\b", "g"), realToPseudo[name]);
  });
  return out;
}

function reidentifyText(text, pseudoToReal) {
  const pseudos = Object.keys(pseudoToReal).sort((a, b) => b.length - a.length);
  let out = text;
  pseudos.forEach(p => {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp("\\b" + esc + "\\b", "g"), pseudoToReal[p]);
  });
  return out;
}

// ===== Wire up UI =====
const namesEl = document.getElementById("names-input");
const timetableEl = document.getElementById("timetable-input");
const runBtn = document.getElementById("run-btn");
const reidBtn = document.getElementById("reid-btn");

const nameCountEl = document.getElementById("name-count");
const anonOut = document.getElementById("anonymised-output");
const mapOut = document.getElementById("mapping-output");
const reidOut = document.getElementById("reidentified-output");

let currentMap = null;

// Disable reidentify until we have a map
reidBtn.disabled = true;

// Update counter live (optional)
namesEl.addEventListener("input", () => {
  const n = getNames(namesEl.value).length;
  nameCountEl.textContent = n > 0 ? `✓ ${n} names detected` : "";
  runBtn.disabled = n === 0;
});

// Run anonymiser
runBtn.addEventListener("click", () => {
  const names = getNames(namesEl.value);
  if (names.length === 0) return;

  currentMap = buildMap(names);

  // Show mapping
  mapOut.textContent = currentMap.names
    .map((name, i) => `Anon-${String(i + 1).padStart(2, "0")} → ${name}`)
    .join("\n");

  // Anonymise timetable text
  const anonymised = anonymiseText(timetableEl.value, currentMap.realToPseudo);
  anonOut.textContent = anonymised;

  // Enable reidentify
  reidBtn.disabled = false;
});

// Reidentify from the anonymised box
reidBtn.addEventListener("click", () => {
  if (!currentMap) return;
  const reid = reidentifyText(anonOut.textContent, currentMap.pseudoToReal);
  reidOut.textContent = reid;
});
