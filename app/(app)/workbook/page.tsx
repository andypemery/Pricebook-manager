import { redirect } from "next/navigation";

export default async function WorkbookPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  redirect(project ? `/projects/${encodeURIComponent(project)}/workbook` : "/projects");
}
