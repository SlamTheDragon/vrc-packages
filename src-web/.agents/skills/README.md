# VRCP Web Application Skills (`src-web/.agents/skills/`)

These skills govern agents that build, review, and maintain the `src-web/` Astro 7 and Svelte 5 Admin UI.

| Skill | Use It When | What It Does |
| :--- | :--- | :--- |
| [`shadcn-svelte`](shadcn-svelte/SKILL.md) | Adding or styling UI primitives | Guides Bits UI and Tailwind CSS primitives. |
| [`svelte-code-writer`](svelte-code-writer/SKILL.md) | Writing Svelte 5 components or stores | Enforces `$state`, `$derived`, `$props`, and `$effect` runes. |
| [`svelte-core-bestpractices`](svelte-core-bestpractices/SKILL.md) | Checking Svelte reactivity and lifecycle | Validates events, snippets, and resource cleanup. |
| [`svelte5-best-practices`](svelte5-best-practices/SKILL.md) | Refactoring Svelte 5 islands | Applies modern rune, snippet, and prop rules. |
| [`ui-sdk`](ui-sdk/SKILL.md) | Building reusable token-driven primitives | Defines component architecture and accessibility contracts. |
| [`ui-sdk-write-code`](ui-sdk-write-code/SKILL.md) | Implementing dashboard views or controls | Aligns new UI code with existing tokens and checks. |
| [`ui-sdk-write-docs`](ui-sdk-write-docs/SKILL.md) | Updating UI component guides | Matches documentation examples to live component APIs. |
| [`ui-sdk-unslop`](ui-sdk-unslop/SKILL.md) | Cleaning UI diffs | Removes extra wrapper divs, filler comments, and dead CSS. |
| [`ui-sdk-expert-review`](ui-sdk-expert-review/SKILL.md) | Reviewing UI gates | Checks WCAG accessibility, reactivity, and layout stability. |
