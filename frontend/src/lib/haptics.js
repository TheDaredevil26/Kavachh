const PATTERNS = { selection: 10, success: [10, 30, 10], error: 30 };
export function haptic(kind) {
  if (localStorage.getItem('kavach_vibration') === 'off') return;
  navigator.vibrate?.(PATTERNS[kind] ?? 10);
}
