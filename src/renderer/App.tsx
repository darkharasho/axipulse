// src/renderer/App.tsx
import { MotionConfig } from 'framer-motion';
import { AppLayout } from './app/AppLayout';

function App() {
    // Rule 11 applies to every work indicator, but a CSS
    // `prefers-reduced-motion` block cannot reach framer-motion: it writes
    // its animated values as inline styles, which outrank any stylesheet
    // rule. `reducedMotion="user"` makes the library itself read the OS
    // preference and hold each animation at its final value, so the twelve
    // motion call sites are covered from one place rather than twelve.
    return (
        <MotionConfig reducedMotion="user">
            <AppLayout />
        </MotionConfig>
    );
}

export default App;
