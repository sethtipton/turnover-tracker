export const WORKSPACE_NAME = "Tipton Rentals";

export const INITIAL_PROPERTIES = [
  { name: "451", units: ["UP", "DOWN"] },
  { name: "441", units: ["UP", "DOWN"] },
  { name: "1065 Hudson Rd", units: ["Main Unit"] },
  { name: "1067 Hudson Rd", units: ["Main Unit"] },
  { name: "4 Vine Ct", units: ["Main Unit"] },
  { name: "126 N Mantua", units: ["Main Unit"] },
  { name: "124 N Mantua", units: ["Main Unit"] },
  { name: "469 Carthage", units: ["Main Unit"] },
  { name: "458 W Main", units: ["UP", "DOWN"] },
  { name: "127 S Pearl", units: ["UP", "DOWN"] },
  { name: "322 Park", units: ["AirBnB"] },
  { name: "310 Park", units: ["Brewery"] },
];

export const UNIT_ROUTE_ALIASES = {
  UP: ["Upstairs"],
  DOWN: ["Downstairs"],
};

export const DEFAULT_CATEGORIES = [
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

export const STATUS_LABELS = {
  "pending-review": "Pending Review",
  approved: "Approved",
  done: "Done",
};

export const MATERIAL_LABELS = {
  shopping: "Shopping List",
  collect: "Collect / Bring",
};
