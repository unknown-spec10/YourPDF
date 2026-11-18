import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Scroll traps, guarded.
 *
 * `overscroll-behavior: contain` on an inline preview pane stops the wheel at the pane's edge, so
 * the page appears frozen while the cursor is over the preview -- the user has to move the pointer
 * outside before the page will scroll. It is right for a modal (the page behind is inert anyway)
 * and wrong for a pane the page still needs to scroll past.
 *
 * Modals keep the rule in `globals.css`; tool pages must not reintroduce it.
 */
const APP_DIR = join(process.cwd(), 'src', 'app')

function toolPages(): { name: string; source: string }[] {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: join(APP_DIR, entry.name, 'page.tsx') }))
    .flatMap(({ name, path }) => {
      try {
        return [{ name, source: readFileSync(path, 'utf8') }]
      } catch {
        return []
      }
    })
}

describe('scroll traps', () => {
  it('no tool page opts out of scroll chaining', () => {
    const offenders = toolPages()
      .filter((page) => page.source.includes('overscroll-contain'))
      .map((page) => page.name)

    expect(offenders).toEqual([])
  })

  it('modal dialogs still contain their own scroll', () => {
    const css = readFileSync(join(APP_DIR, 'globals.css'), 'utf8')

    expect(css).toMatch(/dialog:modal\s*\{[^}]*overscroll-behavior:\s*contain/)
  })

  it('inline previews do not capture the pointer, dialogs do', () => {
    // An <iframe> preview is a picture of the document: the PDF viewer inside it swallows wheel
    // events, so the page cannot scroll while the cursor is over it. One CSS rule handles every
    // preview; dialogs opt back in because scrolling the document is their purpose.
    const css = readFileSync(join(APP_DIR, 'globals.css'), 'utf8')

    expect(css).toMatch(/iframe:not\(dialog iframe\)\s*\{[^}]*pointer-events:\s*none/)
    expect(css).toMatch(/dialog iframe\s*\{[^}]*pointer-events:\s*auto/)
  })
})
