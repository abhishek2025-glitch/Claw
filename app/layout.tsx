import type {Metadata} from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'AgentShield Logger',
  description: 'Universal Agent Activity Monitor & Safety Observer for OpenClaw, Hermes, and autonomous AI agents.',
  openGraph: {
    title: 'AgentShield Logger',
    description: 'Universal Agent Activity Monitor & Safety Observer for OpenClaw, Hermes, and autonomous AI agents.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning className="bg-gray-50 text-gray-900 font-sans antialiased">{children}</body>
    </html>
  );
}
