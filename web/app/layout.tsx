import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "chat-chat",
  description: "Conversations between two language models",
};

const NAV = [
  ["/", "conversations"],
  ["/findings", "findings"],
  ["/models", "models"],
  ["/experiments", "experiments"],
  ["/search", "search"],
  ["/keepers", "keepers"],
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-20 border-b border-line-soft bg-bg/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-5 px-5">
            <Link href="/" className="flex items-center gap-2.5 text-[15px] font-medium tracking-tight">
              <span className="flex gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#4d6bfe]" />
              </span>
              chat-chat
            </Link>
            <nav className="flex items-center gap-4 text-[13px] text-faint">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="hover:text-ink">
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl grow px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
