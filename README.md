# Vibelister

A program for making systematic notes on video game character mechanics.

---

# General Idea

A video game character could be thought of as a complex finite-state machine. It has various states (jumping, attacking, rolling) as well as inputs which move it from state to state (buttons on your controller, external triggers).

Keeping track of how these states change is sometimes a major part of video game glitching. Vibelister is meant to bring a more systematic or formal edge to your note making, featuring a sheet-based user interface backed by a formal database-like logic.

---

# How to run

Download the files and use "run.bat". In most modern browsers, executing code directly from local files is blocked for security reasons, so the .bat file opens a temporary local server which runs the program.

Installing Python is a necessary prerequisite for this step. You can get it from [here](https://www.python.org/downloads/), and during installation remember to enable “Add Python to PATH.”

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

## Modifiers

Especially in modern games, Actions can overlap with other Actions or states in a nearly uncontrollable way. It would be almost impossible to manage adding and deleting them by hand, so Modifiers is a system that lets you generate alternative versions of an Action based on conditional logic.

For example: say you have a basic Attack in some game. You could maybe do the Attack while a powered-up mode is active, which could change its cancel system. Alternatively, you could do the Attack while falling off a ledge, or slowed down by a freezing effect, or knee-deep in quicksand, or with your weapon at a higher level, or while holding down multiple inputs. Do any of these changing variables change its properties? Is it possible to tell without systematic testing? Just to make sure, you can add any of these things as a Modifier.

Yes, combinatorial explosion is real, and you might end up with monstrous Modifier combos like "Attack (Slowed Down) (Lv. 5 Sword) (Falling)" and generate a thousand variations of Attack in a single swoop. To manage this, there are two systems at play:

- You can create Modifier rules from a dialogue window. Modifier groups allow you to limit how Modifiers combine with each other. You could for example create a Modifier group like "Weapons" and give it a demand like ("exactly 1") so that only one in that Modifier group can exist simultaneously.

- You can set some action-specific Modifier rules in the Actions view. There are four states total: Off, On, Bypassed and Required. "On" means that the Modifier is enabled for the current action. "Off" means it's not. "Bypassed" makes any Action variants using the Modifier to not become drawn in the Interactions-view - it's a way to allow you to filter the visibility of modified Actions in a non-destructive way. "Required" means that Action variations which do not include the chosen Modifier are not drawn in Interactions view.

Note: setting a Modifier "Off" makes no mechanical difference compared to just leaving the cell empty, but it's there for more precise note taking.

Note 2: It's good practice to give short names to Modifiers since horizontal space may be scarce in the Interactions-view.

## Interactions

This is a generated view which puts together the Actions and Inputs you've listed for systematic note taking.

To help navigate Interactions, there is an Outline that can be brought out with Ctrl+Shift+O (or clicking the small button to the left). You can also immediately jump between actions with Ctrl+Shift+Up or Ctrl+Shift+Down, or step through each action and its variants with Ctrl+Shift+Alt+Up or Ctrl+Shift+Alt+Down.

While adding Actions to the End-column, you can additionally filter through Modifers on the search bar with "+". For example, "+ Falling" or "Attack + Slowed". You can also see most recently added Actions to quickly select them by holding Ctrl while the palette is open.

Although the default mode in Interactions is comparing Actions vs Inputs (AI), pressing Ctrl+Shift+A lets you switch to Actions vs Actions (AA) comparing in Interactions-view. (It's rather specialized, but could come in handy in some kind of situations.)

## Phases

Actions have nuance: their different parts often have different rules. For example, the buffers might work completely differently during start-up and cooldown. To allow examining the "timeline" of an Action in a closer detail, you can give Actions a number which represents their Phases.

Each phase features an Outcome-, End- (the end state of the input test) and Tag- column. The purpose of Tag is to bridge the gap between purely formal note-taking and freeform notes: you should use it to add lesser effects (like UI-only changes) that at least for the time being don't require their own Action or Modifier to keep a track of.

The Phase-column in Actions view allows a list of numbers ("1,2,3"), a range of numbers (1..5) or giving labels to Phases (1:start-up, 2:active, 3:cooldown). These labels will be visible in Interactions view if added, but they're optional.

Interactions-view expands horizontally to fit whatever is the highest Phase count in any Action. (Capped to 12 at the moment.) Furthermore, unused Phases in each Action are grayed out to give a visual guide to the range of the current Action.

Phase 0 signifies simultaneous testing - what happens if you press inputs simultaneously - and it has some special functionality which is not used in other Phases. (Read more below from the "Mirrored and Dual Of" section.)

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

### Mirrored and Dual Of

These two columns are used in a specialized feature regarding Phase 0.

While testing Actions vs Actions, you can choose to mirror the Phase 0 notes to both actions at once. You first have to set up the mirroring in the Outcomes-view by enabling the row from the "Mirrored" column, then choosing which Outcome you want to get added to the second Action. For instance, "Impossible", "Uncertain" and "Mutual" will be the same no matter which of the two animations you test. One could argue "No Effect" and "Cancels" also mirror each other. It's just something to save time if you choose to use this state.

## Other features

You can create box-shaped multi-cell selections by holding down Shift while clicking cells or moving on the sheet with arrow keys.

If you double tap Shift, you can change between normal selection mode and a horizontal selection mode which highlights and envelopes the entire row at once.

You can undo any action which changes the core data model (editing cells, reordering rows, etc.) with Ctrl+z / Ctlr+y.

You can leave comments (categorized by color) on any cell in the project, then quick jump between them using the arrows in the Comments sidebar. The keyboard shortcuts for the side panels are Ctrl+Shift+L for Comments and Ctrl+Shift+X for Tags.

It's possible to save / load project files in .json-format. Note: on Firefox and Safari (which don't have the File System Access API), regular "Save" and "Save as..." instead default to "Export as JSON".

---

# To do

## Known bugs

- Drop-down palettes at the bottom of the screen in Interactions-view go partially out of screen.
- Drop down menu text for undo/redo loses the "ctrl+z" / "ctrl+y" hotkey instruction at runtime.

## Ideas for later

- Freezing certain columns so that they always stay visible (like in Libreoffice Calc, etc.)
- Ability to create selections with a rectangular select?
- Creating Action/Input groups to filter visibility in large sheets like Interactions.
- Being able to clean up your project file after larger refactoring.
- Option to show the canonical IDs of data elements for debugging purposes.
- Giving custom Phase rules to modified Actions.
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
