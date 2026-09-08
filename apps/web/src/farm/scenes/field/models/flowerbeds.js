import * as T from "three";
import { box, mesh, beam, leafGeometry } from "./primitives.js";

export const FLOWERBEDS = {
  flowerbed_hydrangea: { name: "绣球花圃", cells: [1, 1] },
  flowerbed_sunflower: { name: "向日葵花圃", cells: [1, 1] },
  flowerbed_tulip: { name: "郁金香花圃", cells: [1, 1] },
};

export function buildFlowerbed(root, id, mat) {
  const pink = mat("#edbfc9"), rim = mat("#f3d1d8"), green = mat("#689c58");
  const blossomGeometry = new T.SphereGeometry(1, 10, 7), leaf = leafGeometry();
  const oval = (parent, material, p, s) => mesh(parent, blossomGeometry, material, p, s);
  box(root, mat("#c894a4"), [0, .07, 0], [.94, .09, .94]);
  for (const z of [-.4375, .4375]) {
    box(root, pink, [0, .18, z], [.94, .23, .065]).name = "flowerbed-pink-frame";
    box(root, rim, [0, .305, z], [.94, .04, .065]);
  }
  for (const x of [-.4375, .4375]) {
    box(root, pink, [x, .18, 0], [.065, .23, .81]).name = "flowerbed-pink-frame";
    box(root, rim, [x, .305, 0], [.065, .04, .81]);
  }
  box(root, mat("#806149"), [0, .235, 0], [.81, .035, .81]);
  function foliage(x, z, height, i) {
    beam(root, green, [x, .25, z], [x, height, z], .01);
    for (let j = 0; j < 3; j++) {
      const o = mesh(root, leaf, mat(j % 2 ? "#91b864" : "#689c58"), [x, .27 + j * .025, z], [.14, .24, .14]);
      o.rotation.set(.75 + j * .3, i * 2.4 + j * 2.1, .3);
    }
  }
  function petals(parent, radius, color, count = 6) {
    for (let j = 0; j < count; j++) {
      const a = j * Math.PI * 2 / count;
      const petal = oval(parent, mat(color), [Math.cos(a) * radius * .65, .005, Math.sin(a) * radius * .65],
        [radius * .43, .024, radius * .7]);
      petal.rotation.y = Math.PI / 2 - a;
      petal.name = "flowerbed-petal";
    }
    oval(parent, mat("#e5ba55"), [0, .027, 0], [radius * .26, .022, radius * .26]);
  }
  if (id === "flowerbed_hydrangea") {
    for (let i = 0; i < 5; i++) {
      const x = [-.22, .2, -.19, .22, 0][i], z = [-.15, -.15, .16, .16, 0][i];
      const y = i === 4 ? .62 : .47 + i % 2 * .05;
      foliage(x, z, y, i);
      // Individual four-petal florets build a rounded hydrangea head, no smooth colored ball.
      for (let j = 0; j < 24; j++) {
        const a = j * 2.39996, h = .05 + j / 24 * .95, r = Math.sqrt(1 - h * h) * .16;
        const floret = new T.Group();
        floret.position.set(x + Math.cos(a) * r, y + h * .14, z + Math.sin(a) * r);
        floret.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(Math.cos(a) * r, h * .14, Math.sin(a) * r).normalize());
        root.add(floret);
        petals(floret, .035, ["#b594df", "#83b9e2", "#e4a2cd", "#b6c7f0", "#d2b0e5"][(i + j % 2) % 5], 4);
      }
    }
  } else if (id === "flowerbed_sunflower") {
    for (let i = 0; i < 5; i++) {
      const x = [-.22, .18, -.19, .2, 0][i], z = [-.17, -.17, .16, .16, -.01][i];
      const y = [.76, .83, .52, .59, .68][i];
      foliage(x, z, y, i);
      const head = new T.Group(); head.position.set(x, y, z); head.rotation.x = .85; root.add(head);
      petals(head, i < 2 ? .13 : .105, i % 2 ? "#f0ba40" : "#f3cf54", 12);
      oval(head, mat("#896044"), [0, .032, 0], [.068, .026, .068]);
      for (let j = 0; j < 13; j++) {
        const a = j * 2.4, r = .048 * Math.sqrt(j / 13);
        oval(head, mat("#bb8c53"), [Math.cos(a) * r, .057, Math.sin(a) * r], [.008, .004, .008]);
      }
    }
  } else if (id === "flowerbed_tulip") {
    for (let i = 0; i < 12; i++) {
      const x = (i % 4 - 1.5) * .175, z = (Math.floor(i / 4) - 1) * .19;
      const y = .43 + (i * 7 % 5) * .04;
      foliage(x, z, y, i);
      const color = mat(["#e593b5", "#edba70", "#b196d6", "#e7b2d1"][i % 4]);
      for (let j = 0; j < 6; j++) {
        const a = j * Math.PI / 3;
        const petal = oval(root, color, [x + Math.cos(a) * .027, y, z + Math.sin(a) * .027], [.031, .083, .044]);
        petal.rotation.y = -a;
        petal.rotation.z = Math.cos(a) * -.17;
        petal.name = "flowerbed-petal";
      }
    }
  } else {
    for (let i = 0; i < 15; i++) {
      const x = (i % 5 - 2) * .14, z = (Math.floor(i / 5) - 1) * .18, y = .38 + (i % 4) * .045;
      foliage(x, z, y, i);
      const flower = new T.Group(); flower.position.set(x, y, z); root.add(flower);
      petals(flower, .072 + i % 3 * .01, ["#e899ba", "#b298d7", "#f0cb6c", "#eeafa2"][i % 4]);
    }
  }
}
