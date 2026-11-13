// Marker colours for property maps (shared by the server page that builds points and the legend).
export const MAP_COLOURS = {
  emergency: "#f0524f",
  open: "#3987e5",
  void: "#f2a93b",
  none: "#64748b",
} as const;

export const MAP_LEGEND: { key: keyof typeof MAP_COLOURS; label: string }[] = [
  { key: "emergency", label: "Open emergency" },
  { key: "open", label: "Open jobs" },
  { key: "void", label: "Void" },
  { key: "none", label: "No open jobs" },
];
