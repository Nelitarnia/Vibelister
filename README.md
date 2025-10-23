# Vibelister

A program for making systematic notes on video game character mechanics.

---

# General Idea

A video game character could be thought of as a complex finite-state machine. It has various states (jumping, attacking, rolling) as well as inputs which move it from state to state (buttons on your controller, external triggers).

Keeping track of how these states change is sometimes a major part of video game glitching. Vibelister is meant to bring a more systematic or formal edge to your note making, featuring a sheet-based user interface backed by a formal database-like logic.

---

# How to run

Download the files and use "run.bat". In most modern browsers, executing code directly from local files is blocked for security reasons, so the .bat file opens a temporary local server which runs the program.

---

# Repository organization roadmap

- A proposed folder structure lives in [`docs/folder-structure.md`](docs/folder-structure.md).
- Use it as a guide when you start moving files so the layout change stays incremental and easy to review.

---

# How to use

At its simplest, this is how you'd operate Vibelister: list different character states in the Action view. List different inputs in the Inputs view. Press "generate Interactions" to create a grid which lists Actions times Inputs to let you test each Input with each Action.

Every row in the main sheets carries a stable ID behind the scenes. Clearing a cell (Backspace) keeps that ID in place so the row can be renamed or repurposed later, while deleting the row entirely (Delete) retires the ID and scrubs any modifier rules or interaction notes that referenced it. Use row deletion when you truly want to forget an entry; use clear cells when you just need to blank out values.

## Inputs

List Inputs here. This is mostly self-explanatory, but in many games it is useful to list "external" triggers like hitting a damage wall, ledge or restarting as Inputs as well.

## Outcomes

Outcomes view contains formal results of your observation. The default Outcomes are as follows:

- "Uncertain" is used when the result is indeterminant or random.
- "No Effect" means that nothing observably changed as a result of the Input.
- "Impossible" is for interactions which are not possible to test.
- "Prereq" means that the input is already in use as a part of the Action's setup.
- "Mutual" means that the input causes something to overlap, combine or co-exist with the current Action.
- "Cancels" means that the Action is interrupted by the input.
- "Buffers" means that the next Action triggered by the Input is buffered to occur afterwards.
- "Follows" means that the next Action triggered by the Input is queued afterwards in a way which is distinct from ordinary buffering.

You can also create some own Outcomes, if needed.

## Phases

Actions have nuance: their different parts often have different rules. For example, the buffers might work completely differently during start-up and cooldown. To allow examining the "timeline" of an Action in a closer detail, you can give Actions a number which represents their Phases.

The Phase-column in Actions view allows a list of numbers ("1,2,3"), a range of numbers (1..5) or giving labels to Phases (1:start-up, 2:active, 3:cooldown). These labels will be visible in Interactions view if added, but they're optional.

Interactions-view expands horizontally to fit whatever is the highest Phase count in any Action. (Capped to 12 at the moment.) Furthermore, unused Phases in each Action are grayed out to give a visual guide to the range of the current Action.

Phase 0 signifies simultaneous testing, and it operates under slightly different rules than the other Phases. (More to come later...)

## Modifiers

Especially in modern games, Actions can overlap with other Actions or states in a nearly uncontrollable way. It would be almost impossible to manage adding and deleting them by hand, so Modifiers is a system that lets you generate alternative versions of an Action based on conditional logic.

For example: say you have a basic Attack in some game. You could maybe do the Attack while a powered-up mode is active, which could change its cancel system. Alternatively, you could do the Attack while falling off a ledge, or slowed down by a freezing effect, or knee-deep in quicksand, or with your weapon at a higher level, or while holding down multiple inputs. Do any of these changing variables change its properties? Is it possible to tell without systematic testing? Just to make sure, you can add any of these things as a Modifier.

Yes, combinatorial explosion is real, and you might end up with monstrous Modifier combos like "Attack (Slowed Down) (Lv. 5 Sword) (Falling)" and generate a thousand variations of Attack in a single swoop. To manage this, there are two systems at play:

- You can set Modifier rules from a dialogue window. You could for example create a Modifier group like "Weapons" and give it a demand like ("exactly 1") so that only one in that Modifier group can exist simultaneously. These rules overlap, culling a lot of impossible variations upon generating Interactions.
- You can set Modifiers bypassed for individual Actions in the Actions view by clicking on the Modifier columns. (There are three states total: off, on and bypassed.)

It's good practice to give short names to Modifiers since horizontal space may be scarce in the Interactions-view.

## Other features

If you double tap Shift, you can change between normal selection mode and a horizontal selection mode which highlights and envelopes the entire row at once.

Pressing Ctrl+Shift+A lets you switch from Actions vs Inputs comparing (AI) to Actions vs Actions (AA) comparing in Interactions-view.

On any columns where you paste stable ID Actions (like "End" in Interactions), you can additionally filter through Modifers on the search bar with "+". For example, "+ Falling" or "Attack + Slowed".

You can undo any action which changes the core data model (editing cells, reordering rows, etc.) with Ctrl+z / Ctlr+y.

It's possible to save / load project files in .json-format. Note: on Firefox and Safari (which don't have the File System Access API), regular "Save" and "Save as..." instead default to "Export as JSON".

---

# To do

## Known bugs

- Drop-down palettes at the bottom of the screen in Interactions-view go partially out of screen.
- Drop down menu text for undo/redo loses the "ctrl+z" / "ctrl+y" hotkey instruction at runtime.

## Ideas for later

- Column resizing (and saving changed column sizes as a part of your project file).
- Freezing certain columns so that they always stay visible (like in Libreoffice Calc, etc.)
- Drag 'n' drop box select?
- Ability to create multi-selection with keyboard alone.
- Creating Action/Input groups to filter visibility in large sheets like Interactions.
- Being able to clean up your project file after larger refactoring.
- Option to show the canonical IDs of data elements for debugging purposes.
- Action-specific "required" rule for modifiers.
  - This might add to the "tristate boolean" on Modifier columns, or possibly become a part of the Modifier rules dialogue.
- Giving custom Phase rules to modified Actions.
- Giving "tags" to cells (such as: "to test") and ability to quickly navigate between them.
- Ability to jump between elements with a stable ID as if they were links for faster navigation.
- Predictive analysis to auto-fill cells (maybe one day in the future...)
  - Ability to create Action types or categories would likely help guide this feature.
- Exporting or importing files in more formats.
- Other cleaning up and streamlining around the files.
- Write better instructions for the user, and add helpful tooltips.
- Cover functionalities not currently covered by adding tests to the test suite.
- ...And more!

---

# Background

Vibelister is a spiritual successor to [Movelister](https://github.com/Kazhuu/movelister), an unfinished prototype project from 2020 I made with a [friend](https://github.com/Kazhuu).

The original Movelister was designed as a set of Libreoffice Calc scripts to allow easier creation of systematic character mechanics notes. Vibelister, on the other hand, has been built from the ground up to work as a locally ran browser-based program. It's also mostly "vibe-coded", hence the name. What can I say? I'm not much of a programmer, but I have a vision.
