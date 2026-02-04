import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'tinycrab',
  description: 'Spawn AI Agents in Seconds',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Don't render html/body here - let locale layout handle it
  return children;
}
