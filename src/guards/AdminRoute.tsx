import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminRouteProps {
  children: React.ReactNode;
}

/** The admin shell's shape (sidebar rail + top bar) while access is checked. */
const AdminShellSkeleton = () => (
  <div aria-busy="true" className="min-h-screen bg-background">
    <span className="sr-only" role="status">Checking admin access</span>
    <div aria-hidden="true" className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <Skeleton className="h-6 w-28" />
      </div>
      <div className="flex flex-col gap-1 px-3 py-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
    <div aria-hidden="true" className="lg:ml-64">
      <div className="flex h-16 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-4 lg:px-6">
        <Skeleton className="size-9 lg:hidden" />
        <Skeleton className="hidden h-10 w-full max-w-md md:block" />
        <Skeleton className="size-8 rounded-full" />
      </div>
      <div className="flex flex-col gap-4 p-4 lg:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
    </div>
  </div>
);

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, userProfile, loading, isAdmin } = useAuth();
  const location = useLocation();

  // Show loading state while checking auth
  if (loading) {
    return <AdminShellSkeleton />;
  }

  // Redirect to admin login if not authenticated
  if (!user) {
    return <Navigate to="/admin" state={{ from: location }} replace />;
  }

  // Show access denied if user is not admin
  if (!isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="panel mx-auto w-full max-w-md bg-card p-8 text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-status-danger-bg text-status-danger-fg">
            <ShieldX aria-hidden="true" className="size-7" />
          </div>
          <h1
            className="mb-3 text-2xl font-semibold tracking-tight"
            style={{ fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' }}
          >
            Access denied
          </h1>
          <p className="mb-6 text-sm text-muted-foreground [text-wrap:pretty]">
            You do not have permission to open the admin panel. This area is for administrators only.
          </p>
          <div className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <a href="/">Go to homepage</a>
            </Button>
            <Button variant="outline" className="w-full" onClick={() => window.history.back()}>
              Go back
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return <>{children}</>;
};

export default AdminRoute;
