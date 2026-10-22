import { redirect } from 'next/navigation';

// Legacy routes (/admin, /admin/dashboard, ...) — active admin panel lives at /dashboard/admin
export default function LegacyAdminRedirect() {
    redirect('/dashboard/admin');
}
