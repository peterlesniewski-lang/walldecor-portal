export interface Project {
    id: string;
    name: string;
    status: string;
    client_label: string;
    owner_id: string;
    architect_name: string;
    architect?: {
        name: string;
        email: string;
        studio_name?: string | null;
        nip?: string | null;
        address?: string | null;
        bank_account?: string | null;
        is_vat_payer?: boolean;
    } | null;
    payout?: {
        id: string;
        amount: number;
        status: string;
        invoice_url?: string | null;
        created_at: string;
    } | null;
}

export interface ProjectItem {
    id: string;
    project_id: string;
    type: 'PRODUCT' | 'INSTALLATION';
    category: string;
    description: string | null;
    amount_net: number;
    order_number: string | null;
    invoice_number: string | null;
    is_paid: number | boolean;
    /** 'MANUAL' (panel, import) lub 'SUBIEKT' (synchronizacja — bez edycji ręcznej). */
    source?: string | null;
    /** 1, gdy admin ręcznie zmienił typ pozycji z Subiekta (synchronizacja go nie nadpisuje). */
    type_overridden?: number | boolean | null;
}

export interface Commission {
    id: string;
    project_item_id: string;
    amount_net: number;
    status: string;
    category: string;
    item_amount: number;
    note?: string;
}
