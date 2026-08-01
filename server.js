const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const TASKS_FILE = path.join(ROOT, "tasks.json");
const TMP_TASKS_FILE = path.join(ROOT, "tasks.json.tmp");
const UNITS_FILE = path.join(ROOT, "units.json");
const TMP_UNITS_FILE = path.join(ROOT, "units.json.tmp");
const SETTINGS_FILE = path.join(ROOT, "settings.json");
const TMP_SETTINGS_FILE = path.join(ROOT, "settings.json.tmp");
const ACTIVITY_LOG_FILE = path.join(ROOT, "activityLog.json");
const TMP_ACTIVITY_LOG_FILE = path.join(ROOT, "activityLog.json.tmp");
const DEFAULT_UNIT_ID = "451-upstairs";

const routes = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
};

const STATUSES = ["pending-review", "approved", "done"];
const MATERIAL_TYPES = ["shopping", "onhand"];
const MATERIAL_TYPE_CATEGORIES = {
  shopping: "Shopping List",
  onhand: "Materials",
};

const DEFAULT_UNITS = [
  { id: "451-upstairs", name: "451 Upstairs", status: "active" },
  { id: "451-downstairs", name: "451 Downstairs", status: "active" },
  { id: "441-upstairs", name: "441 Upstairs", status: "active" },
  { id: "441-downstairs", name: "441 Downstairs", status: "active" },
];

const DEFAULT_SETTINGS = {
  rooms: [
    "Materials",
    "Exterior / Entry",
    "Bathroom",
    "Kitchen",
    "Walls / Ceilings",
    "Living Room",
    "Bedrooms",
    "Doors / Hardware",
    "Windows",
    "Final Cleaning",
  ],
  categories: [
    "Shopping List",
    "Materials",
    "Prep",
    "Plaster / Spackle",
    "Sanding",
    "Caulking",
    "Painting",
    "Hardware",
    "Appliances",
    "Windows",
    "Cleaning",
    "Final Cleaning",
  ],
  categoryAccents: {
    "Shopping List": "#f59e0b",
    Materials: "#64748b",
    Prep: "#2563eb",
    "Plaster / Spackle": "#7c3aed",
    Sanding: "#a16207",
    Caulking: "#0f766e",
    Painting: "#db2777",
    Hardware: "#475569",
    Appliances: "#0891b2",
    Windows: "#0284c7",
    Cleaning: "#16a34a",
    "Final Cleaning": "#047857",
  },
};

async function readJsonFile(filePath, fallbackValue) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch {
    return fallbackValue;
  }
}

async function writeJsonFile(filePath, tmpFilePath, payload) {
  const data = `${JSON.stringify(payload, null, 2)}\n`;
  await fs.writeFile(tmpFilePath, data, "utf8");
  await fs.rename(tmpFilePath, filePath);
}

