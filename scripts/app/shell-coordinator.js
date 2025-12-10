import { bootstrapShell } from "./bootstrap-shell.js";
import { Ids } from "../data/constants.js";

export function createShellCoordinator({
  appContext,
  ids = Ids,
  statusConfig = { historyLimit: 100 },
  bootstrapShellImpl = bootstrapShell,
}) {
  return bootstrapShellImpl({ appContext, ids, statusConfig });
}

export default createShellCoordinator;
