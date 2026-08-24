import { type CSSProperties, useEffect, useRef } from "react";
import "./ranch-scene.css";

export interface RanchSceneAnimalLayout {
  x: number;
  y: number;
  size: number;
  roam: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface RanchSceneAnimalDefinition {
  id: string;
  layout: RanchSceneAnimalLayout;
  name: string;
  placementStyle: CSSProperties;
  spriteStyle: CSSProperties;
}

function RanchSceneAnimal({
  active,
  animal,
  onSelectAnimal,
}: {
  active: boolean;
  animal: RanchSceneAnimalDefinition;
  onSelectAnimal: (animalId: string) => void;
}) {
  const roamerRef = useRef<HTMLSpanElement>(null);
  const portraitRef = useRef<HTMLSpanElement>(null);
  const { layout } = animal;

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

    let currentX = layout.x;
    let currentY = layout.y;
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
      const currentOffsetX = ((currentX - layout.x) / 100) * sceneBounds.width;
      const currentOffsetY = ((currentY - layout.y) / 100) * sceneBounds.height;
      const targetOffsetX = ((targetX - layout.x) / 100) * sceneBounds.width;
      const targetOffsetY = ((targetY - layout.y) / 100) * sceneBounds.height;
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
  }, [active, layout]);

  return (
    <button
      aria-label={`查看牧场里的${animal.name}`}
      className="farm-ranch-resident"
      data-animal-id={animal.id}
      onClick={() => onSelectAnimal(animal.id)}
      style={{
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: `${layout.size}%`,
        zIndex: Math.round(layout.y),
      }}
      type="button"
    >
      <span className="farm-ranch-resident__roamer" data-roamer ref={roamerRef}>
        <span className="farm-ranch-resident__portrait" ref={portraitRef}>
          <span className="farm-ranch-resident__portrait-sprite" style={animal.placementStyle}>
            <span
              aria-hidden="true"
              className="ranch-shop__animal-sprite"
              style={animal.spriteStyle}
            />
          </span>
        </span>
      </span>
    </button>
  );
}

export function RanchScene({
  active,
  animals,
  onSelectAnimal,
}: {
  active: boolean;
  animals: readonly RanchSceneAnimalDefinition[];
  onSelectAnimal: (animalId: string) => void;
}) {
  return (
    <section aria-labelledby="farm-ranch-title" className="farm-scene farm-scene--ranch">
      <h2 className="farm-visually-hidden" id="farm-ranch-title">
        牧场
      </h2>

      {animals.map((animal) => (
        <RanchSceneAnimal
          active={active}
          animal={animal}
          key={animal.id}
          onSelectAnimal={onSelectAnimal}
        />
      ))}
    </section>
  );
}
