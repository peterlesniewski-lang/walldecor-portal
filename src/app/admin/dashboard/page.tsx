import { redirect } from 'next/navigation';

// Legacy route — active admin panel moved to /dashboard/admin
export default function LegacyAdminDashboard() {
    redirect('/dashboard/admin');
}
