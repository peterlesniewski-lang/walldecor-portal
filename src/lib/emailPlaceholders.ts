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
