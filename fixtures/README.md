# Fixtures

Real map exports for checking grid auto-detection. The files are large and ignored by git;
`src/core/dpi/fixtures.test.ts` skips the cases whose file is missing.

| File | Source | Expected |
| --- | --- | --- |
| `ravnina.jpg` | Dungeon Alchemist, JPEG 7200 × 7200 | 150 DPI in JFIF and EXIF → 48 × 48 cells |
