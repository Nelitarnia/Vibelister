export function scheduleRender(render) {
  let pendingHandle = null;

  const scheduleFn =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 0);
  const cancelFn =
    typeof cancelAnimationFrame === "function"
      ? cancelAnimationFrame
      : clearTimeout;

  function runRender() {
    pendingHandle = null;
    render();
  }

  function schedule() {
    if (pendingHandle != null) return;
    pendingHandle = scheduleFn(runRender);
  }

  function cancel() {
    if (pendingHandle == null) return;
    cancelFn(pendingHandle);
    pendingHandle = null;
  }

  return { schedule, cancel };
}
