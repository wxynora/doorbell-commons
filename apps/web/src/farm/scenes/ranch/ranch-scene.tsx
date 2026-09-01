import { type CSSProperties, useEffect, useRef } from "react";
import "./ranch-scene.css";
import {
  createRanchSceneMountEntropy,
  getRanchSceneInitialPosition,
  type RanchSceneAnimalLayout,
} from "./ranch-scene-position";

export type { RanchSceneAnimalLayout } from "./ranch-scene-position";

export interface RanchSceneAnimalDefinition {
  healthLabel?: string | undefined;
  healthStatus?: "healthy" | "open" | "treating" | "recovering" | "unavailable" | undefined;
  id: string;
  layout: RanchSceneAnimalLayout;
  name: string;
  placementStyle: CSSProperties;
  spriteStyle: CSSProperties;
  staticSprite?: boolean | undefined;
  randomizeInitialPosition?: boolean | undefined;
  visitor?: boolean | undefined;
  visitorRaidId?: string | undefined;
}

function RanchSceneAnimal({
  active,
  animal,
  catchingVisitorRaidId,
  mountEntropy,
  onCatchVisitor,
  onSelectAnimal,
}: {
  active: boolean;
  animal: RanchSceneAnimalDefinition;
  catchingVisitorRaidId?: string | null | undefined;
  mountEntropy: number;
  onCatchVisitor?: ((raidId: string) => void) | undefined;
  onSelectAnimal: (animalId: string) => void;
}) {
  const roamerRef = useRef<HTMLSpanElement>(null);
  const portraitRef = useRef<HTMLSpanElement>(null);
  const { layout } = animal;
  const initialPositionRef = useRef(
    animal.randomizeInitialPosition
      ? getRanchSceneInitialPosition(animal.id, layout, mountEntropy)
      : { x: layout.x, y: layout.y },
  );
  const initialPosition = initialPositionRef.current;

  useEffect(() => {
    const roamer = roamerRef.current;
    const portrait = portraitRef.current;
    const scene = roamer?.closest<HTMLElement>(".farm-scene--ranch");
    if (
      !active ||
      !roamer ||
      !portrait ||
      !scene ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let currentX = initialPosition.x;
    let currentY = initialPosition.y;
    let moveAnimation: Animation | null = null;
    let moveTimer: number | null = null;
    let stopped = false;
    const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

    const move = () => {
      if (stopped) {
        return;
      }

      let targetX = currentX;
      let targetY = currentY;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        targetX = randomBetween(layout.roam.minX, layout.roam.maxX);
        targetY = randomBetween(layout.roam.minY, layout.roam.maxY);
        if (Math.hypot((targetX - currentX) * 0.8, (targetY - currentY) * 1.25) >= 14) {
          break;
        }
      }

      const sceneBounds = scene.getBoundingClientRect();
      const currentOffsetX = ((currentX - initialPosition.x) / 100) * sceneBounds.width;
      const currentOffsetY = ((currentY - initialPosition.y) / 100) * sceneBounds.height;
      const targetOffsetX = ((targetX - initialPosition.x) / 100) * sceneBounds.width;
      const targetOffsetY = ((targetY - initialPosition.y) / 100) * sceneBounds.height;
      const distance = Math.hypot(targetOffsetX - currentOffsetX, targetOffsetY - currentOffsetY);
      const targetTransform = `translate3d(${targetOffsetX}px, ${targetOffsetY}px, 0)`;

      portrait.style.transform = targetX >= currentX ? "scaleX(-1)" : "scaleX(1)";
      moveAnimation = roamer.animate(
        [
          { transform: `translate3d(${currentOffsetX}px, ${currentOffsetY}px, 0)` },
          { transform: targetTransform },
        ],
        {
          duration: Math.max(2800, distance * randomBetween(45, 65)),
          easing: "ease-in-out",
          fill: "forwards",
        },
      );
      moveAnimation.onfinish = () => {
        currentX = targetX;
        currentY = targetY;
        roamer.style.transform = targetTransform;
        moveAnimation?.cancel();
        moveAnimation = null;
        moveTimer = window.setTimeout(move, randomBetween(350, 1600));
      };
    };

    moveTimer = window.setTimeout(move, randomBetween(120, 900));

    return () => {
      stopped = true;
      if (moveTimer !== null) {
        window.clearTimeout(moveTimer);
      }
      moveAnimation?.cancel();
    };
  }, [
    active,
    initialPosition.x,
    initialPosition.y,
    layout.roam.maxX,
    layout.roam.maxY,
    layout.roam.minX,
    layout.roam.minY,
  ]);

  const style = {
    left: `${initialPosition.x}%`,
    top: `${initialPosition.y}%`,
    width: `${layout.size}%`,
    zIndex: Math.round(initialPosition.y),
  };
  const content = (
    <>
      <span className="farm-ranch-resident__roamer" data-roamer ref={roamerRef}>
        <span className="farm-ranch-resident__portrait" ref={portraitRef}>
          <span
            className="farm-ranch-resident__portrait-sprite"
            style={{ ...animal.placementStyle, pointerEvents: "auto" }}
          >
            <span
              className="farm-ranch-resident__step"
              style={animal.staticSprite ? { animation: "none" } : undefined}
            >
              <span
                aria-hidden="true"
                className="ranch-shop__animal-sprite"
                style={animal.spriteStyle}
              />
            </span>
          </span>
        </span>
        {animal.healthStatus === "open" ||
        animal.healthStatus === "treating" ||
        animal.healthStatus === "recovering" ? (
          <span
            aria-label={animal.healthLabel ?? "健康状态异常"}
            className="farm-ranch-resident__health-bubble"
            role="img"
            title={animal.healthLabel}
          >
            +
          </span>
        ) : null}
      </span>
    </>
  );
  return animal.visitor && animal.visitorRaidId ? (
    <button
      aria-label={
        catchingVisitorRaidId === animal.visitorRaidId
          ? `正在抓住来客${animal.name}`
          : `抓住来客${animal.name}`
      }
      className="farm-ranch-resident is-visitor"
      data-animal-id={animal.id}
      disabled={!onCatchVisitor || catchingVisitorRaidId === animal.visitorRaidId}
      onClick={() => onCatchVisitor?.(animal.visitorRaidId as string)}
      style={{ ...style, pointerEvents: "none" }}
      type="button"
    >
      {content}
    </button>
  ) : (
    <button
      aria-label={`查看牧场里的${animal.name}`}
      className="farm-ranch-resident"
      data-animal-id={animal.id}
      onClick={() => onSelectAnimal(animal.id)}
      style={{ ...style, pointerEvents: "none" }}
      type="button"
    >
      {content}
    </button>
  );
}

