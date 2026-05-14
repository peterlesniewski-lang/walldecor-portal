export type AppRole = 'ADMIN' | 'STAFF' | 'ARCHI' | string | null | undefined;

export function canRegisterArchitects(role: AppRole): boolean {
    return role === 'ADMIN' || role === 'STAFF';
}

export function canManageOperationalProjects(role: AppRole): boolean {
    return role === 'ADMIN' || role === 'STAFF';
}

export function canManageFinancialOperations(role: AppRole): boolean {
    return role === 'ADMIN';
}

export function canUpdateSystemSettings(role: AppRole): boolean {
    return role === 'ADMIN';
}
