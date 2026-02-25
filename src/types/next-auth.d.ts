import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            role: 'ARCHI' | 'STAFF' | 'ADMIN';
        } & DefaultSession["user"];
    }

    interface User extends DefaultUser {
        role: 'ARCHI' | 'STAFF' | 'ADMIN';
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        id: string;
        role: 'ARCHI' | 'STAFF' | 'ADMIN';
    }
}
