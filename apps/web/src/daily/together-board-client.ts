import { type TogetherBoard, togetherBoardResponseSchema } from "@doorbell/protocol";

export async function loadTogetherBoard(
  fetchImplementation: typeof fetch = fetch,
): Promise<TogetherBoard | null> {
  const response = await fetchImplementation("/api/lingye-daily/together", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("together_board_unavailable");
  return togetherBoardResponseSchema.parse(await response.json()).board;
}
