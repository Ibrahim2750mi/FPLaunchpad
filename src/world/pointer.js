const cursor = document.getElementById("skyCursor");
const trail = document.getElementById("cursorTrail");

if (window.matchMedia("(pointer: fine)").matches && cursor && trail) {
  document.body.classList.add("sky-pointer-ready");
  const motes = Array.from({ length: 12 }, (_, index) => {
    const mote = document.createElement("i");
    mote.className = "cursor-mote";
    mote.style.setProperty("--mote-size", `${2 + (index % 4)}px`);
    mote.style.setProperty("--mote-drift", index % 2 ? "1" : "-1");
    trail.append(mote);
    return mote;
  });
  let nextMote = 0, lastPoint = null;
  window.addEventListener("pointermove", (event) => {
    cursor.style.setProperty("--pointer-x", `${event.clientX}px`);
    cursor.style.setProperty("--pointer-y", `${event.clientY}px`);
    cursor.classList.add("is-visible");
    cursor.classList.remove("is-away");
    const point = { x: event.clientX, y: event.clientY };
    if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) >= 7) {
      const mote = motes[nextMote++ % motes.length];
      mote.style.left = `${point.x}px`;
      mote.style.top = `${point.y}px`;
      mote.classList.remove("is-visible");
      void mote.offsetWidth;
      mote.classList.add("is-visible");
      lastPoint = point;
    } else if (!lastPoint) lastPoint = point;
  }, { passive: true });
  window.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) cursor.classList.add("is-away");
  }, { passive: true });
}
