import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/providers';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';

export const metadata: Metadata = {
  title: 'Predictive Consistent Hashing — Load Balancing Dashboard',
  description: 'Real-time monitoring dashboard for the Predictive Adaptive Request Allocation Framework',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen noise" suppressHydrationWarning>
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 ml-[260px] flex flex-col">
              <TopBar />
              <div className="flex-1 p-6">
                {children}
              </div>
            </main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
