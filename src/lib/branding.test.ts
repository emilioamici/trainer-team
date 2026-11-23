import { describe, expect, it } from 'vitest'
import {
  findScheduleConflicts,
  formatSchedule,
  getGroupColor,
  getGroupIcon,
  parseScheduleToSlots,
  type ScheduleSlot,
} from './branding'

describe('branding & schedule helpers', () => {
  it('formats schedule slots correctly', () => {
    const slots: ScheduleSlot[] = [
      { id: '1', day: 'Lunedì', startTime: '15:30', endTime: '17:00' },
      { id: '2', day: 'Mercoledì', startTime: '16:00', endTime: '17:30' },
    ]
    expect(formatSchedule(slots)).toBe('Lun 15:30-17:00, Mer 16:00-17:30')
  })

  it('parses text schedule into slots', () => {
    const parsed = parseScheduleToSlots('Lun 15:30-17:00, Ven 16:00-17:30')
    expect(parsed.length).toBe(2)
    expect(parsed[0].day).toBe('Lunedì')
    expect(parsed[0].startTime).toBe('15:30')
    expect(parsed[0].endTime).toBe('17:00')
    expect(parsed[1].day).toBe('Venerdì')
  })

  it('detects schedule conflicts between groups on same day and overlapping time', () => {
    const currentSlots: ScheduleSlot[] = [
      { id: '1', day: 'Lunedì', startTime: '15:30', endTime: '17:00' },
    ]

    const otherGroups = [
      {
        id: 'group-2',
        name: 'U14 Agonistica',
        scheduleSlots: [
          { id: 's2', day: 'Lunedì', startTime: '16:00', endTime: '17:30' },
        ],
      },
      {
        id: 'group-3',
        name: 'U12 Perfezionamento',
        scheduleSlots: [
          { id: 's3', day: 'Martedì', startTime: '15:30', endTime: '17:00' },
        ],
      },
    ]

    const conflicts = findScheduleConflicts(currentSlots, otherGroups, 'group-1')
    expect(conflicts.length).toBe(1)
    expect(conflicts[0].conflictingGroupName).toBe('U14 Agonistica')
    expect(conflicts[0].conflictingTime).toBe('16:00 - 17:30')
  })

  it('does not flag conflict if times do not overlap', () => {
    const currentSlots: ScheduleSlot[] = [
      { id: '1', day: 'Lunedì', startTime: '15:00', endTime: '16:00' },
    ]

    const otherGroups = [
      {
        id: 'group-2',
        name: 'U14 Agonistica',
        scheduleSlots: [
          { id: 's2', day: 'Lunedì', startTime: '16:00', endTime: '17:30' },
        ],
      },
    ]

    const conflicts = findScheduleConflicts(currentSlots, otherGroups, 'group-1')
    expect(conflicts.length).toBe(0)
  })

  it('returns default color and icon when none specified', () => {
    const groupColor = getGroupColor(undefined, true)
    expect(groupColor.id).toBe('blue')

    const athleteColor = getGroupColor(undefined, false)
    expect(athleteColor.id).toBe('yellow')

    const icon = getGroupIcon(undefined, true)
    expect(icon).toBeDefined()
  })
})
