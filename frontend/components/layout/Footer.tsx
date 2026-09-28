import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { INDIAN_STATES } from "@/constants/india";

const footerLinks = {
  explore: [
    { href: "/explore", label: "Explore India" },
    { href: "/timeline", label: "Historical Timeline" },
    { href: "/heritage", label: "Heritage Directory" },
    { href: "/ai", label: "Ask Astrova", highlight: true },
  ],
  project: [            { href: "/about", label: "About Astrova" },
    { href: "/about", label: "Our Mission" },
  ],
};

function Footer() {
  return (
    <footer className="border-t border-cream bg-deep-brown text-white">
      <Container>
        <div className="py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-3 group">
              <span className="font-display text-xl text-white group-hover:text-terracotta-light transition-colors">
                Astrova
              </span>
            </Link>
            <p className="text-sm text-white/50 max-w-sm leading-relaxed">
              Discover India. Experience Heritage — from ancient monuments to living traditions, culture, nature, and stories.
            </p>
            <p className="text-xs text-terracotta-light mt-3 font-medium">
              Culture · Heritage · Nature · Tradition
            </p>
          </div>

          {/* Explore */}
          <div>
            {/* h2 (not h4): footer is a top-level landmark, so its column
                headings must not skip levels after the page's last h2 */}
            <h2 className="text-xs font-semibold text-white/70 mb-3 uppercase tracking-wider">
              Explore
            </h2>
            <ul className="space-y-2">
              {footerLinks.explore.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className={`text-sm transition-colors ${link.highlight ? 'text-red-400 hover:text-red-300' : 'text-white/40 hover:text-terracotta-light'}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* States */}
          <div>
            <h2 className="text-xs font-semibold text-white/70 mb-3 uppercase tracking-wider">
              States
            </h2>
            <ul className="space-y-2">
              {INDIAN_STATES.map((state) => (
                <li key={state.code}>
                  <Link
                    href={`/explore?state=${encodeURIComponent(state.name)}`}
                    className="text-sm text-white/40 hover:text-terracotta-light transition-colors"
                  >
                    {state.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/30">
            &copy; {new Date().getFullYear()} Astrova. Preserving India&apos;s cultural heritage through technology.
          </p>
          <p className="text-xs text-white/30">
            Built for <span className="text-terracotta-light">India</span>, designed to scale worldwide.
          </p>
        </div>
      </Container>
    </footer>
  );
}

export { Footer };
