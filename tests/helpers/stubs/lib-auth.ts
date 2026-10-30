// Atrapa `@/lib/auth` dla testów server actions — prawdziwy moduł buduje providery next-auth (CJS),
// których domyślny eksport nie działa przy imporcie ESM w `node --test`. Sesję daje atrapa next-auth.
export const authOptions = {};
