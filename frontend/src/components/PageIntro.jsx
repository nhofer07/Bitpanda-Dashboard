// Shared, quiet introduction. Page titles are owned by the application shell.
export default function PageIntro({ children, className = '' }) {
  return <section className={`page-intro ${className}`}>{children}</section>;
}
