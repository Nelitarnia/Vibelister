// fs.js - Pogressive file IO (Chromium gets File System Access; others get input/download fallbacks)

export const hasFS = !!(window.showOpenFilePicker && window.showSaveFilePicker);
let lastHandle = null;

export async function openJson() {
  if (hasFS) {
    const [h] = await showOpenFilePicker({
      types: [
        { description: "JSON", accept: { "application/json": [".json"] } },
      ],
      excludeAcceptAllOption: false,
      multiple: false,
    });
    const file = await h.getFile();
    const text = await file.text();
    lastHandle = h;
    return { data: JSON.parse(text), name: file.name, handle: h };
  } else {
    const file = await pickViaInput(".json,application/json");
    const text = await file.text();
    return { data: JSON.parse(text), name: file.name, handle: null };
  }
}

export async function saveJson(
  data,
  { as = false, suggestedName = "project.json" } = {},
) {
  const text = JSON.stringify(data);
  if (hasFS) {
    if (!lastHandle || as) {
      lastHandle = await showSaveFilePicker({
        suggestedName,
        types: [
          { description: "JSON", accept: { "application/json": [".json"] } },
        ],
      });
    }
    const w = await lastHandle.createWritable();
    await w.write(text);
    await w.close();
    const file = await lastHandle.getFile();
    return { name: file.name, handle: lastHandle };
  } else {
    downloadBlob(new Blob([text], { type: "application/json" }), suggestedName);
    return { name: suggestedName, handle: null };
  }
}

// —— helpers ——
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickViaInput(accept) {
  return new Promise((resolve, reject) => {
    const inp = document.createElement("input");
    inp.type = "file";
    if (accept) inp.accept = accept;
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      document.body.removeChild(inp);
      f ? resolve(f) : reject(new Error("No file chosen"));
    };
    inp.click();
  });
}
