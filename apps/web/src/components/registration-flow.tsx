import { useState } from "react";
import { type AuthIssue, createHumanSession, type HumanIdentity } from "../auth/auth-client";
import {
  type FirstRegistrationCredentials,
  type HumanCredentials,
  RegistrationEntry,
} from "./registration-entry";
import { RegistrationProfileForm } from "./registration-profile-form";

interface RegistrationFlowProps {
  initialIssue: AuthIssue | null;
  onAuthenticated: (identity: HumanIdentity) => void;
  onRegistered: (identity: HumanIdentity) => void;
}

type RegistrationStage =
  | { name: "credentials" }
  | { name: "profile"; credentials: FirstRegistrationCredentials };

export function RegistrationFlow({
  initialIssue,
  onAuthenticated,
  onRegistered,
}: RegistrationFlowProps) {
  const [stage, setStage] = useState<RegistrationStage>({ name: "credentials" });
  const [issue, setIssue] = useState<AuthIssue | null>(initialIssue);
  const [pending, setPending] = useState(false);

  async function submitCredentials(credentials: HumanCredentials) {
    setIssue(null);
    setPending(true);
    const result = await createHumanSession(
      credentials.mode === "login"
        ? { qq_number: credentials.qqNumber, password: credentials.password }
        : {
            qq_number: credentials.qqNumber,
            registration_code: credentials.registrationCode,
          },
    );
    setPending(false);

    if (result.ok) {
      onAuthenticated(result.identity);
      return;
    }

    if (
      credentials.mode === "registration" &&
      result.issue.code === "registration_profile_required"
    ) {
      setStage({ name: "profile", credentials });
      return;
    }

    setIssue(result.issue);
  }

  if (stage.name === "profile") {
    return (
      <RegistrationProfileForm
        credentials={stage.credentials}
        onBack={() => {
          setIssue(null);
          setStage({ name: "credentials" });
        }}
        onRegistered={onRegistered}
      />
    );
  }

  return (
    <RegistrationEntry
      issue={issue}
      pending={pending}
      onModeChange={() => setIssue(null)}
      onSubmit={(credentials) => void submitCredentials(credentials)}
    />
  );
}
