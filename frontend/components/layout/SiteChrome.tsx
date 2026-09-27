"use client";

import { usePathname } from "next/navigation";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

/**
 * Public-site chrome (Navbar + main + Footer).
 *
 * Admin routes (/admin) get NO site chrome: the admin portal renders its
 * own dedicated shell, so the public navigation — including any signed-in
 * user chip — never appears inside the admin experience.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminRoute) {
    // Admin layout provides its own <main> + chrome.
    return <>{children}</>;
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
