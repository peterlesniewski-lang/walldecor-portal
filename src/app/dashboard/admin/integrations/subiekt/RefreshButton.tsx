'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

/** Ponowny odczyt strony z bazy (np. po wieczornej synchronizacji) bez przeładowania przeglądarki. */
export default function RefreshButton() {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    return (
        <Button
            size="sm"
            variant="secondary"
            loading={pending}
            icon={<RefreshCw size={14} aria-hidden="true" />}
            onClick={() => startTransition(() => router.refresh())}
        >
            Odśwież
        </Button>
    );
}
