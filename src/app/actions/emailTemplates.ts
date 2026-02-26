'use server';

import { query } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export async function getEmailTemplates() {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    return await query<any>("SELECT * FROM email_templates ORDER BY name ASC");
}

export async function updateEmailTemplate(id: string, data: {
    subject: string,
    content: string,
    is_active: boolean
}) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    await query(
        "UPDATE email_templates SET subject = ?, content = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [data.subject, data.content, data.is_active ? 1 : 0, id]
    );

    revalidatePath('/dashboard/admin/settings/emails');
    return { success: true };
}

export async function testEmailTemplate(id: string, testEmail: string) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== 'ADMIN' && session.user.role !== 'STAFF')) {
        throw new Error("Unauthorized");
    }

    const templates = await query<any>("SELECT slug FROM email_templates WHERE id = ?", [id]);
    if (templates.length === 0) throw new Error("Template not found");

    const slug = templates[0].slug;

    // Default test placeholders
    const placeholders = {
        user_name: "Użytkownik Testowy",
        project_name: "Projekt Testowy",
        client_label: "Firma Testowa",
        card_code: "TEST-CARD-123",
        amount: "100.00"
    };

    return await sendEmail(slug, testEmail, placeholders);
}
