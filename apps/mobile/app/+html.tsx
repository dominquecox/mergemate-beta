import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/** Web document shell. Paints the default dark surface before JS loads so refresh and loading never flash white. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ backgroundColor: "#0B0F17" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#0B0F17" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: "html,body{background-color:#0B0F17}" }} />
      </head>
      <body style={{ backgroundColor: "#0B0F17" }}>{children}</body>
    </html>
  );
}
