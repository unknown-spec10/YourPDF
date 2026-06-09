import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full border-t border-border bg-background py-8 text-center text-sm transition-colors duration-200">
      <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-muted">
        <div>
          <span>YourPDF &copy; {currentYear} · Open Source · No data stored</span>
        </div>
        <div className="flex gap-6">
          <Link href="/how-it-works" className="hover:text-foreground transition-colors duration-200">
            Privacy
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors duration-200"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}
