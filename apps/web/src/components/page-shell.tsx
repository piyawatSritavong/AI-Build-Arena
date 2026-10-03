import type { ReactNode } from "react";

/**
 * Screen layout (Duolingo-style): back at top-left, optional menu at top-right,
 * sticky action bar at the bottom: secondary on the left, the next step (primary) on the right.
 */
export function PageShell({
  back,
  topRight,
  footerLeft,
  footerRight,
  width = "max-w-3xl",
  children,
}: {
  back?: ReactNode;
  topRight?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className={`mx-auto flex w-full ${width} items-center justify-between gap-2 px-4 pt-4`}>
        <div>{back}</div>
        {topRight && <nav aria-label="Menu" className="flex flex-wrap justify-end gap-2">{topRight}</nav>}
      </header>
      <main className={`mx-auto w-full ${width} flex-1 px-4 py-6`}>{children}</main>
      {(footerLeft || footerRight) && (
        <footer className="sticky bottom-0 mt-auto border-t border-foreground/10 bg-background/95 backdrop-blur">
          <div className={`mx-auto flex w-full ${width} items-center justify-between gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}>
            <div className="flex flex-wrap gap-2">{footerLeft}</div>
            <div className="flex flex-wrap justify-end gap-2">{footerRight}</div>
          </div>
        </footer>
      )}
    </div>
  );
}
