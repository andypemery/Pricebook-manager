export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canShowNavigationItem, settingsNavigationGroups } from "@/config/navigation.config";
import { brandingStatus, getTenantBranding } from "@/lib/branding";

export default async function SettingsPage() {
  const user = await requireUser();
  const branding = await getTenantBranding(user.tenantId);
  const visibleGroups = settingsNavigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canShowNavigationItem(item, user)).map((item) => item.href === "/admin/branding" ? { ...item, status: brandingStatus(branding) } : item)
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <section className="hero">
        <p className="breadcrumb">Settings</p>
        <h1>Settings</h1>
        <p>Manage the areas available to your role, including customer settings, support, security reporting and GDPR features.</p>
      </section>

      {visibleGroups.map((group) => (
        <section className="card" key={group.label}>
          <div className="sectionHeader">
            <h2>{group.label}</h2>
          </div>
          <div className="grid">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link className="settingsTile" href={item.href} key={item.href}>
                  <span className="tileIcon"><Icon aria-hidden="true" width={20} height={20} /></span>
                  <span className="tileContent">
                    <span className="tileTitle">{item.label}</span>
                    <span className="muted">{item.description}</span>
                    {item.status ? <span className="badge">{item.status}</span> : null}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {visibleGroups.length === 0 ? (
        <section className="card">
          <h2>No settings available</h2>
          <p className="muted">Your current role does not include access to any settings areas.</p>
        </section>
      ) : null}
    </>
  );
}
