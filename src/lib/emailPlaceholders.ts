type ArchitectRegisteredInput = {
    userName: string;
    email: string;
    password: string;
    portalUrl: string;
};

export function buildArchitectRegisteredPlaceholders(input: ArchitectRegisteredInput): Record<string, string> {
    return {
        user_name: input.userName,
        email: input.email,
        password: input.password,
        portal_url: input.portalUrl,
    };
}

type ArchitectInvitedInput = {
    userName: string | null;
    email: string;
    inviteLink: string;
    expiresAt: string;
    portalUrl: string;
};

/** Placeholdery szablonu ARCHITECT_INVITED (zaproszenie z linkiem aktywacyjnym, bez hasła). */
export function buildArchitectInvitedPlaceholders(input: ArchitectInvitedInput): Record<string, string> {
    return {
        user_name: input.userName || input.email,
        email: input.email,
        invite_link: input.inviteLink,
        expires_at: input.expiresAt,
        portal_url: input.portalUrl,
    };
}
