/** Detect if running as installed PWA (standalone mode) */
export function isPWA(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true // iOS Safari
  );
}
