import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ghostify — Private MON transfers', description: 'Stealth-address payments on Monad Testnet' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