async function readTasks() {
  try {
    const data = await fs.readFile(TASKS_FILE, "utf8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.map(normalizeTask) : [];
  } catch {
    return [];
  }
}

function normalizePhoto(photo) {
  if (typeof photo === "string") {
    return {
      id: crypto.randomUUID(),
      data: photo,
      filename: "Photo",
      timestamp: new Date().toISOString(),
    };
  }

  return {
    id: photo.id || crypto.randomUUID(),
    data: photo.data || photo.url || "",
    filename: photo.filename || "Photo",
    timestamp: photo.timestamp || new Date().toISOString(),
  };
}

function normalizeVoiceNote(voiceNote) {
  if (typeof voiceNote === "string") {
    return {
      id: crypto.randomUUID(),
      data: voiceNote,
      filename: "Voice note",
      mimeType: "audio/webm",
      timestamp: new Date().toISOString(),
      duration: null,
      size: getDataUrlSize(voiceNote),
    };
  }

  return {
    id: voiceNote.id || crypto.randomUUID(),
    data: voiceNote.data || voiceNote.url || "",
    filename: voiceNote.filename || "Voice note",
    mimeType: voiceNote.mimeType || "audio/webm",
    timestamp: voiceNote.timestamp || new Date().toISOString(),
    duration: voiceNote.duration || null,
    size: voiceNote.size || getDataUrlSize(voiceNote.data || voiceNote.url || ""),
  };
}

function normalizeTask(task, index = 0) {
  const room = task.room || "General";
  const materialType = normalizeMaterialType(task, room);
  const status = normalizeStatus(task);

  return {
    id: task.id || crypto.randomUUID(),
    unitId: task.unitId || DEFAULT_UNIT_ID,
    room,
    category: task.category || (room === "Materials" ? getMaterialCategory(materialType) : "Prep"),
    text: task.text || "",
    note: task.note || "",
    photos: Array.isArray(task.photos)
      ? task.photos.map(normalizePhoto).filter((photo) => photo.data)
      : [],
    voiceNotes: Array.isArray(task.voiceNotes)
      ? task.voiceNotes.map(normalizeVoiceNote).filter((voiceNote) => voiceNote.data)
      : [],
    materialType,
    status,
    order: normalizeOrder(task.order, index),
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
    completedAt: status === "done" ? task.completedAt || task.updatedAt || task.createdAt || new Date().toISOString() : null,
  };
}

function normalizeOrder(order, fallbackIndex) {
  return Number.isFinite(order) ? order : fallbackIndex + 1;
}

function normalizeStatus(task) {
  if (STATUSES.includes(task.status)) {
    return task.status;
  }

  if (task.status === "in-progress") {
    return "approved";
  }

  return task.done ? "done" : "approved";
}

function getDataUrlSize(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.floor((base64.length * 3) / 4);
}

function normalizeMaterialType(task, room) {
  if (room !== "Materials") {
    return null;
  }

  if (MATERIAL_TYPES.includes(task.materialType)) {
    return task.materialType;
  }

  return task.category === "Materials" ? "onhand" : "shopping";
}

function getMaterialCategory(materialType) {
  return MATERIAL_TYPE_CATEGORIES[materialType] || "Shopping List";
}

async function writeTasks(tasks) {
  const normalizedTasks = tasks.map((task, index) => normalizeTask(task, index));
  await writeJsonFile(TASKS_FILE, TMP_TASKS_FILE, normalizedTasks);
  return normalizedTasks;
}

function normalizeUnit(unit, index = 0) {
  const now = new Date().toISOString();
  return {
    id: unit.id || `unit-${index + 1}`,
    name: unit.name || `Unit ${index + 1}`,
    status: unit.status || "active",
    createdAt: unit.createdAt || now,
    updatedAt: unit.updatedAt || unit.createdAt || now,
  };
}

async function readUnits() {
  const parsed = await readJsonFile(UNITS_FILE, DEFAULT_UNITS);
  return Array.isArray(parsed) ? parsed.map(normalizeUnit) : DEFAULT_UNITS.map(normalizeUnit);
}

async function writeUnits(units) {
  const normalizedUnits = units.map(normalizeUnit);
  await writeJsonFile(UNITS_FILE, TMP_UNITS_FILE, normalizedUnits);
  return normalizedUnits;
}

async function readSettings() {
  const parsed = await readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
  return {
    rooms: Array.isArray(parsed.rooms) ? parsed.rooms.filter(Boolean) : DEFAULT_SETTINGS.rooms,
    categories: Array.isArray(parsed.categories) ? parsed.categories.filter(Boolean) : DEFAULT_SETTINGS.categories,
    categoryAccents: parsed.categoryAccents && typeof parsed.categoryAccents === "object"
      ? { ...DEFAULT_SETTINGS.categoryAccents, ...parsed.categoryAccents }
      : DEFAULT_SETTINGS.categoryAccents,
  };
}

async function writeSettings(settings) {
  const normalizedSettings = {
    rooms: Array.isArray(settings.rooms) ? settings.rooms.filter(Boolean) : DEFAULT_SETTINGS.rooms,
    categories: Array.isArray(settings.categories) ? settings.categories.filter(Boolean) : DEFAULT_SETTINGS.categories,
    categoryAccents: settings.categoryAccents && typeof settings.categoryAccents === "object"
      ? { ...DEFAULT_SETTINGS.categoryAccents, ...settings.categoryAccents }
      : DEFAULT_SETTINGS.categoryAccents,
  };
  await writeJsonFile(SETTINGS_FILE, TMP_SETTINGS_FILE, normalizedSettings);
  return normalizedSettings;
}

function normalizeActivityEntry(entry, index = 0) {
  return {
    id: entry.id || crypto.randomUUID(),
    unitId: entry.unitId || DEFAULT_UNIT_ID,
    taskId: entry.taskId || null,
    taskText: entry.taskText || "",
    room: entry.room || "",
    category: entry.category || "",
    action: entry.action || "completed",
    timestamp: entry.timestamp || new Date().toISOString(),
    order: Number.isFinite(entry.order) ? entry.order : index + 1,
  };
}

async function readActivityLog() {
  const parsed = await readJsonFile(ACTIVITY_LOG_FILE, []);
  return Array.isArray(parsed) ? parsed.map(normalizeActivityEntry) : [];
}

async function writeActivityLog(entries) {
  const normalizedEntries = entries.map(normalizeActivityEntry);
  await writeJsonFile(ACTIVITY_LOG_FILE, TMP_ACTIVITY_LOG_FILE, normalizedEntries);
  return normalizedEntries;
}

async function readRequestBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;
  }

  return body;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function serveFile(response, route) {
  try {
    const filePath = path.join(ROOT, route.file);
    const contents = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": route.type });
    response.end(contents);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function handleTasksApi(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, await readTasks());
    return;
  }

  if (request.method === "PUT") {
    try {
      const body = await readRequestBody(request);
      const tasks = JSON.parse(body);

      if (!Array.isArray(tasks)) {
        sendJson(response, 400, { error: "Request body must be a JSON array." });
        return;
      }

      const savedTasks = await writeTasks(tasks);
      sendJson(response, 200, savedTasks);
    } catch {
      sendJson(response, 400, { error: "Invalid JSON request body." });
    }
    return;
  }

  response.writeHead(405, { Allow: "GET, PUT" });
  response.end();
}

