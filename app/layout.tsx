import "./globals.css";

export const metadata = {
  title: "Axiom Data Mapper",
  description: "Business application for managing pricebook imports and exports."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
