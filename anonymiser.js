/* ======== /anonymiser.js ======== */

export function normalizeName(raw) {
  if (!raw) return "";
  const s = String(raw).trim().replace(/\s+/g, " ");
  return s
    .toLowerCase()
    .split(" ")
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleDeterministic(arr, seed = 12345) {
  const rnd = mulberry32(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nameRegex(fullName) {
  const esc = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${esc}\\b`, "g");
}

export function buildPseudonymMaps(pupilNames, options = {}) {
  const { scheme = "Pupil-###", startAt = 1, seed = null } = options;

  const seen = new Set();
  let clean = [];
  for (const n of pupilNames) {
    const norm = normalizeName(n);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    clean.push(norm);
  }
  if (typeof seed === "number") clean = shuffleDeterministic(clean, seed);

  const greek = [
    "Alpha","Beta","Gamma","Delta","Epsilon","Zeta","Eta","Theta","Iota","Kappa",
    "Lambda","Mu","Nu","Xi","Omicron","Pi","Rho","Sigma","Tau","Upsilon","Phi","Chi","Psi","Omega"
  ];
  const makePseudo = (i) => {
    const num = (startAt + i).toString().padStart(3, "0");
    if (typeof scheme === "function") return scheme(startAt + i, i);
    if (scheme === "Greek") {
      const base = greek[i % greek.length];
      const cycle = Math.floor(i / greek.length) + 1;
      return `${base}-${cycle}`;
    }
    return `Pupil-${num}`;
  };

  const realToPseudo = new Map();
  const pseudoToReal = new Map();
  const list = [];
  clean.forEach((real, i) => {
    const pseudo = makePseudo(i);
    realToPseudo.set(real, pseudo);
    pseudoToReal.set(pseudo, real);
    list.push({ real, pseudo });
  });

  return { realToPseudo, pseudoToReal, list };
}

export function anonymise(input, realToPseudo, { fields = [], extraNames = [] } = {}) {
  const targetNames = [
    ...realToPseudo.keys(),
    ...extraNames.map(normalizeName),
  ];
  const replacers = targetNames
    .map((n) => ({ name: n, re: nameRegex(n), pseudo: realToPseudo.get(n) || null }))
    .filter((x) => x.pseudo);

  const replaceInString = (s) => {
    let out = s;
    for (const { re, pseudo } of replacers) out = out.replace(re, pseudo);
    return out;
  };

  if (typeof input === "string") return replaceInString(input);

  if (Array.isArray(input)) {
    return input.map((row) => anonymise(row, realToPseudo, { fields, extraNames }));
  }

  if (input && typeof input === "object") {
    const copy = { ...input };
    for (const key of fields) {
      if (!(key in copy) || copy[key] == null) continue;
      copy[key] = replaceInString(String(copy[key]));
    }
    return copy;
  }

  return input;
}

export function reidentify(input, pseudoToReal, { fields = [] } = {}) {
  const pseudonyms = [...pseudoToReal.keys()];
  const replacers = pseudonyms.map((p) => ({ re: nameRegex(p), real: pseudoToReal.get(p) }));

  const replaceInString = (s) => {
    let out = s;
    for (const { re, real } of replacers) out = out.replace(re, real);
    return out;
  };

  if (typeof input === "string") return replaceInString(input);

  if (Array.isArray(input)) {
    return input.map((row) => reidentify(row, pseudoToReal, { fields }));
  }

  if (input && typeof input === "object") {
    const copy = { ...input };
    for (const key of fields) {
      if (!(key in copy) || copy[key] == null) continue;
      copy[key] = replaceInString(String(copy[key]));
    }
    return copy;
  }

  return input;
}

export function findPupilNamesInText(text, pupilNames) {
  const hits = new Set();
  for (const n of pupilNames) {
    const norm = normalizeName(n);
    if (!norm) continue;
    if (nameRegex(norm).test(text)) hits.add(norm);
  }
  return [...hits];
}
