const DEFAULT_UNIT_ID = "451-upstairs";
const DEFAULT_UNITS = [
  { id: "451-upstairs", name: "451 Upstairs", status: "active" },
  { id: "451-downstairs", name: "451 Downstairs", status: "active" },
  { id: "441-upstairs", name: "441 Upstairs", status: "active" },
  { id: "441-downstairs", name: "441 Downstairs", status: "active" },
];

const DEFAULT_ROOMS = [
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
];

const DEFAULT_CATEGORIES = [
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
];

const DEFAULT_CATEGORY_ACCENTS = {
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
};

let ROOMS = [...DEFAULT_ROOMS];
let CATEGORIES = [...DEFAULT_CATEGORIES];
let CATEGORY_ACCENTS = { ...DEFAULT_CATEGORY_ACCENTS };

const STATUSES = ["pending-review", "approved", "done"];
const STATUS_META = {
  "pending-review": { label: "Pending Review", className: "status-pending-review" },
  approved: { label: "Approved", className: "status-approved" },
  done: { label: "Done", className: "status-done" },
};

const MATERIAL_TYPES = ["shopping", "onhand"];
const MATERIAL_TYPE_META = {
  shopping: { label: "Shopping List", category: "Shopping List" },
  onhand: { label: "Materials On Hand", category: "Materials" },
};

const SEARCH_FIELDS = ["text", "note", "room", "category"];
const MAX_VOICE_NOTE_SECONDS = 30;
const MAX_VOICE_NOTE_BYTES = 800 * 1024;
const MAX_VOICE_NOTES_PER_TASK = 3;
const MAX_PAGE_VOICE_RECORDINGS = 5;
const LONG_PRESS_CONTEXT_MENU_MS = 800;

const pageVoiceRecordButton = document.querySelector("#page-voice-record");
const pageVoiceCreateButton = document.querySelector("#page-voice-create");
const pageVoiceStatus = document.querySelector("#page-voice-status");
const pageVoiceRecordingsList = document.querySelector("#page-voice-recordings");
const showTaskSearchButton = document.querySelector("#show-task-search");
const hideTaskSearchButton = document.querySelector("#hide-task-search");
const taskSearchPanel = document.querySelector("#task-search-panel");
const tasksPanel = document.querySelector(".tasks-panel");
const searchInput = document.querySelector("#task-search");
const roomFilter = document.querySelector("#room-filter");
const categoryFilter = document.querySelector("#category-filter");
const statusFilter = document.querySelector("#status-filter");
const materialTypeFilter = document.querySelector("#material-type-filter");
const photoFilter = document.querySelector("#photo-filter");
const noteFilter = document.querySelector("#note-filter");
const clearFiltersButton = document.querySelector("#clear-filters");
const clearFiltersInlineButton = document.querySelector("#clear-filters-inline");
const workModeToggle = document.querySelector("#work-mode-toggle");
const taskContextMenu = document.querySelector("#task-context-menu");
const contextMoveRoom = document.querySelector("#context-move-room");
const contextMoveButton = document.querySelector("#context-move-button");
const dashboard = document.querySelector("#dashboard");
const workLog = document.querySelector("#work-log");
const unitSelect = document.querySelector("#unit-select");
const unitSummary = document.querySelector("#unit-summary");
const reviewQueuePanel = document.querySelector("#review-queue-panel");
const reviewQueueList = document.querySelector("#review-queue-list");
const bulkApproveButton = document.querySelector("#bulk-approve-review");
const materialsPanel = document.querySelector("#materials-panel");
const filtersPanel = document.querySelector("#filters-panel");
const materialsPanelBody = document.querySelector("#materials-panel-body");
const filtersPanelBody = document.querySelector("#filters-panel-body");
const shoppingList = document.querySelector("#shopping-list");
const materialsOnHand = document.querySelector("#materials-on-hand");
const taskGroups = document.querySelector("#task-groups");
const statusText = document.querySelector("#status");
const taskActions = document.querySelector("#task-actions");
const markOpenButton = document.querySelector("#mark-open");
const deleteDoneButton = document.querySelector("#delete-done");
const clearAllButton = document.querySelector("#clear-all");
const photoPreviewDialog = document.querySelector("#photo-preview-dialog");
const photoPreviewImage = document.querySelector("#photo-preview-image");
const photoPreviewCaption = document.querySelector("#photo-preview-caption");

let tasks = [];
let activityLog = [];
let units = [...DEFAULT_UNITS];
let selectedUnitId = DEFAULT_UNIT_ID;
let editingTaskId = null;
let editingRoomName = null;
const openRooms = new Set();
let filters = {
  query: "",
  room: "all",
  category: "all",
  status: "all",
  materialType: "all",
  photoState: "all",
  noteState: "all",
};
let draggedTaskId = null;
let swipeState = null;
let contextTaskId = null;
let contextOpenedAt = 0;
let longPressTimer = null;
let longPressStart = null;
let voiceRecorderState = null;
let pageVoiceRecordings = [];
const materialDoneVisibility = {
  shopping: true,
  onhand: true,
};
let isTaskSearchOpen = false;

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
    category: task.category || getDefaultCategoryForTask(task, room, materialType),
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

function normalizeMaterialType(task, room) {
  if (room !== "Materials") {
    return null;
  }

  if (MATERIAL_TYPES.includes(task.materialType)) {
    return task.materialType;
  }

  return task.category === "Materials" ? "onhand" : "shopping";
}

function getDefaultCategoryForTask(task, room, materialType) {
  if (room === "Materials") {
    return getMaterialCategory(materialType || "shopping");
  }

  return task.category || "Prep";
}

function getMaterialCategory(materialType) {
  return MATERIAL_TYPE_META[materialType]?.category || "Shopping List";
}

function getStatusLabel(status) {
  return STATUS_META[status]?.label || status;
}

function getStatusClass(status) {
  return STATUS_META[status]?.className || "status-approved";
}

function isDone(task) {
  return task.status === "done";
}

function isOpenStatus(status) {
  return status === "approved";
}

function isPendingReview(task) {
  return task.status === "pending-review";
}

function getSearchText(task) {
  return SEARCH_FIELDS.map((field) => task[field] || "").join(" ").toLowerCase();
}

function matchesSearch(task, query) {
  const trimmedQuery = query.trim().toLowerCase();
  return !trimmedQuery || getSearchText(task).includes(trimmedQuery);
}

function matchesPresenceFilter(hasValue, filterValue) {
  return (
    filterValue === "all" ||
    (filterValue === "yes" && hasValue) ||
    (filterValue === "no" && !hasValue)
  );
}

function hasTaskPhotos(task) {
  return Array.isArray(task.photos) && task.photos.length > 0;
}

function hasTaskNote(task) {
  return Boolean(task.note.trim());
}

function matchesFollowUpFilters(task) {
  return (
    matchesPresenceFilter(hasTaskPhotos(task), filters.photoState) &&
    matchesPresenceFilter(hasTaskNote(task), filters.noteState)
  );
}

function matchesTaskFilters(task) {
  return (
    matchesSearch(task, filters.query) &&
    matchesFollowUpFilters(task) &&
    (filters.room === "all" || task.room === filters.room) &&
    (filters.category === "all" || task.category === filters.category) &&
    (filters.status === "all" || task.status === filters.status)
  );
}

function matchesMaterialFilters(task) {
  return (
    matchesSearch(task, filters.query) &&
    matchesFollowUpFilters(task) &&
    (filters.status === "all" || task.status === filters.status) &&
    (filters.materialType === "all" || task.materialType === filters.materialType)
  );
}

function hasActiveFilters() {
  return (
    filters.query ||
    filters.room !== "all" ||
    filters.category !== "all" ||
    filters.status !== "all" ||
    filters.materialType !== "all" ||
    filters.photoState !== "all" ||
    filters.noteState !== "all"
  );
}

async function loadAppData() {
  await Promise.all([loadSettings(), loadUnits(), loadActivityLog()]);
  readFiltersFromUrl();
  await loadTasks();
}

async function loadSettings() {
  const response = await fetch("/api/settings");

  if (!response.ok) {
    throw new Error("Could not load settings.");
  }

  applySettings(await response.json());
}

function applySettings(settings) {
  ROOMS = Array.isArray(settings.rooms) && settings.rooms.length > 0
    ? settings.rooms
    : [...DEFAULT_ROOMS];
  CATEGORIES = Array.isArray(settings.categories) && settings.categories.length > 0
    ? settings.categories
    : [...DEFAULT_CATEGORIES];
  CATEGORY_ACCENTS = settings.categoryAccents && typeof settings.categoryAccents === "object"
    ? { ...DEFAULT_CATEGORY_ACCENTS, ...settings.categoryAccents }
    : { ...DEFAULT_CATEGORY_ACCENTS };
}

async function loadUnits() {
  const response = await fetch("/api/units");

  if (!response.ok) {
    throw new Error("Could not load units.");
  }

  const data = await response.json();
  units = Array.isArray(data) && data.length > 0 ? data : [...DEFAULT_UNITS];
}

async function loadTasks() {
  const response = await fetch("/api/tasks");

  if (!response.ok) {
    throw new Error("Could not load tasks.");
  }

  const data = await response.json();
  tasks = Array.isArray(data) ? normalizeTaskList(data) : [];
  render();
}

async function loadActivityLog() {
  const response = await fetch("/api/activity-log");

  if (!response.ok) {
    throw new Error("Could not load work log.");
  }

  const data = await response.json();
  activityLog = Array.isArray(data) ? normalizeActivityLog(data) : [];
}

async function saveTasks(tasksToSave) {
  const response = await fetch("/api/tasks", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tasksToSave),
  });

  if (!response.ok) {
    throw new Error("Could not save tasks.");
  }
}

async function saveActivityLog(entriesToSave) {
  const response = await fetch("/api/activity-log", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entriesToSave),
  });

  if (!response.ok) {
    throw new Error("Could not save work log.");
  }
}