async function handleUnitsApi(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, await readUnits());
    return;
  }

  if (request.method === "PUT") {
    try {
      const body = await readRequestBody(request);
      const units = JSON.parse(body);

      if (!Array.isArray(units)) {
        sendJson(response, 400, { error: "Request body must be a JSON array." });
        return;
      }

      sendJson(response, 200, await writeUnits(units));
    } catch {
      sendJson(response, 400, { error: "Invalid JSON request body." });
    }
    return;
  }

  response.writeHead(405, { Allow: "GET, PUT" });
  response.end();
}

async function handleSettingsApi(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, await readSettings());
    return;
  }

  if (request.method === "PUT") {
    try {
      const body = await readRequestBody(request);
      const settings = JSON.parse(body);
      sendJson(response, 200, await writeSettings(settings));
    } catch {
      sendJson(response, 400, { error: "Invalid JSON request body." });
    }
    return;
  }

  response.writeHead(405, { Allow: "GET, PUT" });
  response.end();
}

async function handleActivityLogApi(request, response) {
  if (request.method === "GET") {
    sendJson(response, 200, await readActivityLog());
    return;
  }

  if (request.method === "PUT") {
    try {
      const body = await readRequestBody(request);
      const entries = JSON.parse(body);

      if (!Array.isArray(entries)) {
        sendJson(response, 400, { error: "Request body must be a JSON array." });
        return;
      }

      sendJson(response, 200, await writeActivityLog(entries));
    } catch {
      sendJson(response, 400, { error: "Invalid JSON request body." });
    }
    return;
  }

  response.writeHead(405, { Allow: "GET, PUT" });
  response.end();
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/tasks") {
      await handleTasksApi(request, response);
      return;
    }

    if (url.pathname === "/api/units") {
      await handleUnitsApi(request, response);
      return;
    }

    if (url.pathname === "/api/settings") {
      await handleSettingsApi(request, response);
      return;
    }

    if (url.pathname === "/api/activity-log") {
      await handleActivityLogApi(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "GET" && routes[url.pathname]) {
      await serveFile(response, routes[url.pathname]);
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
});

server.listen(PORT, () => {
  console.log(`Rental Flip Checklist running at http://localhost:${PORT}`);
});
