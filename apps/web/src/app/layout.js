import './globals.css';

export const metadata = {
  title: 'News for Stocks — control panel',
  description: 'Configure the keywords, filters, and sources behind the WhatsApp alert bot.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
