import { beforeEach, describe, expect, it } from 'vitest'
import {
  isTutorialCompleted,
  markTutorialCompleted,
  resetTutorialCompleted,
} from './TutorialModal'

describe('TutorialModal storage helpers', () => {
  beforeEach(() => {
    resetTutorialCompleted()
  })

  it('detects uncompleted tutorial initially', () => {
    expect(isTutorialCompleted()).toBe(false)
  })

  it('marks tutorial as completed and updates storage', () => {
    markTutorialCompleted()
    expect(isTutorialCompleted()).toBe(true)
  })

  it('resets tutorial completion state', () => {
    markTutorialCompleted()
    expect(isTutorialCompleted()).toBe(true)
    resetTutorialCompleted()
    expect(isTutorialCompleted()).toBe(false)
  })
})
