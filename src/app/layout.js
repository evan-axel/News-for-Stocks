export const metadata = {
  title: 'Small Cap Stock Scanner',
  description: 'Search and monitor small cap stocks and related news',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
