import { ServiceError } from './services/errors'
import type { ScheduleFileType } from './services'

const MAX_PDF_BYTES = 4 * 1024 * 1024
// Big enough to read small print in a timetable, small enough to upload quickly.
const MAX_IMAGE_SIDE = 2000

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('unreadable image'))
    }
    img.src = url
  })
}

/** Turns a timetable PDF or photo into the base64 payload the import API expects. Photos are shrunk to a JPEG first. */
export async function readScheduleFile(file: File): Promise<{ data: string; mediaType: ScheduleFileType }> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new ServiceError('INVALID_INPUT', 'El PDF debe pesar menos de 4 MB.')
    const dataUrl = await readAsDataUrl(file)
    return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'application/pdf' }
  }
  if (!file.type.startsWith('image/')) throw new ServiceError('INVALID_INPUT', 'Sube un PDF o una foto de tu horario.')

  let img: HTMLImageElement
  try {
    img = await loadImage(file)
  } catch {
    throw new ServiceError('INVALID_INPUT', 'No pudimos abrir esa imagen. Prueba con una captura de pantalla en JPG o PNG.')
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ServiceError('INVALID_INPUT', 'No pudimos procesar esa imagen.')
  // White behind transparent screenshots, so they don't turn black as JPEG.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg' }
}