export function RanchScene({
  active,
  animals,
  backgroundUrl,
  catchingVisitorRaidId,
  onCatchVisitor,
  onSelectAnimal,
}: {
  active: boolean;
  animals: readonly RanchSceneAnimalDefinition[];
  backgroundUrl: string;
  catchingVisitorRaidId?: string | null | undefined;
  onCatchVisitor?: ((raidId: string) => void) | undefined;
  onSelectAnimal: (animalId: string) => void;
}) {
  const mountEntropyRef = useRef<number | null>(null);
  const mountEntropy = mountEntropyRef.current ?? createRanchSceneMountEntropy();
  mountEntropyRef.current = mountEntropy;

  return (
    <section
      aria-labelledby="farm-ranch-title"
      className="farm-scene farm-scene--ranch"
      style={{ "--farm-scene-background": `url("${backgroundUrl}")` } as CSSProperties}
    >
      <h2 className="farm-visually-hidden" id="farm-ranch-title">
        牧场
      </h2>

      {animals.map((animal) => (
        <RanchSceneAnimal
          active={active}
          animal={animal}
          catchingVisitorRaidId={catchingVisitorRaidId}
          key={animal.id}
          mountEntropy={mountEntropy}
          onCatchVisitor={onCatchVisitor}
          onSelectAnimal={onSelectAnimal}
        />
      ))}
    </section>
  );
}
