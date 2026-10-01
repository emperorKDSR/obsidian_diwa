# Active Context: DIWA — Personal OS

## Current State: Mobile Slide-Up Bottom Filter Sheet (Option 1) Deployed
- **Slide-Up Bottom Filter Sheet (`MobileFilterSheetModal`)**:
  - Tapping the **🏷️ (`sliders-horizontal`)** icon on the 4-icon mobile floating dock opens a thumb-friendly bottom sheet over a blurred backdrop (`backdrop-filter: blur(8px)`).
  - Includes touch swipe-down gestures on the drag handle, a top "Reset All" action, and an "✕" close button.
  - **Quick Lenses Grid**:
    - `☑️ Open Tasks`: Compound modifier toggle that dynamically updates counts across all lenses and filters notes with open tasks.
    - `📋 All Notes` / `All Task Notes`: Shows total count.
    - `⭐ Important`: Surfaces starred/important notes with live badge count.
    - `📅 Today`: Surfaces today's notes and scheduled items with live badge count.
    - `📆 Upcoming`: Surfaces future scheduled items sorted chronologically.
    - `🧹 Untagged`: Surfaces notes without any life area or tags.
  - **Life Areas Grid**:
    - Surfaces all user-configured life areas with their icons, labels, and real-time count badges.
  - 1-tap thumb selection immediately applies the filter to the background document stream and highlights the active chip.
- **Top Mobile Header & Layout Cleanliness**:
  - The top horizontal `.pos-filter-bar` is omitted entirely on phones, maximizing vertical screen real estate for the stream.
  - Desktop and iPad retain their top horizontal filter carousel and desktop hero composer intact.
- **Build & Vault Deployment**:
  - Clean compile (`npm run build`, 0 errors) and deployed to `/Users/K26/Obsidian/K0000` & `/Users/K26/Obsidian/K0001`.

## Previous State: Mobile Floating Bottom Search Capsule Deployed
- Tapping **🔍** on the mobile floating dock transforms it into a bottom search capsule docked directly above the virtual keyboard.
- Live real-time stream filtering as the user types with debouncing.
- Pressing Return / Search dismisses keyboard while preserving filtered stream.
- Tapping **✕** clears query and restores the 4-icon dock.

## Recent Fix: iOS Keyboard Black Overlay
- Workspace root is sole vertical scroller with content-sized flex layout and `overflow: visible !important`.
- Status: confirmed resolved on iPhone.
