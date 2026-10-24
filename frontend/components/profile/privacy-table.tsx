import { ComingSoonBadge } from '@/components/shared/coming-soon'

interface Stage {
  stage: string
  soon?: boolean
  driver: string
  passenger: string
}

const STAGES: Stage[] = [
  {
    stage: 'Antes del match',
    driver: 'Los pasajeros ven tu nombre, foto (si subiste), colonia, punto de encuentro, hora y lugares libres.',
    passenger: 'Nadie ve tus datos. Solo tú ves los viajes disponibles.',
  },
  {
    stage: 'Solicitud pendiente',
    driver: 'Ves el nombre, foto y colonia del pasajero que pidió lugar.',
    passenger: 'El conductor ve tu nombre, foto y colonia. Nada más.',
  },
  {
    stage: 'Viaje aceptado',
    driver: 'Ves la lista de pasajeros confirmados, su celular y el punto de encuentro público.',
    passenger: 'Ves el nombre y el celular del conductor y el punto de encuentro público. Nunca direcciones.',
  },
  {
    stage: '15 minutos antes',
    soon: true,
    driver: 'Podrás compartir tu ubicación en vivo, solo si quieres.',
    passenger: 'Podrás compartir tu ubicación en vivo, solo si quieres.',
  },
  {
    stage: 'Durante el viaje',
    soon: true,
    driver: 'Ubicación temporal, revocable en cualquier momento.',
    passenger: 'Ubicación temporal, revocable en cualquier momento.',
  },
  {
    stage: 'Al finalizar',
    driver: 'Se oculta la información de contacto del viaje. Cualquier ubicación se elimina.',
    passenger: 'Se oculta la información de contacto del viaje. Cualquier ubicación se elimina.',
  },
]

export function PrivacyTable() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <p className="border-b p-4 text-sm leading-relaxed text-muted-foreground">
        Qué ve cada persona en cada etapa del viaje. Tu correo y tus horarios nunca se comparten; tu celular, solo con quien tiene un viaje aceptado contigo.
      </p>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Información compartida por etapa del viaje</caption>
        <thead className="hidden bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground sm:table-header-group">
          <tr>
            <th scope="col" className="w-36 p-3 font-semibold">
              Etapa
            </th>
            <th scope="col" className="p-3 font-semibold">
              Conductor
            </th>
            <th scope="col" className="p-3 font-semibold">
              Pasajero
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {STAGES.map((s) => (
            <tr key={s.stage} className="flex flex-col gap-2 p-4 sm:table-row sm:p-0">
              <th scope="row" className="flex flex-wrap items-center gap-2 font-semibold sm:table-cell sm:p-3 sm:align-top">
                {s.stage}
                {s.soon && <ComingSoonBadge className="sm:mt-1 sm:flex sm:w-fit" />}
              </th>
              <td className="leading-relaxed sm:p-3 sm:align-top">
                <span className="mr-1 font-medium sm:hidden">Conductor:</span>
                <span className={s.soon ? 'text-muted-foreground' : undefined}>{s.driver}</span>
              </td>
              <td className="leading-relaxed sm:p-3 sm:align-top">
                <span className="mr-1 font-medium sm:hidden">Pasajero:</span>
                <span className={s.soon ? 'text-muted-foreground' : undefined}>{s.passenger}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
