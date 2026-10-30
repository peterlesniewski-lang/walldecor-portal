// Atrapa `next/cache` dla testów server actions (poza żądaniem Next.js revalidatePath rzuca).
export function revalidatePath(): void {}
export function revalidateTag(): void {}
