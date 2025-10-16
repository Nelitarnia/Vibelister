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

-	A proposed folder structure lives in [`docs/folder-structure.md`](docs/folder-structure.md).
-	Use it as a guide when you start moving files so the layout change stays incremental and easy to review.

---
# How to use
At its simplest, this is how you'd operate Vibelister: list different character states in the Action view. List different inputs in the Inputs view. Press "generate Interactions" to create a grid which lists Actions times Inputs to let you test each Input with each Action.

## Inputs
List Inputs here. This is mostly self-explanatory, but in many games it is useful to list "external" triggers like hitting a damage wall, ledge or restarting as Inputs as well.

## Outcomes

Outcomes view contains formal results of your observation. The default Outcomes are as follows:
* "Undecided" is used when the result is indeterminant or random.
* "No Effect" means that nothing observably changed as a result of the Input.
* "Impossible" is for interactions which are not possible to test.
* "Prereq" means that the input is already in use as a part of the Action's setup.
* "Mutual" means that the input causes something to overlap, combine or co-exist with the current Action.
* "Cancels" means that the Action is interrupted by the input.
* "Buffers" means that the next Action triggered by the Input is buffered to occur afterwards.
* "Follows" means that the next Action triggered by the Input is queued afterwards in a way which is distinct from ordinary buffering.

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

* You can set Modifier rules from a dialogue window. You could for example create a Modifier group like "Weapons" and give it a demand like ("exactly 1") so that only one in that Modifier group can exist simultaneously. These rules overlap, culling a lot of impossible variations upon generating Interactions.
* You can set Modifiers bypassed for individual Actions in the Actions view by clicking on the Modifier columns. (There are three states total: off, on and bypassed.)

It's good practice to give short names to Modifiers since horizontal space may be scarce in the Interactions-view.

## Interactions

Pressing Ctrl+Shift+A lets you switch from Actions vs Inputs comparing (AI) to Actions vs Actions (AA) comparing in Interactions-view.

---

# To do

## In-progress
* The logic for adding Phase 0 (simultaneous testing) and Outcome mirroring was started but not completed at the present.
* Tests need to be updated.
  * Old tests use deprecated code and data structures that should be updated.
  * New tests should be added to test more features of the program.
  * Tests should document results in a more consistent way.
  * Creating a separate "tests-runner" might clean up App.js a bit.
* Other cleaning up and streamlining around the files.
* Bug fixes:
  * Edit box is slightly misaligned.
  * Horizontal select legend is not showing properly.

## Ideas for later
* Color-picker + have colors render on different parts of the sheet.
* Undo/redo.
* Column resizing.
* Creating Action/Input groups to filter visibility in large sheets like Interactions.
* Ability to jump between elements with a stable ID as if they were links for faster navigation.
* Better selection capabilities (box selection, more consistent horizontal selection, copy-pasting in multiple cells at once).
* Predictive analysis to auto-fill cells (maybe one day in the future...)
  * Ability to create Action types or categories would likely help guide this feature.
* Settings screen for customizing various things.
* Write better instructions for the user, and add helpful tooltips.
* ...And more!

---
# Background
Vibelister is a spiritual successor to [Movelister](https://github.com/Kazhuu/movelister), an unfinished prototype project from 2020 I made with a [friend](https://github.com/Kazhuu).

The original Movelister was designed as a set of Libreoffice Calc scripts to allow easier creation of systematic character mechanics notes. Vibelister, on the other hand, has been built from the ground up to work as a locally ran browser-based program. It's also mostly "vibe-coded", hence the name. What can I say? I'm not really a programmer, but I have a vision.
