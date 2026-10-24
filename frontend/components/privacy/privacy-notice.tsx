'use client'

import { CalendarClock, Car, ChevronLeft, EyeOff, MapPinOff, ParkingSquare, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

const RULES = [
  {
    icon: MapPinOff,
    title: 'El GPS está apagado por defecto',
    body: 'Nunca necesitas activar tu ubicación para buscar o reservar un aventón. Esta versión no usa GPS en absoluto.',
  },
  {
    icon: Car,
    title: 'Compartir ubicación será voluntario',
    body: 'Cuando esté disponible, compartir tu ubicación será opcional, limitado a un solo viaje y revocable en cualquier momento por el conductor o el pasajero.',
  },
  {
    icon: EyeOff,
    title: 'Sin datos sensibles para desconocidos',
    body: 'Nunca mostramos tu domicilio, tu número de teléfono ni coordenadas exactas a personas con las que no tienes un viaje aceptado. Solo usamos colonias aproximadas y puntos de encuentro públicos.',
  },
  {
    icon: Trash2,
    title: 'Se borra al terminar el viaje',
    body: 'Los datos de ubicación precisa se eliminan cuando el viaje termina. No guardamos historial de rutas.',
  },
  {
    icon: CalendarClock,
    title: 'Tus horarios son privados',
    body: 'Tu horario de clases solo lo ves tú. Para las proyecciones de estacionamiento usamos únicamente conteos agregados, nunca horarios individuales.',
  },
  {
    icon: ParkingSquare,
    title: 'El estacionamiento no identifica a nadie',
    body: 'La ocupación es solo un número agregado. Los sensores infrarrojos únicamente cuentan autos: no captan placas, imágenes ni identifican vehículos o personas.',
  },
]

export function PrivacyNotice({ showBack = true }: { showBack?: boolean }) {
  const router = useRouter()
  return (
    <article className="flex flex-col gap-6">
      <header className="flex items-start gap-2">
        {showBack && (
          <button
            type="button"
            onClick={() => router.back()}
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-6" aria-hidden="true" />
            <span className="sr-only">Regresar</span>
          </button>
        )}
        <div className="pt-1.5">
          <h1 className="text-balance text-2xl font-semibold tracking-tight">Aviso de privacidad</h1>
          <p className="mt-1 text-sm text-muted-foreground">Versión preliminar · Contenido de referencia sujeto a revisión legal</p>
        </div>
      </header>

      <section aria-labelledby="responsable" className="flex flex-col gap-2 text-sm leading-relaxed">
        <h2 id="responsable" className="text-base font-semibold">
          1. Responsable
        </h2>
        <p className="text-muted-foreground">
          [Nombre del responsable], en coordinación con la Universidad Anáhuac Mayab, es responsable del tratamiento de tus datos
          personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.
        </p>
      </section>

      <section aria-labelledby="datos" className="flex flex-col gap-2 text-sm leading-relaxed">
        <h2 id="datos" className="text-base font-semibold">
          2. Datos que recabamos
        </h2>
        <p className="text-muted-foreground">
          Nombre completo, correo institucional, número de celular, foto de perfil opcional, colonia aproximada, viajes que publicas o solicitas,
          registros manuales de estacionamiento y, si tú decides capturarlo, tu horario de clases.
        </p>
      </section>

      <section aria-labelledby="reglas" className="flex flex-col gap-3">
        <h2 id="reglas" className="text-base font-semibold">
          3. Nuestros compromisos
        </h2>
        <ul className="flex flex-col gap-3">
          {RULES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3 rounded-xl border bg-card p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="derechos" className="flex flex-col gap-2 text-sm leading-relaxed">
        <h2 id="derechos" className="text-base font-semibold">
          4. Tus derechos ARCO
        </h2>
        <p className="text-muted-foreground">
          Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos. Desde Perfil puedes eliminar tu cuenta y
          todos tus datos en cualquier momento. Para otras solicitudes escribe a [correo de contacto].
        </p>
      </section>

      <section aria-labelledby="cambios" className="flex flex-col gap-2 text-sm leading-relaxed">
        <h2 id="cambios" className="text-base font-semibold">
          5. Cambios a este aviso
        </h2>
        <p className="text-muted-foreground">
          Te avisaremos dentro de la app antes de aplicar cualquier cambio relevante. Última actualización: [fecha].
        </p>
      </section>
    </article>
  )
}
