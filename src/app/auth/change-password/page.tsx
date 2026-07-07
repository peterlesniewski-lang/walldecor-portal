import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { authOptions } from '@/lib/auth';
import ChangePasswordForm from './ChangePasswordForm';

export default async function ChangePassword() {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect('/auth/signin');
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-primary/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-md relative z-10">
                <div className="text-center mb-12">
                    <div className="w-16 h-16 gold-gradient rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-[0_20px_40px_rgba(212,175,55,0.2)]">
                        <KeyRound size={32} className="text-black" />
                    </div>
                    <h1 className="text-3xl font-black text-stone-900 tracking-tight leading-none mb-3">
                        Zmień hasło
                    </h1>
                    <p className="text-stone-500 font-bold text-sm uppercase tracking-widest">
                        Panel Architekta <span className="text-brand-primary mx-1">/</span> WallDecor
                    </p>
                </div>

                <ChangePasswordForm />
            </div>
        </div>
    );
}
