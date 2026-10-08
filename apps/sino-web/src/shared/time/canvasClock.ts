// The moment the "Sino UI" canvas shows: Friday 02/10/2026, 14:05 in Vietnam.
export const CANVAS_NOW = Date.parse('2026-10-02T14:05:00+07:00')

/**
 * For sample data: moves a time written as on the canvas by however long it is since the canvas moment, so a screen
 * looks current whenever it is opened and shows exactly the canvas times at 14:05.
 */
export function clockFrom(now: Date) {
  return (canvasTime: string) => new Date(Date.parse(canvasTime) + now.getTime() - CANVAS_NOW).toISOString()
}
