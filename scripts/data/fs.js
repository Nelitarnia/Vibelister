// fs.js - Pogressive file IO (Chromium gets File System Access; others get input/download fallbacks)

export const hasFS = !!(window.showOpenFilePicker && window.showSaveFilePicker);
const lastHandles = new Map();
const DEFAULT_HANDLE_KEY = "project";

function getHandle(key = DEFAULT_HANDLE_KEY) {
  return lastHandles.get(key) || null;
}

function setHandle(key, handle) {
  if (!key) return;
  if (handle) lastHandles.set(key, handle);
  else lastHandles.delete(key);
}

function getTypes(types) {
  return (
    types || [
      { description: "JSON", accept: { "application/json": [".json"] } },
    ]
  );
}

export async function openJson(options = {}) {
  const {
    handleKey = DEFAULT_HANDLE_KEY,
    types = null,
    accept,
    excludeAcceptAllOption = false,
    multiple = false,
  } = options;
  if (hasFS) {
    const [h] = await showOpenFilePicker({
      types: getTypes(types),
      excludeAcceptAllOption,
      multiple,
    });
    const file = await h.getFile();
    const text = await file.text();
    setHandle(handleKey, h);
    return { data: JSON.parse(text), name: file.name, handle: h };
  } else {
    const file = await pickViaInput(
      accept || ".json,application/json",
    );
    const text = await file.text();
    return { data: JSON.parse(text), name: file.name, handle: null };
  }
}

export async function saveJson(
  data,
  {
    as = false,
    suggestedName = "project.json",
    handleKey = DEFAULT_HANDLE_KEY,
    types = null,
  } = {},
) {
  const text = JSON.stringify(data);
  if (hasFS) {
    let handle = getHandle(handleKey);
    if (!handle || as) {
      handle = await showSaveFilePicker({
        suggestedName,
        types: getTypes(types),
      });
      setHandle(handleKey, handle);
    }
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
    const file = await handle.getFile();
    return { name: file.name, handle };
  } else {
    downloadBlob(new Blob([text], { type: "application/json" }), suggestedName);
    return { name: suggestedName, handle: null };
  }
}

export function forgetHandle(handleKey = DEFAULT_HANDLE_KEY) {
  setHandle(handleKey, null);
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
