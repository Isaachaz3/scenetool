/** Waits for the bundled fantasy font so canvas text is measured with it (at most 1.5 s). */
export async function loadFonts(): Promise<void> {
  if (!document.fonts?.load) return;
  await Promise.race([
    document.fonts.load('48px "Ruslan Display"').catch(() => undefined),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
}
