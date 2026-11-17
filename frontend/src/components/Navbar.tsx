'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sun, Moon, Menu, X, ShieldCheck, ArrowLeftRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '@/lib/store'
import { IAP_ENABLED, buildSwitchAccountHref } from '@/lib/iap'

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      stroke="currentColor"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  )
}

export default function Navbar() {
  const pathname = usePathname()
  const { theme, toggleTheme, setTheme } = useAppStore()
  const [mounted, setMounted] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  /// Where the account chooser should return to. Built on the client because the static export
  // cannot know the current query string at build time.
  const [switchAccountHref, setSwitchAccountHref] = useState<string | null>(null)
  useEffect(() => {
    if (!IAP_ENABLED) return
    setSwitchAccountHref(buildSwitchAccountHref(window.location.pathname, window.location.search))
  }, [])

  // Theme-aware favicon. The OS-driven `media` attributes cannot follow an in-app toggle, so the
  // icon is swapped from the same state that drives the `dark` class. The tab icon then matches
  // what the user is actually looking at, not what their desktop is set to.
  useEffect(() => {
    const href = theme === 'dark' ? '/brand/yourpdf-icon-dark.png' : '/brand/yourpdf-icon-light.png'
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((link) => {
      link.href = href
    })
  }, [theme])

  // The mobile panel is a disclosure, not a modal, so it needs no focus trap — but it does need
  // the two things a keyboard user expects: Escape closes it, and focus lands back on the button
  // that opened it instead of being dropped at the top of the document.
  useEffect(() => {
    if (!isMobileMenuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsMobileMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isMobileMenuOpen])

  // Avoid hydration mismatch by waiting until mounted on client
  useEffect(() => {
    setMounted(true)
    const savedTheme = localStorage.getItem('yourpdf-theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    } else {
      // Default is dark mode
      document.documentElement.classList.add('dark')
    }
  }, [setTheme])

  // Close mobile menu when pathname changes
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  const navLinks = [
    { name: 'All Tools', href: '/tools' },
    { name: 'How It Works', href: '/how-it-works' },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
        {/* Logo. Two lockups rather than one tinted asset: the mark's black arm and the
            wordmark's ink are part of the design, so a single recoloured file would lose the
            contrast the brand relies on. Intrinsic width/height prevent a layout shift. */}
        <Link href="/" className="group flex items-center" aria-label="YourPDF — home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/yourpdf-lockup-light.png"
            alt="YourPDF"
            width={419}
            height={140}
            className="h-8 w-auto transition-transform duration-200 group-hover:scale-[1.02] dark:hidden"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/yourpdf-lockup-dark.png"
            alt="YourPDF"
            width={428}
            height={140}
            className="hidden h-8 w-auto transition-transform duration-200 group-hover:scale-[1.02] dark:block"
          />
        </Link>

        {/* Navigation (Desktop) */}
        <nav className="hidden items-center gap-1 text-sm font-medium md:flex" aria-label="Primary">
          {navLinks.map((link) => {
            const isActive = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={`relative rounded-md px-3 py-2 transition-colors duration-150 ${
                  isActive ? 'text-foreground' : 'text-muted hover:text-foreground'
                }`}
              >
                <span>{link.name}</span>
                {isActive && (
                  <motion.div
                    layoutId="navbarActiveIndicator"
                    className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-accent"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Trust pill. It says what is actually true of this architecture: the file is uploaded,
              processed and deleted when the response is returned. It deliberately does NOT claim
              "files never leave your device" — that would be false for a server-side service. */}
          <span
            className="hidden items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted lg:inline-flex"
            title="Files are processed on our server and deleted the moment your result is returned. No account history, no stored documents."
          >
            <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            Zero retention
          </span>

          {switchAccountHref && (
            <a
              href={switchAccountHref}
              className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground lg:flex"
              title="Opens Google's account chooser so you can sign in as a different Google account. Your Google session is not ended, so choosing the same account signs you back in."
            >
              <ArrowLeftRight className="h-[15px] w-[15px]" aria-hidden="true" />
              <span>Switch account</span>
            </a>
          )}

          <a
            href="https://github.com/unknown-spec10/YourPDF"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground sm:flex"
            title="View source on GitHub"
            aria-label="View source on GitHub"
          >
            <GithubIcon className="h-[18px] w-[18px]" />
          </a>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground cursor-pointer"
            aria-label="Toggle theme"
          >
            {mounted && theme === 'dark' ? (
              <Sun className="h-[18px] w-[18px]" />
            ) : (
              <Moon className="h-[18px] w-[18px]" />
            )}
          </button>

          {/* Mobile Menu Toggle */}
          <button
            ref={menuButtonRef}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground cursor-pointer md:hidden"
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden border-t border-border/70 bg-background/95 backdrop-blur-xl md:hidden"
          >
            <nav className="flex flex-col gap-1 px-5 py-4 text-[15px] font-medium" aria-label="Mobile">
              {navLinks.map((link) => {
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`rounded-lg px-3 py-2.5 transition-colors duration-150 ${
                      isActive
                        ? 'bg-surface-2 text-foreground'
                        : 'text-muted hover:bg-surface-2 hover:text-foreground'
                    }`}
                  >
                    {link.name}
                  </Link>
                )
              })}
              <a
                href="https://github.com/unknown-spec10/YourPDF"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-3 py-2.5 text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground sm:hidden"
              >
                GitHub
              </a>
              {switchAccountHref && (
                <a
                  href={switchAccountHref}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="mt-1 flex items-center gap-2 rounded-lg border-t border-border/70 px-3 pt-3 pb-2.5 text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground lg:hidden"
                >
                  <ArrowLeftRight className="h-[15px] w-[15px]" aria-hidden="true" />
                  Switch account
                </a>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
