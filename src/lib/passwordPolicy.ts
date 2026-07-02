// Minimalne wymagania bezpieczeństwa dla haseł ustawianych przez użytkowników.
export function validatePasswordStrength(password: string): string | null {
    if (password.length < 8) return "Hasło musi mieć co najmniej 8 znaków.";
    if (!/[a-zA-Z]/.test(password)) return "Hasło musi zawierać co najmniej jedną literę.";
    if (!/[0-9]/.test(password)) return "Hasło musi zawierać co najmniej jedną cyfrę.";
    return null;
}
