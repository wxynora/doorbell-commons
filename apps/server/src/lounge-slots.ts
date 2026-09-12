export type LoungePosition = readonly [number, number, number];

export interface LoungeSeat {
  slotId: string;
  areaId: string;
  seatPosition: LoungePosition;
}

export interface LoungeIdlePoint {
  pointId: string;
  position: LoungePosition;
}

// Fixed standing points in the three open floor corridors. They stay separate
// from furniture seats so an idle resident never occupies a chair or table.
export const LOUNGE_IDLE_POINTS: readonly LoungeIdlePoint[] = [
  { pointId: "idle-a-01", position: [-4.0, 0.06, -3.3] },
  { pointId: "idle-a-02", position: [-1.8, 0.06, -3.0] },
  { pointId: "idle-a-03", position: [0.4, 0.06, -3.4] },
  { pointId: "idle-a-04", position: [2.7, 0.06, -2.8] },
  { pointId: "idle-b-01", position: [0.8, 0.06, -1.0] },
  { pointId: "idle-b-02", position: [1.4, 0.06, 0.25] },
  { pointId: "idle-b-03", position: [1.8, 0.06, 1.65] },
  { pointId: "idle-b-04", position: [0.9, 0.06, 2.9] },
  { pointId: "idle-c-01", position: [-5.9, 0.06, -2.2] },
  { pointId: "idle-c-02", position: [-5.6, 0.06, -0.6] },
  { pointId: "idle-c-03", position: [-5.9, 0.06, 0.9] },
];

export const LOUNGE_SEATS: readonly LoungeSeat[] = [
  {
    slotId: "lounge-slot-01",
    areaId: "conversation",
    seatPosition: [-2.7669818175643064, 0.4, -0.6540426956028256],
  },
  {
    slotId: "lounge-slot-02",
    areaId: "conversation",
    seatPosition: [-2.0296574926259137, 0.4, -0.7168572458859153],
  },
  {
    slotId: "lounge-slot-03",
    areaId: "conversation",
    seatPosition: [-3.815674295370761, 0.4, 0.7942342185490894],
  },
  {
    slotId: "lounge-slot-04",
    areaId: "reading",
    seatPosition: [5.448810633484152, 0.4000000000000071, -3.5330176664144695],
  },
  {
    slotId: "lounge-slot-05",
    areaId: "conversation",
    seatPosition: [-0.8968764310641344, 0.39999999999999647, 0.9046788188294386],
  },
  {
    slotId: "lounge-slot-06",
    areaId: "window",
    seatPosition: [2.6732673884485667, 0.4, -5.052284762348048],
  },
  {
    slotId: "lounge-slot-07",
    areaId: "window",
    seatPosition: [3.842912764882705, 0.4000000000000036, -4.876536728897133],
  },
  {
    slotId: "lounge-slot-08",
    areaId: "bench",
    seatPosition: [6.727459266217965, 0.4000000000000018, 3.07231672152869],
  },
  {
    slotId: "lounge-slot-09",
    areaId: "bench",
    seatPosition: [6.682122468608496, 0.4000000000000018, 4.118122712108988],
  },
  {
    slotId: "lounge-slot-10",
    areaId: "round-table",
    seatPosition: [0.21319430815573348, 0.4, 5.508212141785435],
  },
  {
    slotId: "lounge-slot-11",
    areaId: "mahjong",
    seatPosition: [3.607337806979819, 0.4, 0.8605782143521985],
  },
  {
    slotId: "lounge-slot-12",
    areaId: "mahjong",
    seatPosition: [4.50123219142872, 0.4, -0.0998944309105596],
  },
  {
    slotId: "lounge-slot-13",
    areaId: "mahjong",
    seatPosition: [4.476066748045572, 0.4, 1.9816529275404733],
  },
  {
    slotId: "lounge-slot-14",
    areaId: "mahjong",
    seatPosition: [5.573977733479682, 0.4, 0.7697199444974636],
  },
  {
    slotId: "lounge-slot-15",
    areaId: "round-table",
    seatPosition: [1.1371708585936249, 0.4000000000000036, 6.30047119687897],
  },
  {
    slotId: "lounge-slot-16",
    areaId: "round-table",
    seatPosition: [2.3660779149104396, 0.4000000000000018, 5.507362052479664],
  },
  {
    slotId: "lounge-slot-17",
    areaId: "round-table",
    seatPosition: [1.2336617951103843, 0.4, 4.349708560969219],
  },
  {
    slotId: "lounge-slot-18",
    areaId: "pet",
    seatPosition: [-4.466811186765389, 0.4, 4.777001063290342],
  },
];

export function loungeSeatById(slotId: string): LoungeSeat | undefined {
  return LOUNGE_SEATS.find((seat) => seat.slotId === slotId);
}

export function loungeIdlePointByPosition(position: LoungePosition): LoungeIdlePoint | undefined {
  return LOUNGE_IDLE_POINTS.find((point) =>
    point.position.every((coordinate, index) => coordinate === position[index]),
  );
}
