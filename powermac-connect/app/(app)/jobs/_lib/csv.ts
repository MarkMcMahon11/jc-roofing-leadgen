/**
 * Minimal CSV reader for pasted text: comma or tab separated, double quotes allow commas
 * and doubled quotes ("") inside a cell. Blank lines are skipped; line numbers are kept so
 * problems can be reported against what the user pasted.
 */
export function parseCsv(text: string): { line: number; text: string; cells: string[] }[] {
  const out: { line: number; text: string; cells: string[] }[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((raw, i) => {
    if (!raw.trim()) return;
    const sep = raw.includes("\t") && !raw.includes(",") ? "\t" : ",";
    const cells: string[] = [];
    let cur = "";
    let quoted = false;
    for (let j = 0; j < raw.length; j++) {
      const ch = raw[j];
      if (quoted) {
        if (ch === '"' && raw[j + 1] === '"') {
          cur += '"';
          j++;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"' && cur.trim() === "") {
        quoted = true;
        cur = "";
      } else if (ch === sep) {
        cells.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    out.push({ line: i + 1, text: raw.slice(0, 300), cells });
  });
  return out;
}
