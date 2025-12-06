document.addEventListener("DOMContentLoaded", () => {
  // ====== STATE ======
  let ccrData = [];              // [{ id, name, rawRow, anonymisedRow }]
  let currentPupilIndex = 0;     // index into ccrData for "next pupil" behaviour

  // Keep headers + name column index for anonymisation
  let csvHeaders = [];
  let csvNameIndex = -1;

  // ====== STEP HELPERS ======
  const steps = [
    document.getElementById("step-1-upload"),
    document.getElementById("step-2-template"),
    document.getElementById("step-3-tone"),
    document.getElementById("step-4-generate"),
    document.getElementById("step-5-output")
  ];

  function showStep(stepIndex) {
    steps.forEach((step, idx) => {
      step.style.display = idx === stepIndex ? "block" : "none";
    });
  }

  showStep(0); // start at Step 1

  // ====== STEP 1: CCR UPLOAD + NAME CHECK + ANONYMISATION ======
  const ccrFileInput = document.getElementById("ccrFile");
  const btnParseCCR = document.getElementById("btnParseCCR");
  const ccrPreview = document.getElementById("ccrPreview");
  const ccrPreviewTable = document.getElementById("ccrPreviewTable");
  const btnToTemplate = document.getElementById("btnToTemplate");
  const nameCheckSummary = document.getElementById("nameCheckSummary");

  btnParseCCR.addEventListener("click", () => {
    const file = ccrFileInput.files[0];
    if (!file) {
      alert("Please choose a CSV file first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;

      // Very simple CSV parsing; you can swap for PapaParse later.
      const rows = text
        .trim()
        .split(/\r?\n/)
        .map((r) => r.split(","));

      if (!rows.length) {
        alert("File appears to be empty.");
        return;
      }

      const headers = rows[0].map((h) => h.trim());
      const dataRows = rows.slice(1);

      // Find a "Name" column if possible
      const nameIndex = headers.findIndex((h) => {
        const lower = h.toLowerCase();
        return (
          lower === "name" ||
          lower === "pupil" ||
          lower === "pupil name"
        );
      });

      if (nameIndex === -1) {
        alert(
          "Couldn't find a 'Name', 'Pupil' or 'Pupil Name' column in the CSV. Please check your file."
        );
        return;
      }

      // Build ccrData with pseudonyms; keep rawRow as header-keyed object
      ccrData = dataRows
        .filter((row) => row[nameIndex] && row[nameIndex].trim() !== "")
        .map((row, idx) => {
          const displayName = row[nameIndex].trim();
          const pseudoId = `Anon-${String(idx + 1).padStart(2, "0")}`;

          const rawRow = {};
          headers.forEach((h, i) => {
            rawRow[h] = row[i] || "";
          });

          return {
            id: pseudoId,
            name: displayName, // local only
            rawRow,
            anonymisedRow: null, // will be filled after anonymisation
          };
        });

      if (!ccrData.length) {
        alert("No pupil rows found. Please check your CSV.");
        return;
      }

      // Save header + name column index for later anonymisation
      csvHeaders = headers;
      csvNameIndex = nameIndex;

      // Render preview and run name check
      renderPreviewAndNameCheck(headers, dataRows, nameIndex);

      ccrPreview.style.display = "block";
    };

    reader.readAsText(file);
  });

  /**
   * Build a preview table showing:
   * - Pseudonym (first column)
   * - All CCR columns
   * Also runs a simple name scan: it looks for any pupil names from the Name column
   * appearing in any *other* column. If found, we block progress.
   */
  function renderPreviewAndNameCheck(headers, dataRows, nameIndex) {
    // Clear old content
    ccrPreviewTable.innerHTML = "";
    nameCheckSummary.textContent = "";
    btnToTemplate.disabled = true;

    // Collect the list of pupil names from the Name column
    const pupilNames = dataRows
      .map((row) => (row[nameIndex] || "").trim())
      .filter((x) => x !== "");

    // Helper: does a cell contain any pupil name as a separate word?
    function cellContainsName(cellValue) {
      if (!cellValue) return null;
      const text = String(cellValue);
      for (const name of pupilNames) {
        if (!name) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "i");
        if (regex.test(text)) return name;
      }
      return null;
    }

    // Build the table
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "0.9rem";

    // Header row: Pseudonym + all headers
    const headerRow = document.createElement("tr");

    function addCell(tr, text, isHeader = false) {
      const cell = document.createElement(isHeader ? "th" : "td");
      cell.textContent = text;
      cell.style.padding = "4px";
      cell.style.borderBottom = "1px solid #ccc";
      cell.style.textAlign = "left";
      if (isHeader) {
        cell.style.fontWeight = "600";
      }
      tr.appendChild(cell);
      return cell;
    }

    addCell(headerRow, "Pseudonym", true);
    headers.forEach((h) => addCell(headerRow, h, true));
    table.appendChild(headerRow);

    // Data rows
    const flaggedCells = [];

    dataRows.forEach((row, rowIdx) => {
      const tr = document.createElement("tr");

      // Pseudonym from ccrData (same order)
      const pseudoId = ccrData[rowIdx]?.id || `Anon-${String(rowIdx + 1).padStart(2, "0")}`;
      const pseudoCell = addCell(tr, pseudoId, false);
      pseudoCell.style.fontWeight = "600";

      headers.forEach((h, colIdx) => {
        const cellValue = row[colIdx] || "";
        const td = addCell(tr, cellValue, false);

        // Name check: only scan non-name columns
        if (colIdx !== nameIndex) {
          const matchedName = cellContainsName(cellValue);
          if (matchedName) {
            flaggedCells.push({
              rowIndex: rowIdx,
              colIndex: colIdx,
              matchedName,
              value: cellValue,
            });
            td.style.backgroundColor = "#fff3cd"; // light amber
            td.style.borderBottom = "1px solid #f0c36d";
            td.title = `Contains pupil name: "${matchedName}"`;
          }
        }
      });

      table.appendChild(tr);
    });

    ccrPreviewTable.appendChild(table);

    // Name-check summary + button gating
    if (flaggedCells.length > 0) {
      const uniqueMatches = Array.from(
        new Set(flaggedCells.map((f) => `"${f.matchedName}"`))
      ).join(", ");
      nameCheckSummary.style.color = "#b94a48";
      nameCheckSummary.textContent =
        `Name check: found ${flaggedCells.length} cell(s) containing pupil name(s) in other columns: ${uniqueMatches}. ` +
        `Please fix your CCR (remove or replace these names) and re-upload before continuing.`;
      btnToTemplate.disabled = true;
    } else {
      nameCheckSummary.style.color = "#3c763d";
      nameCheckSummary.textContent =
        "Name check: no pupil names were found in other columns. You can safely anonymise and continue.";
      btnToTemplate.disabled = false;
    }
  }

  /**
   * Replace the Name column in each CCR row with the pseudonym, and store that
   * as `anonymisedRow`. This is what we send to the backend.
   */
  function anonymiseCcrData() {
    if (!csvHeaders.length || csvNameIndex === -1) return;

    const nameHeader = csvHeaders[csvNameIndex];

    ccrData.forEach((pupil) => {
      const anonymisedRow = { ...pupil.rawRow };

      // Replace the name column with the pseudonym
      if (nameHeader in anonymisedRow) {
        anonymisedRow[nameHeader] = pupil.id;
      }

      // OPTIONAL: scrub any obviously sensitive columns here by header
      // e.g. delete anonymisedRow["UPN"]; delete anonymisedRow["DOB"]; etc.

      pupil.anonymisedRow = anonymisedRow;
    });
  }

  btnToTemplate.addEventListener("click", () => {
    if (!ccrData.length) {
      alert("Please upload and preview your class record first.");
      return;
    }

    // Final safeguard: don’t move on if we somehow re-disabled it
    if (btnToTemplate.disabled) {
      alert("Please resolve all name-check issues before continuing.");
      return;
    }

    // Anonymise CCR rows in memory before any AI calls happen
    anonymiseCcrData();

    showStep(1); // Step 2: template builder
  });

  // ====== STEP 2: TEMPLATE BUILDER ======
  const sectionList = document.getElementById("sectionList");
  const btnAddSection = document.getElementById("btnAddSection");
  const btnSaveTemplate = document.getElementById("btnSaveTemplate");
  const btnToTone = document.getElementById("btnToTone");

  // Grab the initial section-row from the HTML as our template
  const sectionTemplate = sectionList.querySelector(".section-row");

  // Helper to renumber section headers (Section 1, Section 2, etc.)
  function renumberSectionHeaders() {
    const rows = sectionList.querySelectorAll(".section-row");
    rows.forEach((row, idx) => {
      row.dataset.sectionIndex = idx;
      const headerSpan = row.querySelector(".section-row-header span");
      headerSpan.textContent = `Section ${idx + 1}`;
      const nextStepCheckbox = row.querySelector(".section-next-step");
      if (nextStepCheckbox) {
        nextStepCheckbox.id = `section-${idx}-next-step`;
        const label = row.querySelector(
          "label[for^='section-'][for$='-next-step']"
        );
        if (label) {
          label.setAttribute("for", `section-${idx}-next-step`);
        }
      }
    });
  }

  function createSectionRow(name = "", wordCount = 100, includeNextStep = false) {
    if (!sectionTemplate) {
      console.error("No sectionTemplate found in HTML");
      return null;
    }

    const clone = sectionTemplate.cloneNode(true);
    const idx = sectionList.querySelectorAll(".section-row").length;

    clone.dataset.sectionIndex = idx;
    const headerSpan = clone.querySelector(".section-row-header span");
    if (headerSpan) headerSpan.textContent = `Section ${idx + 1}`;

    const nameInput = clone.querySelector(".section-name");
    const wordInput = clone.querySelector(".section-word-count");
    const nextStepCheckbox = clone.querySelector(".section-next-step");

    if (nameInput) nameInput.value = name || `Section ${idx + 1}`;
    if (wordInput) wordInput.value = wordCount;
    if (nextStepCheckbox) nextStepCheckbox.checked = includeNextStep;

    wireSectionRowControls(clone);
    return clone;
  }

  function wireSectionRowControls(row) {
    const btnUp = row.querySelector(".btn-move-up");
    const btnDown = row.querySelector(".btn-move-down");
    const btnDelete = row.querySelector(".btn-delete-section");

    btnUp.onclick = () => {
      const prev = row.previousElementSibling;
      if (prev && prev.classList.contains("section-row")) {
        sectionList.insertBefore(row, prev);
        renumberSectionHeaders();
      }
    };

    btnDown.onclick = () => {
      const next = row.nextElementSibling;
      if (next && next.classList.contains("section-row")) {
        sectionList.insertBefore(next, row);
        renumberSectionHeaders();
      }
    };

    btnDelete.onclick = () => {
      const rows = sectionList.querySelectorAll(".section-row");
      if (rows.length === 1) {
        alert("You must have at least one section.");
        return;
      }
      row.remove();
      renumberSectionHeaders();
    };
  }

  // Wire the initial section row
  const initialRow = sectionList.querySelector(".section-row");
  if (initialRow) {
    wireSectionRowControls(initialRow);
  }

  btnAddSection.addEventListener("click", () => {
    const newRow = createSectionRow();
    sectionList.appendChild(newRow);
    renumberSectionHeaders();
  });

  btnSaveTemplate.addEventListener("click", () => {
    const template = getCurrentTemplateConfig();
    localStorage.setItem("cbai_report_template", JSON.stringify(template));
    alert("Template saved on this device.");
  });

  function getCurrentTemplateConfig() {
    const rows = sectionList.querySelectorAll(".section-row");
    const sections = [];
    rows.forEach((row) => {
      const nameInput = row.querySelector(".section-name");
      const wordInput = row.querySelector(".section-word-count");
      const nextStepCheckbox = row.querySelector(".section-next-step");
      sections.push({
        name: nameInput.value.trim() || "Section",
        wordTarget: Number(wordInput.value) || 100,
        includeNextStep: nextStepCheckbox.checked,
      });
    });
    return sections;
  }

  // Optionally load template from localStorage on start
  const savedTemplate = localStorage.getItem("cbai_report_template");
  if (savedTemplate) {
    try {
      const sections = JSON.parse(savedTemplate);
      // Remove the initial row and rebuild
      sectionList.innerHTML = "";
      sections.forEach((s, idx) => {
        const row = createSectionRow(s.name, s.wordTarget, s.includeNextStep);
        sectionList.appendChild(row);
      });
      renumberSectionHeaders();
    } catch (e) {
      console.warn("Could not parse saved template", e);
    }
  }

  btnToTone.addEventListener("click", () => {
    const sections = getCurrentTemplateConfig();
    if (!sections.length) {
      alert("Please add at least one section.");
      return;
    }
    showStep(2);
  });

  // ====== STEP 3: TONE & STYLE ======
  const btnToPupilSelect = document.getElementById("btnToPupilSelect");
  const styleNotesInput = document.getElementById("styleNotes");

  function getSelectedTone() {
    const toneRadios = document.querySelectorAll("input[name='tone']");
    let value = "balanced";
    toneRadios.forEach((r) => {
      if (r.checked) value = r.value;
    });
    return value;
  }

  btnToPupilSelect.addEventListener("click", () => {
    populatePupilSelect();
    showStep(3);
  });

  // ====== STEP 4: PUPIL SELECT & GENERATE ======
  const pupilSelect = document.getElementById("pupilSelect");
  const btnGenerateReport = document.getElementById("btnGenerateReport");
  const generationStatus = document.getElementById("generationStatus");

  function populatePupilSelect() {
    pupilSelect.innerHTML = "";
    ccrData.forEach((pupil) => {
      const opt = document.createElement("option");
      opt.value = pupil.id;
      opt.textContent = `${pupil.id} – ${pupil.name}`;
      pupilSelect.appendChild(opt);
    });
    currentPupilIndex = 0;
    if (ccrData.length > 0) {
      pupilSelect.value = ccrData[0].id;
    }
  }

  btnGenerateReport.addEventListener("click", () => {
    if (!ccrData.length) {
      alert("No pupils loaded.");
      return;
    }
    const selectedId = pupilSelect.value;
    const pupil = ccrData.find((p) => p.id === selectedId);
    if (!pupil) {
      alert("Please select a valid pupil.");
      return;
    }

    const template = getCurrentTemplateConfig();
    const tone = getSelectedTone();
    const styleNotes = styleNotesInput.value.trim();

    // IMPORTANT: send anonymisedRow if we have it; fall back to rawRow
    const pupilRowForBackend = pupil.anonymisedRow || pupil.rawRow;

    const payload = {
      pupilId: pupil.id,             // pseudonym only
      pupilData: pupilRowForBackend, // anonymised CCR row
      template,
      tone,
      styleNotes,
      // pupilName: pupil.name,      // keep local only; not needed by backend
    };

    generationStatus.style.display = "block";

    fetch("/.netlify/functions/suggestReports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((t) => {
            throw new Error(`Server error: ${res.status} ${t}`);
          });
        }
        return res.json();
      })
      .then((data) => {
        renderReportOutput(pupil, template, data);
        showStep(4);
      })
      .catch((err) => {
        console.error(err);
        alert("There was an error generating the report. Please try again.");
      })
      .finally(() => {
        generationStatus.style.display = "none";
      });
  });

  // ====== STEP 5: OUTPUT & COPY ======
  const reportSectionsContainer = document.getElementById("reportSections");
  const btnCopyAll = document.getElementById("btnCopyAll");
  const btnNextPupil = document.getElementById("btnNextPupil");

  function renderReportOutput(pupil, template, sectionsData = {}) {
    reportSectionsContainer.innerHTML = "";

    template.forEach((sec) => {
      const wrapper = document.createElement("div");
      wrapper.className = "report-section";
      wrapper.dataset.sectionName = sec.name;

      const h = document.createElement("h3");
      h.textContent = sec.name;
      wrapper.appendChild(h);

      const commentArea = document.createElement("textarea");
      commentArea.className = "report-text";
      commentArea.value = sectionsData[sec.name] || "";
      wrapper.appendChild(commentArea);

      if (sec.includeNextStep) {
        const fg = document.createElement("div");
        fg.className = "field-group";

        const label = document.createElement("label");
        label.textContent = "Next step";
        fg.appendChild(label);

        const nextArea = document.createElement("textarea");
        nextArea.className = "report-next-step";
        nextArea.value = sectionsData[`${sec.name}_next_step`] || "";
        fg.appendChild(nextArea);

        wrapper.appendChild(fg);
      }

      reportSectionsContainer.appendChild(wrapper);
    });

    showStep(4);
  }

  btnCopyAll.addEventListener("click", async () => {
    const sections = reportSectionsContainer.querySelectorAll(".report-section");
    if (!sections.length) {
      alert("No report content to copy.");
      return;
    }

    let combined = "";
    sections.forEach((sec) => {
      const title = sec.querySelector("h3").textContent;
      const text = sec.querySelector(".report-text").value.trim();
      const nextStep = sec.querySelector(".report-next-step")
        ? sec.querySelector(".report-next-step").value.trim()
        : "";

      combined += `${title}\n${text}\n`;
      if (nextStep) {
        combined += `Next step: ${nextStep}\n`;
      }
      combined += "\n";
    });

    try {
      await navigator.clipboard.writeText(combined.trim());
      alert("Report copied to clipboard. You can now paste it into your school template.");
    } catch (err) {
      console.error(err);
      alert("Unable to copy to clipboard. Please copy manually.");
    }
  });

  btnNextPupil.addEventListener("click", () => {
    if (!ccrData.length) return;
    currentPupilIndex = (currentPupilIndex + 1) % ccrData.length;
    const nextPupil = ccrData[currentPupilIndex];
    pupilSelect.value = nextPupil.id;
    showStep(3); // back to pupil selection / generate
  });
});
