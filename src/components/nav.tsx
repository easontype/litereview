"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "搜尋" },
  { href: "/workspace", label: "工作區" },
  { href: "/compare", label: "比較" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <nav className="mx-auto flex h-14 max-w-4xl items-center gap-6 px-4">
        <span className="text-[15px] font-extrabold tracking-tight">litereview</span>
        <ul className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`inline-flex h-14 items-center border-b-2 px-3 text-sm transition-colors ${
                    active
                      ? "border-foreground font-medium text-foreground"
                      : "border-transparent text-foreground/55 hover:text-foreground/80"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
