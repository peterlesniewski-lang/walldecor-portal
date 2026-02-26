import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
    function proxy(req) {
        const token = req.nextauth.token;
        const path = req.nextUrl.pathname;

        // Redirect admin/staff away from the architect dashboard to the admin panel
        if (path === "/dashboard" && (token?.role === "ADMIN" || token?.role === "STAFF")) {
            return NextResponse.redirect(new URL("/dashboard/admin", req.url));
        }

        // Role-Based Access Control (RBAC)
        if (path.startsWith("/dashboard/admin") && token?.role !== "ADMIN" && token?.role !== "STAFF") {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }

        if (path.startsWith("/admin") && token?.role !== "ADMIN") {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }

        if (path.startsWith("/staff") && !["STAFF", "ADMIN"].includes(token?.role as string)) {
            return NextResponse.redirect(new URL("/dashboard", req.url));
        }
    },
    {
        callbacks: {
            authorized: ({ token }) => !!token,
        },
    }
);

export const config = {
    matcher: [
        "/dashboard/:path*",
        "/projects/:path*",
        "/admin/:path*",
        "/staff/:path*",
        "/api/projects/:path*",
        "/api/wallet/:path*",
    ],
};
