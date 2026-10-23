// Fonty hostowane lokalnie (@fontsource), żeby build nie zależał od Google Fonts.
// Fraunces: tytuły i liczby (oś opsz), Hanken Grotesk: cały interfejs, IBM Plex Mono: identyfikatory i wymiary.
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/hanken-grotesk/index.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { Providers } from './providers';

export const metadata = {
  title: 'Portal Architekta | WallDecor',
  description: 'Portal lojalnościowy i rozliczeniowy dla Partnerów WallDecor',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className="bg-bg text-ink font-sans" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
