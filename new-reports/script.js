document.addEventListener("DOMContentLoaded", () => {
  // ====== STATE ======
  let ccrData = [];              // [{ id, name, rawRow, anonymisedRow }]
  let currentPupilIndex = 0;     // index into ccrData

  // CSV structure
  let csvHeaders = [];
  let csvNameIndex = -1;
  let csvDataRows = [];          // raw data rows for preview + checks

  // Name mapping + reidentification maps
  let pupilNameMap = {}; // lowercased full name -> "Pupil N"
  let reidMaps = {
    pseudoToReal: {},    // "Pupil N" -> Real Name
    realToPseudo: {}     // Real Name -> "Pupil N"
  };
  let namesAreClean = false; // gate for anonymise

  // For Groups-style highlighting
  let highlightedCells = {}; // { rowIndex: { header: true } }

  // Hardcoded common names (copied from Groups)
  const hardcodedNames = [
    // Boys
    'Aaron','Adam','Alex','Alfie','Archie','Ben','Billy','Charlie','Connor','Daniel',
    'David','Dylan','Edward','Eli','Ethan','Felix','Finley','Freddie','George','Harry',
    'Harvey','Henry','Hugo','Isaac','Jack','Jacob','Jake','James','Jayden','Joe',
    'Joel','John','Joseph','Joshua','Leo','Lewis','Liam','Logan','Luca','Luke',
    'Mason','Matthew','Max','Michael','Nathan','Noah','Oliver','Oscar','Reuben',
    'Riley','Robert','Ryan','Samuel','Sebastian','Sonny','Theo','Thomas','Toby',
    'Tyler','William','Zachary',
    // Girls
    'Abigail','Alice','Amelia','Ava','Bella','Charlotte','Chloe','Daisy','Ella','Ellie',
    'Emily','Emma','Erin','Evie','Faith','Florence','Freya','Grace','Hannah','Harper',
    'Holly','Imogen','Isabel','Isabella','Isla','Ivy','Jessica','Katie','Lacey','Layla',
    'Lily','Lola','Lucy','Matilda','Megan','Mia','Millie','Molly','Nancy','Olivia',
    'Phoebe','Poppy','Rosie','Ruby','Scarlett','Sienna','Sophie','Summer','Willow',
    'Zara',
    // Unisex/common modern
    'Alex','Bailey','Charlie','Drew','Elliot','Finley','Frankie','Harley','Jamie',
    'Jayden','Jesse','Jordan','Morgan','Riley','Rowan','Taylor'
  ];

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
      if (!step) return;
      step.style.display = idx === stepIndex ? "block" : "none";
    });
  }

  showStep(0); // start at Step 1

  // ====== STEP 1: CCR UPLOAD + NAME CHECK + ANONYMISATION ======
  const ccrFileInput     = document.getElementById("ccrFile");
  const btnCheckNames    = document.getElementById("btnCheckNames");
  const btnAnonymise     = document.getElementById("btnAnonymise");
  const btnToTemplate    = document.getElementById("btnToTemplate");
  const ccrPreview       = document.getElementById("ccrPreview");
  const ccrPreviewTable  = document.getElementById("ccrPreviewTable");
  const nameCheckSummary = document.getElementById("nameCheckSummary");

  // initial button state (like Groups)
  if (btnCheckNames)  btnCheckNames.disabled  = true;
  if (btnAnonymise)   btnAnonymise.disabled   = true;
  if (btnToTemplate)  btnToTemplate.disabled  = true;

  // When a file is chosen: parse + raw preview (NO checks yet)
  ccrFileInput.addEventListener("change", () => {
    const file = ccrFileInput.files[0];

    if (!file) {
      // reset UI if file cleared
      ccrPreviewTable.innerHTML = "";
      ccrPreview.style.display = "none";
      nameCheckSummary.textContent = "";
      namesAreClean = false;
      if (btnCheckNames)  btnCheckNames.disabled  = true;
      if (btnAnonymise)   btnAnonymise.disabled   = true;
      if (btnToTemplate)  btnToTemplate.disabled  = true;
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;

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
          const pseudoId = `Pupil ${idx + 1}`;

          const rawRow = {};
          headers.forEach((h, i) => {
            rawRow[h] = row[i] || "";
          });

          return {
            id: pseudoId,
            name: displayName,
            rawRow,
            anonymisedRow: null,
          };
        });

      if (!ccrData.length) {
        alert("No pupil rows found. Please check your CSV.");
        return;
      }

      csvHeaders   = headers;
      csvNameIndex = nameIndex;
      csvDataRows  = dataRows;

      // reset name maps + gating
      pupilNameMap = {};
      reidMaps     = { pseudoToReal: {}, realToPseudo: {} };
      namesAreClean = false;
      highlightedCells = {};

      if (btnCheckNames) {
        btnCheckNames.disabled = false;
      }
      if (btnAnonymise)  btnAnonymise.disabled  = true;
      if (btnToTemplate) btnToTemplate.disabled = true;

      nameCheckSummary.style.color = "#555";
      nameCheckSummary.textContent =
        "Preview loaded. When you're ready, click 'Check for names' to scan for pupil names before anonymising.";

      renderRawPreview(headers, dataRows, nameIndex);
      ccrPreview.style.display = "block";
    };

    reader.readAsText(file);
  });

  /**
   * Raw preview (no checks, no highlights) – matches Groups behaviour
   */
  function renderRawPreview(headers, dataRows, nameIndex) {
    ccrPreviewTable.innerHTML = "";

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "0.9rem";

    const headerRow = document.createElement("tr");

    function addCell(tr, text, isHeader = false) {
      const cell = document.createElement(isHeader ? "th" : "td");
      cell.textContent = text;
      cell.style.padding = "4px";
      cell.style.borderBottom = "1px solid #ccc";
      cell.style.textAlign = "left";
      if (isHeader) cell.style.fontWeight = "600";
      tr.appendChild(cell);
      return cell;
    }

    addCell(headerRow, "Pseudonym", true);
    headers.forEach((h) => addCell(headerRow, h, true));
    table.appendChild(headerRow);

    dataRows.forEach((row, rowIdx) => {
      const tr = document.createElement("tr");
      const pseudoId = ccrData[rowIdx]?.id || `Pupil ${rowIdx + 1}`;
      const pseudoCell = addCell(tr, pseudoId, false);
      pseudoCell.style.fontWeight = "600";

      headers.forEach((h, colIdx) => {
        const cellValue = row[colIdx] || "";
        addCell(tr, cellValue, false);
      });

      table.appendChild(tr);
    });

    ccrPreviewTable.appendChild(table);
  }

  // 1) Check for names – Groups-style
  btnCheckNames.addEventListener("click", () => {
    if (!csvHeaders.length || !csvDataRows.length) {
      alert("Please upload a class record first.");
      return;
    }
    renderPreviewAndNameCheck(csvHeaders, csvDataRows);
  });

  /**
   * Preview + strong name scan (Groups logic, adapted to this structure)
   */
  function renderPreviewAndNameCheck(headers, dataRows) {
    // Build Groups-style row objects from the CSV arrays
    const originalData = dataRows.map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || "";
      });
      return obj;
    });

    // Reset UI + gates
    ccrPreviewTable.innerHTML = "";
    highlightedCells = {};
    namesAreClean = false;
    if (btnAnonymise)  btnAnonymise.disabled  = true;
    if (btnToTemplate) btnToTemplate.disabled = true;

    // Find the "Name" column exactly like Groups
    const nameColumn = headers.find((h) => h.toLowerCase() === "name");
    if (!nameColumn) {
      alert("Couldn't find a 'Name' column.");
      nameCheckSummary.style.color = "#b94a48";
      nameCheckSummary.textContent =
        "Name check could not run because no 'Name' column was found.";
      return;
    }

    // Extract names from the Name column (no extra heuristics)
      // Extract names from the Name column.
  // Filter out obvious non-name codes like PLP / RWI group / HAST test labels.
  const extractedNames = originalData
    .map((row) => row[nameColumn])
    .filter(Boolean)
    .filter((value) => {
      const lower = String(value).toLowerCase();

      // Anything that looks like a programme / code, not a pupil name
      const blockedKeywords = ["group", "test", "spelling", "inc", "plp", "hast"];
      if (blockedKeywords.some((kw) => lower.includes(kw))) return false;

      // Very short / very long strings aren’t realistic pupil names
      if (lower.length < 2 || lower.length > 60) return false;

      return true;
    });


    const foundNames = [];
    highlightedCells = {};

    // Exact Groups logic: full-name substring + hardcoded first-name regex
    originalData.forEach((row, rowIndex) => {
      headers.forEach((header) => {
        if (header.toLowerCase() === "name") return;
        const cell = row[header];
        if (!cell) return;

        const cellLower = String(cell).toLowerCase();

        // 1) Full names from Name column
        extractedNames.forEach((name) => {
          if (!name) return;
          const nameLower = name.toLowerCase().trim();
          if (nameLower && cellLower.includes(nameLower)) {
            foundNames.push(`Row ${rowIndex + 1}, Column '${header}': "${name}"`);
            if (!highlightedCells[rowIndex]) highlightedCells[rowIndex] = {};
            highlightedCells[rowIndex][header] = true;
          }
        });

        // 2) Hardcoded first names
        hardcodedNames.forEach((name) => {
          const regex = new RegExp(`\\b${name}\\b`, "i");
          if (regex.test(String(cell))) {
            foundNames.push(`Row ${rowIndex + 1}, Column '${header}': "${name}"`);
            if (!highlightedCells[rowIndex]) highlightedCells[rowIndex] = {};
            highlightedCells[rowIndex][header] = true;
          }
        });
      });
    });

    // Re-render the table with highlights applied
    renderCheckedPreview(headers, originalData);

    // Display result summary (simpler than Groups UI but same semantics)
    if (foundNames.length > 0) {
      nameCheckSummary.style.color = "#b94a48";
      nameCheckSummary.innerHTML = `
        <p><strong>⚠️ The following names were found in notes or comments:</strong></p>
        <ul style="list-style:none;padding:0;margin:0;">
          ${foundNames.map((n) => `<li>${n}</li>`).join("")}
        </ul>
        <p>Please anonymise these entries in your spreadsheet and re-upload before continuing.</p>
      `;
      namesAreClean = false;
      if (btnAnonymise)  btnAnonymise.disabled  = true;
      if (btnToTemplate) btnToTemplate.disabled = true;
    } else {
      nameCheckSummary.style.color = "#3c763d";
      nameCheckSummary.innerHTML = `
        <p><strong>✅ No names found in notes or comments.</strong></p>
        <p>You’re good to go. You can now anonymise the list.</p>
      `;
      namesAreClean = true;
      if (btnAnonymise)  btnAnonymise.disabled  = false;
      if (btnToTemplate) btnToTemplate.disabled = true;
    }
  }

  // Re-render preview table using highlightedCells map
  function renderCheckedPreview(headers, rowObjects) {
    ccrPreviewTable.innerHTML = "";

    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "0.9rem";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    function addCell(tr, text, isHeader = false) {
      const cell = document.createElement(isHeader ? "th" : "td");
      cell.textContent = text;
      cell.style.padding = "4px";
      cell.style.borderBottom = "1px solid #ccc";
      cell.style.textAlign = "left";
      if (isHeader) cell.style.fontWeight = "600";
      tr.appendChild(cell);
      return cell;
    }

    addCell(headerRow, "Pseudonym", true);
    headers.forEach((h) => addCell(headerRow, h, true));
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    rowObjects.forEach((row, rowIndex) => {
      const tr = document.createElement("tr");

      const pseudoId = ccrData[rowIndex]?.id || `Pupil ${rowIndex + 1}`;
      const pseudoCell = addCell(tr, pseudoId, false);
      pseudoCell.style.fontWeight = "600";

      headers.forEach((header) => {
        const td = addCell(tr, row[header] || "", false);

        if (highlightedCells[rowIndex] && highlightedCells[rowIndex][header]) {
          td.style.backgroundColor = "#fff3cd"; // pale yellow
          td.style.fontWeight = "bold";
        }
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    ccrPreviewTable.appendChild(table);
  }

  /**
   * Anonymise CCR rows in memory, Groups-style
   */
  function anonymiseCcrData() {
    if (!csvHeaders.length || csvNameIndex === -1) return;

    const nameHeader = csvHeaders[csvNameIndex];

    pupilNameMap = {};
    reidMaps = { pseudoToReal: {}, realToPseudo: {} };

    ccrData.forEach((pupil, index) => {
      const anonymisedRow = { ...pupil.rawRow };

      const originalName =
        (pupil.rawRow[nameHeader] || pupil.name || "").trim();
      const pseudonym = `Pupil ${index + 1}`;

      if (originalName) {
        pupilNameMap[originalName.toLowerCase()] = pseudonym;
        reidMaps.pseudoToReal[pseudonym] = originalName;
        reidMaps.realToPseudo[originalName] = pseudonym;
      }

      if (nameHeader in anonymisedRow) {
        anonymisedRow[nameHeader] = pseudonym;
      }

      csvHeaders.forEach((header) => {
        if (header === nameHeader) return;
        let cell = anonymisedRow[header];
        if (!cell) return;

        Object.entries(pupilNameMap).forEach(([realLower, pseudo]) => {
          const escaped = realLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`\\b${escaped}\\b`, "gi");
          cell = cell.replace(regex, pseudo);
        });

        hardcodedNames.forEach((name) => {
          const matchEntry = Object.entries(pupilNameMap).find(([real]) =>
            real.includes(name.toLowerCase())
          );
          const pseudo = matchEntry ? matchEntry[1] : null;

          if (pseudo) {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`\\b${escaped}\\b`, "gi");
            cell = cell.replace(regex, pseudo);
          }
        });

        anonymisedRow[header] = cell;
      });

      pupil.anonymisedRow = anonymisedRow;
      pupil.id = pseudonym;
    });
  }

  // 2) Anonymise button
  btnAnonymise.addEventListener("click", () => {
    if (!ccrData.length) {
      alert("Please upload and check the file for names first.");
      return;
    }
    if (!namesAreClean) {
      alert("Please resolve all name-check issues before anonymising.");
      return;
    }

    anonymiseCcrData();
    nameCheckSummary.innerHTML =
      "<p>✅ Anonymisation complete. You can now choose report sections.</p>";
    btnAnonymise.disabled  = true;
    btnToTemplate.disabled = false;
  });

  // 3) Next: go to template builder
  btnToTemplate.addEventListener("click", () => {
    if (!ccrData.length || !ccrData[0].anonymisedRow) {
      alert("Please anonymise the class record first.");
      return;
    }
    showStep(1); // Step 2: template builder
  });

  // ====== STEP 2: TEMPLATE BUILDER ======
  const sectionList   = document.getElementById("sectionList");
  const btnAddSection = document.getElementById("btnAddSection");
  const btnSaveTemplate = document.getElementById("btnSaveTemplate");
  const btnToTone       = document.getElementById("btnToTone");

  const sectionTemplate = sectionList?.querySelector(".section-row");

  function renumberSectionHeaders() {
    const rows = sectionList.querySelectorAll(".section-row");
    rows.forEach((row, idx) => {
      row.dataset.sectionIndex = idx;
      const headerSpan = row.querySelector(".section-row-header span");
      if (headerSpan) headerSpan.textContent = `Section ${idx + 1}`;
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

    const nameInput        = clone.querySelector(".section-name");
    const wordInput        = clone.querySelector(".section-word-count");
    const nextStepCheckbox = clone.querySelector(".section-next-step");

    if (nameInput)        nameInput.value = name || `Section ${idx + 1}`;
    if (wordInput)        wordInput.value = wordCount;
    if (nextStepCheckbox) nextStepCheckbox.checked = includeNextStep;

    wireSectionRowControls(clone);
    return clone;
  }

  function wireSectionRowControls(row) {
    const btnUp     = row.querySelector(".btn-move-up");
    const btnDown   = row.querySelector(".btn-move-down");
    const btnDelete = row.querySelector(".btn-delete-section");

    if (btnUp) {
      btnUp.onclick = () => {
        const prev = row.previousElementSibling;
        if (prev && prev.classList.contains("section-row")) {
          sectionList.insertBefore(row, prev);
          renumberSectionHeaders();
        }
      };
    }

    if (btnDown) {
      btnDown.onclick = () => {
        const next = row.nextElementSibling;
        if (next && next.classList.contains("section-row")) {
          sectionList.insertBefore(next, row);
          renumberSectionHeaders();
        }
      };
    }

    if (btnDelete) {
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
  }

  const initialRow = sectionList?.querySelector(".section-row");
  if (initialRow) {
    wireSectionRowControls(initialRow);
  }

  btnAddSection?.addEventListener("click", () => {
    const newRow = createSectionRow();
    if (newRow) {
      sectionList.appendChild(newRow);
      renumberSectionHeaders();
    }
  });

  btnSaveTemplate?.addEventListener("click", () => {
    const template = getCurrentTemplateConfig();
    localStorage.setItem("cbai_report_template", JSON.stringify(template));
    alert("Template saved on this device.");
  });

  function getCurrentTemplateConfig() {
    const rows = sectionList.querySelectorAll(".section-row");
    const sections = [];
    rows.forEach((row) => {
      const nameInput        = row.querySelector(".section-name");
      const wordInput        = row.querySelector(".section-word-count");
      const nextStepCheckbox = row.querySelector(".section-next-step");
      sections.push({
        name: nameInput.value.trim() || "Section",
        wordTarget: Number(wordInput.value) || 100,
        includeNextStep: nextStepCheckbox.checked,
      });
    });
    return sections;
  }

  const savedTemplate = localStorage.getItem("cbai_report_template");
  if (savedTemplate) {
    try {
      const sections = JSON.parse(savedTemplate);
      sectionList.innerHTML = "";
      sections.forEach((s) => {
        const row = createSectionRow(s.name, s.wordTarget, s.includeNextStep);
        if (row) sectionList.appendChild(row);
      });
      renumberSectionHeaders();
    } catch (e) {
      console.warn("Could not parse saved template", e);
    }
  }

  btnToTone?.addEventListener("click", () => {
    const sections = getCurrentTemplateConfig();
    if (!sections.length) {
      alert("Please add at least one section.");
      return;
    }
    showStep(2);
  });

  // ====== STEP 3: TONE & STYLE ======
  const btnToPupilSelect = document.getElementById("btnToPupilSelect");
  const styleNotesInput  = document.getElementById("styleNotes");

  function getSelectedTone() {
    const toneRadios = document.querySelectorAll("input[name='tone']");
    let value = "balanced";
    toneRadios.forEach((r) => {
      if (r.checked) value = r.value;
    });
    return value;
  }

  btnToPupilSelect?.addEventListener("click", () => {
    populatePupilSelect();
    showStep(3);
  });

  // ====== STEP 4: PUPIL SELECT & GENERATE ======
  const pupilSelect      = document.getElementById("pupilSelect");
  const btnGenerateReport = document.getElementById("btnGenerateReport");
  const generationStatus  = document.getElementById("generationStatus");

  function populatePupilSelect() {
    if (!pupilSelect) return;
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

  btnGenerateReport?.addEventListener("click", () => {
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

    const template   = getCurrentTemplateConfig();
    const tone       = getSelectedTone();
    const styleNotes = styleNotesInput?.value.trim() || "";

    const pupilRowForBackend = pupil.anonymisedRow || pupil.rawRow;

    const payload = {
      pupilId: pupil.id,             // "Pupil N"
      pupilData: pupilRowForBackend, // anonymised CCR row
      template,
      tone,
      styleNotes,
    };

    if (generationStatus) generationStatus.style.display = "block";

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
        if (generationStatus) generationStatus.style.display = "none";
      });
  });

  // ====== REIDENTIFICATION UTIL ======
  function reidentify(text) {
    if (!text) return text;
    let out = text;

    Object.keys(reidMaps.pseudoToReal).forEach((pseudo) => {
      const realName = reidMaps.pseudoToReal[pseudo];
      if (!realName) return;
      const safePseudo = pseudo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${safePseudo}\\b`, "g");
      out = out.replace(regex, realName);
    });

    return out;
  }

  // ====== STEP 5: OUTPUT & COPY ======
  const reportSectionsContainer = document.getElementById("reportSections");
  const btnCopyAll   = document.getElementById("btnCopyAll");
  const btnNextPupil = document.getElementById("btnNextPupil");
  const btnRevealNames = document.getElementById("btnRevealNames");

  function renderReportOutput(pupil, template, sectionsData = {}) {
    if (!reportSectionsContainer) return;
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
      // Show anonymised (Pupil N) by default
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

    if (btnRevealNames) {
      btnRevealNames.disabled = false;
      btnRevealNames.textContent = "Reveal pupil names (local only)";
    }

    showStep(4);
  }

  // Manual reveal of real names (local only)
  btnRevealNames?.addEventListener("click", () => {
    const sections = reportSectionsContainer?.querySelectorAll(".report-section");
    if (!sections || !sections.length) {
      alert("No report content to update.");
      return;
    }

    sections.forEach((sec) => {
      const textArea = sec.querySelector(".report-text");
      if (textArea) {
        textArea.value = reidentify(textArea.value);
      }
      const nextArea = sec.querySelector(".report-next-step");
      if (nextArea) {
        nextArea.value = reidentify(nextArea.value);
      }
    });

    btnRevealNames.disabled = true;
    btnRevealNames.textContent = "Names revealed (local only)";
  });

  btnCopyAll?.addEventListener("click", async () => {
    const sections = reportSectionsContainer?.querySelectorAll(".report-section");
    if (!sections || !sections.length) {
      alert("No report content to copy.");
      return;
    }

    let combined = "";
    sections.forEach((sec) => {
      const title = sec.querySelector("h3").textContent;
      const text  = sec.querySelector(".report-text").value.trim();
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

  btnNextPupil?.addEventListener("click", () => {
    if (!ccrData.length) return;
    currentPupilIndex = (currentPupilIndex + 1) % ccrData.length;
    const nextPupil = ccrData[currentPupilIndex];
    if (pupilSelect) pupilSelect.value = nextPupil.id;
    showStep(3);
  });
});
