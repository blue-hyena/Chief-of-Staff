import { getConfigStatus } from "@/lib/config";

export default function HomePage() {
  const status = getConfigStatus();

  return (
    <main className="shell">
      <section className="hero">
        <h1>AI Chief of Staff</h1>
        <p>
          This app builds a structured morning briefing digest from Google
          Calendar and Drive context, can optionally use Fireworks for
          synthesis, and then sends the result through Gmail and/or Telegram
          on a scheduled run.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Flow</h2>
          <ul>
            <li>Read the target date from the configured timezone.</li>
            <li>Collect today&apos;s meetings from the primary calendar.</li>
            <li>Extract supported attachment text from Drive.</li>
            <li>Build a deterministic or Fireworks-assisted digest.</li>
            <li>Deliver the briefing through Gmail and/or Telegram.</li>
          </ul>
        </article>

        <article className="card">
          <h2>Run</h2>
          <p>
            Call <code>/api/cron/morning-briefing</code> with the cron secret in
            an <code>Authorization</code> header or <code>x-cron-secret</code>.
            Add <code>?dryRun=true</code> to inspect the generated digest
            without sending any notifications, then bring that payload here if
            you want me to synthesize it with you manually.
          </p>
          <p>
            For Google user access, visit <code>/api/auth/google/start</code>
            once, then use <code>/api/google/workspace-test</code> to verify
            read/write access to a Drive folder.
          </p>
        </article>

        <article className="card">
          <h2>Config Status</h2>
          <ul className="env-list">
            {status.map((item) => (
              <li key={item.key}>
                <span>{item.key}</span>
                <span className={item.present ? "status-ok" : "status-missing"}>
                  {item.present ? "present" : "missing"}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </main>
  );
}
