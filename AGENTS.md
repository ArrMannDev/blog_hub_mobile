This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

# AGENTS.md

# React Native Development Rules

## 1. Technology Stack

- React Native
- Expo SDK 58
- TypeScript
- Expo Router
- NativeWind 5
- react-native-css
- react-native-safe-area-context(npm i react-native-safe-area-context)

Use the existing installed packages and project configuration. Do not change package versions without permission.

## 2. General Coding Principles

- Write clean, simple, readable, and maintainable code.
- Avoid unnecessary complexity and overengineering.
- Follow the existing project folder structure.
- Reuse existing components, hooks, and utilities.
- Do not duplicate code unnecessarily.
- Use TypeScript and proper types.
- Avoid `any` unless absolutely necessary.
- Do not modify unrelated files.
- Understand existing code before implementing new features.

## 3. Safe Area Management (IMPORTANT)

Always use `react-native-safe-area-context` to handle device safe areas.

Rules:

- Use SafeAreaProvider at the application root when required by the existing setup.
- Use SafeAreaView from `react-native-safe-area-context`, not the deprecated React Native SafeAreaView.
- Use `useSafeAreaInsets()` when individual safe area values are needed.
- Respect the top safe area, bottom safe area, and device cutouts.
- Never allow content to overlap with the status bar, Dynamic Island, notch, or home indicator.
- Avoid hardcoded status bar and bottom navigation spacing.
- Ensure fixed bottom buttons and tab bars respect bottom insets.
- Avoid applying safe area padding twice.
- Check safe area behavior on both iOS and Android.

Example:

```tsx
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Screen content */}
    </SafeAreaView>
  );
}
```

For custom inset handling:

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";

const insets = useSafeAreaInsets();
```

## 4. NativeWind CSS (IMPORTANT)

Use NativeWind as the primary styling solution.

Rules:

- Use NativeWind `className` for component styling.
- Prefer Tailwind utility classes over React Native StyleSheet.
- Use consistent spacing, colors, typography, borders, and rounded corners.
- Avoid unnecessary inline styles.
- Do not mix multiple styling approaches without a good reason.
- Reuse shared design tokens and theme configuration.
- Keep className readable and organized.
- Use conditional classes when styling depends on component state.
- Follow the NativeWind version and configuration already installed in the project.
- Do not introduce another CSS or styling library.

Example:

```tsx
import { View, Text } from "react-native";

