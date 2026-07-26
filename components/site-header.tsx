import Link from "next/link";

export function SiteHeader({
  active,
}: {
  active?:
    | "home"
    | "content"
    | "adventure"
    | "lesson"
    | "observability"
    | "blog";
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
          aria-label="Explore chapters"
          aria-current={active === "content" ? "page" : undefined}
          href="/content"
        >
          <span aria-hidden="true" className="nav-long">
            Explore chapters
          </span>
          <span aria-hidden="true" className="nav-short">
            Chapters
          </span>
        </Link>
        <Link
          aria-label="My adventure"
          aria-current={active === "adventure" ? "page" : undefined}
          href="/adventure"
        >
          <span aria-hidden="true" className="nav-long">
            My adventure
          </span>
          <span aria-hidden="true" className="nav-short">
            Adventure
          </span>
        </Link>
        <Link
          aria-label="Mission control"
          aria-current={active === "observability" ? "page" : undefined}
          href="/observability"
        >
          <span aria-hidden="true" className="nav-long">
            Mission control
          </span>
          <span aria-hidden="true" className="nav-short">
            Dashboard
          </span>
        </Link>
        <Link
          aria-label="Build story"
          aria-current={active === "blog" ? "page" : undefined}
          href="/blog/kathaquest-signoz"
        >
          <span aria-hidden="true" className="nav-long">
            Build story
          </span>
          <span aria-hidden="true" className="nav-short">
            Story
          </span>
        </Link>
      </nav>
      <span className="trust-pill">
        <span className="dot" /> Reviewed all-ages sources
      </span>
    </header>
  );
}