async function updateTasks(nextTasks) {
  const previousTasks = tasks;
  const previousActivityLog = activityLog;
  const normalizedTasks = applyTaskMetadata(normalizeTaskList(nextTasks), previousTasks);
  const newActivityEntries = getCompletionActivityEntries(previousTasks, normalizedTasks);

  tasks = normalizedTasks;
  activityLog = newActivityEntries.length
    ? normalizeActivityLog([...newActivityEntries, ...activityLog])
    : activityLog;
  render();

  try {
    await saveTasks(tasks);
    if (newActivityEntries.length > 0) {
      await saveActivityLog(activityLog);
    }
    setStatus("");
  } catch (error) {
    tasks = previousTasks;
    activityLog = previousActivityLog;
    render();
    setStatus(error.message);
    alert(`${error.message} Your change was not saved.`);
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function normalizeTaskList(tasksToNormalize) {
  return tasksToNormalize.map((task, index) => normalizeTask(task, index));
}

function normalizeActivityLog(entriesToNormalize) {
  return entriesToNormalize
    .map(normalizeActivityEntry)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function normalizeActivityEntry(entry) {
  return {
    id: entry.id || crypto.randomUUID(),
    unitId: entry.unitId || DEFAULT_UNIT_ID,
    taskId: entry.taskId || null,
    taskText: entry.taskText || "",
    room: entry.room || "",
    category: entry.category || "",
    action: entry.action || "completed",
    timestamp: entry.timestamp || new Date().toISOString(),
  };
}

function applyTaskMetadata(nextTasks, previousTasks) {
  const now = new Date().toISOString();
  const previousById = new Map(previousTasks.map((task) => [task.id, task]));

  return nextTasks.map((task) => {
    const previousTask = previousById.get(task.id);
    const createdAt = task.createdAt || previousTask?.createdAt || now;
    const nextTask = {
      ...task,
      createdAt,
      updatedAt: task.updatedAt || previousTask?.updatedAt || createdAt,
      completedAt: task.completedAt || previousTask?.completedAt || null,
    };

    if (!previousTask) {
      return {
        ...nextTask,
        updatedAt: nextTask.updatedAt || createdAt,
        completedAt: isDone(nextTask) ? nextTask.completedAt || now : null,
      };
    }

    if (hasTaskChanged(previousTask, nextTask)) {
      nextTask.updatedAt = now;
    }

    if (isDone(nextTask) && !isDone(previousTask)) {
      nextTask.completedAt = now;
    } else if (!isDone(nextTask)) {
      nextTask.completedAt = null;
    }

    return nextTask;
  });
}

function hasTaskChanged(previousTask, nextTask) {
  return JSON.stringify(getComparableTask(previousTask)) !== JSON.stringify(getComparableTask(nextTask));
}

function getComparableTask(task) {
  const { createdAt, updatedAt, completedAt, done, ...comparableTask } = task;
  return comparableTask;
}

function getCompletionActivityEntries(previousTasks, nextTasks) {
  const previousById = new Map(previousTasks.map((task) => [task.id, task]));

  return nextTasks
    .filter((task) => isDone(task) && !isDone(previousById.get(task.id) || {}))
    .map((task) => ({
      id: crypto.randomUUID(),
      unitId: task.unitId,
      taskId: task.id,
      taskText: task.text,
      room: task.room,
      category: task.category,
      action: "completed",
      timestamp: task.completedAt || new Date().toISOString(),
    }));
}

function createTask(room, category, text, photos = [], materialType = null) {
  const normalizedMaterialType = room === "Materials" ? materialType || "shopping" : null;

  return {
    id: crypto.randomUUID(),
    unitId: selectedUnitId,
    room,
    category: room === "Materials" ? getMaterialCategory(normalizedMaterialType) : category,
    text,
    note: "",
    photos,
    voiceNotes: [],
    materialType: normalizedMaterialType,
    status: "approved",
    order: getNextOrderForRoom(room),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
}

function getNextOrderForRoom(room) {
  const roomOrders = tasks
    .filter((task) => task.unitId === selectedUnitId && task.room === room)
    .map((task) => task.order);
  return roomOrders.length ? Math.max(...roomOrders) + 1 : 1;
}

function populateSelect(select, values, allLabel) {
  select.replaceChildren();

  if (allLabel) {
    select.appendChild(createOption("all", allLabel));
  }

  for (const value of values) {
    select.appendChild(createOption(value, value));
  }
}

function createOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function getKnownRooms() {
  return uniqueValues([...ROOMS, ...getSelectedUnitTasks().map((task) => task.room)]);
}

function getWorkRooms() {
  return getKnownRooms().filter((room) => room !== "Materials");
}

function getKnownCategories() {
  return sortCategories(uniqueValues([...CATEGORIES, ...getSelectedUnitTasks().map((task) => task.category)]));
}

function getWorkCategories() {
  return getKnownCategories().filter((category) => category !== "Shopping List" && category !== "Materials");
}

function sortCategories(categories) {
  return [...categories].sort((a, b) => getCategoryOrder(a) - getCategoryOrder(b) || a.localeCompare(b));
}

function getCategoryOrder(category) {
  const index = CATEGORIES.indexOf(category);
  return index === -1 ? CATEGORIES.length : index;
}

function getCategoryAccent(category) {
  return CATEGORY_ACCENTS[category] || "#64748b";
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function render() {
  renderPageVoiceInput();
  renderTaskSearchState();
  populateUnitSelect();
  renderUnitSummary();
  populateSelect(roomFilter, getWorkRooms(), "All rooms");
  populateSelect(categoryFilter, getWorkCategories(), "All categories");
  populateStatusFilter();
  populateMaterialTypeFilter();
  populatePresenceFilter(photoFilter, "All photo states");
  populatePresenceFilter(noteFilter, "All note states");

  searchInput.value = filters.query;
  if (!selectHasOption(roomFilter, filters.room)) {
    filters.room = "all";
  }
  roomFilter.value = filters.room;
  if (!selectHasOption(categoryFilter, filters.category)) {
    filters.category = "all";
  }
  categoryFilter.value = filters.category;
  if (!statusFilter.querySelector(`option[value="${filters.status}"]`)) {
    filters.status = "all";
  }
  statusFilter.value = filters.status;
  materialTypeFilter.value = filters.materialType;
  photoFilter.value = filters.photoState;
  noteFilter.value = filters.noteState;
  clearFiltersButton.disabled = !hasActiveFilters();
  clearFiltersInlineButton.disabled = !hasActiveFilters();

  renderDashboard();
  renderWorkLog();
  renderReviewQueue();
  renderMaterials();
  renderTasks();
  renderTaskActions();
}

function renderTaskSearchState() {
  const isOpen = isTaskSearchOpen || Boolean(filters.query);
  if (isOpen) {
    tasksPanel.open = true;
  }
  taskSearchPanel.hidden = !isOpen;
  showTaskSearchButton.hidden = isOpen;
  showTaskSearchButton.setAttribute("aria-expanded", String(isOpen));
}

function selectHasOption(select, value) {
  return [...select.options].some((option) => option.value === value);
}

function getDefaultFilters() {
  return {
    query: "",
    room: "all",
    category: "all",
    status: "all",
    materialType: "all",
    photoState: "all",
    noteState: "all",
  };
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const nextFilters = getDefaultFilters();
  const unitFromUrl = params.get("unit");

  selectedUnitId = units.some((unit) => unit.id === unitFromUrl) ? unitFromUrl : DEFAULT_UNIT_ID;

  nextFilters.query = params.get("q") || "";
  nextFilters.room = params.get("room") || "all";
  nextFilters.category = params.get("category") || "all";
  nextFilters.status = getUrlOption(params, "status", ["all", ...STATUSES], "all");
  nextFilters.materialType = getUrlOption(params, "material", ["all", ...MATERIAL_TYPES], "all");
  nextFilters.photoState = getUrlOption(params, "photos", ["all", "yes", "no"], "all");
  nextFilters.noteState = getUrlOption(params, "notes", ["all", "yes", "no"], "all");

  filters = nextFilters;
}

function getUrlOption(params, key, allowedValues, fallbackValue) {
  const value = params.get(key);
  return allowedValues.includes(value) ? value : fallbackValue;
}

function writeFiltersToUrl() {
  const params = new URLSearchParams();

  setUrlParam(params, "unit", selectedUnitId, DEFAULT_UNIT_ID);
  setUrlParam(params, "q", filters.query);
  setUrlParam(params, "room", filters.room, "all");
  setUrlParam(params, "category", filters.category, "all");
  setUrlParam(params, "status", filters.status, "all");
  setUrlParam(params, "material", filters.materialType, "all");
  setUrlParam(params, "photos", filters.photoState, "all");
  setUrlParam(params, "notes", filters.noteState, "all");

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, "", nextUrl);
}

function setUrlParam(params, key, value, defaultValue = "") {
  if (value && value !== defaultValue) {
    params.set(key, value);
  }
}

function populateUnitSelect() {
  unitSelect.replaceChildren();

  for (const unit of units) {
    unitSelect.appendChild(createOption(unit.id, unit.name));
  }

  if (!units.some((unit) => unit.id === selectedUnitId)) {
    selectedUnitId = units[0]?.id || DEFAULT_UNIT_ID;
  }

  unitSelect.value = selectedUnitId;
}

function renderUnitSummary() {
  const unit = getSelectedUnit();
  const unitTasks = getSelectedUnitTasks();
  const normalTasks = unitTasks.filter((task) => !isPendingReview(task));
  const doneTasks = normalTasks.filter(isDone);
  const openTasks = normalTasks.filter((task) => task.room !== "Materials" && isOpenStatus(task.status));
  const shoppingTasks = normalTasks.filter((task) => task.materialType === "shopping" && !isDone(task));
  const updatedAt = getUnitLastUpdated(unitTasks, unit);

  unitSummary.replaceChildren(
    renderUnitSummaryItem(unit?.name || "Selected unit", true),
    renderUnitSummaryItem(`${openTasks.length} open`),
    renderUnitSummaryItem(`${doneTasks.length} done`),
    renderUnitSummaryItem(`${shoppingTasks.length} shopping`),
    renderUnitSummaryItem(`updated ${updatedAt}`),
  );
}

function renderUnitSummaryItem(text, isStrong = false) {
  const item = document.createElement("span");
  if (isStrong) {
    const strong = document.createElement("strong");
    strong.textContent = text;
    item.appendChild(strong);
  } else {
    item.textContent = text;
  }
  return item;
}

function getUnitLastUpdated(unitTasks, unit) {
  const timestamps = unitTasks
    .map((task) => task.updatedAt || task.createdAt)
    .filter(Boolean)
    .map((timestamp) => new Date(timestamp).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  const unitTimestamp = unit?.updatedAt ? new Date(unit.updatedAt).getTime() : null;
  if (Number.isFinite(unitTimestamp)) {
    timestamps.push(unitTimestamp);
  }

  if (timestamps.length === 0) {
    return "never";
  }

  return new Date(Math.max(...timestamps)).toLocaleDateString();
}

function populateStatusFilter() {
  statusFilter.replaceChildren();
  statusFilter.appendChild(createOption("all", "All statuses"));

  for (const status of ["pending-review", "approved", "done"]) {
    statusFilter.appendChild(createOption(status, getStatusLabel(status)));
  }
}

function populateMaterialTypeFilter() {
  materialTypeFilter.replaceChildren();
  materialTypeFilter.appendChild(createOption("all", "All materials"));

  for (const materialType of MATERIAL_TYPES) {
    materialTypeFilter.appendChild(createOption(materialType, getMaterialTypeLabel(materialType)));
  }
}

function populatePresenceFilter(select, allLabel) {
  select.replaceChildren();
  select.append(
    createOption("all", allLabel),
    createOption("yes", "Yes"),
    createOption("no", "No"),
  );
}

function renderDashboard() {
  dashboard.replaceChildren();

  const normalTasks = getNormalTasks();
  const filteredNormalTasks = getFilteredNormalTasks();
  const isFiltered = Boolean(hasActiveFilters());
  const workTasks = getWorkTasks();
  const doneTasks = normalTasks.filter(isDone);
  const openWorkTasks = workTasks.filter((task) => isOpenStatus(task.status));
  const openShoppingTasks = getMaterialTasks().filter(
    (task) => task.materialType === "shopping" && !isDone(task),
  );
  dashboard.append(
    renderDashboardMetric("Overall", `${doneTasks.length}/${normalTasks.length} complete`, isFiltered ? `${filteredNormalTasks.length} visible with filters` : ""),
    renderDashboardMetric("Work Remaining", String(openWorkTasks.length)),
    renderDashboardMetric("Shopping List", String(openShoppingTasks.length)),
  );
}

function renderDashboardMetric(label, value, detail = "") {
  const metric = document.createElement("div");
  metric.className = "dashboard-metric";

  const labelNode = document.createElement("div");
  labelNode.className = "dashboard-label";
  labelNode.textContent = label;

  const valueNode = document.createElement("div");
  valueNode.className = "dashboard-value";
  valueNode.textContent = value;

  metric.append(labelNode, valueNode);

  if (detail) {
    const detailNode = document.createElement("div");
    detailNode.className = "dashboard-detail";
    detailNode.textContent = detail;
    metric.appendChild(detailNode);
  }

  return metric;
}

function renderWorkLog() {
  const unitEntries = activityLog
    .filter((entry) => entry.unitId === selectedUnitId)
    .slice(0, 12);

  workLog.replaceChildren();

  if (unitEntries.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "work-log-empty";
    emptyState.textContent = "No completed work logged for this unit yet.";
    workLog.appendChild(emptyState);
    return;
  }

  const list = document.createElement("ul");
  list.className = "work-log-list";

  for (const entry of unitEntries) {
    list.appendChild(renderWorkLogItem(entry));
  }

  workLog.appendChild(list);
}

function renderWorkLogItem(entry) {
  const item = document.createElement("li");
  item.className = "work-log-item";

  const text = document.createElement("span");
  text.className = "work-log-text";
  text.textContent = entry.taskText || "Completed task";

  const meta = document.createElement("span");
  meta.className = "work-log-meta";
  meta.textContent = [entry.room, formatActivityDate(entry.timestamp)].filter(Boolean).join(" - ");

  item.append(text, meta);
  return item;
}

function formatActivityDate(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderTaskActions() {
  const selectedUnitTasks = getSelectedUnitTasks();
  const normalTasks = getNormalTasks();
  const openTasks = normalTasks.filter((task) => isOpenStatus(task.status));
  const doneTasks = normalTasks.filter(isDone);
  const hasTasks = normalTasks.length > 0;
  const hasRoutineActions = openTasks.length > 0 || doneTasks.length > 0 || hasActiveFilters();

  taskActions.hidden = !hasTasks || !hasRoutineActions;
  markOpenButton.textContent = `Mark ${openTasks.length} open done`;
  markOpenButton.disabled = openTasks.length === 0;
  deleteDoneButton.textContent = `Delete ${doneTasks.length} completed`;
  deleteDoneButton.disabled = doneTasks.length === 0;
  clearAllButton.textContent = `Delete all ${selectedUnitTasks.length}`;
  clearAllButton.disabled = selectedUnitTasks.length === 0;
}

function renderTasks() {
  const visibleTasks = getFilteredTasks();
  taskGroups.replaceChildren();

  if (getNormalTasks().length === 0) {
    setStatus("No checklist items yet.");
    renderEmptyRoomForms();
    return;
  }

  if (visibleTasks.length === 0) {
    setStatus(
      isWorkModeEnabled()
        ? "No open work tasks match the current search and filters."
        : "No room tasks match the current search and filters.",
    );
    return;
  }

  setStatus("");

  for (const [room, roomTasks] of groupTasksByRoom(visibleTasks)) {
    taskGroups.appendChild(renderRoomGroup(room, roomTasks));
  }
}

function renderEmptyRoomForms() {
  for (const room of getRoomsForEmptyState()) {
    taskGroups.appendChild(renderRoomGroup(room, []));
  }
}

function getFilteredTasks() {
  return getWorkTasks().filter((task) => matchesTaskFilters(task) && matchesWorkModeTaskVisibility(task));
}

function matchesWorkModeTaskVisibility(task) {
  // Work Mode is the execution view: keep active tasks visible and hide completed tasks.
  // CSS handles the rest of the mode contract: hide dashboard/materials/filters/review,
  // notes/photos/audio/details/progress, while keeping quick add and add item visible.
  return !isWorkModeEnabled() || !isDone(task);
}

function isWorkModeEnabled() {
  return workModeToggle.checked;
}

function getFilteredNormalTasks() {
  return getFilteredTasks().concat(getFilteredMaterialTasks());
}

function getSelectedUnit() {
  return units.find((unit) => unit.id === selectedUnitId) || units[0] || DEFAULT_UNITS[0];
}

function getSelectedUnitTasks() {
  return tasks.filter(isTaskInSelectedUnit);
}

function isTaskInSelectedUnit(task) {
  return task.unitId === selectedUnitId;
}

function getNormalTasks() {
  return getSelectedUnitTasks().filter((task) => !isPendingReview(task));
}

function getReviewTasks() {
  return getSelectedUnitTasks().filter(isPendingReview);
}

function getWorkTasks() {
  return getNormalTasks().filter((task) => task.room !== "Materials");
}

function getMaterialTasks() {
  return getNormalTasks().filter((task) => task.room === "Materials");
}

function getFilteredMaterialTasks() {
  return getMaterialTasks().filter(matchesMaterialFilters);
}

function renderReviewQueue() {
  const reviewTasks = getReviewTasks();
  reviewQueueList.replaceChildren();
  reviewQueuePanel.hidden = reviewTasks.length === 0;

  if (reviewTasks.length === 0) {
    return;
  }

  for (const task of reviewTasks) {
    reviewQueueList.appendChild(renderReviewTask(task));
  }
}

function renderReviewTask(task) {
  const item = document.createElement("li");
  item.className = "review-task";

  const meta = document.createElement("div");
  meta.className = "review-meta";
  meta.textContent = `${task.room} / ${task.category}`;

  const title = document.createElement("div");
  title.className = "review-title";
  title.textContent = task.text;

  const status = renderStatusBadge(task.status);

  const header = document.createElement("div");
  header.className = "review-header";
  header.append(meta, status);

  item.append(header, title);

  if (task.note) {
    const note = document.createElement("div");
    note.className = "task-note";
    note.textContent = task.note;
    item.appendChild(note);
  }

  if (task.photos.length > 0) {
    item.appendChild(renderPhotoGallery(task, false));
  }

  if (task.voiceNotes.length > 0) {
    item.appendChild(renderVoiceNoteList(task, false));
  }

  const actions = document.createElement("div");
  actions.className = "review-actions";
  actions.append(
    renderApproveButton(task),
    renderEditButton(task),
    renderRejectButton(task),
  );
  item.appendChild(actions);

  if (editingTaskId === task.id) {
    item.appendChild(renderEditForm(task));
  }

  return item;
}

function renderApproveButton(task) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = "approve";
  button.dataset.taskId = task.id;
  button.textContent = "Approve";
  return button;
}

function renderRejectButton(task) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "danger";
  button.dataset.action = "reject";
  button.dataset.taskId = task.id;
  button.textContent = "Reject";
  return button;
}

function groupTasksByRoom(tasksToGroup) {
  const groups = new Map();

  for (const task of tasksToGroup) {
    if (!groups.has(task.room)) {
      groups.set(task.room, []);
    }
    groups.get(task.room).push(task);
  }

  return groups;
}

function getRoomsForEmptyState() {
  if (filters.room !== "all") {
    return [filters.room];
  }

  return getWorkRooms();
}

function renderRoomGroup(room, roomTasks) {
  const group = document.createElement("details");
  group.className = "room-group";
  group.open = openRooms.has(room);

  const summary = document.createElement("summary");
  summary.className = "room-summary";
  summary.appendChild(renderRoomSummary(room, roomTasks));

  const emptyMessage = document.createElement("p");
  emptyMessage.className = "empty-room";
  emptyMessage.textContent = "No tasks in this room.";

  group.addEventListener("toggle", () => {
    if (group.open) {
      openRooms.add(room);
    } else {
      openRooms.delete(room);
    }
  });

  group.append(summary);

  if (roomTasks.length > 0) {
    group.appendChild(renderRoomTaskSection(room, roomTasks));
  } else {
    group.appendChild(emptyMessage);
    group.appendChild(renderQuickAddForm(room));
    group.appendChild(renderRoomAddControl(room));
  }

  return group;
}

function renderRoomSummary(room, roomTasks) {
  const wrapper = document.createElement("span");
  wrapper.className = "room-summary-content";

  const name = renderRoomName(room);

  const progress = getTaskProgress(roomTasks);
  const count = document.createElement("span");
  count.className = progress.open === 0 ? "room-count complete" : "room-count";
  count.textContent = isWorkModeEnabled()
    ? `${progress.total} total`
    : `${progress.open} open / ${progress.total} total`;

  const progressBar = document.createElement("progress");
  progressBar.className = "room-progress";
  progressBar.value = progress.done;
  progressBar.max = progress.total || 1;
  progressBar.textContent = `${getProgressPercent(progress)}%`;
  progressBar.setAttribute("aria-label", `${progress.done} of ${progress.total} tasks done`);

  const editButton = renderRoomEditButton(room);

  wrapper.append(name, count, editButton, progressBar);
  return wrapper;
}

function renderRoomName(room) {
  if (editingRoomName === room) {
    let didSave = false;
    const input = document.createElement("input");
    input.className = "room-name-input";
    input.type = "text";
    input.value = room;
    input.setAttribute("aria-label", `Rename ${room}`);
    input.addEventListener("click", stopSummaryToggle);
    input.addEventListener("touchstart", stopSummaryToggle, { passive: true });
    input.addEventListener("keydown", async (event) => {
      event.stopPropagation();

      if (event.key === "Enter") {
        event.preventDefault();
        didSave = true;
        await renameRoom(room, input.value);
      }

      if (event.key === "Escape") {
        event.preventDefault();
        editingRoomName = null;
        render();
      }
    });
    input.addEventListener("blur", () => {
      if (!didSave) {
        renameRoom(room, input.value);
      }
    });

    queueMicrotask(() => {
      input.focus();
      input.select();
    });

    return input;
  }

  const name = document.createElement("span");
  name.className = "room-name";
  name.textContent = room;
  return name;
}

function renderRoomEditButton(room) {
  if (editingRoomName === room) {
    return document.createTextNode("");
  }

  const button = document.createElement("button");
  button.className = "light room-edit-button";
  button.type = "button";
  button.title = `Rename ${room}`;
  button.setAttribute("aria-label", `Rename ${room}`);
  button.addEventListener("click", (event) => {
    stopSummaryToggle(event);
    editingRoomName = room;
    render();
  });
  button.addEventListener("touchstart", (event) => {
    event.stopPropagation();
  }, { passive: true });
  return button;
}

function stopSummaryToggle(event) {
  event.preventDefault();
  event.stopPropagation();
}

async function renameRoom(oldRoom, nextRoom) {
  const trimmedRoom = nextRoom.trim();
  editingRoomName = null;

  if (!trimmedRoom || trimmedRoom === oldRoom) {
    render();
    return;
  }

  if (filters.room === oldRoom) {
    filters = {
      ...filters,
      room: trimmedRoom,
    };
    writeFiltersToUrl();
  }

  if (openRooms.has(oldRoom)) {
    openRooms.delete(oldRoom);
    openRooms.add(trimmedRoom);
  }

  await updateTasks(
    tasks.map((task) =>
      task.unitId === selectedUnitId && task.room === oldRoom
        ? {
            ...task,
            room: trimmedRoom,
          }
        : task,
    ),
  );
}

function renderRoomTaskSection(room, roomTasks) {
  const section = document.createElement("section");
  section.className = "room-task-section";

  const list = document.createElement("ul");
  list.className = "task-list";
  list.dataset.room = room;

  for (const task of sortTasksByOrder(roomTasks)) {
    list.appendChild(renderTask(task));
  }

  section.append(list, renderQuickAddForm(room), renderRoomAddControl(room));
  return section;
}

function renderQuickAddForm(room) {
  const form = document.createElement("form");
  form.className = "quick-add-form";
  form.dataset.form = "quick-add";
  form.dataset.room = room;

  const input = document.createElement("input");
  input.type = "text";
  input.name = "text";
  input.placeholder = "+ Quick add task...";
  input.setAttribute("aria-label", `Quick add task to ${room}`);
  input.required = true;

  form.appendChild(input);
  return form;
}

function sortTasksByOrder(tasksToSort) {
  return [...tasksToSort].sort(
    (a, b) =>
      a.order - b.order ||
      getCategoryOrder(a.category) - getCategoryOrder(b.category) ||
      a.createdAt.localeCompare(b.createdAt),
  );
}

function getTaskProgress(items) {
  const done = items.filter(isDone).length;
  return {
    done,
    open: items.length - done,
    total: items.length,
  };
}

function getProgressPercent(progress) {
  return progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
}

function renderTask(task) {
  const item = document.createElement("li");
  item.className = isDone(task) ? "task done" : "task";
  item.draggable = canReorderTask(task);
  item.dataset.taskId = task.id;
  item.style.setProperty("--category-accent", getCategoryAccent(task.category));
  const showPhotos = shouldShowTaskPhotos(task);

  if (item.draggable) {
    item.addEventListener("dragstart", handleTaskDragStart);
    item.addEventListener("dragover", handleTaskDragOver);
    item.addEventListener("dragleave", handleTaskDragLeave);
    item.addEventListener("drop", handleTaskDrop);
    item.addEventListener("dragend", handleTaskDragEnd);
  }

  if (canSwipeCompleteTask(task)) {
    item.addEventListener("touchstart", handleSwipeStart, { passive: true });
    item.addEventListener("touchmove", handleSwipeMove, { passive: false });
    item.addEventListener("touchend", handleSwipeEnd);
    item.addEventListener("touchcancel", resetSwipeState);
  }
  item.addEventListener("contextmenu", (event) => handleTaskContextMenu(event, task.id));
  item.addEventListener("touchstart", (event) => handleLongPressStart(event, task.id), { passive: true });
  item.addEventListener("touchmove", handleLongPressMove, { passive: true });
  item.addEventListener("touchend", clearLongPressTimer);
  item.addEventListener("touchcancel", clearLongPressTimer);

  const checkLabel = document.createElement("label");
  checkLabel.className = "task-check";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = isDone(task);
  checkbox.dataset.action = "toggle";
  checkbox.dataset.taskId = task.id;
  checkbox.setAttribute("aria-label", `Mark ${task.text} complete`);

  const main = document.createElement("div");
  main.className = "task-main";
  main.appendChild(renderTaskText(task));

  const buttons = document.createElement("div");
  buttons.className = "task-buttons";
  if (canReorderTask(task)) {
    buttons.appendChild(renderDragHandle(task));
  }
  buttons.append(renderEditButton(task), renderDeleteButton(task));

  checkLabel.append(checkbox, main);
  item.append(checkLabel, buttons);

  if (showPhotos && task.photos.length > 0) {
    item.appendChild(renderPhotoGallery(task, true));
  }

  if (task.voiceNotes.length > 0) {
    item.appendChild(renderVoiceNoteList(task, true));
  }

  if (editingTaskId === task.id) {
    item.appendChild(renderEditForm(task));
  }

  return item;
}

function canReorderTask(task) {
  return !isPendingReview(task) && task.room !== "Materials";
}

function canSwipeCompleteTask(task) {
  return !isPendingReview(task) && !isDone(task);
}

function renderDragHandle(task) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "light drag-handle";
  handle.dataset.action = "drag";
  handle.dataset.taskId = task.id;
  handle.textContent = "Move";
  handle.draggable = true;
  handle.setAttribute("aria-label", `Drag to reorder ${task.text}`);
  handle.addEventListener("dragstart", handleTaskDragStart);
  handle.addEventListener("touchstart", handleTaskTouchStart, { passive: true });
  handle.addEventListener("touchmove", handleTaskTouchMove, { passive: false });
  handle.addEventListener("touchend", handleTaskTouchEnd);
  return handle;
}

function handleTaskDragStart(event) {
  event.stopPropagation();
  const taskItem = event.currentTarget.closest(".task");
  draggedTaskId = taskItem?.dataset.taskId || null;

  if (!draggedTaskId) {
    return;
  }

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedTaskId);
  taskItem.classList.add("dragging");
}

function handleTaskDragOver(event) {
  if (!draggedTaskId) {
    return;
  }

  const targetItem = event.currentTarget.closest(".task");
  if (!targetItem) {
    return;
  }

  const draggedTask = getTaskById(draggedTaskId);
  const targetTask = getTaskById(targetItem?.dataset.taskId);

  if (!draggedTask || !targetTask || draggedTask.room !== targetTask.room) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  targetItem.classList.add("drag-over");
  targetItem.classList.toggle("drag-after", getDropPosition(event, targetItem) === "after");
}

function handleTaskDragLeave(event) {
  const taskItem = event.currentTarget.closest(".task");
  taskItem?.classList.remove("drag-over");
  taskItem?.classList.remove("drag-after");
}

async function handleTaskDrop(event) {
  event.stopPropagation();
  if (!draggedTaskId) {
    return;
  }

  event.preventDefault();
  const targetItem = event.currentTarget.closest(".task");
  if (!targetItem) {
    return;
  }

  const position = getDropPosition(event, targetItem);
  targetItem.classList.remove("drag-over");
  targetItem.classList.remove("drag-after");
  await reorderTaskWithinRoom(draggedTaskId, targetItem.dataset.taskId, position);
}

function handleTaskDragEnd(event) {
  event.currentTarget.closest(".task")?.classList.remove("dragging");
  clearDragState();
  draggedTaskId = null;
}

function getDropPosition(event, targetItem) {
  return getDropPositionFromY(event.clientY, targetItem);
}

function getDropPositionFromY(clientY, targetItem) {
  const rect = targetItem.getBoundingClientRect();
  return clientY > rect.top + rect.height / 2 ? "after" : "before";
}

function getTaskById(id) {
  return tasks.find((task) => task.id === id);
}

async function reorderTaskWithinRoom(sourceTaskId, targetTaskId, position = "before") {
  if (!sourceTaskId || !targetTaskId || sourceTaskId === targetTaskId) {
    return;
  }

  const sourceTask = getTaskById(sourceTaskId);
  const targetTask = getTaskById(targetTaskId);

  if (!sourceTask || !targetTask || sourceTask.room !== targetTask.room) {
    return;
  }

  const orderedRoomTasks = sortTasksByOrder(tasks.filter((task) => task.unitId === sourceTask.unitId && task.room === sourceTask.room));
  const fromIndex = orderedRoomTasks.findIndex((task) => task.id === sourceTaskId);
  const toIndex = orderedRoomTasks.findIndex((task) => task.id === targetTaskId);

  if (fromIndex === -1 || toIndex === -1) {
    return;
  }

  const [movedTask] = orderedRoomTasks.splice(fromIndex, 1);
  const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
  const insertIndex = position === "after" ? adjustedToIndex + 1 : adjustedToIndex;
  orderedRoomTasks.splice(insertIndex, 0, movedTask);

  await applyRoomOrder(sourceTask.unitId, sourceTask.room, orderedRoomTasks);
}

async function applyRoomOrder(unitId, room, orderedRoomTasks) {
  const orderById = new Map(
    orderedRoomTasks.map((task, index) => [task.id, index + 1]),
  );

  await updateTasks(
    tasks.map((task) =>
      task.unitId === unitId && task.room === room && orderById.has(task.id)
        ? { ...task, order: orderById.get(task.id) }
        : task,
    ),
  );
}

function handleTaskTouchStart(event) {
  const taskItem = event.currentTarget.closest(".task");
  draggedTaskId = taskItem?.dataset.taskId || null;

  if (draggedTaskId) {
    taskItem.classList.add("dragging");
  }
}

function handleTaskTouchMove(event) {
  if (!draggedTaskId) {
    return;
  }

  const touch = event.touches[0];
  const targetItem = getTaskItemAtPoint(touch.clientX, touch.clientY);
  const draggedTask = getTaskById(draggedTaskId);
  const targetTask = getTaskById(targetItem?.dataset.taskId);

  clearDragTargets();

  if (!targetItem || !draggedTask || !targetTask || draggedTask.room !== targetTask.room) {
    return;
  }

  event.preventDefault();
  targetItem.classList.add("drag-over");
  targetItem.classList.toggle("drag-after", getDropPositionFromY(touch.clientY, targetItem) === "after");
}

async function handleTaskTouchEnd(event) {
  if (!draggedTaskId) {
    return;
  }

  const touch = event.changedTouches[0];
  const targetItem = getTaskItemAtPoint(touch.clientX, touch.clientY);
  const position = targetItem ? getDropPositionFromY(touch.clientY, targetItem) : "before";
  const sourceTaskId = draggedTaskId;

  clearDragState();
  draggedTaskId = null;

  if (targetItem) {
    await reorderTaskWithinRoom(sourceTaskId, targetItem.dataset.taskId, position);
  }
}

function getTaskItemAtPoint(clientX, clientY) {
  return document.elementFromPoint(clientX, clientY)?.closest(".task");
}

function clearDragTargets() {
  for (const item of document.querySelectorAll(".task.drag-over")) {
    item.classList.remove("drag-over");
    item.classList.remove("drag-after");
  }
}

function clearDragState() {
  for (const item of document.querySelectorAll(".task.dragging")) {
    item.classList.remove("dragging");
  }
  clearDragTargets();
}

function handleSwipeStart(event) {
  if (isInteractiveSwipeTarget(event.target)) {
    return;
  }

  const touch = event.touches[0];
  const taskItem = event.currentTarget;
  swipeState = {
    taskId: taskItem.dataset.taskId,
    startX: touch.clientX,
    startY: touch.clientY,
    active: false,
  };
}

function handleSwipeMove(event) {
  if (!swipeState) {
    return;
  }

  const touch = event.touches[0];
  const deltaX = touch.clientX - swipeState.startX;
  const deltaY = touch.clientY - swipeState.startY;
  const taskItem = event.currentTarget;

  if (!swipeState.active && Math.abs(deltaX) < 12) {
    return;
  }

  if (Math.abs(deltaY) > Math.abs(deltaX)) {
    resetSwipeState();
    return;
  }

  if (deltaX >= 0) {
    resetSwipeVisual(taskItem);
    return;
  }

  event.preventDefault();
  swipeState.active = true;
  const swipeX = Math.max(deltaX, -96);
  taskItem.classList.add("swiping");
  taskItem.classList.toggle("swipe-ready", swipeX <= -72);
  taskItem.style.setProperty("--swipe-x", `${swipeX}px`);
}

async function handleSwipeEnd(event) {
  if (!swipeState) {
    return;
  }

  const taskItem = event.currentTarget;
  const taskId = swipeState.taskId;
  const shouldComplete = taskItem.classList.contains("swipe-ready");

  resetSwipeState();

  if (shouldComplete) {
    await setTaskStatus(taskId, "done");
  }
}

function resetSwipeState() {
  for (const item of document.querySelectorAll(".task.swiping, .task.swipe-ready")) {
    resetSwipeVisual(item);
  }
  swipeState = null;
}

function resetSwipeVisual(taskItem) {
  taskItem.classList.remove("swiping");
  taskItem.classList.remove("swipe-ready");
  taskItem.style.removeProperty("--swipe-x");
}

function isInteractiveSwipeTarget(target) {
  return Boolean(target.closest("button, input, select, textarea, .drag-handle"));
}

function handleTaskContextMenu(event, taskId) {
  if (isInteractiveSwipeTarget(event.target)) {
    return;
  }

  event.preventDefault();
  openTaskContextMenu(taskId, event.clientX, event.clientY);
}

function handleLongPressStart(event, taskId) {
  if (isInteractiveSwipeTarget(event.target)) {
    return;
  }

  const touch = event.touches[0];
  longPressStart = { x: touch.clientX, y: touch.clientY };
  clearLongPressTimer();
  longPressTimer = setTimeout(() => {
    openTaskContextMenu(taskId, touch.clientX, touch.clientY);
  }, LONG_PRESS_CONTEXT_MENU_MS);
}

function handleLongPressMove(event) {
  if (!longPressStart || !longPressTimer) {
    return;
  }

  const touch = event.touches[0];
  const deltaX = Math.abs(touch.clientX - longPressStart.x);
  const deltaY = Math.abs(touch.clientY - longPressStart.y);

  if (deltaX > 10 || deltaY > 10) {
    clearLongPressTimer();
  }
}

function clearLongPressTimer() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
  longPressStart = null;
}

function openTaskContextMenu(taskId, clientX, clientY) {
  contextTaskId = taskId;
  contextOpenedAt = Date.now();
  populateSelect(contextMoveRoom, getKnownRooms(), null);
  const task = getTaskById(taskId);
  contextMoveRoom.value = task?.room || "Materials";

  taskContextMenu.hidden = false;
  const rect = taskContextMenu.getBoundingClientRect();
  const left = Math.min(clientX, window.innerWidth - rect.width - 12);
  const top = Math.min(clientY, window.innerHeight - rect.height - 12);
  taskContextMenu.style.left = `${Math.max(12, left)}px`;
  taskContextMenu.style.top = `${Math.max(12, top)}px`;
}

function closeTaskContextMenu() {
  taskContextMenu.hidden = true;
  contextTaskId = null;
}

async function runContextAction(action) {
  if (action === "close") {
    closeTaskContextMenu();
    return;
  }

  const task = getTaskById(contextTaskId);
  if (!task) {
    closeTaskContextMenu();
    return;
  }

  if (action === "edit") {
    editingTaskId = task.id;
    openRooms.add(task.room);
    closeTaskContextMenu();
    render();
    return;
  }

  if (action === "duplicate") {
    await duplicateTask(task.id);
    closeTaskContextMenu();
    return;
  }

  if (action === "delete") {
    await deleteTask(task.id);
    closeTaskContextMenu();
  }
}

async function duplicateTask(id) {
  const task = getTaskById(id);
  if (!task) {
    return;
  }

  const duplicate = normalizeTask({
    ...task,
    id: crypto.randomUUID(),
    text: `${task.text} copy`,
    status: task.status === "pending-review" ? "pending-review" : "approved",
    order: getNextOrderForRoom(task.room),
    createdAt: new Date().toISOString(),
  });

  await updateTasks([...tasks, duplicate]);
}

async function moveContextTask() {
  const task = getTaskById(contextTaskId);
  const room = contextMoveRoom.value;

  if (!task || !room) {
    return;
  }

  await updateTasks(
    tasks.map((item) =>
      item.id === task.id
        ? {
            ...item,
            room,
            category: room === "Materials" ? "Shopping List" : getMovedTaskCategory(item),
            materialType: room === "Materials" ? "shopping" : null,
            order: getNextOrderForRoom(room),
          }
        : item,
    ),
  );
  closeTaskContextMenu();
}

function getMovedTaskCategory(task) {
  return task.room === "Materials" || task.category === "Shopping List" || task.category === "Materials"
    ? "Prep"
    : task.category;
}

function renderTaskText(task) {
  const wrapper = document.createElement("div");
  wrapper.className = "task-text-wrap";

  const textLine = document.createElement("div");
  textLine.className = "task-text-line";

  const text = document.createElement("span");
  text.className = "task-text";
  text.textContent = task.text;

  textLine.appendChild(text);
  textLine.appendChild(renderStatusBadge(task.status));

  if (task.note) {
    const noteIcon = document.createElement("span");
    noteIcon.className = "task-note-icon";
    noteIcon.setAttribute("aria-hidden", "true");
    noteIcon.textContent = "i";
    textLine.appendChild(noteIcon);

    const note = document.createElement("div");
    note.className = "task-note";
    note.textContent = task.note;
    wrapper.append(textLine, note);
    return wrapper;
  }

  wrapper.appendChild(textLine);
  return wrapper;
}

function renderStatusBadge(status) {
  const badge = document.createElement("span");
  badge.className = `status-badge ${getStatusClass(status)}`;
  badge.textContent = getStatusLabel(status);
  return badge;
}

function shouldShowTaskPhotos(task) {
  return task.room !== "Materials";
}

function getPhotoSrc(photo) {
  return photo.data;
}

function getVoiceNoteSrc(voiceNote) {
  return voiceNote.data;
}

function renderPhotoGallery(task, canRemove) {
  const list = document.createElement("ul");
  list.className = "photo-list";
  list.setAttribute("aria-label", `Photos for ${task.text}`);

  for (const photo of task.photos) {
    const item = document.createElement("li");
    item.className = "photo-item";

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "photo-thumb-button";
    previewButton.dataset.action = "preview-photo";
    previewButton.dataset.taskId = task.id;
    previewButton.dataset.photoId = photo.id;
    previewButton.setAttribute("aria-label", `Preview ${photo.filename}`);

    const image = document.createElement("img");
    image.className = "photo-thumb";
    image.src = getPhotoSrc(photo);
    image.alt = photo.filename;
    image.width = 88;
    image.height = 88;
    image.loading = "lazy";

    previewButton.appendChild(image);
    item.appendChild(previewButton);

    if (canRemove) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "photo-remove";
      removeButton.dataset.action = "remove-photo";
      removeButton.dataset.taskId = task.id;
      removeButton.dataset.photoId = photo.id;
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${photo.filename}`);
      item.appendChild(removeButton);
    }

    list.appendChild(item);
  }

  return list;
}

function renderVoiceNoteList(task, canRemove) {
  const list = document.createElement("ul");
  list.className = "voice-note-list";
  list.setAttribute("aria-label", `Voice notes for ${task.text}`);

  for (const voiceNote of task.voiceNotes) {
    const item = document.createElement("li");
    item.className = "voice-note-item";

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "none";
    audio.setAttribute("controlslist", "nodownload");
    audio.src = getVoiceNoteSrc(voiceNote);

    const label = document.createElement("span");
    label.className = "voice-note-label";
    label.textContent = formatVoiceNoteLabel(voiceNote);

    item.append(audio, label);

    if (canRemove) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "voice-note-remove";
      removeButton.dataset.action = "remove-voice-note";
      removeButton.dataset.taskId = task.id;
      removeButton.dataset.voiceNoteId = voiceNote.id;
      removeButton.textContent = "Delete recording";
      removeButton.setAttribute("aria-label", `Remove ${voiceNote.filename}`);
      item.appendChild(removeButton);
    }

    list.appendChild(item);
  }

  return list;
}

function renderPageVoiceInput() {
  const isRecording = voiceRecorderState?.target === "page";
  const isSupported = isVoiceRecordingSupported();

  pageVoiceRecordButton.className = isRecording ? "danger page-voice-button" : "page-voice-button";
  pageVoiceRecordButton.disabled = !isSupported && !isRecording;
  pageVoiceRecordButton.textContent = isRecording ? "Stop" : "Record voice";
  pageVoiceRecordButton.title = isSupported
    ? `Voice input is capped at ${MAX_VOICE_NOTE_SECONDS}s / ${formatBytes(MAX_VOICE_NOTE_BYTES)}`
    : getVoiceRecordingUnavailableMessage();
  pageVoiceCreateButton.disabled = pageVoiceRecordings.length === 0 || isRecording;
  pageVoiceStatus.textContent = getPageVoiceStatusText(isRecording, isSupported);

  pageVoiceRecordingsList.hidden = pageVoiceRecordings.length === 0;
  pageVoiceRecordingsList.replaceChildren(
    ...pageVoiceRecordings.map(renderPageVoiceRecording),
  );
}

function getPageVoiceStatusText(isRecording, isSupported) {
  if (isRecording) {
    return `Recording... tap Stop when done. Max ${MAX_VOICE_NOTE_SECONDS}s.`;
  }

  if (!isSupported) {
    return getVoiceRecordingUnavailableMessage();
  }

  if (pageVoiceRecordings.length > 0) {
    return `${pageVoiceRecordings.length} recording${pageVoiceRecordings.length === 1 ? "" : "s"} ready for task creation.`;
  }

  return "Record task ideas here. API task creation will connect to this input later.";
}

function renderPageVoiceRecording(voiceNote) {
  const item = document.createElement("li");
  item.className = "page-voice-recording";

  const audio = document.createElement("audio");
  audio.controls = true;
  audio.preload = "none";
  audio.setAttribute("controlslist", "nodownload");
  audio.src = getVoiceNoteSrc(voiceNote);

  const label = document.createElement("span");
  label.className = "voice-note-label";
  label.textContent = formatVoiceNoteLabel(voiceNote);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "voice-note-remove";
  removeButton.dataset.action = "remove-page-voice-recording";
  removeButton.dataset.voiceNoteId = voiceNote.id;
  removeButton.textContent = "Delete recording";
  removeButton.setAttribute("aria-label", `Delete ${voiceNote.filename}`);

  item.append(audio, label, removeButton);
  return item;
}

function showVoiceTaskCreationUnavailable() {
  pageVoiceStatus.textContent = "Task creation from voice is not connected yet. Recordings stay available here for this session.";
}

function formatVoiceNoteLabel(voiceNote) {
  const date = new Date(voiceNote.timestamp);
  const parts = [];

  if (voiceNote.duration) {
    parts.push(`${voiceNote.duration}s`);
  }

  if (voiceNote.size) {
    parts.push(formatBytes(voiceNote.size));
  }

  const recordedAt = Number.isNaN(date.getTime()) ? voiceNote.filename : date.toLocaleString();
  return parts.length ? `${recordedAt} / ${parts.join(" / ")}` : recordedAt;
}

async function toggleVoiceRecording() {
  if (voiceRecorderState?.target === "page") {
    stopVoiceRecording("manual");
    return;
  }

  if (voiceRecorderState) {
    stopVoiceRecording("switch-input");
  }

  await startVoiceRecording();
}

async function startVoiceRecording() {
  let stream = null;

  if (pageVoiceRecordings.length >= MAX_PAGE_VOICE_RECORDINGS) {
    alert(`Delete one recording before adding more than ${MAX_PAGE_VOICE_RECORDINGS}.`);
    return;
  }

  if (!isVoiceRecordingSupported()) {
    alert(getVoiceRecordingUnavailableMessage());
    return;
  }

  const permissionState = await getMicrophonePermissionState();
  if (permissionState === "denied") {
    alert("Microphone access is blocked. Enable microphone permission for this site in the browser settings.");
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = getSupportedAudioMimeType();
    const recorder = createAudioRecorder(stream, mimeType);
    const chunks = [];
    let capturedBytes = 0;
    const startedAt = Date.now();
    const maxDurationTimer = window.setTimeout(() => {
      stopVoiceRecording("max-duration");
    }, MAX_VOICE_NOTE_SECONDS * 1000);

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
        capturedBytes += event.data.size;

        if (capturedBytes > MAX_VOICE_NOTE_BYTES) {
          stopVoiceRecording("max-size");
        }
      }
    });

    recorder.addEventListener("stop", async () => {
      window.clearTimeout(maxDurationTimer);
      stopStream(stream);
      const stopReason = voiceRecorderState?.stopReason || "manual";
      voiceRecorderState = null;

      if (chunks.length === 0) {
        pageVoiceStatus.textContent = "No voice input was captured.";
        renderPageVoiceInput();
        return;
      }

      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size > MAX_VOICE_NOTE_BYTES) {
        pageVoiceStatus.textContent = `Voice input was too large. Keep recordings under ${formatBytes(MAX_VOICE_NOTE_BYTES)}.`;
        alert(`Voice input was not saved because it was larger than ${formatBytes(MAX_VOICE_NOTE_BYTES)}.`);
        renderPageVoiceInput();
        return;
      }

      const voiceNote = {
        id: crypto.randomUUID(),
        data: await blobToDataUrl(blob),
        filename: `Voice note ${new Date().toLocaleString()}`,
        mimeType: blob.type,
        duration: Math.round((Date.now() - startedAt) / 1000),
        size: blob.size,
        timestamp: new Date().toISOString(),
      };

      pageVoiceRecordings = [voiceNote, ...pageVoiceRecordings].slice(0, MAX_PAGE_VOICE_RECORDINGS);
      renderPageVoiceInput();
      if (stopReason === "max-duration") {
        pageVoiceStatus.textContent = "Voice input saved at the 30 second limit.";
      }
    });

    recorder.addEventListener("error", () => {
      stopVoiceRecording("error");
      pageVoiceStatus.textContent = "Voice recording stopped because the browser reported an error.";
    });

    voiceRecorderState = { target: "page", recorder, stream, stopReason: null, maxDurationTimer };
    recorder.start(1000);
    renderPageVoiceInput();
  } catch (error) {
    if (stream) {
      stopStream(stream);
    }
    stopVoiceRecorderResources();
    pageVoiceStatus.textContent = "Could not start voice recording.";
    alert(getMicrophoneErrorMessage(error));
  }
}

function stopVoiceRecording(reason = "manual") {
  if (!voiceRecorderState) {
    return;
  }

  voiceRecorderState.stopReason = reason;

  if (voiceRecorderState.recorder.state !== "inactive") {
    voiceRecorderState.recorder.stop();
  }
}

function isVoiceRecordingSupported() {
  return Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

function getVoiceRecordingUnavailableMessage() {
  if (!window.isSecureContext) {
    return "Voice recording needs a secure page. Use localhost or HTTPS.";
  }

  return "Voice recording is not supported in this browser. Use a current mobile Safari, Chrome, or Edge browser.";
}

async function getMicrophonePermissionState() {
  if (!navigator.permissions?.query) {
    return "unknown";
  }

  try {
    const permission = await navigator.permissions.query({ name: "microphone" });
    return permission.state;
  } catch {
    return "unknown";
  }
}

function createAudioRecorder(stream, mimeType) {
  const options = {
    audioBitsPerSecond: 24000,
  };

  if (mimeType) {
    options.mimeType = mimeType;
  }

  try {
    return new MediaRecorder(stream, options);
  } catch {
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  }
}

function getSupportedAudioMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function stopVoiceRecorderResources() {
  if (!voiceRecorderState) {
    return;
  }

  window.clearTimeout(voiceRecorderState.maxDurationTimer);
  stopStream(voiceRecorderState.stream);
  voiceRecorderState = null;
  renderPageVoiceInput();
}

function stopStream(stream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error("Could not read voice note.")));
    reader.readAsDataURL(blob);
  });
}

function getMicrophoneErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Microphone permission was denied. Enable microphone access for this site to record voice notes.";
  }

  if (error?.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }

  return "Could not access the microphone on this device.";
}

function getDataUrlSize(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.floor((base64.length * 3) / 4);
}

function formatBytes(bytes) {
  if (!bytes) {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function openPhotoPreview(photo) {
  photoPreviewImage.src = getPhotoSrc(photo);
  photoPreviewImage.alt = photo.filename;
  photoPreviewCaption.textContent = `${photo.filename} - ${formatPhotoTimestamp(photo.timestamp)}`;
  photoPreviewDialog.showModal();
}

function formatPhotoTimestamp(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function renderEditButton(task) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "light";
  button.dataset.action = "edit";
  button.dataset.taskId = task.id;
  button.textContent = editingTaskId === task.id ? "Cancel" : "Edit";
  return button;
}

function renderDeleteButton(task) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "light";
  button.dataset.action = "delete";
  button.dataset.taskId = task.id;
  button.textContent = "Delete";
  return button;
}

function renderEditForm(task) {
  const form = document.createElement("form");
  form.className = "edit-form";
  form.dataset.form = "edit-task";
  form.dataset.taskId = task.id;

  const roomSelect = createLabeledSelect(`edit-room-${task.id}`, "Edit room", getKnownRooms(), task.room);
  const categorySelect = createLabeledSelect(
    `edit-category-${task.id}`,
    "Edit category",
    getKnownCategories(),
    task.category,
  );
  const textInput = createLabeledInput(`edit-text-${task.id}`, "Edit task", task.text);
  const noteInput = createLabeledTextarea(`edit-note-${task.id}`, "Edit note", task.note);
  const statusSelect = createLabeledSelect(
    `edit-status-${task.id}`,
    "Status",
    STATUSES,
    task.status,
    getStatusLabel,
  );
  const materialTypeSelect = task.room === "Materials"
    ? createLabeledSelect(
        `edit-material-type-${task.id}`,
        "Material list",
        MATERIAL_TYPES,
        task.materialType || "shopping",
        getMaterialTypeLabel,
      )
    : null;
  const photoInput = shouldShowTaskPhotos(task) || isPendingReview(task)
    ? createLabeledFileInput(`edit-photos-${task.id}`, "Add photos")
    : null;
  const saveButton = document.createElement("button");

  roomSelect.input.name = "room";
  categorySelect.input.name = "category";
  statusSelect.input.name = "status";
  textInput.input.name = "text";
  noteInput.input.name = "note";
  if (materialTypeSelect) {
    materialTypeSelect.input.name = "materialType";
  }
  if (photoInput) {
    photoInput.input.name = "photos";
  }

  saveButton.type = "submit";
  saveButton.textContent = "Save";

  form.append(roomSelect.field, categorySelect.field, statusSelect.field, textInput.field, noteInput.field);

  if (materialTypeSelect) {
    form.appendChild(materialTypeSelect.field);
  }

  if (photoInput) {
    form.appendChild(photoInput.field);
  }

  form.appendChild(saveButton);

  return form;
}

function renderAddControl(form) {
  const wrapper = document.createElement("details");
  wrapper.className = "add-control";

  const summary = document.createElement("summary");
  summary.className = "light add-toggle";
  summary.textContent = "+ Add item";

  wrapper.append(summary, form);
  return wrapper;
}

function renderFixedCategoryAddControl(room, category) {
  return renderAddControl(renderFixedCategoryAddForm(room, category));
}

function renderRoomAddControl(room) {
  return renderAddControl(renderRoomAddForm(room));
}

function renderRoomAddForm(room) {
  const form = document.createElement("form");
  form.className = "room-add-form";
  form.dataset.form = "room-add";
  form.dataset.room = room;

  const categorySelect = createLabeledSelect(
    `add-category-${slugify(room)}`,
    "Category",
    getWorkCategories(),
    getDefaultCategoryForRoomAdd(),
  );
  const textInput = createLabeledInput(`add-text-${slugify(room)}`, "New item", "");
  const photoInput = createLabeledFileInput(`add-photos-${slugify(room)}`, "Photos");
  const addButton = document.createElement("button");

  categorySelect.input.name = "category";
  textInput.input.name = "text";
  photoInput.input.name = "photos";
  textInput.input.placeholder = "Add a task";
  addButton.type = "submit";
  addButton.textContent = "Add";

  form.append(categorySelect.field, textInput.field, photoInput.field, addButton);

  return form;
}

function renderFixedCategoryAddForm(room, materialType) {
  const form = document.createElement("form");
  form.className = "fixed-category-add-form";
  form.dataset.form = "fixed-category-add";
  form.dataset.room = room;
  form.dataset.materialType = materialType;

  const typeMeta = MATERIAL_TYPE_META[materialType];
  const textInput = createLabeledInput(`add-text-${slugify(room)}-${materialType}`, "New item", "");
  const addButton = document.createElement("button");

  textInput.input.name = "text";
  textInput.input.placeholder = `Add a ${typeMeta.label.toLowerCase()} item`;
  addButton.type = "submit";
  addButton.textContent = "Add";

  form.append(textInput.field, addButton);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!form.reportValidity()) {
      return;
    }

    await addMaterialTask(room, materialType, textInput.input.value);
    textInput.input.value = "";
  });

  return form;
}

function renderMaterials() {
  const materials = getFilteredMaterialTasks();
  const shoppingTasks = materials.filter((task) => task.materialType === "shopping");
  const onHandTasks = materials.filter((task) => task.materialType === "onhand");

  shoppingList.replaceChildren();
  materialsOnHand.replaceChildren();

  shoppingList.appendChild(renderMaterialSection("Shopping List", shoppingTasks, "shopping"));
  materialsOnHand.appendChild(renderMaterialSection("Materials On Hand", onHandTasks, "onhand"));
}

function renderMaterialSection(title, materialTasks, materialType) {
  const section = document.createElement("details");
  section.className = "material-section";
  section.open = true;

  const summary = document.createElement("summary");
  summary.className = "material-summary";

  const heading = document.createElement("h3");
  heading.className = "material-title";
  heading.textContent = title;

  const doneCount = materialTasks.filter(isDone).length;
  const showDone = materialDoneVisibility[materialType];
  const visibleTasks = showDone ? materialTasks : materialTasks.filter((task) => !isDone(task));

  const count = document.createElement("span");
  count.className = "material-count";
  count.textContent = showDone
    ? `${materialTasks.length} ${materialTasks.length === 1 ? "item" : "items"}`
    : `${visibleTasks.length} shown / ${materialTasks.length} total`;

  const doneToggle = document.createElement("button");
  doneToggle.className = "light material-done-toggle";
  doneToggle.type = "button";
  doneToggle.textContent = showDone ? `Hide done (${doneCount})` : `Show done (${doneCount})`;
  doneToggle.setAttribute("aria-pressed", String(!showDone));
  doneToggle.addEventListener("click", (event) => {
    stopSummaryToggle(event);
    materialDoneVisibility[materialType] = !showDone;
    renderMaterials();
  });
  doneToggle.addEventListener("touchstart", (event) => {
    event.stopPropagation();
  }, { passive: true });

  const list = document.createElement("ul");
  list.className = "task-list";

  for (const task of sortTasksByOrder(visibleTasks)) {
    list.appendChild(renderTask(task));
  }

  const emptyMessage = document.createElement("p");
  emptyMessage.className = "empty-room";
  emptyMessage.textContent = materialTasks.length > 0 && visibleTasks.length === 0
    ? "Done items are hidden."
    : "No items here.";

  const body = document.createElement("div");
  body.className = "material-body";

  summary.append(heading, count, doneToggle);
  body.append(visibleTasks.length > 0 ? list : emptyMessage);
  body.appendChild(renderFixedCategoryAddControl("Materials", materialType));
  section.append(summary, body);
  return section;
}

function getMaterialTypeLabel(materialType) {
  return MATERIAL_TYPE_META[materialType]?.label || materialType;
}

function getDefaultCategoryForRoomAdd() {
  if (filters.category !== "all") {
    return filters.category;
  }

  return "Prep";
}

function createLabeledSelect(id, labelText, values, selectedValue, getLabel = (value) => value) {
  const field = document.createElement("div");
  field.className = "field";

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement("select");
  input.id = id;
  input.name = id;
  for (const value of values) {
    input.appendChild(createOption(value, getLabel(value)));
  }
  input.value = selectedValue;

  field.append(label, input);
  return { field, input };
}

function createLabeledInput(id, labelText, value) {
  const field = document.createElement("div");
  field.className = "field";

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement("input");
  input.id = id;
  input.name = id;
  input.type = "text";
  input.required = true;
  input.value = value;

  field.append(label, input);
  return { field, input };
}

function createLabeledTextarea(id, labelText, value) {
  const field = document.createElement("div");
  field.className = "field";

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement("textarea");
  input.id = id;
  input.name = id;
  input.rows = 2;
  input.value = value;

  field.append(label, input);
  return { field, input };
}

function createLabeledFileInput(id, labelText) {
  const field = document.createElement("div");
  field.className = "field photo-field";

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement("input");
  input.id = id;
  input.name = id;
  input.type = "file";
  input.accept = "image/*";
  input.setAttribute("capture", "environment");
  input.multiple = true;

  const hint = document.createElement("div");
  hint.className = "field-hint";
  hint.textContent = "Capture or select images";

  field.append(label, input, hint);
  return { field, input };
}

async function readPhotoFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith("image/"));
  return Promise.all(files.map(readPhotoFile));
}

function readPhotoFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      resolve({
        id: crypto.randomUUID(),
        data: reader.result,
        filename: file.name || "Photo",
        timestamp: new Date().toISOString(),
      });
    });
    reader.addEventListener("error", () => reject(new Error("Could not read photo.")));
    reader.readAsDataURL(file);
  });
}

async function addCategoryTask(room, category, text, photos = [], materialType = null) {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return;
  }

  openRooms.add(room);
  await updateTasks([...tasks, createTask(room, category, trimmedText, photos, materialType)]);
}

async function addMaterialTask(room, materialType, text) {
  const trimmedText = text.trim();
  if (!trimmedText || !MATERIAL_TYPE_META[materialType]) {
    return;
  }

  const newTask = createTask(room, MATERIAL_TYPE_META[materialType].category, trimmedText, [], materialType);

  if (!matchesMaterialFilters(newTask)) {
    filters = {
      ...filters,
      query: "",
      status: "all",
      materialType: "all",
      photoState: "all",
      noteState: "all",
    };
    writeFiltersToUrl();
  }

  await updateTasks([...tasks, newTask]);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function editTask(id, room, category, text, note, status, materialType, newPhotos = []) {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return;
  }

  const trimmedNote = note.trim();
  const nextMaterialType = room === "Materials" ? materialType || "shopping" : null;
  const nextCategory = room === "Materials" ? getMaterialCategory(nextMaterialType) : category;
  editingTaskId = null;
  await updateTasks(
    tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            room,
            category: nextCategory,
            text: trimmedText,
            note: trimmedNote,
            status,
            materialType: nextMaterialType,
            photos: [...task.photos, ...newPhotos],
          }
        : task,
    ),
  );
}

async function removePhoto(taskId, photoId) {
  await updateTasks(
    tasks.map((task) =>
      task.id === taskId
        ? { ...task, photos: task.photos.filter((photo) => photo.id !== photoId) }
        : task,
    ),
  );
}

async function addVoiceNote(taskId, voiceNote) {
  await updateTasks(
    tasks.map((task) =>
      task.id === taskId
        ? { ...task, voiceNotes: [...task.voiceNotes, voiceNote].slice(-MAX_VOICE_NOTES_PER_TASK) }
        : task,
    ),
  );
}

async function removeVoiceNote(taskId, voiceNoteId) {
  await updateTasks(
    tasks.map((task) =>
      task.id === taskId
        ? { ...task, voiceNotes: task.voiceNotes.filter((voiceNote) => voiceNote.id !== voiceNoteId) }
        : task,
    ),
  );
}

async function toggleTask(id) {
  await updateTasks(
    tasks.map((task) =>
      task.id === id ? { ...task, status: isDone(task) ? "approved" : "done" } : task,
    ),
  );
}

async function setTaskStatus(id, status) {
  await updateTasks(
    tasks.map((task) =>
      task.id === id ? { ...task, status } : task,
    ),
  );
}

async function deleteTask(id) {
  await updateTasks(tasks.filter((task) => task.id !== id));
}

async function markDoneOpen() {
  await updateTasks(
    tasks.map((task) =>
      task.unitId === selectedUnitId && !isPendingReview(task) && isOpenStatus(task.status) ? { ...task, status: "done" } : task,
    ),
  );
}

async function deleteDone() {
  await updateTasks(tasks.filter((task) => task.unitId !== selectedUnitId || !isDone(task)));
}

async function bulkApproveReview() {
  await updateTasks(
    tasks.map((task) =>
      task.unitId === selectedUnitId && isPendingReview(task) ? { ...task, status: "approved" } : task,
    ),
  );
}

async function clearAll() {
  if (getSelectedUnitTasks().length === 0) {
    return;
  }

  if (confirm(`Clear all checklist items for ${getSelectedUnit()?.name || "this unit"}?`)) {
    await updateTasks(tasks.filter((task) => task.unitId !== selectedUnitId));
  }
}

async function handleTaskAction(event) {
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) {
    return;
  }

  const { action, taskId, photoId, voiceNoteId } = actionElement.dataset;

  if (action === "drag") {
    return;
  }

  if (action === "toggle" && event.type === "change") {
    await toggleTask(taskId);
    return;
  }

  if (event.type !== "click") {
    return;
  }

  if (action === "approve") {
    await setTaskStatus(taskId, "approved");
    return;
  }

  if (action === "reject" || action === "delete") {
    await deleteTask(taskId);
    return;
  }

  if (action === "edit") {
    toggleEditTask(taskId);
    return;
  }

  if (action === "preview-photo") {
    const photo = getPhotoById(taskId, photoId);
    if (photo) {
      openPhotoPreview(photo);
    }
    return;
  }

  if (action === "remove-photo") {
    await removePhoto(taskId, photoId);
    return;
  }

  if (action === "remove-voice-note") {
    if (!confirm("Delete this voice recording?")) {
      return;
    }

    await removeVoiceNote(taskId, voiceNoteId);
    return;
  }

  if (action === "remove-page-voice-recording") {
    if (!confirm("Delete this voice recording?")) {
      return;
    }

    removePageVoiceRecording(voiceNoteId);
    return;
  }

  if (action === "create-tasks-from-voice") {
    showVoiceTaskCreationUnavailable();
  }
}

function removePageVoiceRecording(voiceNoteId) {
  pageVoiceRecordings = pageVoiceRecordings.filter((voiceNote) => voiceNote.id !== voiceNoteId);
  renderPageVoiceInput();
}

function toggleEditTask(taskId) {
  const task = getTaskById(taskId);
  if (!task) {
    return;
  }

  editingTaskId = editingTaskId === taskId ? null : taskId;
  openRooms.add(task.room);
  render();
}

function getPhotoById(taskId, photoId) {
  return getTaskById(taskId)?.photos.find((photo) => photo.id === photoId) || null;
}

async function handleTaskFormSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) {
    return;
  }

  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  const formData = new FormData(form);

  if (form.dataset.form === "quick-add") {
    await addCategoryTask(form.dataset.room, getDefaultCategoryForRoomAdd(), getFormString(formData, "text"));
    return;
  }

  if (form.dataset.form === "room-add") {
    const photos = await readPhotoFiles(form.elements.photos.files);
    await addCategoryTask(
      form.dataset.room,
      getFormString(formData, "category"),
      getFormString(formData, "text"),
      photos,
    );
    return;
  }

  if (form.dataset.form === "fixed-category-add") {
    const materialType = form.dataset.materialType;
    await addMaterialTask(form.dataset.room, materialType, getFormString(formData, "text"));
    return;
  }

  if (form.dataset.form === "edit-task") {
    const photos = form.elements.photos ? await readPhotoFiles(form.elements.photos.files) : [];
    await editTask(
      form.dataset.taskId,
      getFormString(formData, "room"),
      getFormString(formData, "category"),
      getFormString(formData, "text"),
      getFormString(formData, "note"),
      getFormString(formData, "status"),
      getFormString(formData, "materialType"),
      photos,
    );
  }
}

function getFormString(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function updateFilters() {
  filters = {
    query: searchInput.value,
    room: roomFilter.value,
    category: categoryFilter.value,
    status: statusFilter.value,
    materialType: materialTypeFilter.value,
    photoState: photoFilter.value,
    noteState: noteFilter.value,
  };
  writeFiltersToUrl();
  render();
}

function clearFilters() {
  filters = getDefaultFilters();
  writeFiltersToUrl();
  render();
}

function updateSelectedUnit() {
  selectedUnitId = unitSelect.value || DEFAULT_UNIT_ID;
  editingTaskId = null;
  editingRoomName = null;
  openRooms.clear();
  filters = getDefaultFilters();
  writeFiltersToUrl();
  render();
}

function showTaskSearch(event) {
  event?.preventDefault();
  event?.stopPropagation();
  tasksPanel.open = true;
  isTaskSearchOpen = true;
  renderTaskSearchState();
  requestAnimationFrame(() => searchInput.focus());
}

function hideTaskSearch(event) {
  event?.preventDefault();
  event?.stopPropagation();
  isTaskSearchOpen = false;
  filters = {
    ...filters,
    query: "",
  };
  writeFiltersToUrl();
  render();
}

function keepOnlyOneSecondaryPanelOpen(event) {
  const openedPanel = event.currentTarget;

  if (!openedPanel.open) {
    syncSecondaryPanelBodies();
    return;
  }

  for (const panel of [materialsPanel, filtersPanel]) {
    if (panel !== openedPanel) {
      panel.open = false;
    }
  }

  syncSecondaryPanelBodies();
}

function syncSecondaryPanelBodies() {
  materialsPanelBody.hidden = !materialsPanel.open;
  filtersPanelBody.hidden = !filtersPanel.open;
}

showTaskSearchButton.addEventListener("click", showTaskSearch);
hideTaskSearchButton.addEventListener("click", hideTaskSearch);
searchInput.addEventListener("input", updateFilters);
roomFilter.addEventListener("change", updateFilters);
categoryFilter.addEventListener("change", updateFilters);
statusFilter.addEventListener("change", updateFilters);
materialTypeFilter.addEventListener("change", updateFilters);
photoFilter.addEventListener("change", updateFilters);
noteFilter.addEventListener("change", updateFilters);
clearFiltersButton.addEventListener("click", clearFilters);
clearFiltersInlineButton.addEventListener("click", clearFilters);
unitSelect.addEventListener("change", updateSelectedUnit);
materialsPanel.addEventListener("toggle", keepOnlyOneSecondaryPanelOpen);
filtersPanel.addEventListener("toggle", keepOnlyOneSecondaryPanelOpen);
syncSecondaryPanelBodies();
workModeToggle.addEventListener("change", render);
pageVoiceRecordButton.addEventListener("click", toggleVoiceRecording);
document.addEventListener("click", handleTaskAction);
document.addEventListener("change", handleTaskAction);
document.addEventListener("submit", handleTaskFormSubmit);
taskContextMenu.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-context-action]");

  if (actionButton) {
    runContextAction(actionButton.dataset.contextAction);
  }
});
contextMoveButton.addEventListener("click", moveContextTask);
document.addEventListener("click", (event) => {
  if (Date.now() - contextOpenedAt < 250) {
    return;
  }

  if (!taskContextMenu.hidden && !event.target.closest("#task-context-menu")) {
    closeTaskContextMenu();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeTaskContextMenu();
  }
});
markOpenButton.addEventListener("click", markDoneOpen);
deleteDoneButton.addEventListener("click", deleteDone);
bulkApproveButton.addEventListener("click", bulkApproveReview);
clearAllButton.addEventListener("click", clearAll);

loadAppData().catch((error) => {
  setStatus(error.message);
});
