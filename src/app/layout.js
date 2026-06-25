import './globals.css';

export const metadata = {
  title: 'CipherChat — Encrypted Messaging',
  description: 'End-to-end encrypted messaging app. Your messages, your privacy. No data collected.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#060a13" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔒</text></svg>" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
