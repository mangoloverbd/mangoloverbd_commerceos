import { lazy, type ComponentType } from "react";

type PageModule<P> = { default: ComponentType<P> };

/**
 * A route page whose code loads on demand but can also be fetched ahead of time.
 * Once the code has arrived the page renders directly, so opening it never shows
 * a loading state (React.lazy suspends once even for code that is already here).
 */
export function lazyPage<P extends object>(load: () => Promise<PageModule<P>>) {
  let Loaded: ComponentType<P> | null = null;
  let pending: Promise<PageModule<P>> | null = null;

  const preload = () => {
    pending ??= load().then(
      (module) => {
        Loaded = module.default;
        return module;
      },
      (error: unknown) => {
        // A failed download (offline, new deploy) is tried again next time.
        pending = null;
        throw error;
      },
    );
    return pending;
  };

  // React types a lazy component's props as ref-aware; it renders exactly like P.
  const Lazy = lazy(preload) as unknown as ComponentType<P>;
  function Page(props: P) {
    return Loaded ? <Loaded {...props} /> : <Lazy {...props} />;
  }
  return Object.assign(Page, { preload });
}
