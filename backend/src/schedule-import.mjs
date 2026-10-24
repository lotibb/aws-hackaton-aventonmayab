import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { HttpError, readBody, router } from "./lib/http.mjs";

// Claude in Amazon Bedrock; signs with the Lambda role. API Gateway gives up after 30 s.
const claude = new AnthropicBedrockMantle({ timeout: 25_000, maxRetries: 0 });
const MODEL = process.env.MODEL_ID ?? "anthropic.claude-opus-5-5";

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const MEDIA_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
// Lambda accepts 6 MB per request; base64 inflates the file by a third.
const MAX_BASE64 = 5_500_000;

const SYSTEM = `Lees horarios de clases de estudiantes universitarios en México (Universidad Anáhuac Mayab) a partir de una foto, captura de pantalla o PDF.

Devuelve cada sesión semanal de clase como un elemento de "classes". Si una materia se imparte varios días, crea un elemento por día.
- day: 1 = lunes, 2 = martes, 3 = miércoles, 4 = jueves, 5 = viernes, 6 = sábado, 7 = domingo. Las abreviaturas comunes son L, M, Mi o X, J, V, S, Lun, Mar, Mié, Jue, Vie, Sáb.
- start y end: hora de 24 horas "HH:MM". Convierte "7 pm" a "19:00". Si solo aparece una hora de inicio y la duración, calcula el fin.
- subject: nombre de la materia tal como aparece, sin la clave ni el grupo; null si no se lee.
- room: salón o aula tal como aparece (por ejemplo "A-204"); null si no aparece.
- building: el edificio de la lista que corresponda al salón o a la materia solo si es claro; si no, null.

El horario oficial de la Anáhuac Mayab ("Mi Plan A - Horario actual") es una cuadrícula con una columna por día. Cada bloque trae "HH:MM - HH:MM", la materia (a veces abreviada, por ejemplo "Programació dispositiv móviles"), la clave (ISOC1408, SIS3403), el NRC, el salón (1231, SALA_HP1) y el código del edificio (SALUD2, EDIF5, LIIET). Toma el día de la columna donde está el bloque, no del orden del texto. Ignora la clave y el NRC. En room pon solo el salón. Mapea SALUD1 a Salud I, SALUD2 a Salud II, CNTRAL a Central, EDIF5 a Edificio 5 y LIIET a LIIET cuando aparezcan en la lista de edificios.

No inventes clases. Ignora exámenes, fechas de periodo, días festivos y actividades sin día y hora fijos. Si el archivo no es un horario de clases, devuelve "classes" vacío.`;

const classSchema = (buildings) => ({
  type: "object",
  additionalProperties: false,
  required: ["day", "start", "end", "subject", "room", "building"],
  properties: {
    day: { type: "integer", enum: [1, 2, 3, 4, 5, 6, 7] },
    start: { type: "string" },
    end: { type: "string" },
    subject: { type: ["string", "null"] },
    room: { type: ["string", "null"] },
    building: buildings.length ? { anyOf: [{ type: "string", enum: buildings }, { type: "null" }] } : { type: "null" },
  },
});

function readBuildings(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 30 || value.some((b) => typeof b !== "string" || !b || b.length > 60)) {
    throw new HttpError(400, "Lista de edificios inválida");
  }
  return value;
}

const pad = (time) => {
  const [, h, m] = TIME.exec(time.trim()) ?? [];
  return h ? `${h.padStart(2, "0")}:${m}` : null;
};
const text = (value, max) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined);

// POST /me/schedule/import  { file: base64, mediaType, buildings? }
// Reads the official PDF text layer first, then uses Claude for other files. Nothing is saved:
// the student reviews them and saves them like any other class.
async function importSchedule(event) {
  const { file, mediaType, buildings: rawBuildings } = readBody(event);
  const buildings = readBuildings(rawBuildings);
  if (!MEDIA_TYPES.includes(mediaType)) throw new HttpError(400, "Sube un PDF o una imagen JPG, PNG o WebP");
  if (typeof file !== "string" || !file) throw new HttpError(400, "Falta el archivo");
  if (file.length > MAX_BASE64) throw new HttpError(400, "El archivo es demasiado grande, el máximo es 4 MB");

  if (mediaType === "application/pdf") {
    try {
      const { extractAnahuacSchedulePdf } = await import("./schedule-pdf.mjs");
      const classes = await extractAnahuacSchedulePdf(file);
      if (classes.length) return { classes };
    } catch (error) {
      console.warn("No se pudo leer la capa de texto del PDF; se intentará la lectura visual", error);
    }
  }

  const source = { type: "base64", media_type: mediaType, data: file };
  let response;
  try {
    response = await claude.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["classes"],
            properties: { classes: { type: "array", items: classSchema(buildings) } },
          },
        },
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            mediaType === "application/pdf" ? { type: "document", source } : { type: "image", source },
            {
              type: "text",
              text: `Edificios del campus: ${buildings.length ? buildings.join(", ") : "(sin lista)"}.\nExtrae las clases de este horario.`,
            },
          ],
        },
      ],
    });
  } catch (err) {
    console.error(err);
    throw new HttpError(502, "No pudimos leer tu horario en este momento, intenta de nuevo");
  }

  if (response.stop_reason !== "end_turn") {
    console.error("Unexpected stop_reason", response.stop_reason, response.stop_details);
    throw new HttpError(422, "No pudimos leer este archivo, intenta con una foto más clara");
  }
  const json = response.content.find((block) => block.type === "text")?.text;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new HttpError(422, "No pudimos leer este archivo, intenta con una foto más clara");
  }

  // The schema can't express times or ranges, so drop anything that doesn't make sense.
  const seen = new Set();
  const classes = [];
  for (const c of parsed.classes ?? []) {
    const start = pad(String(c.start));
    const end = pad(String(c.end));
    if (!start || !end || start >= end || !Number.isInteger(c.day) || c.day < 1 || c.day > 7) continue;
    const key = `${c.day}|${start}|${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    classes.push({
      day: c.day,
      start,
      end,
      subject: text(c.subject, 60),
      room: text(c.room, 30),
      building: buildings.includes(c.building) ? c.building : undefined,
    });
  }
  if (classes.length === 0) {
    throw new HttpError(422, "No encontramos clases en este archivo. Revisa que se vean los días y las horas");
  }
  return { classes: classes.slice(0, 60) };
}

export const handler = router({
  "POST /me/schedule/import": importSchedule,
});
