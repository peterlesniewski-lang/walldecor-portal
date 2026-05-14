import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type HelpRole = 'ARCHI' | 'STAFF' | 'ADMIN';

export type HelpDocument = {
    role: HelpRole;
    title: string;
    fileName: string;
    relativePath: string;
};

const HELP_DOCUMENTS: Record<HelpRole, HelpDocument> = {
    ARCHI: {
        role: 'ARCHI',
        title: 'Pomoc dla architekta',
        fileName: 'archi.md',
        relativePath: 'docs/help/archi.md',
    },
    STAFF: {
        role: 'STAFF',
        title: 'Pomoc dla STAFF',
        fileName: 'staff.md',
        relativePath: 'docs/help/staff.md',
    },
    ADMIN: {
        role: 'ADMIN',
        title: 'Pomoc dla ADMIN',
        fileName: 'admin.md',
        relativePath: 'docs/help/admin.md',
    },
};

export function getHelpDocumentForRole(role: string | null | undefined): HelpDocument {
    if (role === 'ADMIN' || role === 'STAFF' || role === 'ARCHI') {
        return HELP_DOCUMENTS[role];
    }

    return HELP_DOCUMENTS.ARCHI;
}

export async function readHelpMarkdownForRole(role: string | null | undefined): Promise<{
    document: HelpDocument;
    markdown: string;
}> {
    const document = getHelpDocumentForRole(role);
    const absolutePath = path.join(process.cwd(), 'docs', 'help', document.fileName);
    const markdown = await readFile(absolutePath, 'utf8');

    return { document, markdown };
}
