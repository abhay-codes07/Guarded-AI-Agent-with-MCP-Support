import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Guardrails Console',
  description: 'Policy and guardrails control plane for a guarded AI agent with MCP support',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
