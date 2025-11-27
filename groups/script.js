let originalData = [];
let headers = [];
let pupilNameMap = {};
let pseudoToReal = {};
let isAnonView = true;
let currentAnonData = []; // Store the anonymised version of originalData
let highlightedCells = {}; // Track flagged cells by row+col
let rawAnonymisedSuggestion = ''; // global placeholder

// 🧠 Normalisation patch: expands common shorthand support terms to help GPT interpret them correctly
function normaliseSupportTerms(text) {
  const dictionary = {
    "SLCN": "Speech, Language and Communication Needs",
    "SLT": "Speech and Language Therapy",
    "SALT": "Speech and Language Therapy",
    "SEMH": "Social, Emotional, and Mental Health needs",
    "EAL": "English as an Additional Language",
    "ASC": "Autism",
    "ASD": "Autism",
    "1:1": "1:1 adult support",
    "EHCP": "has an Education, Health and Care Plan",
    "Dyslexia": "literacy processing difficulties",
    "on the spectrum": "Autism",
    "SLT time": "receiving Speech and Language input"
  };

  for (const [term, expansion] of Object.entries(dictionary)) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    text = text.replace(regex, expansion);
  }

  return text;
}

const hardcodedNames = [
  // Boys
  'Aaron', 'Adam', 'Alex', 'Alfie', 'Archie', 'Ben', 'Billy', 'Charlie', 'Connor', 'Daniel',
  'David', 'Dylan', 'Edward', 'Eli', 'Ethan', 'Felix', 'Finley', 'Freddie', 'George', 'Harry',
  'Harvey', 'Henry', 'Hugo', 'Isaac', 'Jack', 'Jacob', 'Jake', 'James', 'Jayden', 'Joe',
  'Joel', 'John', 'Joseph', 'Joshua', 'Leo', 'Lewis', 'Liam', 'Logan', 'Luca', 'Luke',
  'Mason', 'Matthew', 'Max', 'Michael', 'Nathan', 'Noah', 'Oliver', 'Oscar', 'Reuben',
  'Riley', 'Robert', 'Ryan', 'Samuel', 'Sebastian', 'Sonny', 'Theo', 'Thomas', 'Toby',
  'Tyler', 'William', 'Zachary',

  // Girls
  'Abigail', 'Alice', 'Amelia', 'Ava', 'Bella', 'Charlotte', 'Chloe', 'Daisy', 'Ella', 'Ellie',
  'Emily', 'Emma', 'Erin', 'Evie', 'Faith', 'Florence', 'Freya', 'Grace', 'Hannah', 'Harper',
  'Holly', 'Imogen', 'Isabel', 'Isabella', 'Isla', 'Ivy', 'Jessica', 'Katie', 'Lacey', 'Layla',
  'Lily', 'Lola', 'Lucy', 'Matilda', 'Megan', 'Mia', 'Millie', 'Molly', 'Nancy', 'Olivia',
  'Phoebe', 'Poppy', 'Rosie', 'Ruby', 'Scarlett', 'Sienna', 'Sophie', 'Summer', 'Willow',
  'Zara',

  // Unisex/Common modern names
  'Alex', 'Bailey', 'Charlie', 'Drew', 'Elliot', 'Finley', 'Frankie', 'Harley', 'Jamie',
  'Jayden', 'Jesse', 'Jordan', 'Morgan', 'Riley', 'Rowan', 'Taylor'
];
function displayTable(data, headers) {
  const table = document.createElement('table');
  const thead = table.createTHead();
  const headerRow = thead.insertRow();

  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    headerRow.appendChild(th);
  });

  const tbody = table.createTBody();
  data.forEach((row, rowIndex) => {
    const tr = tbody.insertRow();
    headers.forEach(header => {
      const td = tr.insertCell();
      const cellValue = row[header] !== undefined ? row[header] : '';
      td.textContent = cellValue;
      td.style.border = '1px solid #ddd';
      td.style.padding = '4px';
    });
  });

  const outputDiv = document.getElementById('table-container');
  outputDiv.innerHTML = ''; // Clear previous table
  outputDiv.appendChild(table);
}


document.getElementById('upload').addEventListener('change', function (e) {
  const file = e.target.files[0];
  const reader = new FileReader();

  reader.onload = function (event) {
    const csv = event.target.result;
    const parsed = Papa.parse(csv, {
      header: true,
      skipEmptyLines: true
    });

    originalData = parsed.data;
    headers = parsed.meta.fields;
    highlightedCells = {}; // reset highlights
    displayTable(originalData, headers);
    document.getElementById('results').innerHTML = '';
  };

  reader.readAsText(file);
});

