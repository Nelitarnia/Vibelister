export function makeModelFixture() {
  const model = {
    meta: { schema: 0, projectName: "", interactionsMode: "AI" },
    actions: [],
    inputs: [],
    modifiers: [],
    outcomes: [],
    modifierGroups: [],
    modifierConstraints: [],
    notes: {},
    interactionsPairs: [],
    nextId: 1,
  };

  function addAction(name, modSet = {}) {
    const row = {
      id: model.nextId++,
      name,
      color: "",
      color2: "",
      notes: "",
      modSet,
    };
    model.actions.push(row);
    return row;
  }

  function addInput(name) {
    const row = { id: model.nextId++, name, color: "", color2: "", notes: "" };
    model.inputs.push(row);
    return row;
  }

  function addModifier(name) {
    const row = { id: model.nextId++, name, color: "", color2: "", notes: "" };
    model.modifiers.push(row);
    return row;
  }

  function addOutcome(name, extra = {}) {
    const row = {
      id: model.nextId++,
      name,
      color: "",
      color2: "",
      notes: "",
      ...extra,
    };
    model.outcomes.push(row);
    return row;
  }

  function groupExact(k, members, { required = true, name = "G" } = {}) {
    model.modifierGroups.push({
      id: model.nextId++,
      name,
      mode: "EXACT",
      k,
      required,
      memberIds: members.map((m) => m.id),
    });
  }

  return {
    model,
    addAction,
    addInput,
    addModifier,
    addOutcome,
    groupExact,
  };
}