export default function Example() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-5">
      <Text className="text-2xl font-bold text-gray-900">Welcome</Text>
    </View>
  );
}
```

Do not use `StyleSheet.create()` for ordinary UI styling when NativeWind can handle it.

StyleSheet is acceptable when required by a React Native API or when NativeWind cannot reasonably support a particular styling requirement.

## 5. Responsive Design

- Support small, medium, and large screens.
- Use Flexbox and responsive layouts.
- Avoid unnecessary fixed widths and heights.
- Use `useWindowDimensions()` when screen dimensions are needed.
- Ensure layouts work on different iPhone and Android devices.
- Support scrolling for content that exceeds screen height.
- Prevent keyboard overlap with input fields and buttons.

## 6. Component Architecture

- Create reusable components when they provide genuine value.
- Keep components focused on one responsibility.
- Separate business logic from UI when appropriate.
- Avoid unnecessarily large components.
- Use meaningful component and variable names.
- Reuse existing buttons, inputs, cards, and other UI components.

## 7. Expo Router and Navigation

- Use Expo Router for navigation.
- Follow the existing file-based routing structure.
- Use typed route parameters where appropriate.
- Keep navigation logic simple.
- Handle loading, error, and empty states.

## 8. Performance

- Use FlatList for long lists.
- Avoid unnecessary re-renders.
- Avoid unnecessary useEffect hooks.
- Use useMemo and useCallback only when beneficial.
- Optimize image sizes and loading.
- Avoid unnecessary dependencies.

## 9. API and State Management

- Reuse existing API clients and state management.
- Keep API logic separate from UI where appropriate.
- Handle loading, success, and error states.
- Validate user inputs.
- Prevent duplicate submissions.
- Never expose API secrets in frontend code.

## 10. Security

- Never hardcode passwords or private API keys.
- Use secure storage for sensitive authentication credentials.
- Do not expose private user information in logs.
- Validate and sanitize user input.
- Follow secure authentication practices.

## 11. Accessibility

- Use accessible labels for interactive elements.
- Ensure buttons have sufficient touch areas.
- Maintain readable font sizes.
- Provide sufficient color contrast.
- Support screen readers.

## 12. Coding Restrictions

- Do not overengineer simple features.
- Do not install packages without checking existing dependencies.
- Do not upgrade Expo SDK or React Native without permission.
- Do not change the project architecture unnecessarily.
- Do not delete existing files without checking their purpose.
- Do not generate unnecessary placeholder code.
- Do not replace NativeWind with StyleSheet or another styling library.

## 13. Before Completing a Task

- Check TypeScript errors.
- Check imports and unused variables.
- Verify navigation.
- Verify safe area spacing.
- Check iOS and Android compatibility.
- Run relevant project checks.
- Summarize modified files and important changes.

## 14. Most Important Rules

1. Always respect device safe areas.
2. Use NativeWind CSS as the primary styling solution.
3. Write simple, reusable, maintainable code.
4. Follow the existing project architecture.
5. Do not introduce unnecessary dependencies or complexity.
6. Preserve existing functionality.

Prioritize usability, consistency, performance, and maintainability.

## 15. UI/UX Design Excellence (IMPORTANT)

Use the UI UX Pro Max skill when designing or implementing user interfaces, whenever the skill is available.

### Design Quality

- Create polished, professional, production-quality mobile interfaces.
- Avoid generic, outdated, or template-looking UI designs.
- Prioritize visual hierarchy, consistency, usability, and accessibility.
- Every screen should look intentional and professionally designed.
- Use modern mobile application design patterns.
- Do not sacrifice usability for decoration.

### Design System

- Establish a consistent design system before implementing multiple screens.
- Define shared colors, typography, spacing, border radius, shadows, and component styles.
- Use consistent design tokens throughout the application.
- Maintain consistent button, input, card, and navigation styles.
- Avoid random colors, inconsistent spacing, and arbitrary font sizes.

### Layout and Composition

- Use balanced spacing and proper alignment.
- Establish clear visual hierarchy between headings, descriptions, and content.
- Avoid overcrowded layouts.
- Avoid excessive empty space.
- Use appropriate visual grouping.
- Keep primary actions easy to find.
- Design for real mobile device dimensions.

### Typography

- Use professional typography combinations.
- Maintain clear differences between headings, subtitles, and body text.
- Use readable font sizes and line heights.
- Avoid excessive font weights and unnecessary text decoration.

### Colors and Visual Design

- Use a cohesive color palette.
- Maintain sufficient text contrast.
- Use subtle borders and shadows where appropriate.
- Avoid excessive gradients, glowing effects, and decorative elements.
- Use icons consistently.
- Prefer meaningful visual elements over unnecessary decoration.

### Mobile Interaction

- Design touch-friendly buttons and interactive elements.
- Use appropriate touch target sizes.
- Provide clear pressed, focused, disabled, and loading states.
- Add subtle animations only when they improve the experience.
- Use appropriate keyboard behavior for forms.
- Respect iOS and Android interaction conventions.

### Screen Quality

Every screen must include appropriate states where relevant:

- Default state
- Loading state
- Empty state
- Error state
- Success state
- Disabled state

### Design Implementation Rules

- Use NativeWind 5 as the primary styling solution.
- Use react-native-safe-area-context for device safe areas.
- Use reusable components where appropriate.
- Follow existing project architecture.
- Use native React Native components and interactions.
- Do not use web-only HTML or CSS in React Native screens.
- Do not introduce unnecessary UI libraries.
- Preserve existing functionality when improving visual design.

### UI UX Pro Max Workflow

Before implementing a new screen:

1. Inspect the existing application and design system.
2. Use UI UX Pro Max skill for design guidance when available.
3. Establish the screen layout and visual hierarchy.
4. Identify reusable components.
5. Implement using NativeWind.
6. Check safe areas and responsive behavior.
7. Review the screen for visual consistency and usability.
8. Fix obvious design issues before completing the task.

### Final Design Standard

The final result should feel like a professionally designed commercial mobile application.

Do not settle for a basic or generic interface.

Prioritize excellent visual quality, usability, consistency, accessibility, and maintainable implementation.