document.getElementById('check-names').addEventListener('click', function () {
  if (!originalData.length) return;

  const nameColumn = headers.find(h => h.toLowerCase() === 'name');
  const extractedNames = originalData.map(row => row[nameColumn]).filter(Boolean); // ← renamed!
  const foundNames = [];
  highlightedCells = {};

  originalData.forEach((row, rowIndex) => {
  headers.forEach(header => {
    if (header.toLowerCase() === 'name') return;
    const cell = row[header];
    if (!cell) return;

    const cellLower = cell.toLowerCase();

    extractedNames.forEach((name) => {
      if (!name) return;
      const nameLower = name.toLowerCase().trim();
      if (cellLower.includes(nameLower)) {
        foundNames.push(`Row ${rowIndex + 1}, Column '${header}': "${name}"`);
        if (!highlightedCells[rowIndex]) highlightedCells[rowIndex] = {};
        highlightedCells[rowIndex][header] = true;
      }
    });

    hardcodedNames.forEach(name => {
      const regex = new RegExp(`\\b${name}\\b`, 'i');
      if (regex.test(String(cell))) {
        foundNames.push(`Row ${rowIndex + 1}, Column '${header}': "${name}"`);
        if (!highlightedCells[rowIndex]) highlightedCells[rowIndex] = {};
        highlightedCells[rowIndex][header] = true;
      }
    });

  }); // ✅ this closes headers.forEach
});   // ✅ this closes originalData.forEach

  displayTable(originalData, headers); // Refresh with highlights

const resultsDiv = document.getElementById('results');

if (foundNames.length > 0) {
  resultsDiv.innerHTML = `
    <p style="text-align: center;"><strong>⚠️ The following names were found in notes or comments:</strong></p>
    <ul style="text-align: center; list-style: none; padding: 0;">
      ${foundNames.map(name => `<li>${name}</li>`).join('')}
    </ul>
    <p style="text-align: center;">Please anonymise these entries before continuing.</p>
  `;
} else {
  resultsDiv.innerHTML = `
    <p style="text-align: center;"><strong>✅ No names found in notes or comments.</strong></p>
    <p style="text-align: center;">You’re good to go.</p>
  `;
}



document.getElementById('anonymise').addEventListener('click', function () {
  if (!originalData.length) return;
  const anonymised = anonymiseData(originalData, headers);
  currentAnonData = anonymised; // Save for future use
  displayTable(anonymised, headers);
  document.getElementById('results').innerHTML = '<p style="text-align: center;"><strong>✅ Anonymisation complete. Pupil names replaced.</strong></p>';


  // 🔁 Move this block here
  if (Object.keys(pseudoToReal).length > 0) {
    document.getElementById('toggle-container').style.display = 'block';
  }
});


function anonymiseData(data, headers) {
  const nameHeader = headers.find(h => h.toLowerCase() === 'name');
  pupilNameMap = {};

  const anonymised = data.map((row, index) => {
    const newRow = { ...row };
    const originalName = row[nameHeader]?.trim();

  if (originalName) {
    const pseudonym = `Pupil ${index + 1}`;
    const lowerName = originalName.toLowerCase();

    pupilNameMap[lowerName] = pseudonym;
    pseudoToReal[pseudonym] = originalName;

  newRow[nameHeader] = pseudonym;
}


    headers.forEach(header => {
      if (header === nameHeader) return;
      let cell = row[header];
      if (!cell) return;

      Object.keys(pupilNameMap).forEach(realName => {
        const pseudonym = pupilNameMap[realName];
        const regex = new RegExp(`\\b${realName}\\b`, 'gi');
        cell = cell.replace(regex, pseudonym);
      });

      hardcodedNames.forEach(name => {
        const pseudonym = Object.entries(pupilNameMap).find(([real]) =>
          real.includes(name.toLowerCase())
        )?.[1];
        if (pseudonym) {
          const regex = new RegExp(`\\b${name}\\b`, 'gi');
          cell = cell.replace(regex, pseudonym);
        }
      });

      newRow[header] = cell;
    });

    return newRow;
  });

  highlightedCells = {}; // clear highlights after anonymising
  return anonymised;
}

function displayTable(data, headers) {
  const tableContainer = document.getElementById('table-container');
  tableContainer.innerHTML = '';

  const table = document.createElement('table');
  table.style.borderCollapse = 'collapse';
  table.style.width = '100%';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach(header => {
    const th = document.createElement('th');
    th.textContent = header;
    th.style.border = '1px solid #ccc';
    th.style.padding = '8px';
    th.style.background = '#f4f4f4';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  data.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    headers.forEach(header => {
      const td = document.createElement('td');
      td.textContent = row[header] || '';
      td.style.border = '1px solid #ccc';
      td.style.padding = '8px';

      if (highlightedCells[rowIndex] && highlightedCells[rowIndex][header]) {
        td.classList.add('highlight');
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableContainer.appendChild(table);
}

// 🔁 Toggle between anonymised and real view
document.getElementById('toggle-view').addEventListener('click', function () {
  isAnonView = !isAnonView;

  const nameHeader = headers.find(h => h.toLowerCase() === 'name');

  const displayData = originalData.map(row => {
    const newRow = { ...row };
    const name = row[nameHeader]?.trim();

    if (name) {
      newRow[nameHeader] = isAnonView
        ? pupilNameMap[name.toLowerCase()] || name
        : pseudoToReal[name] || name;
    }

    return newRow;
  });

  displayTable(displayData, headers);
  this.textContent = isAnonView ? 'Switch to Real View' : 'Switch to Anon View';
});

document.getElementById('suggest-groups').addEventListener('click', async () => {
  if (!currentAnonData.length) {
  alert('Please anonymise the data before requesting group suggestions.');
  return;
}

  // 1. Create an anonymised summary for each pupil
  // 🔧 Normalise support terms for GPT clarity
const summaries = currentAnonData.map((row, index) => {
  const summary = Object.entries(row)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  const clarified = normaliseSupportTerms(summary);
  return `Pupil ${index + 1}: ${clarified}`;
}).join('\n');

  // 2. Prepare your API key and prompt
const prompt = `
Here is a list of anonymised pupils with support needs and characteristics:

${summaries}

You are helping a teacher organise pupil groupings for learning activities.

Each pupil has anonymised data including gender, academic level (WTS, EXS, GDS), support needs (e.g. SEMH, SLCN), and additional comments.

Create [X] groups of [Y] pupils based on the following principles. Briefly explain your reasoning for each group.

1. Group pupils in ways that support learning — consider academic level, communication needs, confidence, and behaviour.
2. Prioritise **functional groupings**, such as pairing a confident speaker with a quieter pupil, or balancing support needs so that one child does not dominate adult attention.
3. Avoid grouping multiple pupils with high SEMH needs together unless the context supports it.
4. Do not group pupils with known incompatibilities (e.g. "Pupil 9 and Pupil 10 must not be in the same group").
5. Respect any explicit teacher notes in the comments field.
6. Do **not** create groups based purely on “a mix” — every group must have a clear rationale for learning.
7. Some pupils may appear in more than one group where appropriate — for example, if they require additional support or act as effective peer models. Avoid unnecessary duplication, but allow it when educationally justified.
8. Do not assume that pupils with additional needs (e.g. EHCPs, ASD, SEMH) are suited to support others. These pupils should not be framed as peer supporters unless explicitly indicated in the teacher notes.

After forming the groups, write a short explanation for each group. Each explanation should:
- Focus on **pedagogical purpose** (e.g. pairing strengths and areas of need)
- Be respectful and professional
- Avoid vague or generic phrases like "a diverse mix"

Use only the anonymised pupil names (e.g. “Pupil 4”). Keep the explanation concise and appropriate for a professional setting.
`;

  // 3. Send to OpenAI
  try {
    const response = await fetch('/api/suggest-groups', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ prompt })
});

if (!response.ok) {
  throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
}

const data = await response.json();
const suggestion = data.suggestion || 'No response received.';
rawAnonymisedSuggestion = suggestion; // ✅ Uses the global variable
console.log('🤖 Suggestion received:', suggestion);


    // 4. Display the output
    document.getElementById('group-suggestions').innerHTML = `
  <p><strong>🔒 These groupings use anonymised names only (e.g. Pupil 1).</strong></p>
  <pre id="gpt-output" style="white-space: pre-wrap; word-break: break-word;">${suggestion}</pre>
  ` ;

  document.getElementById('reveal-button-container').style.display = 'block';

  } catch (error) {
    console.error('Error fetching from OpenAI:', error);
    alert('Something went wrong when contacting the API.');
  }
});

const revealBtn = document.getElementById('reveal-names');

if (revealBtn) {
  revealBtn.addEventListener('click', () => {
    console.log('✅ Reveal button clicked');

    const outputElement = document.getElementById("gpt-output");

    if (!rawAnonymisedSuggestion || !outputElement) {
      alert("Please generate groupings before trying to reveal real names.");
      console.warn('⚠️ Groupings not yet generated or #gpt-output missing.');
      return;
    }

    const reidentifiedText = rawAnonymisedSuggestion.replace(/Pupil \d+/g, (match) => {
      return pseudoToReal[match] || match;
    });

    outputElement.textContent = reidentifiedText;
    console.log('✅ Real names inserted into output.');
  });
} else {
  console.warn("⚠️ Could not find #reveal-names button.");
}
});
