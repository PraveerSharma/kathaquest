import Link from "next/link";

export function SiteHeader({
  active,
}: {
  active?: "home" | "content" | "adventure" | "lesson" | "blog";
}) {
  return (
    <header className="site-header container">
      <Link aria-label="KathaQuest home" className="brand" href="/">
        <span className="brand-mark">K</span>
        KathaQuest
      </Link>
      <nav aria-label="Primary navigation" className="main-navigation">
        <Link aria-current={active === "home" ? "page" : undefined} href="/">
          Home
        </Link>
        <Link
          aria-current={active === "content" ? "page" : undefined}
          href="/content"
        >
          Explore chapters
        </Link>
        <Link
          aria-current={active === "adventure" ? "page" : undefined}
          href="/adventure"
        >
          My adventure
        </Link>
        <Link
          aria-current={active === "blog" ? "page" : undefined}
          href="/blog/kathaquest-signoz"
        >
          Build story
        </Link>
      </nav>
      <span className="trust-pill">
        <span className="dot" /> Reviewed all-ages sources
      </span>
    </header>
  );
}
