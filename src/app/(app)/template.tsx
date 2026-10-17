/** Each screen settles in with a short fade (see .screen-in in globals.css; off for reduced motion). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="screen-in">{children}</div>;
}
