import { Logo } from '@/components/shared/logo'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <header className="mb-8">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
      <footer className="mt-10 text-center text-xs text-muted-foreground">
        Exclusivo para la comunidad estudiantil de la Universidad Anáhuac Mayab · Mérida, Yucatán
      </footer>
    </div>
  )
}
