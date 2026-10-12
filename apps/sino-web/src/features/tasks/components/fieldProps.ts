/** The id of the error line under the control `id`, for its `aria-describedby`. */
export const errorIdOf = (id: string) => `${id}-error`

/** What a control says about its error: invalid, and described by the line under it. */
export function invalidProps(id: string, error: string | undefined) {
  return error ? { 'aria-invalid': true, 'aria-describedby': errorIdOf(id) } : {}
}
