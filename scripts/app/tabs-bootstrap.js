export function bootstrapTabs(Ids) {
  return {
    tabActions: document.getElementById(Ids.tabActions),
    tabInputs: document.getElementById(Ids.tabInputs),
    tabModifiers: document.getElementById(Ids.tabModifiers),
    tabOutcomes: document.getElementById(Ids.tabOutcomes),
    tabInteractions: document.getElementById(Ids.tabInteractions),
  };
}
