"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import type { User } from "@prisma/client";
import { brandingConfig } from "@/config/branding.config";
import { canShowNavigationItem, navigationItems, settingsNavigationGroups } from "@/config/navigation.config";
import { logoutAction } from "@/lib/actions/auth.actions";

export const sidebarCollapseStorageKey = "axiom-sidebar-collapsed";

export function sidebarClassName(mobileOpen: boolean, collapsed: boolean) {
  return `sidebar${mobileOpen ? " open" : ""}${collapsed ? " collapsed" : ""}`;
}

function roleLabel(role: User["role"]) {
  if (role === "AXIOM_ADMIN") return "Axiom Administrator";
  if (role === "CUSTOMER_ADMIN") return "Customer Administrator";
  if (role === "SUPER_USER") return "Super User";
  return "View Only";
}

export function AppShell({
  children,
  user,
  tenantName,
  themePreference = "dark",
  smallLogoPath
}: {
  children: React.ReactNode;
  user: Pick<User, "role" | "permissions" | "firstName" | "surname">;
  tenantName: string | null;
  themePreference?: string;
  smallLogoPath: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const visible = navigationItems.filter((link) => canShowNavigationItem(link, user));
  const settingsHrefs = settingsNavigationGroups.flatMap((group) => group.items.map((item) => item.href));
  const themeClass = themePreference === "light" ? "theme-light" : themePreference === "system" ? "theme-system" : "theme-dark";
  const userName = `${user.firstName} ${user.surname}`.trim();
  const accountDetails = tenantName ? `${roleLabel(user.role)} · ${tenantName}` : roleLabel(user.role);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setCollapsed(window.localStorage.getItem(sidebarCollapseStorageKey) === "true");
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarCollapseStorageKey, String(next));
      return next;
    });
  }

  return (
    <div className={`shell ${themeClass}`}>
      <aside className={sidebarClassName(mobileOpen, collapsed)}>
        <button className="sidebarToggle" type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand menu" : "Collapse menu"} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight aria-hidden="true" size={18} /> : <ChevronLeft aria-hidden="true" size={18} />}
        </button>
        <Link href="/dashboard" className="brand" onClick={() => setMobileOpen(false)} aria-label={brandingConfig.appDisplayName}>
          <Image src={smallLogoPath} alt="Axiom" width={42} height={42} />
          <span><strong>{brandingConfig.appDisplayName}</strong></span>
        </Link>
        <Link href="/settings#account" className="sidebarIdentity" title={`${userName} — ${accountDetails}`} aria-label={`Signed in as ${userName}, ${accountDetails}`} onClick={() => setMobileOpen(false)}>
          <span className="sidebarAvatar" aria-hidden="true">{user.firstName.charAt(0)}{user.surname.charAt(0)}</span>
          <span className="sidebarIdentityText"><strong>{userName}</strong><small>{accountDetails}</small></span>
          <span className="navTooltip" role="tooltip">{userName} — {accountDetails}</span>
        </Link>
        <nav className="sidebarNav" aria-label="Main navigation">
          {visible.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href
              || (link.href !== "/dashboard" && pathname.startsWith(`${link.href}/`))
              || (link.href === "/settings" && settingsHrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`)));
            return (
              <Link key={link.href} href={link.href} className={active ? "active" : undefined} aria-label={link.label} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)}>
                <Icon aria-hidden="true" className="navIcon" />
                <span className="navLabel">{link.label}</span>
                <span className="navTooltip" role="tooltip">{link.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebarFooter">
          <form className="sidebarLogout" action={logoutAction}>
            <button type="submit">
              <LogOut aria-hidden="true" className="navIcon" />
              <span className="navLabel">Logout</span>
              <span className="navTooltip" role="tooltip">Logout</span>
            </button>
          </form>
        </div>
      </aside>
      <main>
        <button className="menuButton" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-label={mobileOpen ? "Close menu" : "Open menu"}>
          {mobileOpen ? <X aria-hidden="true" size={18} /> : <Menu aria-hidden="true" size={18} />}
          <span>Menu</span>
        </button>
        {children}
      </main>
    </div>
  );
}
