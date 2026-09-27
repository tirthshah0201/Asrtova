import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin Portal",
  description: "Astrova administration portal — manage heritage, media, locations, sources, users, collections, and periods.",
  robots: { index: false, follow: false },
};

/**
 * Dedicated admin layout.
 *
 * The root layout's SiteChrome skips /admin routes, so this layout is the
 * outermost shell for the admin portal — its own page background, its own
 * title, and no public-site navigation.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-[#f7f4ef] text-charcoal">
      {/* The admin page shell provides its own single <main> landmark. */}
      {children}
    </div>
  );
}
