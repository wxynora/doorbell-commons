import React from "react";
import type { DailyBlock, DailyTextRun } from "@doorbell/protocol";

export type DailyImageAction = (figure: HTMLElement, action: "crop" | "delete") => void;
type ImageBlock = DailyBlock & { type: "image" };

function DailyImageActions({ onAction, hasImage }: { onAction: DailyImageAction; hasImage: boolean }) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  return <div className="daily-image-actions">
    {confirmDelete ? <><button type="button" onClick={event => onAction(event.currentTarget.closest("figure")!, "delete")}>确认删除</button>
      <button type="button" onClick={() => setConfirmDelete(false)}>取消</button></> : <>
      {hasImage ? <button type="button" onClick={event => onAction(event.currentTarget.closest("figure")!, "crop")}>裁剪图片</button> : null}
      <button type="button" onClick={event => onAction(event.currentTarget.closest("figure")!, "delete")}>删除图片</button>
    </>}
  </div>;
}

function imageCaption(runs: DailyTextRun[]) {
  return runs.map((run, index) => run.bold ? <strong key={index}>{run.text}</strong> : <React.Fragment key={index}>{run.text}</React.Fragment>);
}

export function DailyImageBlockView({ block, images, onImageAction }: {
  block: ImageBlock;
  images: Record<string, string>;
  onImageAction?: DailyImageAction | undefined;
}) {
  const imageId = block.imageId ?? "";
  const src = images[imageId];
  if (!src && !onImageAction) return null;
  return <figure className="daily-hero-image" contentEditable={false} data-image-id={block.imageId}
    data-image-crop={block.crop ? JSON.stringify(block.crop) : undefined}>
    {src ? block.crop ? <svg role="img" aria-label="本期来源图片（已裁剪）" viewBox={`${block.crop.x} ${block.crop.y} ${block.crop.width} ${block.crop.height}`}
      style={{ display: "block", width: "100%", height: "auto", aspectRatio: `${block.crop.width} / ${block.crop.height}` }}>
      <image href={src} width={block.crop.sourceWidth} height={block.crop.sourceHeight} />
    </svg> : <img src={src} alt="本期来源图片" /> : null}
    {block.runs.length ? <figcaption className="daily-column-image-caption">{imageCaption(block.runs)}</figcaption> : null}
    {onImageAction ? <DailyImageActions onAction={onImageAction} hasImage={Boolean(src)} /> : null}
  </figure>;
}
