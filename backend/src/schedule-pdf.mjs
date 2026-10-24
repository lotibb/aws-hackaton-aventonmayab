import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const DAYS = new Map([
  ["lunes", 1], ["martes", 2], ["miércoles", 3],
  ["jueves", 4], ["viernes", 5], ["sábado", 6], ["domingo", 7],
]);
const PERIOD = /^(\d{1,2}):([0-5]\d)\s*[-–]\s*(\d{1,2}):([0-5]\d)$/;
const COURSE_CODE = /^[A-Z]{2,6}\d{4}$/;
const BUILDING_CODES = new Map([
  ["SALUD1", "Salud I"],
  ["SALUD2", "Salud II"],
  ["CNTRAL", "Central"],
  ["EDIF5", "Edificio 5"],
  ["LIIET", "LIIET"],
]);
const COMPLETE_SUBJECTS = new Map([
  ["SIS3403", "Programación de dispositivos móviles"],
  ["SIS3404", "Implementación de sistemas integrados"],
  ["SIS4404", "Infraestructura y cómputo en la nube"],
  ["SIS4402", "Calidad de software"],
]);

function subjectFrom(items, timeY) {
  const lines = new Map();
  for (const item of items.filter((item) => timeY - item.y >= 4 && timeY - item.y <= 35)) {
    const y = Math.round(item.y);
    const line = lines.get(y) ?? [];
    line.push(item);
    lines.set(y, line);
  }
  return [...lines.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, line]) => line.sort((a, b) => a.x - b.x).map((item) => item.str).join(" "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function classesOnPage(items) {
  const heading = items.some((item) => /An[aá]huac Mayab\s*-\s*Horario de Clases/i.test(item.str));
  if (!heading) return [];

  const headers = items
    .filter((item) => DAYS.has(item.str.toLocaleLowerCase("es-MX")))
    .sort((a, b) => a.x - b.x);
  if (headers.length < 2) return [];

  const classes = [];
  for (const [index, header] of headers.entries()) {
    const previous = headers[index - 1];
    const next = headers[index + 1];
    const left = previous ? (previous.x + header.x) / 2 : header.x - (next.x - header.x) / 2;
    const right = next ? (header.x + next.x) / 2 : header.x + (header.x - previous.x) / 2;
    const column = items.filter((item) => item.x >= left && item.x < right && item.y < header.y - 5);
    const periods = column.filter((item) => PERIOD.test(item.str)).sort((a, b) => b.y - a.y);

    for (const [periodIndex, period] of periods.entries()) {
      const [, startHour, startMinute, endHour, endMinute] = PERIOD.exec(period.str);
      const start = `${startHour.padStart(2, "0")}:${startMinute}`;
      const end = `${endHour.padStart(2, "0")}:${endMinute}`;
      if (start >= end) continue;

      const nextY = periods[periodIndex + 1]?.y ?? 0;
      const block = column.filter((item) => item.y < period.y - 2 && item.y > nextY);
      const code = block.find((item) => COURSE_CODE.test(item.str));
      const room = code && block.find((item) => Math.abs(item.y - code.y) < 2 && item.x > code.x + code.width + 2);
      const buildingCode = code && block.find((item) => Math.abs(item.y - (code.y - 10)) < 3 && BUILDING_CODES.has(item.str));
      const subject = COMPLETE_SUBJECTS.get(code?.str) ?? subjectFrom(block, period.y);
      if (!subject) continue;

      classes.push({
        day: DAYS.get(header.str.toLocaleLowerCase("es-MX")),
        start,
        end,
        subject: subject.slice(0, 60),
        room: room?.str.slice(0, 30),
        building: buildingCode && BUILDING_CODES.get(buildingCode.str),
      });
    }
  }
  return classes;
}

/** Read the text layer of Anáhuac's "Mi Plan A" weekly grid without sending it to an AI model. */
export async function extractAnahuacSchedulePdf(base64) {
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.length < 5 || Buffer.from(bytes.subarray(0, 5)).toString() !== "%PDF-") return [];
  const task = getDocument({ data: bytes });
  try {
    const pdf = await task.promise;
    const seen = new Set();
    const classes = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 4); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const { items: rawItems } = await page.getTextContent();
      const items = rawItems
        .filter((item) => typeof item.str === "string" && item.str.trim())
        .map((item) => ({ str: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width }));
      for (const item of classesOnPage(items)) {
        const key = `${item.day}|${item.start}|${item.end}`;
        if (!seen.has(key)) {
          seen.add(key);
          classes.push(item);
        }
      }
      page.cleanup();
    }
    return classes.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)).slice(0, 60);
  } finally {
    await task.destroy();
  }
}
