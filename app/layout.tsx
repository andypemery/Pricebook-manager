import "./globals.css";
export const metadata = { title: "Axiom Standard Base App", description: "Reusable Axiom app foundation" };
export default function RootLayout({children}:{children:React.ReactNode}){ return <html lang="en"><body>{children}</body></html>; }
