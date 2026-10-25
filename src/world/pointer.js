const cursor = document.getElementById("skyCursor");
const trail = document.getElementById("cursorTrail");

if (window.matchMedia("(pointer: fine)").matches && cursor && trail) {
  document.body.classList.add("sky-pointer-ready");
  const motes = Array.from({ length: 240 }, (_, index) => {
    const mote = document.createElement("i");
    mote.className = `cursor-mote${index % 9 === 0 ? " cursor-mote--diamond" : index % 7 === 0 ? " cursor-mote--spark" : ""}`;
    mote.style.setProperty("--mote-size", `${2 + (index % 5)}px`);
    mote.style.setProperty("--mote-drift", `${((index % 11) - 5) * 2}px`);
    mote.style.setProperty("--mote-rise", `-${10 + (index % 25)}px`);
    mote.style.setProperty("--mote-life", `${0.75 + (index % 6) * 0.12}s`);
    mote.style.setProperty("--mote-hue", index % 5 === 0 ? "#c9efff" : index % 4 === 0 ? "#d9c8ff" : "#fff1cc");
    trail.append(mote);
    return mote;
  });
  let nextMote = 0, lastPoint = null, particleRemainder = 0;
  window.addEventListener("pointermove", (event) => {
    cursor.style.setProperty("--pointer-x", `${event.clientX}px`);
    cursor.style.setProperty("--pointer-y", `${event.clientY}px`);
    cursor.classList.add("is-visible");
    cursor.classList.remove("is-away");
    const point = { x: event.clientX, y: event.clientY };
    if (lastPoint) {
      const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
      const spacing = 2.2;
      const count = Math.min(48, Math.floor((distance + particleRemainder) / spacing));
      for (let particle = 1; particle <= count; particle += 1) {
        const t = Math.min(1, (spacing - particleRemainder + (particle - 1) * spacing) / Math.max(distance, 1));
        const mote = motes[nextMote++ % motes.length];
        mote.style.left = `${lastPoint.x + (point.x - lastPoint.x) * t + (Math.random() - .5) * 4}px`;
        mote.style.top = `${lastPoint.y + (point.y - lastPoint.y) * t + (Math.random() - .5) * 4}px`;
        mote.classList.remove("is-visible");
        void mote.offsetWidth;
        mote.classList.add("is-visible");
      }
      particleRemainder = (particleRemainder + distance) % spacing;
    }
    lastPoint = point;
  }, { passive: true });
  window.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) cursor.classList.add("is-away");
  }, { passive: true });
}
