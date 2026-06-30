"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import type { User } from "@prisma/client";
import { brandingConfig } from "@/config/branding.config";
import { canShowNavigationItem, navigationItems, settingsNavigationGroups } from "@/config/navigation.config";

export function AppShell({
  children,
  user,
  themePreference = "dark",
  smallLogoPath
}: {
  children: React.ReactNode;
  user: Pick<User, "role" | "permissions">;
  themePreference?: string;
  smallLogoPath: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const visible = navigationItems.filter((link) => canShowNavigationItem(link, user));
  const settingsHrefs = settingsNavigationGroups.flatMap((group) => group.items.map((item) => item.href));
  const themeClass = themePreference === "light" ? "theme-light" : themePreference === "system" ? "theme-system" : "theme-dark";
  return (
    <div className={`shell ${themeClass}`}>
      <aside className={open ? "sidebar open" : "sidebar"}>
        <Link href="/dashboard" className="brand" onClick={() => setOpen(false)}>
          <Image src={smallLogoPath} alt="Axiom" width={42} height={42} />
          <span>
            <strong>{brandingConfig.appDisplayName}</strong>
            <small>Axiom workspace</small>
          </span>
        </Link>
        <div className="sidebarAccess">{user.role.replaceAll("_", " ")} access</div>
        <nav>
          {visible.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`)) || (link.href === "/settings" && settingsHrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`)));
            return (
              <Link key={link.href} href={link.href} className={active ? "active" : undefined} onClick={() => setOpen(false)}>
                <Icon aria-hidden="true" className="navIcon" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main>
        <button className="menuButton" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"}>
          {open ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
          <span>Menu</span>
        </button>
        {children}
      </main>
    </div>
  );
}
