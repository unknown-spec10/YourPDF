import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full border-t border-border/70 bg-background">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-xs">
            <p className="text-[15px] font-semibold tracking-tight text-foreground">YourPDF</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Free, private PDF utilities. No accounts, no tracking, no data stored.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-muted">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              All systems operational
            </p>
          </div>

          <nav className="grid grid-cols-2 gap-8 text-sm sm:gap-16" aria-label="Footer">
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Product</p>
              <Link href="/tools" className="text-muted transition-colors hover:text-foreground">
                All tools
              </Link>
              <Link href="/how-it-works" className="text-muted transition-colors hover:text-foreground">
                How it works
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Project</p>
              <Link href="/how-it-works" className="text-muted transition-colors hover:text-foreground">
                Privacy
              </Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted transition-colors hover:text-foreground"
              >
                GitHub
              </a>
            </div>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border/70 pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>YourPDF &copy; {currentYear} · Open source</span>
          <span>No data stored · Files auto-expire</span>
        </div>
      </div>
    </footer>
  )
}
