import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight, Leaf } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="tx-paper tx-contour flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <div className="tx-slate mx-auto mb-6 grid h-20 w-20 place-items-center rounded-[14px] shadow-[var(--shadow-panel)]">
          <Leaf className="h-9 w-9 text-highlight-soft" strokeWidth={1.4} />
        </div>
        <p className="eyebrow-no eyebrow-center mb-3"><b>404</b><span>Page not found</span></p>
        <h1
          className="mb-3 text-3xl font-semibold text-foreground md:text-4xl"
          style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
        >
          This path leads nowhere
        </h1>
        <p className="mx-auto mb-8 max-w-sm text-sm text-muted-foreground">
          The page you're looking for has moved or never existed. Let's get you back to the range.
        </p>
        <Link to="/" className="btn-copper">
          Return home <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
