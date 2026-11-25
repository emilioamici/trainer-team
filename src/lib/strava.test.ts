import { describe, expect, it } from 'vitest'
import { extractStravaUrl } from './strava'
import { parseFeedback } from './db'

describe('link Strava', () => {
  it.each([
    ['https://www.strava.com/activities/12345678901', 'https://www.strava.com/activities/12345678901'],
    ['strava.com non ha schema: https://strava.com/activities/99', 'https://strava.com/activities/99'],
    ['Guarda la mia corsa! https://strava.app.link/AbC123xyz. Ciao', 'https://strava.app.link/AbC123xyz'],
    ['http://www.strava.com/activities/5?utm=1#x', 'https://www.strava.com/activities/5?utm=1'],
  ])('%s', (raw, out) => expect(extractStravaUrl(raw)).toBe(out))
  it('rifiuta altri siti, schemi pericolosi, domini ingannevoli e vuoti', () => {
    for (const bad of ['', 'ciao', 'https://example.com/activities/1', 'javascript:alert(1)', 'https://strava.com.evil.example/activities/1', 'https://evilstrava.com/a/1', 'https://www.strava.com/']) {
      expect(extractStravaUrl(bad)).toBeNull()
    }
  })
  it('il feedback conserva solo link validi', () => {
    expect(parseFeedback({ stravaUrl: 'https://www.strava.com/activities/1' })?.stravaUrl).toBe('https://www.strava.com/activities/1')
    expect(parseFeedback({ stravaUrl: 'javascript:alert(1)' })?.stravaUrl).toBeUndefined()
    expect(parseFeedback({ stravaUrl: 'https://evil.example/x' })?.stravaUrl).toBeUndefined()
  })
})
