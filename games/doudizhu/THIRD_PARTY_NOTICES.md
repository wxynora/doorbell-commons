# Third-party notice

The Dou Dizhu rules, combination semantics, bidding flow, scoring rules, redacted-view
boundary, deterministic testing approach, and related test cases in this directory are
adapted from [`29-Cu/bisca`](https://github.com/29-Cu/bisca), created by **Cu & Lunedì**.

The upstream project is licensed under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
([upstream license text](https://github.com/29-Cu/bisca/blob/main/LICENSE)).

Doorbell Commons modifications include:

- porting the CommonJS rules engine to a standalone Python Game Adapter;
- adding `command_id` and `expected_revision` idempotency;
- projecting Doorbell-specific player views and public replay records;
- replacing the Express room, account, invite, AI CLI, webhook, disk-room, and frontend
  layers with an isolated local preview boundary;
- creating an original Doorbell bright chibi landscape interface without copying upstream
  images, fonts, audio, CSS, HTML, or visual assets.

This notice does not imply endorsement by the upstream authors.
