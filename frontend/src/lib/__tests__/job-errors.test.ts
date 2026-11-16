import { describe, expect, it } from 'vitest'

import { detailToMessage, messageForStatus } from '@/hooks/useFileJob'
import {
  MAX_TOTAL_UPLOAD_BYTES,
  exceedsUploadBudget,
  fitToBudget,
  totalBytes,
} from '@/lib/limits'

/**
 * Regression cover for the bug that crashed 22 tool pages: FastAPI returns `detail` as an
 * array for 422s, and that array used to be stored straight into string state.
 */
describe('detailToMessage', () => {
  it('passes a string detail through', () => {
    expect(detailToMessage({ detail: 'This job would render 150 pages' })).toBe(
      'This job would render 150 pages',
    )
  })

  it('flattens a 422 validation array into a sentence', () => {
    const payload = {
      detail: [{ type: 'missing', loc: ['body', 'page_order'], msg: 'Field required' }],
    }

    expect(detailToMessage(payload)).toBe('page_order: Field required')
  })

  it('joins several validation failures', () => {
    const payload = {
      detail: [
        { loc: ['body', 'text'], msg: 'Field required' },
        { loc: ['body', 'opacity'], msg: 'Input should be less than 1' },
      ],
    }

    expect(detailToMessage(payload)).toBe(
      'text: Field required; opacity: Input should be less than 1',
    )
  })

  it('returns null for shapes it cannot read, so the caller can use the status', () => {
    expect(detailToMessage(undefined)).toBeNull()
    expect(detailToMessage({})).toBeNull()
    expect(detailToMessage({ detail: '' })).toBeNull()
    // A body with an unexpected shape: fall back to the status-based sentence.
    expect(detailToMessage({ detail: { unexpected: true } })).toBeNull()
    expect(detailToMessage(42)).toBeNull()
  })

  it('passes a bare string body through (no wrapper object)', () => {
    expect(detailToMessage('Only PDF files are supported.')).toBe('Only PDF files are supported.')
  })
})

describe('messageForStatus', () => {
  it('prefers the server sentence when there is one', () => {
    expect(messageForStatus(400, 'Only PDF files are supported.')).toBe(
      'Only PDF files are supported.',
    )
  })

  it('explains the upload budget when the server could not', () => {
    expect(messageForStatus(413, null)).toContain('30 MB')
  })

  it('never exposes a bare status code for the common failures', () => {
    for (const status of [400, 413, 422, 429, 500, 502, 503]) {
      expect(messageForStatus(status, null)).not.toMatch(/^Request failed/)

    }
  })
})

describe('upload budget', () => {
  it('sums files and compares against the shared limit', () => {
    const small = [{ size: 10 * 1024 * 1024 }, { size: 10 * 1024 * 1024 }]
    const big = [{ size: 20 * 1024 * 1024 }, { size: 11 * 1024 * 1024 }]

    expect(totalBytes(small)).toBeLessThan(MAX_TOTAL_UPLOAD_BYTES)
    expect(exceedsUploadBudget(small)).toBe(false)
    expect(exceedsUploadBudget(big)).toBe(true)
  })

  it('accepts what fits the remaining budget and reports the rest', () => {
    const existing = [{ size: 20 * 1024 * 1024 }]
    const incoming = [{ size: 5 * 1024 * 1024 }, { size: 20 * 1024 * 1024 }]

    const { accepted, skipped } = fitToBudget(existing, incoming)

    expect(accepted).toEqual([incoming[0]])
    expect(skipped).toEqual([incoming[1]])
  })

  it('keeps every file when the batch is under budget', () => {
    const incoming = [{ size: 1024 }, { size: 2048 }]

    const { accepted, skipped } = fitToBudget([], incoming)

    expect(accepted).toHaveLength(2)
    expect(skipped).toHaveLength(0)
  })

  it('refuses everything once the budget is already spent', () => {
    const existing = [{ size: MAX_TOTAL_UPLOAD_BYTES }]

    const { accepted, skipped } = fitToBudget(existing, [{ size: 1 }])

    expect(accepted).toHaveLength(0)
    expect(skipped).toHaveLength(1)
  })
})
