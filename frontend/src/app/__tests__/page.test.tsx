import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import Home from '../page'

test('renders brand landing heading', () => {
  render(<Home />)
  const heading = screen.getByRole('heading', { level: 1 })
  expect(heading).toBeInTheDocument()
  expect(heading).toHaveTextContent(/Your PDF tools/i)
})
