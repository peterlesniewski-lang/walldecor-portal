'use client';

import { Card, CardBody, CardHeader, EmptyState } from '@/components/ui';
import AddItemForm from './AddItemForm';
import ItemRow from './ItemRow';
import { TH_CLASS } from './styles';
import type { ProjectItem } from './types';

interface Props {
    projectId: string;
    items: ProjectItem[];
    isAdmin: boolean;
    isFinalized: boolean;
    /** Przełącznik typu pozycji z Subiekta (canManageFinancialOperations, projekt nie NIEZREALIZOWANY). */
    canOverrideType: boolean;
}

export default function ItemsCard({ projectId, items, isAdmin, isFinalized, canOverrideType }: Props) {
    // Produkty najpierw, potem montaż
    const sorted = [...items].sort((a, b) => (a.type === b.type ? 0 : a.type === 'PRODUCT' ? -1 : 1));

    return (
        <Card as="section" className="overflow-hidden">
            <CardHeader title={`Pozycje projektu (${items.length})`} />

            {sorted.length === 0 ? (
                <CardBody>
                    <EmptyState
                        title="Brak pozycji"
                        description={isAdmin && !isFinalized ? 'Dodaj pierwszą pozycję, aby naliczyć prowizję.' : undefined}
                    />
                </CardBody>
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[720px] border-collapse text-sm">
                        <thead>
                            <tr>
                                <th scope="col" className={TH_CLASS}>Kategoria</th>
                                <th scope="col" className={TH_CLASS}>Typ</th>
                                <th scope="col" className={TH_CLASS}>Płatność</th>
                                <th scope="col" className={`${TH_CLASS} text-right`}>Kwota netto</th>
                                <th scope="col" className={`${TH_CLASS} text-right`}>
                                    <span className="sr-only">Akcje</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((item) => (
                                <ItemRow key={item.id} item={item} canEdit={isAdmin} isFinalized={isFinalized} canOverrideType={canOverrideType} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isAdmin && !isFinalized && <AddItemForm projectId={projectId} />}
        </Card>
    );
}
