import type { Metadata } from "next";
import "./globals.css";
import "./release.css";
import "./catalog.css";
import "./matches.css";
import "./application-profile.css";
import "./application-fill.css";
import "./automation.css";
import "./ai-studio.css";
import "./job-workspace.css";
export const metadata: Metadata = {
  title: "JobCompass — Your next chapter",
  description:
    "Discover company jobs, build your shortlist and track applications in your personal workspace.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
