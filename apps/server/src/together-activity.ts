/** Internal adapter for an active limited-time Together edition, never a new MCP tool. */
export interface TogetherActivity {
  decorateFarmStatus?(residentId: string, text: string): string;
  isHalloweenStatusView?(section: unknown): boolean;
  mailboxNotificationExclusions?(residentId: string, deliveredMessageIds?: string[]): string[];
  execute(input: {
    residentId: string;
    op: "farm.together.view" | "farm.together.choose";
    args: Record<string, unknown>;
  }): Promise<
    { ok: boolean; data: Record<string, unknown>; text?: string | undefined } | undefined
  >;
}
