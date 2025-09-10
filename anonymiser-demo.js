/* ======== /anonymiser-demo.js ======== */
import {
  normalizeName,
  buildPseudonymMaps,
  anonymise,
  reidentify,
} from "./anonymiser.js";

function byId(id) { return document.getElementById(id); }

function parseNames(text) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(normalizeName);
}

function renderMap(list) {
  return list.map(({ real, pseudo }) => `${pseudo} ⟷ ${real}`).join("\n");
}

function initDemo(rootId = "anon-demo") {
  const root = byId(rootId);
  if (!root) return;

  const namesEl = root.querySelector("[data-names]");
  const inputEl = root.querySelector("[data-input]");
  const anonEl  = root.querySelector("[data-output-anon]");
  const reidEl  = root.querySelector("[data-output-reid]");
  const mapEl   = root.querySelector("[data-output-map]");
  const goBtn   = root.querySelector("[data-go]");

  goBtn.addEventListener("click", () => {
    const names = parseNames(namesEl.value);
    const { realToPseudo, pseudoToReal, list } = buildPseudonymMaps(names, {
      scheme: "Pupil-###",
      startAt: 1,
      seed: 0,
    });

    const text = inputEl.value;
    const anonText = anonymise(text, realToPseudo);
    const reidText = reidentify(anonText, pseudoToReal);

    anonEl.value = anonText;
    reidEl.value = reidText;
    mapEl.value = renderMap(list);
  });
}

document.addEventListener("DOMContentLoaded", () => initDemo());
