export function emailError(value: string): string | undefined {
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ||
    value.trim().length > 254
  )
    return "Enter a valid email address.";
}

export function passwordError(
  value: string,
  isNew = false,
): string | undefined {
  if (!value) return "Enter your password.";
  if (new TextEncoder().encode(value).length > 72)
    return "Use a password no longer than 72 UTF-8 bytes.";
  if (isNew && [...value].length < 8) return "Use at least 8 characters.";
}

export function nameError(value: string): string | undefined {
  if (!value.trim() || [...value.trim()].length > 100)
    return "Enter a name between 1 and 100 characters.";
}
