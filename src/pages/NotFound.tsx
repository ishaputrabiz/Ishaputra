import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight, Leaf } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";

const NotFound = () => {
  const location = useLocation();

  usePageMeta({ title: "Page not found", noindex: true });

  useEffect(() => {
    console.warn("404: no route for", location.pathname);
  }, [location.pathname]);

  return (
    <main id="main" tabIndex={-1} className="tx-paper relative flex min-h-screen items-center justify-center overflow-hidden px-6 outline-none">
      {/* Contour rings only behind the message, not across the whole screen */}
      <div aria-hidden="true" className="tx-contour pointer-events-none absolute inset-0 m-auto max-h-[70vh] max-w-3xl" />
      <div className="relative text-center">
        <div className="tx-slate mx-auto mb-6 grid h-20 w-20 place-items-center rounded-card shadow-panel ring-1 ring-highlight-soft/25 dark:bg-card">
          <Leaf aria-hidden="true" className="size-9 text-highlight-soft" />
        </div>
        <p className="eyebrow-no eyebrow-center mb-3"><b>404</b><span>Page not found</span></p>
        <h1 className="mb-3 font-heading text-3xl font-semibold tracking-tight text-foreground [text-wrap:balance] md:text-4xl">
          This path leads nowhere
        </h1>
        <p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
          The page you&rsquo;re looking for has moved or never existed. Let&rsquo;s get you back to the range.
        </p>
        <Link to="/" className="btn-copper">
          Return home <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
    </main>
  );
};

export default NotFound;
