const screen = document.getElementById("arrivalScreen");
const appShell = document.getElementById("appShell");
const copy = document.getElementById("arrivalCopy");
const effects = document.getElementById("arrivalEffects");
if (screen && appShell && copy && effects) {
  const heading = document.getElementById("arrivalHeading");
  const description = document.getElementById("arrivalDescription");
  const eyebrow = document.getElementById("arrivalEyebrow");
  const next = document.getElementById("arrivalNext");
  const skip = document.getElementById("arrivalSkip");
  const context = effects.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lessons = [
    {
      eyebrow: "BEFORE THE FLIGHT · 01 / 03",
      heading: "We built our own Lean interpreter.",
      description: "It follows supported Lean expressions and applies one evaluation rule at a time. For code beyond this teaching subset, Lean 4 can run the program.",
      action: "Follow the light",
    },
    {
      eyebrow: "FOLLOW EACH REWRITE · 02 / 03",
      heading: "Every reduction leaves a trace.",
      description: "The trace keeps each expression in order. Its bright line is the current step; Reduce follows the next rewrite, while Previous lets you retrace it.",
      action: "See the viewer",
    },
    {
      eyebrow: "SEE THE EXPRESSION · 03 / 03",
      heading: "The viewer gives each step a place.",
      description: "Watch the current expression take shape in the world. When it reduces, the light travels to another isle. Now, let’s walk into the archive.",
      action: "Walk into the world",
    },
  ];
  let stage = 0, frameId = 0, enterAt = 0, entering = false;
  let width = 0, height = 0, ratio = 1;
  const stars = Array.from({ length: 120 }, (_, index) => ({
    x: ((index * 0.61803398875) % 1), y: ((index * 0.75487766625) % 1),
    radius: 0.45 + (index % 4) * 0.28, phase: index * 1.71,
  }));

  function resize() {
    ratio = Math.min(window.devicePixelRatio || 1, 1.6);
    width = window.innerWidth; height = window.innerHeight;
    effects.width = Math.round(width * ratio); effects.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function draw(now) {
    if (!context || screen.hidden) return;
    context.clearRect(0, 0, width, height);
    for (const star of stars) {
      const alpha = 0.2 + (0.5 + 0.5 * Math.sin(now / 950 + star.phase)) * 0.52;
      context.fillStyle = `rgba(255,239,203,${alpha})`;
      context.beginPath(); context.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2); context.fill();
    }
    if (entering) {
      const progress = Math.min(1, (now - enterAt) / 1350);
      const eased = 1 - Math.pow(1 - progress, 3);
      const x = width / 2, y = height / 2, radius = eased * Math.hypot(width, height) * 0.78;
      context.save(); context.globalCompositeOperation = "lighter";
      const halo = context.createRadialGradient(x, y, Math.max(0, radius - 48), x, y, radius + 60);
      halo.addColorStop(0, "rgba(255,231,182,0)"); halo.addColorStop(.76, `rgba(255,231,182,${(1 - progress) * .7})`); halo.addColorStop(1, "rgba(206,218,255,0)");
      context.fillStyle = halo; context.beginPath(); context.arc(x, y, radius + 60, 0, Math.PI * 2); context.fill();
      context.strokeStyle = `rgba(255,246,220,${1 - progress})`; context.lineWidth = 2 + (1 - progress) * 9;
      context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
      for (let i = 0; i < 70; i += 1) {
        const angle = i * 2.39996, distance = radius * (0.25 + (i % 7) / 9);
        const px = x + Math.cos(angle) * distance, py = y + Math.sin(angle) * distance;
        context.fillStyle = `rgba(${i % 3 === 0 ? "201,239,255" : "255,232,190"},${(1 - progress) * .8})`;
        context.beginPath(); context.arc(px, py, .7 + (i % 4) * .45, 0, Math.PI * 2); context.fill();
      }
      context.restore();
    }
    frameId = requestAnimationFrame(draw);
  }
  function finish() {
    cancelAnimationFrame(frameId);
    screen.hidden = true;
    appShell.inert = false;
    document.body.classList.add("world-entered");
    window.removeEventListener("resize", resize);
  }
  function enterWorld() {
    if (entering) return;
    if (reducedMotion) { finish(); return; }
    entering = true; enterAt = performance.now();
    screen.classList.add("is-entering");
    window.setTimeout(finish, 1380);
  }
  function advanceStory() {
    if (entering) return;
    if (stage === lessons.length - 1) { enterWorld(); return; }
    copy.classList.add("is-changing");
    window.setTimeout(() => {
      stage += 1;
      const page = lessons[stage];
      eyebrow.textContent = page.eyebrow;
      heading.textContent = page.heading;
      description.textContent = page.description;
      next.innerHTML = `${page.action} <span aria-hidden="true">→</span>`;
      copy.classList.remove("is-changing");
    }, reducedMotion ? 0 : 240);
  }
  resize();
  frameId = requestAnimationFrame(draw);
  window.addEventListener("resize", resize, { passive: true });
  next.addEventListener("click", advanceStory);
  skip.addEventListener("click", enterWorld);
  window.addEventListener("keydown", (event) => { if (event.key === "Escape" && !screen.hidden) enterWorld(); });
}
