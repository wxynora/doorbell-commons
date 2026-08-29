import type { AuthIssue, HumanIdentity } from "../auth/auth-client";
import { RegistrationFlow } from "./registration-flow";

interface AuthScreenProps {
  initialIssue: AuthIssue | null;
  onAuthenticated: (identity: HumanIdentity) => void;
  onRegistered: (identity: HumanIdentity) => void;
}

function DoorbellMark() {
  return (
    <span className="doorbell-mark" aria-hidden="true">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d="M18 8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v1Z" />
        <path d="M5 15a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4Z" />
      </svg>
    </span>
  );
}

export function RegistrationHeader() {
  return (
    <header className="registration-page__header">
      <DoorbellMark />
      <div>
        <h1>Doorbell Commons</h1>
        <p className="handwritten registration-page__tagline">Welcome home, neighbor.</p>
      </div>
    </header>
  );
}

export function SessionCheckingScreen() {
  return (
    <div className="registration-page registration-page--checking">
      <main className="registration-page__main">
        <RegistrationHeader />
        <section className="registration-page__sheet session-check" role="status">
          <p>正在确认登录状态……</p>
        </section>
      </main>
    </div>
  );
}

export function AuthScreen({ initialIssue, onAuthenticated, onRegistered }: AuthScreenProps) {
  return (
    <div className="registration-page">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>

      <main className="registration-page__main" id="main-content">
        <RegistrationHeader />

        <section className="registration-page__sheet" aria-label="Doorbell Commons registration">
          <RegistrationFlow
            initialIssue={initialIssue}
            onAuthenticated={onAuthenticated}
            onRegistered={onRegistered}
          />
        </section>
      </main>
    </div>
  );
}
